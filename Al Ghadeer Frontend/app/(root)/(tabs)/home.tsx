import DeliveryCard from '@/components/DeliveryCard';
import MyMap from '@/components/map';
import { icons, images } from '@/constants';
import { useLocationStore, useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { useUser } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator } from 'react-native-paper';

const formatDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const IP_ADDRESS = "192.168.0.194:3000/api";

// API Response interface
interface ApiResponse {
  success: boolean;
  data: Order[];
}

interface HomeProps {
  navigation: {
    navigate: (screen: string, params?: any) => void;
  };
}

const Home = ({ navigation }: HomeProps) => {
  const { user } = useUser();
  const { setAssignedOrders, selectedOrder, selectOrder, assignedOrders, initializeDriver, currentDriver } = useOrderStore();
  const router = useRouter();
  const { setUserLocation } = useLocationStore();
  const driverName = user?.fullName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Driver';
  const avatar = user?.imageUrl || icons.person;
  const today = new Date();
  const [searchQuery, setSearchQuery] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  const [deliveries, setDeliveries] = useState<Order[]>([]);
  const [isloading, setIsloading] = useState(true);
  
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
  const availableOrdersCount = deliveries.filter(isOrderCurrentlyAvailable).length;


  useEffect(() => {
    const requestLocation = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setHasPermission(false);
        return;
      }
      setHasPermission(true);
      let location = await Location.getCurrentPositionAsync();
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords?.latitude,
        longitude: location.coords?.longitude,
      });
      setUserLocation({
        latitude: location.coords?.latitude, 
        longitude: location.coords?.longitude, 
        address: `${address[0]?.name || ''}, ${address[0]?.region || ''}`
      });
    };
    void requestLocation();
  }, [setUserLocation]);

  const handleViewDetails = (id:string) => {
    selectOrder(id)
    router.push("/(root)/(tabs)/order-details")
  }
  useEffect(() => {
    const fetchDeliveries = async () => {
      try {
        setIsloading(true);
        
        // Debug logging
        console.log('IP_ADDRESS:', IP_ADDRESS);
        console.log('Current Driver:', currentDriver);
        
        // Build URL with driver_id parameter if available
        let url = `http://${IP_ADDRESS}/driver/orders`;
        
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";
       
        console.log('Fetching from URL:', url);
        
        // Fetch data from Express API
        const response = await fetch(url);
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        // If response is not OK, throw error
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // Parse the new API response format
        const apiResponse: ApiResponse = await response.json();
        console.log('API Response:', apiResponse);
        
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }
        
        // Transform the flat structure to match our Order interface
        const transformedOrders: Order[] = apiResponse.data.map(order => ({
          ...order,
          // Keep products as-is if it exists, otherwise create empty object
          products: order.products || {}, 
          // Ensure customer_site_id is included
          customer_site_id: order.customer_site_id,
        }));
        
        // Sort orders by start_time (availability)
        const sortedOrders = transformedOrders.sort((a, b) => {
          // Handle orders without start_time by putting them at the end
          if (!a.start_time && !b.start_time) return 0;
          if (!a.start_time) return 1;
          if (!b.start_time) return -1;
          
          // Convert "18:30" format to comparable time
          const parseTime = (timeStr: string) => {
            if (timeStr.includes(':')) {
              const [hours, minutes] = timeStr.split(':');
              return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
            }
            // Fallback for other formats
            return new Date(timeStr).getTime();
          };
          
          // Sort by start_time (earliest first)
          return parseTime(a.start_time) - parseTime(b.start_time);
        });
        
        console.log('Transformed orders:', sortedOrders.length, 'orders');
        console.log('Sample order with availability:', sortedOrders[0] ? {
          id: sortedOrders[0].id,
          customer_name: sortedOrders[0].customer_name,
          customer_site_id: sortedOrders[0].customer_site_id,
          start_time: sortedOrders[0].start_time,
          end_time: sortedOrders[0].end_time,
          total_amount: sortedOrders[0].total_amount
        } : 'No orders');

        setDeliveries(sortedOrders);
        setAssignedOrders(sortedOrders);

        // Initialize driver data if not exists
        if (user && !currentDriver) {
          initializeDriver(user);
        }

      } catch (err) {
        console.error('Error fetching orders:', err);
        console.error('Error details:', err instanceof Error ? err.message : 'Unknown error');
        console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      } finally {
        setIsloading(false);
      }
    };

    // Call the async function
    fetchDeliveries();
  }, [user, IP_ADDRESS, setAssignedOrders, initializeDriver, currentDriver]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-white">
        {/* Map fills the whole screen */}
      <MyMap orders={deliveries} />

        {/* Transparent header overlay */}
        <View className="absolute top-0 left-0 right-0 px-6 pt-14 pb-2">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Image 
                source={typeof avatar === 'string' ? { uri: avatar } : avatar} 
                className="w-12 h-12 rounded-full border-2 border-white mr-4" 
              />
              <View>
                <Text className="text-gray-700 text-xs">Good morning,</Text>
                <Text className="text-gray-900 text-xl font-JakartaSemiBold">{driverName}</Text>
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
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 border border-gray-200"
            style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
            <Image source={icons.search} className="w-5 h-5 mr-3" resizeMode="contain" />
            <TextInput
              className="flex-1 text-base font-JakartaMedium"
              placeholder="Search for customers..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Image source={icons.close} className="w-5 h-5 ml-2" resizeMode="contain" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Today's Deliveries Section */}
        <View className="flex-1 bg-gray-50">
          <View className="px-6 py-4 flex-row items-center justify-between">
            <Text className="text-xl font-JakartaSemiBold text-gray-900">Today's Deliveries</Text>
            <View className="flex-row items-center gap-2">
              {availableOrdersCount > 0 && (
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
                <Text className="text-sm text-white font-JakartaSemiBold">{deliveries.length} total</Text>
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
            data={deliveries}
            keyExtractor={(item: Order) => item.id}
            renderItem={({ item }: { item: Order }) => (
              <DeliveryCard
                item={item}
                onPress={()=>{handleViewDetails(item.id)}}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
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
    </GestureHandlerRootView>
  );
};

export default Home;
