import ApiErrorText from "@/components/ApiErrorText";
import { useOrderStore } from "@/store/index";
import { useAuthStore, authenticatedFetch } from "@/store/auth";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { resolveResourceUrl } from "@/utils/resources";
import { extractTruckAssets, TruckAsset } from "@/utils/truckLoad";
import { Product } from "@/types/order";
import { getProductQuantity, getProductCategory } from "@/utils/orderUtils";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

interface ServerProduct {
  id: string;
  itemId: string;
  type: "retail" | "refill" | "assets" | "other";
  name: string;
  price: number;
  unit: string | null;
  image_url: string | null;
  description: string | null;
  category: string;
  assetCategory?: string | null;
  originalPrice?: number;
  badge?: string;
  loaded_quantity?: number;
}

type ProductGroup = "wholesale" | "refill" | "assets" | "other";

const EMPTY_BOTTLE_PRODUCT_PREFIX = "sale-empty-bottle:";
const TRUCK_ASSET_PRODUCT_PREFIX = "sale-asset:";
const EMPTY_BOTTLE_CATEGORY = "empty_bottle";

const normalizeProductType = (value: unknown): ServerProduct["type"] => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "refill") return "refill";
  if (raw === "retail") return "retail";
  if (raw === "assets" || raw === "asset") return "assets";
  return "other";
};

const normalizeCategory = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const isEmptyBottleSaleProduct = (
  product: Pick<ServerProduct, "id" | "category">,
) =>
  product.id.startsWith(EMPTY_BOTTLE_PRODUCT_PREFIX) ||
  normalizeCategory(product.category) ===
    normalizeCategory(EMPTY_BOTTLE_CATEGORY);

const isTruckAssetSaleProduct = (product: Pick<ServerProduct, "id">) =>
  product.id.startsWith(TRUCK_ASSET_PRODUCT_PREFIX);

const getProductStockGroupKey = (
  product: Pick<ServerProduct, "id" | "itemId" | "type" | "category">,
) => {
  if (isTruckAssetSaleProduct(product)) {
    return product.id;
  }

  if (product.type === "refill") {
    return `bottle:${product.itemId || product.id}`;
  }

  return product.id;
};

const getProductItemType = (
  product: Pick<ServerProduct, "type">,
): Product["item_type"] => {
  if (product.type === "assets") return "asset";
  if (product.type === "refill") return "refill";
  return "retail";
};

const getProductGroup = (
  product: Pick<ServerProduct, "type" | "category">,
): ProductGroup => {
  const normalizedType = normalizeCategory(product.type);
  const normalizedCategory = normalizeCategory(product.category);

  if (
    normalizedType.includes("asset") ||
    normalizedCategory.includes("asset")
  ) {
    return "assets";
  }

  if (
    normalizedType.includes("refill") ||
    normalizedCategory.includes("refill")
  ) {
    return "refill";
  }

  if (
    normalizedType.includes("retail") ||
    normalizedCategory.includes("retail")
  ) {
    return "wholesale";
  }

  return "other";
};

const toStringValue = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableStringValue = (value: unknown): string | null => {
  const text = toStringValue(value);
  return text.length > 0 ? text : null;
};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeProductRecord = (
  raw: unknown,
  fallbackType?: string,
): ServerProduct | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = toStringValue(source.id);
  const itemId =
    toStringValue(source.itemId) || toStringValue(source.item_id) || id;
  const name = toStringValue(source.label) || toStringValue(source.name);
  const price = toNumberValue(
    source.pricePerUnit ?? source.price_per_unit ?? source.price,
  );
  const type = normalizeProductType(source.type ?? fallbackType);

  if (!id || !itemId || !name || price === null) {
    return null;
  }

  return {
    id,
    itemId,
    type,
    name,
    price,
    unit: toNullableStringValue(source.unit),
    image_url: toNullableStringValue(source.image_url),
    description: toNullableStringValue(source.description),
    category:
      type === "assets"
        ? toStringValue(source.assetCategory ?? source.asset_category) ||
          "Assets"
        : type,
    assetCategory: toNullableStringValue(
      source.assetCategory ?? source.asset_category,
    ),
    originalPrice: toNumberValue(source.originalPrice) ?? undefined,
    badge: toStringValue(source.badge) || undefined,
    loaded_quantity:
      toNumberValue(source.loaded_quantity ?? source.available_stock) ??
      undefined,
  };
};

const normalizeProductsPayload = (payload: unknown): ServerProduct[] => {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => normalizeProductRecord(entry))
      .filter((entry): entry is ServerProduct => entry !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const normalized: ServerProduct[] = [];
  Object.entries(payload as Record<string, unknown>).forEach(
    ([categoryKey, products]) => {
      if (!Array.isArray(products)) return;
      products.forEach((entry) => {
        const record = normalizeProductRecord(entry, categoryKey);
        if (record) normalized.push(record);
      });
    },
  );
  return normalized;
};

const buildSellableProducts = (
  baseProducts: ServerProduct[],
  truckAssets: TruckAsset[],
): ServerProduct[] => {
  const cleanBaseProducts = baseProducts.filter(
    (product) =>
      !isEmptyBottleSaleProduct(product) && !isTruckAssetSaleProduct(product),
  );

  const assetProductsById = new Map<string, ServerProduct>();
  cleanBaseProducts
    .filter((product) => product.type === "assets")
    .forEach((product) => {
      assetProductsById.set(product.itemId, product);
      assetProductsById.set(product.id, product);
    });

  const truckAssetItemIds = new Set<string>();
  const truckAssetProducts = truckAssets.flatMap((asset) => {
    const metadata =
      assetProductsById.get(asset.itemId) || assetProductsById.get(asset.id);
    truckAssetItemIds.add(asset.itemId);

    const name =
      asset.serial && !asset.label.includes(asset.serial)
        ? `${asset.label} (${asset.serial})`
        : asset.label;
    const price = metadata?.price ?? 0;

    return [
      {
        id: `${TRUCK_ASSET_PRODUCT_PREFIX}${asset.id}:${asset.serial || asset.itemId}`,
        itemId: asset.itemId,
        type: "assets" as const,
        name: name || metadata?.name || "Asset",
        price,
        unit: metadata?.unit ?? null,
        image_url:
          resolveResourceUrl(asset.image_url) || metadata?.image_url || null,
        description: metadata?.description ?? null,
        category: asset.category || metadata?.category || "Assets",
        assetCategory: asset.category || metadata?.assetCategory || null,
        originalPrice: metadata?.originalPrice,
        badge: "Asset",
        loaded_quantity: 1,
      },
    ];
  });

  const visibleBaseProducts = cleanBaseProducts.filter(
    (product) =>
      product.type !== "assets" || !truckAssetItemIds.has(product.itemId),
  );

  const deduped = new Map<string, ServerProduct>();
  [...visibleBaseProducts, ...truckAssetProducts].forEach((product) => {
    if (!deduped.has(product.id)) {
      deduped.set(product.id, product);
    }
  });

  return Array.from(deduped.values());
};

const getProductIconName = (type?: string) => {
  const normalized = normalizeCategory(type);
  if (normalized.includes("refill")) return "water-outline" as const;
  if (normalized.includes("retail")) return "storefront-outline" as const;
  return "cube-outline" as const;
};

const ProductItem: React.FC<{
  product: ServerProduct;
  group: ProductGroup;
  quantity: number;
  onChangeQuantity: (newQuantity: number) => void;
  unitPrice: number;
  initialQuantity?: number;
  availableStock?: number; // Available stock based on loaded_quantity
}> = ({
  product,
  group,
  quantity,
  onChangeQuantity,
  unitPrice,
  initialQuantity = 0,
  availableStock = Infinity,
}) => {
  const isMinStock = quantity === 0;
  const isSelected = quantity > 0;
  const isMaxStock =
    availableStock !== undefined &&
    availableStock !== Infinity &&
    quantity >= availableStock;
  const groupCardStyle =
    group === "refill"
      ? styles.productCardRefill
      : group === "wholesale"
        ? styles.productCardWholesale
        : group === "assets"
          ? styles.productCardAssets
          : styles.productCardOther;
  const displayPrice = product.originalPrice ? (
    <View style={styles.priceContainer}>
      <Text style={styles.productPriceOriginal}>
        AED {product.originalPrice.toFixed(2)}
      </Text>
      <Text style={styles.productPrice}>AED {unitPrice.toFixed(2)}</Text>
    </View>
  ) : (
    <Text style={styles.productPrice}>AED {unitPrice.toFixed(2)}</Text>
  );

  return (
    <View
      style={[
        styles.productCard,
        groupCardStyle,
        isSelected && styles.productCardSelected,
      ]}
    >
      <View style={styles.productMain}>
        <View
          style={[
            styles.productIconBox,
            isSelected && styles.productIconBoxSelected,
          ]}
        >
          {(() => {
            const imageUrl = resolveResourceUrl(product.image_url);
            return imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={getProductIconName(product.type)}
                size={18}
                color={isSelected ? "#FFFFFF" : "#1D4ED8"}
              />
            );
          })()}
        </View>

        <View style={styles.productInfo}>
          <View style={styles.productNameContainer}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.name}
            </Text>
            {product.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{product.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.productMetaText}>
            {group === "refill"
              ? "Refill item"
              : group === "wholesale"
                ? isEmptyBottleSaleProduct(product)
                  ? "Empty bottle"
                  : "Retail item"
                : group === "assets"
                  ? "Asset item"
                  : "Other product"}
            {product.unit ? ` - ${product.unit}` : ""}
          </Text>
          <View style={styles.productMeta}>{displayPrice}</View>
          {initialQuantity > 0 && (
            <View style={styles.orderedBadge}>
              <Ionicons name="checkmark" size={10} color="#059669" />
              <Text style={styles.orderedText}>Ordered: {initialQuantity}</Text>
            </View>
          )}
          {product.loaded_quantity !== undefined && (
            <View style={styles.stockBadge}>
              <Text style={styles.stockText}>
                Available:{" "}
                {availableStock !== Infinity
                  ? availableStock
                  : product.loaded_quantity}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isMinStock && styles.quantityButtonDisabled,
            ]}
            onPress={() => onChangeQuantity(Math.max(0, quantity - 1))}
            disabled={isMinStock}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove"
              size={18}
              color={isMinStock ? "#CBD5E1" : "#1E40AF"}
            />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{quantity}</Text>

          <TouchableOpacity
            style={[
              styles.quantityButton,
              isMaxStock && styles.quantityButtonDisabled,
            ]}
            onPress={() => {
              if (!isMaxStock) {
                onChangeQuantity(Math.min(quantity + 1, availableStock));
              }
            }}
            disabled={isMaxStock}
            activeOpacity={0.7}
          >
            <Ionicons
              name="add"
              size={18}
              color={isMaxStock ? "#CBD5E1" : "#1E40AF"}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const ProductList: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const {
    addToCart,
    clearCart,
    selectedOrder,
    assignedOrders,
    cartItems,
    currentDriver,
    getAvailableStock,
    setProducts: setStoreProducts,
  } = useOrderStore();
  const { user } = useAuthStore();

  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      if (!driverId) {
        setProducts([]);
        setApiError("Driver ID is missing. Please sign in again.");
        return;
      }

      const params = new URLSearchParams();

      const store = useOrderStore.getState();
      const currentOrder = store.assignedOrders.find(
        (order) => order.id === selectedOrder,
      );
      const customerSiteId = currentOrder?.customer_site_id;

      if (customerSiteId) {
        params.set("siteId", customerSiteId);
      }
      const query = params.toString();
      const url = `${IP_ADDRESS}/products${query ? `?${query}` : ""}`;

      const requestHeaders = {
        "X-Driver-Id": driverId,
      };
      const [productsResponse, truckResponse] = await Promise.all([
        authenticatedFetch(url, {
          method: "GET",
          headers: requestHeaders,
        }),
        authenticatedFetch(`${IP_ADDRESS}/truck`, {
          method: "GET",
          headers: requestHeaders,
        }).catch((error) => {
          console.error("Error fetching truck inventory:", error);
          return null;
        }),
      ]);

      const parseResult =
        await parseApiResponseWithSoftError<unknown>(productsResponse);
      if (!parseResult.ok) {
        setProducts([]);
        setStoreProducts([]);
        setApiError(parseResult.error);
      } else {
        const truckResult = truckResponse
          ? await parseApiResponseWithSoftError<unknown>(truckResponse)
          : null;
        const nextTruckAssets = truckResult?.ok
          ? extractTruckAssets(truckResult.data)
          : [];
        const normalizedProducts = normalizeProductsPayload(parseResult.data);
        const sellableProducts = buildSellableProducts(
          normalizedProducts,
          nextTruckAssets,
        );
        setProducts(sellableProducts);

        // Update products in store with loaded_quantity for stock tracking
        const storeProducts: Product[] = sellableProducts.map(
          (serverProduct) => ({
            id: serverProduct.id,
            item_id: serverProduct.itemId,
            item_type: getProductItemType(serverProduct),
            name: serverProduct.name,
            description: serverProduct.description || "",
            image_url: resolveResourceUrl(serverProduct.image_url) || "",
            pricing: serverProduct.price,
            category: serverProduct.category,
            loaded_quantity: serverProduct.loaded_quantity,
          }),
        );
        setStoreProducts(storeProducts);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      setProducts([]);
      setApiError(err instanceof Error ? err.message : "Failed to load items.");
    } finally {
      setLoading(false);
    }
  }, [driverId, selectedOrder, setStoreProducts]); // Removed assignedOrders - we access it inside but don't need it as dependency

  // Only fetch products when screen is focused, not when assignedOrders changes in background
  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts]),
  );

  const saleProducts = products;

  const groupedProducts = useMemo(
    () => ({
      refill: saleProducts.filter(
        (product) => getProductGroup(product) === "refill",
      ),
      wholesale: saleProducts.filter(
        (product) => getProductGroup(product) === "wholesale",
      ),
      assets: saleProducts.filter(
        (product) => getProductGroup(product) === "assets",
      ),
      other: saleProducts.filter(
        (product) => getProductGroup(product) === "other",
      ),
    }),
    [saleProducts],
  );

  const currentOrder = assignedOrders.find(
    (order) => order.id === selectedOrder,
  );

  const initialQuantities = useMemo(() => {
    const record: Record<string, number> = {};

    saleProducts.forEach((p) => {
      const cartItem = cartItems.find((item) => {
        if (item.id === p.id) return true;
        if (item.item_id !== p.itemId) return false;
        return (
          normalizeCategory(item.category) === normalizeCategory(p.category)
        );
      });
      if (cartItem) {
        record[p.id] = Math.max(0, cartItem.quantity || 0);
        return;
      }

      // Use utility function to get quantity (works with both array and Record formats)
      // Match by both name AND category to avoid mixing retail-items and refill items
      const initialQty = currentOrder
        ? getProductQuantity(currentOrder, p.name, p.category, p.itemId)
        : 0;
      record[p.id] = initialQty;
    });

    return record;
  }, [cartItems, saleProducts, currentOrder]);

  const [quantities, setQuantities] =
    useState<Record<string, number>>(initialQuantities);

  useEffect(() => {
    setQuantities(initialQuantities);
  }, [initialQuantities]);

  const getSelectableStock = useCallback(
    (product: ServerProduct) => {
      if (
        typeof product.loaded_quantity === "number" &&
        Number.isFinite(product.loaded_quantity)
      ) {
        const stockGroupKey = getProductStockGroupKey(product);
        const reservedByOtherProducts = saleProducts.reduce((sum, entry) => {
          if (entry.id === product.id) return sum;
          if (getProductStockGroupKey(entry) !== stockGroupKey) return sum;
          return sum + Math.max(0, quantities[entry.id] || 0);
        }, 0);

        return Math.max(0, product.loaded_quantity - reservedByOtherProducts);
      }

      const existingCartQuantity =
        cartItems.find((item) => item.id === product.id)?.quantity || 0;
      return getAvailableStock(product.id) + existingCartQuantity;
    },
    [cartItems, getAvailableStock, quantities, saleProducts],
  );

  const handleChangeQuantity = useCallback(
    (product: ServerProduct, newQuantity: number) => {
      const availableStock = getSelectableStock(product);
      // Limit newQuantity to available stock
      const limitedQuantity =
        availableStock !== Infinity
          ? Math.max(0, Math.min(newQuantity, availableStock))
          : Math.max(0, newQuantity);

      setQuantities((prev) => ({ ...prev, [product.id]: limitedQuantity }));
    },
    [getSelectableStock],
  );

  const totalSelectedItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  }, [quantities]);

  const totalAmount = useMemo(() => {
    return saleProducts.reduce(
      (sum, p) => sum + p.price * (quantities[p.id] || 0),
      0,
    );
  }, [saleProducts, quantities]);

  const handleCheckout = useCallback(() => {
    const selected = saleProducts.filter((p) => (quantities[p.id] || 0) > 0);
    const cartProducts: Product[] = selected.map((serverProduct) => {
      // Build full image URL for cart items
      const fullImageUrl = resolveResourceUrl(serverProduct.image_url) || "";
      // Prefer category from order if available, otherwise use product category
      const orderCategory = currentOrder
        ? getProductCategory(
            currentOrder,
            serverProduct.name,
            serverProduct.itemId,
          )
        : undefined;
      return {
        id: serverProduct.id,
        item_id: serverProduct.itemId,
        item_type: getProductItemType(serverProduct),
        name: serverProduct.name,
        description: serverProduct.description || "",
        image_url: fullImageUrl,
        pricing: serverProduct.price,
        category: orderCategory || serverProduct.category || "", // Prefer order category, then product category
        loaded_quantity: serverProduct.loaded_quantity, // Include loaded_quantity for stock tracking
      };
    });

    clearCart();

    cartProducts.forEach((p) => {
      const quantity = quantities[p.id] || 0;
      if (quantity > 0) {
        addToCart(p, quantity);
      }
    });

    router.push({
      pathname: "/(root)/(tabs)/bottles-assets",
      params: { backTo: "add-products" },
    });
  }, [saleProducts, quantities, addToCart, clearCart, router, currentOrder]);

  const handleBack = useCallback(() => {
    if (params.backTo === "checkout") {
      router.replace({
        pathname: "/(root)/(tabs)/checkout",
        params: { backTo: "bottles-assets" },
      });
      return;
    }

    router.replace("/(root)/(tabs)/order-details");
  }, [params.backTo, router]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Add Products</Text>
          {currentOrder && (
            <Text style={styles.headerSubtitle}>
              {currentOrder.customer_name || "Current delivery"}
            </Text>
          )}
        </View>
        <View style={styles.cartIndicator}>
          <Text style={styles.cartIndicatorText}>{totalSelectedItems}</Text>
        </View>
      </View>

      <ApiErrorText error={apiError} />
      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Selected</Text>
          <Text style={styles.summaryValue}>{totalSelectedItems} items</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValueHighlight}>
            AED {totalAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Context */}
        {currentOrder?.products &&
          ((Array.isArray(currentOrder.products) &&
            currentOrder.products.length > 0) ||
            (typeof currentOrder.products === "object" &&
              Object.keys(currentOrder.products).length > 0)) && (
            <View style={styles.contextCard}>
              <View style={styles.contextIcon}>
                <Ionicons name="information-circle" size={16} color="#2563EB" />
              </View>
              <Text style={styles.contextText}>
                Planned delivery items were pre-filled from today&apos;s tasks.
                Adjust them if the stop changes.
              </Text>
            </View>
          )}

        <View style={styles.productsSections}>
          {groupedProducts.refill.length > 0 ? (
            <View style={styles.productCategorySection}>
              <View style={styles.productCategoryHeader}>
                <View
                  style={[
                    styles.productCategoryBadge,
                    styles.productCategoryBadgeRefill,
                  ]}
                >
                  <Ionicons name="water-outline" size={14} color="#0C4A6E" />
                  <Text style={styles.productCategoryTitle}>Refill</Text>
                </View>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {groupedProducts.refill.length}
                  </Text>
                </View>
              </View>
              <View style={styles.productGrid}>
                {groupedProducts.refill.map((product) => {
                  const initialQty = currentOrder
                    ? getProductQuantity(
                        currentOrder,
                        product.name,
                        product.category,
                        product.itemId,
                      )
                    : 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      group="refill"
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product, q)}
                      unitPrice={product.price}
                      initialQuantity={initialQty}
                      availableStock={getSelectableStock(product)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {groupedProducts.wholesale.length > 0 ? (
            <View style={styles.productCategorySection}>
              <View style={styles.productCategoryHeader}>
                <View
                  style={[
                    styles.productCategoryBadge,
                    styles.productCategoryBadgeWholesale,
                  ]}
                >
                  <Ionicons
                    name="storefront-outline"
                    size={14}
                    color="#1E40AF"
                  />
                  <Text style={styles.productCategoryTitle}>Retail</Text>
                </View>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {groupedProducts.wholesale.length}
                  </Text>
                </View>
              </View>
              <View style={styles.productGrid}>
                {groupedProducts.wholesale.map((product) => {
                  const initialQty = currentOrder
                    ? getProductQuantity(
                        currentOrder,
                        product.name,
                        product.category,
                        product.itemId,
                      )
                    : 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      group="wholesale"
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product, q)}
                      unitPrice={product.price}
                      initialQuantity={initialQty}
                      availableStock={getSelectableStock(product)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {groupedProducts.assets.length > 0 ? (
            <View style={styles.productCategorySection}>
              <View style={styles.productCategoryHeader}>
                <View
                  style={[
                    styles.productCategoryBadge,
                    styles.productCategoryBadgeAssets,
                  ]}
                >
                  <Ionicons name="cube-outline" size={14} color="#6D28D9" />
                  <Text style={styles.productCategoryTitle}>Assets</Text>
                </View>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {groupedProducts.assets.length}
                  </Text>
                </View>
              </View>
              <View style={styles.productGrid}>
                {groupedProducts.assets.map((product) => {
                  const initialQty = currentOrder
                    ? getProductQuantity(
                        currentOrder,
                        product.name,
                        product.category,
                        product.itemId,
                      )
                    : 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      group="assets"
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product, q)}
                      unitPrice={product.price}
                      initialQuantity={initialQty}
                      availableStock={getSelectableStock(product)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {groupedProducts.other.length > 0 ? (
            <View style={styles.productCategorySection}>
              <View style={styles.productCategoryHeader}>
                <View
                  style={[
                    styles.productCategoryBadge,
                    styles.productCategoryBadgeOther,
                  ]}
                >
                  <Ionicons name="cube-outline" size={14} color="#475569" />
                  <Text style={styles.productCategoryTitle}>
                    Other Products
                  </Text>
                </View>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {groupedProducts.other.length}
                  </Text>
                </View>
              </View>
              <View style={styles.productGrid}>
                {groupedProducts.other.map((product) => {
                  const initialQty = currentOrder
                    ? getProductQuantity(
                        currentOrder,
                        product.name,
                        product.category,
                        product.itemId,
                      )
                    : 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      group="other"
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product, q)}
                      unitPrice={product.price}
                      initialQuantity={initialQty}
                      availableStock={getSelectableStock(product)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Total</Text>
            <Text style={styles.actionTotal}>AED {totalAmount.toFixed(2)}</Text>
            <Text style={styles.summaryNote}>
              Products saved for this stop.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.checkoutButton}
            onPress={handleCheckout}
            activeOpacity={0.8}
          >
            <Text style={styles.checkoutButtonText}>Bottles & Assets</Text>
            <View style={styles.checkoutArrow}>
              <Ionicons name="arrow-forward" size={16} color="#1E40AF" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
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
    alignItems: "center",
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
  cartIndicator: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  cartIndicatorText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  summaryBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
  },
  summaryValueHighlight: {
    fontSize: 15,
    fontWeight: "700",
    color: "#059669",
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  contextIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
  },
  contextText: {
    flex: 1,
    fontSize: 13,
    color: "#1D4ED8",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalResultsList: {
    flex: 1,
  },
  productsSections: {
    gap: 20,
  },
  productCategorySection: {
    gap: 10,
  },
  productCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  productCategoryBadgeWholesale: {
    backgroundColor: "#DBEAFE",
  },
  productCategoryBadgeRefill: {
    backgroundColor: "#CFFAFE",
  },
  productCategoryBadgeOther: {
    backgroundColor: "#E2E8F0",
  },
  productCategoryBadgeAssets: {
    backgroundColor: "#F3E8FF",
  },
  productCategoryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  productCategoryCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  productCategoryCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  productGrid: {
    gap: 10,
  },
  actionItemCardCompact: {
    borderRadius: 14,
    padding: 12,
    shadowOpacity: 0.025,
    shadowRadius: 10,
    elevation: 1,
  },
  actionItemMainCompact: {
    marginRight: 10,
  },
  actionItemIconBoxCompact: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 10,
  },
  actionItemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  actionItemTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  actionItemTypeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionItemTypeBadgeReturn: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  actionItemTypeBadgeDeposit: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  actionItemTypeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  actionItemTypeBadgeTextReturn: {
    color: "#047857",
  },
  actionItemTypeBadgeTextDeposit: {
    color: "#1D4ED8",
  },
  actionItemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionItemMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionItemMetaPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  productMetaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  assetLauncherCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  assetLauncherHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  assetLauncherIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  assetLauncherCopy: {
    flex: 1,
    gap: 4,
    marginRight: 10,
  },
  assetLauncherTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetLauncherText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  assetLauncherMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  assetLauncherChip: {
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assetLauncherChipSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  assetLauncherChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  assetLauncherChipTextSelected: {
    color: "#1D4ED8",
  },
  assetActionsModalContent: {
    paddingBottom: 8,
    gap: 12,
  },
  assetActionsIntroCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  assetActionsIntroTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetActionsIntroText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  creditCollectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    padding: 16,
    gap: 14,
  },
  creditCollectionHeader: {
    gap: 4,
  },
  creditCollectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  creditCollectionText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  creditCollectionFields: {
    gap: 12,
  },
  creditCollectionField: {
    gap: 6,
  },
  creditCollectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  creditCollectionAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  creditCollectionPrefix: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginRight: 8,
  },
  creditCollectionAmountInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    paddingVertical: 0,
  },
  creditCollectionRemarkInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  assetActionsSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  assetActionsSection: {
    gap: 10,
  },
  assetActionsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assetActionSubsection: {
    gap: 8,
  },
  assetActionSubsectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetActionSubsectionText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  assetReturnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  assetReturnBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  assetSectionHelperText: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  assetSectionErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  assetSectionErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#B91C1C",
    fontWeight: "500",
  },
  assetSectionEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  assetSectionEmptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  productCardWholesale: {
    borderLeftWidth: 5,
    borderLeftColor: "#2563EB",
  },
  productCardRefill: {
    borderLeftWidth: 5,
    borderLeftColor: "#0891B2",
  },
  productCardAssets: {
    borderLeftWidth: 5,
    borderLeftColor: "#7C3AED",
  },
  productCardOther: {
    borderLeftWidth: 5,
    borderLeftColor: "#64748B",
  },
  productCardSelected: {
    backgroundColor: "#F8FAFF",
    borderColor: "#2563EB",
  },
  productMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  productIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginRight: 14,
  },
  productIconBoxSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productInfo: {
    flex: 1,
  },
  productNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E40AF",
    flex: 1,
  },
  badge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#92400E",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productPriceOriginal: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  adjustablePriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 9,
  },
  priceInputPrefix: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
    marginRight: 5,
  },
  priceInput: {
    minWidth: 68,
    paddingVertical: Platform.OS === "ios" ? 4 : 0,
    paddingHorizontal: 0,
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  productDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#D1D5DB",
  },
  assetMetaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  productStock: {
    fontSize: 12,
    color: "#6B7280",
  },
  orderedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: "flex-start",
    gap: 4,
  },
  orderedText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#059669",
  },
  stockBadge: {
    backgroundColor: "#F0F9FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  stockText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0284C7",
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  actionItemQuantityControlCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionItemQuantityButtonCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  quantityButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#F1F5F9",
  },
  quantityText: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
  },
  actionItemQuantityTextCompact: {
    minWidth: 28,
    fontSize: 14,
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
  summaryNote: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  checkoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
  },
  checkoutButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  checkoutButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  checkoutArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkoutArrowDisabled: {
    backgroundColor: "#F3F4F6",
  },
  rentItemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  rentItemMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rentItemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  rentItemIconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rentItemIconBorrow: {
    backgroundColor: "#ECFDF5",
  },
  rentItemIconDeposit: {
    backgroundColor: "#EFF6FF",
  },
  rentItemInfo: {
    flex: 1,
  },
  rentItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
    marginBottom: 2,
  },
  rentItemDetails: {
    fontSize: 12,
    color: "#6B7280",
  },
  rentItemSerial: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  rentItemHeldText: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: "#0369A1",
  },
  rentItemHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#0F766E",
  },
  rentItemQuantityControl: {
    marginLeft: 12,
  },
  rentItemToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  rentItemToggleOn: {
    backgroundColor: "#ECFDF5",
  },
  rentItemToggleOff: {
    backgroundColor: "#F3F4F6",
  },
  loadingBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  errorBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1E40AF",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2563EB",
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  rentSectionHint: {
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  heldItemsErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  heldItemsErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#B91C1C",
  },
  heldItemsInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heldItemsInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#065F46",
  },
});

export default ProductList;
