import ApiErrorText from '@/components/ApiErrorText';
import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { authenticatedFetch } from '@/store/auth';
import { parseApiResponseWithSoftError } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  ScrollView, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { showErrorAlert, showWarningAlert, showSuccessAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

// Server product structure - matches /api/products response exactly
interface ServerProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null; // Can be null
  description: string | null; // Can be null
  category: string;
  originalPrice?: number; // Optional, for special offers
  badge?: string; // Optional, for special offers
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

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' as const },
  { id: 'wallet', label: 'Wallet', icon: 'wallet-outline' as const },
  { id: 'credit_card', label: 'Card', icon: 'card-outline' as const },
  { id: 'credit', label: 'Credit', icon: 'receipt-outline' as const },
];

// Response structure for direct sales API
interface DirectSaleApiResponse {
  message: string;
  sale_id: string;
  invoice_number?: string;
}

const DirectSales: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentDriver, selectOrder, setPaymentMethod: setGlobalPaymentMethod, setLastConfirmPaymentResponse, clearCart } = useOrderStore();
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'credit_card' | 'credit'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      const driverId = currentDriver?.id;
      const url = `${IP_ADDRESS}/products?driver_id=${driverId}`;
      
      const response = await authenticatedFetch(url);
      const result = await parseApiResponseWithSoftError<{ [category: string]: ServerProduct[] }>(response);
      if (!result.ok) {
        setProducts([]);
        setApiError(result.error);
        return;
      }
      const productsData = result.data;
      
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
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  }, [currentDriver?.id]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const checkCustomer = useCallback(async () => {
    if (!customerPhone || customerPhone.trim().length === 0) {
      showWarningAlert('Phone Required', 'Please enter a phone number first.');
      return;
    }

    setIsCheckingCustomer(true);
    setIsExistingCustomer(false);
    setCustomerChecked(false);

    try {
      setApiError(null);
      const url = `${IP_ADDRESS}/customers/check?phone=${encodeURIComponent(customerPhone.trim())}`;
      const response = await authenticatedFetch(url);
      const parseResult = await parseApiResponseWithSoftError<{ is_customer?: boolean; customer?: { customer_name?: string } }>(response);

      if (!parseResult.ok) {
        setApiError(parseResult.error);
        setIsExistingCustomer(false);
        setCustomerChecked(true);
        return;
      }
      const data = parseResult.data;
      if (data.is_customer === true && data.customer) {
        setCustomerName(data.customer.customer_name || '');
        setIsExistingCustomer(true);
        setCustomerChecked(true);
        console.log('Customer found:', data.customer);
      } else {
        setIsExistingCustomer(false);
        setCustomerChecked(true);
        console.log('Customer is new');
      }
    } catch (error) {
      console.error('Error checking customer:', error);
      setIsExistingCustomer(false);
      setCustomerChecked(false);
    } finally {
      setIsCheckingCustomer(false);
    }
  }, [customerPhone]);

  useEffect(() => {
    const getLocation = async () => {
      try {
        setLocationLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          showWarningAlert('Permission Denied', 'Location permission is required.');
          return;
        }

        const locationData = await Location.getCurrentPositionAsync({});
        const addressData = await Location.reverseGeocodeAsync({
          latitude: locationData.coords.latitude,
          longitude: locationData.coords.longitude,
        });

        setLocation({
          latitude: locationData.coords.latitude,
          longitude: locationData.coords.longitude,
          address: `${addressData[0]?.name || ''}, ${addressData[0]?.city || ''}`
        });
      } catch (error) {
        console.error('Error getting location:', error);
      } finally {
        setLocationLoading(false);
      }
    };
    getLocation();
  }, []);

  const handleChangeQuantity = useCallback((productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const newVal = Math.max(0, current + delta);
      return { ...prev, [productId]: newVal };
    });
  }, []);

  const selectedProducts = useMemo(() => {
    return products.filter((p) => (quantities[p.id] || 0) > 0);
  }, [products, quantities]);

  const totalItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, q) => sum + q, 0);
  }, [quantities]);

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, product) => {
      return sum + (product.price * (quantities[product.id] || 0));
    }, 0);
  }, [selectedProducts, quantities]);

  const vat = useMemo(() => subtotal * 0.05, [subtotal]);
  const totalAmount = useMemo(() => subtotal + vat, [subtotal, vat]);

  const isFormValid = selectedProducts.length > 0 && customerName.trim() && customerPhone.trim() && location;

  const handleConfirmSale = useCallback(async () => {
    if (!isFormValid) {
      if (selectedProducts.length === 0) showWarningAlert('No Items', 'Please select at least one product.');
      else if (!customerName.trim()) showWarningAlert('Required', 'Please enter customer name.');
      else if (!customerPhone.trim()) showWarningAlert('Required', 'Please enter phone number.');
      else if (!location) showWarningAlert('Required', 'Please wait for location.');
      return;
    }

    setIsSubmitting(true);
    setApiError(null);
    try {
      const saleData = {
        driver_id: currentDriver?.id ,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        products: selectedProducts.map(product => ({
          product_id: product.id,
          product_name: product.name,
          quantity: quantities[product.id],
          unit_price: product.price,
          total_price: product.price * quantities[product.id]
        })),
        subtotal,
        vat,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        sale_date: new Date().toISOString()
      };

      const response = await authenticatedFetch(`${IP_ADDRESS}/driver/direct-sales`, {
        method: 'POST',
        body: JSON.stringify(saleData),
      });

      const parseResult = await parseApiResponseWithSoftError<DirectSaleApiResponse>(response);
      if (!parseResult.ok) {
        setApiError(parseResult.error);
        return;
      }
      const data = parseResult.data;

      // Prepare cart items from selected products for receipt display
      clearCart();
      const cartItemsFromSale = selectedProducts.map(product => ({
        id: product.id,
        name: product.name,
        image: { uri: product.image_url || 'https://via.placeholder.com/150' },
        price: product.price,
        quantity: quantities[product.id],
        currency: 'AED' as const,
        category: product.category || '',
      }));

      // Create order object for receipt page
      const saleId = data.sale_id;
      const invoiceNumber = data.invoice_number;
      const orderNumber = `SALE-${saleId}`;
      
      const newOrder: Order = {
        id: saleId,
        order_number: orderNumber,
        invoice_number: invoiceNumber,
        status: 'delivered',
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: location.address,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        products: selectedProducts.map(product => ({
          id: product.id,
          name: product.name,
          quantity: quantities[product.id],
          price: product.price,
        })),
      };

      // Add order to completedOrders and set cart items in one update
      const store = useOrderStore.getState();
      useOrderStore.setState({ 
        completedOrders: [...store.completedOrders, newOrder],
        cartItems: cartItemsFromSale
      });

      // Set selected order and payment method for receipt page
      selectOrder(newOrder.id);
      setGlobalPaymentMethod(paymentMethod);
      setLastConfirmPaymentResponse({
        orderId: saleId,
        invoice_number: invoiceNumber,
        order_number: orderNumber,
      });

      // Document type from response: invoice_number present → Invoice, absent → Delivery Note
      const hasInvoice = !!invoiceNumber;
      const documentType = hasInvoice ? 'Invoice' : 'Delivery Note';

      // Show success alert with option to view invoice/receipt
      showSuccessAlert(
        'Sale Confirmed', 
        data.message || `Sale of AED ${totalAmount.toFixed(2)} confirmed successfully.`,
        [
          { 
            text: 'Done', 
            style: 'cancel',
            onPress: () => { 
              setQuantities({}); 
              setCustomerName(''); 
              setCustomerPhone(''); 
              clearCart();
              router.back(); 
            }
          },
          { 
            text: `View ${documentType}`, 
            onPress: () => {
              router.push('/(root)/(tabs)/payment-receipt');
            }
          }
        ]
      );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to confirm sale.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isFormValid, selectedProducts, quantities, customerName, customerPhone, paymentMethod, location, subtotal, vat, totalAmount, currentDriver, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ApiErrorText error={apiError} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1E40AF" />
          </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Sale</Text>
          {location && (
            <View style={styles.locationBadge}>
              <Ionicons name="location" size={12} color="#10B981" />
              <Text style={styles.locationText} numberOfLines={1}>{location.address}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {totalItems > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartCount}>{totalItems}</Text>
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
      >
          {/* Customer Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                  style={styles.input}
                  placeholder="Name"
                  placeholderTextColor="#CBD5E1"
                value={customerName}
                onChangeText={setCustomerName}
              />
            </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="Phone"
                  placeholderTextColor="#CBD5E1"
                value={customerPhone}
                onChangeText={(text) => {
                  setCustomerPhone(text);
                  setIsExistingCustomer(false); // Reset when phone changes
                  setCustomerChecked(false); // Reset check status when phone changes
                }}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={styles.checkButton}
                onPress={checkCustomer}
                disabled={isCheckingCustomer || !customerPhone.trim()}
                activeOpacity={0.7}
              >
                {isCheckingCustomer ? (
                  <ActivityIndicator size="small" color="#1E40AF" />
                ) : (
                  <Ionicons name="search" size={16} color="#1E40AF" />
                )}
              </TouchableOpacity>
            </View>
            {customerChecked && (
              <View style={[styles.customerNote, isExistingCustomer ? styles.customerNoteExisting : styles.customerNoteNew]}>
                <Ionicons 
                  name={isExistingCustomer ? "checkmark-circle" : "person-add"} 
                  size={14} 
                  color={isExistingCustomer ? "#10B981" : "#3B82F6"} 
                />
                <Text style={[styles.customerNoteText, isExistingCustomer ? styles.customerNoteTextExisting : styles.customerNoteTextNew]}>
                  {isExistingCustomer ? "Existing customer" : "Customer is new"}
                </Text>
              </View>
            )}
                  </View>
                  </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.paymentContainer}>
              {/* Top Row: Cash, Wallet, Card */}
            <View style={styles.paymentRow}>
                {PAYMENT_METHODS.filter(m => ['cash', 'wallet', 'credit_card'].includes(m.id)).map((method) => {
                  const isDisabled = ['wallet', 'credit_card'].includes(method.id);
                  return (
                    <TouchableOpacity 
                      key={method.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionTop,
                        paymentMethod === method.id && styles.paymentOptionActive,
                        isDisabled && styles.paymentOptionDisabled
                      ]}
                      onPress={() => !isDisabled && setPaymentMethod(method.id as typeof paymentMethod)}
                      disabled={isDisabled}
                      activeOpacity={isDisabled ? 1 : 0.7}
                    >
                        <View style={[
                          styles.paymentIconBox,
                          paymentMethod === method.id && styles.paymentIconBoxActive,
                          isDisabled && styles.paymentIconBoxDisabled
                        ]}>
                      <Ionicons 
                        name={method.icon} 
                            size={22} 
                            color={
                              isDisabled ? '#CBD5E1' :
                              paymentMethod === method.id ? '#FFFFFF' : '#94A3B8'
                            } 
                      />
                        </View>
                      <Text style={[
                        styles.paymentLabel,
                        paymentMethod === method.id && styles.paymentLabelActive,
                        isDisabled && styles.paymentLabelDisabled
                      ]}>
                        {method.label}
                      </Text>
                        {paymentMethod === method.id && !isDisabled && (
                          <View style={styles.paymentCheck}>
                            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                          </View>
                        )}
                        {isDisabled && (
                          <View style={styles.paymentDisabledBadge}>
                            <Text style={styles.paymentDisabledText}>Not Available</Text>
                          </View>
                        )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              {/* Bottom Row: Credit Sale, Credit Invoice */}
              <View style={[styles.paymentRow, styles.paymentRowBottom]}>
                {PAYMENT_METHODS.filter(m => m.id === 'credit').map((method) => {
                  const isDisabled = false;
                  return (
                    <TouchableOpacity 
                      key={method.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionBottom,
                        paymentMethod === method.id && styles.paymentOptionActive,
                        isDisabled && styles.paymentOptionDisabled
                      ]}
                      onPress={() => !isDisabled && setPaymentMethod(method.id as typeof paymentMethod)}
                      disabled={isDisabled}
                      activeOpacity={isDisabled ? 1 : 0.7}
                    >
                      <View style={[
                        styles.paymentIconBox,
                        paymentMethod === method.id && styles.paymentIconBoxActive,
                        isDisabled && styles.paymentIconBoxDisabled
                      ]}>
                        <Ionicons 
                          name={method.icon} 
                          size={22} 
                          color={
                            isDisabled ? '#CBD5E1' :
                            paymentMethod === method.id ? '#FFFFFF' : '#94A3B8'
                          } 
                        />
                      </View>
                      <Text style={[
                        styles.paymentLabel,
                        paymentMethod === method.id && styles.paymentLabelActive,
                        isDisabled && styles.paymentLabelDisabled
                      ]}>
                        {method.label}
                      </Text>
                      {paymentMethod === method.id && !isDisabled && (
                        <View style={styles.paymentCheck}>
                          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        </View>
                      )}
                      {isDisabled && (
                        <View style={styles.paymentDisabledBadge}>
                          <Text style={styles.paymentDisabledText}>Not Available</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
          </View>
        </View>

          {/* Products */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Products</Text>
          {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1E40AF" />
            </View>
          ) : products.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color="#E2E8F0" />
                <Text style={styles.emptyText}>No products available</Text>
            </View>
          ) : (
              <View style={styles.productGrid}>
              {products.map((product, index) => {
                const quantity = quantities[product.id] || 0;
                  const isSelected = quantity > 0;

                const displayPrice = product.originalPrice ? (
                  <View style={styles.priceContainer}>
                    <Text style={styles.productPriceOriginal}>AED {product.originalPrice}</Text>
                    <Text style={styles.productPrice}>AED {product.price}</Text>
                  </View>
                ) : (
                  <Text style={styles.productPrice}>AED {product.price}</Text>
                );

                return (
                    <View key={`${product.id}-${index}`} style={[styles.productCard, isSelected && styles.productCardSelected]}>
                      <View style={styles.productInfo}>
                        <View style={styles.productNameContainer}>
                          <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                          {product.badge && (
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>{product.badge}</Text>
                            </View>
                          )}
                        </View>
                        {displayPrice}
                      </View>

                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={[styles.quantityButton, quantity === 0 && styles.quantityButtonDisabled]}
                          onPress={() => handleChangeQuantity(product.id, -1)}
                          disabled={quantity === 0}
                        >
                          <Ionicons name="remove" size={18} color={quantity === 0 ? '#CBD5E1' : '#1E40AF'} />
                        </TouchableOpacity>

                        <Text style={styles.quantityText}>{quantity}</Text>

                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => handleChangeQuantity(product.id, 1)}
                        >
                          <Ionicons name="add" size={18} color="#1E40AF" />
                        </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

          {/* Action Section */}
          <View style={styles.actionSection}>
            {/* Summary */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>AED {subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>VAT (5%)</Text>
                <Text style={styles.summaryValue}>AED {vat.toFixed(2)}</Text>
            </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>AED {totalAmount.toFixed(2)}</Text>
            </View>
          </View>

        {/* Confirm Button */}
        <TouchableOpacity
              style={[styles.confirmButton, !isFormValid && styles.confirmButtonDisabled]}
          onPress={handleConfirmSale}
              disabled={!isFormValid || isSubmitting}
              activeOpacity={0.8}
        >
          {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
                  <Text style={styles.confirmText}>Confirm Sale</Text>
                  <View style={styles.confirmArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#1E40AF" />
                  </View>
            </>
          )}
        </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: -0.3,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    maxWidth: 180,
  },
  headerRight: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  cartCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  inputRow: {
    gap: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1E40AF',
    fontWeight: '500',
  },
  phoneInput: {
    paddingRight: 8,
  },
  checkButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  customerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 50,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  customerNoteExisting: {
    backgroundColor: '#F0FDF4',
  },
  customerNoteNew: {
    backgroundColor: '#EFF6FF',
  },
  customerNoteText: {
    fontSize: 12,
    fontWeight: '500',
  },
  customerNoteTextExisting: {
    color: '#10B981',
  },
  customerNoteTextNew: {
    color: '#3B82F6',
  },
  paymentContainer: {
    gap: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentRowBottom: {
    justifyContent: 'center',
  },
  paymentOption: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    minHeight: 100,
    justifyContent: 'center',
  },
  paymentOptionTop: {
    flex: 1,
  },
  paymentOptionBottom: {
    flex: 0,
    minWidth: '48%',
    maxWidth: '48%',
  },
  paymentOptionActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
    ...Platform.select({
      ios: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  paymentIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  paymentIconBoxActive: {
    backgroundColor: '#10B981',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  paymentLabelActive: {
    color: '#1E40AF',
  },
  paymentCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 2,
  },
  paymentOptionDisabled: {
    backgroundColor: '#F8FAFC',
    opacity: 0.6,
  },
  paymentIconBoxDisabled: {
    backgroundColor: '#F1F5F9',
  },
  paymentLabelDisabled: {
    color: '#CBD5E1',
  },
  paymentDisabledBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  paymentDisabledText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  productGrid: {
    gap: 10,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  productCardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  productInfo: {
    flex: 1,
    marginRight: 16,
  },
  productNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  productName: {
    fontSize: 15,
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
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonDisabled: {
    backgroundColor: '#F8FAFC',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    minWidth: 32,
    textAlign: 'center',
  },
  actionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    color: '#1E40AF',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 24,
    color: '#1E40AF',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 56,
    borderRadius: 16,
    gap: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DirectSales;
