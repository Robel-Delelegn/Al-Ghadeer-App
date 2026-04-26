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

const toNullableText = (value: unknown): string | null => {
  const text = toText(value);
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

const normalizeBottle = (value: unknown): CustomerHeldBottle | null => {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const fullBottleId = toText(record.fullBottleId);
  const emptyBottleId = toText(record.emptyBottleId);
  const label = toText(record.label);
  const quantity = Math.max(0, Math.floor(toNumber(record.quantity) ?? 0));

  if (!fullBottleId || !emptyBottleId || !label || quantity <= 0) {
    return null;
  }

  return {
    fullBottleId,
    emptyBottleId,
    label,
    description: toNullableText(record.description),
    image_url: toNullableText(record.image_url),
    quantity,
    unit: toNullableText(record.unit),
  };
};

const normalizeAsset = (value: unknown): CustomerHeldAsset | null => {
  const record = isRecord(value) ? value : null;
  if (!record) return null;

  const itemId = toText(record.itemId);
  const label = toText(record.label);
  const serial = toText(record.serial);

  if (!itemId || !label || !serial) {
    return null;
  }

  return {
    itemId,
    label,
    description: toNullableText(record.description),
    image_url: toNullableText(record.image_url),
    serial,
    assetCategory: toNullableText(record.assetCategory),
  };
};

export const normalizeCustomerHeldItems = (
  value: unknown,
): CustomerHeldItems => {
  const record = isRecord(value) ? value : null;
  return {
    bottles: Array.isArray(record?.bottles)
      ? record.bottles
          .map((entry) => normalizeBottle(entry))
          .filter((entry): entry is CustomerHeldBottle => entry !== null)
      : [],
    assets: Array.isArray(record?.assets)
      ? record.assets
          .map((entry) => normalizeAsset(entry))
          .filter((entry): entry is CustomerHeldAsset => entry !== null)
      : [],
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
      asset_category: existing.asset_category ?? nextItem.asset_category,
      description: existing.description ?? nextItem.description,
    });
  });

  return Array.from(merged.values());
};
