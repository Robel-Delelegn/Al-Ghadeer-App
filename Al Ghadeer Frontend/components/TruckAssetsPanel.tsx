import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface TruckAssetPanelItem {
  id: string;
  label: string;
  serial: string | null;
  category: string | null;
  imageUrl?: string | null;
}

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
  return normalized.length > 0 ? normalized : "Transfer asset";
};

const TruckAssetsPanel = ({
  assets,
  selectedAssetIds,
  onToggleAsset,
}: {
  assets: TruckAssetPanelItem[];
  selectedAssetIds?: Record<string, boolean>;
  onToggleAsset?: (asset: TruckAssetPanelItem) => void;
}) => {
  const isInteractive = typeof onToggleAsset === "function";

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerBadge}>
          <Ionicons name="cube-outline" size={14} color="#0F172A" />
          <Text style={styles.headerTitle}>Assets To Transfer</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{assets.length}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        {isInteractive
          ? "Serial-tracked assets available for customer transfer. They are not billed or taxed, and once confirmed they are deducted from truck stock."
          : "Serial-tracked assets currently loaded on the truck."}
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
                {asset.imageUrl ? (
                  <Image
                    source={{ uri: asset.imageUrl }}
                    style={styles.assetImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons
                    name={getAssetIconName(asset.category)}
                    size={18}
                    color="#0369A1"
                  />
                )}
              </View>

              <View style={styles.assetContent}>
                <View style={styles.assetTopRow}>
                  <Text style={styles.assetLabel} numberOfLines={2}>
                    {asset.label}
                  </Text>
                  {isInteractive ? (
                    <TouchableOpacity
                      style={[
                        styles.assetSelectButton,
                        selectedAssetIds?.[asset.id] &&
                          styles.assetSelectButtonActive,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => onToggleAsset?.(asset)}
                    >
                      <Ionicons
                        name={
                          selectedAssetIds?.[asset.id]
                            ? "checkmark-circle"
                            : "add-circle-outline"
                        }
                        size={15}
                        color={
                          selectedAssetIds?.[asset.id] ? "#FFFFFF" : "#1D4ED8"
                        }
                      />
                      <Text
                        style={[
                          styles.assetSelectButtonText,
                          selectedAssetIds?.[asset.id] &&
                            styles.assetSelectButtonTextActive,
                        ]}
                      >
                        {selectedAssetIds?.[asset.id]
                          ? "Marked For Transfer"
                          : "Transfer To Customer"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.assetStatusBadge}>
                      <Text style={styles.assetStatusText}>On Truck</Text>
                    </View>
                  )}
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
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  assetIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  assetImage: {
    width: "100%",
    height: "100%",
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
  assetSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assetSelectButtonActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#1D4ED8",
  },
  assetSelectButtonText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1D4ED8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  assetSelectButtonTextActive: {
    color: "#FFFFFF",
  },
  assetCategory: {
    marginTop: 6,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
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
