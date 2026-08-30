import type { Order } from "@/types/order";
import {
  isUniqueItemSignal,
  UNIQUE_ITEM_KIND,
  UNIQUE_ITEM_MOVEMENT_FROM_CUSTOMER,
  UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
} from "@/utils/uniqueItems";

export interface DeliveryAddress {
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

export interface DeliveryCustomer {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string;
  email: string | null;
  trn: string | null;
  requires_signature: boolean;
  requires_immediate_invoice: boolean;
}

export interface DeliveryStop {
  id: string;
  display_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  address: DeliveryAddress;
  instructions: string | null;
  route_id: string | null;
  route_name: string | null;
  driver_id: string | null;
  customer: DeliveryCustomer;
  earlierVisitsTodayCount: number;
  hasNewItems?: boolean;
  hasExactLocation: boolean;
  tasks: DeliveryTask[];
}

export type Delivery = DeliveryStop;

export interface DeliveryTaskItem {
  id: string;
  label: string;
  type: DeliverySaleItemType;
  unit: string | null;
  image_url: string | null;
  serial?: string | null;
  asset_category?: string | null;
  unique_item_category?: string | null;
}

export type DeliveryTaskLineKind = "sale" | "deposit" | "return";

export interface DeliveryTaskLine {
  id: string;
  itemId: string;
  kind: DeliveryTaskLineKind;
  item: DeliveryTaskItem;
  quantity: number;
  unit_price: number;
}

export interface DeliveryTaskCreditCollection {
  id: string;
  amount: number;
  remark: string | null;
}

export type DeliveryTask =
  | {
      type: "subscription";
      id: string;
      item_id: string;
      lines: DeliveryTaskLine[];
      earlierAttemptsTodayCount: number;
    }
  | {
      type: "order";
      id: string;
      order_id: string;
      lines: DeliveryTaskLine[];
    }
  | {
      type: "prepaid_order";
      id: string;
      order_id: string;
      invoice_id: string;
      lines: DeliveryTaskLine[];
      earlierAttemptsTodayCount: number;
    }
  | {
      type: "staff_order";
      id: string;
      staff_order_id: string;
      lines: DeliveryTaskLine[];
      creditCollections: DeliveryTaskCreditCollection[];
    };

type DeliveryTaskBucket =
  | "pay_on_delivery_orders"
  | "prepaid_orders"
  | "staff_orders"
  | "subscriptions";

type DeliveryTaskSuccessOutcome = "success";
type DeliveryTaskFailureOutcome = "failure";
type DeliveryTaskNotDoneOutcome = "not_done";

export interface DeliveryTaskOutcomes {
  pay_on_delivery_orders: Record<
    string,
    DeliveryTaskSuccessOutcome | DeliveryTaskFailureOutcome
  >;
  prepaid_orders: Record<
    string,
    DeliveryTaskSuccessOutcome | DeliveryTaskNotDoneOutcome
  >;
  staff_orders: Record<
    string,
    DeliveryTaskSuccessOutcome | DeliveryTaskFailureOutcome
  >;
  subscriptions: Record<
    string,
    DeliveryTaskSuccessOutcome | DeliveryTaskNotDoneOutcome
  >;
}

export interface ParsedDeliveryTask {
  key: string;
  id: string;
  referenceId: string | null;
  invoiceId: string | null;
  bucket: DeliveryTaskBucket;
  label: string;
  type: DeliveryTask["type"];
  earlierAttemptsTodayCount: number;
  lines: ParsedDeliveryTaskLine[];
  creditCollections: ParsedDeliveryTaskCreditCollection[];
  raw: unknown;
}

export interface ParsedDeliveryTaskLine {
  key: string;
  id: string;
  itemId: string;
  kind: string;
  label: string;
  itemType: DeliverySaleItemType;
  unit: string | null;
  imageUrl: string | null;
  serial: string | null;
  assetCategory: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  raw: unknown;
}

export interface ParsedDeliveryTaskCreditCollection {
  id: string;
  amount: number;
  remark: string | null;
  raw: unknown;
}

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableText = (value: unknown): string | null => {
  const text = toText(value);
  return text.length > 0 ? text : null;
};

const getCustomerDisplayName = (customer: DeliveryCustomer): string => {
  const record = customer as DeliveryCustomer & Record<string, unknown>;
  const explicitName = toText(record.name);
  if (explicitName) return explicitName;

  return [
    toText(record.firstName ?? record.first_name),
    toText(record.lastName ?? record.last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
};

const getCustomerTrn = (customer: DeliveryCustomer): string | null => {
  const record = customer as DeliveryCustomer & Record<string, unknown>;
  return (
    toNullableText(
      record.trn ??
        record.customerTrn ??
        record.customer_trn ??
        record.taxRegistrationNumber ??
        record.tax_registration_number,
    ) ?? null
  );
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
};

const addressPartsFromDeliveryAddress = (
  address: DeliveryAddress,
): string[] => {
  return [
    address.label,
    address.street,
    address.building ? `Building ${address.building}` : null,
    address.flat ? `Flat ${address.flat}` : null,
    address.area,
    address.city,
  ]
    .map((part) => toNullableText(part))
    .filter((part): part is string => Boolean(part));
};

export const formatDeliveryAddress = (
  address: DeliveryAddress | null | undefined,
): string => {
  if (!address) return "No address";
  const parts = addressPartsFromDeliveryAddress(address);
  if (parts.length > 0) return parts.join(", ");
  return "No address";
};

const normalizeItemType = (value: unknown): DeliverySaleItemType => {
  const text = toText(value).toLowerCase();
  if (isUniqueItemSignal(text)) return UNIQUE_ITEM_KIND;
  if (text.includes("refill")) return "refill";
  return "retail";
};

const normalizeTaskType = (value: unknown): DeliveryTask["type"] | null => {
  const normalized = toText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "subscription") return "subscription";
  if (normalized === "order") return "order";
  if (normalized === "prepaid_order") return "prepaid_order";
  if (normalized === "staff_order") return "staff_order";
  return null;
};

const normalizeTaskLineKind = (value: unknown): DeliveryTaskLineKind => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "deposit") return "deposit";
  if (normalized === "return") return "return";
  return "sale";
};

const isSaleTaskLine = (value: unknown): boolean => {
  return normalizeTaskLineKind(value) === "sale";
};

const parseDeliveryTaskLines = (
  task: Record<string, unknown>,
  taskKey: string,
): ParsedDeliveryTaskLine[] => {
  const lines = Array.isArray(task.lines) ? task.lines : [];
  const parsedLines: ParsedDeliveryTaskLine[] = [];

  lines.forEach((lineValue, index) => {
    const line = asObject(lineValue);
    if (!line) return;

    const item = asObject(line.item);
    const id =
      toText(line.id) ||
      toText(line.itemId) ||
      toText(line.item_id) ||
      `${taskKey}:line:${index}`;
    const itemId =
      toText(line.itemId) || toText(line.item_id) || toText(item?.id) || id;
    const label =
      pickFirstText(item || line, ["label", "name", "title"]) ||
      `Item ${index + 1}`;
    const serial =
      toNullableText(
        line.serial ??
          line.serialNumber ??
          line.serial_number ??
          line.assetSerial ??
          line.asset_serial ??
          item?.serial ??
          item?.serialNumber ??
          item?.serial_number ??
          item?.assetSerial ??
          item?.asset_serial,
      ) ?? null;
    const assetCategory =
      toNullableText(
        line.uniqueItemCategory ??
          line.unique_item_category ??
          line.assetCategory ??
          line.asset_category ??
          item?.uniqueItemCategory ??
          item?.unique_item_category ??
          item?.assetCategory ??
          item?.asset_category,
      ) ?? null;
    const quantity = Math.max(0, toNumber(line.quantity) ?? 0);
    const unitPrice = toMoney(
      line.unit_price ??
        line.unitPrice ??
        line.price_per_unit ??
        line.price ??
        0,
    );

    parsedLines.push({
      key: `${taskKey}:line:${itemId}:${index}`,
      id,
      itemId,
      kind: normalizeTaskLineKind(line.kind),
      label,
      itemType: normalizeItemType(
        line.item_type ?? line.itemType ?? item?.type,
      ),
      unit: toNullableText(line.unit ?? line.unit_name ?? item?.unit) ?? null,
      imageUrl:
        toNullableText(
          line.image_url ?? line.imageUrl ?? item?.image_url ?? item?.imageUrl,
        ) ?? null,
      serial,
      assetCategory,
      quantity,
      unitPrice,
      totalPrice: toMoney(quantity * unitPrice),
      raw: lineValue,
    });
  });

  return parsedLines;
};

const parseCreditCollections = (
  task: Record<string, unknown>,
): ParsedDeliveryTaskCreditCollection[] => {
  const creditCollections = Array.isArray(task.creditCollections)
    ? task.creditCollections
    : [];
  const parsedCollections: ParsedDeliveryTaskCreditCollection[] = [];

  creditCollections.forEach((entry, index) => {
    const record = asObject(entry);
    if (!record) return;

    parsedCollections.push({
      id: toText(record.id) || `credit-collection-${index}`,
      amount: toMoney(record.amount),
      remark: toNullableText(record.remark),
      raw: entry,
    });
  });

  return parsedCollections;
};

interface PlannedOrderProduct {
  id: string;
  item_id: string;
  name: string;
  quantity: number;
  price: number;
  unit: string | null;
  image_url: string | null;
  type: DeliverySaleItemType;
  category: string;
  asset_category?: string | null;
}

interface PlannedRentItem {
  id: string;
  item_id: string;
  name: string;
  category: "deposit";
  price: number;
  quantity: number;
  image_url: string;
  unit: string | null;
  serial?: string | null;
  asset_category?: string | null;
  in_truck: boolean;
  max_quantity?: number;
  deposit_action: "deposit" | "deposit_return";
  deposit_kind: "unique-item" | "bottle";
  action_source: "task";
  other_action_type:
    | "item-movement-from-customer"
    | "item-movement-to-customer"
    | "unique-item-movement-from-customer"
    | "unique-item-movement-to-customer";
  other_action_item_type: "unique-item" | "bottle";
}

const derivePlannedOrderProducts = (
  tasks: unknown[],
): { products: PlannedOrderProduct[]; totalAmount: number } => {
  const parsedTasks = parseDeliveryTasks(tasks);
  const productsByKey = new Map<string, PlannedOrderProduct>();

  parsedTasks.forEach((task) => {
    task.lines.forEach((line) => {
      if (!isSaleTaskLine(line.kind) || line.quantity <= 0) {
        return;
      }

      const key = `${line.itemType}:${line.itemId}`;
      const existing = productsByKey.get(key);
      if (existing) {
        existing.quantity += line.quantity;
        if (!existing.image_url && line.imageUrl) {
          existing.image_url = line.imageUrl;
        }
        if (!existing.unit && line.unit) {
          existing.unit = line.unit;
        }
        if (!existing.asset_category && line.assetCategory) {
          existing.asset_category = line.assetCategory;
        }
        if (existing.price <= 0 && line.unitPrice > 0) {
          existing.price = line.unitPrice;
        }
        return;
      }

      productsByKey.set(key, {
        id: key,
        item_id: line.itemId,
        name: line.label,
        quantity: line.quantity,
        price: line.unitPrice,
        unit: line.unit,
        image_url: line.imageUrl,
        type: line.itemType,
        category: line.itemType,
        asset_category: line.assetCategory,
      });
    });
  });

  const products = Array.from(productsByKey.values());
  const totalAmount = toMoney(
    products.reduce(
      (sum, product) => sum + (product.price || 0) * (product.quantity || 0),
      0,
    ),
  );

  return { products, totalAmount };
};

const toTaskDepositKind = (
  line: ParsedDeliveryTaskLine,
): "unique-item" | "bottle" => {
  return line.itemType === UNIQUE_ITEM_KIND ? UNIQUE_ITEM_KIND : "bottle";
};

const derivePlannedRentItems = (tasks: unknown[]): PlannedRentItem[] => {
  const parsedTasks = parseDeliveryTasks(tasks);
  const rentItemsByKey = new Map<string, PlannedRentItem>();

  parsedTasks.forEach((task) => {
    task.lines.forEach((line, index) => {
      if (line.kind !== "deposit" && line.kind !== "return") {
        return;
      }

      const quantity = Math.max(0, Math.floor(line.quantity || 0));
      if (quantity <= 0) {
        return;
      }

      const depositAction =
        line.kind === "return" ? "deposit_return" : "deposit";
      const depositKind = toTaskDepositKind(line);
      const key = `${task.id}:${line.id}:${line.itemId}:${index}`;

      rentItemsByKey.set(key, {
        id: key,
        item_id: line.itemId,
        name: line.label,
        category: "deposit",
        price: line.unitPrice,
        quantity,
        image_url: line.imageUrl || "",
        unit: line.unit,
        serial: line.serial,
        asset_category: line.assetCategory,
        in_truck: true,
        max_quantity: quantity,
        deposit_action: depositAction,
        deposit_kind: depositKind,
        action_source: "task",
        other_action_type:
          depositKind === UNIQUE_ITEM_KIND
            ? depositAction === "deposit"
              ? UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER
              : UNIQUE_ITEM_MOVEMENT_FROM_CUSTOMER
            : depositAction === "deposit"
              ? "item-movement-to-customer"
              : "item-movement-from-customer",
        other_action_item_type: depositKind,
      });
    });
  });

  return Array.from(rentItemsByKey.values());
};

export const mapDeliveryToOrder = (delivery: DeliveryStop): Order => {
  const { products, totalAmount } = derivePlannedOrderProducts(delivery.tasks);
  const rentItems = derivePlannedRentItems(delivery.tasks);
  const hasNewItems = delivery.hasNewItems !== false;

  return {
    id: delivery.id,
    order_number: delivery.display_id || delivery.id,
    display_id: delivery.display_id || delivery.id,
    date: delivery.date,
    start_time: delivery.start_time,
    end_time: delivery.end_time,
    status: hasNewItems ? "assigned" : "delivered",
    customer_id: delivery.customer.id,
    customer_site_id: delivery.address.location_id,
    customer_name: getCustomerDisplayName(delivery.customer),
    customer_phone: delivery.customer.phone,
    customer_email: delivery.customer.email ?? undefined,
    customer_trn: getCustomerTrn(delivery.customer) ?? undefined,
    customer_address: formatDeliveryAddress(delivery.address),
    latitude: delivery.address.latitude ?? undefined,
    longitude: delivery.address.longitude ?? undefined,
    delivery_instructions: delivery.instructions ?? undefined,
    delivery_zone: delivery.route_name || delivery.address.area || undefined,
    route_id: delivery.route_id ?? undefined,
    route_name: delivery.route_name ?? undefined,
    driver_id: delivery.driver_id ?? undefined,
    earlier_visits_today_count: Math.max(
      0,
      Math.floor(delivery.earlierVisitsTodayCount || 0),
    ),
    has_new_items: hasNewItems,
    has_exact_location: Boolean(delivery.hasExactLocation),
    requires_signature: Boolean(delivery.customer.requires_signature),
    requires_immediate_invoice: Boolean(
      delivery.customer.requires_immediate_invoice,
    ),
    tasks: Array.isArray(delivery.tasks) ? delivery.tasks : [],
    ...(products.length > 0 ? { products } : {}),
    ...(rentItems.length > 0 ? { rent_items: rentItems } : {}),
    total_amount: totalAmount,
  };
};

const detectBucketFromType = (
  taskType: DeliveryTask["type"] | null,
): DeliveryTaskBucket | null => {
  if (taskType === "prepaid_order") return "prepaid_orders";
  if (taskType === "staff_order") return "staff_orders";
  if (taskType === "subscription") return "subscriptions";
  if (taskType === "order") return "pay_on_delivery_orders";
  return null;
};

const pickFirstText = (
  record: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const candidate = toText(record[key]);
    if (candidate) return candidate;
  }
  return null;
};

const pickFromNested = (
  task: Record<string, unknown>,
  containerKeys: string[],
  idKeys: string[],
): string | null => {
  for (const containerKey of containerKeys) {
    const nested = asObject(task[containerKey]);
    if (!nested) continue;
    const candidate = pickFirstText(nested, idKeys);
    if (candidate) return candidate;
  }
  return null;
};

const getTaskIdForBucket = (
  task: Record<string, unknown>,
  fallbackReferenceId: string | null,
): string | null => {
  return toText(task.id) || fallbackReferenceId || null;
};

const getTaskReferenceId = (
  task: Record<string, unknown>,
  taskType: DeliveryTask["type"] | null,
): string | null => {
  if (taskType === "order") {
    return (
      pickFirstText(task, [
        "order_id",
        "orderId",
        "pay_on_delivery_order_id",
        "payOnDeliveryOrderId",
      ]) ||
      pickFromNested(
        task,
        ["order", "task", "payload", "data"],
        ["order_id", "orderId", "id"],
      ) ||
      null
    );
  }

  if (taskType === "prepaid_order") {
    return (
      pickFirstText(task, [
        "order_id",
        "orderId",
        "prepaid_order_id",
        "prepaidOrderId",
      ]) ||
      pickFromNested(
        task,
        ["order", "prepaidOrder", "prepaid_order", "task", "payload", "data"],
        ["order_id", "orderId", "prepaid_order_id", "prepaidOrderId", "id"],
      ) ||
      null
    );
  }

  if (taskType === "staff_order") {
    return (
      pickFirstText(task, ["staff_order_id", "staffOrderId"]) ||
      pickFromNested(
        task,
        ["staffOrder", "staff_order", "task", "payload", "data"],
        ["staff_order_id", "staffOrderId", "id"],
      ) ||
      null
    );
  }

  if (taskType === "subscription") {
    return (
      pickFirstText(task, ["item_id", "itemId"]) ||
      pickFromNested(
        task,
        ["item", "subscription", "task", "payload", "data"],
        ["item_id", "itemId", "id"],
      ) ||
      null
    );
  }

  return (
    pickFirstText(task, [
      "order_id",
      "orderId",
      "staff_order_id",
      "staffOrderId",
      "item_id",
      "itemId",
    ]) || null
  );
};

const getTaskInvoiceId = (
  task: Record<string, unknown>,
  taskType: DeliveryTask["type"] | null,
): string | null => {
  if (taskType !== "prepaid_order") return null;
  return (
    pickFirstText(task, ["invoice_id", "invoiceId"]) ||
    pickFromNested(
      task,
      ["invoice", "task", "payload", "data"],
      ["invoice_id", "invoiceId", "id"],
    ) ||
    null
  );
};

const getTaskLabel = (
  task: Record<string, unknown>,
  fallbackReferenceId: string | null,
  fallbackBucket: DeliveryTaskBucket,
  lines: ParsedDeliveryTaskLine[],
): string => {
  const explicit =
    toText(task.label) ||
    toText(task.name) ||
    toText(task.title) ||
    toText(task.display_id) ||
    toText(task.displayId);

  if (explicit) return explicit;

  if (lines.length === 1) {
    return lines[0].label;
  }
  if (lines.length > 1) {
    return `${lines[0].label} +${lines.length - 1} more`;
  }

  if (fallbackBucket === "prepaid_orders") {
    return `Prepaid Order ${fallbackReferenceId || "Task"}`;
  }
  if (fallbackBucket === "staff_orders") {
    return `Staff Order ${fallbackReferenceId || "Task"}`;
  }
  if (fallbackBucket === "subscriptions") {
    return `Subscription ${fallbackReferenceId || "Task"}`;
  }
  return `Order ${fallbackReferenceId || "Task"}`;
};

export const parseDeliveryTasks = (
  tasks: DeliveryTask[] | unknown[],
): ParsedDeliveryTask[] => {
  if (!Array.isArray(tasks)) return [];

  const parsed: ParsedDeliveryTask[] = [];
  tasks.forEach((taskValue, index) => {
    const task = asObject(taskValue);
    if (!task) return;

    const taskType = normalizeTaskType(task.type);
    const bucket = detectBucketFromType(taskType);
    if (!taskType || !bucket) return;

    const referenceId = getTaskReferenceId(task, taskType);
    const taskId = getTaskIdForBucket(task, referenceId);
    if (!taskId) return;
    const lines = parseDeliveryTaskLines(task, `${bucket}:${taskId}:${index}`);
    const creditCollections = parseCreditCollections(task);

    parsed.push({
      key: `${bucket}:${taskId}:${index}`,
      id: taskId,
      referenceId,
      invoiceId: getTaskInvoiceId(task, taskType),
      bucket,
      label: getTaskLabel(task, referenceId, bucket, lines),
      type: taskType,
      earlierAttemptsTodayCount: Math.max(
        0,
        Math.floor(
          toNumber(
            task.earlierAttemptsTodayCount ?? task.earlier_attempts_today_count,
          ) ?? 0,
        ),
      ),
      lines,
      creditCollections,
      raw: taskValue,
    });
  });

  return parsed;
};

const emptyTaskOutcomes = (): DeliveryTaskOutcomes => ({
  pay_on_delivery_orders: {},
  prepaid_orders: {},
  staff_orders: {},
  subscriptions: {},
});

const getDefaultOutcome = (
  bucket: DeliveryTaskBucket,
  status: "success" | "failure",
) => {
  if (status === "success") return "success";
  if (bucket === "prepaid_orders" || bucket === "subscriptions") {
    return "not_done";
  }
  return "failure";
};

export const buildDeliveryTaskOutcomes = (
  tasks: unknown[],
  status: "success" | "failure",
): DeliveryTaskOutcomes => {
  const outcomes = emptyTaskOutcomes();
  const parsedTasks = parseDeliveryTasks(tasks);

  if (Array.isArray(tasks) && tasks.length > parsedTasks.length) {
    console.warn("[deliveries] Some tasks could not be parsed for outcomes.", {
      status,
      totalTasks: tasks.length,
      parsedTasks: parsedTasks.length,
    });
  }

  parsedTasks.forEach((task) => {
    const bucket = task.bucket;
    const outcome = getDefaultOutcome(bucket, status);

    if (bucket === "pay_on_delivery_orders") {
      outcomes.pay_on_delivery_orders[task.id] =
        outcome === "not_done" ? "failure" : outcome;
      return;
    }

    if (bucket === "staff_orders") {
      outcomes.staff_orders[task.id] =
        outcome === "not_done" ? "failure" : outcome;
      return;
    }

    if (bucket === "prepaid_orders") {
      outcomes.prepaid_orders[task.id] =
        outcome === "failure" ? "not_done" : outcome;
      return;
    }

    // Server contract: tasks.subscriptions must be empty for failure submissions.
    if (status === "failure") {
      return;
    }

    const subscriptionOutcomeId = task.referenceId || task.id;
    outcomes.subscriptions[subscriptionOutcomeId] =
      outcome === "failure" ? "not_done" : outcome;
  });

  return outcomes;
};

export type ActualDeliverySaleItem = {
  itemId: string;
  itemType: DeliverySaleItemType;
  quantity: number;
};

export type ActualDeliveryDepositReturn = {
  type: "deposit" | "deposit_return";
  depositKind: "unique-item" | "bottle";
  itemId: string;
  quantity: number;
};

const getTaskLineActualKey = (line: ParsedDeliveryTaskLine): string | null => {
  if (line.quantity <= 0) return null;

  if (line.kind === "sale") {
    return `sale:${line.itemType}:${line.itemId}`;
  }

  if (line.kind === "deposit" || line.kind === "return") {
    const action = line.kind === "return" ? "deposit_return" : "deposit";
    return `${action}:${toTaskDepositKind(line)}:${line.itemId}`;
  }

  return null;
};

const addActualQuantity = (
  quantities: Map<string, number>,
  key: string,
  quantity: number,
) => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  if (safeQuantity <= 0) return;
  quantities.set(key, (quantities.get(key) || 0) + safeQuantity);
};

const buildPlannedTaskQuantityMap = (
  tasks: ParsedDeliveryTask[],
): Map<string, number> => {
  const quantities = new Map<string, number>();

  tasks.forEach((task) => {
    task.lines.forEach((line) => {
      const key = getTaskLineActualKey(line);
      if (!key) return;
      addActualQuantity(quantities, key, line.quantity);
    });
  });

  return quantities;
};

const buildActualDeliveryQuantityMap = (
  saleItems: ActualDeliverySaleItem[],
  depositsReturns: ActualDeliveryDepositReturn[],
): Map<string, number> => {
  const quantities = new Map<string, number>();

  saleItems.forEach((item) => {
    const itemId = toText(item.itemId);
    if (!itemId) return;
    addActualQuantity(
      quantities,
      `sale:${normalizeItemType(item.itemType)}:${itemId}`,
      item.quantity,
    );
  });

  depositsReturns.forEach((entry) => {
    const itemId = toText(entry.itemId);
    if (!itemId) return;
    addActualQuantity(
      quantities,
      `${entry.type}:${entry.depositKind}:${itemId}`,
      entry.quantity,
    );
  });

  return quantities;
};

const quantityMapsMatch = (
  planned: Map<string, number>,
  actual: Map<string, number>,
): boolean => {
  if (planned.size !== actual.size) return false;

  for (const [key, plannedQuantity] of planned.entries()) {
    const actualQuantity = actual.get(key);
    if (actualQuantity === undefined) return false;
    if (Math.abs(plannedQuantity - actualQuantity) > 0.0001) return false;
  }

  return true;
};

const getAdjustedSuccessOutcome = (
  bucket: DeliveryTaskBucket,
):
  | DeliveryTaskSuccessOutcome
  | DeliveryTaskFailureOutcome
  | DeliveryTaskNotDoneOutcome => {
  if (bucket === "prepaid_orders" || bucket === "subscriptions") {
    return "not_done";
  }

  return "failure";
};

export const buildDeliveryTaskOutcomesForActualDelivery = (
  tasks: unknown[],
  saleItems: ActualDeliverySaleItem[],
  depositsReturns: ActualDeliveryDepositReturn[],
): DeliveryTaskOutcomes => {
  const parsedTasks = parseDeliveryTasks(tasks);
  const plannedQuantities = buildPlannedTaskQuantityMap(parsedTasks);
  const actualQuantities = buildActualDeliveryQuantityMap(
    saleItems,
    depositsReturns,
  );
  const matchesOriginalPlan = quantityMapsMatch(
    plannedQuantities,
    actualQuantities,
  );

  if (matchesOriginalPlan) {
    return buildDeliveryTaskOutcomes(tasks, "success");
  }

  const outcomes = emptyTaskOutcomes();

  parsedTasks.forEach((task) => {
    const outcome = getAdjustedSuccessOutcome(task.bucket);

    if (task.bucket === "pay_on_delivery_orders") {
      outcomes.pay_on_delivery_orders[task.id] =
        outcome === "not_done" ? "failure" : outcome;
      return;
    }

    if (task.bucket === "staff_orders") {
      outcomes.staff_orders[task.id] =
        outcome === "not_done" ? "failure" : outcome;
      return;
    }

    if (task.bucket === "prepaid_orders") {
      outcomes.prepaid_orders[task.id] =
        outcome === "failure" ? "not_done" : outcome;
      return;
    }

    const subscriptionOutcomeId = task.referenceId || task.id;
    outcomes.subscriptions[subscriptionOutcomeId] =
      outcome === "failure" ? "not_done" : outcome;
  });

  return outcomes;
};

export const getDeliveryEarlierAttemptsTodayCount = (
  order?: Pick<Order, "earlier_visits_today_count"> | null,
): number => {
  const rawValue = order?.earlier_visits_today_count;
  const numericValue =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number(rawValue)
        : 0;

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericValue));
};

export type DeliverySaleItemType = "unique-item" | "retail" | "refill";

export const toDeliverySaleItemType = (value: unknown): DeliverySaleItemType =>
  normalizeItemType(value);

export const toMoney = (value: unknown): number => {
  const parsed = toNumber(value);
  if (parsed === null) return 0;
  return Number(parsed.toFixed(2));
};
