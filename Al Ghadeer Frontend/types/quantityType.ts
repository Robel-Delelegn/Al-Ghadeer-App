export const QUANTITY_TYPES = [
  "N/A",
  "No Deposit",
  "Deposit",
  "Exchange",
  "Repaired",
  "Return",
  "Cash",
  "Free",
  "Credit",
  "Sold",
  "Replace",
  "Coupon Leaf",
  "Ret. to Rep.",
  "Pending",
  "Pending Return",
  "Offer",
  "Rent (1 yr)",
  "Rent (6 mo)",
  "Spare",
  "Spare Return",
  "Return as Damaged",
  "Indirect Sale",
  "Return as Sold",
] as const;

export type QuantityType = (typeof QUANTITY_TYPES)[number];

const QUANTITY_TYPE_SET = new Set<string>(QUANTITY_TYPES);

export const normalizeQuantityType = (value: unknown): QuantityType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return QUANTITY_TYPE_SET.has(normalized)
    ? (normalized as QuantityType)
    : null;
};

/**
 * The driver API records repairs as a quantity type rather than a separate
 * `forRepair` flag. Keep this conversion here so legacy drafts are submitted
 * using the current API contract.
 */
export const resolveQuantityType = (
  value: QuantityType | null | undefined,
  forRepair = false,
): QuantityType | undefined =>
  forRepair ? "Ret. to Rep." : value || undefined;

export const toQuantityTypeField = (
  value: QuantityType | null | undefined,
  forRepair = false,
  fallback?: QuantityType,
): { quantityType?: QuantityType } => {
  const quantityType = resolveQuantityType(value ?? fallback, forRepair);
  return quantityType ? { quantityType } : {};
};
