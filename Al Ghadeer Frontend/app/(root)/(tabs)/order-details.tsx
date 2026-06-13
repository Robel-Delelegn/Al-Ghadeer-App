import ApiErrorText from "@/components/ApiErrorText";
import { useLocationStore, useOrderStore } from "@/store/index";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { parseDeliveryTasks } from "@/utils/deliveries";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { getTotalItemsCount, normalizeOrderProducts } from "@/utils/orderUtils";
import { getApiBaseUrl, resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import {
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/store/utils/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IP_ADDRESS = getApiBaseUrl();
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

const formatTaskBucketLabel = (bucket: string) =>
  bucket.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatTaskTypeLabel = (type: string) => {
  const normalized = type.trim().toLowerCase();
  if (!normalized) return "Task";

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatTaskLineKindLabel = (kind: string) => {
  const normalized = kind.trim().toLowerCase();
  if (!normalized) return "Planned";

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getTaskReferenceLabel = (
  task: ReturnType<typeof parseDeliveryTasks>[number],
) => {
  if (!task.referenceId) return null;
  if (task.type === "subscription") {
    return `Item ${task.referenceId}`;
  }
  if (task.type === "staff_order") {
    return `Staff Order ${task.referenceId}`;
  }
  return `Order ${task.referenceId}`;
};

interface CustomerSite {
  id: string;
  siteName: string | null;
  latitude: number | null;
  longitude: number | null;
  streetName: string | null;
  city: string | null;
  areaName: string | null;
  buildingNo: string | null;
  flatNo: string | null;
  deliveryInstructions: string | null;
  routeId: string | null;
}

interface HeldBottle {
  itemId: string;
  label: string;
  description: string | null;
  image_url: string | null;
  quantity: number;
  unit: string | null;
}

interface HeldAsset {
  itemId: string;
  label: string;
  description: string | null;
  image_url: string | null;
  serial: string;
  assetCategory: string | null;
}

interface CustomerHeldItems {
  bottles: HeldBottle[];
  assets: HeldAsset[];
}

const formatSiteAddress = (
  site: Partial<CustomerSite> | null | undefined,
  fallback?: string,
) => {
  if (!site) {
    return fallback || "—";
  }

  const parts = [
    site.streetName,
    site.buildingNo,
    site.flatNo,
    site.areaName,
    site.city,
  ]
    .map((part) => (part || "").trim())
    .filter((part) => part.length > 0);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  const siteName = (site.siteName || "").trim();
  if (siteName) {
    return siteName;
  }

  return fallback || "—";
};

const getHeldItemIconName = (
  kind: "bottle" | "asset",
  category?: string | null,
) => {
  if (kind === "bottle") return "water-outline" as const;

  const normalizedCategory = (category || "").trim().toLowerCase();
  if (
    normalizedCategory.includes("cooler") ||
    normalizedCategory.includes("dispenser")
  ) {
    return "snow-outline" as const;
  }

  return "cube-outline" as const;
};

const OrderDetails = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    assignedOrders,
    selectedOrder,
    currentDriver,
    setAssignedOrders,
    clearCart,
    setLastConfirmPaymentResponse,
    setPaymentMethod,
  } = useOrderStore();
  const { user } = useAuthStore();
  const { userLatitude, userLongitude } = useLocationStore();
  const [isLoading, setIsLoading] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<{
    distance: string;
    duration: string;
  } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [heldItems, setHeldItems] = useState<CustomerHeldItems | null>(null);
  const [isLoadingHeldItems, setIsLoadingHeldItems] = useState(false);
  const [heldItemsError, setHeldItemsError] = useState<string | null>(null);

  const order = assignedOrders.find((o) => o.id === selectedOrder);
  const driverId = getDriverRequestId({ user, currentDriver });

  const calculateDistanceAndTime = useCallback(async () => {
    if (!order || !userLatitude || !userLongitude) return;

    const customerLatitude = order.latitude;
    const customerLongitude = order.longitude;

    if (!customerLatitude || !customerLongitude) return;

    const isValidCoordinate = (lat: number, lng: number) => {
      return lat >= 22 && lat <= 26 && lng >= 50 && lng <= 57;
    };

    if (
      !isValidCoordinate(customerLatitude, customerLongitude) ||
      !isValidCoordinate(userLatitude, userLongitude)
    ) {
      return;
    }

    try {
      setIsCalculatingDistance(true);

      const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
      if (!GOOGLE_API_KEY) return;

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${customerLatitude},${customerLongitude}&key=${GOOGLE_API_KEY}&units=metric`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes?.[0]) {
        const leg = data.routes[0].legs[0];
        const distance = leg.distance.text;
        const durationMinutes = Math.round(leg.duration.value / 60);

        let duration: string;
        if (durationMinutes >= 60) {
          const hours = Math.floor(durationMinutes / 60);
          const minutes = durationMinutes % 60;
          duration = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
          duration = `${durationMinutes}m`;
        }

        setDistanceInfo({ distance, duration });
      }
    } catch (error) {
      console.error("Error calculating distance:", error);
    } finally {
      setIsCalculatingDistance(false);
    }
  }, [order, userLatitude, userLongitude]);

  useEffect(() => {
    calculateDistanceAndTime();
  }, [calculateDistanceAndTime]);

  const fetchHeldItems = useCallback(async () => {
    if (!order?.customer_id) {
      setHeldItems(null);
      setHeldItemsError(null);
      return;
    }

    setIsLoadingHeldItems(true);
    setHeldItemsError(null);

    try {
      const response = await authenticatedFetch(
        `${IP_ADDRESS}/customers/${encodeURIComponent(order.customer_id)}/held-items`,
        {
          method: "GET",
        },
      );

      const result =
        await parseApiResponseWithSoftError<CustomerHeldItems>(response);
      if (!result.ok) {
        setHeldItems(null);
        setHeldItemsError(result.error);
        return;
      }

      setHeldItems({
        bottles: Array.isArray(result.data?.bottles) ? result.data.bottles : [],
        assets: Array.isArray(result.data?.assets) ? result.data.assets : [],
      });
    } catch (error) {
      console.error("Error fetching customer held items:", error);
      setHeldItems(null);
      setHeldItemsError(
        error instanceof Error ? error.message : "Failed to load held items.",
      );
    } finally {
      setIsLoadingHeldItems(false);
    }
  }, [order?.customer_id]);

  useEffect(() => {
    fetchHeldItems();
  }, [fetchHeldItems]);

  const handleViewInMap = useCallback(async () => {
    if (!order) return;

    try {
      setIsLoading(true);
      const latitude = order.latitude;
      const longitude = order.longitude;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        showErrorAlert("Error", "Customer location not available.");
        return;
      }
      if (!Number.isFinite(userLatitude) || !Number.isFinite(userLongitude)) {
        showErrorAlert("Error", "Current location not available.");
        return;
      }

      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLatitude},${userLongitude}&destination=${latitude},${longitude}&travelmode=driving`;
      await Linking.openURL(googleMapsUrl);
    } catch {
      showErrorAlert("Error", "Failed to open map.");
    } finally {
      setIsLoading(false);
    }
  }, [order, userLatitude, userLongitude]);

  const handleProceed = () => {
    if (!order) return;
    const normalizedPaymentMethod = (order.payment_method || "")
      .trim()
      .toLowerCase();

    clearCart();
    setLastConfirmPaymentResponse(null);
    setPaymentMethod(
      normalizedPaymentMethod === "wallet"
        ? "wallet"
        : normalizedPaymentMethod === "credit" ||
            normalizedPaymentMethod === "invoice" ||
            normalizedPaymentMethod === "credit_invoice"
          ? "credit"
          : "cash",
    );
    router.push({
      pathname: "/(root)/(tabs)/add-products",
      params: { backTo: "order-details" },
    });
  };

  const handleMarkAsUnsuccessful = () => {
    if (!order) return;
    router.push({
      pathname: "/(root)/(tabs)/failed-deliveries",
      params: { backTo: "order-details" },
    });
  };

  const parseAddressComponents = (geocodeResult: any) => {
    const addressComponents = geocodeResult.address_components || [];
    let siteName = "";
    let streetName = "";
    let buildingNo = "";
    let flatNo = "";
    let city = "";
    let areaName = "";
    let fullAddress = geocodeResult.formatted_address || "";

    const premise = addressComponents.find(
      (comp: any) =>
        comp.types &&
        (comp.types.includes("premise") ||
          comp.types.includes("establishment") ||
          comp.types.includes("point_of_interest")),
    );
    if (premise) {
      siteName = premise.long_name || premise.short_name || "";
    }

    // Find route (street name)
    const route = addressComponents.find(
      (comp: any) => comp.types && comp.types.includes("route"),
    );
    if (route) {
      streetName = route.long_name || route.short_name || "";
    }

    // Find street number (building number)
    const streetNumber = addressComponents.find(
      (comp: any) => comp.types && comp.types.includes("street_number"),
    );
    if (streetNumber) {
      buildingNo = streetNumber.long_name || streetNumber.short_name || "";
    }

    // Find subpremise (flat/apartment number)
    const subpremise = addressComponents.find(
      (comp: any) => comp.types && comp.types.includes("subpremise"),
    );
    if (subpremise) {
      flatNo = subpremise.long_name || subpremise.short_name || "";
    }

    const locality = addressComponents.find(
      (comp: any) =>
        comp.types &&
        (comp.types.includes("locality") ||
          comp.types.includes("postal_town") ||
          comp.types.includes("administrative_area_level_2")),
    );
    if (locality) {
      city = locality.long_name || locality.short_name || "";
    }

    const sublocality = addressComponents.find(
      (comp: any) =>
        comp.types &&
        (comp.types.includes("sublocality") ||
          comp.types.includes("sublocality_level_1") ||
          comp.types.includes("neighborhood")),
    );
    if (sublocality) {
      areaName = sublocality.long_name || sublocality.short_name || "";
    }

    return {
      siteName,
      streetName,
      buildingNo,
      flatNo,
      city,
      areaName,
      fullAddress,
    };
  };

  const handleUpdateCustomerLocation = useCallback(async () => {
    if (!order) {
      showErrorAlert("Error", "Order information not found.");
      return;
    }

    if (!order.customer_id) {
      showErrorAlert("Error", "Customer information is incomplete.");
      return;
    }

    setIsUpdatingLocation(true);
    setApiError(null);
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showWarningAlert(
          "Permission Denied",
          "Location permission is required to update customer location.",
        );
        return;
      }

      // Get current location
      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const latitude = locationData.coords.latitude;
      const longitude = locationData.coords.longitude;

      // Reverse geocode using Google Maps Geocoding API
      if (!GOOGLE_API_KEY) {
        showErrorAlert("Error", "Google Maps API key not configured.");
        return;
      }

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (
        geocodeData.status !== "OK" ||
        !geocodeData.results ||
        geocodeData.results.length === 0
      ) {
        showErrorAlert("Error", "Failed to get address information.");
        return;
      }

      const result = geocodeData.results[0];
      const {
        siteName,
        streetName,
        buildingNo,
        flatNo,
        city,
        areaName,
        fullAddress,
      } = parseAddressComponents(result);

      const isUpdatingExistingSite =
        typeof order.customer_site_id === "string" &&
        order.customer_site_id.trim().length > 0;

      const payload: Record<string, string | number> = {};
      if (siteName.trim()) payload.siteName = siteName.trim();
      if (streetName.trim()) payload.streetName = streetName.trim();
      if (city.trim()) payload.city = city.trim();
      if (areaName.trim()) payload.areaName = areaName.trim();
      if (buildingNo.trim()) payload.buildingNo = buildingNo.trim();
      if (flatNo.trim()) payload.flatNo = flatNo.trim();
      payload.longitude = longitude;
      payload.latitude = latitude;
      if (
        !isUpdatingExistingSite &&
        (order.delivery_instructions || "").trim()
      ) {
        payload.deliveryInstructions = (
          order.delivery_instructions || ""
        ).trim();
      }

      const basePath = `${IP_ADDRESS}/customers/${encodeURIComponent(order.customer_id)}/sites`;
      const url = isUpdatingExistingSite
        ? `${basePath}/${encodeURIComponent(order.customer_site_id!)}`
        : basePath;
      const response = await authenticatedFetch(url, {
        method: isUpdatingExistingSite ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(driverId ? { "X-Driver-Id": driverId } : {}),
        },
        body: JSON.stringify(payload),
      });

      const apiResult =
        await parseApiResponseWithSoftError<CustomerSite>(response);
      if (!apiResult.ok) {
        setApiError(apiResult.error);
        return;
      }

      const savedSite = apiResult.data;
      const updatedAddress = formatSiteAddress(savedSite, fullAddress);
      const updatedAssignedOrders = assignedOrders.map((assignedOrder) =>
        assignedOrder.id === order.id
          ? {
              ...assignedOrder,
              customer_site_id: savedSite.id,
              customer_address: updatedAddress,
              latitude: savedSite.latitude ?? latitude,
              longitude: savedSite.longitude ?? longitude,
              delivery_instructions:
                savedSite.deliveryInstructions ??
                assignedOrder.delivery_instructions,
            }
          : assignedOrder,
      );
      setAssignedOrders(updatedAssignedOrders);

      showSuccessAlert(
        "Location Updated",
        isUpdatingExistingSite
          ? "Customer site location has been updated successfully."
          : "A new customer site has been created with the current location.",
        [{ text: "OK" }],
      );
    } catch (error) {
      console.error("Error updating customer location:", error);
      setApiError(
        error instanceof Error
          ? error.message
          : "Failed to update customer location.",
      );
    } finally {
      setIsUpdatingLocation(false);
    }
  }, [assignedOrders, driverId, order, setAssignedOrders]);

  if (!order) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.emptyIconBox}>
          <Ionicons name="document-outline" size={40} color="#D1D5DB" />
        </View>
        <Text style={styles.emptyTitle}>Order not found</Text>
        <Text style={styles.emptySubtitle}>
          This stop is no longer available
        </Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.back()}
        >
          <Text style={styles.emptyButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const customerName = order.customer_name || "Unknown";
  const customerPhone = order.customer_phone || "—";
  const customerAddress = order.customer_address || "—";
  const totalAmount = order.total_amount || 0;
  const deliveryInstructions = order.delivery_instructions;
  const routeName =
    order.route_name || order.delivery_zone || "Unassigned route";
  const earlierVisitsCount = Math.max(0, order.earlier_visits_today_count || 0);
  const hasNewItems = order.has_new_items === true;
  const parsedTasks = parseDeliveryTasks(
    Array.isArray(order.tasks) ? order.tasks : [],
  );

  const statusConfig: Record<
    string,
    { color: string; bgColor: string; label: string }
  > = {
    pending: { color: "#D97706", bgColor: "#FFFBEB", label: "Pending" },
    assigned: { color: "#2563EB", bgColor: "#EFF6FF", label: "Assigned" },
    in_progress: { color: "#7C3AED", bgColor: "#F5F3FF", label: "In Progress" },
    delivered: { color: "#059669", bgColor: "#ECFDF5", label: "Delivered" },
    failed: { color: "#DC2626", bgColor: "#FEF2F2", label: "Failed" },
  };

  const currentStatus = statusConfig[order.status] || statusConfig.pending;

  const productCount = order ? getTotalItemsCount(order) : 0;
  const heldBottles = heldItems?.bottles || [];
  const heldAssets = heldItems?.assets || [];
  const totalHeldBottleQuantity = heldBottles.reduce(
    (sum, bottle) => sum + Math.max(0, bottle.quantity || 0),
    0,
  );
  const hasHeldItems = heldBottles.length > 0 || heldAssets.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{customerName}</Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: currentStatus.bgColor },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: currentStatus.color },
              ]}
            />
            <Text
              style={[styles.statusPillText, { color: currentStatus.color }]}
            >
              {currentStatus.label}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ApiErrorText error={apiError} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerLabel}>Stop</Text>
            </View>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={18} color="#059669" />
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="call-outline" size={14} color="#6B7280" />
            </View>
            <Text style={styles.infoText}>{customerPhone}</Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Ionicons name="location-outline" size={14} color="#6B7280" />
            </View>
            <Text style={styles.infoText}>{customerAddress}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>HELD</Text>

          {isLoadingHeldItems ? (
            <View style={styles.heldItemsState}>
              <ActivityIndicator size="small" color="#1E40AF" />
              <Text style={styles.heldItemsStateText}>Loading...</Text>
            </View>
          ) : heldItemsError ? (
            <View style={styles.heldItemsErrorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.heldItemsErrorText}>{heldItemsError}</Text>
            </View>
          ) : !hasHeldItems ? (
            <View style={styles.heldItemsEmptyBox}>
              <View style={styles.heldItemsEmptyIcon}>
                <Ionicons name="cube-outline" size={18} color="#94A3B8" />
              </View>
              <View style={styles.heldItemsEmptyContent}>
                <Text style={styles.heldItemsEmptyTitle}>None</Text>
                <Text style={styles.heldItemsEmptyText}>
                  No bottles or assets.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.heldItemsSummaryRow}>
                <View style={styles.heldItemsSummaryBadge}>
                  <Ionicons name="water-outline" size={12} color="#0369A1" />
                  <Text style={styles.heldItemsSummaryText}>
                    {totalHeldBottleQuantity} bottle
                    {totalHeldBottleQuantity === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={styles.heldItemsSummaryBadge}>
                  <Ionicons name="cube-outline" size={12} color="#7C3AED" />
                  <Text style={styles.heldItemsSummaryText}>
                    {heldAssets.length} asset
                    {heldAssets.length === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>

              {heldBottles.length > 0 ? (
                <View style={styles.heldItemsSection}>
                  <Text style={styles.heldItemsSectionTitle}>Bottles</Text>
                  {heldBottles.map((bottle, index) => (
                    <View key={`${bottle.itemId}-${index}`}>
                      <View style={styles.heldItemRow}>
                        <View style={styles.heldItemMedia}>
                          {resolveResourceUrl(bottle.image_url) ? (
                            <Image
                              source={{
                                uri: resolveResourceUrl(bottle.image_url) || "",
                              }}
                              style={styles.heldItemImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons
                              name={getHeldItemIconName("bottle")}
                              size={16}
                              color="#0EA5E9"
                            />
                          )}
                        </View>
                        <View style={styles.heldItemInfo}>
                          <Text style={styles.heldItemLabel}>
                            {bottle.label}
                          </Text>
                          <Text style={styles.heldItemMeta}>
                            {bottle.unit ? `${bottle.unit} • ` : ""}
                            Held quantity
                          </Text>
                          {bottle.description ? (
                            <Text style={styles.heldItemDescription}>
                              {bottle.description}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.heldItemQuantityBadge}>
                          <Text style={styles.heldItemQuantityText}>
                            ×{bottle.quantity}
                          </Text>
                        </View>
                      </View>
                      {index < heldBottles.length - 1 && (
                        <View style={styles.productDivider} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {heldAssets.length > 0 ? (
                <View style={styles.heldItemsSection}>
                  <Text style={styles.heldItemsSectionTitle}>Assets</Text>
                  {heldAssets.map((asset, index) => (
                    <View key={`${asset.itemId}-${asset.serial}-${index}`}>
                      <View style={styles.heldItemRow}>
                        <View style={styles.heldItemMedia}>
                          {resolveResourceUrl(asset.image_url) ? (
                            <Image
                              source={{
                                uri: resolveResourceUrl(asset.image_url) || "",
                              }}
                              style={styles.heldItemImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons
                              name={getHeldItemIconName(
                                "asset",
                                asset.assetCategory,
                              )}
                              size={16}
                              color="#7C3AED"
                            />
                          )}
                        </View>
                        <View style={styles.heldItemInfo}>
                          <Text style={styles.heldItemLabel}>
                            {asset.label}
                          </Text>
                          <Text style={styles.heldItemMeta}>
                            {asset.assetCategory || "Asset"}
                          </Text>
                          <Text style={styles.heldItemSerial}>
                            Serial: {asset.serial}
                          </Text>
                          {asset.description ? (
                            <Text style={styles.heldItemDescription}>
                              {asset.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {index < heldAssets.length - 1 && (
                        <View style={styles.productDivider} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>STOP</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Route</Text>
            <Text style={styles.detailValue}>{routeName}</Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Visits</Text>
            <Text style={styles.detailValue}>{earlierVisitsCount}</Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>New</Text>
            <Text
              style={[
                styles.detailValue,
                hasNewItems ? styles.goodText : styles.neutralText,
              ]}
            >
              {hasNewItems ? "Yes" : "No"}
            </Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sign</Text>
            <Text
              style={[
                styles.detailValue,
                order.requires_signature ? styles.warnText : styles.neutralText,
              ]}
            >
              {order.requires_signature ? "Yes" : "No"}
            </Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Invoice</Text>
            <Text
              style={[
                styles.detailValue,
                order.requires_immediate_invoice
                  ? styles.warnText
                  : styles.neutralText,
              ]}
            >
              {order.requires_immediate_invoice ? "Yes" : "No"}
            </Text>
          </View>
        </View>

        {/* Route Card */}
        {(isCalculatingDistance || distanceInfo) && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ETA</Text>
            {isCalculatingDistance ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator size="small" color="#1E40AF" />
                <Text style={styles.routeLoadingText}>Loading...</Text>
              </View>
            ) : (
              distanceInfo && (
                <>
                  <View style={styles.routeMetrics}>
                    <View style={styles.routeMetric}>
                      <View style={styles.routeMetricIcon}>
                        <Ionicons name="navigate" size={18} color="#1E40AF" />
                      </View>
                      <Text style={styles.routeMetricValue}>
                        {distanceInfo.distance}
                      </Text>
                      <Text style={styles.routeMetricLabel}>Distance</Text>
                    </View>
                    <View style={styles.routeMetricDivider} />
                    <View style={styles.routeMetric}>
                      <View style={styles.routeMetricIcon}>
                        <Ionicons name="time" size={18} color="#1E40AF" />
                      </View>
                      <Text style={styles.routeMetricValue}>
                        {distanceInfo.duration}
                      </Text>
                      <Text style={styles.routeMetricLabel}>Est. Time</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.mapButton}
                    onPress={handleViewInMap}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="map" size={16} color="#FFFFFF" />
                        <Text style={styles.mapButtonText}>Map</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )
            )}
          </View>
        )}

        {/* Order Info Card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ORDER</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Text style={styles.detailValue}>
              {order.payment_method
                ? [
                    "invoice",
                    "credit_invoice",
                    "credit_sale",
                    "credit",
                  ].includes(order.payment_method ?? "")
                  ? "Credit"
                  : order.payment_method === "credit_invoice"
                    ? "Credit Invoice"
                    : order.payment_method.charAt(0).toUpperCase() +
                      order.payment_method.slice(1)
                : "Not set yet"}
            </Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Items</Text>
            <Text style={styles.detailValue}>{productCount} items</Text>
          </View>
          <View style={styles.detailRowDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total</Text>
            <Text style={styles.detailValueHighlight}>AED {totalAmount}</Text>
          </View>
        </View>

        {/* Products Card */}
        {order.products &&
          ((Array.isArray(order.products) && order.products.length > 0) ||
            (typeof order.products === "object" &&
              Object.keys(order.products).length > 0)) && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>ITEMS</Text>
              {(() => {
                const { productsArray } = normalizeOrderProducts(
                  order.products,
                );
                return productsArray.map((product, index) => (
                  <View key={product.id || product.name}>
                    <View style={styles.productRow}>
                      <View style={styles.productIcon}>
                        <Ionicons name="water" size={14} color="#0EA5E9" />
                      </View>
                      <Text style={styles.productName}>{product.name}</Text>
                      <View style={styles.productQtyBadge}>
                        <Text style={styles.productQty}>
                          ×{product.quantity}
                        </Text>
                      </View>
                    </View>
                    {index < productsArray.length - 1 && (
                      <View style={styles.productDivider} />
                    )}
                  </View>
                ));
              })()}
            </View>
          )}

        {parsedTasks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>TASKS</Text>
            <View style={styles.taskSummaryRow}>
              <Text style={styles.taskSummaryText}>
                {parsedTasks.length} planned task
                {parsedTasks.length === 1 ? "" : "s"}
              </Text>
            </View>
            {parsedTasks.map((task, index) => (
              <View key={task.key}>
                <View style={styles.taskCard}>
                  <View style={styles.taskHeaderRow}>
                    <View style={styles.taskHeaderMain}>
                      <Text style={styles.taskTitle}>{task.label}</Text>
                      <Text style={styles.taskMeta}>
                        {formatTaskBucketLabel(task.bucket)}
                      </Text>
                      {getTaskReferenceLabel(task) ? (
                        <Text style={styles.taskMetaSecondary}>
                          {getTaskReferenceLabel(task)}
                          {task.invoiceId ? ` • Invoice ${task.invoiceId}` : ""}
                        </Text>
                      ) : task.invoiceId ? (
                        <Text style={styles.taskMetaSecondary}>
                          Invoice {task.invoiceId}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.taskTypeBadge}>
                      <Text style={styles.taskTypeBadgeText}>
                        {formatTaskTypeLabel(task.type)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.taskPillsRow}>
                    <View style={styles.taskPill}>
                      <Ionicons name="list" size={12} color="#475569" />
                      <Text style={styles.taskPillText}>
                        {task.lines.length} line
                        {task.lines.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {task.earlierAttemptsTodayCount > 0 ? (
                      <View style={styles.taskPill}>
                        <Ionicons name="refresh" size={12} color="#D97706" />
                        <Text style={styles.taskPillWarningText}>
                          {task.earlierAttemptsTodayCount} earlier attempt
                          {task.earlierAttemptsTodayCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ) : null}
                    {task.creditCollections.length > 0 ? (
                      <View style={styles.taskPill}>
                        <Ionicons
                          name="card-outline"
                          size={12}
                          color="#7C3AED"
                        />
                        <Text style={styles.taskPillText}>
                          {task.creditCollections.length} credit collection
                          {task.creditCollections.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {task.lines.length > 0 ? (
                    <View style={styles.taskLinesList}>
                      {task.lines.map((line) => (
                        <View key={line.key} style={styles.taskLineRow}>
                          <View style={styles.taskLineMain}>
                            <Text style={styles.taskLineLabel}>
                              {line.label}
                            </Text>
                            <View style={styles.taskLineMetaRow}>
                              <View style={styles.taskLineKindBadge}>
                                <Text style={styles.taskLineKindText}>
                                  {formatTaskLineKindLabel(line.kind)}
                                </Text>
                              </View>
                              <Text style={styles.taskLineMetaText}>
                                {formatTaskTypeLabel(line.itemType)}
                                {line.unit ? ` • ${line.unit}` : ""}
                                {line.unitPrice > 0
                                  ? ` • AED ${line.unitPrice.toFixed(2)} each`
                                  : ""}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.taskLineTotals}>
                            <Text style={styles.taskLineQuantity}>
                              ×{line.quantity}
                            </Text>
                            {line.totalPrice > 0 ? (
                              <Text style={styles.taskLineAmount}>
                                AED {line.totalPrice.toFixed(2)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.taskEmptyText}>No lines.</Text>
                  )}

                  {task.creditCollections.length > 0 ? (
                    <View style={styles.taskCollectionsList}>
                      {task.creditCollections.map((collection) => (
                        <View
                          key={collection.id}
                          style={styles.taskCollectionRow}
                        >
                          <View style={styles.taskCollectionMain}>
                            <Text style={styles.taskCollectionTitle}>
                              Credit Collection
                            </Text>
                            <Text style={styles.taskCollectionMeta}>
                              {collection.remark || "No remark"}
                            </Text>
                          </View>
                          <Text style={styles.taskCollectionAmount}>
                            AED {collection.amount.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                {index < parsedTasks.length - 1 && (
                  <View style={styles.productDivider} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Rent Items Card */}
        {order.rent_items && order.rent_items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>RENT ITEMS</Text>
            {order.rent_items.map((item, index) => (
              <View key={item.id}>
                <View style={styles.productRow}>
                  <View
                    style={[
                      styles.productIcon,
                      item.category === "borrow"
                        ? styles.rentIconBorrow
                        : styles.rentIconDeposit,
                    ]}
                  >
                    <Ionicons
                      name={
                        item.category === "borrow"
                          ? "arrow-down-circle"
                          : "arrow-up-circle"
                      }
                      size={14}
                      color={item.category === "borrow" ? "#10B981" : "#3B82F6"}
                    />
                  </View>
                  <View style={styles.rentItemInfo}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.rentItemCategory}>
                      {item.category === "borrow" ? "Borrow" : "Deposit"} • Qty:{" "}
                      {item.quantity} • AED{" "}
                      {(item.price * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.rentItemStatus,
                      item.in_truck
                        ? styles.rentItemStatusOn
                        : styles.rentItemStatusOff,
                    ]}
                  >
                    {item.in_truck ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={28}
                        color="#10B981"
                      />
                    ) : (
                      <Ionicons
                        name="ellipse-outline"
                        size={28}
                        color="#9CA3AF"
                      />
                    )}
                  </View>
                </View>
                {index < (order.rent_items?.length || 0) - 1 && (
                  <View style={styles.productDivider} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Instructions */}
        {deliveryInstructions && (
          <View style={[styles.card, styles.instructionsCard]}>
            <View style={styles.instructionsHeader}>
              <Ionicons name="information-circle" size={18} color="#D97706" />
              <Text style={styles.instructionsTitle}>Note</Text>
            </View>
            <Text style={styles.instructionsText}>{deliveryInstructions}</Text>
          </View>
        )}

        {/* Availability */}
        {(order.start_time || order.end_time) && (
          <View style={styles.card}>
            <View style={styles.availabilityRow}>
              <View style={styles.availabilityIcon}>
                <Ionicons name="time-outline" size={16} color="#6B7280" />
              </View>
              <Text style={styles.availabilityText}>
                {order.start_time && order.end_time
                  ? `${order.start_time} — ${order.end_time}`
                  : order.start_time
                    ? `From ${order.start_time}`
                    : "Flexible"}
              </Text>
            </View>
          </View>
        )}

        {/* Update Location Button */}
        <TouchableOpacity
          style={styles.updateLocationButton}
          onPress={handleUpdateCustomerLocation}
          disabled={isUpdatingLocation}
          activeOpacity={0.8}
        >
          {isUpdatingLocation ? (
            <>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.updateLocationButtonText}>Syncing...</Text>
            </>
          ) : (
            <>
              <View style={styles.updateLocationIconBox}>
                <Ionicons name="location" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.updateLocationButtonText}>Pin</Text>
              <View style={styles.updateLocationArrow}>
                <Ionicons name="arrow-forward" size={16} color="#3B82F6" />
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.failButton}
            onPress={handleMarkAsUnsuccessful}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#DC2626" />
            <Text style={styles.failButtonText}>Fail</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.proceedButton}
            onPress={handleProceed}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" />
            <Text style={styles.proceedButtonText}>Start</Text>
            <View style={styles.proceedArrow}>
              <Ionicons name="arrow-forward" size={16} color="#1E40AF" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#1E40AF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
  },
  customerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E40AF",
    letterSpacing: -0.3,
  },
  customerLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    justifyContent: "center",
    alignItems: "center",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  infoIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  heldItemsSubtitle: {
    marginTop: -6,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  heldItemsState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  heldItemsStateText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  heldItemsErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heldItemsErrorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#B91C1C",
  },
  heldItemsEmptyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  heldItemsEmptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  heldItemsEmptyContent: {
    flex: 1,
  },
  heldItemsEmptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  heldItemsEmptyText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  heldItemsSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  heldItemsSummaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heldItemsSummaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  heldItemsSection: {
    marginTop: 2,
  },
  heldItemsSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  heldItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  heldItemMedia: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  heldItemImage: {
    width: "100%",
    height: "100%",
  },
  heldItemInfo: {
    flex: 1,
  },
  heldItemLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  heldItemMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B",
  },
  heldItemDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
  },
  heldItemQuantityBadge: {
    minWidth: 46,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  heldItemQuantityText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  heldItemSerial: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
  routeLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  routeLoadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  routeMetrics: {
    flexDirection: "row",
    marginBottom: 14,
  },
  routeMetric: {
    flex: 1,
    alignItems: "center",
  },
  routeMetricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  routeMetricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.5,
  },
  routeMetricLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  routeMetricDivider: {
    width: 1,
    height: 50,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 16,
    alignSelf: "center",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
  },
  detailRowDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  detailLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
  },
  goodText: {
    color: "#059669",
  },
  warnText: {
    color: "#D97706",
  },
  neutralText: {
    color: "#475569",
  },
  detailValueHighlight: {
    fontSize: 16,
    fontWeight: "700",
    color: "#059669",
  },
  taskSummaryRow: {
    marginTop: -4,
    marginBottom: 10,
  },
  taskSummaryText: {
    fontSize: 12,
    color: "#64748B",
  },
  taskCard: {
    paddingVertical: 4,
  },
  taskHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  taskHeaderMain: {
    flex: 1,
  },
  taskTypeBadge: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  taskTypeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0EA5E9",
    marginTop: 6,
    marginRight: 10,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
  },
  taskMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  taskMetaSecondary: {
    marginTop: 4,
    fontSize: 12,
    color: "#475569",
  },
  taskPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  taskPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  taskPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  taskPillWarningText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
  },
  taskLinesList: {
    marginTop: 12,
    gap: 10,
  },
  taskLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskLineMain: {
    flex: 1,
  },
  taskLineLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  taskLineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  taskLineKindBadge: {
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  taskLineKindText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0369A1",
    textTransform: "uppercase",
  },
  taskLineMetaText: {
    fontSize: 12,
    color: "#64748B",
  },
  taskLineTotals: {
    alignItems: "flex-end",
    minWidth: 82,
  },
  taskLineQuantity: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E40AF",
  },
  taskLineAmount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
    marginTop: 4,
  },
  taskEmptyText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 10,
  },
  taskCollectionsList: {
    marginTop: 12,
    gap: 8,
  },
  taskCollectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    backgroundColor: "#FAF5FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskCollectionMain: {
    flex: 1,
  },
  taskCollectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#581C87",
  },
  taskCollectionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  taskCollectionAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7C3AED",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  productIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
  },
  productQtyBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  productQty: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  rentItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rentItemCategory: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  rentIconBorrow: {
    backgroundColor: "#ECFDF5",
  },
  rentIconDeposit: {
    backgroundColor: "#EFF6FF",
  },
  rentItemStatus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#1E40AF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  rentItemStatusOn: {
    backgroundColor: "#ECFDF5",
  },
  rentItemStatusOff: {
    backgroundColor: "#F3F4F6",
  },
  productDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 40,
  },
  instructionsCard: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  instructionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  instructionsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D97706",
  },
  instructionsText: {
    fontSize: 14,
    color: "#92400E",
    lineHeight: 20,
  },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  availabilityIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  availabilityText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
  },
  updateLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 2,
    borderColor: "#DBEAFE",
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#3B82F6",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  updateLocationIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#1E40AF",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  updateLocationButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#3B82F6",
    textAlign: "center",
  },
  updateLocationArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  failButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 8,
  },
  failButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  proceedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  proceedArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#1E40AF",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E40AF",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 20,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },
});

export default OrderDetails;
