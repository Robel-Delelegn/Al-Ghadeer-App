import ApiErrorText from "@/components/ApiErrorText";
import { VAT_MULTIPLIER, VAT_RATE } from "@/constants/tax";
import { authenticatedFetch } from "@/store/auth";
import {
  DirectSaleDraft,
  DirectSaleDraftProduct,
  useOrderStore,
} from "@/store/index";
import { Order } from "@/types/order";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { toTransferableAssetProduct } from "@/utils/assetTransfers";
import { formatDeliveryAddress } from "@/utils/deliveries";
import {
  DriverHistoryDetail,
  getDriverHistoryInvoiceDisplayId,
  getDriverHistoryPrimaryId,
  getDriverHistorySaleId,
  normalizeDriverHistoryDetail,
} from "@/utils/driverHistory";
import { resolveResourceUrl } from "@/utils/resources";
import { getTruckBulkItemMatchKeys } from "@/utils/truckLoad";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showWarningAlert } from "@/store/utils/alert";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

type PaymentMethod = "cash" | "wallet" | "check" | "credit";
type AssetAction = "deposit" | "deposit_return";

interface SaleRequestBody {
  customerId: string;
  siteId?: string;
  paymentMethod: PaymentMethod;
  payment_method?: PaymentMethod;
  remark?: string;
  totals?: {
    subtotal: number;
    vat: number;
    total: number;
  };
  retails?: {
    id: string;
    quantity: number;
    price: number;
  }[];
  assets?: {
    id: string;
    price: number;
  }[];
  refills?: {
    filledBottleId: string;
    filledQuantity: number;
    price: number;
  }[];
  check?: {
    checkNumber?: string;
    checkDate?: string;
    bankName?: string;
    accountNumber?: string;
  };
  depositsReturns?: {
    type: "deposit" | "deposit_return";
    itemId: string;
    depositKind: "asset" | "bottle";
    quantity: number;
    unitPrice: number;
  }[];
  creditCollections?: {
    amount: number;
    remark?: string;
  }[];
}

interface AssetOption {
  key: string;
  itemId: string;
  label: string;
  serial: string | null;
  category: string | null;
  imageUrl: string | null;
  source: "product" | "held";
}

interface BottleReturnOption {
  key: string;
  itemId: string;
  label: string;
  description: string | null;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

interface BottleDepositOption {
  key: string;
  itemId: string;
  label: string;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

const EMPTY_PRODUCTS: DirectSaleDraftProduct[] = [];
const EMPTY_HELD_ITEMS = { bottles: [], assets: [] };
const EMPTY_TRUCK_ASSETS: NonNullable<
  ReturnType<typeof useOrderStore.getState>["directSaleDraft"]
>["truckAssets"] = [];
const EMPTY_TRUCK_BULK_ITEMS: NonNullable<
  ReturnType<typeof useOrderStore.getState>["directSaleDraft"]
>["truckBulkItems"] = [];
const EMPTY_QUANTITIES: Record<string, number> = {};
const TRUCK_ASSET_PRODUCT_PREFIX = "sale-asset:";

const normalizeCategory = (category?: string | null) =>
  (category || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const getSaleLineType = (
  product: Pick<DirectSaleDraftProduct, "type" | "category">,
): "retail" | "asset" | "refill" => {
  const normalized = normalizeCategory(product.type);
  const normalizedCategory = normalizeCategory(product.category);
  if (normalized.includes("refill")) return "refill";
  if (normalized.includes("asset") || normalizedCategory.includes("asset")) {
    return "asset";
  }
  return "retail";
};

const getDirectSaleAssetId = (
  product: Pick<DirectSaleDraftProduct, "id" | "itemId" | "assetId">,
) => {
  if (product.assetId?.trim()) return product.assetId.trim();
  if (product.id.startsWith(TRUCK_ASSET_PRODUCT_PREFIX)) {
    const assetId = product.id
      .slice(TRUCK_ASSET_PRODUCT_PREFIX.length)
      .split(":")[0]
      ?.trim();
    if (assetId) return assetId;
  }
  return product.itemId;
};

const toEmptyRefillLabel = (label: string) => {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return "Refill Item (Empty)";
  if (/\(\s*empty\s*\)$/i.test(trimmedLabel)) return trimmedLabel;
  if (/\(\s*full\s*\)$/i.test(trimmedLabel)) {
    return trimmedLabel.replace(/\(\s*full\s*\)$/i, "(Empty)");
  }
  return `${trimmedLabel} (Empty)`;
};

const sanitizeMoneyInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fractionParts.join("")}`;
};

const parseMoneyDraft = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPriceValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const formatCustomerWalletBalance = (balance: number) => {
  if (balance < 0) {
    return `Outstanding balance: AED ${Math.abs(balance).toFixed(2)}`;
  }
  return `Wallet balance: AED ${balance.toFixed(2)}`;
};

const formatSiteAddress = (
  site: DirectSaleDraft["selectedSite"] | undefined,
) => {
  if (!site) return "";
  const parts = [
    site.streetName,
    site.buildingNo,
    site.flatNo,
    site.areaName,
    site.city,
  ]
    .map((part) => (part || "").trim())
    .filter((part) => part.length > 0);

  return parts.join(", ");
};

const getPaymentLabel = (method: PaymentMethod) => {
  if (method === "check") return "Check";
  if (method === "wallet") return "Wallet";
  if (method === "credit") return "Credit";
  return "Cash";
};

const DirectSaleConfirmation = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    directSaleDraft,
    setDirectSaleDraft,
    clearDirectSaleDraft,
    clearCart,
    selectOrder,
    setPaymentMethod,
    setLastConfirmPaymentResponse,
  } = useOrderStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [creditCollectionAmount, setCreditCollectionAmount] = useState(
    directSaleDraft?.creditCollectionAmount || "",
  );
  const [creditCollectionRemark, setCreditCollectionRemark] = useState(
    directSaleDraft?.creditCollectionRemark || "",
  );

  const products = directSaleDraft?.products ?? EMPTY_PRODUCTS;
  const quantities = directSaleDraft?.quantities ?? EMPTY_QUANTITIES;
  const heldItems = directSaleDraft?.heldItems ?? EMPTY_HELD_ITEMS;
  const truckAssets = directSaleDraft?.truckAssets ?? EMPTY_TRUCK_ASSETS;
  const truckBulkItems =
    directSaleDraft?.truckBulkItems ?? EMPTY_TRUCK_BULK_ITEMS;

  const selectedProducts = useMemo(
    () => products.filter((product) => (quantities[product.id] || 0) > 0),
    [products, quantities],
  );

  const assetOptions = useMemo<AssetOption[]>(() => {
    const transferableAssetProducts = products
      .filter((product) => product.type === "assets")
      .map((product) =>
        toTransferableAssetProduct({
          id: product.id,
          itemId: product.itemId,
          label: product.label,
          assetCategory: product.assetCategory,
          image_url: product.image_url,
          description: product.description,
          unit: product.unit,
        }),
      );
    const assetMetadataByItemId = new Map(
      transferableAssetProducts.map((asset) => [asset.itemId, asset]),
    );

    const productAssets = truckAssets.map((asset) => {
      const metadata =
        assetMetadataByItemId.get(asset.itemId) ||
        assetMetadataByItemId.get(asset.id);
      return {
        key: `product:${asset.id}:${asset.serial || asset.itemId}`,
        itemId: asset.itemId,
        label: asset.label || metadata?.label || "Truck Asset",
        serial: asset.serial ?? metadata?.serial ?? null,
        category: asset.category ?? metadata?.assetCategory ?? null,
        imageUrl:
          resolveResourceUrl(asset.image_url) || metadata?.imageUrl || null,
        source: "product" as const,
      };
    });

    const heldAssets = heldItems.assets.map((asset) => ({
      key: `held:${asset.itemId}:${asset.serial}`,
      itemId: asset.itemId,
      label: asset.label,
      serial: asset.serial,
      category: asset.assetCategory,
      imageUrl: resolveResourceUrl(asset.image_url),
      source: "held" as const,
    }));

    return [...productAssets, ...heldAssets];
  }, [heldItems.assets, products, truckAssets]);

  const bottleReturnOptions = useMemo<BottleReturnOption[]>(
    () =>
      heldItems.bottles.map((bottle) => ({
        key: `held:bottle:${bottle.emptyBottleId}`,
        itemId: bottle.emptyBottleId,
        label: toEmptyRefillLabel(bottle.label),
        description: bottle.description,
        unit: bottle.unit,
        imageUrl: resolveResourceUrl(bottle.image_url),
        availableQuantity: bottle.quantity,
      })),
    [heldItems.bottles],
  );

  const bottleDepositOptions = useMemo<BottleDepositOption[]>(() => {
    const refillProductsById = new Map<string, DirectSaleDraftProduct>();
    products
      .filter((product) => product.type === "refill")
      .forEach((product) => {
        refillProductsById.set(product.itemId, product);
        refillProductsById.set(product.id, product);
      });

    return truckBulkItems.reduce<BottleDepositOption[]>((options, bulkItem) => {
      const matchKeys = getTruckBulkItemMatchKeys(bulkItem);
      const refillProduct = matchKeys
        .map((key) => refillProductsById.get(key))
        .find((product): product is DirectSaleDraftProduct => Boolean(product));
      const availableQuantity = Math.max(0, bulkItem.quantity);
      if (
        availableQuantity <= 0 ||
        (!bulkItem.isRefillableBottle && !refillProduct)
      ) {
        return options;
      }
      options.push({
        key: `truck:bottle:${bulkItem.id}`,
        itemId: bulkItem.emptyBottleId || bulkItem.itemId || bulkItem.id,
        label: toEmptyRefillLabel(refillProduct?.label || bulkItem.label),
        unit: refillProduct?.unit ?? bulkItem.unit,
        imageUrl:
          refillProduct?.image_url || resolveResourceUrl(bulkItem.image_url),
        availableQuantity,
      });
      return options;
    }, []);
  }, [products, truckBulkItems]);

  const selectedAssetEntries = useMemo(
    () =>
      assetOptions
        .map((asset) => {
          const draft = directSaleDraft?.assetDrafts[asset.key];
          if (!draft?.selected) return null;
          const price = toPriceValue(draft.price);
          return {
            ...asset,
            action:
              asset.source === "held"
                ? ("deposit_return" as const)
                : ("deposit" as const),
            price: price ?? Number.NaN,
          };
        })
        .filter(
          (
            asset,
          ): asset is AssetOption & { action: AssetAction; price: number } =>
            asset !== null,
        ),
    [assetOptions, directSaleDraft?.assetDrafts],
  );

  const selectedBottleReturnEntries = useMemo(
    () =>
      bottleReturnOptions
        .map((bottle) => {
          const quantity =
            directSaleDraft?.bottleReturnQuantities[bottle.key] ?? 0;
          if (quantity <= 0) return null;
          const priceDraft =
            directSaleDraft?.bottleReturnPrices?.[bottle.key] ?? "0.00";
          const unitPrice = toPriceValue(priceDraft);
          return {
            ...bottle,
            quantity,
            priceDraft,
            unitPrice: unitPrice ?? Number.NaN,
          };
        })
        .filter(
          (
            bottle,
          ): bottle is BottleReturnOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [
      bottleReturnOptions,
      directSaleDraft?.bottleReturnPrices,
      directSaleDraft?.bottleReturnQuantities,
    ],
  );

  const selectedBottleDepositEntries = useMemo(
    () =>
      bottleDepositOptions
        .map((bottle) => {
          const quantity =
            directSaleDraft?.bottleDepositQuantities[bottle.key] ?? 0;
          if (quantity <= 0) return null;
          const priceDraft =
            directSaleDraft?.bottleDepositPrices[bottle.key] ?? "0.00";
          const unitPrice = toPriceValue(priceDraft);
          return {
            ...bottle,
            quantity,
            priceDraft,
            unitPrice: unitPrice ?? Number.NaN,
          };
        })
        .filter(
          (
            bottle,
          ): bottle is BottleDepositOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [
      bottleDepositOptions,
      directSaleDraft?.bottleDepositPrices,
      directSaleDraft?.bottleDepositQuantities,
    ],
  );

  const subtotal = useMemo(
    () =>
      selectedProducts.reduce(
        (sum, product) =>
          sum + product.pricePerUnit * (quantities[product.id] || 0),
        0,
      ),
    [quantities, selectedProducts],
  );
  const vat = subtotal * VAT_RATE;
  const totalAmount = subtotal + vat;
  const bottleReturnCount = selectedBottleReturnEntries.reduce(
    (sum, bottle) => sum + bottle.quantity,
    0,
  );
  const bottleDepositCount = selectedBottleDepositEntries.reduce(
    (sum, bottle) => sum + bottle.quantity,
    0,
  );
  const selectedMovementCount =
    selectedAssetEntries.length + bottleReturnCount + bottleDepositCount;
  const assetDepositValue = selectedAssetEntries.reduce((sum, asset) => {
    if (asset.action !== "deposit" || !Number.isFinite(asset.price)) {
      return sum;
    }
    return sum + asset.price;
  }, 0);
  const assetReturnValue = selectedAssetEntries.reduce((sum, asset) => {
    if (asset.action !== "deposit_return" || !Number.isFinite(asset.price)) {
      return sum;
    }
    return sum + asset.price;
  }, 0);
  const bottleDepositValue = selectedBottleDepositEntries.reduce(
    (sum, bottle) =>
      Number.isFinite(bottle.unitPrice)
        ? sum + bottle.unitPrice * bottle.quantity
        : sum,
    0,
  );
  const bottleReturnValue = selectedBottleReturnEntries.reduce(
    (sum, bottle) =>
      Number.isFinite(bottle.unitPrice)
        ? sum + bottle.unitPrice * bottle.quantity
        : sum,
    0,
  );
  const depositValue = assetDepositValue + bottleDepositValue;
  const returnValue = assetReturnValue + bottleReturnValue;
  const parsedCreditCollectionAmount = useMemo(
    () => parseMoneyDraft(creditCollectionAmount),
    [creditCollectionAmount],
  );
  const normalizedCreditCollectionRemark = creditCollectionRemark.trim();
  const hasCreditCollectionInput =
    creditCollectionAmount.trim().length > 0 ||
    normalizedCreditCollectionRemark.length > 0;
  const hasCreditCollectionDraft =
    parsedCreditCollectionAmount !== null && parsedCreditCollectionAmount > 0;
  const creditCollectionTotal = hasCreditCollectionDraft
    ? parsedCreditCollectionAmount || 0
    : 0;
  const receiptTotal =
    totalAmount + depositValue - returnValue + creditCollectionTotal;
  const hasIncompleteCreditCollection =
    hasCreditCollectionInput && !hasCreditCollectionDraft;
  const hasAnythingToConfirm =
    selectedProducts.length > 0 ||
    selectedMovementCount > 0 ||
    hasCreditCollectionDraft;

  const handleChangeCreditCollectionAmount = useCallback((value: string) => {
    setCreditCollectionAmount(sanitizeMoneyInput(value));
  }, []);

  const persistCreditCollection = useCallback(() => {
    if (!directSaleDraft) return;
    setDirectSaleDraft({
      ...directSaleDraft,
      creditCollectionAmount,
      creditCollectionRemark,
    });
  }, [
    creditCollectionAmount,
    creditCollectionRemark,
    directSaleDraft,
    setDirectSaleDraft,
  ]);

  const handleBack = useCallback(() => {
    persistCreditCollection();
    router.replace("/(root)/(tabs)/direct-sale-bottles-assets");
  }, [persistCreditCollection, router]);

  const handleEditProducts = useCallback(() => {
    persistCreditCollection();
    router.push({
      pathname: "/(root)/(tabs)/direct-sales",
      params: { backTo: "direct-sale-confirmation" },
    });
  }, [persistCreditCollection, router]);

  const handleEditBottlesAssets = useCallback(() => {
    persistCreditCollection();
    router.push({
      pathname: "/(root)/(tabs)/direct-sale-bottles-assets",
      params: { backTo: "direct-sale-confirmation" },
    });
  }, [persistCreditCollection, router]);

  const handleConfirmSale = useCallback(async () => {
    if (!directSaleDraft) {
      showWarningAlert("Direct Sale", "Direct sale draft not found.");
      return;
    }
    if (!hasAnythingToConfirm) {
      showWarningAlert(
        "No Items",
        "Please select at least one product, bottle or asset movement, or credit collection.",
      );
      return;
    }
    if (!directSaleDraft.customerData?.id) {
      showWarningAlert("Customer Required", "Select a customer first.");
      return;
    }
    if (hasIncompleteCreditCollection) {
      showWarningAlert(
        "Credit Collection",
        "Enter a valid amount before confirming the credit collection.",
      );
      return;
    }

    const invalidAsset = selectedAssetEntries.find(
      (asset) => !Number.isFinite(asset.price) || asset.price < 0,
    );
    if (invalidAsset) {
      showWarningAlert(
        "Invalid Asset Price",
        `Enter a valid price for ${invalidAsset.label}.`,
      );
      return;
    }

    const invalidBottleDeposit = selectedBottleDepositEntries.find(
      (bottle) => !Number.isFinite(bottle.unitPrice) || bottle.unitPrice < 0,
    );
    if (invalidBottleDeposit) {
      showWarningAlert(
        "Invalid Bottle Deposit Price",
        `Enter a valid price for ${invalidBottleDeposit.label}.`,
      );
      return;
    }
    const invalidBottleReturn = selectedBottleReturnEntries.find(
      (bottle) => !Number.isFinite(bottle.unitPrice) || bottle.unitPrice < 0,
    );
    if (invalidBottleReturn) {
      showWarningAlert(
        "Invalid Bottle Return Value",
        `Enter a valid value for ${invalidBottleReturn.label}.`,
      );
      return;
    }

    setIsProcessing(true);
    setApiError(null);
    try {
      const retails: NonNullable<SaleRequestBody["retails"]> = [];
      const assets: NonNullable<SaleRequestBody["assets"]> = [];
      const refills: NonNullable<SaleRequestBody["refills"]> = [];
      const depositsReturns: NonNullable<SaleRequestBody["depositsReturns"]> = [
        ...selectedAssetEntries.map((asset) => ({
          type: asset.action,
          itemId: asset.itemId,
          depositKind: "asset" as const,
          quantity: 1,
          unitPrice: Number(asset.price.toFixed(2)),
        })),
        ...selectedBottleDepositEntries.map((bottle) => ({
          type: "deposit" as const,
          itemId: bottle.itemId,
          depositKind: "bottle" as const,
          quantity: bottle.quantity,
          unitPrice: Number(bottle.unitPrice.toFixed(2)),
        })),
        ...selectedBottleReturnEntries.map((bottle) => ({
          type: "deposit_return" as const,
          itemId: bottle.itemId,
          depositKind: "bottle" as const,
          quantity: bottle.quantity,
          unitPrice: Number(bottle.unitPrice.toFixed(2)),
        })),
      ];

      selectedProducts.forEach((product) => {
        const quantity = quantities[product.id] || 0;
        if (quantity <= 0) return;
        const unitPrice = Number(product.pricePerUnit);
        if (!Number.isFinite(unitPrice)) return;

        const lineType = getSaleLineType(product);
        if (lineType === "refill") {
          refills.push({
            filledBottleId: product.itemId,
            filledQuantity: quantity,
            price: unitPrice,
          });
          return;
        }

        if (lineType === "asset") {
          const assetQuantity = Math.max(0, Math.floor(quantity));
          for (let index = 0; index < assetQuantity; index += 1) {
            assets.push({
              id: getDirectSaleAssetId(product),
              price: unitPrice,
            });
          }
          return;
        }

        retails.push({
          id: product.itemId,
          quantity,
          price: unitPrice,
        });
      });

      const selectedCreditCollections =
        hasCreditCollectionDraft && parsedCreditCollectionAmount !== null
          ? [
              {
                amount: Number(parsedCreditCollectionAmount.toFixed(2)),
                ...(normalizedCreditCollectionRemark
                  ? { remark: normalizedCreditCollectionRemark }
                  : {}),
              },
            ]
          : [];

      const saleSubtotal =
        retails.reduce((sum, item) => sum + item.price * item.quantity, 0) +
        assets.reduce((sum, item) => sum + item.price, 0) +
        refills.reduce(
          (sum, item) => sum + item.price * item.filledQuantity,
          0,
        );
      const saleVat = saleSubtotal * VAT_RATE;
      const saleTotalForPayload = saleSubtotal + saleVat;

      const saleData: SaleRequestBody = {
        customerId: directSaleDraft.customerData.id,
        paymentMethod: directSaleDraft.paymentMethod,
        payment_method: directSaleDraft.paymentMethod,
        totals: {
          subtotal: Number(saleSubtotal.toFixed(2)),
          vat: Number(saleVat.toFixed(2)),
          total: Number(saleTotalForPayload.toFixed(2)),
        },
      };

      const normalizedRemark = directSaleDraft.remark.trim();
      if (normalizedRemark) {
        saleData.remark = normalizedRemark;
      }
      const selectedSiteId = directSaleDraft.selectedSite?.id?.trim();
      if (selectedSiteId) {
        saleData.siteId = selectedSiteId;
      }
      if (retails.length > 0) {
        saleData.retails = retails;
      }
      if (assets.length > 0) {
        saleData.assets = assets;
      }
      if (refills.length > 0) {
        saleData.refills = refills;
      }
      if (depositsReturns.length > 0) {
        saleData.depositsReturns = depositsReturns;
      }
      if (selectedCreditCollections.length > 0) {
        saleData.creditCollections = selectedCreditCollections;
      }
      if (directSaleDraft.paymentMethod === "check") {
        saleData.check = {
          ...(directSaleDraft.checkDetails.checkNumber.trim()
            ? { checkNumber: directSaleDraft.checkDetails.checkNumber.trim() }
            : {}),
          ...(directSaleDraft.checkDetails.checkDate.trim()
            ? { checkDate: directSaleDraft.checkDetails.checkDate.trim() }
            : {}),
          ...(directSaleDraft.checkDetails.bankName.trim()
            ? { bankName: directSaleDraft.checkDetails.bankName.trim() }
            : {}),
          ...(directSaleDraft.checkDetails.accountNumber.trim()
            ? {
                accountNumber:
                  directSaleDraft.checkDetails.accountNumber.trim(),
              }
            : {}),
        };
      }

      const response = await authenticatedFetch(
        `${API_BASE_URL}/adhoc-delivery`,
        {
          method: "POST",
          body: JSON.stringify(saleData),
        },
      );
      const parseResult =
        await parseApiResponseWithSoftError<DriverHistoryDetail>(response);
      if (!parseResult.ok) {
        setApiError(parseResult.error);
        return;
      }

      const data = normalizeDriverHistoryDetail(parseResult.data);
      if (!data) {
        setApiError("Invalid response from server.");
        return;
      }

      clearCart();
      const saleDetail = data.sale;
      const saleItems = Array.isArray(saleDetail?.items)
        ? saleDetail.items
        : [];
      const selectedProductLookup = new Map<string, DirectSaleDraftProduct>();
      selectedProducts.forEach((product) => {
        const lineType = getSaleLineType(product);
        const keys = [
          product.id,
          product.itemId,
          product.assetId,
          lineType === "asset" ? getDirectSaleAssetId(product) : null,
        ];

        keys.forEach((key) => {
          const cleanKey = key?.trim();
          if (cleanKey && !selectedProductLookup.has(cleanKey)) {
            selectedProductLookup.set(cleanKey, product);
          }
        });
      });
      const getSelectedProductForSaleItem = (
        item: (typeof saleItems)[number],
      ) =>
        selectedProductLookup.get(item.itemId) ||
        selectedProductLookup.get(item.id) ||
        null;
      const getSaleItemDisplayLabel = (item: (typeof saleItems)[number]) => {
        const selectedProduct = getSelectedProductForSaleItem(item);
        return (
          selectedProduct?.label || item.label || item.assetCategory || "Asset"
        );
      };
      const cartItemsFromSale =
        saleItems.length > 0
          ? saleItems.map((item) => {
              const selectedProduct = getSelectedProductForSaleItem(item);
              const imageUrl =
                resolveResourceUrl(item.imageUrl) ||
                resolveResourceUrl(selectedProduct?.image_url);

              return {
                id: item.itemId || item.id,
                item_id: item.itemId || item.id,
                item_type: item.itemType,
                name: getSaleItemDisplayLabel(item),
                image: imageUrl ? { uri: imageUrl } : null,
                price: item.unitPrice,
                quantity: item.quantity,
                currency: "AED" as const,
                category: selectedProduct?.type || item.itemType,
                assetCategory:
                  selectedProduct?.assetCategory ?? item.assetCategory ?? null,
              };
            })
          : selectedProducts.map((product) => {
              const lineType = getSaleLineType(product);
              return {
                id: product.id,
                item_id:
                  lineType === "asset"
                    ? getDirectSaleAssetId(product)
                    : product.itemId,
                item_type: lineType,
                name: product.label,
                image: resolveResourceUrl(product.image_url)
                  ? { uri: resolveResourceUrl(product.image_url)! }
                  : null,
                price: product.pricePerUnit,
                quantity: quantities[product.id],
                currency: "AED" as const,
                category: product.type || "",
                assetCategory: product.assetCategory ?? null,
              };
            });
      const selectedRentItems: NonNullable<Order["rent_items"]> = [
        ...selectedAssetEntries.map((asset) => ({
          id: asset.key,
          item_id: asset.itemId,
          name: asset.label,
          category: "deposit" as const,
          price: asset.price,
          quantity: 1,
          image_url: asset.imageUrl || "",
          serial: asset.serial,
          in_truck: true,
          deposit_action: asset.action,
          deposit_kind: "asset" as const,
          action_source:
            asset.source === "held"
              ? ("held_item" as const)
              : ("product_asset" as const),
          asset_category: asset.category,
        })),
        ...selectedBottleDepositEntries.map((bottle) => ({
          id: bottle.key,
          item_id: bottle.itemId,
          name: bottle.label,
          category: "deposit" as const,
          price: Number(bottle.unitPrice.toFixed(2)),
          quantity: bottle.quantity,
          image_url: bottle.imageUrl || "",
          in_truck: true,
          deposit_action: "deposit" as const,
          deposit_kind: "bottle" as const,
          action_source: "product_asset" as const,
          unit: bottle.unit,
          other_action_type: "item-movement-to-customer" as const,
          other_action_item_type: "bottle" as const,
        })),
        ...selectedBottleReturnEntries.map((bottle) => ({
          id: bottle.key,
          item_id: bottle.itemId,
          name: bottle.label,
          category: "deposit" as const,
          price: Number(bottle.unitPrice.toFixed(2)),
          quantity: bottle.quantity,
          image_url: bottle.imageUrl || "",
          in_truck: true,
          deposit_action: "deposit_return" as const,
          deposit_kind: "bottle" as const,
          action_source: "held_item" as const,
          unit: bottle.unit,
          description: bottle.description,
        })),
      ];

      const formattedServerAddress = formatDeliveryAddress(data.address);
      const saleId = getDriverHistorySaleId(data);
      const invoiceNumber = getDriverHistoryInvoiceDisplayId(data);
      const orderNumber = getDriverHistoryPrimaryId(data);
      const responsePaymentMethod =
        saleDetail?.payment?.method || directSaleDraft.paymentMethod;
      const saleTotal = saleDetail?.totals.total ?? totalAmount;
      const receiptTotalForOrder =
        saleTotal + depositValue - returnValue + creditCollectionTotal;
      const orderAddress =
        (formattedServerAddress !== "No address"
          ? formattedServerAddress
          : "") ||
        formatSiteAddress(directSaleDraft.selectedSite) ||
        directSaleDraft.selectedSite?.siteName ||
        directSaleDraft.location?.address ||
        "N/A";

      const newOrder: Order = {
        id: data.id,
        order_number: orderNumber,
        display_id: data.displayId || undefined,
        invoice_number: invoiceNumber,
        status: "delivered",
        date: data.createdAt,
        customer_id: data.customer.id,
        customer_name: data.customer.name,
        customer_phone: data.customer.phone,
        customer_email: data.customer.email ?? undefined,
        customer_address: orderAddress,
        latitude: data.address.latitude ?? undefined,
        longitude: data.address.longitude ?? undefined,
        requires_signature: Boolean(data.customer.requires_signature),
        requires_immediate_invoice: Boolean(
          data.customer.requires_immediate_invoice,
        ),
        total_amount: receiptTotalForOrder,
        payment_method: responsePaymentMethod,
        rent_items: selectedRentItems,
        ...(selectedCreditCollections.length > 0
          ? { draft_credit_collections: selectedCreditCollections }
          : {}),
        products:
          saleItems.length > 0
            ? saleItems.map((item) => {
                const selectedProduct = getSelectedProductForSaleItem(item);
                return {
                  id: item.itemId || item.id,
                  item_id: selectedProduct?.itemId || item.itemId || item.id,
                  name: getSaleItemDisplayLabel(item),
                  quantity: item.quantity,
                  price: item.unitPrice,
                  type: item.itemType,
                  category: selectedProduct?.type || item.itemType,
                  asset_category:
                    selectedProduct?.assetCategory ?? item.assetCategory,
                };
              })
            : selectedProducts.map((product) => ({
                id: product.id,
                item_id: product.itemId,
                name: product.label,
                quantity: quantities[product.id],
                price: product.pricePerUnit,
                type: product.type,
                category: product.type,
                asset_category: product.assetCategory,
              })),
      };

      const store = useOrderStore.getState();
      useOrderStore.setState({
        completedOrders: [...store.completedOrders, newOrder],
        cartItems: cartItemsFromSale,
      });

      selectOrder(newOrder.id);
      setPaymentMethod(responsePaymentMethod);
      setLastConfirmPaymentResponse({
        orderId: newOrder.id,
        sale_id: saleId,
        invoice_number: invoiceNumber,
        detail: data,
        order_number: orderNumber,
      });
      clearDirectSaleDraft();
      router.replace({
        pathname: "/(root)/(tabs)/payment-receipt",
        params: { view: "delivery-note" },
      });
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Failed to confirm sale.",
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    clearCart,
    clearDirectSaleDraft,
    directSaleDraft,
    hasAnythingToConfirm,
    hasCreditCollectionDraft,
    hasIncompleteCreditCollection,
    normalizedCreditCollectionRemark,
    parsedCreditCollectionAmount,
    quantities,
    router,
    selectOrder,
    selectedAssetEntries,
    selectedBottleDepositEntries,
    selectedBottleReturnEntries,
    selectedProducts,
    setLastConfirmPaymentResponse,
    setPaymentMethod,
    creditCollectionTotal,
    depositValue,
    returnValue,
    totalAmount,
  ]);

  if (!directSaleDraft) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.emptyIconBox}>
          <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
        </View>
        <Text style={styles.emptyTitle}>Direct sale draft not found</Text>
        <TouchableOpacity
          style={styles.primaryInlineButton}
          onPress={() => router.replace("/(root)/(tabs)/direct-sales")}
        >
          <Text style={styles.primaryInlineButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const customerName = directSaleDraft.customerData?.name || "Customer";
  const customerPhone = directSaleDraft.customerData?.phone || "-";
  const customerWalletBalance =
    toPriceValue(directSaleDraft.customerData?.walletBalance) ?? 0;
  const selectedSiteLabel =
    directSaleDraft.selectedSite?.siteName ||
    formatSiteAddress(directSaleDraft.selectedSite) ||
    directSaleDraft.location?.address ||
    "No site selected";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Confirm Sale</Text>
          <Text style={styles.headerSubtitle}>{customerName}</Text>
        </View>
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>
            {selectedProducts.length + selectedMovementCount}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: Math.max(insets.bottom, 20) + 92 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ApiErrorText error={apiError} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerPhone}>{customerPhone}</Text>
              <Text
                style={[
                  styles.customerWalletBalance,
                  customerWalletBalance < 0
                    ? styles.customerWalletBalanceNegative
                    : styles.customerWalletBalancePositive,
                ]}
              >
                {formatCustomerWalletBalance(customerWalletBalance)}
              </Text>
            </View>
          </View>
          <View style={styles.addressBox}>
            <View style={styles.addressIcon}>
              <Ionicons name="location" size={12} color="#6B7280" />
            </View>
            <Text style={styles.addressText} numberOfLines={2}>
              {selectedSiteLabel}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity onPress={handleEditProducts} activeOpacity={0.7}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          {selectedProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cart-outline" size={24} color="#D1D5DB" />
              <Text style={styles.emptyText}>No sale items selected</Text>
            </View>
          ) : (
            selectedProducts.map((product, index) => (
              <View key={product.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemIconBox}>
                    {product.image_url ? (
                      <Image
                        source={{ uri: product.image_url }}
                        style={styles.itemImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="water" size={14} color="#0EA5E9" />
                    )}
                  </View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {product.label}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Qty: {quantities[product.id] || 0}
                    </Text>
                  </View>
                  <View style={styles.itemPricing}>
                    <Text style={styles.itemPrice}>
                      AED{" "}
                      {(
                        product.pricePerUnit *
                        VAT_MULTIPLIER *
                        (quantities[product.id] || 0)
                      ).toFixed(2)}
                    </Text>
                    <Text style={styles.itemUnitPrice}>
                      @ {(product.pricePerUnit * VAT_MULTIPLIER).toFixed(2)}
                    </Text>
                  </View>
                </View>
                {index < selectedProducts.length - 1 ? (
                  <View style={styles.itemDivider} />
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Bottles & Assets</Text>
            <TouchableOpacity
              onPress={handleEditBottlesAssets}
              activeOpacity={0.7}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          {selectedMovementCount === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={24} color="#D1D5DB" />
              <Text style={styles.emptyText}>No bottle or asset movement</Text>
            </View>
          ) : (
            <View style={styles.itemsList}>
              {selectedBottleReturnEntries.map((bottle, index) => (
                <MovementRow
                  key={bottle.key}
                  label={bottle.label}
                  meta={`Bottle Return - Qty: ${bottle.quantity}`}
                  price={`- AED ${(bottle.unitPrice * bottle.quantity).toFixed(2)}`}
                  icon="return-up-back-outline"
                  tone="return"
                  showDivider={
                    index <
                    selectedBottleReturnEntries.length +
                      selectedBottleDepositEntries.length +
                      selectedAssetEntries.length -
                      1
                  }
                />
              ))}
              {selectedBottleDepositEntries.map((bottle, index) => (
                <MovementRow
                  key={bottle.key}
                  label={bottle.label}
                  meta={`Bottle Deposit - Qty: ${bottle.quantity}`}
                  price={`AED ${(bottle.unitPrice * bottle.quantity).toFixed(2)}`}
                  icon="arrow-redo-outline"
                  tone="leave"
                  showDivider={
                    selectedBottleReturnEntries.length + index <
                    selectedBottleReturnEntries.length +
                      selectedBottleDepositEntries.length +
                      selectedAssetEntries.length -
                      1
                  }
                />
              ))}
              {selectedAssetEntries.map((asset, index) => (
                <MovementRow
                  key={asset.key}
                  label={asset.label}
                  meta={`${asset.action === "deposit_return" ? "Asset Return" : "Asset Deposit"}${asset.serial ? ` - S/N ${asset.serial}` : ""}`}
                  price={`${asset.action === "deposit_return" ? "- " : ""}AED ${asset.price.toFixed(2)}`}
                  icon={
                    asset.action === "deposit_return"
                      ? "return-up-back-outline"
                      : "arrow-redo-outline"
                  }
                  tone={asset.action === "deposit_return" ? "return" : "leave"}
                  showDivider={index < selectedAssetEntries.length - 1}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>
          <View style={styles.paymentRow}>
            <View style={styles.paymentIconBox}>
              <Ionicons name="cash-outline" size={20} color="#2563EB" />
            </View>
            <View style={styles.paymentCopy}>
              <Text style={styles.paymentLabel}>
                {getPaymentLabel(directSaleDraft.paymentMethod)}
              </Text>
              {directSaleDraft.paymentMethod === "check" ? (
                <Text style={styles.paymentMeta}>
                  {directSaleDraft.checkDetails.checkNumber ||
                    "No check number"}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Credit Collection</Text>
            {hasCreditCollectionDraft ? (
              <View style={styles.collectionBadge}>
                <Text style={styles.collectionBadgeText}>Recorded</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardHelperText}>
            Record recovered balance from this customer. This is separate from
            the new sale payment.
          </Text>
          <View style={styles.collectionFields}>
            <View style={styles.collectionField}>
              <Text style={styles.collectionLabel}>Amount</Text>
              <View
                style={[
                  styles.collectionAmountRow,
                  hasIncompleteCreditCollection &&
                    styles.collectionAmountRowError,
                ]}
              >
                <Text style={styles.collectionPrefix}>AED</Text>
                <TextInput
                  style={styles.collectionAmountInput}
                  value={creditCollectionAmount}
                  onChangeText={handleChangeCreditCollectionAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.collectionField}>
              <Text style={styles.collectionLabel}>Remark</Text>
              <TextInput
                style={styles.collectionRemarkInput}
                value={creditCollectionRemark}
                onChangeText={setCreditCollectionRemark}
                placeholder="Reference or note"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (Excluding VAT)</Text>
            <Text style={styles.summaryValue}>AED {subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>VAT (5%)</Text>
            <Text style={styles.summaryValue}>AED {vat.toFixed(2)}</Text>
          </View>
          {depositValue > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bottle/Asset Deposits</Text>
              <Text style={styles.summaryValue}>
                AED {depositValue.toFixed(2)}
              </Text>
            </View>
          ) : null}
          {returnValue > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bottle/Asset Returns</Text>
              <Text style={styles.summaryValue}>
                - AED {returnValue.toFixed(2)}
              </Text>
            </View>
          ) : null}
          {creditCollectionTotal > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cash Collection</Text>
              <Text style={styles.summaryValue}>
                AED {creditCollectionTotal.toFixed(2)}
              </Text>
            </View>
          ) : null}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Receipt Total</Text>
            <Text style={styles.totalValue}>AED {receiptTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Receipt Total</Text>
            <Text style={styles.actionTotal}>
              AED {receiptTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.continueButton,
              (!hasAnythingToConfirm || isProcessing) &&
                styles.continueButtonDisabled,
            ]}
            onPress={handleConfirmSale}
            disabled={!hasAnythingToConfirm || isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>Confirm Sale</Text>
                <View style={styles.continueArrow}>
                  <Ionicons name="arrow-forward" size={16} color="#1E40AF" />
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const MovementRow = ({
  label,
  meta,
  price,
  icon,
  tone,
  showDivider,
}: {
  label: string;
  meta: string;
  price: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "return" | "leave";
  showDivider: boolean;
}) => (
  <View>
    <View style={styles.itemRow}>
      <View
        style={[
          styles.itemIconBox,
          tone === "return"
            ? styles.movementIconReturn
            : styles.movementIconLeave,
        ]}
      >
        <Ionicons
          name={icon}
          size={15}
          color={tone === "return" ? "#059669" : "#2563EB"}
        />
      </View>
      <View style={styles.itemDetails}>
        <Text style={styles.itemName} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.itemMeta}>{meta}</Text>
      </View>
      <Text style={styles.itemPrice}>{price}</Text>
    </View>
    {showDivider ? <View style={styles.itemDivider} /> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  primaryInlineButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryInlineButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
    marginTop: 2,
  },
  cartBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  cartBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  editLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  customerInitial: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
  },
  customerPhone: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  customerWalletBalance: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  customerWalletBalancePositive: {
    color: "#0F766E",
  },
  customerWalletBalanceNegative: {
    color: "#DC2626",
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
  },
  addressIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 22,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  itemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  itemPricing: {
    alignItems: "flex-end",
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
  },
  itemUnitPrice: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 48,
  },
  itemsList: {
    gap: 0,
  },
  movementIconReturn: {
    backgroundColor: "#ECFDF5",
  },
  movementIconLeave: {
    backgroundColor: "#EFF6FF",
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  paymentIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  paymentCopy: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E40AF",
  },
  paymentMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  cardHelperText: {
    marginTop: -4,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: "#64748B",
  },
  collectionBadge: {
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  collectionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  collectionFields: {
    gap: 12,
  },
  collectionField: {
    gap: 6,
  },
  collectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  collectionAmountRow: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  collectionAmountRowError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  collectionPrefix: {
    marginRight: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  collectionAmountInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  collectionRemarkInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
    color: "#0F172A",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E40AF",
  },
  actionSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionSummary: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionTotal: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.5,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 14,
    gap: 10,
  },
  continueButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  continueArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default DirectSaleConfirmation;
