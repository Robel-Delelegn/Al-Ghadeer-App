import ApiErrorText from '@/components/ApiErrorText';
import { useLocationStore, useOrderStore } from '@/store/index';
import { authenticatedFetch } from '@/store/auth';
import { parseApiResponseWithSoftError } from '@/utils/api';
import { getTotalItemsCount, normalizeOrderProducts } from '@/utils/orderUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { showErrorAlert, showSuccessAlert, showWarningAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

const { width } = Dimensions.get('window');

const OrderDetails = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assignedOrders, selectedOrder, updateOrderStatus } = useOrderStore();
  const { userLatitude, userLongitude } = useLocationStore();
  const [isLoading, setIsLoading] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<{distance: string, duration: string} | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const order = assignedOrders.find((o) => o.id === selectedOrder);

  const calculateDistanceAndTime = useCallback(async () => {
    if (!order || !userLatitude || !userLongitude) return;

    const customerLatitude = order.latitude;
    const customerLongitude = order.longitude;
    
    if (!customerLatitude || !customerLongitude) return;

    const isValidCoordinate = (lat: number, lng: number) => {
      return lat >= 22 && lat <= 26 && lng >= 50 && lng <= 57;
    };

    if (!isValidCoordinate(customerLatitude, customerLongitude) || 
        !isValidCoordinate(userLatitude, userLongitude)) {
      return;
    }

    try {
      setIsCalculatingDistance(true);
      
      const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
      if (!GOOGLE_API_KEY) return;

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${customerLatitude},${customerLongitude}&key=${GOOGLE_API_KEY}&units=metric`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.routes?.[0]) {
        const leg = data.routes[0].legs[0];
        const distance = leg.distance.text;
        const durationMinutes = Math.round(leg.duration.value / 60);
        
        let duration: string;
        if (durationMinutes >= 60) {
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          duration = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
          duration = `${durationMinutes}m`;
        }

        setDistanceInfo({ distance, duration });
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
    } finally {
      setIsCalculatingDistance(false);
    }
  }, [order, userLatitude, userLongitude]);

  useEffect(() => {
    calculateDistanceAndTime();
  }, [calculateDistanceAndTime]);

  const handleViewInMap = useCallback(async () => {
    if (!order || !userLatitude || !userLongitude) return;

    try {
      setIsLoading(true);
      const latitude = order.latitude;
      const longitude = order.longitude;
      
      if (!latitude || !longitude) {
        showErrorAlert('Error', 'Customer location not available.');
        return;
      }
      
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLatitude},${userLongitude}&destination=${latitude},${longitude}&travelmode=driving`;
      await Linking.openURL(googleMapsUrl);
    } catch {
      showErrorAlert('Error', 'Failed to open map.');
    } finally {
      setIsLoading(false);
    }
  }, [order, userLatitude, userLongitude]);

  const handleProceed = () => {
    if (!order) return;
    router.push('/(root)/(tabs)/add-products');
  };

  const handleMarkAsUnsuccessful = () => {
    if (!order) return;
    router.push('/(root)/(tabs)/failed-deliveries' as any);
  };

  const parseAddressComponents = (geocodeResult: any) => {
    const addressComponents = geocodeResult.address_components || [];
    let streetName = '';
    let buildingNo = '';
    let flatNo = '';
    let fullAddress = geocodeResult.formatted_address || '';

    // Find route (street name)
    const route = addressComponents.find((comp: any) => 
      comp.types && comp.types.includes('route')
    );
    if (route) {
      streetName = route.long_name || route.short_name || '';
    }

    // Find street number (building number)
    const streetNumber = addressComponents.find((comp: any) => 
      comp.types && comp.types.includes('street_number')
    );
    if (streetNumber) {
      buildingNo = streetNumber.long_name || streetNumber.short_name || '';
    }

    // Find subpremise (flat/apartment number)
    const subpremise = addressComponents.find((comp: any) => 
      comp.types && comp.types.includes('subpremise')
    );
    if (subpremise) {
      flatNo = subpremise.long_name || subpremise.short_name || '';
    }

    return { streetName, buildingNo, flatNo, fullAddress };
  };

  const handleUpdateCustomerLocation = useCallback(async () => {
    if (!order) {
      showErrorAlert('Error', 'Order information not found.');
      return;
    }

    if (!order.customer_site_id || !order.customer_id) {
      showErrorAlert('Error', 'Customer information is incomplete.');
      return;
    }

    setIsUpdatingLocation(true);
    setApiError(null);
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showWarningAlert('Permission Denied', 'Location permission is required to update customer location.');
        return;
      }

      // Get current location
      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const latitude = locationData.coords.latitude;
      const longitude = locationData.coords.longitude;

      // Reverse geocode using Google Maps Geocoding API
      if (!GOOGLE_API_KEY) {
        showErrorAlert('Error', 'Google Maps API key not configured.');
        return;
      }

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status !== 'OK' || !geocodeData.results || geocodeData.results.length === 0) {
        showErrorAlert('Error', 'Failed to get address information.');
        return;
      }

      const result = geocodeData.results[0];
      const { streetName, buildingNo, flatNo, fullAddress } = parseAddressComponents(result);

      // Prepare the request data
      const locationUpdateData = {
        customer_site_id: order.customer_site_id,
        customer_id: order.customer_id,
        address: fullAddress,
        street_name: streetName,
        building_no: buildingNo,
        flat_no: flatNo,
        longitude: longitude,
        latitude: latitude,
        delivery_instructions: order.delivery_instructions || '',
      };

      // Make the API call
      const url = `${IP_ADDRESS}/driver/customer-location/update`;
      const response = await authenticatedFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locationUpdateData),
      });

      const apiResult = await parseApiResponseWithSoftError<unknown>(response);
      if (!apiResult.ok) {
        setApiError(apiResult.error);
        return;
      }
      showSuccessAlert(
        'Location Updated',
        'Customer location has been updated successfully.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error updating customer location:', error);
      setApiError(error instanceof Error ? error.message : 'Failed to update customer location.');
    } finally {
      setIsUpdatingLocation(false);
    }
  }, [order]);

  if (!order) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.emptyIconBox}>
          <Ionicons name="document-outline" size={40} color="#D1D5DB" />
        </View>
        <Text style={styles.emptyTitle}>Order not found</Text>
        <Text style={styles.emptySubtitle}>This order may have been removed</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => router.back()}>
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const customerName = order.customer_name || 'Unknown';
  const customerPhone = order.customer_phone || '—';
  const customerAddress =  order.customer_address || '—';
  const totalAmount = order.total_amount || 0;
  const deliveryInstructions = order.delivery_instructions;

  const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
    pending: { color: '#D97706', bgColor: '#FFFBEB', label: 'Pending' },
    assigned: { color: '#2563EB', bgColor: '#EFF6FF', label: 'Assigned' },
    in_progress: { color: '#7C3AED', bgColor: '#F5F3FF', label: 'In Progress' },
    delivered: { color: '#059669', bgColor: '#ECFDF5', label: 'Delivered' },
    failed: { color: '#DC2626', bgColor: '#FEF2F2', label: 'Failed' },
  };

  const currentStatus = statusConfig[order.status] || statusConfig.pending;

  const productCount = order ? getTotalItemsCount(order) : 0;

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
          <Text style={styles.headerTitle}>{order.order_number}</Text>
          <View style={[styles.statusPill, { backgroundColor: currentStatus.bgColor }]}>
            <View style={[styles.statusDot, { backgroundColor: currentStatus.color }]} />
            <Text style={[styles.statusPillText, { color: currentStatus.color }]}>
              {currentStatus.label}
            </Text>
        </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ApiErrorText error={apiError} />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                  {customerName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{customerName}</Text>
                <Text style={styles.customerLabel}>Customer</Text>
              </View>
              <TouchableOpacity 
                style={styles.callButton}
                onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              activeOpacity={0.7}
              >
              <Ionicons name="call" size={18} color="#059669" />
              </TouchableOpacity>
            </View>
            
          <View style={styles.cardDivider} />
            
            <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="call-outline" size={14} color="#6B7280" />
              </View>
              <Text style={styles.infoText}>{customerPhone}</Text>
            </View>
            
            <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="location-outline" size={14} color="#6B7280" />
            </View>
            <Text style={styles.infoText}>{customerAddress}</Text>
          </View>
        </View>

        {/* Route Card */}
        {(isCalculatingDistance || distanceInfo) && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ROUTE</Text>
            {isCalculatingDistance ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator size="small" color="#1E40AF" />
                <Text style={styles.routeLoadingText}>Calculating...</Text>
              </View>
            ) : distanceInfo && (
              <>
                <View style={styles.routeMetrics}>
                  <View style={styles.routeMetric}>
                    <View style={styles.routeMetricIcon}>
                      <Ionicons name="navigate" size={18} color="#1E40AF" />
                    </View>
                    <Text style={styles.routeMetricValue}>{distanceInfo.distance}</Text>
                    <Text style={styles.routeMetricLabel}>Distance</Text>
                  </View>
                  <View style={styles.routeMetricDivider} />
                  <View style={styles.routeMetric}>
                    <View style={styles.routeMetricIcon}>
                      <Ionicons name="time" size={18} color="#1E40AF" />
                    </View>
                    <Text style={styles.routeMetricValue}>{distanceInfo.duration}</Text>
                    <Text style={styles.routeMetricLabel}>Est. Time</Text>
                  </View>
                </View>
                
                <TouchableOpacity 
                  style={styles.mapButton}
                  onPress={handleViewInMap}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="map" size={16} color="#FFFFFF" />
                      <Text style={styles.mapButtonText}>Navigate</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Order Info Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ORDER DETAILS</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Order ID</Text>
            <Text style={styles.detailValue}>{order.order_number}</Text>
            </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Text style={styles.detailValue}>
                {order.payment_method === 'credit_card' ? 'Card' :
                 ['invoice', 'credit_invoice', 'credit_sale', 'credit'].includes(order.payment_method ?? '') ? 'Credit' :
                 order.payment_method === 'credit_invoice' ? 'Credit Invoice' :
                 (order.payment_method || 'Cash').charAt(0).toUpperCase() + (order.payment_method || 'cash').slice(1)}
              </Text>
            </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Items</Text>
            <Text style={styles.detailValue}>{productCount} items</Text>
            </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total</Text>
            <Text style={styles.detailValueHighlight}>AED {totalAmount}</Text>
          </View>
        </View>

        {/* Products Card */}
        {order.products && (
          (Array.isArray(order.products) && order.products.length > 0) ||
          (typeof order.products === 'object' && Object.keys(order.products).length > 0)
        ) && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ITEMS</Text>
              {(() => {
                const { productsArray } = normalizeOrderProducts(order.products);
                return productsArray.map((product, index) => (
                  <View key={product.id || product.name}>
                    <View style={styles.productRow}>
                      <View style={styles.productIcon}>
                        <Ionicons name="water" size={14} color="#0EA5E9" />
                      </View>
                      <Text style={styles.productName}>{product.name}</Text>
                      <View style={styles.productQtyBadge}>
                        <Text style={styles.productQty}>×{product.quantity}</Text>
                      </View>
                    </View>
                    {index < productsArray.length - 1 && (
                      <View style={styles.productDivider} />
                    )}
                  </View>
                ));
              })()}
          </View>
        )}

        {/* Rent Items Card */}
        {order.rent_items && order.rent_items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>RENT ITEMS</Text>
            {order.rent_items.map((item, index) => (
              <View key={item.id}>
                <View style={styles.productRow}>
                  <View style={[styles.productIcon, item.category === 'borrow' ? styles.rentIconBorrow : styles.rentIconDeposit]}>
                    <Ionicons 
                      name={item.category === 'borrow' ? 'arrow-down-circle' : 'arrow-up-circle'} 
                      size={14} 
                      color={item.category === 'borrow' ? '#10B981' : '#3B82F6'} 
                    />
                  </View>
                  <View style={styles.rentItemInfo}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.rentItemCategory}>
                      {item.category === 'borrow' ? 'Borrow' : 'Deposit'} • Qty: {item.quantity} • AED {(item.price * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.rentItemStatus, item.in_truck ? styles.rentItemStatusOn : styles.rentItemStatusOff]}>
                    {item.in_truck ? (
                      <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={28} color="#9CA3AF" />
                    )}
                  </View>
                </View>
                {index < (order.rent_items?.length || 0) - 1 && (
                  <View style={styles.productDivider} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Instructions */}
        {deliveryInstructions && (
          <View style={[styles.card, styles.instructionsCard]}>
            <View style={styles.instructionsHeader}>
              <Ionicons name="information-circle" size={18} color="#D97706" />
              <Text style={styles.instructionsTitle}>Instructions</Text>
            </View>
            <Text style={styles.instructionsText}>{deliveryInstructions}</Text>
          </View>
        )}

        {/* Availability */}
        {(order.start_time || order.end_time) && (
          <View style={styles.card}>
            <View style={styles.availabilityRow}>
              <View style={styles.availabilityIcon}>
                <Ionicons name="time-outline" size={16} color="#6B7280" />
              </View>
              <Text style={styles.availabilityText}>
                {order.start_time && order.end_time 
                  ? `${order.start_time} — ${order.end_time}`
                  : order.start_time 
                  ? `From ${order.start_time}`
                  : 'Flexible'}
              </Text>
            </View>
          </View>
        )}

        {/* Update Location Button */}
        <TouchableOpacity 
          style={styles.updateLocationButton}
          onPress={handleUpdateCustomerLocation}
          disabled={isUpdatingLocation}
          activeOpacity={0.8}
        >
          {isUpdatingLocation ? (
            <>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.updateLocationButtonText}>Updating Location...</Text>
            </>
          ) : (
            <>
              <View style={styles.updateLocationIconBox}>
                <Ionicons name="location" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.updateLocationButtonText}>Update Customer Location</Text>
              <View style={styles.updateLocationArrow}>
                <Ionicons name="arrow-forward" size={16} color="#3B82F6" />
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
        <TouchableOpacity 
            style={styles.failButton}
          onPress={handleMarkAsUnsuccessful}
          activeOpacity={0.8}
        >
            <Ionicons name="close" size={20} color="#DC2626" />
            <Text style={styles.failButtonText}>Unsuccessful</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.proceedButton}
          onPress={handleProceed}
          activeOpacity={0.8}
        >
          <Text style={styles.proceedButtonText}>Start Delivery</Text>
          <View style={styles.proceedArrow}>
              <Ionicons name="arrow-forward" size={16} color="#1E40AF" />
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
    paddingBottom: 16,
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
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E40AF',
    letterSpacing: -0.4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRight: {
    width: 36,
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
        shadowColor: '#1E40AF',
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
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  customerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    letterSpacing: -0.3,
  },
  customerLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  infoIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  routeLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  routeLoadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  routeMetrics: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  routeMetric: {
    flex: 1,
    alignItems: 'center',
  },
  routeMetricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: -0.5,
  },
  routeMetricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  routeMetricDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
    alignSelf: 'center',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  detailRowDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E40AF',
  },
  detailValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  productIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1E40AF',
  },
  productQtyBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  productQty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  rentItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rentItemCategory: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  rentIconBorrow: {
    backgroundColor: '#ECFDF5',
  },
  rentIconDeposit: {
    backgroundColor: '#EFF6FF',
  },
  rentItemStatus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  rentItemStatusOn: {
    backgroundColor: '#ECFDF5',
  },
  rentItemStatusOff: {
    backgroundColor: '#F3F4F6',
  },
  productDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 40,
  },
  instructionsCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  instructionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  instructionsText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  availabilityIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  availabilityText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E40AF',
  },
  updateLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#DBEAFE',
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  updateLocationIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  updateLocationButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
    textAlign: 'center',
  },
  updateLocationArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  failButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  failButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  proceedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  proceedArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 20,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
});

export default OrderDetails;
