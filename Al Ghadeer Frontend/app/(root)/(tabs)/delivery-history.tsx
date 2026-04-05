import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type HistoryKindFilter = "all" | "delivery" | "direct_sale";

interface HistoryCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  requires_signature: boolean;
  requires_immediate_invoice: boolean;
}

interface HistoryAddress {
  location_id: string;
  label: string | null;
  street: string | null;
  building: string | null;
  flat: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface HistoryReceiver {
  name: string;
  position?: string;
  signatureUrl: string | null;
}

interface HistorySaleAmountSummary {
  saleId: string;
  subtotal: string;
  tax: string;
  total: string;
}

interface HistoryDeliveryListItem {
  id: string;
  kind: "delivery";
  createdAt: string;
  displayId: string;
  isSuccessful: boolean;
  customer: HistoryCustomer;
  address: HistoryAddress;
  receiver: HistoryReceiver | null;
  saleAmount: HistorySaleAmountSummary | null;
}

interface HistoryDirectSaleListItem {
  id: string;
  kind: "directSale";
  createdAt: string;
  customer: HistoryCustomer;
  address: HistoryAddress | null;
  saleAmount: HistorySaleAmountSummary;
}

type HistoryListItem = HistoryDeliveryListItem | HistoryDirectSaleListItem;

interface HistoryListPayload {
  items: HistoryListItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

type HistoryTask =
  | {
      id: string;
      type: "subscription";
      itemId: string;
      outcome: string;
      currentStatus: string;
    }
  | {
      id: string;
      type: "prepaid_order";
      orderId: string;
      outcome: string;
      currentStatus: string;
    }
  | {
      id: string;
      type: "order";
      orderId: string;
      outcome: string;
      currentStatus: string;
    }
  | {
      id: string;
      type: "staff_order";
      staffOrderId: string;
      outcome: string;
      currentStatus: string;
    };

interface HistoryDepositReturn {
  id: string;
  type: "deposit" | "deposit_return";
  itemId: string;
  depositKind: "asset" | "bottle";
  quantity: number;
  unitPrice: number;
  label: string;
  imageUrl: string | null;
}

interface HistorySaleLineItem {
  id: string;
  itemId: string;
  itemType: "asset" | "retail" | "refill";
  label: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
}

type HistorySalePayment =
  | { method: "cash"; amount: number }
  | { method: "check"; amount: number }
  | { method: "wallet"; amount: number }
  | null;

interface HistorySaleDetail {
  saleId: string;
  items: HistorySaleLineItem[];
  totals: {
    subtotal: number;
    vat: number;
    total: number;
  };
  payment: HistorySalePayment;
}

interface HistoryDeliveryDetail {
  kind: "delivery";
  id: string;
  displayId: string | null;
  customer: HistoryCustomer;
  address: HistoryAddress;
  isSuccessful: boolean | null;
  failureReason: string | null;
  receiver: HistoryReceiver | null;
  remark: string | null;
  createdAt: string;
  tasks: HistoryTask[];
  depositReturns: HistoryDepositReturn[];
  sale: HistorySaleDetail | null;
}

interface HistoryDirectSaleDetail {
  kind: "directSale";
  id: string;
  customer: HistoryCustomer;
  address: HistoryAddress | null;
  remark: string | null;
  createdAt: string;
  sale: HistorySaleDetail;
}

type HistoryDetail = HistoryDeliveryDetail | HistoryDirectSaleDetail;

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

const formatAddress = (address: HistoryAddress | null | undefined): string => {
  if (!address) return "No address available";

  const parts = [
    address.label,
    address.street,
    address.building,
    address.flat,
    address.area,
    address.city,
  ]
    .map((part) => (part || "").trim())
    .filter((part) => part.length > 0);

  return parts.join(", ") || "No address available";
};

const normalizeHistoryReceiver = (
  receiver: HistoryReceiver | null,
): HistoryReceiver | null => {
  if (!receiver) return null;
  return {
    ...receiver,
    signatureUrl: resolveResourceUrl(receiver.signatureUrl),
  };
};

const normalizeHistorySale = (
  sale: HistorySaleDetail | null,
): HistorySaleDetail | null => {
  if (!sale) return null;
  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      imageUrl: resolveResourceUrl(item.imageUrl),
    })),
  };
};

const normalizeHistoryListItem = (item: HistoryListItem): HistoryListItem => {
  if (item.kind === "delivery") {
    return {
      ...item,
      receiver: normalizeHistoryReceiver(item.receiver),
    };
  }

  return item;
};

const normalizeHistoryDetail = (detail: HistoryDetail): HistoryDetail => {
  if (detail.kind === "delivery") {
    return {
      ...detail,
      receiver: normalizeHistoryReceiver(detail.receiver),
      depositReturns: detail.depositReturns.map((entry) => ({
        ...entry,
        imageUrl: resolveResourceUrl(entry.imageUrl),
      })),
      sale: normalizeHistorySale(detail.sale),
    };
  }

  return {
    ...detail,
    sale: normalizeHistorySale(detail.sale) as HistorySaleDetail,
  };
};

const getListDisplayId = (item: HistoryListItem): string => {
  if (item.kind === "delivery") return item.displayId || item.id;
  return item.saleAmount?.saleId || item.id;
};

const getListStatusConfig = (item: HistoryListItem) => {
  if (item.kind === "delivery") {
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
    label: "Direct Sale",
    bg: "#DBEAFE",
    text: "#1D4ED8",
  };
};

const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const driverId = currentDriver?.id || user?.id;

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

  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<HistoryDetail | null>(null);

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
      if (!driverId) {
        setItems([]);
        setApiError("Driver ID not available.");
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

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
        params.set("kind", kindFilter);
        params.set("page", String(pageToLoad));
        params.set("limit", String(PAGE_LIMIT));
        if (appliedFrom.trim()) params.set("from", appliedFrom.trim());
        if (appliedTo.trim()) params.set("to", appliedTo.trim());

        const response = await authenticatedFetch(
          `${API_BASE_URL}/history?${params.toString()}`,
          {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          },
        );

        const result =
          await parseApiResponseWithSoftError<HistoryListPayload>(response);

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

        const payload = result.data;
        setTotal(payload.total);
        setPage(payload.page);
        setHasMore(payload.hasMore);

        if (append) {
          setItems((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newItems = payload.items
              .map(normalizeHistoryListItem)
              .filter((item) => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        } else {
          setItems(payload.items.map(normalizeHistoryListItem));
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
    [appliedFrom, appliedTo, driverId, kindFilter],
  );

  useEffect(() => {
    void fetchHistory({ pageToLoad: 1, append: false, isRefresh: false });
  }, [fetchHistory]);

  const onRefresh = useCallback(() => {
    void fetchHistory({ pageToLoad: 1, append: false, isRefresh: true });
  }, [fetchHistory]);

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

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      const displayId = getListDisplayId(item).toLowerCase();
      const name = (item.customer?.name || "").toLowerCase();
      const phone = (item.customer?.phone || "").toLowerCase();
      const address = formatAddress(item.address).toLowerCase();
      const saleId = (item.saleAmount?.saleId || "").toLowerCase();

      return (
        displayId.includes(query) ||
        name.includes(query) ||
        phone.includes(query) ||
        address.includes(query) ||
        saleId.includes(query)
      );
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const deliveries = items.filter((item) => item.kind === "delivery");
    const directSales = items.filter((item) => item.kind === "directSale");

    return {
      total,
      loaded: items.length,
      deliveries: deliveries.length,
      successfulDeliveries: deliveries.filter((item) => item.isSuccessful)
        .length,
      directSales: directSales.length,
    };
  }, [items, total]);

  const fetchHistoryDetail = useCallback(
    async (id: string) => {
      if (!driverId) {
        setDetailError("Driver ID not available.");
        setShowDetail(true);
        return;
      }

      setShowDetail(true);
      setDetailLoading(true);
      setDetailError(null);
      setDetailData(null);

      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/history/${id}`,
          {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          },
        );

        const result =
          await parseApiResponseWithSoftError<HistoryDetail>(response);
        if (!result.ok) {
          setDetailError(result.error);
          return;
        }

        setDetailData(normalizeHistoryDetail(result.data));
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "Could not load history detail.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [driverId],
  );

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
    ({ item }: { item: HistoryListItem }) => {
      const status = getListStatusConfig(item);
      const amount = item.saleAmount?.total ?? null;
      const kindLabel = item.kind === "delivery" ? "Delivery" : "Direct Sale";

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
                  item.kind === "delivery" ? "cube-outline" : "cash-outline"
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
              <Text style={styles.detailLinkText}>View Detail</Text>
              <Ionicons name="chevron-forward" size={14} color="#1E40AF" />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [fetchHistoryDetail],
  );

  const detailSale = detailData?.sale ?? null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <ApiErrorText error={apiError} />

      <View style={styles.statsWrap}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Deliveries</Text>
          <Text style={styles.statValue}>{stats.deliveries}</Text>
          <Text style={styles.statSub}>
            {stats.successfulDeliveries} successful
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Direct Sales</Text>
          <Text style={styles.statValue}>{stats.directSales}</Text>
          <Text style={styles.statSub}>{stats.loaded} loaded</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search customer, phone, address"
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
            Delivery
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
            Direct Sale
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
                <Text style={styles.footerEndText}>You reached the end</Text>
              </View>
            ) : null
          }
        />
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
              <Text style={styles.calendarModalTitle}>Select Date Range</Text>
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
              <Text style={styles.modalTitle}>History Detail</Text>
              <Text style={styles.modalSubtitle}>
                {detailData ? formatDate(detailData.createdAt, true) : "Loading..."}
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
                  {detailData.kind === "delivery" ? "Delivery" : "Direct Sale"}
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

              {detailData.kind === "delivery" ? (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Delivery Result
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Successful:</Text>{" "}
                      {detailData.isSuccessful == null
                        ? "N/A"
                        : detailData.isSuccessful
                          ? "Yes"
                          : "No"}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>
                        Failure Reason:
                      </Text>{" "}
                      {detailData.failureReason || "N/A"}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Remark:</Text>{" "}
                      {detailData.remark || "N/A"}
                    </Text>
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailLineLabel}>Receiver:</Text>{" "}
                      {detailData.receiver
                        ? `${detailData.receiver.name}${detailData.receiver.position ? ` (${detailData.receiver.position})` : ""}`
                        : "N/A"}
                    </Text>
                    {detailData.receiver?.signatureUrl ? (
                      <TouchableOpacity
                        style={styles.linkButton}
                        onPress={() =>
                          void openUrl(
                            detailData.receiver?.signatureUrl || null,
                          )
                        }
                      >
                        <Text style={styles.linkButtonText}>
                          Open Signature
                        </Text>
                        <Ionicons
                          name="open-outline"
                          size={14}
                          color="#1E40AF"
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Tasks</Text>
                    {detailData.tasks.length === 0 ? (
                      <Text style={styles.detailMutedText}>
                        No tasks recorded.
                      </Text>
                    ) : (
                      detailData.tasks.map((task) => (
                        <View key={task.id} style={styles.detailListRow}>
                          <Text style={styles.detailListTitle}>
                            {task.type.replace(/_/g, " ")}
                          </Text>
                          <Text style={styles.detailListMeta}>
                            Outcome: {task.outcome || "N/A"}
                          </Text>
                          <Text style={styles.detailListMeta}>
                            Status: {task.currentStatus || "N/A"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Deposit Returns
                    </Text>
                    {detailData.depositReturns.length === 0 ? (
                      <Text style={styles.detailMutedText}>
                        No deposit returns in this report.
                      </Text>
                    ) : (
                      detailData.depositReturns.map((entry) => (
                        <View key={entry.id} style={styles.detailListRow}>
                          <Text style={styles.detailListTitle}>
                            {entry.label}
                          </Text>
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
                </>
              ) : (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Remark</Text>
                  <Text style={styles.detailLine}>
                    {detailData.remark || "N/A"}
                  </Text>
                </View>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Sale</Text>
                {detailSale ? (
                  <>
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
                        ? `${detailSale.payment.method} (AED ${formatAmount(detailSale.payment.amount)})`
                        : "Credit / Not captured"}
                    </Text>

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
