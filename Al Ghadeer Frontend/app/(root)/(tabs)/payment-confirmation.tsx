import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const IP_ADDRESS = "192.168.0.194:3000/api";

// API Response interface
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
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod
  } = useOrderStore();
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  
  // Debug logging
  console.log('Payment Confirmation - orderDetail:', orderDetail);
  console.log('Payment Confirmation - cartItems:', cartItems);
  console.log('Payment Confirmation - cartItems length:', cartItems.length);
  
  // Calculate totals from cart items with safety checks
  const subtotal = cartItems.reduce((sum, item) => {
    if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      console.error('Invalid cart item for calculation:', item);
      return sum;
    }
    return sum + item.price * item.quantity;
  }, 0).toFixed(2);
  const vat = (Number(subtotal) * 0.15).toFixed(2);
  const totalWithVat = (Number(subtotal) + Number(vat)).toFixed(2);
  const orderId = orderDetail?.order_number || 'N/A';

  const handleConfirmPayment = useCallback(async () => {
    if (!orderDetail) {
      Alert.alert('Error', 'Order details not found. Please try again.');
      return;
    }
    
    if (cartItems.length === 0) {
      Alert.alert('Error', 'No items in cart. Please add items before proceeding.');
      return;
    }
    
    console.log('Starting payment confirmation process...');
    setIsProcessing(true);
    
    try {
      // Prepare order data for server with safe property access
      const orderData = {
        customer_site_id: orderDetail.customer?.site_id || orderDetail.customer_site_id || '',
        customer_id: orderDetail.customer?.id || orderDetail.customer_id || '',
        customer_name: orderDetail.customer?.name || orderDetail.customer_name || 'N/A',
        customer_phone: orderDetail.customer?.phone || orderDetail.customer_phone || 'N/A',
        customer_email: orderDetail.customer?.email || orderDetail.customer_email || '',
        customer_address: orderDetail.customer?.address || orderDetail.customer_address || 'N/A',
        latitude: orderDetail.customer?.latitude || orderDetail.latitude || 0,
        longitude: orderDetail.customer?.longitude || orderDetail.longitude || 0,
        delivery_instructions: orderDetail.customer?.delivery_instructions || orderDetail.delivery_instructions || '',
        products: cartItems.map(item => {
          if (!item || !item.name) {
            console.error('Invalid cart item in payment confirmation:', item);
            return null;
          }
          return {
            name: item.name,
            quantity: item.quantity,
            price: item.price
          };
        }).filter(Boolean), // Remove null items
        subtotal: parseFloat(subtotal),
        vat: parseFloat(vat),
        total_amount: parseFloat(totalWithVat),
        payment_method: selectedPaymentMethod.toLowerCase(),
        delivery_zone: orderDetail.delivery?.delivery_zone || orderDetail.delivery_zone || 'General'
      };

      console.log('Sending order data:', orderData);

      // Send order to server
      let url = `http://${IP_ADDRESS}/driver/orders/confirm-payment`;
      url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";;
      console.log('Sending to:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const result: ApiResponse = await response.json();
      console.log('Payment confirmation response:', result);

      if (!result.success) {
        throw new Error(result.message || 'Payment confirmation failed');
      }

      // Show success message
      Alert.alert(
        'Payment Successful!', 
        result.message || `Order ${result.order.order_number} has been created successfully.`,
        [
          {
            text: 'View Receipt',
            onPress: () => router.push('/(root)/(tabs)/payment-receipt')
          }
        ]
      );
      
    } catch (error) {
      console.error('Payment confirmation error:', error);
      Alert.alert(
        'Payment Failed', 
        error instanceof Error ? error.message : 'There was an error processing your payment. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  }, [orderDetail, cartItems, subtotal, vat, totalWithVat, selectedPaymentMethod, router]);

  const handleEditOrder = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E9ECEF'
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#495057" />
          </TouchableOpacity>
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>Payment Confirmation</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {orderDetail && (
          <View style={{ 
            backgroundColor: '#E3F2FD', 
            borderRadius: 8, 
            padding: 12,
            borderWidth: 1,
            borderColor: '#BBDEFB'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="receipt" size={16} color="#1976D2" />
              <Text style={{ color: '#1976D2', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                Order #{orderDetail.order_number}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="person" size={14} color="#1976D2" />
              <Text style={{ color: '#1976D2', fontSize: 12, marginLeft: 6 }}>
                {orderDetail.customer?.name || orderDetail.customer_name || 'Customer'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ 
              width: 48, 
              height: 48, 
              backgroundColor: '#E8F5E8', 
              borderRadius: 24, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 16 
            }}>
              <Ionicons name="checkmark-circle" size={24} color="#28A745" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
                Ready for Payment
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>
                Please review your order details below
              </Text>
            </View>
          </View>
        </View>

        {/* Order Summary Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#E3F2FD', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="cube" size={20} color="#1976D2" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Order Summary
            </Text>
          </View>
          
          {cartItems.length === 0 ? (
            <View style={{ 
              backgroundColor: '#F8F9FA', 
              borderRadius: 8, 
              padding: 24, 
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E9ECEF'
            }}>
              <Ionicons name="cart-outline" size={32} color="#6C757D" />
              <Text style={{ color: '#6C757D', fontSize: 16, marginTop: 8, fontWeight: '500' }}>
                No items in cart
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {cartItems.map((item) => {
                if (!item || !item.name) {
                  console.error('Invalid cart item in order summary:', item);
                  return null;
                }
                const itemTotal = (item.price * item.quantity).toFixed(2);
                return (
                  <View key={item.id} style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: '#F8F9FA', 
                    borderRadius: 8, 
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E9ECEF'
                  }}>
                    <View style={{ 
                      width: 50, 
                      height: 50, 
                      borderRadius: 8, 
                      overflow: 'hidden', 
                      backgroundColor: '#F8F9FA',
                      borderWidth: 1,
                      borderColor: '#E9ECEF'
                    }}>
                      <Image
                        source={item.image || { uri: 'https://via.placeholder.com/150' }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
                        {item.name || 'Unknown Product'}
                      </Text>
                      <Text style={{ color: '#6C757D', fontSize: 12 }}>
                        Qty: {item.quantity} × {item.currency || 'AED'} {item.price || 0}
                      </Text>
                    </View>
                    <Text style={{ color: '#1976D2', fontSize: 16, fontWeight: '700' }}>
                      {item.currency || 'AED'} {itemTotal}
                    </Text>
                  </View>
                );
              }).filter(Boolean)}
            </View>
          )}
        </View>

        {/* Delivery Information Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#E8F5E8', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="location" size={20} color="#28A745" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Delivery Information
            </Text>
          </View>
          
          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                CUSTOMER NAME
              </Text>
              <View style={{ 
                backgroundColor: '#F8F9FA', 
                borderRadius: 6, 
                padding: 12, 
                borderWidth: 1, 
                borderColor: '#E9ECEF' 
              }}>
                <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                  {orderDetail?.customer?.name || orderDetail?.customer_name || 'N/A'}
                </Text>
              </View>
            </View>
            
            <View>
              <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                DELIVERY ADDRESS
              </Text>
              <View style={{ 
                backgroundColor: '#F8F9FA', 
                borderRadius: 6, 
                padding: 12, 
                borderWidth: 1, 
                borderColor: '#E9ECEF' 
              }}>
                <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500', lineHeight: 20 }}>
                  {orderDetail?.customer?.address || orderDetail?.customer_address || 'N/A'}
                </Text>
              </View>
            </View>
            
            <View>
              <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                CONTACT NUMBER
              </Text>
              <View style={{ 
                backgroundColor: '#F8F9FA', 
                borderRadius: 6, 
                padding: 12, 
                borderWidth: 1, 
                borderColor: '#E9ECEF' 
              }}>
                <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                  {orderDetail?.customer?.phone || orderDetail?.customer_phone || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Method Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#F3E8FF', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="card" size={20} color="#8B5CF6" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Payment Method
            </Text>
          </View>
          
          <View style={{ 
            backgroundColor: '#E3F2FD', 
            borderRadius: 8, 
            padding: 16, 
            borderWidth: 1, 
            borderColor: '#1976D2' 
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ 
                width: 40, 
                height: 40, 
                backgroundColor: '#1976D2', 
                borderRadius: 20, 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: 12 
              }}>
                <Ionicons 
                  name={selectedPaymentMethod === 'card' ? 'card' : 'cash'} 
                  size={20} 
                  color="white" 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#1976D2', fontSize: 16, fontWeight: '600', marginBottom: 2 }}>
                  {selectedPaymentMethod === 'card' ? 'Card Payment' : 'Cash Payment'}
                </Text>
                <Text style={{ color: '#1565C0', fontSize: 12 }}>
                  Selected payment method
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Summary Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#FFF3E0', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="calculator" size={20} color="#F59E0B" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Payment Summary
            </Text>
          </View>
          
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>Order ID:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
                {orderId}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>Subtotal:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>AED {subtotal}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>VAT (15%):</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>AED {vat}</Text>
            </View>
            
            <View style={{ 
              borderTopWidth: 1, 
              borderTopColor: '#E9ECEF', 
              paddingTop: 12, 
              marginTop: 8 
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700' }}>Total Amount:</Text>
                <Text style={{ color: '#1976D2', fontSize: 18, fontWeight: '700' }}>AED {totalWithVat}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={{ 
              backgroundColor: isProcessing ? '#E9ECEF' : '#1976D2',
              paddingVertical: 16, 
              paddingHorizontal: 24, 
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: isProcessing ? '#E9ECEF' : '#1976D2',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isProcessing ? 0.05 : 0.1,
              shadowRadius: 8,
              elevation: isProcessing ? 2 : 4
            }}
            onPress={handleConfirmPayment}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 12 }}>
                  Processing Payment...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="card" size={20} color="white" />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Confirm & Pay AED {totalWithVat}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={{ 
              paddingVertical: 16, 
              paddingHorizontal: 24, 
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#E9ECEF',
              backgroundColor: '#FFFFFF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2
            }}
            onPress={handleEditOrder}
            disabled={isProcessing}
          >
            <Ionicons name="pencil" size={16} color="#6C757D" />
            <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
              Edit Order
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default PaymentConfirmation;
