import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import {
  AssignmentDay,
  AssignmentsPayload,
  getDayName,
  getRoutesSummary,
  getTruckLabel,
} from "@/utils/assignments";
import { parseApiResponseWithSoftError } from "@/utils/api";
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

const AssignmentsScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const [payload, setPayload] = useState<AssignmentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchAssignments = useCallback(
    async (initialLoad = false) => {
      const driverId = user?.id || currentDriver?.id;

      if (!driverId) {
        setApiError("Driver ID not available.");
        setPayload(null);
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
        const response = await authenticatedFetch(
          `${API_BASE_URL}/assignments`,
          {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          },
        );

        const result =
          await parseApiResponseWithSoftError<AssignmentsPayload>(response);

        if (!result.ok) {
          setApiError(result.error);
          setPayload(null);
          return;
        }

        const normalizedDays = Array.isArray(result.data.days)
          ? [...result.data.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          : [];

        setPayload({
          todayDayOfWeek: result.data.todayDayOfWeek,
          days: normalizedDays,
        });
      } catch (error) {
        setApiError(
          error instanceof Error
            ? error.message
            : "Could not load assignments.",
        );
        setPayload(null);
      } finally {
        if (initialLoad) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [user?.id, currentDriver?.id],
  );

  useEffect(() => {
    void fetchAssignments(true);
  }, [fetchAssignments]);

  const todayAssignment = useMemo(() => {
    if (!payload) return null;
    return (
      payload.days.find((day) => day.dayOfWeek === payload.todayDayOfWeek) ||
      null
    );
  }, [payload]);

  const renderRouteChips = (routes: AssignmentDay["routes"]) => {
    if (routes.length === 0) {
      return (
        <View style={[styles.routeChip, styles.emptyRouteChip]}>
          <Ionicons name="alert-circle-outline" size={13} color="#64748B" />
          <Text style={styles.emptyRouteChipText}>No active routes</Text>
        </View>
      );
    }

    return routes.map((route, index) => (
      <View key={route.id} style={styles.routeChip}>
        <Ionicons name="navigate-outline" size={13} color="#0369A1" />
        <Text style={styles.routeChipText}>
          {route.label?.trim() ? route.label : `Route ${index + 1}`}
        </Text>
      </View>
    ));
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Loading assignments...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Assignments</Text>
          <Text style={styles.headerSubtitle}>Weekly truck and route plan</Text>
        </View>
      </View>

      <ApiErrorText error={apiError} className="px-4" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 18) + 96,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchAssignments(false)}
            tintColor="#0284C7"
            colors={["#0284C7"]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.todayCard}>
          <View style={styles.todayTitleRow}>
            <Ionicons name="today-outline" size={18} color="#0369A1" />
            <Text style={styles.todayTitle}>Today</Text>
            <Text style={styles.todayDayBadge}>
              {payload ? getDayName(payload.todayDayOfWeek) : "Unknown"}
            </Text>
          </View>
          <Text style={styles.todayTruckLabel}>
            {getTruckLabel(todayAssignment?.truck ?? null)}
          </Text>
          <Text style={styles.todayRoutesSummary}>
            {getRoutesSummary(todayAssignment?.routes ?? [])}
          </Text>
          <View style={styles.routesWrap}>
            {renderRouteChips(todayAssignment?.routes ?? [])}
          </View>
        </View>

        {payload?.days?.length ? (
          payload.days.map((day) => {
            const isToday = day.dayOfWeek === payload.todayDayOfWeek;
            const hasTruck = !!day.truck;
            return (
              <View
                key={`day-${day.dayOfWeek}`}
                style={[styles.dayCard, isToday && styles.todayDayCard]}
              >
                <View style={styles.dayCardTop}>
                  <Text
                    style={[styles.dayName, isToday && styles.todayDayName]}
                  >
                    {getDayName(day.dayOfWeek)}
                  </Text>
                  {isToday ? (
                    <View style={styles.todayPill}>
                      <Text style={styles.todayPillText}>Today</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.dayMetaRow}>
                  <Ionicons
                    name={
                      hasTruck ? "car-sport-outline" : "close-circle-outline"
                    }
                    size={15}
                    color={hasTruck ? "#0369A1" : "#B45309"}
                  />
                  <Text style={styles.dayTruckText}>
                    {getTruckLabel(day.truck)}
                  </Text>
                </View>

                <Text style={styles.dayRoutesSummary}>
                  {getRoutesSummary(day.routes)}
                </Text>

                <View style={styles.routesWrap}>
                  {renderRouteChips(day.routes)}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={34} color="#94A3B8" />
            <Text style={styles.emptyStateTitle}>No weekly assignments</Text>
            <Text style={styles.emptyStateSubtitle}>
              Dispatch has not assigned truck/routes for this week yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  todayCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: "#0284C7",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  todayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  todayTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  todayDayBadge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  todayTruckLabel: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  todayRoutesSummary: {
    marginTop: 3,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  dayCard: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
  },
  todayDayCard: {
    borderColor: "#7DD3FC",
    backgroundColor: "#F0F9FF",
  },
  dayCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  todayDayName: {
    color: "#075985",
  },
  todayPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#0284C7",
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dayMetaRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayTruckText: {
    flex: 1,
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  dayRoutesSummary: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  routesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 9,
  },
  routeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  routeChipText: {
    fontSize: 11,
    color: "#0369A1",
    fontWeight: "700",
  },
  emptyRouteChip: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  emptyRouteChipText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
  },
  emptyState: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyStateTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  emptyStateSubtitle: {
    marginTop: 3,
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
});

export default AssignmentsScreen;
