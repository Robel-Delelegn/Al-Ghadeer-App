import { useLocationStore, useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState, useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import * as Location from 'expo-location';

const OrderDetails = () => {
  const { assignedOrders, selectedOrder, updateOrderStatus, completeOrder } = useOrderStore();
  const { userLatitude, userLongitude } = useLocationStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<{distance: string, duration: string} | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  const order = assignedOrders.find((o) => o.id === selectedOrder);

  // Calculate distance and duration using Google Maps API
  const calculateDistanceAndTime = useCallback(async () => {
    if (!order || !userLatitude || !userLongitude) return;

    const customerLatitude = order.customer?.latitude || order.latitude;
    const customerLongitude = order.customer?.longitude || order.longitude;
    
    if (!customerLatitude || !customerLongitude) {
      console.log('Customer coordinates not available');
      return;
    }

    // Validate coordinates are reasonable (within UAE region)
    const isValidCoordinate = (lat: number, lng: number) => {
      // UAE coordinates roughly: lat 22-26, lng 50-57
      return lat >= 22 && lat <= 26 && lng >= 50 && lng <= 57;
    };

    if (!isValidCoordinate(customerLatitude, customerLongitude)) {
      console.warn('Invalid customer coordinates (outside UAE region):', {
        lat: customerLatitude,
        lng: customerLongitude
      });
      return;
    }

    if (!isValidCoordinate(userLatitude, userLongitude)) {
      console.warn('Invalid driver coordinates (outside UAE region):', {
        lat: userLatitude,
        lng: userLongitude
      });
      return;
    }

    try {
      setIsCalculatingDistance(true);
      
      const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
      if (!GOOGLE_API_KEY) {
        console.error('Google Maps API key not found');
        return;
      }

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${customerLatitude},${customerLongitude}&key=${GOOGLE_API_KEY}&units=metric`;
      
      console.log('Calculating distance from driver to customer:', {
        driver: { lat: userLatitude, lng: userLongitude },
        customer: { lat: customerLatitude, lng: customerLongitude }
      });

      const response = await fetch(url);
      const data = await response.json();

      console.log('Google Maps API response:', {
        status: data.status,
        routes: data.routes?.length || 0,
        error_message: data.error_message
      });

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        const distance = leg.distance.text; // e.g., "5.2 km"
        const durationSeconds = leg.duration.value; // Duration in seconds
        const durationMinutes = Math.round(durationSeconds / 60);
        
        // Format duration as "X hrs Y mins" or "Y mins"
        let duration: string;
        if (durationMinutes >= 60) {
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          duration = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
          duration = `${durationMinutes}m`;
        }

        setDistanceInfo({ distance, duration });
        console.log('Distance calculated successfully:', { distance, duration });
      } else {
        console.error('Google Maps API error:', data.status, data.error_message);
        // Don't show error to user, just don't display distance info
        setDistanceInfo(null);
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
      setDistanceInfo(null);
    } finally {
      setIsCalculatingDistance(false);
    }
  }, [order, userLatitude, userLongitude]);

  // Calculate distance when component mounts or order changes
  useEffect(() => {
    calculateDistanceAndTime();
  }, [calculateDistanceAndTime]);

  const handleViewInMap = useCallback(async () => {
    if (!order || !userLatitude || !userLongitude) return;

    try {
      setIsLoading(true);
      const latitude = order.customer?.latitude || order.latitude;
      const longitude = order.customer?.longitude || order.longitude;
      
      if (!latitude || !longitude) {
        Alert.alert('Error', 'Customer location not available.');
        return;
      }
      
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLatitude},${userLongitude}&destination=${latitude},${longitude}&travelmode=driving`;
      await Linking.openURL(googleMapsUrl);
    } catch {
      Alert.alert('Error', 'Failed to open map.');
    } finally {
      setIsLoading(false);
    }
  }, [order, userLatitude, userLongitude]);

  const handleProceed = () => {
    if (!order) return;
    updateOrderStatus(order.id, 'in_progress');
    router.push('/(root)/(tabs)/add-products');
  };

  const handleMarkAsUnsuccessful = () => {
    if (!order) return;
    router.push('/(root)/(tabs)/failed-deliveries' as any);
  };

  if (!order) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <Text style={{ color: '#6C757D', fontSize: 16 }}>Order not found.</Text>
      </View>
    );
  }

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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={{ padding: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#495057" />
          </TouchableOpacity>
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>
            Delivery Details
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Information */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 24, 
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
              <Ionicons name="person" size={20} color="#1976D2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600', marginBottom: 2 }}>
                {order.customer?.name || order.customer_name || 'N/A'}
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>
                Customer Information
              </Text>
            </View>
            <View style={{
              backgroundColor: order.status === 'delivered' ? '#D4EDDA' : 
                              order.status === 'pending' ? '#FFF3CD' : 
                              order.status === 'assigned' ? '#D1ECF1' : '#F8D7DA',
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4
            }}>
              <Text style={{ 
                color: order.status === 'delivered' ? '#155724' : 
                       order.status === 'pending' ? '#856404' : 
                       order.status === 'assigned' ? '#0C5460' : '#721C24',
                fontSize: 12, 
                fontWeight: '500',
                textTransform: 'capitalize'
              }}>
                {order.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
          
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="call" size={16} color="#6C757D" style={{ marginRight: 12 }} />
              <Text style={{ color: '#495057', fontSize: 14, fontWeight: '500' }}>
                {order.customer?.phone || order.customer_phone || 'N/A'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Ionicons name="location" size={16} color="#6C757D" style={{ marginRight: 12, marginTop: 2 }} />
              <Text style={{ color: '#495057', fontSize: 14, flex: 1, lineHeight: 20 }}>
                {order.customer?.address || order.customer_address || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Distance & Time Information */}
        {isCalculatingDistance ? (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
            marginBottom: 16,
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color="#1976D2" />
              <Text style={{ color: '#6C757D', fontSize: 14, marginLeft: 12 }}>
                Calculating route...
              </Text>
            </View>
          </View>
        ) : distanceInfo ? (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
            marginBottom: 16,
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600', marginBottom: 20 }}>
              Route Information
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ 
                  width: 60, 
                  height: 60, 
                  backgroundColor: '#E3F2FD', 
                  borderRadius: 30, 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: 8
                }}>
                  <Ionicons name="car" size={24} color="#1976D2" />
                </View>
                <Text style={{ color: '#1976D2', fontSize: 20, fontWeight: '700' }}>
                  {distanceInfo.distance}
                </Text>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '500' }}>
                  Distance
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: '#E9ECEF', marginHorizontal: 16 }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ 
                  width: 60, 
                  height: 60, 
                  backgroundColor: '#E8F5E8', 
                  borderRadius: 30, 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: 8
                }}>
                  <Ionicons name="time" size={24} color="#28A745" />
                </View>
                <Text style={{ color: '#28A745', fontSize: 20, fontWeight: '700' }}>
                  {distanceInfo.duration}
                </Text>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '500' }}>
                  Travel Time
                </Text>
              </View>
            </View>
            
            {/* Map Button */}
            <TouchableOpacity
              style={{ 
                backgroundColor: '#1976D2', 
                paddingVertical: 14, 
                paddingHorizontal: 20, 
                borderRadius: 8, 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'center',
                shadowColor: '#1976D2',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 3
              }}
              onPress={handleViewInMap}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons name="navigate" size={20} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>
                    View in Map
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Order Details */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 24, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600', marginBottom: 16 }}>
            Order Details
          </Text>
          
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>Order ID</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                #{order.order_number}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>Created</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                {new Date(order.created_at).toLocaleDateString()}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>Total Amount</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
                AED {order.pricing?.total_amount || order.total_amount || 0}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>Payment Method</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500', textTransform: 'capitalize' }}>
                {order.payment_method || 'Cash'}
              </Text>
            </View>
          </View>
        </View>

        {/* Products */}
        {order.products && Object.keys(order.products).length > 0 && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
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
                <Ionicons name="cube" size={20} color="#8B5CF6" />
              </View>
              <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600' }}>
                Order Items
              </Text>
            </View>
            
            <View style={{ gap: 8 }}>
              {Object.entries(order.products).map(([productName, quantity]) => (
                <View key={productName} style={{ 
                  flexDirection: 'row', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: '#F8F9FA'
                }}>
                  <Text style={{ color: '#495057', fontSize: 14, flex: 1 }}>
                    {productName}
                  </Text>
                  <Text style={{ color: '#1976D2', fontSize: 14, fontWeight: '600' }}>
                    {quantity}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Site Information */}
        {(order.customer_site_id || order.start_time || order.end_time) && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
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
                <Ionicons name="business" size={20} color="#28A745" />
              </View>
              <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600' }}>
                Site Information
              </Text>
            </View>
            
            <View style={{ gap: 12 }}>
              {order.customer_site_id && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#6C757D', fontSize: 14 }}>Site ID</Text>
                  <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                    {order.customer_site_id}
                  </Text>
                </View>
              )}
              
              {(order.start_time || order.end_time) && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#6C757D', fontSize: 14 }}>Available</Text>
                  <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500' }}>
                    {order.start_time && order.end_time 
                      ? `${order.start_time} - ${order.end_time}`
                      : order.start_time 
                      ? `From ${order.start_time}`
                      : 'Not specified'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Delivery Instructions */}
        {(order.customer?.delivery_instructions || order.delivery_instructions) && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
            marginBottom: 16,
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ 
                width: 40, 
                height: 40, 
                backgroundColor: '#FFF3E0', 
                borderRadius: 20, 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: 12 
              }}>
                <Ionicons name="document-text" size={20} color="#F59E0B" />
              </View>
              <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600' }}>
                Delivery Instructions
              </Text>
            </View>
            <Text style={{ color: '#495057', fontSize: 14, lineHeight: 20 }}>
              {order.customer?.delivery_instructions || order.delivery_instructions}
            </Text>
          </View>
        )}

        {/* Timeline */}
        {(order.assigned_at || order.accepted_at || order.completed_at) && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
            marginBottom: 16,
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <Text style={{ color: '#495057', fontSize: 16, fontWeight: '600', marginBottom: 16 }}>
              Order Timeline
            </Text>
            
            <View style={{ gap: 12 }}>
              {order.assigned_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ 
                    width: 8, 
                    height: 8, 
                    backgroundColor: '#1976D2', 
                    borderRadius: 4, 
                    marginRight: 12 
                  }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#495057', fontSize: 14, fontWeight: '500' }}>
                      Order Assigned
                    </Text>
                    <Text style={{ color: '#6C757D', fontSize: 12 }}>
                      {new Date(order.assigned_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
              {order.accepted_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ 
                    width: 8, 
                    height: 8, 
                    backgroundColor: '#28A745', 
                    borderRadius: 4, 
                    marginRight: 12 
                  }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#495057', fontSize: 14, fontWeight: '500' }}>
                      Order Accepted
                    </Text>
                    <Text style={{ color: '#6C757D', fontSize: 12 }}>
                      {new Date(order.accepted_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
              {order.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ 
                    width: 8, 
                    height: 8, 
                    backgroundColor: '#6F42C1', 
                    borderRadius: 4, 
                    marginRight: 12 
                  }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#495057', fontSize: 14, fontWeight: '500' }}>
                      Order Completed
                    </Text>
                    <Text style={{ color: '#6C757D', fontSize: 12 }}>
                      {new Date(order.completed_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 20 }}>
          <TouchableOpacity
            style={{ 
              backgroundColor: '#28A745', 
              flex: 1, 
              paddingVertical: 16, 
              borderRadius: 12, 
              flexDirection: 'row', 
              justifyContent: 'center', 
              alignItems: 'center',
              shadowColor: '#28A745',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4
            }}
            onPress={handleProceed}
            disabled={isLoading}
          >
            <Ionicons name="checkmark-circle" size={22} color="white" />
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>
              Proceed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ 
              backgroundColor: '#DC3545', 
              flex: 1, 
              paddingVertical: 16, 
              borderRadius: 12, 
              flexDirection: 'row', 
              justifyContent: 'center', 
              alignItems: 'center',
              shadowColor: '#DC3545',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4
            }}
            onPress={handleMarkAsUnsuccessful}
            disabled={isLoading}
          >
            <Ionicons name="close-circle" size={22} color="white" />
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>
              Unsuccessful
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
};

export default OrderDetails;

