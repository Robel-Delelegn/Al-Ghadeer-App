export interface TruckAsset {
  id: string;
  label: string;
  serial: string | null;
  category: string | null;
}

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

const normalizeTruckAsset = (
  value: unknown,
  index: number,
): TruckAsset | null => {
  const source = asObject(value);
  if (!source) return null;

  const id = toText(source.id) || `truck-asset-${index}`;
  const label = toText(source.label) || `Truck Asset ${index + 1}`;

  return {
    id,
    label,
    serial: toNullableText(source.serial),
    category: toNullableText(source.category),
  };
};

export const extractTruckAssets = (payload: unknown): TruckAsset[] => {
  const root = asObject(payload);
  const load = asObject(root?.load);
  const rawAssets = Array.isArray(load?.assets)
    ? load.assets
    : Array.isArray(root?.assets)
      ? root.assets
      : [];

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
