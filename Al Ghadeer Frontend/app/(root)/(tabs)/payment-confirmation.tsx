import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState, useMemo } from 'react';
import { 
  ActivityIndicator, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { showErrorAlert, showSuccessAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

interface ApiResponse {
  success: boolean;
  message: string;
  order: {
    id: number;
    order_number: string;
    created_at: string;
    total_amount: number;
    payment_method: string;
    status: string;
  };
}

const PaymentConfirmation: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod,
    updateOrderStatus
  } = useOrderStore();
  
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  const checkoutSessionId = params.checkout_session_id as string | undefined;
  
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

  const paymentIcon = useMemo(() => {
    switch (selectedPaymentMethod) {
      case 'wallet': return 'wallet';
      case 'credit_card': return 'card';
      default: return 'cash';
    }
  }, [selectedPaymentMethod]);

  const paymentLabel = useMemo(() => {
    switch (selectedPaymentMethod) {
      case 'wallet': return 'Wallet';
      case 'credit_card': return 'Card';
      default: return 'Cash';
    }
  }, [selectedPaymentMethod]);

  const handleConfirmPayment = useCallback(async () => {
    if (!orderDetail) {
      showErrorAlert('Error', 'Order details not found.');
      return;
    }
    
    if (cartItems.length === 0) {
      showErrorAlert('Error', 'No items in cart.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const orderData = {
        customer_site_id: orderDetail.customer_site_id || '',
        customer_id:  orderDetail.customer_id || '',
        customer_name: orderDetail.customer_name || 'N/A',
        customer_phone: orderDetail.customer_phone || 'N/A',
        products: cartItems.filter(item => item?.name).map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal: parseFloat(subtotal),
        vat: parseFloat(vat),
        total_amount: parseFloat(totalWithVat),
        payment_method: selectedPaymentMethod.toLowerCase(),
        // Include checkout session ID if this is a credit card payment
        ...(checkoutSessionId && selectedPaymentMethod === 'credit_card' && { checkout_session_id: checkoutSessionId })
      };

      const url = `${IP_ADDRESS}/driver/orders/confirm-payment?driver_id=${user?.id}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const result: ApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Payment confirmation failed');
      }

      // Mark order as delivered and remove from assigned orders
      if (orderDetail) {
        updateOrderStatus(orderDetail.id, 'delivered');
      }

      showSuccessAlert(
        'Payment Successful', 
        result.message || `Order ${result.order.order_number} confirmed.`,
        [{ text: 'View Receipt', onPress: () => router.push('/(root)/(tabs)/payment-receipt') }]
      );
      
    } catch (error) {
      showErrorAlert(
        'Payment Failed', 
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  }, [orderDetail, cartItems, subtotal, vat, totalWithVat, selectedPaymentMethod, router, updateOrderStatus, checkoutSessionId]);

  const customerName = orderDetail?.customer_name || 'Customer';
  const customerAddress = orderDetail?.customer_address || '—';
  const customerPhone = orderDetail?.customer_phone || '—';
  const customerType = orderDetail?.customer_type || 'individual';
  const walletBalance = orderDetail?.wallet_balance ?? 0;
  const isOrganization = customerType === 'organization';

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
        <Text style={styles.headerTitle}>Confirm Payment</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Hero */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconBox}>
            <Ionicons name="shield-checkmark" size={28} color="#059669" />
          </View>
          <Text style={styles.heroTitle}>Ready to Confirm</Text>
          <Text style={styles.heroSubtitle}>Review the details before completing</Text>
        </View>

        {/* Order Items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Order Items</Text>
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>{itemCount}</Text>
            </View>
          </View>
          
          {cartItems.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="cart-outline" size={28} color="#D1D5DB" />
              <Text style={styles.emptyItemsText}>No items</Text>
            </View>
          ) : (
            cartItems.filter(item => item?.name).map((item, index) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemIconBox}>
                    <Ionicons name="water" size={14} color="#0EA5E9" />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} × AED {item.price}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>
                    AED {(item.price * item.quantity).toFixed(2)}
                  </Text>
                </View>
                {index < cartItems.length - 1 && <View style={styles.itemDivider} />}
              </View>
            ))
          )}
        </View>

        {/* Customer */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerPhone}>{customerPhone}</Text>
            </View>
          </View>
          <View style={styles.addressBox}>
            <Ionicons name="location" size={14} color="#6B7280" />
            <Text style={styles.addressText} numberOfLines={2}>{customerAddress}</Text>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Payment Method</Text>
            {isOrganization && (
              <View style={styles.orgBadge}>
                <Text style={styles.orgBadgeText}>Organization</Text>
              </View>
            )}
          </View>
          <View style={styles.paymentRow}>
            <View style={[
              styles.paymentIconBox,
              selectedPaymentMethod === 'wallet' && walletBalance < 0 && styles.paymentIconBoxNegative
            ]}>
              <Ionicons 
                name={paymentIcon} 
                size={20} 
                color={selectedPaymentMethod === 'wallet' && walletBalance < 0 ? '#F97316' : '#111827'} 
              />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentLabel}>{paymentLabel}</Text>
              {selectedPaymentMethod === 'wallet' ? (
                <Text style={[
                  styles.paymentSublabel,
                  walletBalance >= 0 ? styles.walletPositive : styles.walletNegative
                ]}>
                  Balance: AED {walletBalance.toFixed(2)}
                </Text>
              ) : (
                <Text style={styles.paymentSublabel}>Selected method</Text>
              )}
            </View>
            <View style={styles.paymentCheck}>
              <Ionicons name="checkmark" size={14} color="#059669" />
            </View>
          </View>
          {selectedPaymentMethod === 'wallet' && isOrganization && walletBalance < 0 && (
            <View style={styles.creditNote}>
              <Ionicons name="information-circle" size={14} color="#F97316" />
              <Text style={styles.creditNoteText}>Credit balance will be added to account</Text>
            </View>
          )}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Summary</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>AED {subtotal}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT (5%)</Text>
            <Text style={styles.totalValue}>AED {vat}</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>AED {totalWithVat}</Text>
          </View>
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.back()}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={18} color="#6B7280" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
            onPress={handleConfirmPayment}
            disabled={isProcessing || cartItems.length === 0}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>Processing...</Text>
              </>
            ) : (
              <>
                <Text style={styles.confirmButtonText}>Pay AED {totalWithVat}</Text>
                <View style={styles.confirmArrow}>
                  <Ionicons name="checkmark" size={16} color="#059669" />
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.4,
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#6B7280',
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
  itemCountBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyItemsText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 44,
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
  customerInfo: {
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
    gap: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentIconBoxNegative: {
    backgroundColor: '#FFF7ED',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  paymentSublabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  walletPositive: {
    color: '#059669',
  },
  walletNegative: {
    color: '#F97316',
  },
  paymentCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7C3AED',
  },
  creditNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  creditNoteText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 12,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  confirmButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PaymentConfirmation;




export default PaymentConfirmation;


