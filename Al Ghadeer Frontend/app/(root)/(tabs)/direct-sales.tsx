import { useOrderStore } from '@/store/index';
import { Product } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';

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

const DirectSales: React.FC = () => {
  const router = useRouter();
  const { currentDriver } = useOrderStore();
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        let url = `${IP_ADDRESS}/driver/products`;
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const apiResponse: ProductsApiResponse = await response.json();
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }
        
        setProducts(apiResponse.data);
      } catch (err) {
        console.error('Error fetching products:', err);
        Alert.alert('Error', 'Failed to load products. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Get device location
  useEffect(() => {
    const getLocation = async () => {
      try {
        setLocationLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required for direct sales.');
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
          address: `${addressData[0]?.name || ''}, ${addressData[0]?.region || ''}, ${addressData[0]?.city || ''}`
        });
      } catch (error) {
        console.error('Error getting location:', error);
        Alert.alert('Error', 'Failed to get location. Please try again.');
      } finally {
        setLocationLoading(false);
      }
    };

    getLocation();
  }, []);

  const handleChangeQuantity = useCallback((productId: string, newQuantity: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));
  }, []);

  const selectedProducts = useMemo(() => {
    return products.filter((p) => (quantities[p.id] || 0) > 0);
  }, [products, quantities]);

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, product) => {
      return sum + (product.price * (quantities[product.id] || 0));
    }, 0);
  }, [selectedProducts, quantities]);

  const vat = useMemo(() => {
    return subtotal * 0.15; // 15% VAT
  }, [subtotal]);

  const totalAmount = useMemo(() => {
    return subtotal + vat;
  }, [subtotal, vat]);

  const handleConfirmSale = useCallback(async () => {
    // Validation
    if (selectedProducts.length === 0) {
      Alert.alert('No Items', 'Please select at least one product.');
      return;
    }

    if (!customerName.trim()) {
      Alert.alert('Customer Name Required', 'Please enter customer name.');
      return;
    }

    if (!customerPhone.trim()) {
      Alert.alert('Phone Number Required', 'Please enter customer phone number.');
      return;
    }

    if (!location) {
      Alert.alert('Location Required', 'Please wait for location to be retrieved.');
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
        subtotal: subtotal,
        vat: vat,
        total_amount: totalAmount,
        payment_method: 'cash',
        sale_date: new Date().toISOString()
      };

      console.log('Submitting direct sale:', saleData);

      const response = await fetch(`${IP_ADDRESS}/driver/direct-sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleData),
      });

      const result = await response.json();
      console.log('Direct sale response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to submit direct sale');
      }

      Alert.alert(
        'Sale Confirmed!',
        `Direct sale of AED ${totalAmount.toFixed(2)} has been recorded successfully.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setQuantities({});
              setCustomerName('');
              setCustomerPhone('');
              router.back();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error submitting direct sale:', error);
      Alert.alert(
        'Sale Failed',
        error instanceof Error ? error.message : 'Failed to confirm sale. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedProducts, quantities, customerName, customerPhone, location, subtotal, vat, totalAmount, currentDriver, router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View style={{ 
        backgroundColor: '#10B981', 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center', marginRight: 40 }}>
            Direct Sales
          </Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Information Card */}
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
              <Ionicons name="person" size={20} color="#1976D2" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Customer Information
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                CUSTOMER NAME
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#F8F9FA',
                  borderRadius: 6,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#E9ECEF',
                  fontSize: 14,
                  color: '#212529'
                }}
                placeholder="Enter customer name"
                placeholderTextColor="#9CA3AF"
                value={customerName}
                onChangeText={setCustomerName}
              />
            </View>

            <View>
              <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                PHONE NUMBER
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#F8F9FA',
                  borderRadius: 6,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#E9ECEF',
                  fontSize: 14,
                  color: '#212529'
                }}
                placeholder="Enter phone number"
                placeholderTextColor="#9CA3AF"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        {/* Location Card */}
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
              Location
            </Text>
          </View>

          {locationLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
              <ActivityIndicator size="small" color="#1976D2" />
              <Text style={{ color: '#6C757D', fontSize: 14, marginLeft: 12 }}>
                Getting location...
              </Text>
            </View>
          ) : location ? (
            <View style={{ 
              backgroundColor: '#F8F9FA', 
              borderRadius: 6, 
              padding: 12, 
              borderWidth: 1, 
              borderColor: '#E9ECEF' 
            }}>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '500', lineHeight: 20 }}>
                {location.address}
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 12, marginTop: 4 }}>
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </Text>
            </View>
          ) : (
            <View style={{ 
              backgroundColor: '#FEF2F2', 
              borderRadius: 6, 
              padding: 12, 
              borderWidth: 1, 
              borderColor: '#FECACA' 
            }}>
              <Text style={{ color: '#DC2626', fontSize: 14 }}>
                Location not available
              </Text>
            </View>
          )}
        </View>

        {/* Products Selection Card */}
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
              <Ionicons name="cube" size={20} color="#F59E0B" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Select Products
            </Text>
          </View>

          {loading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={{ color: '#6C757D', fontSize: 14, marginTop: 12 }}>
                Loading products...
              </Text>
            </View>
          ) : products.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Ionicons name="cube-outline" size={48} color="#9CA3AF" />
              <Text style={{ color: '#6C757D', fontSize: 14, marginTop: 12 }}>
                No products available
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {products.map((product) => {
                const quantity = quantities[product.id] || 0;
                const isMaxStock = product.available_stock !== "N/A" && quantity >= Number(product.available_stock);
                const isMinStock = quantity === 0;

                return (
                  <View key={product.id} style={{ 
                    backgroundColor: quantity > 0 ? '#E3F2FD' : '#F8F9FA', 
                    borderRadius: 8, 
                    padding: 12,
                    borderWidth: 1,
                    borderColor: quantity > 0 ? '#1976D2' : '#E9ECEF'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
                          {product.name}
                        </Text>
                        <Text style={{ color: '#1976D2', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
                          AED {product.price}
                        </Text>
                        <Text style={{ color: '#6C757D', fontSize: 12 }}>
                          Stock: {product.available_stock === "N/A" ? "Available" : product.available_stock}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <TouchableOpacity
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: isMinStock ? '#E9ECEF' : '#1976D2',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onPress={() => handleChangeQuantity(product.id, Math.max(0, quantity - 1))}
                          disabled={isMinStock}
                        >
                          <Ionicons name="remove" size={16} color={isMinStock ? '#6C757D' : 'white'} />
                        </TouchableOpacity>

                        <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700', minWidth: 30, textAlign: 'center' }}>
                          {quantity}
                        </Text>

                        <TouchableOpacity
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: isMaxStock ? '#E9ECEF' : '#1976D2',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onPress={() => handleChangeQuantity(product.id, quantity + 1)}
                          disabled={isMaxStock}
                        >
                          <Ionicons name="add" size={16} color={isMaxStock ? '#6C757D' : 'white'} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Summary Card */}
        {selectedProducts.length > 0 && (
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
                <Ionicons name="calculator" size={20} color="#8B5CF6" />
              </View>
              <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                Sale Summary
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#6C757D', fontSize: 14 }}>Subtotal:</Text>
                <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>AED {subtotal.toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#6C757D', fontSize: 14 }}>VAT (15%):</Text>
                <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>AED {vat.toFixed(2)}</Text>
              </View>
              <View style={{ 
                borderTopWidth: 1, 
                borderTopColor: '#E9ECEF', 
                paddingTop: 12, 
                marginTop: 8,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700' }}>Total Amount:</Text>
                <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '700' }}>AED {totalAmount.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Confirm Button */}
        <TouchableOpacity
          style={{ 
            backgroundColor: selectedProducts.length > 0 && customerName.trim() && customerPhone.trim() && location ? '#10B981' : '#E9ECEF',
            paddingVertical: 16, 
            paddingHorizontal: 24, 
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4
          }}
          onPress={handleConfirmSale}
          disabled={isSubmitting || selectedProducts.length === 0 || !customerName.trim() || !customerPhone.trim() || !location}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 12 }}>
                Confirming...
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                Confirm Sale
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default DirectSales;
