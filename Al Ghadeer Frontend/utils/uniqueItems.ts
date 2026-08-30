export const UNIQUE_ITEM_KIND = "unique-item" as const;
export const UNIQUE_ITEMS_GROUP = "unique-items" as const;
export const LEGACY_ASSET_KIND = "asset" as const;
export const LEGACY_ASSETS_GROUP = "assets" as const;

export const UNIQUE_ITEM_SALE_PREFIX = "sale-unique-item:";
export const LEGACY_ASSET_SALE_PREFIX = "sale-asset:";
export const UNIQUE_ITEM_TRUCK_PREFIX = "truck:unique-item:";
export const LEGACY_ASSET_TRUCK_PREFIX = "truck:asset:";
export const UNIQUE_ITEM_HELD_PREFIX = "held:unique-item:";
export const LEGACY_ASSET_HELD_PREFIX = "held:asset:";

export const UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER =
  "unique-item-movement-to-customer" as const;
export const UNIQUE_ITEM_MOVEMENT_FROM_CUSTOMER =
  "unique-item-movement-from-customer" as const;
export const LEGACY_ASSET_MOVEMENT_TO_CUSTOMER =
  "asset-movement-to-customer" as const;
export const LEGACY_ASSET_MOVEMENT_FROM_CUSTOMER =
  "asset-movement-from-customer" as const;

export const normalizeUniqueItemSignal = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export const isUniqueItemSignal = (value: unknown): boolean => {
  const normalized = normalizeUniqueItemSignal(value);
  return normalized.includes("uniqueitem") || normalized.includes("asset");
};

export const isGenericUniqueItemLabel = (value?: string | null): boolean => {
  const normalized = normalizeUniqueItemSignal(value);
  return (
    normalized.length === 0 ||
    normalized === "uniqueitem" ||
    normalized === "uniqueitems" ||
    normalized === "asset" ||
    normalized === "assets" ||
    normalized === "assetitem" ||
    normalized === "assetproduct"
  );
};

export const getSpecificUniqueItemCategory = (
  ...values: (string | null | undefined)[]
): string => {
  for (const value of values) {
    const label = (value || "").trim();
    if (label && !isGenericUniqueItemLabel(label)) return label;
  }
  return "";
};

export const isUniqueItemDepositKind = (value: unknown): boolean => {
  const normalized = normalizeUniqueItemSignal(value);
  return normalized === "uniqueitem" || normalized === "asset";
};

export const isUniqueItemMovementType = (value: unknown): boolean => {
  const normalized = normalizeUniqueItemSignal(value);
  return (
    normalized.includes("uniqueitemmovement") ||
    normalized.includes("assetmovement")
  );
};

export const isUniqueItemSaleId = (value: unknown): boolean => {
  const text = typeof value === "string" ? value.trim() : "";
  return (
    text.startsWith(UNIQUE_ITEM_SALE_PREFIX) ||
    text.startsWith(LEGACY_ASSET_SALE_PREFIX)
  );
};
