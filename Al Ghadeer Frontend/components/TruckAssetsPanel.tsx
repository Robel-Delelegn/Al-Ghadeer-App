import { TruckAsset } from "@/utils/truckLoad";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const getAssetIconName = (category: string | null) => {
  const normalized = (category || "").trim().toLowerCase();
  if (normalized.includes("bottle")) {
    return "water-outline" as const;
  }
  if (normalized.includes("cooler") || normalized.includes("dispenser")) {
    return "snow-outline" as const;
  }
  return "cube-outline" as const;
};

const getAssetCategoryLabel = (category: string | null) => {
  const normalized = (category || "").trim();
  return normalized.length > 0 ? normalized : "Truck asset";
};

const TruckAssetsPanel = ({ assets }: { assets: TruckAsset[] }) => {
  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerBadge}>
          <Ionicons name="cube-outline" size={14} color="#0F172A" />
          <Text style={styles.headerTitle}>Truck Assets</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{assets.length}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Serial-tracked assets currently loaded on the truck.
      </Text>

      {assets.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={18} color="#94A3B8" />
          <Text style={styles.emptyText}>
            No serial-tracked assets are loaded right now.
          </Text>
        </View>
      ) : (
        <View style={styles.assetsList}>
          {assets.map((asset) => (
            <View key={asset.id} style={styles.assetCard}>
              <View style={styles.assetIconBox}>
                <Ionicons
                  name={getAssetIconName(asset.category)}
                  size={18}
                  color="#0369A1"
                />
              </View>

              <View style={styles.assetContent}>
                <View style={styles.assetTopRow}>
                  <Text style={styles.assetLabel} numberOfLines={2}>
                    {asset.label}
                  </Text>
                  <View style={styles.assetStatusBadge}>
                    <Text style={styles.assetStatusText}>On Truck</Text>
                  </View>
                </View>

                <Text style={styles.assetCategory}>
                  {getAssetCategoryLabel(asset.category)}
                </Text>

                <View style={styles.assetSerialRow}>
                  <Ionicons name="qr-code-outline" size={14} color="#64748B" />
                  <Text style={styles.assetSerial}>
                    Serial: {asset.serial || "Unspecified"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  subtitle: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  emptyState: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
  },
  assetsList: {
    marginTop: 14,
    gap: 12,
  },
  assetCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  assetIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  assetContent: {
    flex: 1,
  },
  assetTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  assetLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  assetStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  assetCategory: {
    marginTop: 6,
    fontSize: 12,
    color: "#475569",
  },
  assetSerialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  assetSerial: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
});

export default TruckAssetsPanel;
