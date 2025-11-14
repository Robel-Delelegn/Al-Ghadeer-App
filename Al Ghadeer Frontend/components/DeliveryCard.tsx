import { icons } from "@/constants";
import { Order } from "@/types/order";
import * as Haptics from 'expo-haptics';
import { Image, Text, TouchableOpacity, View } from "react-native";

const getStatusChipStyle = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'assigned':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'in_progress':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'cancelled':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

const DeliveryCard = ({ item, onPress }: { item: Order; onPress?: () => void }) => {
  // Handle both nested and flat structures for backward compatibility
  const customerName = item.customer?.name || item.customer_name || 'N/A';
  const customerAddress = item.customer?.address || item.customer_address || 'N/A';
  const totalAmount = item.pricing?.total_amount || item.total_amount || 0;
  const distanceKm = item.delivery?.distance_km || 0;
  const scheduledTime = item.delivery?.scheduled_time || 'Time N/A';
  
  // Format availability times (expects "18:30" format)
  const formatAvailabilityTime = (timeString?: string) => {
    if (!timeString) return 'N/A';
    try {
      // Handle "18:30" format
      if (timeString.includes(':')) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours, 10);
        const minute = parseInt(minutes, 10);
        
        // Convert to 12-hour format
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
      }
      
      // Fallback for other formats
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return 'N/A';
    }
  };
  
  const availabilityTime = item.start_time && item.end_time 
    ? `${formatAvailabilityTime(item.start_time)} - ${formatAvailabilityTime(item.end_time)}`
    : item.start_time 
    ? `From ${formatAvailabilityTime(item.start_time)}`
    : scheduledTime;
  
  // Check if order is currently available
  const isCurrentlyAvailable = () => {
    if (!item.start_time || !item.end_time) return false;
    
    try {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
      
      const [startHour, startMin] = item.start_time.split(':').map(Number);
      const [endHour, endMin] = item.end_time.split(':').map(Number);
      
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;
      
      return currentTime >= startTime && currentTime <= endTime;
    } catch {
      return false;
    }
  };
  
  const currentlyAvailable = isCurrentlyAvailable();
  
  // Calculate total items dynamically from products object
  const calculateTotalItems = (): number => {
    if (item.products && typeof item.products === 'object') {
      // Sum all quantities from the products object
      return Object.values(item.products).reduce((total, quantity) => {
        return total + (typeof quantity === 'number' ? quantity : 0);
      }, 0);
    }
    // Fallback to legacy flat structure
    return (
      (item.five_litre_bottles || 0) + 
      (item.ten_litre_bottles || 0) + 
      (item.three_hundred_ml_bottles || 0) + 
      (item.one_litre_bottles || 0) + 
      (item.twenty_litre_bottles || 0) + 
      (item.water_dispenser || 0)
    );
  };
  
  const totalItems = calculateTotalItems();

  return (
    <TouchableOpacity
      onPress={async () => { try { await Haptics.selectionAsync(); } catch {}; onPress?.(); }}
      activeOpacity={0.9}
      className="mb-4 rounded-2xl bg-white px-5 py-4 flex flex-col gap-2 border border-gray-100"
      style={{
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      }}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-JakartaSemiBold text-gray-900 flex-1" numberOfLines={1}>{customerName}</Text>
        <View className="flex-row items-center gap-2">
          {currentlyAvailable && (
            <View className="w-3 h-3 bg-green-500 rounded-full shadow-sm" 
                  style={{ 
                    shadowColor: '#10B981', 
                    shadowOpacity: 0.6, 
                    shadowRadius: 4, 
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 3
                  }}>
            </View>
          )}
          <Text className={`px-3 py-1 rounded-full text-xs font-JakartaSemiBold border ${getStatusChipStyle(item.status)}`}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2 mb-1">
        <Image source={icons.pin} className="w-4 h-4 mr-1" />
        <Text className="text-gray-700 text-sm justify-start" numberOfLines={1}>{customerAddress}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Image source={icons.list} className="w-4 h-4 mr-1" />
        <Text className="text-gray-500 text-xs">{availabilityTime}</Text>
        <Text className="text-gray-700 text-sm justify-start font-JakartaSemiBold" numberOfLines={1}>
          {totalItems} Items
        </Text>
      </View>
      <View className="flex-row items-center gap-2 mt-1">
        <Text className="text-gray-600 text-xs">Total: AED {totalAmount}</Text>
      </View>
    </TouchableOpacity>
  );
};

  export default DeliveryCard;