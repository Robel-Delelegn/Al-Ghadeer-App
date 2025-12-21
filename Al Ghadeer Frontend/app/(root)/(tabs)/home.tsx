import DeliveryCard from '@/components/DeliveryCard';
import MyMap from '@/components/map';
import ProfileModal from '@/components/ProfileModal';
import { icons, images } from '@/constants';
import { useLocationStore, useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { useAuthStore } from '@/store/auth';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

const formatDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

// API Response interface
interface ApiResponse {
  success: boolean;
  data: Order[];
}

const Home = () => {
  const { user } = useAuthStore();
  const { setAssignedOrders, selectOrder, assignedOrders, updateDriverInfo, currentDriver } = useOrderStore();
  const router = useRouter();
  const { setUserLocation } = useLocationStore();
  
  // Use useMemo to ensure these values update when currentDriver changes
  // Depend on currentDriver object itself, not nested properties, for proper reactivity
  const driverName = React.useMemo(
    () => currentDriver?.name || user?.driver_name || user?.name || user?.phone || 'Driver',
    [currentDriver, user?.driver_name, user?.name, user?.phone]
  );
  
  const helperName = React.useMemo(
    () => currentDriver?.helper_name || user?.helper_name || '',
    [currentDriver, user?.helper_name]
  );
  
  const avatar = React.useMemo(
    () => currentDriver?.profile_image || icons.person,
    [currentDriver]
  );
  const today = new Date();
  const [searchQuery, setSearchQuery] = useState('');
  const [isloading, setIsloading] = useState(true);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  
  // Helper function to check if order is currently available
  const isOrderCurrentlyAvailable = (order: Order) => {
    if (!order.start_time || !order.end_time) return false;
    
    try {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      const [startHour, startMin] = order.start_time.split(':').map(Number);
      const [endHour, endMin] = order.end_time.split(':').map(Number);
      
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;
      
      return currentTime >= startTime && currentTime <= endTime;
    } catch {
      return false;
    }
  };
  
  // Count currently available orders
  const availableOrdersCount = React.useMemo(
    () => assignedOrders.filter(isOrderCurrentlyAvailable).length,
    [assignedOrders]
  );

  // Filter deliveries based on search query
  const filteredDeliveries = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return assignedOrders;
    }

    const query = searchQuery.toLowerCase().trim();
    const searchFields = [
      'customer_name',
      'customer_phone',
      'customer_address',
      'order_number',
      'customer_site_id',
      'delivery_zone',
      'customer_email'
    ];

    return assignedOrders.filter((order) =>
      searchFields.some(field => {
        const value = order[field as keyof Order];
        return typeof value === 'string' && value.toLowerCase().includes(query);
      })
    );
  }, [assignedOrders, searchQuery]);


  useEffect(() => {
    const requestLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync();
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setUserLocation({
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude, 
        address: `${address[0]?.name || ''}, ${address[0]?.region || ''}`
      });
    };
    void requestLocation();
  }, [setUserLocation]);

  const handleViewDetails = (id:string) => {
    selectOrder(id)
    router.push("/(root)/(tabs)/order-details")
  }
  // Helper function to parse time string to minutes
  const parseTime = React.useCallback((timeStr: string): number => {
    if (timeStr.includes(':')) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    }
    return new Date(timeStr).getTime();
  }, []);

  useEffect(() => {
    const driverId = user?.id || currentDriver?.id;

    const fetchDeliveries = async () => {
      try {
        setIsloading(true);
        const url = `${IP_ADDRESS}/driver/orders?driver_id=${driverId}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const apiResponse: ApiResponse = await response.json();
        
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }
        
        const transformedOrders: Order[] = apiResponse.data.map(order => ({
          ...order,
          products: order.products || {}, 
          customer_site_id: order.customer_site_id,
        }));
        
        const sortedOrders = transformedOrders.sort((a, b) => {
          if (!a.start_time && !b.start_time) return 0;
          if (!a.start_time) return 1;
          if (!b.start_time) return -1;
          return parseTime(a.start_time) - parseTime(b.start_time);
        });

        setAssignedOrders(sortedOrders);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setIsloading(false);
      }
    };

    const fetchDriverInfo = async () => {
      try {
        const url = `${IP_ADDRESS}/driver/info?driver_id=${driverId}`;
        const response = await fetch(url);
        console.log('Driver info response:', response);
        if (!response.ok) return;
        
        const apiResponse = await response.json();
        if (apiResponse.success && apiResponse.data) {
          updateDriverInfo(apiResponse.data);
        }
      } catch (err) {
        // Silently fail - driver info is not critical
      }
    };

    fetchDeliveries();
    fetchDriverInfo();
  }, [user?.id, currentDriver?.id, IP_ADDRESS, setAssignedOrders, updateDriverInfo, parseTime]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-white">
        {/* Map fills the whole screen */}
      <MyMap orders={filteredDeliveries} />

        {/* Transparent header overlay */}
        <View className="absolute top-0 left-0 right-0 px-6 pt-14 pb-2">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <TouchableOpacity onPress={() => setIsProfileModalVisible(true)}>
                <Image 
                  source={typeof avatar === 'string' ? { uri: avatar } : avatar} 
                  className="w-12 h-12 rounded-full border-2 border-white mr-4" 
                />
              </TouchableOpacity>
              <View>
                <Text className="text-gray-700 text-xs">Good morning,</Text>
                <Text className="text-gray-900 text-xl font-JakartaSemiBold">{driverName}</Text>
                {helperName ? (
                  <Text className="text-gray-600 text-xs mt-0.5">Helper: {helperName}</Text>
                ) : null}
              </View>
            </View>
            <View className="bg-white/80 rounded-full px-3 py-1" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
              <Text className="text-gray-700 text-xs font-JakartaSemiBold">
                {formatDate(today)}
              </Text>
            </View>
          </View>
        </View>

        {/* Search Section */}
        <View className="px-6 py-3 bg-transparent">
          <View className="flex-row items-center gap-3">
            <View
              className="flex-1 flex-row items-center rounded-full px-4 py-[4px] bg-white border border-gray-200"
              style={{
                shadowColor: '#0F172A',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 4
              }}
            >
              <Image source={icons.search} className="w-5 h-5 mr-3" resizeMode="contain" />
              <TextInput
                className="flex-1 text-[15px] font-JakartaSemiBold text-gray-800"
                placeholder="Search for customers..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Image source={icons.close} className="w-5 h-5 ml-2 opacity-70" resizeMode="contain" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(root)/(tabs)/direct-sales')}
              className="rounded-full px-3 py-[10px] flex-row items-center justify-center"
              style={{ 
                backgroundColor: '#0EA5E9',
                shadowColor: '#0EA5E9',
                shadowOpacity: 0.28,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8
              }}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="flash-outline" size={18} color="white" />
                <Text className="text-white text-sm font-JakartaSemiBold">Direct Sale</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Deliveries Section */}
        <View className="flex-1 bg-gray-50">
          <View className="px-6 py-4 flex-row items-center justify-between">
            <Text className="text-xl font-JakartaSemiBold text-gray-900">Today's Deliveries</Text>
            <View className="flex-row items-center gap-2">
              {!searchQuery && availableOrdersCount > 0 && (
                <View className="flex-row items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2 py-1">
                  <View className="w-2 h-2 bg-green-500 rounded-full" 
                        style={{ 
                          shadowColor: '#10B981', 
                          shadowOpacity: 0.8, 
                          shadowRadius: 3, 
                          shadowOffset: { width: 0, height: 1 },
                          elevation: 2
                        }}>
                  </View>
                  <Text className="text-green-700 text-xs font-JakartaSemiBold">{availableOrdersCount}</Text>
                </View>
              )}
              <View className="bg-[#0286FF] rounded-full px-3 py-1">
                <Text className="text-sm text-white font-JakartaSemiBold">
                  {searchQuery ? `${filteredDeliveries.length} found` : `${assignedOrders.length} total`}
                </Text>
              </View>
            </View>
          </View>
          {isloading ? 
          (
            <View className='mt-16 items-center'>
              <ActivityIndicator className='mt-10 items-center justify-center'/>
            </View>
          )
          : (
          <FlatList
            data={filteredDeliveries}
            keyExtractor={(item: Order) => item.id}
            renderItem={({ item }: { item: Order }) => (
              <DeliveryCard
                item={item}
                onPress={()=>{handleViewDetails(item.id)}}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center mt-24">
                <Image source={images.noResult} className="w-40 h-40 mb-6" resizeMode="contain" />
                <Text className="text-lg text-gray-400 font-semibold">
                  {searchQuery ? 'No deliveries found' : 'No deliveries for today'}
                </Text>
                {searchQuery && (
                  <Text className="text-sm text-gray-300 mt-2">Try adjusting your search</Text>
                )}
              </View>
            }
            showsVerticalScrollIndicator={false}
          /> )
        } 
        </View>
      </View>
      
      {/* Profile Modal */}
      <ProfileModal 
        visible={isProfileModalVisible} 
        onClose={() => setIsProfileModalVisible(false)} 
      />
    </GestureHandlerRootView>
  );
};

export default Home;
