import type { Order } from "@/types/order";
import { isUniqueItemDepositKind, UNIQUE_ITEM_KIND } from "@/utils/uniqueItems";

export type RentItem = NonNullable<Order["rent_items"]>[number];
export type RentItemDepositKind = typeof UNIQUE_ITEM_KIND | "bottle";

export const getRentItemDepositAction = (
  item: RentItem,
): "deposit" | "deposit_return" => {
  if (
    item.deposit_action === "deposit" ||
    item.deposit_action === "deposit_return"
  ) {
    return item.deposit_action;
  }

  const actionType = (item.other_action_type || "").toLowerCase();
  if (actionType.includes("from-customer") || actionType.includes("refund")) {
    return "deposit_return";
  }

  return "deposit";
};

export const getRentItemDepositKind = (item: RentItem): RentItemDepositKind => {
  if (item.deposit_kind === "bottle") {
    return "bottle";
  }
  if (isUniqueItemDepositKind(item.deposit_kind)) {
    return UNIQUE_ITEM_KIND;
  }

  const normalizedSignals = [
    item.other_action_item_type,
    item.category,
    item.unit,
    item.name,
    item.description,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim()
    .toLowerCase();

  if (item.serial || item.asset_category) {
    return UNIQUE_ITEM_KIND;
  }

  if (
    normalizedSignals.includes("bottle") ||
    normalizedSignals.includes("refill") ||
    normalizedSignals.includes("empty")
  ) {
    return "bottle";
  }

  return UNIQUE_ITEM_KIND;
};

export const isTruckUniqueItemTransfer = (item: RentItem): boolean => {
  return (
    getRentItemDepositAction(item) === "deposit" &&
    getRentItemDepositKind(item) === UNIQUE_ITEM_KIND &&
    item.action_source !== "held_item"
  );
};

export const isHeldItemReturn = (item: RentItem): boolean => {
  return (
    getRentItemDepositAction(item) === "deposit_return" &&
    item.action_source === "held_item"
  );
};

export const isGenericItemDeposit = (item: RentItem): boolean => {
  return (
    getRentItemDepositAction(item) === "deposit" &&
    item.id.startsWith("truck:item:")
  );
};

export const getRentItemDisplayLabel = (item: RentItem): string => {
  const action = getRentItemDepositAction(item);
  const depositKind = getRentItemDepositKind(item);

  if (isGenericItemDeposit(item)) {
    return "Item Deposit";
  }

  if (action === "deposit_return") {
    return depositKind === UNIQUE_ITEM_KIND
      ? "Unique Item Return"
      : "Bottle Return";
  }

  return depositKind === UNIQUE_ITEM_KIND
    ? "Unique Item Deposit"
    : "Bottle Deposit";
};

export const getRentItemQuantityLimit = (item: RentItem): number => {
  if (
    typeof item.max_quantity === "number" &&
    Number.isFinite(item.max_quantity)
  ) {
    return item.max_quantity;
  }
  return item.serial ? 1 : Infinity;
};

export const getOrderSelectedDeliveryActions = (
  order: Order | undefined,
): RentItem[] => {
  if (!order) return [];

  if (Array.isArray(order.draft_delivery_actions)) {
    return order.draft_delivery_actions;
  }

  return (order.rent_items || []).filter((item) => item.in_truck === true);
};
