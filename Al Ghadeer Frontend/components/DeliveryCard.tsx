import { icons } from "@/constants";
import { Order } from "@/types/order";
import { getTotalItemsCount, normalizeOrderProducts } from "@/utils/orderUtils";
import * as Haptics from "expo-haptics";
import { Image, Text, TouchableOpacity, View } from "react-native";

const getStatusChipStyle = (status: string) => {
  switch (status) {
    case "delivered":
      return "bg-green-100 text-green-700 border-green-300";
    case "pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    case "assigned":
      return "bg-blue-100 text-blue-700 border-blue-300";
    case "in_progress":
      return "bg-orange-100 text-orange-700 border-orange-300";
    case "failed":
      return "bg-red-100 text-red-700 border-red-300";
    case "cancelled":
      return "bg-gray-100 text-gray-700 border-gray-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
};

const getCustomerTypeStyle = (customerType?: string) => {
  if (customerType === "organization") {
    return {
      badge: "bg-purple-100 border-purple-300",
      text: "text-purple-700",
      label: "Organization",
      borderColor: "#A855F7",
      bgColor: "#FAF5FF",
    };
  }
  return {
    badge: "bg-emerald-100 border-emerald-300",
    text: "text-emerald-700",
    label: "Individual",
    borderColor: "#10B981",
    bgColor: "#ECFDF5",
  };
};

const DeliveryCard = ({
  item,
  onPress,
}: {
  item: Order;
  onPress?: () => void;
}) => {
  // Handle both nested and flat structures for backward compatibility
  const customerName = item.customer_name || "N/A";
  const customerAddress = item.customer_address || "N/A";
  const routeName = item.route_name || item.delivery_zone || "Unassigned route";
  const earlierVisits = Math.max(0, item.earlier_visits_today_count || 0);
  const hasNewItems = item.has_new_items === true;
  const taskCount = Array.isArray(item.tasks) ? item.tasks.length : 0;
  const requiresSignature = item.requires_signature === true;
  const requiresImmediateInvoice = item.requires_immediate_invoice === true;
  const normalizedProducts = item.products
    ? normalizeOrderProducts(item.products).productsArray
    : [];
  const totalItems = getTotalItemsCount(item);
  const plannedItemsPreview = normalizedProducts
    .slice(0, 2)
    .map((product) => `${product.name} x${product.quantity}`)
    .join(" • ");
  const remainingPreviewCount = Math.max(0, normalizedProducts.length - 2);
  // Ensure totalAmount is always a number (handle string values from API like "0.00")
  const totalAmountRaw = item.total_amount || 0;
  const totalAmount =
    typeof totalAmountRaw === "string"
      ? parseFloat(totalAmountRaw) || 0
      : typeof totalAmountRaw === "number"
        ? totalAmountRaw
        : 0;
  const scheduledTime = item.start_time || "Time N/A";
  const customerType = item.customer_type || "individual";
  const customerTypeStyle = getCustomerTypeStyle(customerType);
  // Ensure walletBalance is always a number (handle string values from API)
  const walletBalanceRaw = item.wallet_balance ?? 0;
  const walletBalance =
    typeof walletBalanceRaw === "string"
      ? parseFloat(walletBalanceRaw) || 0
      : typeof walletBalanceRaw === "number"
        ? walletBalanceRaw
        : 0;

  // Format availability times (expects "18:30" format)
  const formatAvailabilityTime = (timeString?: string) => {
    if (!timeString) return "N/A";
    try {
      // Handle "18:30" format
      if (timeString.includes(":")) {
        const [hours, minutes] = timeString.split(":");
        const hour = parseInt(hours, 10);
        const minute = parseInt(minutes, 10);

        // Convert to 12-hour format
        const period = hour >= 12 ? "PM" : "AM";
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

        return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
      }

      // Fallback for other formats
      const date = new Date(timeString);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "N/A";
    }
  };

  const availabilityTime =
    item.start_time && item.end_time
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

      const [startHour, startMin] = item.start_time.split(":").map(Number);
      const [endHour, endMin] = item.end_time.split(":").map(Number);

      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      return currentTime >= startTime && currentTime <= endTime;
    } catch {
      return false;
    }
  };

  const currentlyAvailable = isCurrentlyAvailable();

  // Calculate total price dynamically from planned products
  const calculateTotals = (): { totalPrice: number } => {
    let totalPrice = 0;

    normalizedProducts.forEach((product) => {
      totalPrice += (product.price || 0) * (product.quantity || 0);
    });

    return { totalPrice };
  };

  const { totalPrice: calculatedPrice } = calculateTotals();

  // Use calculated price if available, otherwise fall back to item.total_amount
  const displayPrice = calculatedPrice > 0 ? calculatedPrice : totalAmount;

  return (
    <TouchableOpacity
      onPress={async () => {
        try {
          await Haptics.selectionAsync();
        } catch {}
        onPress?.();
      }}
      activeOpacity={0.9}
      className="mb-4 rounded-2xl bg-white px-5 py-4 flex flex-col gap-2"
      style={{
        shadowColor: "#1E40AF",
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
        borderLeftWidth: 4,
        borderLeftColor: customerTypeStyle.borderColor,
        borderWidth: 1,
        borderColor: "#F3F4F6",
      }}
    >
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center flex-1 gap-2">
          <Text
            className="text-base font-JakartaSemiBold text-gray-900 flex-shrink"
            numberOfLines={1}
          >
            {customerName}
          </Text>
          <View
            className={`px-2 py-0.5 rounded-md border ${customerTypeStyle.badge}`}
          >
            <Text
              className={`text-[10px] font-JakartaSemiBold ${customerTypeStyle.text}`}
            >
              {customerTypeStyle.label}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {currentlyAvailable && (
            <View
              className="w-3 h-3 bg-green-500 rounded-full shadow-sm"
              style={{
                shadowColor: "#10B981",
                shadowOpacity: 0.6,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }}
            ></View>
          )}
          <Text
            className={`px-3 py-1 rounded-full text-xs font-JakartaSemiBold border ${getStatusChipStyle(item.status)}`}
          >
            {item.status.charAt(0).toUpperCase() +
              item.status.slice(1).replace("_", " ")}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-end mb-1">
        <Text
          className="text-[11px] text-sky-700 font-JakartaSemiBold"
          numberOfLines={1}
        >
          {routeName}
        </Text>
      </View>

      {/* Address Row */}
      <View className="flex-row items-center gap-2 mb-1">
        <Image source={icons.pin} className="w-4 h-4 mr-1" />
        <Text
          className="text-gray-700 text-sm justify-start flex-1"
          numberOfLines={1}
        >
          {customerAddress}
        </Text>
      </View>

      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
        <View className="px-2 py-1 rounded-full border border-slate-200 bg-slate-50">
          <Text className="text-[10px] text-slate-600 font-JakartaSemiBold">
            {taskCount} task{taskCount === 1 ? "" : "s"}
          </Text>
        </View>
        {earlierVisits > 0 ? (
          <View className="px-2 py-1 rounded-full border border-orange-200 bg-orange-50">
            <Text className="text-[10px] text-orange-700 font-JakartaSemiBold">
              {earlierVisits} earlier visit{earlierVisits === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
        {hasNewItems ? (
          <View className="px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50">
            <Text className="text-[10px] text-emerald-700 font-JakartaSemiBold">
              New items
            </Text>
          </View>
        ) : null}
        {requiresSignature ? (
          <View className="px-2 py-1 rounded-full border border-violet-200 bg-violet-50">
            <Text className="text-[10px] text-violet-700 font-JakartaSemiBold">
              Signature required
            </Text>
          </View>
        ) : null}
        {requiresImmediateInvoice ? (
          <View className="px-2 py-1 rounded-full border border-indigo-200 bg-indigo-50">
            <Text className="text-[10px] text-indigo-700 font-JakartaSemiBold">
              Immediate invoice
            </Text>
          </View>
        ) : null}
      </View>

      {/* Time & Items Row */}
      <View className="flex-row items-center gap-2">
        <Image source={icons.list} className="w-4 h-4 mr-1" />
        <Text className="text-gray-500 text-xs">{availabilityTime}</Text>
        <Text
          className="text-gray-700 text-sm justify-start font-JakartaSemiBold"
          numberOfLines={1}
        >
          {totalItems} item{totalItems === 1 ? "" : "s"}
        </Text>
      </View>

      {plannedItemsPreview ? (
        <Text className="text-slate-600 text-xs mt-1" numberOfLines={2}>
          {plannedItemsPreview}
          {remainingPreviewCount > 0 ? ` +${remainingPreviewCount} more` : ""}
        </Text>
      ) : null}

      {/* Footer Row */}
      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-gray-800 text-sm font-JakartaSemiBold">
          {displayPrice > 0 ? `AED ${displayPrice.toFixed(2)}` : "Planned stop"}
        </Text>
        {customerType === "organization" ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-gray-500 text-xs">Wallet:</Text>
            <Text
              className={`text-xs font-JakartaSemiBold ${walletBalance >= 0 ? "text-emerald-600" : "text-orange-600"}`}
            >
              AED {walletBalance.toFixed(2)}
            </Text>
          </View>
        ) : walletBalance > 0 ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-gray-500 text-xs">Wallet:</Text>
            <Text className="text-emerald-600 text-xs font-JakartaSemiBold">
              AED {walletBalance.toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export default DeliveryCard;
