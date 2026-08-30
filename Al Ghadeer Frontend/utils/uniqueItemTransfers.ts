import type { Order } from "@/types/order";
import {
  UNIQUE_ITEM_KIND,
  UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
} from "@/utils/uniqueItems";

export interface UniqueItemProductSource {
  id: string;
  itemId: string;
  label: string;
  uniqueItemCategory?: string | null;
  assetCategory?: string | null;
  image_url?: string | null;
  description?: string | null;
  unit?: string | null;
}

export interface TransferableUniqueItemProduct {
  id: string;
  itemId: string;
  label: string;
  serial: string | null;
  uniqueItemCategory: string | null;
  assetCategory: string | null;
  imageUrl: string | null;
  description: string | null;
  unit: string | null;
}

export type TransferUniqueItemRentItem = NonNullable<
  Order["rent_items"]
>[number];

const parseUniqueItemLabel = (value: string) => {
  const normalized = value.trim();
  const serialMatch = normalized.match(/^(.*)\(([^()]+)\)\s*$/);

  if (!serialMatch) {
    return {
      label: normalized,
      serial: null,
    };
  }

  const label = serialMatch[1]?.trim() || normalized;
  const serial = serialMatch[2]?.trim() || null;

  return {
    label,
    serial,
  };
};

export const toTransferableUniqueItemProduct = (
  product: UniqueItemProductSource,
): TransferableUniqueItemProduct => {
  const parsed = parseUniqueItemLabel(product.label);

  return {
    id: product.id,
    itemId: product.itemId,
    label: parsed.label,
    serial: parsed.serial,
    uniqueItemCategory:
      product.uniqueItemCategory?.trim() ||
      product.assetCategory?.trim() ||
      null,
    assetCategory:
      product.uniqueItemCategory?.trim() ||
      product.assetCategory?.trim() ||
      null,
    imageUrl: product.image_url?.trim() || null,
    description: product.description?.trim() || null,
    unit: product.unit?.trim() || null,
  };
};

export const toTransferUniqueItemRentItem = (
  asset: TransferableUniqueItemProduct,
): TransferUniqueItemRentItem => {
  return {
    id: asset.itemId,
    item_id: asset.itemId,
    name: asset.label,
    description: asset.description,
    category: "deposit",
    price: 0,
    quantity: 0,
    image_url: asset.imageUrl || "",
    unit: asset.unit,
    serial: asset.serial,
    in_truck: false,
    max_quantity: asset.serial ? 1 : undefined,
    deposit_action: "deposit",
    deposit_kind: UNIQUE_ITEM_KIND,
    action_source: "product_unique_item",
    asset_category: asset.assetCategory,
    unique_item_category: asset.assetCategory,
    other_action_type: UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
    other_action_item_type: UNIQUE_ITEM_KIND,
  };
};

export const mergeUniqueItemProductsIntoRentItems = (
  rentItems: Order["rent_items"] | undefined,
  assets: TransferableUniqueItemProduct[],
): TransferUniqueItemRentItem[] => {
  const merged = new Map<string, TransferUniqueItemRentItem>();

  (rentItems || []).forEach((item) => {
    merged.set(item.id, {
      ...item,
      serial: item.serial ?? null,
    });
  });

  assets.forEach((asset) => {
    const existing = merged.get(asset.itemId);
    if (!existing) {
      merged.set(asset.itemId, toTransferUniqueItemRentItem(asset));
      return;
    }

    merged.set(asset.itemId, {
      ...existing,
      item_id: existing.item_id || asset.itemId,
      name: existing.name || asset.label,
      description: existing.description ?? asset.description,
      image_url: existing.image_url || asset.imageUrl || "",
      unit: existing.unit ?? asset.unit,
      serial: existing.serial ?? asset.serial,
      category: existing.category || "deposit",
      price: typeof existing.price === "number" ? existing.price : 0,
      max_quantity:
        typeof existing.max_quantity === "number"
          ? existing.max_quantity
          : asset.serial
            ? 1
            : undefined,
      deposit_action: existing.deposit_action || "deposit",
      deposit_kind: existing.deposit_kind || UNIQUE_ITEM_KIND,
      action_source: existing.action_source || "product_unique_item",
      asset_category: existing.asset_category ?? asset.assetCategory ?? null,
      unique_item_category:
        existing.unique_item_category ??
        existing.asset_category ??
        asset.assetCategory ??
        null,
      other_action_type:
        existing.other_action_type || UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
      other_action_item_type:
        existing.other_action_item_type || UNIQUE_ITEM_KIND,
    });
  });

  return Array.from(merged.values());
};

export type AssetProductSource = UniqueItemProductSource;
export type TransferableAssetProduct = TransferableUniqueItemProduct;
export type TransferAssetRentItem = TransferUniqueItemRentItem;
export const toTransferableAssetProduct = toTransferableUniqueItemProduct;
export const toTransferAssetRentItem = toTransferUniqueItemRentItem;
export const mergeAssetProductsIntoRentItems =
  mergeUniqueItemProductsIntoRentItems;
