import { useOrderStore } from '@/store/index';
import { useAuthStore, authenticatedFetch } from '@/store/auth';
import { Product } from '@/types/order';
import { getProductQuantity, getProductCategory } from '@/utils/orderUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { showWarningAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

// Helper function to build full image URL from relative path
const getImageUrl = (imagePath: string | null | undefined): string | null => {
  if (!imagePath || imagePath.trim() === '') return null;
  
  // If already a full URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Remove /api from IP_ADDRESS if present and build full URL
  const baseUrl = IP_ADDRESS?.replace(/\/api$/, '') || '';
  // Ensure imagePath starts with /
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${normalizedPath}`;
};


interface ServerProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null; // Can be null
  description: string | null; // Can be null
  category: string;
  originalPrice?: number; // Optional, for special offers
  badge?: string; // Optional, for special offers
  loaded_quantity?: number; // Quantity loaded on the vehicle for this product
}

// Server response structure - can be wrapped in success/data or direct object
type ProductsApiResponse = 
  | {
      success: boolean;
      data: {
        [category: string]: ServerProduct[];
      };
    }
  | {
      [category: string]: ServerProduct[];
    };

const ProductItem: React.FC<{
  product: ServerProduct;
  quantity: number;
  onChangeQuantity: (newQuantity: number) => void;
  initialQuantity?: number;
  availableStock?: number; // Available stock based on loaded_quantity
}> = ({ product, quantity, onChangeQuantity, initialQuantity = 0, availableStock = Infinity }) => {
  const isMinStock = quantity === 0;
  const isSelected = quantity > 0;
  const isMaxStock = availableStock !== undefined && availableStock !== Infinity && quantity >= availableStock;
  // Display price with 5% VAT included
  const priceWithVat = product.price * 1.05;
  const originalPriceWithVat = product.originalPrice ? product.originalPrice * 1.05 : null;
  const displayPrice = originalPriceWithVat ? (
    <View style={styles.priceContainer}>
      <Text style={styles.productPriceOriginal}>AED {originalPriceWithVat.toFixed(2)}</Text>
      <Text style={styles.productPrice}>AED {priceWithVat.toFixed(2)}</Text>
    </View>
  ) : (
    <Text style={styles.productPrice}>AED {priceWithVat.toFixed(2)}</Text>
  );
  
  return (
    <View style={[styles.productCard, isSelected && styles.productCardSelected]}>
      <View style={styles.productMain}>
        <View style={[styles.productIconBox, isSelected && styles.productIconBoxSelected]}>
          {(() => {
            const imageUrl = getImageUrl(product.image_url);
            return imageUrl ? (
              <Image 
                source={{ uri: imageUrl }} 
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="water" size={18} color={isSelected ? "#FFFFFF" : "#0EA5E9"} />
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
          <View style={styles.productMeta}>
            {displayPrice}
          </View>
          {initialQuantity > 0 && (
            <View style={styles.orderedBadge}>
              <Ionicons name="checkmark" size={10} color="#059669" />
              <Text style={styles.orderedText}>Ordered: {initialQuantity}</Text>
            </View>
          )}
          {product.loaded_quantity !== undefined && (
            <View style={styles.stockBadge}>
              <Text style={styles.stockText}>
                Available: {availableStock !== Infinity ? availableStock : product.loaded_quantity}
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
            <Ionicons name="remove" size={16} color={isMinStock ? '#D1D5DB' : '#1E40AF'} />
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
            <Ionicons name="add" size={16} color={isMaxStock ? '#D1D5DB' : '#1E40AF'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const ProductList: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addToCart, clearCart, selectedOrder, assignedOrders, getAvailableStock, setProducts: setStoreProducts, setAssignedOrders } = useOrderStore();
  const { user } = useAuthStore();
  
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      let url = `${IP_ADDRESS}/products`;
      url += `?driver_id=${user?.id}`;
      
      // Get latest assignedOrders from store to avoid stale closure
      const store = useOrderStore.getState();
      const currentOrder = store.assignedOrders.find(order => order.id === selectedOrder);
      const customerSiteId = currentOrder?.customer_site_id;
      
      if (customerSiteId) {
        url += `&customer_site_id=${customerSiteId}&customer_id=${currentOrder.customer_id}`;
      }
      
      const response = await authenticatedFetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const rawResponse = await response.json();
      
      // Handle both response formats: {success: true, data: {...}} or direct {...}
      let productsData: { [category: string]: ServerProduct[] };
      
      // Check if it's wrapped format
      if (typeof rawResponse === 'object' && rawResponse !== null && 'success' in rawResponse) {
        const wrappedResponse = rawResponse as { success: boolean; data?: { [category: string]: ServerProduct[] } };
        if (!wrappedResponse.success || !wrappedResponse.data) {
          throw new Error('Invalid API response format');
        }
        productsData = wrappedResponse.data;
      } else if (typeof rawResponse === 'object' && rawResponse !== null && !Array.isArray(rawResponse)) {
        // Direct format - response is the data object itself
        // Verify it has category-like structure (values are arrays)
        const directData = rawResponse as Record<string, unknown>;
        const isValid = Object.values(directData).every(val => Array.isArray(val));
        if (isValid) {
          productsData = directData as { [category: string]: ServerProduct[] };
        } else {
          throw new Error('Invalid API response format');
        }
      } else {
        throw new Error('Invalid API response format');
      }
      
      // Flatten the category-based object into a single array
      const flattenedProducts: ServerProduct[] = [];
      Object.keys(productsData).forEach(category => {
        const categoryProducts = productsData[category];
        // Skip empty categories
        if (!Array.isArray(categoryProducts) || categoryProducts.length === 0) {
          return;
        }
        // Ensure each product has the category from the key if not in the product object
        categoryProducts.forEach(product => {
          flattenedProducts.push({
            ...product,
            category: product.category || category,
            image_url: product.image_url || '', // Handle null image_url
            description: product.description || '' // Handle null description
          });
        });
      });
      
      setProducts(flattenedProducts);
      
      // Update products in store with loaded_quantity for stock tracking
      const storeProducts: Product[] = flattenedProducts.map(serverProduct => ({
        id: serverProduct.id,
        name: serverProduct.name,
        description: serverProduct.description || '',
        image_url: getImageUrl(serverProduct.image_url) || '',
        pricing: serverProduct.price,
        category: serverProduct.category,
        loaded_quantity: serverProduct.loaded_quantity,
      }));
      // Use the store's setProducts function to update products with loaded_quantity
      setStoreProducts(storeProducts);
      
      setError(null);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedOrder]); // Removed assignedOrders - we access it inside but don't need it as dependency

  // Only fetch products when screen is focused, not when assignedOrders changes in background
  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  // Also fetch when refreshTrigger changes (for manual refresh)
  useEffect(() => {
    fetchProducts();
  }, [refreshTrigger]);

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    return uniqueCategories;
  }, [products]);

  const currentOrder = assignedOrders.find(order => order.id === selectedOrder);

  // Initialize rent items state from order
  const [rentItemsInTruck, setRentItemsInTruck] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (currentOrder?.rent_items) {
      currentOrder.rent_items.forEach(item => {
        initial[item.id] = item.in_truck ?? false;
      });
    }
    return initial;
  });

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    if (currentOrder?.rent_items) {
      currentOrder.rent_items.forEach(item => {
        initial[item.id] = item.in_truck ?? false;
      });
    }
    setRentItemsInTruck(initial);
  }, [currentOrder]);

  const initialQuantities = useMemo(() => {
    const record: Record<string, number> = {};
    
    products.forEach((p) => {
      // Use utility function to get quantity (works with both array and Record formats)
      // Match by both name AND category to avoid mixing retail-items and refill items
      const initialQty = currentOrder ? getProductQuantity(currentOrder, p.name, p.category) : 0;
      record[p.id] = initialQty;
    });
    
    return record;
  }, [products, currentOrder]);

  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);

  useEffect(() => {
    setQuantities(initialQuantities);
  }, [initialQuantities]);

  const handleChangeQuantity = useCallback((productId: string, newQuantity: number) => {
    // Get available stock for this product
    const availableStock = getAvailableStock(productId);
    // Limit newQuantity to available stock
    const limitedQuantity = availableStock !== Infinity 
      ? Math.max(0, Math.min(newQuantity, availableStock))
      : Math.max(0, newQuantity);
    
    setQuantities((prev) => ({ ...prev, [productId]: limitedQuantity }));
  }, [getAvailableStock]);

  const totalSelectedItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  }, [quantities]);

  // Check if any rent items are selected (in truck)
  const hasRentItemsSelected = useMemo(() => {
    if (!currentOrder?.rent_items) return false;
    return currentOrder.rent_items.some(item => rentItemsInTruck[item.id] === true);
  }, [currentOrder?.rent_items, rentItemsInTruck]);

  // Button should be enabled if products are selected OR rent items are selected
  const canCheckout = totalSelectedItems > 0 || hasRentItemsSelected;

  const totalAmount = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.price * (quantities[p.id] || 0)), 0);
  }, [products, quantities]);

  const handleCheckout = useCallback(() => {
    const selected = products.filter((p) => (quantities[p.id] || 0) > 0);
    const hasRentItems = currentOrder?.rent_items?.some(item => rentItemsInTruck[item.id] === true);
    
    if (selected.length === 0 && !hasRentItems) {
      showWarningAlert('No items selected', 'Please select at least one product or rent item to continue.');
      return;
    }

    // Update rent items in_truck status in the order
    if (currentOrder && currentOrder.rent_items) {
      const updatedRentItems = currentOrder.rent_items.map(item => ({
        ...item,
        in_truck: rentItemsInTruck[item.id] ?? false
      }));
      
      const updatedOrder = {
        ...currentOrder,
        rent_items: updatedRentItems
      };
      
      // Update the order in assignedOrders
      const updatedAssignedOrders = assignedOrders.map(order =>
        order.id === currentOrder.id ? updatedOrder : order
      );
      setAssignedOrders(updatedAssignedOrders);
    }

    const cartProducts: Product[] = selected.map(serverProduct => {
      // Build full image URL for cart items
      const fullImageUrl = getImageUrl(serverProduct.image_url) || '';
      // Prefer category from order if available, otherwise use product category
      const orderCategory = currentOrder ? getProductCategory(currentOrder, serverProduct.name) : undefined;
      return {
        id: serverProduct.id,
        name: serverProduct.name,
        description: serverProduct.description || '',
        image_url: fullImageUrl,
        pricing: serverProduct.price,
        category: orderCategory || serverProduct.category || '', // Prefer order category, then product category
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
      showWarningAlert('No Items Selected', 'Please select at least one product or rent item to continue.');
      return;
    }
    
    router.push('/(root)/(tabs)/checkout');
  }, [products, quantities, addToCart, clearCart, router, currentOrder, selectedOrder, assignedOrders, rentItemsInTruck, setAssignedOrders]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={36} color="#DC2626" />
        </View>
        <Text style={styles.errorTitle}>{error}</Text>
          <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => setRefreshTrigger(prev => prev + 1)}
          activeOpacity={0.7}
          >
          <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
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
            <Text style={styles.headerSubtitle}>{currentOrder.order_number}</Text>
          )}
            </View>
        <View style={styles.cartIndicator}>
          <Text style={styles.cartIndicatorText}>{totalSelectedItems}</Text>
            </View>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Selected</Text>
          <Text style={styles.summaryValue}>{totalSelectedItems} items</Text>
            </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValueHighlight}>AED {totalAmount.toFixed(2)}</Text>
            </View>
          </View>
          
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Context */}
          {currentOrder?.products && (
            (Array.isArray(currentOrder.products) && currentOrder.products.length > 0) ||
            (typeof currentOrder.products === 'object' && Object.keys(currentOrder.products).length > 0)
          ) && (
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
          const productsInCategory = products.filter((p) => p.category === category);

          return (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryTitleContainer}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                  </View>
                </View>
                <View style={styles.categoryCountBadge}>
                  <Text style={styles.categoryCount}>{productsInCategory.length}</Text>
                </View>
                </View>
                
                {productsInCategory.map((product) => {
                  // Match by both name AND category to avoid mixing retail-items and refill items
                  const initialQty = currentOrder ? getProductQuantity(currentOrder, product.name, product.category) : 0;
                  const availableStock = getAvailableStock(product.id);
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product.id, q)}
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
              <Text style={styles.categoryTitle}>Extra Instructions</Text>
              <Text style={styles.categoryCount}>{currentOrder.rent_items.length}</Text>
            </View>
            
            {currentOrder.rent_items.map((item) => {
              const isInTruck = rentItemsInTruck[item.id] ?? false;
              return (
                <View key={item.id} style={styles.rentItemCard}>
                  <View style={styles.rentItemMain}>
                    {item.image_url ? (
                      <Image 
                        source={{ uri: getImageUrl(item.image_url) || '' }} 
                        style={styles.rentItemImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.rentItemIconBox, item.category === 'borrow' ? styles.rentItemIconBorrow : styles.rentItemIconDeposit]}>
                        <Ionicons 
                          name={item.category === 'borrow' ? 'arrow-down-circle' : 'arrow-up-circle'} 
                          size={24} 
                          color={item.category === 'borrow' ? '#10B981' : '#3B82F6'} 
                        />
                      </View>
                    )}
                    <View style={styles.rentItemInfo}>
                      <Text style={styles.rentItemName}>{item.name}</Text>
                      <Text style={styles.rentItemDetails}>
                        {item.category === 'borrow' ? 'Borrow' : 'Deposit'} • Qty: {item.quantity} • AED {item.price.toFixed(2)} each
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.rentItemToggle, isInTruck ? styles.rentItemToggleOn : styles.rentItemToggleOff]}
                    onPress={() => setRentItemsInTruck(prev => ({ ...prev, [item.id]: !isInTruck }))}
                    activeOpacity={0.7}
                  >
                    {isInTruck ? (
                      <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={28} color="#9CA3AF" />
                    )}
                  </TouchableOpacity>
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
              !canCheckout && styles.checkoutButtonDisabled
            ]}
          onPress={handleCheckout}
          disabled={!canCheckout}
            activeOpacity={0.8}
          >
            <Text style={styles.checkoutButtonText}>Checkout</Text>
            <View style={[
              styles.checkoutArrow,
              !canCheckout && styles.checkoutArrowDisabled
            ]}>
              <Ionicons name="arrow-forward" size={16} color={!canCheckout ? '#9CA3AF' : '#1E40AF'} />
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
    backgroundColor: '#FAFBFC',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E40AF',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 2,
  },
  cartIndicator: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  cartIndicatorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  summaryValueHighlight: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  contextIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextText: {
    flex: 1,
    fontSize: 13,
    color: '#1D4ED8',
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryTitleContainer: {
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryCountBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    borderColor: '#2563EB',
    backgroundColor: '#FAFAFA',
  },
  productMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  productIconBoxSelected: {
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    flex: 1,
  },
  productNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productPriceOriginal: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  productDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D1D5DB',
  },
  productStock: {
    fontSize: 12,
    color: '#6B7280',
  },
  orderedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  orderedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  stockBadge: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  stockText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0284C7',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonDisabled: {
    backgroundColor: '#F9FAFB',
  },
  qtyDisplay: {
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    fontWeight: '500',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: -0.5,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
  },
  checkoutButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  checkoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  checkoutArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutArrowDisabled: {
    backgroundColor: '#F3F4F6',
  },
  rentItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rentItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rentItemIconBorrow: {
    backgroundColor: '#ECFDF5',
  },
  rentItemIconDeposit: {
    backgroundColor: '#EFF6FF',
  },
  rentItemInfo: {
    flex: 1,
  },
  rentItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 2,
  },
  rentItemDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  rentItemToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    backgroundColor: '#ECFDF5',
  },
  rentItemToggleOff: {
    backgroundColor: '#F3F4F6',
  },
  loadingBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    fontWeight: '500',
    color: '#6B7280',
  },
  errorBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1E40AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ProductList;
