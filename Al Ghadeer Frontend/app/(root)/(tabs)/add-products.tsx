import { useOrderStore } from '@/store/index';
import { Product } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { 
  Alert, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

interface ServerProduct {
  customer_site_id?: string;
  customer_id?: string;
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  available_stock: string | number;
  category: string;
  image_url: string;
  is_active: boolean;
}

interface ProductsApiResponse {
  success: boolean;
  data: ServerProduct[];
  count: number;
}

const ProductItem: React.FC<{
  product: ServerProduct;
  quantity: number;
  onChangeQuantity: (newQuantity: number) => void;
  initialQuantity?: number;
}> = ({ product, quantity, onChangeQuantity, initialQuantity = 0 }) => {
  const isMaxStock = product.available_stock !== "N/A" && quantity >= Number(product.available_stock);
  const isMinStock = quantity === 0;
  const isSelected = quantity > 0;
  
  return (
    <View style={[styles.productCard, isSelected && styles.productCardSelected]}>
      <View style={styles.productMain}>
        <View style={[styles.productIconBox, isSelected && styles.productIconBoxSelected]}>
          <Ionicons name="water" size={18} color={isSelected ? "#FFFFFF" : "#0EA5E9"} />
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.productMeta}>
            <Text style={styles.productPrice}>AED {product.price}</Text>
            <View style={styles.productDot} />
            <Text style={styles.productStock}>
              {product.available_stock === "N/A" ? "In Stock" : `${product.available_stock} avail`}
            </Text>
          </View>
          {initialQuantity > 0 && (
            <View style={styles.orderedBadge}>
              <Ionicons name="checkmark" size={10} color="#059669" />
              <Text style={styles.orderedText}>Ordered: {initialQuantity}</Text>
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
            <Ionicons name="remove" size={16} color={isMinStock ? '#D1D5DB' : '#111827'} />
          </TouchableOpacity>

          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyText}>{quantity}</Text>
          </View>

          <TouchableOpacity
            style={[styles.qtyButton, isMaxStock && styles.qtyButtonDisabled]}
            onPress={() => onChangeQuantity(quantity + 1)}
            disabled={isMaxStock}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color={isMaxStock ? '#D1D5DB' : '#111827'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const ProductList: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addToCart, clearCart, selectedOrder, assignedOrders } = useOrderStore();
  
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        let url = `${IP_ADDRESS}/products`;
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";
        
        const currentOrder = assignedOrders.find(order => order.id === selectedOrder);
        const customerSiteId = currentOrder?.customer_site_id || currentOrder?.customer?.site_id;
        
        if (customerSiteId) {
          url += `&customer_site_id=${customerSiteId}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const apiResponse: ProductsApiResponse = await response.json();
        
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }
        
        setProducts(apiResponse.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [selectedOrder, assignedOrders]);

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    return uniqueCategories;
  }, [products]);

  const currentOrder = assignedOrders.find(order => order.id === selectedOrder);

  const initialQuantities = useMemo(() => {
    const record: Record<string, number> = {};
    
    products.forEach((p) => {
      let initialQty = 0;
      
      if (currentOrder?.products) {
        let orderProductQty = currentOrder.products[p.name];
        
        if (!orderProductQty) {
          const productNameLower = p.name.toLowerCase();
          const orderProductNames = Object.keys(currentOrder.products);
          const matchingKey = orderProductNames.find(key => 
            key.toLowerCase() === productNameLower
          );
          if (matchingKey) {
            orderProductQty = currentOrder.products[matchingKey];
          }
        }
        
        if (!orderProductQty) {
          const productNameLower = p.name.toLowerCase();
          const orderProductNames = Object.keys(currentOrder.products);
          const matchingKey = orderProductNames.find(key => 
            key.toLowerCase().includes(productNameLower) || 
            productNameLower.includes(key.toLowerCase())
          );
          if (matchingKey) {
            orderProductQty = currentOrder.products[matchingKey];
          }
        }
        
        if (orderProductQty && typeof orderProductQty === 'number') {
          initialQty = orderProductQty;
        }
      }
      
      record[p.id] = initialQty;
    });
    
    return record;
  }, [products, currentOrder]);

  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);

  useEffect(() => {
    setQuantities(initialQuantities);
  }, [initialQuantities]);

  const handleChangeQuantity = useCallback((productId: string, newQuantity: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));
  }, []);

  const totalSelectedItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  }, [quantities]);

  const totalAmount = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.price * (quantities[p.id] || 0)), 0);
  }, [products, quantities]);

  const handleCheckout = useCallback(() => {
    const selected = products.filter((p) => (quantities[p.id] || 0) > 0);
    if (selected.length === 0) {
      Alert.alert('No items selected', 'Please select at least one product to continue.');
      return;
    }

    const cartProducts: Product[] = selected.map(serverProduct => {
      let productType: "5L" | "10L" | "300ml" | "1L" | "20L" | "dispenser" = "5L";
      if (serverProduct.unit.includes("10L")) productType = "10L";
      else if (serverProduct.unit.includes("300ml")) productType = "300ml";
      else if (serverProduct.unit.includes("1L")) productType = "1L";
      else if (serverProduct.unit.includes("20L")) productType = "20L";
      else if (serverProduct.unit.includes("dispenser")) productType = "dispenser";

      return {
        id: serverProduct.id,
        name: serverProduct.name,
        type: productType,
        description: serverProduct.description,
        image_url: serverProduct.image_url || 'https://via.placeholder.com/150',
        pricing: {
          cost_price: serverProduct.price * 0.7,
          selling_price: serverProduct.price,
          driver_commission: serverProduct.price * 0.1,
          profit_margin: 0.3
        },
        inventory: {
          current_stock: serverProduct.available_stock === "N/A" ? 999 : Number(serverProduct.available_stock),
          reserved_stock: 0,
          available_stock: serverProduct.available_stock === "N/A" ? 999 : Number(serverProduct.available_stock),
          minimum_stock: 5,
          maximum_stock: 100,
          warehouse_location: 'Main Warehouse'
        },
        details: {
          weight: 1.0,
          dimensions: { length: 10, width: 10, height: 20 },
          material: 'Plastic',
          brand: 'Al Ghadeer'
        }
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
    
    if (itemsAdded === 0) {
      Alert.alert('No Items Selected', 'Please select at least one product to continue.');
      return;
    }
    
    router.push('/(root)/(tabs)/checkout');
  }, [products, quantities, addToCart, clearCart, router]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#111827" />
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
          onPress={() => setLoading(true)}
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
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
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
          {currentOrder?.products && Object.keys(currentOrder.products).length > 0 && (
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
                <Text style={styles.categoryTitle}>{category}</Text>
                <Text style={styles.categoryCount}>{productsInCategory.length}</Text>
                </View>
                
                {productsInCategory.map((product) => {
                  const initialQty = currentOrder?.products?.[product.name] || 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product.id, q)}
                      initialQuantity={initialQty}
                    />
                  );
                })}
            </View>
          );
        })}

        {/* Action Section */}
        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Total</Text>
            <Text style={styles.actionTotal}>AED {totalAmount.toFixed(2)}</Text>
          </View>
          
        <TouchableOpacity
            style={[
              styles.checkoutButton,
              totalSelectedItems === 0 && styles.checkoutButtonDisabled
            ]}
          onPress={handleCheckout}
          disabled={totalSelectedItems === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.checkoutButtonText}>Checkout</Text>
            <View style={[
              styles.checkoutArrow,
              totalSelectedItems === 0 && styles.checkoutArrowDisabled
            ]}>
              <Ionicons name="arrow-forward" size={16} color={totalSelectedItems === 0 ? '#9CA3AF' : '#111827'} />
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
    color: '#111827',
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
    backgroundColor: '#111827',
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
    color: '#111827',
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
  categoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  categoryCount: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
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
    borderColor: '#111827',
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
  },
  productIconBoxSelected: {
    backgroundColor: '#111827',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
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
    color: '#111827',
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
    color: '#111827',
    letterSpacing: -0.5,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
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
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ProductList;
