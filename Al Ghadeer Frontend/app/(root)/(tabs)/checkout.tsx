import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const Checkout: React.FC = () => {
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
  
  // Debug logging
  console.log('Checkout - cartItems:', cartItems);
  console.log('Checkout - cartItems length:', cartItems.length);
  console.log('Checkout - orderDetail:', orderDetail);
  
  // Additional debugging for cart items
  cartItems.forEach((item, index) => {
    console.log(`Cart item ${index}:`, {
      id: item?.id,
      name: item?.name,
      price: item?.price,
      quantity: item?.quantity,
      hasImage: !!item?.image
    });
  });
  
  const subtotal = cartItems.reduce((sum, item) => {
    if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      console.error('Invalid cart item for calculation:', item);
      return sum;
    }
    return sum + item.price * item.quantity;
  }, 0).toFixed(2);
  const vat = (Number(subtotal) * 0.15).toFixed(2); // 15% VAT
  const totalWithVat = (Number(subtotal) + Number(vat)).toFixed(2);



  const handleContinueToPayment = useCallback(() => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart.');
      return;
    }
    
    // Payment method is already stored in the order store
    console.log('Selected payment method:', selectedPaymentMethod);
    
    setIsLoading(true);
    try {
      // Navigate to payment confirmation page
      router.push('/(root)/(tabs)/payment-confirmation');
    } catch (error) {
      Alert.alert('Error', 'Failed to proceed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [cartItems, router, selectedPaymentMethod]);

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
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>Checkout</Text>
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
                  console.error('Invalid cart item:', item);
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
              })}
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
          
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity 
              style={{ 
                flex: 1, 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: 16, 
                borderRadius: 8, 
                borderWidth: 2, 
                backgroundColor: selectedPaymentMethod === 'cash' ? '#E3F2FD' : '#F8F9FA',
                borderColor: selectedPaymentMethod === 'cash' ? '#1976D2' : '#E9ECEF'
              }}
              onPress={() => setPaymentMethod('cash')}
            >
              <View style={{ 
                width: 20, 
                height: 20, 
                borderRadius: 10, 
                borderWidth: 2, 
                marginRight: 8,
                backgroundColor: selectedPaymentMethod === 'cash' ? '#1976D2' : 'transparent',
                borderColor: selectedPaymentMethod === 'cash' ? '#1976D2' : '#6C757D',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {selectedPaymentMethod === 'cash' && (
                  <View style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'white' 
                  }} />
                )}
              </View>
              <Ionicons 
                name="cash" 
                size={20} 
                color={selectedPaymentMethod === 'cash' ? '#1976D2' : '#6C757D'} 
              />
              <Text style={{ 
                color: selectedPaymentMethod === 'cash' ? '#1976D2' : '#6C757D', 
                fontSize: 14, 
                fontWeight: '600', 
                marginLeft: 8 
              }}>
                Cash
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ 
                flex: 1, 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: 16, 
                borderRadius: 8, 
                borderWidth: 2, 
                backgroundColor: selectedPaymentMethod === 'card' ? '#E3F2FD' : '#F8F9FA',
                borderColor: selectedPaymentMethod === 'card' ? '#1976D2' : '#E9ECEF'
              }}
              onPress={() => setPaymentMethod('card')}
            >
              <View style={{ 
                width: 20, 
                height: 20, 
                borderRadius: 10, 
                borderWidth: 2, 
                marginRight: 8,
                backgroundColor: selectedPaymentMethod === 'card' ? '#1976D2' : 'transparent',
                borderColor: selectedPaymentMethod === 'card' ? '#1976D2' : '#6C757D',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {selectedPaymentMethod === 'card' && (
                  <View style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'white' 
                  }} />
                )}
              </View>
              <Ionicons 
                name="card" 
                size={20} 
                color={selectedPaymentMethod === 'card' ? '#1976D2' : '#6C757D'} 
              />
              <Text style={{ 
                color: selectedPaymentMethod === 'card' ? '#1976D2' : '#6C757D', 
                fontSize: 14, 
                fontWeight: '600', 
                marginLeft: 8 
              }}>
                Card
              </Text>
            </TouchableOpacity>
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
                {orderDetail?.order_number || 'N/A'}
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

        {/* Continue Button */}
        <TouchableOpacity
          style={{ 
            backgroundColor: cartItems.length === 0 ? '#E9ECEF' : '#1976D2',
            paddingVertical: 16, 
            paddingHorizontal: 24, 
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: cartItems.length === 0 ? '#E9ECEF' : '#1976D2',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: cartItems.length === 0 ? 0.05 : 0.1,
            shadowRadius: 8,
            elevation: cartItems.length === 0 ? 2 : 4
          }}
          onPress={handleContinueToPayment}
          disabled={isLoading || cartItems.length === 0}
        >
          {isLoading ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 12 }}>
                Processing...
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="arrow-forward" size={20} color={cartItems.length === 0 ? '#6C757D' : 'white'} />
              <Text style={{ 
                color: cartItems.length === 0 ? '#6C757D' : 'white', 
                fontSize: 16, 
                fontWeight: '600', 
                marginLeft: 8 
              }}>
                Continue to Payment
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default Checkout;
