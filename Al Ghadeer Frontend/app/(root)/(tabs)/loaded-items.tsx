import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { showErrorAlert, showSuccessAlert } from "@/store/utils/alert";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

type VerificationStatus =
  | "verification-not-requested"
  | "pending-verification"
  | "verified";

interface TruckInfo {
  id: string;
  label: string | null;
  licensePlate: string | null;
  make: string | null;
}

interface BulkItem {
  id: string;
  label: string;
  quantity: number;
}

interface AssetItem {
  id: string;
  label: string;
  serial: string | null;
  category: string | null;
}

interface TruckLoad {
  bulkItems: BulkItem[];
  assets: AssetItem[];
}

interface TruckResponse {
  truck: TruckInfo;
  verificationStatus: VerificationStatus;
  verificationId?: string;
  load?: TruckLoad;
}

const formatTruckLabel = (truck: TruckInfo): string => {
  return truck.label || truck.licensePlate || truck.make || "Assigned truck";
};

const LoadedItems = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const [truckData, setTruckData] = useState<TruckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [noTruckToday, setNoTruckToday] = useState(false);

  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  const loadInfo = truckData?.load;
  const bulkItems = loadInfo?.bulkItems ?? [];
  const assets = loadInfo?.assets ?? [];

  const bulkUnitsTotal = bulkItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );

  const canAccept =
    Boolean(truckData?.verificationId) &&
    truckData?.verificationStatus !== "verified";

  const statusConfig = useMemo(() => {
    const status = truckData?.verificationStatus;
    if (status === "verified") {
      return {
        label: "Verified",
        description: "Truck hand-off is verified and in your possession.",
        chipBg: "#DCFCE7",
        chipColor: "#166534",
        icon: "checkmark-circle" as const,
      };
    }

    if (status === "pending-verification") {
      return {
        label: "Pending Verification",
        description:
          "Truck hand-off is pending. Verify details and accept when ready.",
        chipBg: "#FEF3C7",
        chipColor: "#92400E",
        icon: "time" as const,
      };
    }

    return {
      label: "Not Requested",
      description: "No verification request is active for this truck yet.",
      chipBg: "#E2E8F0",
      chipColor: "#334155",
      icon: "alert-circle" as const,
    };
  }, [truckData?.verificationStatus]);

  const fetchTruckData = useCallback(
    async (initialLoad = false) => {
      if (!driverId) {
        setTruckData(null);
        setNoTruckToday(true);
        setApiError("Driver ID not available.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (initialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setApiError(null);

      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/truck`, {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        });

        const result =
          await parseApiResponseWithSoftError<TruckResponse>(response);

        if (!result.ok) {
          setTruckData(null);
          setNoTruckToday(result.status === 404);
          setApiError(result.error);
          return;
        }

        setTruckData(result.data);
        setNoTruckToday(false);
      } catch (error) {
        setTruckData(null);
        setNoTruckToday(false);
        setApiError(
          error instanceof Error
            ? error.message
            : "Could not load truck details.",
        );
      } finally {
        if (initialLoad) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [driverId],
  );

  const handleAcceptTruck = useCallback(async () => {
    if (!driverId || !truckData?.verificationId) return;

    setAccepting(true);
    setApiError(null);
    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/truck/accept`,
        {
          method: "POST",
          headers: {
            "X-Driver-Id": driverId,
          },
          body: JSON.stringify({
            verificationId: truckData.verificationId,
          }),
        },
      );

      const result = await parseApiResponseWithSoftError<{ message?: string }>(
        response,
      );
      if (!result.ok) {
        setApiError(result.error);
        showErrorAlert("Accept failed", result.error);
        return;
      }

      showSuccessAlert(
        "Truck accepted",
        result.data?.message ||
          "Truck hand-off has been accepted successfully.",
      );
      await fetchTruckData(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to accept truck.";
      setApiError(message);
      showErrorAlert("Accept failed", message);
    } finally {
      setAccepting(false);
    }
  }, [driverId, truckData?.verificationId, fetchTruckData]);

  useEffect(() => {
    void fetchTruckData(true);
  }, [fetchTruckData]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Loading truck details...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today&apos;s Truck</Text>
        <View style={styles.headerRight} />
      </View>

      <ApiErrorText error={apiError} className="px-4" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchTruckData(false)}
            colors={["#0284C7"]}
            tintColor="#0284C7"
          />
        }
      >
        {noTruckToday || !truckData ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-sport-outline" size={42} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>No truck assigned today</Text>
            <Text style={styles.emptySubtitle}>
              There is no truck assignment for today yet. Pull down to refresh
              later.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.truckCard}>
              <View style={styles.truckIconWrap}>
                <Ionicons name="car-sport" size={22} color="#0369A1" />
              </View>

              <View style={styles.truckInfoWrap}>
                <Text style={styles.truckLabel}>
                  {formatTruckLabel(truckData.truck)}
                </Text>
                <Text style={styles.truckMeta}>
                  Plate: {truckData.truck.licensePlate || "—"}
                </Text>
                <Text style={styles.truckMeta}>
                  Make: {truckData.truck.make || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.statusCard}>
              <View style={styles.statusTopRow}>
                <Text style={styles.sectionTitle}>Verification Status</Text>
                <View
                  style={[
                    styles.statusChip,
                    { backgroundColor: statusConfig.chipBg },
                  ]}
                >
                  <Ionicons
                    name={statusConfig.icon}
                    size={14}
                    color={statusConfig.chipColor}
                  />
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: statusConfig.chipColor },
                    ]}
                  >
                    {statusConfig.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.statusDescription}>
                {statusConfig.description}
              </Text>
              {canAccept ? (
                <TouchableOpacity
                  style={[
                    styles.acceptButton,
                    accepting && styles.acceptButtonDisabled,
                  ]}
                  onPress={() => void handleAcceptTruck()}
                  disabled={accepting}
                  activeOpacity={0.85}
                >
                  {accepting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.acceptButtonText}>
                        Accept Truck Hand-off
                      </Text>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {truckData.verificationStatus === "verification-not-requested" ? (
              <View style={styles.infoCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#334155"
                />
                <Text style={styles.infoCardText}>
                  Load details will appear once verification is requested and
                  linked.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryBar}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{bulkItems.length}</Text>
                    <Text style={styles.summaryLabel}>Bulk Items</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{bulkUnitsTotal}</Text>
                    <Text style={styles.summaryLabel}>Bulk Units</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{assets.length}</Text>
                    <Text style={styles.summaryLabel}>Assets</Text>
                  </View>
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Bulk Items</Text>
                  {bulkItems.length === 0 ? (
                    <Text style={styles.sectionEmptyText}>
                      No bulk items in the current load.
                    </Text>
                  ) : (
                    bulkItems.map((item) => (
                      <View key={item.id} style={styles.listRow}>
                        <View style={styles.listRowLeft}>
                          <Ionicons
                            name="cube-outline"
                            size={16}
                            color="#0369A1"
                          />
                          <Text style={styles.listRowTitle}>{item.label}</Text>
                        </View>
                        <View style={styles.quantityBadge}>
                          <Text style={styles.quantityBadgeText}>
                            {item.quantity}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Assets</Text>
                  {assets.length === 0 ? (
                    <Text style={styles.sectionEmptyText}>
                      No assets in the current load.
                    </Text>
                  ) : (
                    assets.map((asset) => (
                      <View key={asset.id} style={styles.assetCard}>
                        <View style={styles.assetTopRow}>
                          <View style={styles.listRowLeft}>
                            <Ionicons
                              name="hardware-chip-outline"
                              size={16}
                              color="#0E7490"
                            />
                            <Text style={styles.listRowTitle}>
                              {asset.label}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.assetMeta}>
                          Serial: {asset.serial || "—"}
                        </Text>
                        <Text style={styles.assetMeta}>
                          Category: {asset.category || "—"}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}

        <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    marginTop: 10,
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  truckCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    flexDirection: "row",
    gap: 12,
  },
  truckIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  truckInfoWrap: {
    flex: 1,
    gap: 2,
  },
  truckLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  truckMeta: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  statusCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusDescription: {
    marginTop: 8,
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  verificationIdText: {
    marginTop: 8,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: "600",
  },
  acceptButton: {
    marginTop: 12,
    backgroundColor: "#0284C7",
    borderRadius: 12,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptButtonDisabled: {
    opacity: 0.7,
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  infoCard: {
    marginTop: 14,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
    fontWeight: "500",
  },
  summaryBar: {
    marginTop: 14,
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 20,
    color: "#0F172A",
    fontWeight: "700",
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#CBD5E1",
  },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionEmptyText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  listRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  listRowTitle: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    flexShrink: 1,
  },
  quantityBadge: {
    backgroundColor: "#E0F2FE",
    minWidth: 34,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  quantityBadgeText: {
    color: "#0369A1",
    fontSize: 12,
    fontWeight: "700",
  },
  assetCard: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  assetTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assetMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  emptyState: {
    marginTop: 16,
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    color: "#0F172A",
    fontWeight: "700",
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
});

export default LoadedItems;
