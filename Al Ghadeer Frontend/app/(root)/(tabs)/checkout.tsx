import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState, useMemo } from 'react';
import { 
  ActivityIndicator, 
  Alert, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

type PaymentMethod = 'cash' | 'wallet';

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const paymentOptions: PaymentOption[] = [
  { id: 'cash', label: 'Cash', icon: 'cash', description: 'Pay with cash on delivery' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet', description: 'Use customer wallet balance' },
];

const Checkout: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod,
    setPaymentMethod
  } = useOrderStore();
  
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  const [isLoading, setIsLoading] = useState(false);
  
  const { subtotal, vat, totalWithVat, itemCount } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => {
      if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
    const vatAmount = sub * 0.05;
    const total = sub + vatAmount;
    const count = cartItems.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    
    return {
      subtotal: sub.toFixed(2),
      vat: vatAmount.toFixed(2),
      totalWithVat: total.toFixed(2),
      itemCount: count
    };
  }, [cartItems]);

  const handleContinueToPayment = useCallback(async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart.');
      return;
    }
    
    if (!selectedPaymentMethod) {
      Alert.alert('Payment Required', 'Please select a payment method.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const validationData = {
        payment_method: selectedPaymentMethod.toLowerCase(),
        amount: parseFloat(totalWithVat),
        order_id: orderDetail?.id || orderDetail?.order_number || null,
        customer_id: orderDetail?.customer_id || orderDetail?.customer?.id || null
      };

      const response = await fetch(`${IP_ADDRESS}/driver/orders/validate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validationData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        Alert.alert(
          'Validation Failed',
          result.message || 'Payment validation failed.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      router.push('/(root)/(tabs)/payment-confirmation');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to validate payment.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } finally {
      setIsLoading(false);
    }
  }, [cartItems, router, selectedPaymentMethod, totalWithVat, orderDetail]);

  const customerName = orderDetail?.customer?.name || orderDetail?.customer_name || 'Customer';
  const customerAddress = orderDetail?.customer?.address || orderDetail?.customer_address || '—';
  const customerPhone = orderDetail?.customer?.phone || orderDetail?.customer_phone || '—';

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
          <Text style={styles.headerTitle}>Checkout</Text>
          {orderDetail && (
            <Text style={styles.headerSubtitle}>{orderDetail.order_number}</Text>
          )}
        </View>
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{itemCount}</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          
          {cartItems.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="cart-outline" size={28} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyText}>No items in cart</Text>
            </View>
          ) : (
            cartItems.filter(item => item?.name).map((item, index) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemIconBox}>
                    <Ionicons name="water" size={14} color="#0EA5E9" />
                  </View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemQuantity}>Qty: {item.quantity}</Text>
                  </View>
                  <View style={styles.itemPricing}>
                    <Text style={styles.itemPrice}>AED {(item.price * item.quantity).toFixed(2)}</Text>
                    <Text style={styles.itemUnitPrice}>@ {item.price}</Text>
                  </View>
                </View>
                {index < cartItems.length - 1 && <View style={styles.itemDivider} />}
              </View>
            ))
          )}
        </View>

        {/* Delivery To */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deliver To</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerPhone}>{customerPhone}</Text>
            </View>
          </View>
          
          <View style={styles.addressBox}>
            <View style={styles.addressIcon}>
              <Ionicons name="location" size={12} color="#6B7280" />
            </View>
            <Text style={styles.addressText} numberOfLines={2}>{customerAddress}</Text>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Method</Text>
          <View style={styles.paymentGrid}>
            {paymentOptions.map((option) => {
              const isSelected = selectedPaymentMethod === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.paymentOption,
                    isSelected && styles.paymentOptionSelected
                  ]}
                  onPress={() => setPaymentMethod(option.id)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.paymentIconBox,
                    isSelected && styles.paymentIconBoxSelected
                  ]}>
                    <Ionicons 
                      name={option.icon} 
                      size={20} 
                      color={isSelected ? '#FFFFFF' : '#6B7280'} 
                    />
                  </View>
                  <Text style={[
                    styles.paymentLabel,
                    isSelected && styles.paymentLabelSelected
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.paymentCheck}>
                      <Ionicons name="checkmark" size={10} color="#059669" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>AED {subtotal}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>VAT (5%)</Text>
            <Text style={styles.summaryValue}>AED {vat}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>AED {totalWithVat}</Text>
          </View>
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Total</Text>
            <Text style={styles.actionTotal}>AED {totalWithVat}</Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.continueButton,
              (cartItems.length === 0 || isLoading || !selectedPaymentMethod) && styles.continueButtonDisabled
            ]}
            onPress={handleContinueToPayment}
            disabled={isLoading || cartItems.length === 0 || !selectedPaymentMethod}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>Continue</Text>
                <View style={[
                  styles.continueArrow,
                  (cartItems.length === 0 || !selectedPaymentMethod) && styles.continueArrowDisabled
                ]}>
                  <Ionicons 
                    name="arrow-forward" 
                    size={16} 
                    color={(cartItems.length === 0 || !selectedPaymentMethod) ? '#9CA3AF' : '#111827'} 
                  />
                </View>
              </>
            )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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
  cartBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  cartBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  editLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemPricing: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  itemUnitPrice: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 48,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  customerPhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
  },
  addressIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  paymentGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentOption: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#111827',
  },
  paymentIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentIconBoxSelected: {
    backgroundColor: '#111827',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  paymentLabelSelected: {
    color: '#111827',
  },
  paymentCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  totalValue: {
    fontSize: 20,
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
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    gap: 10,
  },
  continueButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueArrowDisabled: {
    backgroundColor: '#F3F4F6',
  },
});

export default Checkout;
