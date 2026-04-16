import type { DeliveryAddress, DeliveryCustomer } from "@/utils/deliveries";
import { resolveResourceUrl } from "@/utils/resources";

export type DriverHistoryKind = "scheduled_delivery" | "adhoc_delivery";

export interface DriverHistoryReceiver {
  name: string;
  position?: string;
  signatureUrl: string | null;
}

export interface DriverHistoryDepositReturn {
  id: string;
  type: "deposit" | "deposit_return";
  itemId: string;
  depositKind: "asset" | "bottle";
  quantity: number;
  unitPrice: number;
  label: string;
  imageUrl: string | null;
}

export interface DriverHistorySaleItem {
  id: string;
  itemId: string;
  itemType: "asset" | "retail" | "refill";
  label: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
}

export interface DriverHistoryInvoice {
  id: string;
  displayId: string;
  totalAmount: number;
  createdAt: string;
  isPaid: boolean;
  hasPendingPayment: boolean;
  remark: string | null;
}

export type DriverHistorySalePayment =
  | { method: "cash"; amount: number }
  | { method: "check"; amount: number }
  | { method: "wallet"; amount: number }
  | null;

export interface DriverHistorySale {
  saleId: string;
  items: DriverHistorySaleItem[];
  totals: {
    subtotal: number;
    vat: number;
    total: number;
  };
  payment: DriverHistorySalePayment;
  invoice: DriverHistoryInvoice | null;
}

export interface DriverHistoryDetail {
  kind: DriverHistoryKind;
  id: string;
  displayId: string | null;
  customer: DeliveryCustomer;
  address: DeliveryAddress;
  isSuccessful: boolean | null;
  failureReason: string | null;
  receiver: DriverHistoryReceiver | null;
  remark: string | null;
  createdAt: string;
  tasks: unknown[];
  depositReturns: DriverHistoryDepositReturn[];
  sale: DriverHistorySale | null;
}

export interface DriverHistoryListPayload {
  items: DriverHistoryDetail[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface DriverSaleInvoiceResponse {
  id: string;
  displayId: string;
  totalAmount: number;
  createdAt: string;
  isPaid: boolean;
  hasPendingPayment: boolean;
  remark: string | null;
}

const EMPTY_ADDRESS: DeliveryAddress = {
  location_id: "",
  label: null,
  street: null,
  building: null,
  flat: null,
  city: null,
  area: null,
  latitude: null,
  longitude: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableText = (value: unknown): string | null => {
  const text = toText(value);
  return text.length > 0 ? text : null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const normalizeKind = (value: unknown): DriverHistoryKind | null => {
  const kind = toText(value);
  if (kind === "scheduled_delivery" || kind === "adhoc_delivery") {
    return kind;
  }
  return null;
};

const normalizeCustomer = (value: unknown): DeliveryCustomer => {
  const record = isRecord(value) ? value : null;
  return {
    id: toText(record?.id),
    name: toText(record?.name),
    phone: toText(record?.phone),
    email: toNullableText(record?.email),
    requires_signature: Boolean(record?.requires_signature),
    requires_immediate_invoice: Boolean(record?.requires_immediate_invoice),
  };
};

const normalizeAddress = (value: unknown): DeliveryAddress => {
  const record = isRecord(value) ? value : null;
  if (!record) return EMPTY_ADDRESS;

  return {
    location_id: toText(record.location_id),
    label: toNullableText(record.label),
    street: toNullableText(record.street),
    building: toNullableText(record.building),
    flat: toNullableText(record.flat),
    city: toNullableText(record.city),
    area: toNullableText(record.area),
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
  };
};

const normalizeReceiver = (value: unknown): DriverHistoryReceiver | null => {
  const record = isRecord(value) ? value : null;
  const name = toText(record?.name);
  if (!record || !name) return null;

  return {
    name,
    ...(toText(record.position) ? { position: toText(record.position) } : {}),
    signatureUrl: resolveResourceUrl(toNullableText(record.signatureUrl)),
  };
};

const normalizeDepositReturn = (
  value: unknown,
): DriverHistoryDepositReturn | null => {
  const record = isRecord(value) ? value : null;
  const type = toText(record?.type);
  const depositKind = toText(record?.depositKind);
  const quantity = toNumber(record?.quantity);
  const unitPrice = toNumber(record?.unitPrice);

  if (
    !record ||
    (type !== "deposit" && type !== "deposit_return") ||
    (depositKind !== "asset" && depositKind !== "bottle") ||
    quantity === null ||
    unitPrice === null
  ) {
    return null;
  }

  return {
    id: toText(record.id),
    type,
    itemId: toText(record.itemId),
    depositKind,
    quantity,
    unitPrice,
    label: toText(record.label),
    imageUrl: resolveResourceUrl(toNullableText(record.imageUrl)),
  };
};

const normalizeSaleItem = (value: unknown): DriverHistorySaleItem | null => {
  const record = isRecord(value) ? value : null;
  const itemType = toText(record?.itemType);
  const quantity = toNumber(record?.quantity);
  const unitPrice = toNumber(record?.unitPrice);

  if (
    !record ||
    (itemType !== "asset" && itemType !== "retail" && itemType !== "refill") ||
    quantity === null ||
    unitPrice === null
  ) {
    return null;
  }

  return {
    id: toText(record.id),
    itemId: toText(record.itemId),
    itemType,
    label: toText(record.label),
    imageUrl: resolveResourceUrl(toNullableText(record.imageUrl)),
    quantity,
    unitPrice,
  };
};

const normalizeInvoice = (value: unknown): DriverHistoryInvoice | null => {
  const record = isRecord(value) ? value : null;
  const totalAmount = toNumber(record?.totalAmount);
  if (!record || totalAmount === null) return null;

  return {
    id: toText(record.id),
    displayId: toText(record.displayId),
    totalAmount,
    createdAt: toText(record.createdAt),
    isPaid: Boolean(record.isPaid),
    hasPendingPayment: Boolean(record.hasPendingPayment),
    remark: toNullableText(record.remark),
  };
};

const normalizeSalePayment = (value: unknown): DriverHistorySalePayment => {
  const record = isRecord(value) ? value : null;
  const method = toText(record?.method);
  const amount = toNumber(record?.amount);

  if (
    !record ||
    amount === null ||
    (method !== "cash" && method !== "check" && method !== "wallet")
  ) {
    return null;
  }

  return {
    method,
    amount,
  };
};

const normalizeSale = (value: unknown): DriverHistorySale | null => {
  const record = isRecord(value) ? value : null;
  const totals = isRecord(record?.totals) ? record.totals : null;
  const subtotal = toNumber(totals?.subtotal);
  const vat = toNumber(totals?.vat);
  const total = toNumber(totals?.total);

  if (
    !record ||
    !totals ||
    subtotal === null ||
    vat === null ||
    total === null
  ) {
    return null;
  }

  return {
    saleId: toText(record.saleId),
    items: Array.isArray(record.items)
      ? record.items
          .map((item) => normalizeSaleItem(item))
          .filter((item): item is DriverHistorySaleItem => item !== null)
      : [],
    totals: {
      subtotal,
      vat,
      total,
    },
    payment: normalizeSalePayment(record.payment),
    invoice: normalizeInvoice(record.invoice),
  };
};

export const normalizeDriverHistoryDetail = (
  value: unknown,
): DriverHistoryDetail | null => {
  const record = isRecord(value) ? value : null;
  const kind = normalizeKind(record?.kind);
  const id = toText(record?.id);

  if (!record || !kind || !id) return null;

  return {
    kind,
    id,
    displayId: toNullableText(record.displayId),
    customer: normalizeCustomer(record.customer),
    address: normalizeAddress(record.address),
    isSuccessful:
      typeof record.isSuccessful === "boolean" ? record.isSuccessful : null,
    failureReason: toNullableText(record.failureReason),
    receiver: normalizeReceiver(record.receiver),
    remark: toNullableText(record.remark),
    createdAt: toText(record.createdAt),
    tasks: Array.isArray(record.tasks) ? record.tasks : [],
    depositReturns: Array.isArray(record.depositReturns)
      ? record.depositReturns
          .map((item) => normalizeDepositReturn(item))
          .filter((item): item is DriverHistoryDepositReturn => item !== null)
      : [],
    sale: normalizeSale(record.sale),
  };
};

export const normalizeDeliveryConfirmationResponse = (
  value: unknown,
): DriverHistoryDetail | null => {
  return normalizeDriverHistoryDetail(value);
};

export const normalizeDriverHistoryListPayload = (
  value: unknown,
): DriverHistoryListPayload => {
  const record = isRecord(value) ? value : null;
  const items = Array.isArray(record?.items)
    ? record.items
        .map((item) => normalizeDriverHistoryDetail(item))
        .filter((item): item is DriverHistoryDetail => item !== null)
    : [];

  return {
    items,
    page: toPositiveInt(record?.page, 1),
    limit: toPositiveInt(record?.limit, 20),
    total: Math.max(0, Math.floor(toNumber(record?.total) ?? items.length)),
    hasMore: Boolean(record?.hasMore),
  };
};

const readKind = (
  value: Pick<DriverHistoryDetail, "kind"> | DriverHistoryKind,
): DriverHistoryKind => {
  return typeof value === "string" ? value : value.kind;
};

export const isScheduledDeliveryHistory = (
  value: Pick<DriverHistoryDetail, "kind"> | DriverHistoryKind,
): boolean => readKind(value) === "scheduled_delivery";

export const isAdhocDeliveryHistory = (
  value: Pick<DriverHistoryDetail, "kind"> | DriverHistoryKind,
): boolean => readKind(value) === "adhoc_delivery";

export const getDriverHistoryKindLabel = (kind: DriverHistoryKind): string => {
  return kind === "scheduled_delivery" ? "Delivery" : "Ad-hoc Sale";
};

export const getDriverHistorySaleId = (
  detail: DriverHistoryDetail | null | undefined,
): string | undefined => {
  const saleId = detail?.sale?.saleId?.trim();
  return saleId ? saleId : undefined;
};

export const getDriverHistoryInvoiceDisplayId = (
  detail: DriverHistoryDetail | null | undefined,
): string | undefined => {
  const displayId = detail?.sale?.invoice?.displayId?.trim();
  return displayId ? displayId : undefined;
};

export const getDriverHistoryPrimaryId = (
  detail: DriverHistoryDetail | null | undefined,
): string => {
  return (
    detail?.displayId?.trim() ||
    getDriverHistoryInvoiceDisplayId(detail) ||
    getDriverHistorySaleId(detail) ||
    detail?.id ||
    "N/A"
  );
};
