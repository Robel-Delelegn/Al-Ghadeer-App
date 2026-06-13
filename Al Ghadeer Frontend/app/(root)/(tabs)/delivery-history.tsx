import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { formatDeliveryAddress, parseDeliveryTasks } from "@/utils/deliveries";
import { getDriverRequestId } from "@/utils/driverIdentity";
import {
  DriverHistoryDetail,
  DriverHistoryListPayload,
  getDriverHistoryKindLabel,
  getDriverHistoryPrimaryId,
  isAdhocDeliveryHistory,
  isScheduledDeliveryHistory,
  normalizeDriverHistoryDetail,
  normalizeDriverHistoryListPayload,
} from "@/utils/driverHistory";
import { resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

const PAGE_LIMIT = 20;
const SUMMARY_PAGE_LIMIT = 100;
const SUMMARY_MAX_PAGES = 20;

type HistoryKindFilter = "all" | "delivery" | "direct_sale";
type HistoryViewTab = "records" | "summary";

type SummaryTone = "neutral" | "success" | "danger" | "money" | "asset";
type IconName = React.ComponentProps<typeof Ionicons>["name"];
type ApiRecord = Record<string, unknown>;

interface NormalizedHistoryTask {
  id: string;
  title: string;
  meta: string[];
}

interface SummarySoldItem {
  key: string;
  label: string;
  quantity: number;
  amount: number;
}

const parseServerDate = (rawValue: string): Date | null => {
  const value = rawValue.trim();
  if (!value) return null;

  const candidates: string[] = [];
  candidates.push(value);

  const withTimeSeparator = value.replace(" ", "T");
  if (withTimeSeparator !== value) {
    candidates.push(withTimeSeparator);
  }

  const normalized = withTimeSeparator
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})(?!:\d{2})$/, "$1:00");
  if (normalized !== withTimeSeparator) {
    candidates.push(normalized);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    candidates.push(`${value}T00:00:00`);
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = new Date(candidates[i]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const formatDate = (value?: string | null, includeTime = false): string => {
  if (!value) return "N/A";
  const date = parseServerDate(value);
  if (!date) return "N/A";

  if (includeTime) {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const CALENDAR_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const toDayStartIso = (date: Date): string =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).toISOString();

const toDayEndIso = (date: Date): string =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).toISOString();

const sameCalendarDay = (a: Date | null, b: Date | null): boolean => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const normalizeCalendarDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const isCalendarDayBetween = (date: Date, start: Date, end: Date): boolean => {
  const target = normalizeCalendarDay(date).getTime();
  const from = normalizeCalendarDay(start).getTime();
  const to = normalizeCalendarDay(end).getTime();
  return target > from && target < to;
};

const getCalendarCells = (monthDate: Date): (Date | null)[] => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const totalDaysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDaysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
};

const formatCalendarDateLabel = (date: Date | null): string => {
  if (!date) return "Any";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatAmount = (value?: number | string | null): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return parsed.toFixed(2);
};

const formatSummaryCount = (value: number): string => {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const formatAddress = (
  address: DriverHistoryDetail["address"] | null | undefined,
): string => {
  if (!address) return "No address available";
  const formatted = formatDeliveryAddress(address);
  return formatted === "No address" ? "No address available" : formatted;
};

const toTrimmedText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const isApiRecord = (value: unknown): value is ApiRecord => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const readFirstValue = (source: unknown, keys: string[]): unknown => {
  if (!isApiRecord(source)) return undefined;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = source[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }

  return undefined;
};

const unwrapDateValue = (value: unknown): unknown => {
  if (!isApiRecord(value)) return value;

  const seconds = readFirstValue(value, ["seconds", "_seconds"]);
  if (typeof seconds === "number" && Number.isFinite(seconds)) {
    return seconds;
  }

  return (
    readFirstValue(value, [
      "date",
      "dateTime",
      "datetime",
      "iso",
      "timestamp",
      "value",
      "$date",
      "$numberLong",
    ]) ?? value
  );
};

const parseExpenseDate = (value: unknown): Date | null => {
  let dateLike = value;
  for (let i = 0; i < 3; i += 1) {
    const unwrapped = unwrapDateValue(dateLike);
    if (unwrapped === dateLike) break;
    dateLike = unwrapped;
  }

  if (dateLike instanceof Date) {
    return Number.isNaN(dateLike.getTime()) ? null : dateLike;
  }

  if (typeof dateLike === "number" && Number.isFinite(dateLike)) {
    const timestamp = dateLike > 9999999999 ? dateLike : dateLike * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof dateLike === "string") {
    return parseServerDate(dateLike);
  }

  return null;
};

const parseExpenseAmount = (value: unknown): number => {
  if (isApiRecord(value)) {
    const nestedAmount = readFirstValue(value, [
      "amount",
      "value",
      "total",
      "totalAmount",
      "total_amount",
    ]);
    if (nestedAmount !== undefined) return parseExpenseAmount(nestedAmount);
  }

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const parseExpenseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "yes", "y", "1", "paid"].includes(normalized);
  }
  return false;
};

const normalizeExpenseStatus = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const getExpenseRecordDate = (expense: unknown): Date | null =>
  parseExpenseDate(
    readFirstValue(expense, [
      "date",
      "expenseDate",
      "expense_date",
      "requestDate",
      "request_date",
      "spentAt",
      "spent_at",
      "submissionDate",
      "submission_date",
      "submittedAt",
      "submitted_at",
      "createdAt",
      "created_at",
      "requestedAt",
      "requested_at",
    ]),
  );

const getExpenseRecordAmount = (expense: unknown): number =>
  parseExpenseAmount(
    readFirstValue(expense, [
      "amount",
      "value",
      "total",
      "totalAmount",
      "total_amount",
    ]),
  );

const isApprovedExpenseForDeduction = (expense: unknown): boolean => {
  const status = normalizeExpenseStatus(
    readFirstValue(expense, [
      "status",
      "state",
      "approvalStatus",
      "approval_status",
    ]),
  );
  const paid =
    parseExpenseBoolean(
      readFirstValue(expense, ["paid", "isPaid", "is_paid"]),
    ) || status.includes("paid");
  const rejected = status.includes("reject") || status.includes("decline");
  const hasApprovalMarker = Boolean(
    readFirstValue(expense, [
      "approvedAt",
      "approved_at",
      "approvedBy",
      "approved_by",
      "reviewedAt",
      "reviewed_at",
      "reviewedBy",
      "reviewed_by",
    ]),
  );

  return (
    !paid &&
    !rejected &&
    (status.includes("approved") ||
      status.includes("accepted") ||
      hasApprovalMarker)
  );
};

const normalizeExpenseListPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isApiRecord(payload)) return [];

  const nestedList = readFirstValue(payload, [
    "expenses",
    "items",
    "data",
    "results",
  ]);

  return Array.isArray(nestedList) ? nestedList : [];
};

const formatTaskValue = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const humanizeTaskKey = (value: string): string => {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeHistoryTasks = (tasks: unknown[]): NormalizedHistoryTask[] => {
  if (!Array.isArray(tasks)) return [];

  const parsedTasks = parseDeliveryTasks(tasks);
  if (parsedTasks.length > 0) {
    return parsedTasks.map((task) => {
      const meta = [
        `Type: ${humanizeTaskKey(task.type)}`,
        task.referenceId
          ? task.type === "subscription"
            ? `Item: ${task.referenceId}`
            : task.type === "staff_order"
              ? `Staff Order: ${task.referenceId}`
              : `Order: ${task.referenceId}`
          : null,
        task.invoiceId ? `Invoice: ${task.invoiceId}` : null,
        task.earlierAttemptsTodayCount > 0
          ? `Earlier Attempts: ${task.earlierAttemptsTodayCount}`
          : null,
        task.lines.length > 0 ? `${task.lines.length} line(s)` : null,
        task.creditCollections.length > 0
          ? `${task.creditCollections.length} credit collection(s)`
          : null,
      ].filter((entry): entry is string => Boolean(entry));

      return {
        id: task.key,
        title: task.label,
        meta,
      };
    });
  }

  return tasks
    .map((task, index) => {
      if (typeof task === "string") {
        const title = task.trim();
        if (!title) return null;
        return {
          id: `task-${index}-${title}`,
          title,
          meta: [],
        };
      }

      if (!task || typeof task !== "object") {
        return {
          id: `task-${index}`,
          title: `Task ${index + 1}`,
          meta: [],
        };
      }

      const record = task as Record<string, unknown>;
      const title =
        toTrimmedText(record.label) ||
        toTrimmedText(record.title) ||
        toTrimmedText(record.name) ||
        humanizeTaskKey(
          toTrimmedText(record.type) ||
            toTrimmedText(record.kind) ||
            `Task ${index + 1}`,
        );

      const meta = [
        toTrimmedText(record.outcome)
          ? `Outcome: ${toTrimmedText(record.outcome)}`
          : null,
        toTrimmedText(record.currentStatus)
          ? `Status: ${toTrimmedText(record.currentStatus)}`
          : null,
        toTrimmedText(record.orderId)
          ? `Order: ${toTrimmedText(record.orderId)}`
          : null,
        toTrimmedText(record.staffOrderId)
          ? `Staff Order: ${toTrimmedText(record.staffOrderId)}`
          : null,
        toTrimmedText(record.subscriptionId)
          ? `Subscription: ${toTrimmedText(record.subscriptionId)}`
          : null,
        toTrimmedText(record.itemId)
          ? `Item: ${toTrimmedText(record.itemId)}`
          : null,
      ].filter((entry): entry is string => Boolean(entry));

      if (meta.length > 0) {
        return {
          id: toTrimmedText(record.id) || `task-${index}`,
          title,
          meta,
        };
      }

      const fallbackMeta = Object.entries(record)
        .filter(([key]) => key !== "id")
        .slice(0, 3)
        .map(([key, value]) => {
          const formatted = formatTaskValue(value);
          return formatted ? `${humanizeTaskKey(key)}: ${formatted}` : null;
        })
        .filter((entry): entry is string => Boolean(entry));

      return {
        id: toTrimmedText(record.id) || `task-${index}`,
        title,
        meta: fallbackMeta,
      };
    })
    .filter((task): task is NormalizedHistoryTask => Boolean(task));
};

const getListDisplayId = (item: DriverHistoryDetail): string => {
  return getDriverHistoryPrimaryId(item);
};

const getListStatusConfig = (item: DriverHistoryDetail) => {
  if (isScheduledDeliveryHistory(item)) {
    if (item.isSuccessful) {
      return {
        label: "Successful",
        bg: "#DCFCE7",
        text: "#166534",
      };
    }
    return {
      label: "Failed",
      bg: "#FEE2E2",
      text: "#B91C1C",
    };
  }

  return {
    label: "Ad-hoc Sale",
    bg: "#DBEAFE",
    text: "#1D4ED8",
  };
};

const getSummaryToneIconColor = (tone: SummaryTone): string => {
  if (tone === "success") return "#047857";
  if (tone === "danger") return "#B91C1C";
  if (tone === "money") return "#0369A1";
  if (tone === "asset") return "#7C3AED";
  return "#475569";
};

const getSummaryToneIconBackground = (tone: SummaryTone): string => {
  if (tone === "success") return "#D1FAE5";
  if (tone === "danger") return "#FEE2E2";
  if (tone === "money") return "#E0F2FE";
  if (tone === "asset") return "#F3E8FF";
  return "#F1F5F9";
};

const SummaryMetricCard: React.FC<{
  icon: IconName;
  label: string;
  value: string | number;
  helper?: string;
  tone?: SummaryTone;
}> = ({ icon, label, value, helper, tone = "neutral" }) => {
  return (
    <View style={styles.summaryMetricCard}>
      <View
        style={[
          styles.summaryMetricIcon,
          { backgroundColor: getSummaryToneIconBackground(tone) },
        ]}
      >
        <Ionicons name={icon} size={17} color={getSummaryToneIconColor(tone)} />
      </View>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      {helper ? <Text style={styles.summaryMetricHelper}>{helper}</Text> : null}
    </View>
  );
};

const SummarySection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  return (
    <View style={styles.summarySection}>
      <Text style={styles.summarySectionTitle}>{title}</Text>
      {children}
    </View>
  );
};

const SummaryAmountRow: React.FC<{
  label: string;
  amount: number;
  icon: IconName;
  emphasis?: boolean;
}> = ({ label, amount, icon, emphasis = false }) => {
  return (
    <View
      style={[
        styles.summaryAmountRow,
        emphasis && styles.summaryAmountRowEmphasis,
      ]}
    >
      <View style={styles.summaryAmountLabelWrap}>
        <View
          style={[
            styles.summaryAmountIcon,
            emphasis && styles.summaryAmountIconEmphasis,
          ]}
        >
          <Ionicons name={icon} size={14} color="#0369A1" />
        </View>
        <Text
          style={[
            styles.summaryAmountLabel,
            emphasis && styles.summaryAmountLabelEmphasis,
          ]}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.summaryAmountValue,
          emphasis && styles.summaryAmountValueEmphasis,
        ]}
      >
        AED {formatAmount(amount)}
      </Text>
    </View>
  );
};

const SummaryMovementRow: React.FC<{
  label: string;
  count: number;
  amount?: number;
}> = ({ label, count, amount }) => {
  return (
    <View style={styles.summaryMovementRow}>
      <Text style={styles.summaryMovementLabel}>{label}</Text>
      <View style={styles.summaryMovementValueWrap}>
        <Text style={styles.summaryMovementValue}>
          {formatSummaryCount(count)}
        </Text>
        {amount && amount > 0 ? (
          <Text style={styles.summaryMovementAmount}>
            AED {formatAmount(amount)}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const [activeTab, setActiveTab] = useState<HistoryViewTab>("records");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<HistoryKindFilter>("all");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [selectedFromDate, setSelectedFromDate] = useState<Date | null>(null);
  const [selectedToDate, setSelectedToDate] = useState<Date | null>(null);
  const [draftFromDate, setDraftFromDate] = useState<Date | null>(null);
  const [draftToDate, setDraftToDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const [items, setItems] = useState<DriverHistoryDetail[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [summaryItems, setSummaryItems] = useState<DriverHistoryDetail[]>([]);
  const [summaryApprovedExpenses, setSummaryApprovedExpenses] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DriverHistoryDetail | null>(
    null,
  );

  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  const fetchApprovedExpensesForDay = useCallback(
    async (day: Date): Promise<number> => {
      if (!driverId) {
        throw new Error("Driver ID not available for approved expenses.");
      }

      const params = new URLSearchParams();
      params.set("status", "approved");

      const response = await authenticatedFetch(
        `${API_BASE_URL}/expenses?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        },
      );
      const result = await parseApiResponseWithSoftError<unknown>(response);

      if (!result.ok) {
        throw new Error(result.error);
      }

      return normalizeExpenseListPayload(result.data).reduce<number>(
        (sum, expense) => {
          if (!isApprovedExpenseForDeduction(expense)) return sum;
          const expenseDate = getExpenseRecordDate(expense);
          if (!sameCalendarDay(expenseDate, day)) return sum;
          return sum + getExpenseRecordAmount(expense);
        },
        0,
      );
    },
    [driverId],
  );

  const fetchHistory = useCallback(
    async ({
      pageToLoad = 1,
      append = false,
      isRefresh = false,
    }: {
      pageToLoad?: number;
      append?: boolean;
      isRefresh?: boolean;
    } = {}) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setApiError(null);

        const params = new URLSearchParams();
        if (kindFilter === "delivery") {
          params.set("kind", "delivery");
        }
        params.set("page", String(pageToLoad));
        params.set("limit", String(PAGE_LIMIT));
        if (appliedFrom.trim()) params.set("from", appliedFrom.trim());
        if (appliedTo.trim()) params.set("to", appliedTo.trim());

        const response = await authenticatedFetch(
          `${API_BASE_URL}/history?${params.toString()}`,
          {
            method: "GET",
          },
        );

        const result =
          await parseApiResponseWithSoftError<DriverHistoryListPayload>(
            response,
          );

        if (!result.ok) {
          if (!append) {
            setItems([]);
            setTotal(0);
            setHasMore(false);
            setPage(1);
          }
          setApiError(result.error);
          return;
        }

        const payload = normalizeDriverHistoryListPayload(result.data);
        setTotal(payload.total);
        setPage(payload.page);
        setHasMore(payload.hasMore);

        if (append) {
          setItems((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = payload.items.filter(
              (item) => !existingIds.has(item.id),
            );
            return [...prev, ...newItems];
          });
        } else {
          setItems(payload.items);
        }
      } catch (error) {
        if (!append) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
          setPage(1);
        }
        setApiError(
          error instanceof Error ? error.message : "Could not load history.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [appliedFrom, appliedTo, kindFilter],
  );

  const fetchTodaySummary = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      try {
        if (isRefresh) {
          setSummaryRefreshing(true);
        } else {
          setSummaryLoading(true);
        }
        setSummaryError(null);

        const today = new Date();
        const from = toDayStartIso(today);
        const to = toDayEndIso(today);
        const loadedItems: DriverHistoryDetail[] = [];
        const loadedIds = new Set<string>();
        let pageToLoad = 1;
        let shouldContinue = true;

        while (shouldContinue && pageToLoad <= SUMMARY_MAX_PAGES) {
          const params = new URLSearchParams();
          params.set("page", String(pageToLoad));
          params.set("limit", String(SUMMARY_PAGE_LIMIT));
          params.set("from", from);
          params.set("to", to);

          const response = await authenticatedFetch(
            `${API_BASE_URL}/history?${params.toString()}`,
            { method: "GET" },
          );

          const result =
            await parseApiResponseWithSoftError<DriverHistoryListPayload>(
              response,
            );

          if (!result.ok) {
            setSummaryItems([]);
            setSummaryError(result.error);
            return;
          }

          const payload = normalizeDriverHistoryListPayload(result.data);
          payload.items.forEach((item) => {
            if (!loadedIds.has(item.id)) {
              loadedIds.add(item.id);
              loadedItems.push(item);
            }
          });

          shouldContinue = payload.hasMore;
          pageToLoad += 1;
        }

        let approvedExpenseTotal = 0;
        try {
          approvedExpenseTotal = await fetchApprovedExpensesForDay(today);
        } catch (expenseError) {
          setSummaryError(
            expenseError instanceof Error
              ? expenseError.message
              : "Could not load approved expenses.",
          );
        }

        setSummaryApprovedExpenses(approvedExpenseTotal);
        setSummaryItems(loadedItems);
      } catch (error) {
        setSummaryApprovedExpenses(0);
        setSummaryItems([]);
        setSummaryError(
          error instanceof Error
            ? error.message
            : "Could not load today's summary.",
        );
      } finally {
        setSummaryLoading(false);
        setSummaryRefreshing(false);
      }
    },
    [fetchApprovedExpensesForDay],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchHistory({ pageToLoad: 1, append: false, isRefresh: false });
      void fetchTodaySummary({ isRefresh: false });
    }, [fetchHistory, fetchTodaySummary]),
  );

  const onRefresh = useCallback(() => {
    if (activeTab === "summary") {
      void fetchTodaySummary({ isRefresh: true });
      return;
    }

    void fetchHistory({ pageToLoad: 1, append: false, isRefresh: true });
  }, [activeTab, fetchHistory, fetchTodaySummary]);

  const onLoadMore = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    void fetchHistory({ pageToLoad: page + 1, append: true, isRefresh: false });
  }, [fetchHistory, hasMore, loading, loadingMore, page, refreshing]);

  const openCalendar = useCallback(() => {
    setDraftFromDate(selectedFromDate);
    setDraftToDate(selectedToDate);

    const referenceDate = selectedFromDate || new Date();
    setCalendarMonth(
      new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
    );
    setShowCalendar(true);
  }, [selectedFromDate, selectedToDate]);

  const closeCalendar = useCallback(() => {
    setShowCalendar(false);
  }, []);

  const shiftCalendarMonth = useCallback((delta: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta, 1);
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  }, []);

  const selectCalendarDay = useCallback(
    (date: Date) => {
      const picked = normalizeCalendarDay(date);

      if (!draftFromDate || (draftFromDate && draftToDate)) {
        setDraftFromDate(picked);
        setDraftToDate(null);
        return;
      }

      const currentFrom = normalizeCalendarDay(draftFromDate);
      if (picked.getTime() < currentFrom.getTime()) {
        setDraftFromDate(picked);
        setDraftToDate(null);
        return;
      }

      setDraftToDate(picked);
    },
    [draftFromDate, draftToDate],
  );

  const applyDateFilter = useCallback(() => {
    const effectiveFrom = draftFromDate;
    const effectiveTo = draftToDate || draftFromDate;

    setSelectedFromDate(effectiveFrom);
    setSelectedToDate(effectiveTo);
    setAppliedFrom(effectiveFrom ? toDayStartIso(effectiveFrom) : "");
    setAppliedTo(effectiveTo ? toDayEndIso(effectiveTo) : "");
    setShowCalendar(false);
  }, [draftFromDate, draftToDate]);

  const clearDateFilter = useCallback(() => {
    setSelectedFromDate(null);
    setSelectedToDate(null);
    setDraftFromDate(null);
    setDraftToDate(null);
    setAppliedFrom("");
    setAppliedTo("");
  }, []);

  const hasDateFilter = Boolean(selectedFromDate || selectedToDate);

  const appliedDateLabel = useMemo(() => {
    if (!selectedFromDate && !selectedToDate) return "All dates";
    if (selectedFromDate && selectedToDate) {
      if (sameCalendarDay(selectedFromDate, selectedToDate)) {
        return formatCalendarDateLabel(selectedFromDate);
      }
      return `${formatCalendarDateLabel(selectedFromDate)} - ${formatCalendarDateLabel(
        selectedToDate,
      )}`;
    }
    return formatCalendarDateLabel(selectedFromDate || selectedToDate);
  }, [selectedFromDate, selectedToDate]);

  const calendarCells = useMemo(
    () => getCalendarCells(calendarMonth),
    [calendarMonth],
  );

  const kindScopedItems = useMemo(() => {
    if (kindFilter === "delivery") {
      return items.filter((item) => isScheduledDeliveryHistory(item));
    }
    if (kindFilter === "direct_sale") {
      return items.filter((item) => isAdhocDeliveryHistory(item));
    }
    return items;
  }, [items, kindFilter]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return kindScopedItems;

    return kindScopedItems.filter((item) => {
      const displayId = getListDisplayId(item).toLowerCase();
      const name = (item.customer?.name || "").toLowerCase();
      const phone = (item.customer?.phone || "").toLowerCase();
      const address = formatAddress(item.address).toLowerCase();
      const saleId = (item.sale?.saleId || "").toLowerCase();

      return (
        displayId.includes(query) ||
        name.includes(query) ||
        phone.includes(query) ||
        address.includes(query) ||
        saleId.includes(query)
      );
    });
  }, [kindScopedItems, search]);

  const stats = useMemo(() => {
    const deliveries = kindScopedItems.filter((item) =>
      isScheduledDeliveryHistory(item),
    );
    const directSales = kindScopedItems.filter((item) =>
      isAdhocDeliveryHistory(item),
    );

    return {
      total:
        kindFilter === "direct_sale"
          ? kindScopedItems.length
          : total || kindScopedItems.length,
      loaded: filteredItems.length,
      deliveries: deliveries.length,
      successfulDeliveries: deliveries.filter((item) => item.isSuccessful)
        .length,
      directSales: directSales.length,
    };
  }, [filteredItems.length, kindFilter, kindScopedItems, total]);

  const todayLabel = useMemo(() => formatCalendarDateLabel(new Date()), []);

  const todaySummary = useMemo(() => {
    const today = new Date();
    const todayItems = summaryItems.filter((item) =>
      sameCalendarDay(parseServerDate(item.createdAt), today),
    );
    const scheduledDeliveries = todayItems.filter((item) =>
      isScheduledDeliveryHistory(item),
    );
    const directSales = todayItems.filter((item) =>
      isAdhocDeliveryHistory(item),
    );
    const successfulDeliveries = scheduledDeliveries.filter(
      (item) => item.isSuccessful === true,
    );
    const failedDeliveries = scheduledDeliveries.filter(
      (item) => item.isSuccessful === false,
    );
    const failureReasonCounts = new Map<string, number>();
    const soldItemsByKey = new Map<string, SummarySoldItem>();

    const summary = {
      records: todayItems.length,
      successfulDeliveries: successfulDeliveries.length,
      failedDeliveries: failedDeliveries.length,
      directSales: directSales.length,
      totalVisits: todayItems.length,
      cashSales: 0,
      checkSales: 0,
      walletSales: 0,
      creditSales: 0,
      balanceCollections: 0,
      approvedExpenses: summaryApprovedExpenses,
      netDriverCollection: 0,
      bottlesLeft: 0,
      bottlesLeftValue: 0,
      bottlesCollected: 0,
      assetsLeft: 0,
      assetsLeftValue: 0,
      assetsCollected: 0,
      soldItems: [] as SummarySoldItem[],
      notesCount: 0,
      topFailureReason: "None",
    };

    todayItems.forEach((item) => {
      if (item.remark?.trim()) {
        summary.notesCount += 1;
      }

      if (item.isSuccessful === false) {
        const reason = item.failureReason?.trim() || "No reason recorded";
        failureReasonCounts.set(
          reason,
          (failureReasonCounts.get(reason) || 0) + 1,
        );
      }

      if (item.sale) {
        const payment = item.sale.payment;
        if (payment?.method === "cash") {
          summary.cashSales += payment.amount;
        } else if (payment?.method === "check") {
          summary.checkSales += payment.amount;
        } else if (payment?.method === "wallet") {
          summary.walletSales += payment.amount;
        } else {
          summary.creditSales += item.sale.totals.total;
        }

        item.sale.items.forEach((saleItem) => {
          const quantity = saleItem.quantity || 0;
          if (quantity <= 0) return;

          const label =
            saleItem.itemType === "asset"
              ? saleItem.assetCategory?.trim() ||
                saleItem.label?.trim() ||
                "Asset"
              : saleItem.label?.trim() ||
                saleItem.assetCategory?.trim() ||
                "Sold Item";
          const key =
            `${saleItem.itemType}:${saleItem.itemId || saleItem.id || label}`.toLowerCase();
          const existing = soldItemsByKey.get(key);
          const amount = quantity * (saleItem.unitPrice || 0);

          if (existing) {
            existing.quantity += quantity;
            existing.amount += amount;
            return;
          }

          soldItemsByKey.set(key, {
            key,
            label,
            quantity,
            amount,
          });
        });
      }

      item.creditCollections.forEach((entry) => {
        summary.balanceCollections += entry.amount;
      });

      item.depositReturns.forEach((entry) => {
        const quantity = entry.quantity || 0;
        const value = quantity * (entry.unitPrice || 0);

        if (entry.depositKind === "bottle") {
          if (entry.type === "deposit") {
            summary.bottlesLeft += quantity;
            summary.bottlesLeftValue += value;
          } else {
            summary.bottlesCollected += quantity;
          }
          return;
        }

        if (entry.type === "deposit") {
          summary.assetsLeft += quantity;
          summary.assetsLeftValue += value;
        } else {
          summary.assetsCollected += quantity;
        }
      });
    });

    summary.netDriverCollection =
      summary.cashSales + summary.balanceCollections - summary.approvedExpenses;
    summary.soldItems = Array.from(soldItemsByKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    const topFailure = Array.from(failureReasonCounts.entries()).sort(
      (first, second) => second[1] - first[1],
    )[0];

    if (topFailure) {
      summary.topFailureReason = `${topFailure[0]} (${topFailure[1]})`;
    }

    return summary;
  }, [summaryApprovedExpenses, summaryItems]);

  const fetchHistoryDetail = useCallback(async (id: string) => {
    setShowDetail(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/history/${id}`,
        {
          method: "GET",
        },
      );

      const result =
        await parseApiResponseWithSoftError<DriverHistoryDetail>(response);
      if (!result.ok) {
        setDetailError(result.error);
        return;
      }

      const normalizedDetail = normalizeDriverHistoryDetail(result.data);
      if (!normalizedDetail) {
        setDetailError("Invalid response from server.");
        return;
      }

      setDetailData(normalizedDetail);
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Could not load history detail.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openUrl = useCallback(async (url: string | null) => {
    const normalizedUrl = resolveResourceUrl(url);
    if (!normalizedUrl) return;
    try {
      const supported = await Linking.canOpenURL(normalizedUrl);
      if (!supported) return;
      await Linking.openURL(normalizedUrl);
    } catch {
      // no-op
    }
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: DriverHistoryDetail }) => {
      const status = getListStatusConfig(item);
      const amount = item.sale?.totals.total ?? null;
      const kindLabel = getDriverHistoryKindLabel(item.kind);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.82}
          onPress={() => void fetchHistoryDetail(item.id)}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.kindBadge}>
              <Ionicons
                name={
                  isScheduledDeliveryHistory(item)
                    ? "cube-outline"
                    : "cash-outline"
                }
                size={12}
                color="#1D4ED8"
              />
              <Text style={styles.kindBadgeText}>{kindLabel}</Text>
            </View>
            <Text style={styles.cardDate}>
              {formatDate(item.createdAt, true)}
            </Text>
          </View>

          <View style={styles.cardTopLine}>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusBadgeText, { color: status.text }]}>
                {status.label}
              </Text>
            </View>
          </View>

          <Text style={styles.customerName}>
            {item.customer?.name || "Unknown customer"}
          </Text>
          <Text style={styles.customerPhone}>
            {item.customer?.phone || "No phone"}
          </Text>
          <Text style={styles.addressText} numberOfLines={2}>
            {formatAddress(item.address)}
          </Text>

          <View style={styles.cardBottomRow}>
            <Text style={styles.amountText}>AED {formatAmount(amount)}</Text>
            <View style={styles.detailLinkRow}>
              <Ionicons name="chevron-forward" size={16} color="#1E40AF" />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [fetchHistoryDetail],
  );

  const detailSale = detailData?.sale ?? null;
  const detailInvoice = detailSale?.invoice ?? null;
  const detailTasks = useMemo(
    () => normalizeHistoryTasks(detailData?.tasks || []),
    [detailData?.tasks],
  );
  const isDeliveryDetail = detailData
    ? isScheduledDeliveryHistory(detailData)
    : false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.headerCountBadge}>
          <Ionicons name="time-outline" size={14} color="#1E40AF" />
          <Text style={styles.headerCountText}>
            {activeTab === "summary"
              ? todaySummary.records
              : filteredItems.length}
          </Text>
        </View>
      </View>

      <View style={styles.historyTabRow}>
        <TouchableOpacity
          style={[
            styles.historyTabButton,
            activeTab === "records" && styles.historyTabButtonActive,
          ]}
          onPress={() => setActiveTab("records")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.historyTabText,
              activeTab === "records" && styles.historyTabTextActive,
            ]}
          >
            Records
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.historyTabButton,
            activeTab === "summary" && styles.historyTabButtonActive,
          ]}
          onPress={() => setActiveTab("summary")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.historyTabText,
              activeTab === "summary" && styles.historyTabTextActive,
            ]}
          >
            Summary
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "records" ? (
        <>
          <ApiErrorText error={apiError} />

          <View style={styles.statsWrap}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>All</Text>
              <Text style={styles.statValue}>{stats.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Drop</Text>
              <Text style={styles.statValue}>{stats.deliveries}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Sale</Text>
              <Text style={styles.statValue}>{stats.directSales}</Text>
            </View>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <TouchableOpacity
              style={[
                styles.calendarTrigger,
                hasDateFilter && styles.calendarTriggerActive,
              ]}
              onPress={openCalendar}
              activeOpacity={0.85}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={hasDateFilter ? "#FFFFFF" : "#1E40AF"}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.dateSummaryRow}>
            <Text
              style={[
                styles.dateSummaryText,
                !hasDateFilter && styles.dateSummaryTextMuted,
              ]}
            >
              {appliedDateLabel}
            </Text>
            {hasDateFilter ? (
              <TouchableOpacity
                style={styles.dateClearPill}
                onPress={clearDateFilter}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={12} color="#1E3A8A" />
                <Text style={styles.dateClearPillText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                kindFilter === "all" && styles.filterChipActive,
              ]}
              onPress={() => setKindFilter("all")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  kindFilter === "all" && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                kindFilter === "delivery" && styles.filterChipActive,
              ]}
              onPress={() => setKindFilter("delivery")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  kindFilter === "delivery" && styles.filterChipTextActive,
                ]}
              >
                Drop
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                kindFilter === "direct_sale" && styles.filterChipActive,
              ]}
              onPress={() => setKindFilter("direct_sale")}
            >
              <Text
                style={[
                  styles.filterChipText,
                  kindFilter === "direct_sale" && styles.filterChipTextActive,
                ]}
              >
                Sale
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              renderItem={renderCard}
              onEndReached={onLoadMore}
              onEndReachedThreshold={0.3}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={["#1E40AF"]}
                  tintColor="#1E40AF"
                />
              }
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="time-outline" size={40} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No history found</Text>
                  <Text style={styles.emptySubtitle}>
                    Try clearing filters or changing your search.
                  </Text>
                </View>
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color="#1E40AF" />
                  </View>
                ) : hasMore ? null : filteredItems.length > 0 ? (
                  <View style={styles.footerEndWrap}>
                    <Text style={styles.footerEndText}>
                      You reached the end
                    </Text>
                  </View>
                ) : null
              }
            />
          )}
        </>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={summaryRefreshing}
              onRefresh={onRefresh}
              colors={["#1E40AF"]}
              tintColor="#1E40AF"
            />
          }
          contentContainerStyle={[
            styles.summaryContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
        >
          <ApiErrorText error={summaryError} />

          {summaryLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text style={styles.loadingText}>Loading today summary...</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryHeaderCard}>
                <View>
                  <Text style={styles.summaryEyebrow}>Today</Text>
                  <Text style={styles.summaryTitle}>Driver Summary</Text>
                  <Text style={styles.summaryDate}>{todayLabel}</Text>
                </View>
                <View style={styles.summaryRecordBadge}>
                  <Text style={styles.summaryRecordValue}>
                    {todaySummary.records}
                  </Text>
                  <Text style={styles.summaryRecordLabel}>records</Text>
                </View>
              </View>

              <SummarySection title="Work Summary">
                <View style={styles.summaryMetricGrid}>
                  <SummaryMetricCard
                    icon="checkmark-circle-outline"
                    label="Completed"
                    value={todaySummary.successfulDeliveries}
                    tone="success"
                  />
                  <SummaryMetricCard
                    icon="close-circle-outline"
                    label="Failed"
                    value={todaySummary.failedDeliveries}
                    tone="danger"
                  />
                  <SummaryMetricCard
                    icon="cash-outline"
                    label="Direct Sales"
                    value={todaySummary.directSales}
                    tone="money"
                  />
                  <SummaryMetricCard
                    icon="map-outline"
                    label="Total Visits"
                    value={todaySummary.totalVisits}
                  />
                </View>
              </SummarySection>

              <SummarySection title="Money Summary">
                <View style={styles.summaryPanel}>
                  <SummaryAmountRow
                    icon="cash-outline"
                    label="Cash sale collected"
                    amount={todaySummary.cashSales}
                  />
                  <SummaryAmountRow
                    icon="remove-circle-outline"
                    label="Approved expenses"
                    amount={todaySummary.approvedExpenses}
                  />
                  <SummaryAmountRow
                    icon="archive-outline"
                    label="Balance collected"
                    amount={todaySummary.balanceCollections}
                  />
                  <SummaryAmountRow
                    icon="calculator-outline"
                    label="Net amount to collect from driver"
                    amount={todaySummary.netDriverCollection}
                    emphasis
                  />
                  <SummaryAmountRow
                    icon="receipt-outline"
                    label="Check sales"
                    amount={todaySummary.checkSales}
                  />
                  <SummaryAmountRow
                    icon="wallet-outline"
                    label="Wallet sales"
                    amount={todaySummary.walletSales}
                  />
                  <SummaryAmountRow
                    icon="document-text-outline"
                    label="Credit sales"
                    amount={todaySummary.creditSales}
                  />
                </View>
              </SummarySection>

              <SummarySection title="Items Sold">
                <View style={styles.summaryPanel}>
                  {todaySummary.soldItems.length > 0 ? (
                    todaySummary.soldItems.map((item) => (
                      <SummaryMovementRow
                        key={item.key}
                        label={item.label}
                        count={item.quantity}
                        amount={item.amount}
                      />
                    ))
                  ) : (
                    <Text style={styles.summaryEmptyText}>
                      No sold items today.
                    </Text>
                  )}
                </View>
              </SummarySection>

              <SummarySection title="Bottles & Assets">
                <View style={styles.summaryPanel}>
                  <SummaryMovementRow
                    label="Bottles left with customers"
                    count={todaySummary.bottlesLeft}
                    amount={todaySummary.bottlesLeftValue}
                  />
                  <SummaryMovementRow
                    label="Bottles collected"
                    count={todaySummary.bottlesCollected}
                  />
                  <SummaryMovementRow
                    label="Assets left with customers"
                    count={todaySummary.assetsLeft}
                    amount={todaySummary.assetsLeftValue}
                  />
                  <SummaryMovementRow
                    label="Assets collected"
                    count={todaySummary.assetsCollected}
                  />
                </View>
              </SummarySection>

              <SummarySection title="Issues">
                <View style={styles.summaryPanel}>
                  <View style={styles.summaryIssueRow}>
                    <View style={styles.summaryIssueIcon}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={16}
                        color="#B91C1C"
                      />
                    </View>
                    <View style={styles.summaryIssueCopy}>
                      <Text style={styles.summaryIssueLabel}>
                        Most common failure
                      </Text>
                      <Text style={styles.summaryIssueValue}>
                        {todaySummary.topFailureReason}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.summaryIssueRow}>
                    <View style={styles.summaryIssueIconMuted}>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={16}
                        color="#475569"
                      />
                    </View>
                    <View style={styles.summaryIssueCopy}>
                      <Text style={styles.summaryIssueLabel}>Driver notes</Text>
                      <Text style={styles.summaryIssueValue}>
                        {todaySummary.notesCount}
                      </Text>
                    </View>
                  </View>
                </View>
              </SummarySection>
            </>
          )}
        </ScrollView>
      )}

      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={closeCalendar}
      >
        <View style={styles.calendarModalOverlay}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarModalHeader}>
              <Text style={styles.calendarModalTitle}>Date</Text>
              <TouchableOpacity
                style={styles.calendarCloseButton}
                onPress={closeCalendar}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthRow}>
              <TouchableOpacity
                style={styles.calendarMonthNavButton}
                onPress={() => shiftCalendarMonth(-1)}
              >
                <Ionicons name="chevron-back" size={16} color="#1E40AF" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {calendarMonth.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <TouchableOpacity
                style={styles.calendarMonthNavButton}
                onPress={() => shiftCalendarMonth(1)}
              >
                <Ionicons name="chevron-forward" size={16} color="#1E40AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {CALENDAR_WEEKDAY_LABELS.map((label, index) => (
                <Text
                  key={`${label}-${index}`}
                  style={styles.calendarWeekLabel}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((date, index) => {
                if (!date) {
                  return (
                    <View
                      key={`empty-${index}`}
                      style={styles.calendarDayCell}
                    />
                  );
                }

                const isStart = sameCalendarDay(date, draftFromDate);
                const isEnd = sameCalendarDay(date, draftToDate);
                const isBoundary = isStart || isEnd;
                const isInRange =
                  !!draftFromDate &&
                  !!draftToDate &&
                  isCalendarDayBetween(date, draftFromDate, draftToDate);

                return (
                  <TouchableOpacity
                    key={`${date.toISOString()}-${index}`}
                    style={styles.calendarDayCell}
                    onPress={() => selectCalendarDay(date)}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.calendarDayBubble,
                        isInRange && styles.calendarDayInRange,
                        isBoundary && styles.calendarDaySelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          isBoundary && styles.calendarDayTextSelected,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.calendarSelectionText}>
              {`From ${formatCalendarDateLabel(draftFromDate)}  •  To ${formatCalendarDateLabel(draftToDate || draftFromDate)}`}
            </Text>

            <View style={styles.calendarActionRow}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  setDraftFromDate(null);
                  setDraftToDate(null);
                }}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.applyButton,
                  !draftFromDate && styles.disabledAction,
                ]}
                onPress={applyDateFilter}
                disabled={!draftFromDate}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetail(false)}
      >
        <View
          style={[
            styles.modalContainer,
            { paddingTop: Platform.OS === "ios" ? 20 : insets.top },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Detail</Text>
              <Text style={styles.modalSubtitle}>
                {detailData
                  ? formatDate(detailData.createdAt, true)
                  : "Loading..."}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowDetail(false)}
            >
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#1E40AF" />
            </View>
          ) : detailError ? (
            <View style={styles.detailErrorWrap}>
              <ApiErrorText error={detailError} />
            </View>
          ) : detailData ? (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContentContainer}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Overview</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Kind:</Text>{" "}
                  {getDriverHistoryKindLabel(detailData.kind)}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Reference:</Text>{" "}
                  {getListDisplayId(detailData)}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Created At:</Text>{" "}
                  {formatDate(detailData.createdAt, true)}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Customer</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Name:</Text>{" "}
                  {detailData.customer.name}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Phone:</Text>{" "}
                  {detailData.customer.phone}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Email:</Text>{" "}
                  {detailData.customer.email || "N/A"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>
                    Requires Signature:
                  </Text>{" "}
                  {detailData.customer.requires_signature ? "Yes" : "No"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Immediate Invoice:</Text>{" "}
                  {detailData.customer.requires_immediate_invoice
                    ? "Yes"
                    : "No"}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Address</Text>
                <Text style={styles.detailLine}>
                  {formatAddress(detailData.address)}
                </Text>
              </View>

              {isDeliveryDetail ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Delivery Result</Text>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailLineLabel}>Successful:</Text>{" "}
                    {detailData.isSuccessful == null
                      ? "N/A"
                      : detailData.isSuccessful
                        ? "Yes"
                        : "No"}
                  </Text>
                  <Text style={styles.detailLine}>
                    <Text style={styles.detailLineLabel}>Failure Reason:</Text>{" "}
                    {detailData.failureReason || "N/A"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Receiver & Notes</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Receiver:</Text>{" "}
                  {detailData.receiver
                    ? `${detailData.receiver.name}${detailData.receiver.position ? ` (${detailData.receiver.position})` : ""}`
                    : "N/A"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Remark:</Text>{" "}
                  {detailData.remark || "N/A"}
                </Text>
                {detailData.receiver?.signatureUrl ? (
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() =>
                      void openUrl(detailData.receiver?.signatureUrl || null)
                    }
                  >
                    <Text style={styles.linkButtonText}>Open Signature</Text>
                    <Ionicons name="open-outline" size={14} color="#1E40AF" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Tasks</Text>
                {detailTasks.length === 0 ? (
                  <Text style={styles.detailMutedText}>
                    No task activity recorded.
                  </Text>
                ) : (
                  detailTasks.map((task) => (
                    <View key={task.id} style={styles.detailListRow}>
                      <Text style={styles.detailListTitle}>{task.title}</Text>
                      {task.meta.length > 0 ? (
                        task.meta.map((line, index) => (
                          <Text
                            key={`${task.id}-meta-${index}`}
                            style={styles.detailListMeta}
                          >
                            {line}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.detailListMeta}>No extra data</Text>
                      )}
                    </View>
                  ))
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Deposit Returns</Text>
                {detailData.depositReturns.length === 0 ? (
                  <Text style={styles.detailMutedText}>
                    No deposit returns in this report.
                  </Text>
                ) : (
                  detailData.depositReturns.map((entry) => (
                    <View key={entry.id} style={styles.detailListRow}>
                      <Text style={styles.detailListTitle}>{entry.label}</Text>
                      <Text style={styles.detailListMeta}>
                        {entry.type} • {entry.depositKind}
                      </Text>
                      <Text style={styles.detailListMeta}>
                        Qty {entry.quantity} • AED{" "}
                        {formatAmount(entry.unitPrice)}
                      </Text>
                      {entry.imageUrl ? (
                        <TouchableOpacity
                          style={styles.inlineLinkButton}
                          onPress={() => void openUrl(entry.imageUrl)}
                        >
                          <Text style={styles.inlineLinkButtonText}>
                            Open Image
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Sale</Text>
                {detailSale ? (
                  <>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Sale ID:</Text>{" "}
                      {detailSale.saleId}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Subtotal:</Text> AED{" "}
                      {formatAmount(detailSale.totals.subtotal)}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>VAT:</Text> AED{" "}
                      {formatAmount(detailSale.totals.vat)}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Total:</Text> AED{" "}
                      {formatAmount(detailSale.totals.total)}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Payment:</Text>{" "}
                      {detailSale.payment
                        ? `${detailSale.payment.method.charAt(0).toUpperCase()}${detailSale.payment.method.slice(1)} (AED ${formatAmount(detailSale.payment.amount)})`
                        : "Credit / Not captured"}
                    </Text>
                    {detailInvoice ? (
                      <>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>Invoice:</Text>{" "}
                          {detailInvoice.displayId}
                        </Text>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>
                            Invoice Total:
                          </Text>{" "}
                          AED {formatAmount(detailInvoice.totalAmount)}
                        </Text>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>
                            Invoice Date:
                          </Text>{" "}
                          {formatDate(detailInvoice.createdAt, true)}
                        </Text>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>Paid:</Text>{" "}
                          {detailInvoice.isPaid ? "Yes" : "No"}
                        </Text>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>
                            Pending Payment:
                          </Text>{" "}
                          {detailInvoice.hasPendingPayment ? "Yes" : "No"}
                        </Text>
                        <Text style={styles.detailLine}>
                          <Text style={styles.detailLineLabel}>
                            Invoice Remark:
                          </Text>{" "}
                          {detailInvoice.remark || "N/A"}
                        </Text>
                      </>
                    ) : null}

                    <View style={styles.saleItemsWrap}>
                      {detailSale.items.map((saleItem) => (
                        <View key={saleItem.id} style={styles.saleItemCard}>
                          <Text style={styles.saleItemTitle}>
                            {saleItem.label}
                          </Text>
                          <Text style={styles.saleItemMeta}>
                            {saleItem.itemType} • Qty {saleItem.quantity}
                          </Text>
                          <Text style={styles.saleItemMeta}>
                            AED {formatAmount(saleItem.unitPrice)} each • AED{" "}
                            {formatAmount(
                              saleItem.unitPrice * saleItem.quantity,
                            )}
                          </Text>
                          {saleItem.imageUrl ? (
                            <TouchableOpacity
                              style={styles.inlineLinkButton}
                              onPress={() => void openUrl(saleItem.imageUrl)}
                            >
                              <Text style={styles.inlineLinkButtonText}>
                                Open Image
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.detailMutedText}>No sale linked.</Text>
                )}
              </View>

              <View style={{ height: Math.max(insets.bottom, 16) + 24 }} />
            </ScrollView>
          ) : (
            <View style={styles.loadingWrap}>
              <Text style={styles.emptySubtitle}>No detail available.</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
  },
  headerCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  historyTabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  historyTabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTabButtonActive: {
    backgroundColor: "#1E40AF",
  },
  historyTabText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },
  historyTabTextActive: {
    color: "#FFFFFF",
  },
  statsWrap: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    marginTop: 3,
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.6,
  },
  statSub: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
  },
  summaryContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  summaryHeaderCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE7F3",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  summaryEyebrow: {
    color: "#1E40AF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryTitle: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
  },
  summaryDate: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
  summaryRecordBadge: {
    minWidth: 72,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
  },
  summaryRecordValue: {
    color: "#1E40AF",
    fontSize: 22,
    fontWeight: "800",
  },
  summaryRecordLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summarySection: {
    gap: 8,
  },
  summarySectionTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryMetricCard: {
    width: "48%",
    minHeight: 118,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
  },
  summaryMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  summaryMetricLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryMetricValue: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
  },
  summaryMetricHelper: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  summaryPanel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    overflow: "hidden",
  },
  summaryAmountRow: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryAmountRowEmphasis: {
    backgroundColor: "#ECFDF5",
  },
  summaryAmountLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryAmountIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryAmountIconEmphasis: {
    backgroundColor: "#D1FAE5",
  },
  summaryAmountLabel: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  summaryAmountLabelEmphasis: {
    color: "#065F46",
  },
  summaryAmountValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  summaryAmountValueEmphasis: {
    color: "#047857",
  },
  summaryEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },
  summaryMovementRow: {
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryMovementLabel: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  summaryMovementValueWrap: {
    alignItems: "flex-end",
  },
  summaryMovementValue: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800",
  },
  summaryMovementAmount: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  summaryIssueRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryIssueIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIssueIconMuted: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryIssueCopy: {
    flex: 1,
  },
  summaryIssueLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  summaryIssueValue: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800",
  },
  searchRow: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
  calendarTrigger: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarTriggerActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8",
  },
  dateSummaryRow: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dateSummaryText: {
    flex: 1,
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "600",
  },
  dateSummaryTextMuted: {
    color: "#64748B",
    fontWeight: "500",
  },
  dateClearPill: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateClearPillText: {
    color: "#1E3A8A",
    fontSize: 11,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
  },
  filterChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  calendarModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  calendarModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  calendarModalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
  },
  calendarCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarMonthNavButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthLabel: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "700",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  calendarWeekLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayInRange: {
    backgroundColor: "#DBEAFE",
  },
  calendarDaySelected: {
    backgroundColor: "#1D4ED8",
  },
  calendarDayText: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  calendarSelectionText: {
    color: "#334155",
    fontSize: 12,
    marginBottom: 10,
  },
  calendarActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  applyButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1D4ED8",
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  clearButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  clearButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  disabledAction: {
    opacity: 0.45,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  kindBadgeText: {
    fontSize: 11,
    color: "#1D4ED8",
    fontWeight: "700",
  },
  cardDate: {
    fontSize: 11,
    color: "#64748B",
  },
  cardTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  displayIdText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  customerName: {
    marginTop: 8,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  customerPhone: {
    marginTop: 2,
    fontSize: 12,
    color: "#334155",
  },
  addressText: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  cardBottomRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.3,
  },
  detailLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  detailLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E40AF",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    color: "#0F172A",
    fontWeight: "700",
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: 16,
  },
  footerEndWrap: {
    paddingVertical: 14,
    alignItems: "center",
  },
  footerEndText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  detailErrorWrap: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  modalScroll: {
    flex: 1,
  },
  modalContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  detailSection: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  detailLine: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 5,
    lineHeight: 18,
  },
  detailLineLabel: {
    fontWeight: "700",
    color: "#0F172A",
  },
  detailMutedText: {
    fontSize: 12,
    color: "#64748B",
  },
  linkButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  linkButtonText: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "700",
  },
  detailListRow: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 8,
  },
  detailListTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  detailListMeta: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 2,
  },
  saleItemsWrap: {
    marginTop: 8,
  },
  saleItemCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
  },
  saleItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 3,
  },
  saleItemMeta: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 2,
  },
  inlineLinkButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#EFF6FF",
  },
  inlineLinkButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },
});

export default HistoryScreen;
