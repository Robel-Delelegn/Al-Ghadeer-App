import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useMemo } from 'react';
import { 
  ActivityIndicator, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { showErrorAlert, showSuccessAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

interface CheckoutSessionResponse {
  success: boolean;
  checkoutUrl: string;
  checkoutSessionId: string;
  orderId: string;
}

interface PaymentStatusResponse {
  success: boolean;
  paymentStatus: {
    checkout_session_id: string;
    payment_status: 'paid' | 'unpaid' | 'no_payment_required';
    order_id: string;
    amount_total: number;
    currency: string;
  };
}

const StripeQRPayment: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed'>('pending');
  
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod,
    updateOrderStatus
  } = useOrderStore();
  
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  
  const { subtotal, vat, totalWithVat } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => {
      if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
    const vatAmount = sub * 0.05;
    const total = sub + vatAmount;
    
    return {
      subtotal: sub.toFixed(2),
      vat: vatAmount.toFixed(2),
      totalWithVat: total.toFixed(2)
    };
  }, [cartItems]);

  // Create checkout session when component mounts
  useEffect(() => {
    console.log('paymentStatus', paymentStatus);
    if (paymentStatus === 'paid') {
        return;
      }

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const createCheckoutSession = async () => {
      if (!orderDetail) {
        showErrorAlert('Error', 'Order details not found.');
        router.back();
        return;
      }

      setIsLoading(true);
      
      try {
        const orderId = orderDetail.id || orderDetail.order_number || `order_${Date.now()}`;
        
        const response = await fetch(`${IP_ADDRESS}/payments/create-checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderId,
            amount: parseFloat(totalWithVat),
            currency: 'AED'
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create checkout session');
        }

        const result: CheckoutSessionResponse = await response.json();

        if (!result.success || !result.checkoutUrl || !result.checkoutSessionId) {
          throw new Error('Invalid response from server');
        }

        setCheckoutUrl(result.checkoutUrl);
        setCheckoutSessionId(result.checkoutSessionId);
        
        // Capture order ID at this point to avoid closure issues
        // orderDetail is already checked above, so this should always exist
        const currentOrderId = orderDetail.id;
        
        // Start polling for payment status
        setIsPolling(true);
        
        pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(`${IP_ADDRESS}/payments/status/${result.checkoutSessionId}`);
            
            if (!statusResponse.ok) {
              throw new Error('Failed to check payment status');
            }

            const statusResult: PaymentStatusResponse = await statusResponse.json();

            if (statusResult.success && statusResult.paymentStatus) {
              const status = statusResult.paymentStatus.payment_status;
              
              if (status === 'paid') {
                if (pollInterval) clearInterval(pollInterval);
                if (timeoutId) clearTimeout(timeoutId);
                setPaymentStatus('paid');
                setIsPolling(false);
                
                // Payment is confirmed by Stripe - update order status and navigate to receipt
                // Use the captured order ID instead of orderDetail which might be stale
                updateOrderStatus(currentOrderId, 'delivered');
                router.replace('/(root)/(tabs)/payment-receipt');
              }
            }
          } catch (error) {
            console.error('Error polling payment status:', error);
            // Continue polling on error
          }
        }, 2000); // Poll every 2 seconds

        // Stop polling after 5 minutes
        timeoutId = setTimeout(() => {
          if (pollInterval) clearInterval(pollInterval);
          setIsPolling(false);
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('Error creating checkout session:', error);
        showErrorAlert(
          'Payment Error',
          error instanceof Error ? error.message : 'Failed to initialize payment. Please try again.'
        );
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    createCheckoutSession();

    // Cleanup function
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [orderDetail, totalWithVat, router, updateOrderStatus]);


  const customerName = orderDetail?.customer_name || 'Customer';

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Setting up payment...</Text>
        </View>
      </View>
    );
  }

  if (!checkoutUrl || !checkoutSessionId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#DC2626" />
          <Text style={styles.errorText}>Failed to generate payment QR code</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
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
        <Text style={styles.headerTitle}>Card Payment</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <View style={styles.instructionsHeader}>
            <Ionicons name="information-circle" size={24} color="#0EA5E9" />
            <Text style={styles.instructionsTitle}>Scan to Pay</Text>
          </View>
          <Text style={styles.instructionsText}>
            Please scan this QR code with your phone camera to open the payment page. Complete the payment on your device.
          </Text>
        </View>

        {/* QR Code Card */}
        <View style={styles.qrCard}>
          <View style={styles.qrContainer}>
            {checkoutUrl && (
              <QRCode
                value={checkoutUrl}
                size={width * 0.7}
                color="#111827"
                backgroundColor="#FFFFFF"
              />
            )}
          </View>
          {isPolling && (
            <View style={styles.pollingIndicator}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.pollingText}>Waiting for payment...</Text>
            </View>
          )}
          {paymentStatus === 'paid' && (
            <View style={styles.successIndicator}>
              <Ionicons name="checkmark-circle" size={24} color="#059669" />
              <Text style={styles.successText}>Payment confirmed!</Text>
            </View>
          )}
        </View>

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Customer</Text>
            <Text style={styles.summaryValue}>{customerName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order ID</Text>
            <Text style={styles.summaryValue}>{orderDetail?.order_number || orderDetail?.id || 'N/A'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>AED {totalWithVat}</Text>
          </View>
        </View>

        {/* Alternative Option */}
        <View style={styles.alternativeCard}>
          <Ionicons name="link" size={20} color="#6B7280" />
          <Text style={styles.alternativeText}>
            You can also copy the payment link and open it in a browser
          </Text>
        </View>
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
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  instructionsCard: {
    backgroundColor: '#E0F2FE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0C4A6E',
  },
  instructionsText: {
    fontSize: 14,
    color: '#075985',
    lineHeight: 20,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
    alignItems: 'center',
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
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  pollingText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  successIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  successText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  summaryTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
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
    color: '#059669',
  },
  alternativeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  alternativeText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },
});

export default StripeQRPayment;

