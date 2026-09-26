import {
  type DeliverySaleItemType,
  toDeliverySaleItemType,
  toMoney,
} from "@/utils/deliveries";
import {
  isUniqueItemSaleId,
  isUniqueItemSignal,
  UNIQUE_ITEM_KIND,
} from "@/utils/uniqueItems";

type CartImage = { uri: string } | null;

export type DeliveryCartItemLike = {
  id?: string;
  sale_item_id?: string;
  item_id?: string;
  item_type?: string;
  name?: string;
  image?: CartImage;
  price?: number;
  quantity?: number;
  category?: string | null;
  uniqueItemCategory?: string | null;
  assetCategory?: string | null;
  loaded_quantity?: number | string | null;
  remark?: string | null;
};

export type DeliverySaleCartRow = {
  key: string;
  cartId: string;
  saleItemId: string;
  itemId: string;
  itemType: DeliverySaleItemType;
  name: string;
  image: CartImage;
  quantity: number;
  unitPrice: number;
  category: string | null;
  assetCategory: string | null;
  remark: string;
};

export type InvalidDeliverySaleCartItem = {
  id: string;
  name: string;
  reason: string;
};

const normalizeSignal = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const toCleanText = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toStockLimit = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : null;

  if (parsed === null || !Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor(parsed));
};

const inferDeliverySaleItemType = (
  item: DeliveryCartItemLike,
): DeliverySaleItemType => {
  const itemType = normalizeSignal(item.item_type);
  const category = normalizeSignal(item.category);
  const assetCategory = toCleanText(
    item.uniqueItemCategory ?? item.assetCategory,
  );
  const id = toCleanText(item.id);

  if (
    isUniqueItemSignal(itemType) ||
    isUniqueItemSignal(category) ||
    assetCategory.length > 0 ||
    isUniqueItemSaleId(id)
  ) {
    return UNIQUE_ITEM_KIND;
  }

  return toDeliverySaleItemType(item.item_type || item.category);
};

export const buildDeliverySaleCartRows = (
  items: DeliveryCartItemLike[],
): {
  rows: DeliverySaleCartRow[];
  invalidItems: InvalidDeliverySaleCartItem[];
} => {
  const invalidItems: InvalidDeliverySaleCartItem[] = [];
  const rows = items.flatMap((item, index) => {
    const cartId = toCleanText(item?.id);
    const name = toCleanText(item?.name);
    const rawQuantity = Number(item?.quantity);
    const rawPrice = Number(item?.price);
    const quantity = Math.max(0, Math.floor(rawQuantity));
    const stockLimit = toStockLimit(item?.loaded_quantity);
    const itemType = inferDeliverySaleItemType(item);
    const itemId = toCleanText(item?.item_id) || cartId;
    const saleItemId = toCleanText(item?.sale_item_id) || cartId;
    const invalidId = cartId || `cart-line-${index}`;
    const invalidName = name || "Selected item";

    if (!name || !cartId || !itemId || !saleItemId) {
      invalidItems.push({
        id: invalidId,
        name: invalidName,
        reason: "The selected item is missing its product identifier.",
      });
      return [];
    }

    if (!Number.isFinite(rawQuantity) || quantity <= 0) {
      return [];
    }

    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      invalidItems.push({
        id: invalidId,
        name: invalidName,
        reason: "The selected item has an invalid price.",
      });
      return [];
    }

    if (
      itemType === UNIQUE_ITEM_KIND &&
      isUniqueItemSaleId(cartId) &&
      !toCleanText(item?.item_id)
    ) {
      invalidItems.push({
        id: invalidId,
        name: invalidName,
        reason:
          "The selected unique item is missing its unique item identifier.",
      });
      return [];
    }

    if (stockLimit !== null && quantity > stockLimit) {
      invalidItems.push({
        id: invalidId,
        name: invalidName,
        reason: `The selected quantity is ${quantity}, but only ${stockLimit} is available.`,
      });
      return [];
    }

    const unitPrice = toMoney(rawPrice);

    return [
      {
        key: `${cartId}:${itemId}:${itemType}:${unitPrice}:${index}`,
        cartId,
        saleItemId,
        itemId,
        itemType,
        name,
        image: item.image ?? null,
        quantity,
        unitPrice,
        category: toCleanText(item.category) || null,
        assetCategory:
          toCleanText(item.uniqueItemCategory ?? item.assetCategory) || null,
        remark: toCleanText(item.remark),
      },
    ];
  });

  return { rows, invalidItems };
};

export type DeliverySaleRequestItem = {
  itemId: string;
  quantity: number;
  unitPrice: number;
  remark?: string;
};

export type ActualDeliverySaleItem = DeliverySaleRequestItem & {
  itemType: DeliverySaleItemType;
};

export const toDeliverySaleRequestItems = (
  rows: DeliverySaleCartRow[],
): DeliverySaleRequestItem[] =>
  rows.map(({ saleItemId, quantity, unitPrice, remark }) => ({
    itemId: saleItemId,
    quantity,
    unitPrice,
    ...(remark ? { remark } : {}),
  }));

export const toActualDeliverySaleItems = (
  rows: DeliverySaleCartRow[],
): ActualDeliverySaleItem[] =>
  rows.map(({ itemId, itemType, quantity, unitPrice, remark }) => ({
    itemId,
    itemType,
    quantity,
    unitPrice,
    remark,
  }));
