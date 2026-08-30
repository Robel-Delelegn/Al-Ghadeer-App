import DeliveryCard from "@/components/DeliveryCard";
import MyMap from "@/components/map";
import ProfileModal from "@/components/ProfileModal";
import { icons, images } from "@/constants";
import { useOrderStore } from "@/store/index";
import { Order } from "@/types/order";
import ApiErrorText from "@/components/ApiErrorText";
import { useAuthStore, authenticatedFetch } from "@/store/auth";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { DeliveryStop, mapDeliveryToOrder } from "@/utils/deliveries";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { getApiBaseUrl, resolveResourceUrl } from "@/utils/resources";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const IP_ADDRESS = getApiBaseUrl();

const getCurrentMinuteOfDay = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const parseClockTime = (value?: string | null): number | null => {
  if (!value) return null;
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
};

const isOrderAvailableAt = (order: Order, minuteOfDay: number) => {
  const startTime = parseClockTime(order.start_time);
  const endTime = parseClockTime(order.end_time);
  if (startTime === null || endTime === null) return false;

  if (startTime <= endTime) {
    return minuteOfDay >= startTime && minuteOfDay <= endTime;
  }

  return minuteOfDay >= startTime || minuteOfDay <= endTime;
};

const isDeliveredListOrder = (order: Order) =>
  order.status === "delivered" || order.has_new_items === false;

const comparePendingFirst = (first: Order, second: Order) => {
  const firstDone = isDeliveredListOrder(first) ? 1 : 0;
  const secondDone = isDeliveredListOrder(second) ? 1 : 0;
  return firstDone - secondDone;
};

const sortPendingFirst = (orders: Order[]) =>
  [...orders].sort(comparePendingFirst);

const Home = () => {
  const { user } = useAuthStore();
  const { setAssignedOrders, selectOrder, assignedOrders, currentDriver } =
    useOrderStore();
  const router = useRouter();

  // Use useMemo to ensure these values update when currentDriver changes
  // Depend on currentDriver object itself, not nested properties, for proper reactivity
  const driverName = React.useMemo(
    () => currentDriver?.name || user?.name || user?.phone || "Driver",
    [currentDriver, user?.name, user?.phone],
  );

  const helperName = React.useMemo(
    () => currentDriver?.helper_name || user?.helper_name || "",
    [currentDriver, user?.helper_name],
  );

  const avatarUrl = React.useMemo(
    () => resolveResourceUrl(currentDriver?.profile_image),
    [currentDriver?.profile_image],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isloading, setIsloading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [currentMinuteOfDay, setCurrentMinuteOfDay] = useState(
    getCurrentMinuteOfDay,
  );
  const driverId = React.useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  // Count currently available orders
  const availableOrdersCount = React.useMemo(() => {
    const pendingOrders = assignedOrders.filter(
      (order) => !isDeliveredListOrder(order),
    );
    const hasSchedulingWindow = pendingOrders.some((order) =>
      Boolean(order.start_time && order.end_time),
    );
    if (!hasSchedulingWindow) {
      return pendingOrders.length;
    }
    return pendingOrders.filter((order) =>
      isOrderAvailableAt(order, currentMinuteOfDay),
    ).length;
  }, [assignedOrders, currentMinuteOfDay]);

  // Filter deliveries based on search query
  const filteredDeliveries = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return sortPendingFirst(assignedOrders);
    }

    const query = searchQuery.toLowerCase().trim();
    const searchFields = [
      "customer_name",
      "customer_phone",
      "customer_address",
      "order_number",
      "display_id",
      "customer_site_id",
      "delivery_zone",
      "route_name",
      "customer_email",
    ];

    return sortPendingFirst(
      assignedOrders.filter((order) =>
        searchFields.some((field) => {
          const value = order[field as keyof Order];
          return (
            typeof value === "string" && value.toLowerCase().includes(query)
          );
        }),
      ),
    );
  }, [assignedOrders, searchQuery]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMinuteOfDay(getCurrentMinuteOfDay());
    }, 60_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleViewDetails = (id: string) => {
    selectOrder(id);
    router.push("/(root)/(tabs)/order-details");
  };

  const fetchDeliveries = useCallback(
    async ({
      preserveExistingOnEmpty = false,
    }: {
      preserveExistingOnEmpty?: boolean;
    } = {}) => {
      if (!driverId) {
        setAssignedOrders([]);
        setApiError("Driver ID is missing. Please sign in again.");
        setIsloading(false);
        setRefreshing(false);
        return;
      }

      try {
        setIsloading(true);
        setApiError(null);
        const url = `${IP_ADDRESS}/deliveries`;
        const response = await authenticatedFetch(url, {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        });
        const result =
          await parseApiResponseWithSoftError<DeliveryStop[]>(response);

        if (!result.ok) {
          setAssignedOrders([]);
          setApiError(result.error);
          return;
        }

        const currentAssignedOrders = useOrderStore.getState().assignedOrders;
        const locallyDeliveredOrders = new Map(
          currentAssignedOrders
            .filter((order) => isDeliveredListOrder(order))
            .map((order) => [order.id, order]),
        );
        const deliveries = Array.isArray(result.data) ? result.data : [];
        const transformedOrders: Order[] = sortPendingFirst(
          deliveries.map((delivery) => {
            const mappedOrder = mapDeliveryToOrder(delivery);
            const locallyDeliveredOrder = locallyDeliveredOrders.get(
              mappedOrder.id,
            );
            if (!locallyDeliveredOrder) return mappedOrder;

            return {
              ...mappedOrder,
              status: "delivered",
              has_new_items: false,
              completed_at:
                locallyDeliveredOrder.completed_at ?? mappedOrder.completed_at,
              delivery: {
                ...mappedOrder.delivery,
                ...locallyDeliveredOrder.delivery,
              },
            };
          }),
        );
        if (
          preserveExistingOnEmpty &&
          transformedOrders.length === 0 &&
          currentAssignedOrders.length > 0
        ) {
          return;
        }

        setAssignedOrders(transformedOrders);
      } catch (err) {
        console.error("Error fetching deliveries:", err);
        setAssignedOrders([]);
        setApiError(
          err instanceof Error ? err.message : "Failed to load deliveries.",
        );
      } finally {
        setIsloading(false);
        setRefreshing(false);
      }
    },
    [driverId, setAssignedOrders],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchDeliveries();
  }, [fetchDeliveries]);

  useFocusEffect(
    useCallback(() => {
      setSearchQuery("");
      void fetchDeliveries({ preserveExistingOnEmpty: true });
    }, [fetchDeliveries]),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-slate-50">
        <View className="flex-[0.6] overflow-hidden bg-slate-200">
          <MyMap orders={filteredDeliveries} />

          <SafeAreaView
            edges={["top"]}
            className="absolute inset-x-0 top-0 z-10"
          >
            <View className="px-4 pb-4 pt-2">
              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={() => setIsProfileModalVisible(true)}
                  activeOpacity={0.85}
                  accessibilityLabel={`Open profile for ${driverName}`}
                  className="h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white"
                  style={{
                    shadowColor: "#0F172A",
                    shadowOpacity: 0.12,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 5,
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-full w-full items-center justify-center bg-slate-100">
                      <Ionicons name="person" size={22} color="#475569" />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push("/(root)/(tabs)/direct-sales")}
                  accessibilityLabel="Direct sale"
                  activeOpacity={0.85}
                  className="h-12 min-w-[84px] flex-row items-center justify-center rounded-full px-4"
                  style={{
                    backgroundColor: "#0284C7",
                    shadowColor: "#0284C7",
                    shadowOpacity: 0.22,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 6,
                  }}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                  <Text className="ml-1.5 text-[13px] font-JakartaBold text-white">
                    Sale
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Today's Deliveries Section */}
        <View
          className="-mt-16 flex-1 rounded-t-[32px] bg-slate-50"
          style={{
            shadowColor: "#0F172A",
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -4 },
            elevation: 12,
          }}
        >
          <View className="px-4 pb-2 pt-4">
            <View
              className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3"
              style={{
                shadowColor: "#0F172A",
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <Image
                source={icons.search}
                className="mr-3 h-5 w-5"
                resizeMode="contain"
              />
              <TextInput
                className="flex-1 text-[14px] font-JakartaSemiBold text-slate-800"
                placeholder="Search deliveries"
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  className="ml-2 h-8 w-8 items-center justify-center rounded-full"
                  activeOpacity={0.8}
                >
                  <Image
                    source={icons.close}
                    className="h-4 w-4 opacity-70"
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ApiErrorText error={apiError} className="px-6" />

          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-JakartaSemiBold text-slate-900">
                Today&apos;s Deliveries
              </Text>
              <Text
                className="mt-0.5 text-[12px] font-JakartaMedium text-slate-500"
                numberOfLines={1}
              >
                {helperName ? `${driverName} with ${helperName}` : driverName}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {!searchQuery && availableOrdersCount > 0 && (
                <View className="flex-row items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                  <Ionicons name="navigate" size={12} color="#047857" />
                  <Text className="text-[11px] font-JakartaSemiBold text-emerald-700">
                    {availableOrdersCount}
                  </Text>
                </View>
              )}
              <View className="rounded-full bg-[#0284C7] px-2.5 py-1.5">
                <Text className="text-[11px] font-JakartaSemiBold text-white">
                  {searchQuery
                    ? `${filteredDeliveries.length} found`
                    : `${assignedOrders.length} total`}
                </Text>
              </View>
            </View>
          </View>

          {isloading ? (
            <View className="mt-16 items-center">
              <ActivityIndicator className="mt-10 items-center justify-center" />
            </View>
          ) : (
            <FlatList
              data={filteredDeliveries}
              keyExtractor={(item: Order) => item.id}
              renderItem={({ item }: { item: Order }) => (
                <DeliveryCard
                  item={item}
                  onPress={() => {
                    handleViewDetails(item.id);
                  }}
                />
              )}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 6,
                paddingBottom: 100,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#1E40AF"
                  colors={["#1E40AF"]}
                />
              }
              ListEmptyComponent={
                <View className="mt-24 flex-1 items-center justify-center">
                  <Image
                    source={images.noResult}
                    className="mb-6 h-40 w-40"
                    resizeMode="contain"
                  />
                  <Text className="text-lg font-semibold text-gray-400">
                    {searchQuery
                      ? "No deliveries found"
                      : "No deliveries for today"}
                  </Text>
                  {searchQuery && (
                    <Text className="mt-2 text-sm text-gray-300">
                      Try adjusting your search
                    </Text>
                  )}
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
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
