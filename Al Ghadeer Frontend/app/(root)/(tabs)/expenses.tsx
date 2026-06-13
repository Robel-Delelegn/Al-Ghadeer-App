import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import {
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/store/utils/alert";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

const EXPENSE_TEMPLATES = [
  { id: "fuel", label: "Fuel", icon: "flame-outline" as const },
  { id: "parking", label: "Parking", icon: "car-outline" as const },
  { id: "toll", label: "Toll Fee", icon: "card-outline" as const },
  {
    id: "maintenance",
    label: "Vehicle Maintenance",
    icon: "construct-outline" as const,
  },
  { id: "supplies", label: "Supplies", icon: "cube-outline" as const },
  {
    id: "other",
    label: "Other Expense",
    icon: "ellipsis-horizontal-outline" as const,
  },
];

type HistoryTab = "pending" | "paid" | "all";
type ApiObject = Record<string, unknown>;
type ExpenseDateValue = string | number | null;

interface ExpenseActor {
  id: string;
  name: string;
  email: string | null;
}

interface ExpenseAttachment {
  id: string;
  resourceId: string;
  name: string;
  type: string;
  url: string | null;
}

interface ExpenseItem {
  requestId: string;
  title: string | null;
  description: string | null;
  amount: number;
  date: ExpenseDateValue;
  status: string;
  paid: boolean;
  createdAt: ExpenseDateValue;
  approvedBy: ExpenseActor | null;
  approvedAt: ExpenseDateValue;
  paidBy: ExpenseActor | null;
  paidAt: ExpenseDateValue;
  attachments: ExpenseAttachment[];
}

const isApiObject = (value: unknown): value is ApiObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readFirst = (source: unknown, keys: string[]): unknown => {
  if (!isApiObject(source)) return undefined;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const value = source[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }

  return undefined;
};

const readFirstObject = (
  source: unknown,
  keys: string[],
): ApiObject | undefined => {
  const value = readFirst(source, keys);
  return isApiObject(value) ? value : undefined;
};

const coerceString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const unwrapDateLikeValue = (value: unknown): unknown => {
  if (!isApiObject(value)) return value;

  const seconds = readFirst(value, ["seconds", "_seconds"]);
  if (typeof seconds === "number" && Number.isFinite(seconds)) {
    return seconds;
  }

  return (
    readFirst(value, [
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

const coerceDateValue = (value: unknown): ExpenseDateValue => {
  let dateLike = value;
  for (let i = 0; i < 3; i += 1) {
    const unwrapped = unwrapDateLikeValue(dateLike);
    if (unwrapped === dateLike) break;
    dateLike = unwrapped;
  }

  if (dateLike instanceof Date) {
    return Number.isNaN(dateLike.getTime()) ? null : dateLike.toISOString();
  }
  if (typeof dateLike === "string") {
    const trimmed = dateLike.trim();
    return trimmed || null;
  }
  if (typeof dateLike === "number" && Number.isFinite(dateLike)) {
    return dateLike;
  }
  return null;
};

const coerceNumber = (value: unknown, fallback = 0): number => {
  if (isApiObject(value)) {
    const nested = readFirst(value, [
      "amount",
      "value",
      "total",
      "totalAmount",
      "total_amount",
    ]);
    if (nested !== undefined) {
      return coerceNumber(nested, fallback);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const direct = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(direct)) return direct;

    const numericText = value.replace(/[^\d.-]/g, "");
    const parsed = Number(numericText);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "paid"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "unpaid"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

const normalizeActor = (rawActor: unknown): ExpenseActor | null => {
  const actorName = coerceString(rawActor);
  if (actorName) {
    return {
      id: actorName,
      name: actorName,
      email: null,
    };
  }

  if (!isApiObject(rawActor)) return null;

  const nestedActor = readFirst(rawActor, [
    "user",
    "account",
    "admin",
    "staff",
    "employee",
    "approver",
    "payer",
  ]);
  if (nestedActor && nestedActor !== rawActor) {
    const normalizedNested = normalizeActor(nestedActor);
    if (normalizedNested) return normalizedNested;
  }

  const firstName = coerceString(
    readFirst(rawActor, ["firstName", "first_name"]),
  );
  const lastName = coerceString(readFirst(rawActor, ["lastName", "last_name"]));
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const email = coerceString(
    readFirst(rawActor, ["email", "emailAddress", "email_address"]),
  );
  const id =
    coerceString(readFirst(rawActor, ["id", "_id", "userId", "user_id"])) ||
    email ||
    combinedName;
  const name =
    coerceString(
      readFirst(rawActor, [
        "name",
        "fullName",
        "full_name",
        "displayName",
        "display_name",
        "username",
      ]),
    ) ||
    combinedName ||
    email ||
    id;

  if (!name && !email && !id) return null;

  return {
    id: id || name || email || "unknown",
    name: name || email || id || "Unknown",
    email,
  };
};

const normalizeExpenseAttachment = (
  rawAttachment: unknown,
  index: number,
): ExpenseAttachment | null => {
  const fallbackId = `attachment-${index + 1}`;
  if (typeof rawAttachment === "string") {
    return {
      id: fallbackId,
      resourceId: fallbackId,
      name: `Attachment ${index + 1}`,
      type: "file",
      url: resolveResourceUrl(rawAttachment),
    };
  }

  if (!isApiObject(rawAttachment)) return null;

  const id =
    coerceString(
      readFirst(rawAttachment, [
        "id",
        "_id",
        "attachmentId",
        "attachment_id",
        "resourceId",
        "resource_id",
      ]),
    ) || fallbackId;
  const resourceId =
    coerceString(readFirst(rawAttachment, ["resourceId", "resource_id"])) || id;
  const name =
    coerceString(
      readFirst(rawAttachment, [
        "name",
        "fileName",
        "file_name",
        "filename",
        "originalName",
        "original_name",
      ]),
    ) || `Attachment ${index + 1}`;
  const type =
    coerceString(
      readFirst(rawAttachment, [
        "type",
        "mimeType",
        "mime_type",
        "contentType",
        "content_type",
      ]),
    ) || "file";
  const url = coerceString(
    readFirst(rawAttachment, [
      "url",
      "href",
      "downloadUrl",
      "download_url",
      "publicUrl",
      "public_url",
      "resourceUrl",
      "resource_url",
    ]),
  );

  return {
    id,
    resourceId,
    name,
    type,
    url: resolveResourceUrl(url),
  };
};

const normalizeAttachmentList = (
  rawAttachments: unknown,
): ExpenseAttachment[] => {
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments
    : Array.isArray(readFirst(rawAttachments, ["data", "items", "results"]))
      ? (readFirst(rawAttachments, ["data", "items", "results"]) as unknown[])
      : [];

  return attachments
    .map((attachment, index) => normalizeExpenseAttachment(attachment, index))
    .filter((attachment): attachment is ExpenseAttachment => !!attachment);
};

const normalizeExpenseItem = (rawItem: unknown, index = 0): ExpenseItem => {
  const item = isApiObject(rawItem) ? rawItem : {};
  const approval = readFirstObject(item, [
    "approval",
    "approvalDetails",
    "approval_details",
    "approved",
  ]);
  const payment = readFirstObject(item, [
    "payment",
    "paymentDetails",
    "payment_details",
  ]);
  const approvedBy = normalizeActor(
    readFirst(item, [
      "approvedBy",
      "approved_by",
      "approvedByUser",
      "approved_by_user",
      "approver",
      "approverUser",
      "approver_user",
    ]) ??
      readFirst(approval, [
        "approvedBy",
        "approved_by",
        "by",
        "user",
        "approver",
        "approvedByUser",
        "approved_by_user",
      ]),
  );
  const approvedAt = coerceDateValue(
    readFirst(item, [
      "approvedAt",
      "approved_at",
      "approvalDate",
      "approval_date",
      "approvedDate",
      "approved_date",
    ]) ??
      readFirst(approval, [
        "approvedAt",
        "approved_at",
        "at",
        "date",
        "createdAt",
        "created_at",
      ]),
  );
  const paidBy = normalizeActor(
    readFirst(item, [
      "paidBy",
      "paid_by",
      "paidByUser",
      "paid_by_user",
      "payer",
      "payerUser",
      "payer_user",
    ]) ??
      readFirst(payment, [
        "paidBy",
        "paid_by",
        "by",
        "user",
        "payer",
        "paidByUser",
        "paid_by_user",
      ]),
  );
  const paidAt = coerceDateValue(
    readFirst(item, [
      "paidAt",
      "paid_at",
      "paymentDate",
      "payment_date",
      "paidDate",
      "paid_date",
    ]) ??
      readFirst(payment, [
        "paidAt",
        "paid_at",
        "at",
        "date",
        "createdAt",
        "created_at",
      ]),
  );
  const rawStatus = coerceString(
    readFirst(item, ["status", "state", "approvalStatus", "approval_status"]),
  );
  const paid = coerceBoolean(
    readFirst(item, ["paid", "isPaid", "is_paid"]),
    Boolean(paidAt || paidBy || normalizeStatus(rawStatus).includes("paid")),
  );
  const status = normalizeStatus(
    rawStatus ||
      (paid ? "paid" : approvedAt || approvedBy ? "approved" : "pending"),
  );
  const createdAt = coerceDateValue(
    readFirst(item, [
      "createdAt",
      "created_at",
      "created",
      "requestedAt",
      "requested_at",
      "submittedAt",
      "submitted_at",
    ]),
  );
  const requestId =
    coerceString(
      readFirst(item, [
        "requestId",
        "request_id",
        "id",
        "_id",
        "expenseId",
        "expense_id",
      ]),
    ) || `expense-${index + 1}-${coerceString(createdAt) || "unknown"}`;
  const rawAttachments = readFirst(item, [
    "attachments",
    "files",
    "documents",
    "resources",
    "expenseAttachments",
    "expense_attachments",
  ]);

  return {
    requestId,
    title:
      coerceString(
        readFirst(item, ["title", "name", "expenseTitle", "expense_title"]),
      ) || null,
    description:
      coerceString(
        readFirst(item, ["description", "note", "notes", "remarks"]),
      ) || null,
    amount: coerceNumber(readFirst(item, ["amount", "value", "total"]), 0),
    date: coerceDateValue(
      readFirst(item, [
        "date",
        "expenseDate",
        "expense_date",
        "requestDate",
        "request_date",
        "spentAt",
        "spent_at",
      ]),
    ),
    status,
    paid,
    createdAt,
    approvedBy,
    approvedAt,
    paidBy,
    paidAt,
    attachments: normalizeAttachmentList(rawAttachments),
  };
};

interface DraftAttachment {
  id: string;
  uri: string;
  imageDataUrl: string;
  originalName: string;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const guessMimeType = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
};

const getTodayDateInput = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseApiDate = (rawValue: unknown): Date | null => {
  let dateLike = rawValue;
  for (let i = 0; i < 3; i += 1) {
    const unwrapped = unwrapDateLikeValue(dateLike);
    if (unwrapped === dateLike) break;
    dateLike = unwrapped;
  }

  if (dateLike instanceof Date) {
    return Number.isNaN(dateLike.getTime()) ? null : dateLike;
  }

  if (typeof dateLike === "number" && Number.isFinite(dateLike)) {
    const timestamp =
      Math.abs(dateLike) < 1_000_000_000_000 ? dateLike * 1000 : dateLike;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const value = coerceString(dateLike);
  if (!value) return null;

  const candidates: string[] = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    candidates.push(`${value}T00:00:00`);
  }

  if (/^\d{10}$|^\d{13}$/.test(value)) {
    const timestamp = Number(value);
    const parsed = new Date(value.length === 10 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

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

  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = new Date(candidates[i]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const formatDate = (value?: unknown, includeTime = false): string => {
  if (!value) return "N/A";
  const date = parseApiDate(value);
  if (!date) return "N/A";

  if (includeTime) {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatAmount = (value?: unknown): string =>
  coerceNumber(value, 0).toFixed(2);

const formatActor = (actor?: ExpenseActor | null): string => {
  if (!actor) return "N/A";

  const name = actor.name.trim() || actor.email || actor.id;
  if (!name) return "N/A";
  if (actor.email && actor.email !== name) {
    return `${name} (${actor.email})`;
  }

  return name;
};

const normalizeStatus = (status?: string | null): string => {
  const normalized = (status || "").trim().toLowerCase();
  if (!normalized) return "pending";
  return normalized;
};

const getStatusStyle = (status: string, paid: boolean) => {
  if (paid) {
    return {
      bg: "#DCFCE7",
      text: "#166534",
      border: "#86EFAC",
      label: "Paid",
    };
  }

  const normalized = normalizeStatus(status);

  if (normalized.includes("reject") || normalized.includes("decline")) {
    return {
      bg: "#FEE2E2",
      text: "#B91C1C",
      border: "#FECACA",
      label: "Rejected",
    };
  }

  if (normalized.includes("approve")) {
    return {
      bg: "#DBEAFE",
      text: "#1D4ED8",
      border: "#BFDBFE",
      label: "Approved",
    };
  }

  return {
    bg: "#FEF3C7",
    text: "#92400E",
    border: "#FDE68A",
    label: "Pending",
  };
};

const isPendingExpense = (
  item: Pick<ExpenseItem, "paid" | "status">,
): boolean => {
  if (item.paid) return false;
  const status = normalizeStatus(item.status);
  return status.includes("pending") || status === "new";
};

const Expenses = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState<string>(() =>
    getTodayDateInput(),
  );
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [expenseHistory, setExpenseHistory] = useState<ExpenseItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HistoryTab>("pending");

  const [showDetail, setShowDetail] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);

  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  const formattedAmount = useMemo(
    () => amount.replace(/[^0-9.]/g, "").replace(/(\.\d*?)\./g, "$1"),
    [amount],
  );
  const numericAmount = Number(formattedAmount);
  const isFormValid =
    title.trim().length > 0 &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0;

  const filteredExpenses = useMemo(() => {
    if (activeTab === "all") return expenseHistory;
    if (activeTab === "paid") return expenseHistory.filter((item) => item.paid);

    return expenseHistory.filter((item) => isPendingExpense(item));
  }, [activeTab, expenseHistory]);

  const expenseStats = useMemo(() => {
    const pending = expenseHistory.filter((item) =>
      isPendingExpense(item),
    ).length;
    const paid = expenseHistory.filter((item) => item.paid).length;
    const total = expenseHistory.length;
    return { pending, paid, total };
  }, [expenseHistory]);

  const resetForm = () => {
    setSelectedTemplateId("");
    setTitle("");
    setAmount("");
    setExpenseDate(getTodayDateInput());
    setDescription("");
    setAttachments([]);
  };

  const convertImageToDataUrl = async (uri: string, mimeType: string) => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${mimeType};base64,${base64}`;
  };

  const fetchExpenseHistory = useCallback(
    async (isRefresh = false) => {
      if (!driverId) {
        setExpenseHistory([]);
        setApiError("Driver ID not available.");
        return;
      }

      try {
        setApiError(null);
        if (isRefresh) {
          setHistoryRefreshing(true);
        } else {
          setHistoryLoading(true);
        }

        const response = await authenticatedFetch(`${API_BASE_URL}/expenses`, {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        });

        const result = await parseApiResponseWithSoftError<unknown[]>(response);
        if (!result.ok) {
          setExpenseHistory([]);
          setApiError(result.error);
          return;
        }

        const normalized = result.data.map(normalizeExpenseItem);
        const sorted = [...normalized].sort((a, b) => {
          const left = parseApiDate(a.createdAt)?.getTime() ?? 0;
          const right = parseApiDate(b.createdAt)?.getTime() ?? 0;
          return right - left;
        });

        setExpenseHistory(sorted);
      } catch (error) {
        setExpenseHistory([]);
        setApiError(
          error instanceof Error ? error.message : "Could not load expenses.",
        );
      } finally {
        setHistoryLoading(false);
        setHistoryRefreshing(false);
      }
    },
    [driverId],
  );

  useEffect(() => {
    if (showHistory) {
      void fetchExpenseHistory(false);
    }
  }, [showHistory, fetchExpenseHistory]);

  const handleSelectTemplate = (templateId: string, templateLabel: string) => {
    setSelectedTemplateId(templateId);
    setTitle(templateLabel);
  };

  const pickAttachments = async () => {
    const remaining = 10 - attachments.length;
    if (remaining <= 0) {
      showWarningAlert(
        "Limit reached",
        "You can upload up to 10 attachments per request.",
      );
      return;
    }

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showWarningAlert(
          "Permission required",
          "Photo library permission is required to upload attachments.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const picked = result.assets.slice(0, remaining);
      const next: DraftAttachment[] = [];

      for (let i = 0; i < picked.length; i += 1) {
        const asset = picked[i];
        if (!asset.uri) continue;

        const mimeType = asset.mimeType || guessMimeType(asset.uri);
        const imageDataUrl = await convertImageToDataUrl(asset.uri, mimeType);
        const ext = MIME_TO_EXTENSION[mimeType] || "jpg";
        const fallbackName = `expense-${Date.now()}-${i + 1}.${ext}`;

        next.push({
          id: `${Date.now()}-${i}-${asset.uri}`,
          uri: asset.uri,
          imageDataUrl,
          originalName: asset.fileName || fallbackName,
        });
      }

      if (next.length === 0) {
        showErrorAlert("Attachment error", "No valid images were selected.");
        return;
      }

      setAttachments((prev) => [...prev, ...next]);
    } catch (error) {
      console.error("Error selecting attachments:", error);
      showErrorAlert("Attachment error", "Could not process selected images.");
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };

  const handleSubmitExpense = async () => {
    if (!driverId) {
      showErrorAlert(
        "Missing driver",
        "Driver information is not available right now.",
      );
      return;
    }

    if (!title.trim()) {
      showWarningAlert("Missing title", "Please enter an expense title.");
      return;
    }

    if (
      !formattedAmount ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      showWarningAlert("Invalid amount", "Amount must be greater than 0.");
      return;
    }

    const dateValue = expenseDate.trim();
    if (dateValue && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      showWarningAlert("Invalid date", "Date must be in YYYY-MM-DD format.");
      return;
    }

    try {
      setSubmitting(true);
      setApiError(null);

      const payload: {
        title: string;
        description?: string;
        amount: number;
        date?: string;
        attachments?: { imageDataUrl: string; originalName?: string }[];
      } = {
        title: title.trim(),
        amount: numericAmount,
      };

      const normalizedDescription = description.trim();
      if (normalizedDescription) {
        payload.description = normalizedDescription;
      }
      if (dateValue) {
        payload.date = dateValue;
      }
      if (attachments.length > 0) {
        payload.attachments = attachments.slice(0, 10).map((item) => ({
          imageDataUrl: item.imageDataUrl,
          originalName: item.originalName,
        }));
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/expenses`, {
        method: "POST",
        headers: {
          "X-Driver-Id": driverId,
        },
        body: JSON.stringify(payload),
      });

      const result = await parseApiResponseWithSoftError<unknown>(response);
      if (!result.ok) {
        setApiError(result.error);
        return;
      }

      const createdExpense = normalizeExpenseItem(result.data);
      setExpenseHistory((prev) => {
        const exists = prev.some(
          (item) => item.requestId === createdExpense.requestId,
        );
        if (exists) return prev;
        return [createdExpense, ...prev];
      });

      showSuccessAlert("Submitted", "Expense request created successfully.", [
        { text: "OK", onPress: resetForm },
      ]);
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Could not submit expense request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
  };

  const fetchExpenseDetail = useCallback(
    async (requestId: string) => {
      if (!driverId) {
        showErrorAlert(
          "Missing driver",
          "Driver information is not available.",
        );
        return;
      }

      setShowDetail(true);
      setSelectedExpense(null);
      setDetailError(null);
      setDetailLoading(true);

      try {
        const response = await authenticatedFetch(
          `${API_BASE_URL}/expenses/${requestId}`,
          {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          },
        );

        const result = await parseApiResponseWithSoftError<unknown>(response);
        if (!result.ok) {
          setDetailError(result.error);
          return;
        }

        setSelectedExpense(normalizeExpenseItem(result.data));
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "Could not load expense details.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [driverId],
  );

  const openAttachmentUrl = async (url: string | null) => {
    const normalizedUrl = resolveResourceUrl(url);
    if (!normalizedUrl) {
      showWarningAlert(
        "Unavailable",
        "No attachment URL is currently available.",
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(normalizedUrl);
      if (!supported) {
        showWarningAlert(
          "Cannot open",
          "This attachment URL cannot be opened on this device.",
        );
        return;
      }
      await Linking.openURL(normalizedUrl);
    } catch {
      showErrorAlert("Open failed", "Could not open the attachment URL.");
    }
  };

  const detailStatus = selectedExpense
    ? getStatusStyle(selectedExpense.status, selectedExpense.paid)
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ApiErrorText error={apiError} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Expenses</Text>
          <Text style={styles.headerSubtitle}>
            Create and track reimbursement requests
          </Text>
        </View>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={openHistory}
          activeOpacity={0.75}
        >
          <Ionicons name="time-outline" size={20} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Template</Text>
            <View style={styles.templateGrid}>
              {EXPENSE_TEMPLATES.map((template) => {
                const selected = selectedTemplateId === template.id;
                return (
                  <TouchableOpacity
                    key={template.id}
                    style={[
                      styles.templateChip,
                      selected && styles.templateChipSelected,
                    ]}
                    onPress={() =>
                      handleSelectTemplate(template.id, template.label)
                    }
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={template.icon}
                      size={16}
                      color={selected ? "#FFFFFF" : "#475569"}
                    />
                    <Text
                      style={[
                        styles.templateText,
                        selected && styles.templateTextSelected,
                      ]}
                    >
                      {template.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Fuel refill at station"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />
          </View>

          <View style={styles.rowSection}>
            <View style={[styles.section, styles.rowItem]}>
              <Text style={styles.sectionLabel}>Amount</Text>
              <View style={styles.amountInputWrap}>
                <Text style={styles.currency}>AED</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formattedAmount}
                  onChangeText={setAmount}
                />
              </View>
            </View>

            <View style={[styles.section, styles.rowItem]}>
              <View style={styles.dateHeader}>
                <Text style={styles.sectionLabel}>Date</Text>
                <TouchableOpacity
                  style={styles.todayChip}
                  onPress={() => setExpenseDate(getTodayDateInput())}
                  activeOpacity={0.8}
                >
                  <Text style={styles.todayChipText}>Today</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                value={expenseDate}
                onChangeText={setExpenseDate}
                maxLength={10}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.dateHint}>
                Pre-filled with today. You can change it anytime.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description (Optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Add details about this expense"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
              maxLength={800}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.attachmentHeader}>
              <Text style={styles.sectionLabel}>Attachments (Optional)</Text>
              <Text style={styles.attachmentCount}>
                {attachments.length}/10
              </Text>
            </View>

            {attachments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentRow}
              >
                {attachments.map((item) => (
                  <View key={item.id} style={styles.attachmentCard}>
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.attachmentImage}
                    />
                    <TouchableOpacity
                      style={styles.removeAttachmentButton}
                      onPress={() => removeAttachment(item.id)}
                      hitSlop={{ top: 8, right: 8, left: 8, bottom: 8 }}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {item.originalName}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyAttachmentBox}>
                <Ionicons name="images-outline" size={24} color="#94A3B8" />
                <Text style={styles.emptyAttachmentText}>
                  No attachments added
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.addAttachmentButton}
              onPress={pickAttachments}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#1E40AF" />
              <Text style={styles.addAttachmentText}>Add images</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!isFormValid || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitExpense}
              disabled={!isFormValid || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name="paper-plane-outline"
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={styles.submitText}>Submit Expense Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 18) + 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHistory(false)}
      >
        <View
          style={[
            styles.modalContainer,
            { paddingTop: Platform.OS === "ios" ? 20 : insets.top },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Expense History</Text>
              <Text style={styles.modalSubtitle}>
                {filteredExpenses.length} visible / {expenseStats.total} total
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowHistory(false)}
            >
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>Pending</Text>
              <Text style={styles.statChipValue}>{expenseStats.pending}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>Paid</Text>
              <Text style={styles.statChipValue}>{expenseStats.paid}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>Total</Text>
              <Text style={styles.statChipValue}>{expenseStats.total}</Text>
            </View>
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "pending" && styles.tabActive]}
              onPress={() => setActiveTab("pending")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "pending" && styles.tabTextActive,
                ]}
              >
                Pending
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "paid" && styles.tabActive]}
              onPress={() => setActiveTab("paid")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "paid" && styles.tabTextActive,
                ]}
              >
                Paid
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "all" && styles.tabActive]}
              onPress={() => setActiveTab("all")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "all" && styles.tabTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
          </View>

          <ApiErrorText error={apiError} className="px-6" />

          <ScrollView
            style={styles.historyList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={historyRefreshing}
                onRefresh={() => void fetchExpenseHistory(true)}
                tintColor="#1E40AF"
                colors={["#1E40AF"]}
              />
            }
          >
            {historyLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color="#1E40AF" />
              </View>
            ) : filteredExpenses.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
                </View>
                <Text style={styles.emptyTitle}>No expenses found</Text>
                <Text style={styles.emptySubtitle}>
                  Try another tab or submit a new expense request.
                </Text>
              </View>
            ) : (
              filteredExpenses.map((expense) => {
                const statusStyle = getStatusStyle(
                  expense.status,
                  expense.paid,
                );
                return (
                  <TouchableOpacity
                    key={expense.requestId}
                    style={styles.historyCard}
                    activeOpacity={0.8}
                    onPress={() => void fetchExpenseDetail(expense.requestId)}
                  >
                    <View style={styles.historyCardTop}>
                      <View style={styles.historyTitleWrap}>
                        <Text style={styles.historyTitle} numberOfLines={1}>
                          {expense.title || "Untitled expense"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: statusStyle.bg,
                            borderColor: statusStyle.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusStyle.text },
                          ]}
                        >
                          {statusStyle.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.historyAmount}>
                      AED {formatAmount(expense.amount)}
                    </Text>

                    <View style={styles.historyInfoRow}>
                      <Text style={styles.historyInfoText}>
                        Expense Date: {formatDate(expense.date, false)}
                      </Text>
                      <Text style={styles.historyInfoText}>
                        Created: {formatDate(expense.createdAt, true)}
                      </Text>
                    </View>

                    {expense.description ? (
                      <Text style={styles.historyDescription} numberOfLines={2}>
                        {expense.description}
                      </Text>
                    ) : null}

                    <View style={styles.historyFooterRow}>
                      <View style={styles.inlineMetaPill}>
                        <Ionicons
                          name="images-outline"
                          size={13}
                          color="#475569"
                        />
                        <Text style={styles.inlineMetaText}>
                          {expense.attachments.length} attachment
                          {expense.attachments.length === 1 ? "" : "s"}
                        </Text>
                      </View>

                      {expense.approvedBy ? (
                        <View style={styles.inlineMetaPill}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={13}
                            color="#1D4ED8"
                          />
                          <Text style={styles.inlineMetaText}>
                            Approved by {formatActor(expense.approvedBy)}
                          </Text>
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={styles.detailButton}
                        onPress={() =>
                          void fetchExpenseDetail(expense.requestId)
                        }
                      >
                        <Text style={styles.detailButtonText}>Details</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color="#1E40AF"
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
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
              <Text style={styles.modalTitle}>Expense Details</Text>
              <Text style={styles.modalSubtitle}>
                {selectedExpense?.title || "Loading..."}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDetail(false)}
            >
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#1E40AF" />
            </View>
          ) : detailError ? (
            <View style={styles.detailErrorWrap}>
              <ApiErrorText error={detailError} />
            </View>
          ) : selectedExpense ? (
            <ScrollView
              style={styles.historyList}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailSummaryCard}>
                <Text style={styles.detailAmount}>
                  AED {formatAmount(selectedExpense.amount)}
                </Text>
                {detailStatus ? (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: detailStatus.bg,
                        borderColor: detailStatus.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.statusText, { color: detailStatus.text }]}
                    >
                      {detailStatus.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Basic Info</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Title:</Text>{" "}
                  {selectedExpense.title || "Untitled expense"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Description:</Text>{" "}
                  {selectedExpense.description || "N/A"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Expense Date:</Text>{" "}
                  {formatDate(selectedExpense.date)}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Created At:</Text>{" "}
                  {formatDate(selectedExpense.createdAt, true)}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Approval</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Approved At:</Text>{" "}
                  {formatDate(selectedExpense.approvedAt, true)}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Approved By:</Text>{" "}
                  {formatActor(selectedExpense.approvedBy)}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Payment</Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Paid:</Text>{" "}
                  {selectedExpense.paid ? "Yes" : "No"}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Paid At:</Text>{" "}
                  {formatDate(selectedExpense.paidAt, true)}
                </Text>
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLineLabel}>Paid By:</Text>{" "}
                  {formatActor(selectedExpense.paidBy)}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Attachments</Text>
                {selectedExpense.attachments.length === 0 ? (
                  <Text style={styles.detailEmptyText}>
                    No attachments for this request.
                  </Text>
                ) : (
                  selectedExpense.attachments.map((attachment) => (
                    <View
                      key={attachment.id}
                      style={styles.attachmentDetailRow}
                    >
                      <View style={styles.attachmentDetailMeta}>
                        <Text
                          style={styles.attachmentDetailName}
                          numberOfLines={1}
                        >
                          {attachment.name}
                        </Text>
                        <Text style={styles.attachmentDetailType}>
                          {attachment.type || "image"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.detailButton,
                          !attachment.url && styles.detailButtonDisabled,
                        ]}
                        onPress={() => void openAttachmentUrl(attachment.url)}
                        disabled={!attachment.url}
                      >
                        <Text
                          style={[
                            styles.detailButtonText,
                            !attachment.url && styles.detailButtonTextDisabled,
                          ]}
                        >
                          Open
                        </Text>
                        <Ionicons
                          name="open-outline"
                          size={14}
                          color={attachment.url ? "#1E40AF" : "#94A3B8"}
                        />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <View style={{ height: Math.max(insets.bottom, 18) + 40 }} />
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptySubtitle}>No expense selected.</Text>
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
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 20,
  },
  rowSection: {
    flexDirection: "row",
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  todayChip: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  todayChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  dateHint: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748B",
  },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  templateChipSelected: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  templateText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  templateTextSelected: {
    color: "#FFFFFF",
  },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#0F172A",
  },
  amountInputWrap: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  currency: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.5,
  },
  descriptionInput: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  attachmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  attachmentCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  attachmentRow: {
    gap: 10,
    paddingBottom: 4,
  },
  attachmentCard: {
    width: 120,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    overflow: "hidden",
  },
  attachmentImage: {
    width: "100%",
    height: 90,
  },
  attachmentName: {
    fontSize: 11,
    color: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeAttachmentButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyAttachmentBox: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  emptyAttachmentText: {
    fontSize: 12,
    color: "#64748B",
  },
  addAttachmentButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  addAttachmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
  },
  actionSection: {
    marginTop: 6,
    marginBottom: 6,
  },
  submitButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  statChipLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  statChipValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 2,
    marginBottom: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 9,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#1E40AF",
  },
  historyList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  historyCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  historyCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  historyTitleWrap: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  historyMetaLine: {
    marginTop: 3,
    fontSize: 11,
    color: "#64748B",
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  historyAmount: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  historyInfoRow: {
    marginTop: 8,
    gap: 4,
  },
  historyInfoText: {
    fontSize: 12,
    color: "#475569",
  },
  historyDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  historyFooterRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  inlineMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineMetaText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "600",
  },
  detailButton: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailButtonDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  detailButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },
  detailButtonTextDisabled: {
    color: "#94A3B8",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  detailErrorWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  detailSummaryCard: {
    marginTop: 4,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.6,
  },
  detailSection: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 14,
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
    marginBottom: 6,
    lineHeight: 18,
  },
  detailLineLabel: {
    fontWeight: "700",
    color: "#0F172A",
  },
  detailEmptyText: {
    fontSize: 13,
    color: "#64748B",
  },
  attachmentDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 10,
    marginBottom: 8,
  },
  attachmentDetailMeta: {
    flex: 1,
  },
  attachmentDetailName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  attachmentDetailType: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
  },
});

export default Expenses;
