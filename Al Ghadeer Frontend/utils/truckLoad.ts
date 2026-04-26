import type { Order } from "@/types/order";

export interface TruckAsset {
  id: string;
  itemId: string;
  label: string;
  serial: string | null;
  category: string | null;
  image_url: string | null;
}

export interface TruckBulkItem {
  id: string;
  label: string;
  quantity: number;
}

export type TruckAssetRentItem = NonNullable<Order["rent_items"]>[number];

const toText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableText = (value: unknown): string | null => {
  const text = toText(value);
  return text.length > 0 ? text : null;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
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

const isExplicitlyUnavailableAsset = (source: Record<string, unknown>) => {
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

const normalizeTruckAsset = (
  value: unknown,
  _index: number,
): TruckAsset | null => {
  const source = asObject(value);
  if (!source) return null;
  if (isExplicitlyUnavailableAsset(source)) return null;

  const id =
    toText(source.id) || toText(source.itemId) || toText(source.item_id);
  const itemId = toText(source.itemId) || toText(source.item_id) || id;
  const label =
    toText(source.label) ||
    toText(source.name) ||
    toText(source.category ?? source.assetCategory) ||
    itemId;

  if (!id || !itemId || !label) {
    return null;
  }

  return {
    id,
    itemId,
    label,
    serial: toNullableText(source.serial),
    category: toNullableText(source.category ?? source.assetCategory),
    image_url: toNullableText(source.image_url),
  };
};

export const extractTruckAssets = (payload: unknown): TruckAsset[] => {
  const root = asObject(payload);
  const load = asObject(root?.load);
  const rawAssets = Array.isArray(load?.assets) ? load.assets : [];

  const assets = rawAssets
    .map((asset, index) => normalizeTruckAsset(asset, index))
    .filter((asset): asset is TruckAsset => asset !== null);

  const deduped = new Map<string, TruckAsset>();
  assets.forEach((asset) => {
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
  const rawBulkItems = Array.isArray(load?.bulkItems)
    ? load.bulkItems
    : Array.isArray(root?.bulkItems)
      ? root.bulkItems
      : [];

  const deduped = new Map<string, TruckBulkItem>();

  rawBulkItems.forEach((value) => {
    const source = asObject(value);
    if (!source) return;

    const id =
      toText(source.id) || toText(source.itemId) || toText(source.item_id);
    const label = toText(source.label) || toText(source.name) || id;
    const quantity = Math.max(0, Math.floor(toNumber(source.quantity)));
    if (!id || !label || quantity <= 0) return;

    const existing = deduped.get(id);
    if (existing) {
      deduped.set(id, {
        ...existing,
        quantity: existing.quantity + quantity,
      });
      return;
    }

    deduped.set(id, { id, label, quantity });
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    }),
  );
};

export const toTruckAssetRentItem = (asset: TruckAsset): TruckAssetRentItem => {
  return {
    id: asset.id,
    item_id: asset.itemId,
    name: asset.label,
    category: "borrow",
    price: 0,
    quantity: 0,
    image_url: asset.image_url || "",
    serial: asset.serial,
    in_truck: false,
    other_action_type: "asset-movement-to-customer",
    other_action_item_type: "asset",
  };
};

export const mergeTruckAssetsIntoRentItems = (
  rentItems: Order["rent_items"] | undefined,
  assets: TruckAsset[],
): TruckAssetRentItem[] => {
  const merged = new Map<string, TruckAssetRentItem>();

  (rentItems || []).forEach((item) => {
    merged.set(item.id, {
      ...item,
      serial: item.serial ?? null,
    });
  });

  assets.forEach((asset) => {
    const existing = merged.get(asset.id);
    if (!existing) {
      merged.set(asset.id, toTruckAssetRentItem(asset));
      return;
    }

    merged.set(asset.id, {
      ...existing,
      item_id: existing.item_id || asset.itemId,
      name: existing.name || asset.label,
      serial: existing.serial ?? asset.serial,
      category: existing.category || "borrow",
      price: typeof existing.price === "number" ? existing.price : 0,
      other_action_type:
        existing.other_action_type || "asset-movement-to-customer",
      other_action_item_type: existing.other_action_item_type || "asset",
    });
  });

  return Array.from(merged.values());
};
