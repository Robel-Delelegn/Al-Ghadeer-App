import type { Order } from "@/types/order";

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
  phone: string;
  email: string | null;
  requires_signature: boolean;
  requires_immediate_invoice: boolean;
}

export interface DeliveryStop {
  id: string;
  display_id: string;
  date: string;
  address: DeliveryAddress;
  instructions: string | null;
  route_id: string | null;
  route_name: string | null;
  driver_id: string | null;
  customer: DeliveryCustomer;
  earlierVisitsTodayCount: number;
  hasNewItems: boolean;
  hasExactLocation: boolean;
  tasks: unknown[];
}

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
  bucket: DeliveryTaskBucket;
  label: string;
  raw: unknown;
}

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

const asObject = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
};

const addressPartsFromDeliveryAddress = (address: DeliveryAddress): string[] => {
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

export const mapDeliveryToOrder = (delivery: DeliveryStop): Order => {
  return {
    id: delivery.id,
    order_number: delivery.display_id || delivery.id,
    display_id: delivery.display_id || delivery.id,
    date: delivery.date,
    status: "assigned",
    customer_id: delivery.customer.id,
    customer_site_id: delivery.address.location_id,
    customer_name: delivery.customer.name,
    customer_phone: delivery.customer.phone,
    customer_email: delivery.customer.email ?? undefined,
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
    has_new_items: Boolean(delivery.hasNewItems),
    has_exact_location: Boolean(delivery.hasExactLocation),
    requires_signature: Boolean(delivery.customer.requires_signature),
    requires_immediate_invoice: Boolean(
      delivery.customer.requires_immediate_invoice,
    ),
    tasks: Array.isArray(delivery.tasks) ? delivery.tasks : [],
    total_amount: 0,
  };
};

const detectBucketFromType = (
  typeText: string,
): DeliveryTaskBucket | null => {
  const normalized = typeText.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;

  if (normalized.includes("prepaid")) return "prepaid_orders";
  if (normalized.includes("staff")) return "staff_orders";
  if (normalized.includes("subscription")) return "subscriptions";
  if (
    normalized.includes("pay_on_delivery") ||
    normalized === "order" ||
    normalized.includes("order")
  ) {
    return "pay_on_delivery_orders";
  }

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
  bucket: DeliveryTaskBucket,
): string | null => {
  if (bucket === "pay_on_delivery_orders") {
    return (
      pickFirstText(task, [
        "orderId",
        "order_id",
        "payOnDeliveryOrderId",
        "pay_on_delivery_order_id",
      ]) ||
      pickFromNested(task, ["order", "task", "payload", "data"], [
        "orderId",
        "order_id",
        "id",
      ]) ||
      toText(task.id) ||
      null
    );
  }

  if (bucket === "prepaid_orders") {
    return (
      pickFirstText(task, [
        "prepaidOrderId",
        "prepaid_order_id",
        "orderId",
        "order_id",
      ]) ||
      pickFromNested(
        task,
        ["prepaidOrder", "prepaid_order", "order", "task", "payload", "data"],
        ["prepaidOrderId", "prepaid_order_id", "orderId", "order_id", "id"],
      ) ||
      toText(task.id) ||
      null
    );
  }

  if (bucket === "staff_orders") {
    return (
      pickFirstText(task, ["staffOrderId", "staff_order_id", "orderId", "order_id"]) ||
      pickFromNested(
        task,
        ["staffOrder", "staff_order", "order", "task", "payload", "data"],
        ["staffOrderId", "staff_order_id", "orderId", "order_id", "id"],
      ) ||
      toText(task.id) ||
      null
    );
  }

  return (
    pickFirstText(task, [
      "subscriptionId",
      "subscription_id",
      "itemId",
      "item_id",
      "subscriptionItemId",
      "subscription_item_id",
    ]) ||
    pickFromNested(
      task,
      ["subscription", "item", "task", "payload", "data"],
      [
        "subscriptionId",
        "subscription_id",
        "itemId",
        "item_id",
        "subscriptionItemId",
        "subscription_item_id",
        "id",
      ],
    ) ||
    toText(task.id) ||
    null
  );
};

const getBucketByIdKey = (
  task: Record<string, unknown>,
): DeliveryTaskBucket | null => {
  const typeHint = toText(task.taskType).toLowerCase();
  if (typeHint.includes("subscription")) return "subscriptions";
  if (typeHint.includes("prepaid")) return "prepaid_orders";
  if (typeHint.includes("staff")) return "staff_orders";
  if (typeHint.includes("order")) return "pay_on_delivery_orders";

  if (toText(task.prepaidOrderId) || toText(task.prepaid_order_id)) {
    return "prepaid_orders";
  }
  if (toText(task.staffOrderId) || toText(task.staff_order_id)) {
    return "staff_orders";
  }
  if (toText(task.subscriptionId) || toText(task.subscription_id)) {
    return "subscriptions";
  }
  if (toText(task.orderId) || toText(task.order_id)) {
    return "pay_on_delivery_orders";
  }

  const orderContainer = asObject(task.order);
  if (orderContainer && toText(orderContainer.id)) {
    return "pay_on_delivery_orders";
  }

  const prepaidContainer = asObject(task.prepaidOrder || task.prepaid_order);
  if (prepaidContainer && toText(prepaidContainer.id)) {
    return "prepaid_orders";
  }

  const staffContainer = asObject(task.staffOrder || task.staff_order);
  if (staffContainer && toText(staffContainer.id)) {
    return "staff_orders";
  }

  const subscriptionContainer = asObject(task.subscription);
  if (subscriptionContainer && toText(subscriptionContainer.id)) {
    return "subscriptions";
  }

  return null;
};

const getTaskLabel = (
  task: Record<string, unknown>,
  fallbackId: string,
  fallbackBucket: DeliveryTaskBucket,
): string => {
  const explicit =
    toText(task.label) ||
    toText(task.name) ||
    toText(task.title) ||
    toText(task.display_id) ||
    toText(task.displayId);

  if (explicit) return explicit;

  if (fallbackBucket === "prepaid_orders") {
    return `Prepaid Order ${fallbackId}`;
  }
  if (fallbackBucket === "staff_orders") {
    return `Staff Order ${fallbackId}`;
  }
  if (fallbackBucket === "subscriptions") {
    return `Subscription ${fallbackId}`;
  }
  return `Order ${fallbackId}`;
};

export const parseDeliveryTasks = (tasks: unknown[]): ParsedDeliveryTask[] => {
  if (!Array.isArray(tasks)) return [];

  const parsed: ParsedDeliveryTask[] = [];
  tasks.forEach((taskValue, index) => {
    const task = asObject(taskValue);
    if (!task) return;

    const bucketFromType = detectBucketFromType(toText(task.type));
    const bucketFromKey = getBucketByIdKey(task);
    const bucket = bucketFromType || bucketFromKey;
    if (!bucket) return;

    const taskId = getTaskIdForBucket(task, bucket);
    if (!taskId) return;

    parsed.push({
      key: `${bucket}:${taskId}:${index}`,
      id: taskId,
      bucket,
      label: getTaskLabel(task, taskId, bucket),
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

    outcomes.subscriptions[task.id] =
      outcome === "failure" ? "not_done" : outcome;
  });

  return outcomes;
};

const normalizeItemType = (value: unknown): "asset" | "retail" | "refill" => {
  const text = toText(value).toLowerCase();
  if (text.includes("asset")) return "asset";
  if (text.includes("refill")) return "refill";
  return "retail";
};

export const toDeliverySaleItemType = (value: unknown) => normalizeItemType(value);

export const toMoney = (value: unknown): number => {
  const parsed = toNumber(value);
  if (parsed === null) return 0;
  return Number(parsed.toFixed(2));
};
