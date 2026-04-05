import ApiErrorText from "@/components/ApiErrorText";
import { useOrderStore } from "@/store/index";
import { useAuthStore, authenticatedFetch } from "@/store/auth";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { resolveResourceUrl } from "@/utils/resources";
import { Product } from "@/types/order";
import { getProductQuantity, getProductCategory } from "@/utils/orderUtils";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
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
import { showWarningAlert } from "@/store/utils/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

interface ServerProduct {
  id: string;
  itemId: string;
  type: "retail" | "refill" | "other";
  name: string;
  price: number;
  unit: string | null;
  image_url: string | null;
  description: string | null;
  category: string;
  originalPrice?: number;
  badge?: string;
  loaded_quantity?: number;
}

const normalizeProductType = (value: unknown): ServerProduct["type"] => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "refill") return "refill";
  if (raw === "retail") return "retail";
  return "other";
};

const getCategoryDisplayPriority = (category: string): number => {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("refill")) return 0;
  if (normalized.includes("retail")) return 1;
  return 2;
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
    category: type,
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

const ProductItem: React.FC<{
  product: ServerProduct;
  quantity: number;
  onChangeQuantity: (newQuantity: number) => void;
  initialQuantity?: number;
  availableStock?: number; // Available stock based on loaded_quantity
}> = ({
  product,
  quantity,
  onChangeQuantity,
  initialQuantity = 0,
  availableStock = Infinity,
}) => {
  const isMinStock = quantity === 0;
  const isSelected = quantity > 0;
  const isMaxStock =
    availableStock !== undefined &&
    availableStock !== Infinity &&
    quantity >= availableStock;
  // Display price with 5% VAT included
  const priceWithVat = product.price * 1.05;
  const originalPriceWithVat = product.originalPrice
    ? product.originalPrice * 1.05
    : null;
  const displayPrice = originalPriceWithVat ? (
    <View style={styles.priceContainer}>
      <Text style={styles.productPriceOriginal}>
        AED {originalPriceWithVat.toFixed(2)}
      </Text>
      <Text style={styles.productPrice}>AED {priceWithVat.toFixed(2)}</Text>
    </View>
  ) : (
    <Text style={styles.productPrice}>AED {priceWithVat.toFixed(2)}</Text>
  );

  return (
    <View
      style={[styles.productCard, isSelected && styles.productCardSelected]}
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
                name="water"
                size={18}
                color={isSelected ? "#FFFFFF" : "#0EA5E9"}
              />
            );
          })()}
        </View>

        <View style={styles.productInfo}>
          <View style={styles.productNameContainer}>
            <Text style={styles.productName}>{product.name}</Text>
            {product.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{product.badge}</Text>
              </View>
            )}
          </View>
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
            style={[styles.qtyButton, isMinStock && styles.qtyButtonDisabled]}
            onPress={() => onChangeQuantity(Math.max(0, quantity - 1))}
            disabled={isMinStock}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove"
              size={16}
              color={isMinStock ? "#D1D5DB" : "#1E40AF"}
            />
          </TouchableOpacity>

          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyText}>{quantity}</Text>
          </View>

          <TouchableOpacity
            style={[styles.qtyButton, isMaxStock && styles.qtyButtonDisabled]}
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
              size={16}
              color={isMaxStock ? "#D1D5DB" : "#1E40AF"}
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
  const {
    addToCart,
    clearCart,
    selectedOrder,
    assignedOrders,
    getAvailableStock,
    setProducts: setStoreProducts,
    setAssignedOrders,
  } = useOrderStore();
  const { user } = useAuthStore();

  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      if (!user?.id) {
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

      const response = await authenticatedFetch(url, {
        method: "GET",
        headers: {
          "X-Driver-Id": user.id,
        },
      });
      const parseResult =
        await parseApiResponseWithSoftError<unknown>(response);
      if (!parseResult.ok) {
        setProducts([]);
        setApiError(parseResult.error);
        return;
      }

      const normalizedProducts = normalizeProductsPayload(parseResult.data);
      setProducts(normalizedProducts);

      // Update products in store with loaded_quantity for stock tracking
      const storeProducts: Product[] = normalizedProducts.map(
        (serverProduct) => ({
          id: serverProduct.id,
          item_id: serverProduct.itemId,
          item_type: serverProduct.type === "refill" ? "refill" : "retail",
          name: serverProduct.name,
          description: serverProduct.description || "",
          image_url: resolveResourceUrl(serverProduct.image_url) || "",
          pricing: serverProduct.price,
          category: serverProduct.category,
          loaded_quantity: serverProduct.loaded_quantity,
        }),
      );
      // Use the store's setProducts function to update products with loaded_quantity
      setStoreProducts(storeProducts);
    } catch (err) {
      console.error("Error fetching products:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrder, setStoreProducts, user?.id]); // Removed assignedOrders - we access it inside but don't need it as dependency

  // Only fetch products when screen is focused, not when assignedOrders changes in background
  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts]),
  );

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map((p) => p.category))];
    return uniqueCategories.sort((a, b) => {
      const priorityDiff =
        getCategoryDisplayPriority(a) - getCategoryDisplayPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.localeCompare(b);
    });
  }, [products]);

  const currentOrder = assignedOrders.find(
    (order) => order.id === selectedOrder,
  );

  // Initialize rent/deposit quantities from order
  const [rentItemQuantities, setRentItemQuantities] = useState<
    Record<string, number>
  >(() => {
    const initial: Record<string, number> = {};
    if (currentOrder?.rent_items) {
      currentOrder.rent_items.forEach((item) => {
        const initialQuantity = item.in_truck ? item.quantity || 0 : 0;
        initial[item.id] = Math.max(0, initialQuantity);
      });
    }
    return initial;
  });

  useEffect(() => {
    const initial: Record<string, number> = {};
    if (currentOrder?.rent_items) {
      currentOrder.rent_items.forEach((item) => {
        const initialQuantity = item.in_truck ? item.quantity || 0 : 0;
        initial[item.id] = Math.max(0, initialQuantity);
      });
    }
    setRentItemQuantities(initial);
  }, [currentOrder?.rent_items]);

  const handleChangeRentItemQuantity = useCallback(
    (itemId: string, delta: number) => {
      setRentItemQuantities((prev) => {
        const current = prev[itemId] ?? 0;
        const nextQuantity = Math.max(0, current + delta);
        return { ...prev, [itemId]: nextQuantity };
      });
    },
    [],
  );

  const initialQuantities = useMemo(() => {
    const record: Record<string, number> = {};

    products.forEach((p) => {
      // Use utility function to get quantity (works with both array and Record formats)
      // Match by both name AND category to avoid mixing retail-items and refill items
      const initialQty = currentOrder
        ? getProductQuantity(currentOrder, p.name, p.category)
        : 0;
      record[p.id] = initialQty;
    });

    return record;
  }, [products, currentOrder]);

  const [quantities, setQuantities] =
    useState<Record<string, number>>(initialQuantities);

  useEffect(() => {
    setQuantities(initialQuantities);
  }, [initialQuantities]);

  const handleChangeQuantity = useCallback(
    (productId: string, newQuantity: number) => {
      // Get available stock for this product
      const availableStock = getAvailableStock(productId);
      // Limit newQuantity to available stock
      const limitedQuantity =
        availableStock !== Infinity
          ? Math.max(0, Math.min(newQuantity, availableStock))
          : Math.max(0, newQuantity);

      setQuantities((prev) => ({ ...prev, [productId]: limitedQuantity }));
    },
    [getAvailableStock],
  );

  const totalSelectedItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  }, [quantities]);

  // Check if any rent/deposit items have a positive quantity
  const hasRentItemsSelected = useMemo(() => {
    if (!currentOrder?.rent_items) return false;
    return currentOrder.rent_items.some(
      (item) => (rentItemQuantities[item.id] ?? 0) > 0,
    );
  }, [currentOrder?.rent_items, rentItemQuantities]);

  // Button should be enabled if products are selected OR rent items are selected
  const canCheckout = totalSelectedItems > 0 || hasRentItemsSelected;

  const totalAmount = useMemo(() => {
    return products.reduce(
      (sum, p) => sum + p.price * (quantities[p.id] || 0),
      0,
    );
  }, [products, quantities]);

  const handleCheckout = useCallback(() => {
    const selected = products.filter((p) => (quantities[p.id] || 0) > 0);
    const hasRentItems = currentOrder?.rent_items?.some(
      (item) => (rentItemQuantities[item.id] ?? 0) > 0,
    );

    if (selected.length === 0 && !hasRentItems) {
      showWarningAlert(
        "No items selected",
        "Please select at least one product or rent item to continue.",
      );
      return;
    }

    // Update rent/deposit quantities and in_truck status in the order
    if (currentOrder && currentOrder.rent_items) {
      const updatedRentItems = currentOrder.rent_items.map((item) => {
        const updatedQuantity = Math.max(0, rentItemQuantities[item.id] ?? 0);
        return {
          ...item,
          quantity: updatedQuantity,
          in_truck: updatedQuantity > 0,
        };
      });

      const updatedOrder = {
        ...currentOrder,
        rent_items: updatedRentItems,
      };

      // Update the order in assignedOrders
      const updatedAssignedOrders = assignedOrders.map((order) =>
        order.id === currentOrder.id ? updatedOrder : order,
      );
      setAssignedOrders(updatedAssignedOrders);
    }

    const cartProducts: Product[] = selected.map((serverProduct) => {
      // Build full image URL for cart items
      const fullImageUrl = resolveResourceUrl(serverProduct.image_url) || "";
      // Prefer category from order if available, otherwise use product category
      const orderCategory = currentOrder
        ? getProductCategory(currentOrder, serverProduct.name)
        : undefined;
      return {
        id: serverProduct.id,
        item_id: serverProduct.itemId,
        item_type: serverProduct.type === "refill" ? "refill" : "retail",
        name: serverProduct.name,
        description: serverProduct.description || "",
        image_url: fullImageUrl,
        pricing: serverProduct.price,
        category: orderCategory || serverProduct.category || "", // Prefer order category, then product category
        loaded_quantity: serverProduct.loaded_quantity, // Include loaded_quantity for stock tracking
      };
    });

    clearCart();

    let itemsAdded = 0;
    cartProducts.forEach((p) => {
      const quantity = quantities[p.id] || 0;
      if (quantity > 0) {
        addToCart(p, quantity);
        itemsAdded++;
      }
    });

    // Allow checkout even if no products are selected, as long as rent items are selected
    if (itemsAdded === 0 && !hasRentItems) {
      showWarningAlert(
        "No Items Selected",
        "Please select at least one product or rent item to continue.",
      );
      return;
    }

    router.push("/(root)/(tabs)/checkout");
  }, [
    products,
    quantities,
    addToCart,
    clearCart,
    router,
    currentOrder,
    assignedOrders,
    rentItemQuantities,
    setAssignedOrders,
  ]);

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
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Add Products</Text>
          {currentOrder && (
            <Text style={styles.headerSubtitle}>
              {currentOrder.order_number}
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
                Quantities pre-filled from order. Adjust as needed.
              </Text>
            </View>
          )}

        {/* Categories */}
        {categories.map((category) => {
          const productsInCategory = products.filter(
            (p) => p.category === category,
          );

          return (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryTitleContainer}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                  </View>
                </View>
                <View style={styles.categoryCountBadge}>
                  <Text style={styles.categoryCount}>
                    {productsInCategory.length}
                  </Text>
                </View>
              </View>

              {productsInCategory.map((product) => {
                // Match by both name AND category to avoid mixing retail-items and refill items
                const initialQty = currentOrder
                  ? getProductQuantity(
                      currentOrder,
                      product.name,
                      product.category,
                    )
                  : 0;
                const availableStock = getAvailableStock(product.id);
                return (
                  <ProductItem
                    key={product.id}
                    product={product}
                    quantity={quantities[product.id] || 0}
                    onChangeQuantity={(q) =>
                      handleChangeQuantity(product.id, q)
                    }
                    initialQuantity={initialQty}
                    availableStock={availableStock}
                  />
                );
              })}
            </View>
          );
        })}

        {/* Rent Items Section */}
        {currentOrder?.rent_items && currentOrder.rent_items.length > 0 && (
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.rentSectionTitle}>Other Actions</Text>
              <Text style={styles.categoryCount}>
                {currentOrder.rent_items.length}
              </Text>
            </View>

            {currentOrder.rent_items.map((item) => {
              const quantity = Math.max(0, rentItemQuantities[item.id] ?? 0);
              return (
                <View key={item.id} style={styles.rentItemCard}>
                  <View style={styles.rentItemMain}>
                    {item.image_url ? (
                      <Image
                        source={{
                          uri: resolveResourceUrl(item.image_url) || "",
                        }}
                        style={styles.rentItemImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.rentItemIconBox,
                          item.category === "borrow"
                            ? styles.rentItemIconBorrow
                            : styles.rentItemIconDeposit,
                        ]}
                      >
                        <Ionicons
                          name={
                            item.category === "borrow"
                              ? "arrow-down-circle"
                              : "arrow-up-circle"
                          }
                          size={24}
                          color={
                            item.category === "borrow" ? "#10B981" : "#3B82F6"
                          }
                        />
                      </View>
                    )}
                    <View style={styles.rentItemInfo}>
                      <Text style={styles.rentItemName}>{item.name}</Text>
                      <Text style={styles.rentItemDetails}>
                        {item.category === "borrow" ? "Borrow" : "Deposit"} •
                        Qty: {quantity} • AED {item.price.toFixed(2)} each
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rentItemQuantityControl}>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity
                        style={[
                          styles.qtyButton,
                          quantity === 0 && styles.qtyButtonDisabled,
                        ]}
                        onPress={() =>
                          handleChangeRentItemQuantity(item.id, -1)
                        }
                        disabled={quantity === 0}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="remove"
                          size={16}
                          color={quantity === 0 ? "#D1D5DB" : "#1E40AF"}
                        />
                      </TouchableOpacity>
                      <View style={styles.qtyDisplay}>
                        <Text style={styles.qtyText}>{quantity}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.qtyButton}
                        onPress={() => handleChangeRentItemQuantity(item.id, 1)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={16} color="#1E40AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Action Section */}
        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Total</Text>
            <Text style={styles.actionTotal}>AED {totalAmount.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.checkoutButton,
              !canCheckout && styles.checkoutButtonDisabled,
            ]}
            onPress={handleCheckout}
            disabled={!canCheckout}
            activeOpacity={0.8}
          >
            <Text style={styles.checkoutButtonText}>Checkout</Text>
            <View
              style={[
                styles.checkoutArrow,
                !canCheckout && styles.checkoutArrowDisabled,
              ]}
            >
              <Ionicons
                name="arrow-forward"
                size={16}
                color={!canCheckout ? "#9CA3AF" : "#1E40AF"}
              />
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
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  categoryTitleContainer: {
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  categoryCountBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  rentSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E40AF",
  },
  productCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  productCardSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#FAFAFA",
  },
  productMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  productIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  productIconBoxSelected: {
    backgroundColor: "#2563EB",
    borderWidth: 2,
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
    fontSize: 14,
    fontWeight: "600",
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
    gap: 6,
  },
  productPrice: {
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
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 4,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyButtonDisabled: {
    backgroundColor: "#F9FAFB",
  },
  qtyDisplay: {
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 14,
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
});

export default ProductList;
