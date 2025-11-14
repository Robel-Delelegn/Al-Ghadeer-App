import MyMap from "@/components/map";
import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useUser } from '@clerk/clerk-expo';
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useRef } from "react";
import { Image, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const HomeLayout = ({children, snapPoints, driverName}:{children: React.ReactNode, snapPoints?:string[], driverName:string}) => {
    const { user } = useUser();
    const { assignedOrders } = useOrderStore(); // Removed unused variables
    const avatar = user?.imageUrl || icons.person;
    const today = new Date();
    const bottomSheet = useRef<BottomSheet>(null);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View className="flex-1 bg-white">
                {/* The Map takes up the full screen in the background */}
                <MyMap orders={assignedOrders} />

                {/* ✨ START: Revamped Aesthetic Header */}
                <SafeAreaView className="absolute top-0 w-full">
                    <View className="m-4 rounded-2xl p-5" style={{ backgroundColor: 'rgba(255,255,255,0.85)', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
                        <View className="flex-row items-center justify-between">
                            {/* Greeting and Name */}
                            <View className="flex-row items-center">
                                <Image
                                    source={typeof avatar === 'string' ? { uri: avatar } : avatar}
                                    className="w-14 h-14 rounded-full border-2 border-white/50 mr-4"
                                />
                                <View>
                                    <Text className="text-gray-700 text-xs">Good morning,</Text>
                                    <Text className="text-gray-900 text-2xl font-JakartaSemiBold">{driverName}</Text>
                                </View>
                            </View>

                            {/* Date */}
                            <View className="bg-white rounded-full px-4 py-2" style={{ shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
                                <Text className="text-gray-700 text-xs font-JakartaSemiBold">{formatDate(today)}</Text>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
                {/* ✨ END: Revamped Aesthetic Header */}

                {/* Bottom Sheet remains the same */}
                <BottomSheet ref={bottomSheet} snapPoints={snapPoints || ["20%","45%", "85%"]} index={1}>
                    <BottomSheetView style={{flex: 1, padding:20}}>
                        {children}
                    </BottomSheetView>
                </BottomSheet>
            </View>
        </GestureHandlerRootView>
    )
}

export default HomeLayout;