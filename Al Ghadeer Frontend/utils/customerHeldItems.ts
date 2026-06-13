import type { Order } from "@/types/order";
import { resolveResourceUrl } from "@/utils/resources";

export interface CustomerHeldBottle {
  fullBottleId: string;
  emptyBottleId: string;
  label: string;
  description: string | null;
  image_url: string | null;
  quantity: number;
  unit: string | null;
}

export interface CustomerHeldAsset {
  itemId: string;
  label: string;
  description: string | null;
  image_url: string | null;
  unit: string | null;
  serial: string;
  assetCategory: string | null;
}

export interface CustomerHeldItems {
  bottles: CustomerHeldBottle[];
  assets: CustomerHeldAsset[];
}

type RentItem = NonNullable<Order["rent_items"]>[number];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const pickText = (
  record: Record<string, unknown> | null | undefined,
  fields: string[],
): string => {
  if (!record) return "";

  for (const field of fields) {
    const text = toText(record[field]);
    if (text) return text;
  }

  return "";
};

const pickNullableText = (
  record: Record<string, unknown> | null | undefined,
  fields: string[],
): string | null => {
  const text = pickText(record, fields);
  return text.length > 0 ? text : null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const pickNumber = (
  record: Record<string, unknown> | null | undefined,
  fields: string[],
): number | null => {
  if (!record) return null;

  for (const field of fields) {
    const parsed = toNumber(record[field]);
    if (parsed !== null) return parsed;
  }

  return null;
};

const pickArray = (
  record: Record<string, unknown> | null,
  fields: string[],
): unknown[] => {
  if (!record) return [];

  for (const field of fields) {
    const value = record[field];
    if (Array.isArray(value)) return value;
  }

  return [];
};

const normalizeBottle = (value: unknown): CustomerHeldBottle | null => {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const item = isRecord(record.item) ? record.item : null;
  const fallbackItemId =
    pickText(record, ["itemId", "item_id", "bottleId", "bottle_id", "id"]) ||
    pickText(item, ["itemId", "item_id", "id"]);
  const fullBottleId =
    pickText(record, [
      "fullBottleId",
      "full_bottle_id",
      "filledBottleId",
      "filled_bottle_id",
      "fullItemId",
      "full_item_id",
    ]) || fallbackItemId;
  const emptyBottleId =
    pickText(record, [
      "emptyBottleId",
      "empty_bottle_id",
      "emptyItemId",
      "empty_item_id",
      "itemId",
      "item_id",
      "bottleId",
      "bottle_id",
      "id",
    ]) ||
    pickText(item, ["itemId", "item_id", "id"]) ||
    fallbackItemId;
  const label =
    pickText(record, ["label", "name", "title"]) ||
    pickText(item, ["label", "name", "title"]) ||
    emptyBottleId ||
    "Bottle";
  const quantity = Math.max(
    0,
    Math.floor(
      pickNumber(record, [
        "quantity",
        "qty",
        "count",
        "heldQuantity",
        "held_quantity",
        "availableQuantity",
        "available_quantity",
      ]) ?? 0,
    ),
  );

  if (!emptyBottleId || quantity <= 0) {
    return null;
  }

  return {
    fullBottleId,
    emptyBottleId,
    label,
    description:
      pickNullableText(record, ["description", "details"]) ??
      pickNullableText(item, ["description", "details"]),
    image_url:
      pickNullableText(record, ["image_url", "imageUrl"]) ??
      pickNullableText(item, ["image_url", "imageUrl"]),
    quantity,
    unit:
      pickNullableText(record, ["unit", "unitName", "unit_name"]) ??
      pickNullableText(item, ["unit", "unitName", "unit_name"]),
  };
};

const normalizeAsset = (value: unknown): CustomerHeldAsset | null => {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const item = isRecord(record.item) ? record.item : null;
  const itemId =
    pickText(record, ["itemId", "item_id", "assetId", "asset_id", "id"]) ||
    pickText(item, ["itemId", "item_id", "assetId", "asset_id", "id"]);
  const label =
    pickText(record, ["label", "name", "title"]) ||
    pickText(item, ["label", "name", "title"]) ||
    itemId ||
    "Asset";
  const serial =
    pickText(record, [
      "serial",
      "serialNumber",
      "serial_number",
      "assetSerial",
      "asset_serial",
    ]) ||
    pickText(item, [
      "serial",
      "serialNumber",
      "serial_number",
      "assetSerial",
      "asset_serial",
    ]) ||
    pickText(record, ["id"]) ||
    itemId;

  if (!itemId) {
    return null;
  }

  return {
    itemId,
    label,
    description:
      pickNullableText(record, ["description", "details"]) ??
      pickNullableText(item, ["description", "details"]),
    image_url:
      pickNullableText(record, ["image_url", "imageUrl"]) ??
      pickNullableText(item, ["image_url", "imageUrl"]),
    unit:
      pickNullableText(record, ["unit", "unitName", "unit_name"]) ??
      pickNullableText(item, ["unit", "unitName", "unit_name"]),
    serial,
    assetCategory:
      pickNullableText(record, [
        "assetCategory",
        "asset_category",
        "category",
      ]) ??
      pickNullableText(item, ["assetCategory", "asset_category", "category"]),
  };
};

export const normalizeCustomerHeldItems = (
  value: unknown,
): CustomerHeldItems => {
  const root = isRecord(value) ? value : null;
  const record = isRecord(root?.data) ? root.data : root;
  return {
    bottles: pickArray(record, [
      "bottles",
      "heldBottles",
      "held_bottles",
      "customerBottles",
      "customer_bottles",
    ])
      .map((entry) => normalizeBottle(entry))
      .filter((entry): entry is CustomerHeldBottle => entry !== null),
    assets: pickArray(record, [
      "assets",
      "heldAssets",
      "held_assets",
      "customerAssets",
      "customer_assets",
    ])
      .map((entry) => normalizeAsset(entry))
      .filter((entry): entry is CustomerHeldAsset => entry !== null),
  };
};

const toHeldBottleRentItem = (bottle: CustomerHeldBottle): RentItem => {
  return {
    id: `held:bottle:${bottle.emptyBottleId}`,
    item_id: bottle.emptyBottleId,
    name: bottle.label,
    category: "deposit",
    price: 0,
    quantity: 0,
    image_url: resolveResourceUrl(bottle.image_url) || "",
    in_truck: false,
    deposit_action: "deposit_return",
    deposit_kind: "bottle",
    action_source: "held_item",
    max_quantity: bottle.quantity,
    unit: bottle.unit,
    description: bottle.description,
  };
};

const toHeldAssetRentItem = (asset: CustomerHeldAsset): RentItem => {
  return {
    id: `held:asset:${asset.itemId}:${asset.serial}`,
    item_id: asset.itemId,
    name: asset.label,
    category: "deposit",
    price: 0,
    quantity: 0,
    image_url: resolveResourceUrl(asset.image_url) || "",
    serial: asset.serial,
    in_truck: false,
    deposit_action: "deposit_return",
    deposit_kind: "asset",
    action_source: "held_item",
    max_quantity: 1,
    unit: asset.unit,
    asset_category: asset.assetCategory,
    description: asset.description,
  };
};

export const mergeHeldItemsIntoRentItems = (
  rentItems: Order["rent_items"] | undefined,
  heldItems: CustomerHeldItems,
): RentItem[] => {
  const merged = new Map<string, RentItem>();

  (rentItems || []).forEach((item) => {
    merged.set(item.id, item);
  });

  heldItems.bottles.forEach((bottle) => {
    const nextItem = toHeldBottleRentItem(bottle);
    const existing = merged.get(nextItem.id);
    if (!existing) {
      merged.set(nextItem.id, nextItem);
      return;
    }

    merged.set(nextItem.id, {
      ...existing,
      item_id: existing.item_id || nextItem.item_id,
      name: existing.name || nextItem.name,
      image_url: existing.image_url || nextItem.image_url,
      deposit_action: existing.deposit_action || nextItem.deposit_action,
      deposit_kind: existing.deposit_kind || nextItem.deposit_kind,
      action_source: existing.action_source || nextItem.action_source,
      max_quantity:
        typeof existing.max_quantity === "number"
          ? existing.max_quantity
          : nextItem.max_quantity,
      unit: existing.unit ?? nextItem.unit,
      description: existing.description ?? nextItem.description,
    });
  });

  heldItems.assets.forEach((asset) => {
    const nextItem = toHeldAssetRentItem(asset);
    const existing = merged.get(nextItem.id);
    if (!existing) {
      merged.set(nextItem.id, nextItem);
      return;
    }

    merged.set(nextItem.id, {
      ...existing,
      item_id: existing.item_id || nextItem.item_id,
      name: existing.name || nextItem.name,
      image_url: existing.image_url || nextItem.image_url,
      serial: existing.serial ?? nextItem.serial,
      deposit_action: existing.deposit_action || nextItem.deposit_action,
      deposit_kind: existing.deposit_kind || nextItem.deposit_kind,
      action_source: existing.action_source || nextItem.action_source,
      max_quantity:
        typeof existing.max_quantity === "number"
          ? existing.max_quantity
          : nextItem.max_quantity,
      unit: existing.unit ?? nextItem.unit,
      asset_category: existing.asset_category ?? nextItem.asset_category,
      description: existing.description ?? nextItem.description,
    });
  });

  return Array.from(merged.values());
};
