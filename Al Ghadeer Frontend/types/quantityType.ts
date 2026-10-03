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
