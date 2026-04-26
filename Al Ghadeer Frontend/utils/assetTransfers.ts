import type { Order } from "@/types/order";

export interface AssetProductSource {
  id: string;
  itemId: string;
  label: string;
  assetCategory?: string | null;
  image_url?: string | null;
}

export interface TransferableAssetProduct {
  id: string;
  itemId: string;
  label: string;
  serial: string | null;
  assetCategory: string | null;
  imageUrl: string | null;
}

export type TransferAssetRentItem = NonNullable<Order["rent_items"]>[number];

const parseAssetLabel = (value: string) => {
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

export const toTransferableAssetProduct = (
  product: AssetProductSource,
): TransferableAssetProduct => {
  const parsed = parseAssetLabel(product.label);

  return {
    id: product.id,
    itemId: product.itemId,
    label: parsed.label,
    serial: parsed.serial,
    assetCategory: product.assetCategory?.trim() || null,
    imageUrl: product.image_url?.trim() || null,
  };
};

export const toTransferAssetRentItem = (
  asset: TransferableAssetProduct,
): TransferAssetRentItem => {
  return {
    id: asset.itemId,
    item_id: asset.itemId,
    name: asset.label,
    category: "deposit",
    price: 0,
    quantity: 0,
    image_url: asset.imageUrl || "",
    serial: asset.serial,
    in_truck: false,
    max_quantity: asset.serial ? 1 : undefined,
    deposit_action: "deposit",
    deposit_kind: "asset",
    action_source: "product_asset",
    asset_category: asset.assetCategory,
    other_action_type: "asset-movement-to-customer",
    other_action_item_type: "asset",
  };
};

export const mergeAssetProductsIntoRentItems = (
  rentItems: Order["rent_items"] | undefined,
  assets: TransferableAssetProduct[],
): TransferAssetRentItem[] => {
  const merged = new Map<string, TransferAssetRentItem>();

  (rentItems || []).forEach((item) => {
    merged.set(item.id, {
      ...item,
      serial: item.serial ?? null,
    });
  });

  assets.forEach((asset) => {
    const existing = merged.get(asset.itemId);
    if (!existing) {
      merged.set(asset.itemId, toTransferAssetRentItem(asset));
      return;
    }

    merged.set(asset.itemId, {
      ...existing,
      item_id: existing.item_id || asset.itemId,
      name: existing.name || asset.label,
      image_url: existing.image_url || asset.imageUrl || "",
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
      deposit_kind: existing.deposit_kind || "asset",
      action_source: existing.action_source || "product_asset",
      asset_category: existing.asset_category ?? asset.assetCategory ?? null,
      other_action_type:
        existing.other_action_type || "asset-movement-to-customer",
      other_action_item_type: existing.other_action_item_type || "asset",
    });
  });

  return Array.from(merged.values());
};
