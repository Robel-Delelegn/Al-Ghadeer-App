import { useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Alert, 
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

interface ServerProduct {
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

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' as const },
  { id: 'wallet', label: 'Wallet', icon: 'wallet-outline' as const },
  { id: 'credit_card', label: 'Card', icon: 'card-outline' as const },
];

const DirectSales: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentDriver } = useOrderStore();
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'credit_card'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const driverId = currentDriver?.id || 'b97f3fc1-0708-4b97-bf5d-deb424b2cd93';
        const url = `${IP_ADDRESS}/products?driver_id=${driverId}`;
        console.log('Fetching products from:', url);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const apiResponse: ProductsApiResponse = await response.json();
        console.log('Products API response:', apiResponse);
        
        if (!apiResponse.success || !apiResponse.data) throw new Error('Invalid API response');
        
        setProducts(apiResponse.data);
      } catch (err) {
        console.error('Error fetching products:', err);
        Alert.alert('Error', 'Failed to load products.');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [currentDriver]);

  useEffect(() => {
    const getLocation = async () => {
      try {
        setLocationLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required.');
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
      if (selectedProducts.length === 0) Alert.alert('No Items', 'Please select at least one product.');
      else if (!customerName.trim()) Alert.alert('Required', 'Please enter customer name.');
      else if (!customerPhone.trim()) Alert.alert('Required', 'Please enter phone number.');
      else if (!location) Alert.alert('Required', 'Please wait for location.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saleData = {
        driver_id: currentDriver?.id || 'b97f3fc1-0708-4b97-bf5d-deb424b2cd93',
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

      const response = await fetch(`${IP_ADDRESS}/driver/direct-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData),
      });

      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Failed to submit');

      Alert.alert('Success', `Sale of AED ${totalAmount.toFixed(2)} confirmed.`, [
        { text: 'Done', onPress: () => { setQuantities({}); setCustomerName(''); setCustomerPhone(''); router.back(); }}
      ]);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to confirm sale.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isFormValid, selectedProducts, quantities, customerName, customerPhone, paymentMethod, location, subtotal, vat, totalAmount, currentDriver, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
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
                  style={styles.input}
                  placeholder="Phone"
                  placeholderTextColor="#CBD5E1"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
              />
            </View>
                  </View>
                  </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity 
                  key={method.id}
                  style={[
                    styles.paymentOption,
                    paymentMethod === method.id && styles.paymentOptionActive
                  ]}
                  onPress={() => setPaymentMethod(method.id as typeof paymentMethod)}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={method.icon} 
                    size={20} 
                    color={paymentMethod === method.id ? '#0F172A' : '#94A3B8'} 
                  />
                  <Text style={[
                    styles.paymentLabel,
                    paymentMethod === method.id && styles.paymentLabelActive
                  ]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>

          {/* Products */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Products</Text>
          {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0F172A" />
            </View>
          ) : products.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color="#E2E8F0" />
                <Text style={styles.emptyText}>No products available</Text>
            </View>
          ) : (
              <View style={styles.productGrid}>
              {products.map((product) => {
                const quantity = quantities[product.id] || 0;
                  const isSelected = quantity > 0;

                return (
                    <View key={product.id} style={[styles.productCard, isSelected && styles.productCardSelected]}>
                      <View style={styles.productInfo}>
                        <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.productPrice}>AED {product.price}</Text>
                      </View>

                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={[styles.quantityButton, quantity === 0 && styles.quantityButtonDisabled]}
                          onPress={() => handleChangeQuantity(product.id, -1)}
                          disabled={quantity === 0}
                        >
                          <Ionicons name="remove" size={18} color={quantity === 0 ? '#CBD5E1' : '#0F172A'} />
                        </TouchableOpacity>

                        <Text style={styles.quantityText}>{quantity}</Text>

                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => handleChangeQuantity(product.id, 1)}
                        >
                          <Ionicons name="add" size={18} color="#0F172A" />
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
                    <Ionicons name="arrow-forward" size={18} color="#0F172A" />
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
    color: '#0F172A',
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
    backgroundColor: '#0F172A',
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
    color: '#0F172A',
    fontWeight: '500',
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    height: 52,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  paymentLabelActive: {
    color: '#0F172A',
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
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
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
    color: '#0F172A',
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
    color: '#0F172A',
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
    color: '#0F172A',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 24,
    color: '#0F172A',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
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
