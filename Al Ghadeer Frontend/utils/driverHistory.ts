import type { DeliveryAddress, DeliveryCustomer } from "@/utils/deliveries";
import { resolveResourceUrl } from "@/utils/resources";
import {
  isUniqueItemDepositKind,
  isUniqueItemSignal,
  UNIQUE_ITEM_KIND,
} from "@/utils/uniqueItems";

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
  depositKind: "unique-item" | "bottle";
  quantity: number;
  unitPrice: number;
  label: string;
  assetCategory: string | null;
  imageUrl: string | null;
}

export interface DriverHistorySaleItem {
  id: string;
  itemId: string;
  itemType: "unique-item" | "retail" | "refill";
  label: string;
  assetCategory: string | null;
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
  | { method: "credit"; amount: number }
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

export interface DriverHistoryCreditCollection {
  id: string;
  amount: number;
  remark: string | null;
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
  creditCollections: DriverHistoryCreditCollection[];
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
  const firstName = toText(record?.firstName ?? record?.first_name);
  const lastName = toText(record?.lastName ?? record?.last_name);
  const displayName =
    toText(record?.name) || [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: toText(record?.id),
    name: displayName,
    firstName: firstName || null,
    lastName: lastName || null,
    phone: toText(record?.phone),
    email: toNullableText(record?.email),
    trn:
      toNullableText(
        record?.trn ??
          record?.customerTrn ??
          record?.customer_trn ??
          record?.taxRegistrationNumber ??
          record?.tax_registration_number,
      ) ?? null,
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
  const item = isRecord(record?.item)
    ? record.item
    : isRecord(record?.product)
      ? record.product
      : null;
  const type = toText(record?.type);
  const rawDepositKind = toText(record?.depositKind);
  const depositKind = isUniqueItemDepositKind(rawDepositKind)
    ? UNIQUE_ITEM_KIND
    : rawDepositKind;
  const quantity = toNumber(record?.quantity);
  const unitPrice = toNumber(record?.unitPrice);

  if (
    !record ||
    (type !== "deposit" && type !== "deposit_return") ||
    (depositKind !== UNIQUE_ITEM_KIND && depositKind !== "bottle") ||
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
    label: toText(record.label) || toText(record.name) || toText(item?.label),
    assetCategory:
      toNullableText(record.uniqueItemCategory) ??
      toNullableText(record.unique_item_category) ??
      toNullableText(record.assetCategory) ??
      toNullableText(record.asset_category) ??
      toNullableText(record.category) ??
      toNullableText(item?.uniqueItemCategory) ??
      toNullableText(item?.unique_item_category) ??
      toNullableText(item?.assetCategory) ??
      toNullableText(item?.asset_category) ??
      toNullableText(item?.category),
    imageUrl: resolveResourceUrl(toNullableText(record.imageUrl)),
  };
};

const normalizeSaleItem = (value: unknown): DriverHistorySaleItem | null => {
  const record = isRecord(value) ? value : null;
  const item = isRecord(record?.item)
    ? record.item
    : isRecord(record?.product)
      ? record.product
      : null;
  const rawItemType = toText(record?.itemType);
  const itemType = isUniqueItemSignal(rawItemType)
    ? UNIQUE_ITEM_KIND
    : rawItemType;
  const quantity = toNumber(record?.quantity);
  const unitPrice = toNumber(record?.unitPrice);

  if (
    !record ||
    (itemType !== UNIQUE_ITEM_KIND &&
      itemType !== "retail" &&
      itemType !== "refill") ||
    quantity === null ||
    unitPrice === null
  ) {
    return null;
  }

  return {
    id: toText(record.id),
    itemId: toText(record.itemId),
    itemType,
    label: toText(record.label) || toText(record.name) || toText(item?.label),
    assetCategory:
      toNullableText(record.uniqueItemCategory) ??
      toNullableText(record.unique_item_category) ??
      toNullableText(record.assetCategory) ??
      toNullableText(record.asset_category) ??
      toNullableText(record.category) ??
      toNullableText(item?.uniqueItemCategory) ??
      toNullableText(item?.unique_item_category) ??
      toNullableText(item?.assetCategory) ??
      toNullableText(item?.asset_category) ??
      toNullableText(item?.category),
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

const normalizeSalePaymentMethod = (
  value: unknown,
): NonNullable<DriverHistorySalePayment>["method"] | null => {
  const method = toText(value).toLowerCase();
  if (method === "cash") return "cash";
  if (method === "check" || method === "cheque") return "check";
  if (method === "wallet") return "wallet";
  if (
    method === "credit" ||
    method === "invoice" ||
    method === "credit_invoice"
  ) {
    return "credit";
  }
  return null;
};

const normalizeSalePayment = (
  value: unknown,
  fallbackAmount: number | null = null,
): DriverHistorySalePayment => {
  const record = isRecord(value) ? value : null;
  const method = normalizeSalePaymentMethod(
    record ? (record.method ?? record.payment_method) : value,
  );
  const amount = toNumber(record?.amount) ?? fallbackAmount;

  if (!method || amount === null) {
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

  const invoice = normalizeInvoice(record.invoice);
  const payment =
    normalizeSalePayment(
      record.payment ?? record.paymentMethod ?? record.payment_method,
      total,
    ) ?? (invoice ? { method: "credit" as const, amount: total } : null);

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
    payment,
    invoice,
  };
};

const normalizeCreditCollection = (
  value: unknown,
  index: number,
): DriverHistoryCreditCollection | null => {
  const record = isRecord(value) ? value : null;
  const amount = toNumber(record?.amount);

  if (!record || amount === null) {
    return null;
  }

  return {
    id: toText(record.id) || `credit-collection-${index}`,
    amount,
    remark: toNullableText(record.remark),
  };
};

export const normalizeDriverHistoryDetail = (
  value: unknown,
): DriverHistoryDetail | null => {
  const record = isRecord(value) ? value : null;
  const kind = normalizeKind(record?.kind);
  const id = toText(record?.id);

  if (!record || !kind || !id) return null;

  const creditCollectionSource =
    record.creditCollections ??
    record.credit_collections ??
    record.cashCollections ??
    record.cash_collections;

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
    creditCollections: Array.isArray(creditCollectionSource)
      ? creditCollectionSource
          .map((item, index) => normalizeCreditCollection(item, index))
          .filter(
            (item): item is DriverHistoryCreditCollection => item !== null,
          )
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
