import { icons } from '@/constants';
import { formatDate, formatTime } from '@/lib/utils';
import { Ride } from '@/types/type';
import { Image, Text, View } from 'react-native';

const RideCard = ({
  ride: {
    destination_longitude,
    destination_latitude,
    origin_address,
    destination_address,
    created_at,
    ride_time,
    driver,
    payment_status,
  },
}: {
  ride: Ride;
}) => (
  <View className="flex-1 bg-white rounded-2xl mb-3 border border-gray-100" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
    <View className="flex flex-col items-center justify-center p-4">
      <View className="flex flex-row items-center justify-center">
        <Image
          source={{
            uri: `https://maps.geoapify.com/v1/staticmap?style=osm-bright-smooth&width=600&height=400&center=lonlat:${destination_longitude},${destination_latitude}&zoom=14&apiKey=${process.env.EXPO_PUBLIC_GEOPIFY_API_KEY}`,
          }}
          className="w-[80px] h-[90px] rounded-lg"
        />
        <View className="flex flex-col mx-5 gap-y-4 flex-1">
          <View className="flex flex-row items-center gap-x-2">
            <Image source={icons.to} className="w-5 h-5" />
            <Text className="text-md font-JakartaMedium text-gray-800">{origin_address}</Text>
          </View>
          <View className="flex flex-row items-center gap-x-2">
            <Image source={icons.point} className="w-5 h-5" />
            <Text className="text-md font-JakartaMedium text-gray-800" numberOfLines={1}>
              {destination_address}
            </Text>
          </View>
        </View>
      </View>
      <View className="flex flex-col w-full mt-4 bg-general-500 rounded-xl p-3 items-start justify-center">
        <View className="flex flex-row items-center w-full justify-between mb-5">
          <Text className="text-md font-JakartaMedium text-gray-600">
            Date & Time
          </Text>
          <Text className="text-md font-JakartaMedium text-gray-600">
            {formatDate(created_at)}, {formatTime(ride_time)}
          </Text>
        </View>
        <View className="flex flex-row items-center w-full justify-between mb-5">
          <Text className="text-md font-JakartaMedium text-gray-600">
            Driver
          </Text>
          <Text className="text-md font-JakartaMedium text-gray-600">
            {driver.first_name}, {driver.last_name}
          </Text>
        </View>
        <View className="flex flex-row items-center w-full justify-between mb-5">
          <Text className="text-md font-JakartaMedium text-gray-600">
            Car Seats
          </Text>
          <Text className="text-md font-JakartaMedium text-gray-600">
            {driver.car_seats}
          </Text>
        </View>
        <View className="flex flex-row items-center w-full justify-between mb-5">
          <Text className="text-md font-JakartaMedium text-gray-600">
            Payment Status
          </Text>
          <Text
            className={`text-md capitalize font-JakartaMedium ${payment_status === 'paid' ? 'text-green-500' : 'text-red-500'}`}
          >
            {payment_status}
          </Text>
        </View>
      </View>
    </View>
  </View>
);

export default RideCard;
