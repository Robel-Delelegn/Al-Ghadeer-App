import type { Order } from "@/types/order";
import {
  UNIQUE_ITEM_KIND,
  UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
} from "@/utils/uniqueItems";

export interface TruckUniqueItem {
  id: string;
  itemId: string;
  label: string;
  description: string | null;
  serial: string | null;
  category: string | null;
  image_url: string | null;
}

export interface TruckBulkItem {
  id: string;
  itemId: string;
  fullBottleId: string | null;
  emptyBottleId: string | null;
  label: string;
  description: string | null;
  quantity: number;
  category: string | null;
  unit: string | null;
  image_url: string | null;
  isRefillableBottle: boolean;
}

export type TruckUniqueItemRentItem = NonNullable<Order["rent_items"]>[number];

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const pickText = (
  source: Record<string, unknown> | null | undefined,
  fields: string[],
): string => {
  if (!source) return "";

  for (const field of fields) {
    const text = toText(source[field]);
    if (text) return text;
  }

  return "";
};

const pickNullableText = (
  source: Record<string, unknown> | null | undefined,
  fields: string[],
): string | null => {
  const text = pickText(source, fields);
  return text.length > 0 ? text : null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
};

const pickNumber = (
  source: Record<string, unknown> | null | undefined,
  fields: string[],
): number => {
  if (!source) return 0;

  for (const field of fields) {
    const value = source[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }
  }

  return 0;
};

const pickBoolean = (
  source: Record<string, unknown> | null | undefined,
  fields: string[],
): boolean | null => {
  if (!source) return null;

  for (const field of fields) {
    const value = source[field];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "0", "no", "n"].includes(normalized)) return false;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value !== 0;
    }
  }

  return null;
};

const pickArray = (
  source: Record<string, unknown> | null | undefined,
  fields: string[],
): unknown[] => {
  if (!source) return [];

  for (const field of fields) {
    const value = source[field];
    if (Array.isArray(value)) return value;
  }

  return [];
};

const isExplicitlyUnavailableUniqueItem = (source: Record<string, unknown>) => {
  const availabilityFlags = [
    source.inTruck,
    source.in_truck,
    source.loaded,
    source.isLoaded,
    source.is_loaded,
    source.available,
    source.isAvailable,
    source.is_available,
  ];

  if (availabilityFlags.some((value) => value === false)) {
    return true;
  }

  const status = toText(source.status).toLowerCase();
  return [
    "sold",
    "delivered",
    "assigned",
    "with_customer",
    "with-customer",
    "not_in_truck",
    "not-in-truck",
  ].includes(status);
};

const normalizeTruckUniqueItem = (
  value: unknown,
  _index: number,
): TruckUniqueItem | null => {
  const source = asObject(value);
  if (!source) return null;
  if (isExplicitlyUnavailableUniqueItem(source)) return null;
  const item = asObject(source.item) || asObject(source.product);

  const id =
    pickText(source, [
      "id",
      "uniqueItemId",
      "unique_item_id",
      "assetId",
      "asset_id",
      "loadItemId",
    ]) ||
    pickText(item, [
      "id",
      "uniqueItemId",
      "unique_item_id",
      "assetId",
      "asset_id",
    ]);
  const itemId =
    pickText(source, ["itemId", "item_id", "productId", "product_id"]) ||
    pickText(item, ["itemId", "item_id", "id"]) ||
    id;
  const label =
    pickText(source, ["label", "name", "title"]) ||
    pickText(item, ["label", "name", "title"]) ||
    pickText(source, [
      "category",
      "uniqueItemCategory",
      "unique_item_category",
      "assetCategory",
      "asset_category",
    ]) ||
    pickText(item, [
      "category",
      "uniqueItemCategory",
      "unique_item_category",
      "assetCategory",
      "asset_category",
    ]) ||
    itemId;

  if (!id || !itemId || !label) {
    return null;
  }

  return {
    id,
    itemId,
    label,
    description:
      pickNullableText(source, ["description", "details"]) ??
      pickNullableText(item, ["description", "details"]),
    serial:
      pickNullableText(source, [
        "serial",
        "serialNumber",
        "serial_number",
        "uniqueItemSerial",
        "unique_item_serial",
        "assetSerial",
        "asset_serial",
      ]) ??
      pickNullableText(item, [
        "serial",
        "serialNumber",
        "serial_number",
        "uniqueItemSerial",
        "unique_item_serial",
        "assetSerial",
        "asset_serial",
      ]),
    category:
      pickNullableText(source, [
        "category",
        "uniqueItemCategory",
        "unique_item_category",
        "assetCategory",
        "asset_category",
      ]) ??
      pickNullableText(item, [
        "category",
        "uniqueItemCategory",
        "unique_item_category",
        "assetCategory",
        "asset_category",
      ]),
    image_url:
      pickNullableText(source, ["image_url", "imageUrl"]) ??
      pickNullableText(item, ["image_url", "imageUrl"]),
  };
};

export const extractTruckUniqueItems = (
  payload: unknown,
): TruckUniqueItem[] => {
  const root = asObject(payload);
  const load = asObject(root?.load);
  const loadAssets = pickArray(load, [
    "uniqueItems",
    "unique_items",
    "uniqueItemItems",
    "unique_item_items",
    "assets",
    "assetItems",
    "asset_items",
    "serialAssets",
    "serial_assets",
  ]);
  const rawAssets =
    loadAssets.length > 0
      ? loadAssets
      : pickArray(root, [
          "uniqueItems",
          "unique_items",
          "uniqueItemItems",
          "unique_item_items",
          "assets",
          "assetItems",
          "asset_items",
          "serialAssets",
          "serial_assets",
        ]);

  const uniqueItems = rawAssets
    .map((asset, index) => normalizeTruckUniqueItem(asset, index))
    .filter((asset): asset is TruckUniqueItem => asset !== null);

  const deduped = new Map<string, TruckUniqueItem>();
  uniqueItems.forEach((asset) => {
    if (!deduped.has(asset.id)) {
      deduped.set(asset.id, asset);
    }
  });

  return Array.from(deduped.values()).sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    });
    if (labelCompare !== 0) return labelCompare;

    return (left.serial || "").localeCompare(right.serial || "", undefined, {
      sensitivity: "base",
    });
  });
};

export const extractTruckBulkItems = (payload: unknown): TruckBulkItem[] => {
  const root = asObject(payload);
  const load = asObject(root?.load);
  const loadBulkItems = pickArray(load, [
    "bulkItems",
    "bulk_items",
    "loadedItems",
    "loaded_items",
    "items",
    "inventory",
    "products",
  ]);
  const rawBulkItems =
    loadBulkItems.length > 0
      ? loadBulkItems
      : pickArray(root, [
          "bulkItems",
          "bulk_items",
          "loadedItems",
          "loaded_items",
          "items",
          "inventory",
          "products",
        ]);

  const deduped = new Map<string, TruckBulkItem>();

  rawBulkItems.forEach((value) => {
    const source = asObject(value);
    if (!source) return;
    const item = asObject(source.item) || asObject(source.product);

    const rowId =
      pickText(source, [
        "id",
        "loadItemId",
        "load_item_id",
        "bulkItemId",
        "bulk_item_id",
      ]) ||
      pickText(source, ["itemId", "item_id", "productId", "product_id"]) ||
      pickText(item, ["id", "itemId", "item_id"]) ||
      "";
    const fullBottleId =
      pickNullableText(source, [
        "fullBottleId",
        "full_bottle_id",
        "filledBottleId",
        "filled_bottle_id",
      ]) ??
      pickNullableText(item, [
        "fullBottleId",
        "full_bottle_id",
        "filledBottleId",
        "filled_bottle_id",
      ]);
    const emptyBottleId =
      pickNullableText(source, [
        "emptyBottleId",
        "empty_bottle_id",
        "emptyItemId",
        "empty_item_id",
      ]) ??
      pickNullableText(item, [
        "emptyBottleId",
        "empty_bottle_id",
        "emptyItemId",
        "empty_item_id",
      ]);
    const itemId =
      pickText(source, ["itemId", "item_id", "productId", "product_id"]) ||
      pickText(item, ["itemId", "item_id", "id"]) ||
      fullBottleId ||
      emptyBottleId ||
      rowId;
    const id = itemId || rowId;
    const label =
      pickText(source, ["label", "name", "title"]) ||
      pickText(item, ["label", "name", "title"]) ||
      itemId ||
      id;
    const description =
      pickNullableText(source, ["description", "details"]) ??
      pickNullableText(item, ["description", "details"]);
    const category =
      pickNullableText(source, ["category", "type"]) ??
      pickNullableText(item, ["category", "type"]);
    const unit =
      pickNullableText(source, ["unit", "unitName", "unit_name"]) ??
      pickNullableText(item, ["unit", "unitName", "unit_name"]);
    const imageUrl =
      pickNullableText(source, ["image_url", "imageUrl"]) ??
      pickNullableText(item, ["image_url", "imageUrl"]);
    const isRefillableBottle =
      pickBoolean(source, [
        "isRefillableBottle",
        "is_refillable_bottle",
        "refillable",
        "isRefillable",
        "is_refillable",
      ]) ??
      pickBoolean(item, [
        "isRefillableBottle",
        "is_refillable_bottle",
        "refillable",
        "isRefillable",
        "is_refillable",
      ]) ??
      Boolean(fullBottleId || emptyBottleId);
    const quantity = Math.max(
      0,
      Math.floor(
        pickNumber(source, [
          "quantity",
          "qty",
          "count",
          "loadedQuantity",
          "loaded_quantity",
          "availableQuantity",
          "available_quantity",
          "available_stock",
          "stock",
        ]) || toNumber(source.quantity),
      ),
    );
    if (!id || !itemId || !label || quantity <= 0) return;

    const existing = deduped.get(id);
    if (existing) {
      deduped.set(id, {
        ...existing,
        quantity: existing.quantity + quantity,
        description: existing.description ?? description,
        category: existing.category ?? category,
        unit: existing.unit ?? unit,
        image_url: existing.image_url ?? imageUrl,
        isRefillableBottle: existing.isRefillableBottle || isRefillableBottle,
      });
      return;
    }

    deduped.set(id, {
      id,
      itemId,
      fullBottleId,
      emptyBottleId,
      label,
      description,
      quantity,
      category,
      unit,
      image_url: imageUrl,
      isRefillableBottle,
    });
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    }),
  );
};

export const getTruckBulkItemMatchKeys = (item: TruckBulkItem): string[] => {
  const keys = [item.id, item.itemId, item.fullBottleId, item.emptyBottleId]
    .map((value) => (value || "").trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(keys));
};

export const toTruckUniqueItemRentItem = (
  asset: TruckUniqueItem,
): TruckUniqueItemRentItem => {
  return {
    id: asset.id,
    item_id: asset.itemId,
    name: asset.label,
    description: asset.description,
    category: "deposit",
    price: 0,
    quantity: 0,
    image_url: asset.image_url || "",
    serial: asset.serial,
    in_truck: false,
    max_quantity: 1,
    deposit_action: "deposit",
    deposit_kind: UNIQUE_ITEM_KIND,
    action_source: "product_unique_item",
    asset_category: asset.category,
    unique_item_category: asset.category,
    other_action_type: UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
    other_action_item_type: UNIQUE_ITEM_KIND,
  };
};

export const mergeTruckUniqueItemsIntoRentItems = (
  rentItems: Order["rent_items"] | undefined,
  assets: TruckUniqueItem[],
): TruckUniqueItemRentItem[] => {
  const merged = new Map<string, TruckUniqueItemRentItem>();

  (rentItems || []).forEach((item) => {
    merged.set(item.id, {
      ...item,
      serial: item.serial ?? null,
    });
  });

  assets.forEach((asset) => {
    const existing = merged.get(asset.id);
    if (!existing) {
      merged.set(asset.id, toTruckUniqueItemRentItem(asset));
      return;
    }

    merged.set(asset.id, {
      ...existing,
      item_id: existing.item_id || asset.itemId,
      name: existing.name || asset.label,
      description: existing.description ?? asset.description,
      serial: existing.serial ?? asset.serial,
      category: existing.category || "deposit",
      price: typeof existing.price === "number" ? existing.price : 0,
      max_quantity:
        typeof existing.max_quantity === "number" ? existing.max_quantity : 1,
      deposit_action: existing.deposit_action || "deposit",
      deposit_kind: existing.deposit_kind || UNIQUE_ITEM_KIND,
      action_source: existing.action_source || "product_unique_item",
      asset_category: existing.asset_category ?? asset.category,
      unique_item_category:
        existing.unique_item_category ??
        existing.asset_category ??
        asset.category,
      other_action_type:
        existing.other_action_type || UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
      other_action_item_type:
        existing.other_action_item_type || UNIQUE_ITEM_KIND,
    });
  });

  return Array.from(merged.values());
};

export type TruckAsset = TruckUniqueItem;
export type TruckAssetRentItem = TruckUniqueItemRentItem;
export const extractTruckAssets = extractTruckUniqueItems;
export const toTruckAssetRentItem = toTruckUniqueItemRentItem;
export const mergeTruckAssetsIntoRentItems = mergeTruckUniqueItemsIntoRentItems;
