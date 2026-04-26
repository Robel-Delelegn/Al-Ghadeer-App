import { Ionicons } from "@expo/vector-icons";
import { Order } from "@/types/order";
import { getTotalItemsCount, normalizeOrderProducts } from "@/utils/orderUtils";
import * as Haptics from "expo-haptics";
import { Text, TouchableOpacity, View } from "react-native";

const DeliveryCard = ({
  item,
  onPress,
}: {
  item: Order;
  onPress?: () => void;
}) => {
  const customerName = item.customer_name || "N/A";
  const routeName = item.route_name || item.delivery_zone || "Route pending";
  const normalizedProducts = item.products
    ? normalizeOrderProducts(item.products).productsArray
    : [];
  const rentItems = Array.isArray(item.rent_items) ? item.rent_items : [];
  const customerAddress =
    item.customer_address || item.order_number || "No address";
  const productCount = getTotalItemsCount(item);
  const rentItemsCount = rentItems.reduce(
    (sum, rentItem) => sum + (rentItem.quantity || 0),
    0,
  );
  const totalItems = productCount + rentItemsCount;
  const totalAmountRaw = item.total_amount ?? 0;
  const totalAmount =
    typeof totalAmountRaw === "string"
      ? parseFloat(totalAmountRaw) || 0
      : typeof totalAmountRaw === "number"
        ? totalAmountRaw
        : 0;
  const computedProductsTotal = normalizedProducts.reduce(
    (sum, product) =>
      sum + (Number(product.price) || 0) * (Number(product.quantity) || 0),
    0,
  );
  const computedRentItemsTotal = rentItems.reduce(
    (sum, rentItem) =>
      sum + (Number(rentItem.price) || 0) * (Number(rentItem.quantity) || 0),
    0,
  );
  const displayTotal =
    totalAmount > 0
      ? totalAmount
      : computedProductsTotal + computedRentItemsTotal;
  const totalLabel =
    displayTotal > 0 ? `AED ${displayTotal.toFixed(2)}` : "AED 0.00";
  const itemsLabel =
    totalItems > 0
      ? `${totalItems} item${totalItems === 1 ? "" : "s"}`
      : "No items";
  const statusConfig: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    pending: { bg: "#FEF3C7", text: "#B45309", label: "Pending" },
    assigned: { bg: "#DBEAFE", text: "#1D4ED8", label: "Assigned" },
    in_progress: { bg: "#E0E7FF", text: "#4338CA", label: "Active" },
    delivered: { bg: "#DCFCE7", text: "#15803D", label: "Done" },
    failed: { bg: "#FEE2E2", text: "#B91C1C", label: "Failed" },
  };
  const status = statusConfig[item.status] || statusConfig.pending;

  return (
    <TouchableOpacity
      onPress={async () => {
        try {
          await Haptics.selectionAsync();
        } catch {}

        onPress?.();
      }}
      activeOpacity={0.9}
      className="mb-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5"
      style={{
        shadowColor: "#1E40AF",
        shadowOpacity: 0.06,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-[#EFF6FF] px-2.5 py-1">
              <Text
                className="text-[10px] font-JakartaSemiBold text-[#1E40AF]"
                numberOfLines={1}
              >
                {routeName}
              </Text>
            </View>
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: status.bg }}
            >
              <Text
                className="text-[10px] font-JakartaSemiBold"
                style={{ color: status.text }}
              >
                {status.label}
              </Text>
            </View>
          </View>

          <Text
            className="mt-3 text-[16px] leading-5 font-JakartaSemiBold text-slate-900"
            numberOfLines={1}
          >
            {customerName}
          </Text>
          <Text
            className="mt-1 text-[13px] leading-5 font-JakartaMedium text-slate-500"
            numberOfLines={1}
          >
            {customerAddress}
          </Text>

          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center rounded-full bg-slate-100 px-3 py-2">
              <Ionicons name="cube-outline" size={14} color="#475569" />
              <Text className="ml-1.5 text-[11px] font-JakartaSemiBold text-slate-700">
                {itemsLabel}
              </Text>
            </View>
            <View className="flex-row items-center rounded-full bg-sky-50 px-3 py-2">
              <Ionicons name="cash-outline" size={14} color="#0369A1" />
              <Text className="ml-1.5 text-[11px] font-JakartaSemiBold text-sky-700">
                {totalLabel}
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-1 h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
          <Ionicons name="chevron-forward" size={18} color="#1E293B" />
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default DeliveryCard;
