import * as Haptics from 'expo-haptics';
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

import { icons } from "@/constants";
import { Driver } from "@/types/order";

interface DriverCardProps {
  item: Driver;
  selected: boolean;
  setSelected: () => void;
}

const DriverCard = ({item, selected, setSelected}: DriverCardProps) => {
    return (
        <TouchableOpacity
            onPress={async () => { try { await Haptics.selectionAsync(); } catch {}; setSelected(); }}
            activeOpacity={0.9}
            className={`${
                selected ? "bg-blue-600" : "bg-white"
            } flex flex-row items-center justify-between py-5 px-3 rounded-2xl`}
            style={{
                shadowColor: '#0F172A',
                shadowOpacity: 0.08,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                elevation: 5,
            }}
        >
            <Image
                source={item.profile_image ? {uri: item.profile_image} : icons.person}
                className="w-14 h-14 rounded-full"
            />

            <View className="flex-1 flex flex-col items-start justify-center mx-3">
                <View className="flex flex-row items-center justify-start mb-1">
                    <Text className="text-lg font-JakartaRegular">{item.name}</Text>

                    <View className="flex flex-row items-center space-x-1 ml-2">
                        <Image source={icons.star} className="w-3.5 h-3.5"/>
                        <Text className="text-sm font-JakartaRegular">{item.metrics.average_rating.toFixed(1)}</Text>
                    </View>
                </View>

                <View className="flex flex-row items-center justify-start">
                    <View className="flex flex-row items-center">
                        <Image source={icons.dollar} className="w-4 h-4"/>
                        <Text className="text-sm font-JakartaMedium ml-1">
                            AED {item.earnings.daily_earnings}
                        </Text>
                    </View>

                    <Text className="text-sm font-JakartaRegular text-gray-600 mx-1">
                        |
                    </Text>

                    <Text className="text-sm font-JakartaMedium text-gray-600">
                        {item.vehicle.type}
                    </Text>

                    <Text className="text-sm font-JakartaRegular text-gray-600 mx-1">
                        |
                    </Text>

                    <Text className="text-sm font-JakartaMedium text-gray-600">
                        {item.vehicle.capacity}L capacity
                    </Text>
                </View>
            </View>

            <View className="items-center">
                <Text className="text-xs text-gray-500 mb-1">Status</Text>
                <Text className={`text-xs px-2 py-1 rounded-full ${
                    item.status === 'online' ? 'bg-green-100 text-green-700' :
                    item.status === 'busy' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                }`}>
                    {item.status}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

export default DriverCard;