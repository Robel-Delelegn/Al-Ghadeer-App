import ApiErrorText from "@/components/ApiErrorText";
import {
  DirectSaleDraftAssetDraft,
  DirectSaleDraftProduct,
  useOrderStore,
} from "@/store/index";
import { toTransferableAssetProduct } from "@/utils/assetTransfers";
import { resolveResourceUrl } from "@/utils/resources";
import { getTruckBulkItemMatchKeys } from "@/utils/truckLoad";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AssetAction = "deposit" | "deposit_return";

interface AssetOption {
  key: string;
  itemId: string;
  label: string;
  serial: string | null;
  category: string | null;
  imageUrl: string | null;
  source: "product" | "held";
  defaultPrice: number;
}

interface BottleReturnOption {
  key: string;
  itemId: string;
  label: string;
  description: string | null;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

interface BottleDepositOption {
  key: string;
  itemId: string;
  label: string;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

const EMPTY_PRODUCTS: DirectSaleDraftProduct[] = [];
const EMPTY_HELD_ITEMS = { bottles: [], assets: [] };
const EMPTY_TRUCK_ASSETS: NonNullable<
  ReturnType<typeof useOrderStore.getState>["directSaleDraft"]
>["truckAssets"] = [];
const EMPTY_TRUCK_BULK_ITEMS: NonNullable<
  ReturnType<typeof useOrderStore.getState>["directSaleDraft"]
>["truckBulkItems"] = [];
const normalizeCategory = (category?: string | null) =>
  (category || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const isGenericAssetCategory = (value?: string | null) => {
  const normalized = normalizeCategory(value);
  return (
    !normalized ||
    normalized === "asset" ||
    normalized === "assets" ||
    normalized === "assetitem" ||
    normalized === "assetproduct"
  );
};

const getSpecificAssetCategory = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    const label = (value || "").trim();
    if (label && !isGenericAssetCategory(label)) return label;
  }
  return "";
};

const appendUniqueDisplayPart = (parts: string[], value?: string | null) => {
  const label = (value || "").trim();
  if (!label) return;
  const normalized = label.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === normalized)) return;
  parts.push(label);
};

const getAssetOptionTitle = (asset: AssetOption) =>
  getSpecificAssetCategory(asset.category) || asset.label || "Asset";

const getAssetOptionDetail = (asset: AssetOption) => {
  const title = getAssetOptionTitle(asset);
  const parts: string[] = [];

  if (asset.label.trim().toLowerCase() !== title.trim().toLowerCase()) {
    appendUniqueDisplayPart(parts, asset.label);
  }
  if (asset.serial) {
    appendUniqueDisplayPart(parts, `S/N ${asset.serial}`);
  } else if (asset.itemId !== asset.label) {
    appendUniqueDisplayPart(parts, `ID: ${asset.itemId}`);
  }

  return parts.join(" · ");
};

const toEmptyRefillLabel = (label: string) => {
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return "Refill Item (Empty)";
  }

  if (/\(\s*empty\s*\)$/i.test(trimmedLabel)) {
    return trimmedLabel;
  }

  if (/\(\s*full\s*\)$/i.test(trimmedLabel)) {
    return trimmedLabel.replace(/\(\s*full\s*\)$/i, "(Empty)");
  }

  return `${trimmedLabel} (Empty)`;
};

const sanitizeMoneyInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) {
    return whole;
  }
  return `${whole}.${fractionParts.join("")}`;
};

const toPriceValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getInventoryIconName = (
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

const isReturnAsset = (asset: AssetOption) => asset.source === "held";

const QuantityStepper = ({
  quantity,
  maxQuantity,
  onDecrease,
  onIncrease,
  tone,
}: {
  quantity: number;
  maxQuantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  tone: "return" | "leave";
}) => {
  const isMax = Number.isFinite(maxQuantity) && quantity >= maxQuantity;
  const activeColor = tone === "return" ? "#047857" : "#1D4ED8";

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepperButton, quantity === 0 && styles.stepperDisabled]}
        onPress={onDecrease}
        disabled={quantity === 0}
        activeOpacity={0.75}
      >
        <Ionicons
          name="remove"
          size={18}
          color={quantity === 0 ? "#CBD5E1" : activeColor}
        />
      </TouchableOpacity>
      <Text style={[styles.stepperValue, { color: activeColor }]}>
        {quantity}
      </Text>
      <TouchableOpacity
        style={[styles.stepperButton, isMax && styles.stepperDisabled]}
        onPress={onIncrease}
        disabled={isMax}
        activeOpacity={0.75}
      >
        <Ionicons
          name="add"
          size={18}
          color={isMax ? "#CBD5E1" : activeColor}
        />
      </TouchableOpacity>
    </View>
  );
};

const EmptySection = ({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) => (
  <View style={styles.emptySection}>
    <Ionicons name={icon} size={18} color="#94A3B8" />
    <Text style={styles.emptySectionText}>{text}</Text>
  </View>
);

const DirectSaleBottlesAssets = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { directSaleDraft, setDirectSaleDraft } = useOrderStore();

  const [assetDrafts, setAssetDrafts] = useState<
    Record<string, DirectSaleDraftAssetDraft>
  >(directSaleDraft?.assetDrafts || {});
  const [bottleDepositPrices, setBottleDepositPrices] = useState<
    Record<string, string>
  >(directSaleDraft?.bottleDepositPrices || {});
  const [bottleDepositQuantities, setBottleDepositQuantities] = useState<
    Record<string, number>
  >(directSaleDraft?.bottleDepositQuantities || {});
  const [bottleReturnPrices, setBottleReturnPrices] = useState<
    Record<string, string>
  >(directSaleDraft?.bottleReturnPrices || {});
  const [bottleReturnQuantities, setBottleReturnQuantities] = useState<
    Record<string, number>
  >(directSaleDraft?.bottleReturnQuantities || {});

  const products = directSaleDraft?.products ?? EMPTY_PRODUCTS;
  const heldItems = directSaleDraft?.heldItems ?? EMPTY_HELD_ITEMS;
  const truckAssets = directSaleDraft?.truckAssets ?? EMPTY_TRUCK_ASSETS;
  const truckBulkItems =
    directSaleDraft?.truckBulkItems ?? EMPTY_TRUCK_BULK_ITEMS;

  const assetOptions = useMemo<AssetOption[]>(() => {
    const transferableAssetProducts = products
      .filter((product) => product.type === "assets")
      .map((product) =>
        toTransferableAssetProduct({
          id: product.id,
          itemId: product.itemId,
          label: product.label,
          assetCategory: product.assetCategory,
          image_url: product.image_url,
          description: product.description,
          unit: product.unit,
        }),
      );
    const assetMetadataByItemId = new Map(
      transferableAssetProducts.map((asset) => [asset.itemId, asset]),
    );

    const productAssets = truckAssets.map((asset) => {
      const metadata =
        assetMetadataByItemId.get(asset.itemId) ||
        assetMetadataByItemId.get(asset.id);

      return {
        key: `product:${asset.id}:${asset.serial || asset.itemId}`,
        itemId: asset.itemId,
        label: asset.label || metadata?.label || "Truck Asset",
        serial: asset.serial ?? metadata?.serial ?? null,
        category: asset.category ?? metadata?.assetCategory ?? null,
        imageUrl:
          resolveResourceUrl(asset.image_url) || metadata?.imageUrl || null,
        source: "product" as const,
        defaultPrice: 0,
      };
    });

    const heldAssets = heldItems.assets.map((asset) => ({
      key: `held:${asset.itemId}:${asset.serial}`,
      itemId: asset.itemId,
      label: asset.label,
      serial: asset.serial,
      category: asset.assetCategory,
      imageUrl: resolveResourceUrl(asset.image_url),
      source: "held" as const,
      defaultPrice: 0,
    }));

    return [...productAssets, ...heldAssets];
  }, [heldItems.assets, products, truckAssets]);

  const bottleReturnOptions = useMemo<BottleReturnOption[]>(
    () =>
      heldItems.bottles.map((bottle) => ({
        key: `held:bottle:${bottle.emptyBottleId}`,
        itemId: bottle.emptyBottleId,
        label: toEmptyRefillLabel(bottle.label),
        description: bottle.description,
        unit: bottle.unit,
        imageUrl: resolveResourceUrl(bottle.image_url),
        availableQuantity: bottle.quantity,
      })),
    [heldItems.bottles],
  );

  const bottleDepositOptions = useMemo<BottleDepositOption[]>(() => {
    const refillProductsById = new Map<string, DirectSaleDraftProduct>();
    products
      .filter((product) => product.type === "refill")
      .forEach((product) => {
        refillProductsById.set(product.itemId, product);
        refillProductsById.set(product.id, product);
      });

    return truckBulkItems.reduce<BottleDepositOption[]>((options, bulkItem) => {
      const matchKeys = getTruckBulkItemMatchKeys(bulkItem);
      const refillProduct = matchKeys
        .map((key) => refillProductsById.get(key))
        .find((product): product is DirectSaleDraftProduct => Boolean(product));

      const availableQuantity = Math.max(0, bulkItem.quantity);

      if (
        availableQuantity <= 0 ||
        (!bulkItem.isRefillableBottle && !refillProduct)
      ) {
        return options;
      }

      options.push({
        key: `truck:bottle:${bulkItem.id}`,
        itemId: bulkItem.emptyBottleId || bulkItem.itemId || bulkItem.id,
        label: toEmptyRefillLabel(refillProduct?.label || bulkItem.label),
        unit: refillProduct?.unit ?? bulkItem.unit,
        imageUrl:
          refillProduct?.image_url || resolveResourceUrl(bulkItem.image_url),
        availableQuantity,
      });

      return options;
    }, []);
  }, [products, truckBulkItems]);

  const heldAssetOptions = useMemo(
    () => assetOptions.filter((asset) => asset.source === "held"),
    [assetOptions],
  );
  const depositAssetOptions = useMemo(
    () => assetOptions.filter((asset) => asset.source === "product"),
    [assetOptions],
  );

  useEffect(() => {
    setAssetDrafts((previousDrafts) => {
      const nextDrafts: Record<string, DirectSaleDraftAssetDraft> = {};

      assetOptions.forEach((asset) => {
        const existingDraft = previousDrafts[asset.key];
        nextDrafts[asset.key] = {
          selected: existingDraft?.selected ?? false,
          price: existingDraft?.price ?? asset.defaultPrice.toFixed(2),
        };
      });

      return nextDrafts;
    });
  }, [assetOptions]);

  useEffect(() => {
    setBottleReturnQuantities((previousQuantities) => {
      const nextQuantities: Record<string, number> = {};
      bottleReturnOptions.forEach((bottle) => {
        const previousQuantity = previousQuantities[bottle.key] ?? 0;
        nextQuantities[bottle.key] = Math.max(
          0,
          Math.min(previousQuantity, bottle.availableQuantity),
        );
      });
      return nextQuantities;
    });
  }, [bottleReturnOptions]);

  useEffect(() => {
    setBottleDepositQuantities((previousQuantities) => {
      const nextQuantities: Record<string, number> = {};
      bottleDepositOptions.forEach((bottle) => {
        const previousQuantity = previousQuantities[bottle.key] ?? 0;
        nextQuantities[bottle.key] = Math.max(
          0,
          Math.min(previousQuantity, bottle.availableQuantity),
        );
      });
      return nextQuantities;
    });
  }, [bottleDepositOptions]);

  useEffect(() => {
    setBottleDepositPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};
      bottleDepositOptions.forEach((bottle) => {
        nextPrices[bottle.key] = previousPrices[bottle.key] ?? "0.00";
      });
      return nextPrices;
    });
  }, [bottleDepositOptions]);

  useEffect(() => {
    setBottleReturnPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};
      bottleReturnOptions.forEach((bottle) => {
        nextPrices[bottle.key] = previousPrices[bottle.key] ?? "0.00";
      });
      return nextPrices;
    });
  }, [bottleReturnOptions]);

  const selectedAssetEntries = useMemo(
    () =>
      assetOptions
        .map((asset) => {
          const draft = assetDrafts[asset.key];
          if (!draft?.selected) return null;
          const price = toPriceValue(draft.price);
          return {
            ...asset,
            action: isReturnAsset(asset)
              ? ("deposit_return" as const)
              : ("deposit" as const),
            price: price ?? Number.NaN,
          };
        })
        .filter(
          (
            asset,
          ): asset is AssetOption & { action: AssetAction; price: number } =>
            asset !== null,
        ),
    [assetDrafts, assetOptions],
  );

  const selectedBottleReturnEntries = useMemo(
    () =>
      bottleReturnOptions
        .map((bottle) => {
          const quantity = bottleReturnQuantities[bottle.key] ?? 0;
          if (quantity <= 0) return null;
          const priceDraft = bottleReturnPrices[bottle.key] ?? "0.00";
          const unitPrice = toPriceValue(priceDraft);
          return {
            ...bottle,
            quantity,
            priceDraft,
            unitPrice: unitPrice ?? Number.NaN,
          };
        })
        .filter(
          (
            bottle,
          ): bottle is BottleReturnOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [bottleReturnOptions, bottleReturnPrices, bottleReturnQuantities],
  );

  const selectedBottleDepositEntries = useMemo(
    () =>
      bottleDepositOptions
        .map((bottle) => {
          const quantity = bottleDepositQuantities[bottle.key] ?? 0;
          if (quantity <= 0) return null;
          const priceDraft = bottleDepositPrices[bottle.key] ?? "0.00";
          const unitPrice = toPriceValue(priceDraft);
          return {
            ...bottle,
            quantity,
            priceDraft,
            unitPrice: unitPrice ?? Number.NaN,
          };
        })
        .filter(
          (
            bottle,
          ): bottle is BottleDepositOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [bottleDepositOptions, bottleDepositPrices, bottleDepositQuantities],
  );

  const collectedCount =
    selectedBottleReturnEntries.reduce(
      (sum, bottle) => sum + bottle.quantity,
      0,
    ) +
    selectedAssetEntries.filter((asset) => asset.action === "deposit_return")
      .length;
  const leftCount =
    selectedBottleDepositEntries.reduce(
      (sum, bottle) => sum + bottle.quantity,
      0,
    ) +
    selectedAssetEntries.filter((asset) => asset.action === "deposit").length;
  const recordedValue =
    selectedAssetEntries.reduce(
      (sum, asset) => (Number.isFinite(asset.price) ? sum + asset.price : sum),
      0,
    ) +
    selectedBottleReturnEntries.reduce(
      (sum, bottle) =>
        Number.isFinite(bottle.unitPrice)
          ? sum + bottle.unitPrice * bottle.quantity
          : sum,
      0,
    ) +
    selectedBottleDepositEntries.reduce(
      (sum, bottle) =>
        Number.isFinite(bottle.unitPrice)
          ? sum + bottle.unitPrice * bottle.quantity
          : sum,
      0,
    );
  const bottomNavClearance = Math.max(insets.bottom, 12) + 92;
  const footerScrollClearance = bottomNavClearance + 104;

  const persistDraft = useCallback(() => {
    if (!directSaleDraft) return;
    setDirectSaleDraft({
      ...directSaleDraft,
      assetDrafts,
      bottleDepositPrices,
      bottleDepositQuantities,
      bottleReturnPrices,
      bottleReturnQuantities,
    });
  }, [
    assetDrafts,
    bottleDepositPrices,
    bottleDepositQuantities,
    bottleReturnPrices,
    bottleReturnQuantities,
    directSaleDraft,
    setDirectSaleDraft,
  ]);

  const handleBack = useCallback(() => {
    persistDraft();
    router.replace("/(root)/(tabs)/direct-sales");
  }, [persistDraft, router]);

  const handleContinue = useCallback(() => {
    persistDraft();
    router.push({
      pathname: "/(root)/(tabs)/direct-sale-confirmation",
      params: { backTo: "direct-sale-bottles-assets" },
    });
  }, [persistDraft, router]);

  const handleToggleAssetSelection = useCallback((assetKey: string) => {
    setAssetDrafts((previousDrafts) => {
      const currentDraft = previousDrafts[assetKey];
      if (!currentDraft) return previousDrafts;
      return {
        ...previousDrafts,
        [assetKey]: {
          ...currentDraft,
          selected: !currentDraft.selected,
        },
      };
    });
  }, []);

  const handleChangeAssetPrice = useCallback(
    (assetKey: string, value: string) => {
      const sanitizedValue = sanitizeMoneyInput(value);
      setAssetDrafts((previousDrafts) => {
        const currentDraft = previousDrafts[assetKey];
        if (!currentDraft) return previousDrafts;
        return {
          ...previousDrafts,
          [assetKey]: {
            ...currentDraft,
            price: sanitizedValue,
          },
        };
      });
    },
    [],
  );

  const handleChangeBottleReturnQuantity = useCallback(
    (bottleKey: string, delta: number) => {
      const bottle = bottleReturnOptions.find(
        (entry) => entry.key === bottleKey,
      );
      const maxQuantity = bottle?.availableQuantity ?? Infinity;

      setBottleReturnQuantities((previousQuantities) => {
        const currentQuantity = previousQuantities[bottleKey] ?? 0;
        const nextQuantity = Math.max(0, currentQuantity + delta);
        const cappedQuantity = Number.isFinite(maxQuantity)
          ? Math.min(nextQuantity, maxQuantity)
          : nextQuantity;
        return {
          ...previousQuantities,
          [bottleKey]: cappedQuantity,
        };
      });
    },
    [bottleReturnOptions],
  );
  const handleChangeBottleReturnPrice = useCallback(
    (bottleKey: string, value: string) => {
      setBottleReturnPrices((previousPrices) => ({
        ...previousPrices,
        [bottleKey]: sanitizeMoneyInput(value),
      }));
    },
    [],
  );

  const handleChangeBottleDepositQuantity = useCallback(
    (bottleKey: string, delta: number) => {
      const bottle = bottleDepositOptions.find(
        (entry) => entry.key === bottleKey,
      );
      const maxQuantity = bottle?.availableQuantity ?? Infinity;

      setBottleDepositQuantities((previousQuantities) => {
        const currentQuantity = previousQuantities[bottleKey] ?? 0;
        const nextQuantity = Math.max(0, currentQuantity + delta);
        const cappedQuantity = Number.isFinite(maxQuantity)
          ? Math.min(nextQuantity, maxQuantity)
          : nextQuantity;
        return {
          ...previousQuantities,
          [bottleKey]: cappedQuantity,
        };
      });
    },
    [bottleDepositOptions],
  );

  const handleChangeBottleDepositPrice = useCallback(
    (bottleKey: string, value: string) => {
      const sanitizedValue = sanitizeMoneyInput(value);
      setBottleDepositPrices((previousPrices) => ({
        ...previousPrices,
        [bottleKey]: sanitizedValue,
      }));
    },
    [],
  );

  const renderAssetCard = (asset: AssetOption) => {
    const draft = assetDrafts[asset.key] || {
      selected: false,
      price: asset.defaultPrice.toFixed(2),
    };
    const isSelected = draft.selected;
    const isReturn = isReturnAsset(asset);
    const accentColor = isReturn ? "#047857" : "#1D4ED8";
    const assetTitle = getAssetOptionTitle(asset);
    const assetDetail = getAssetOptionDetail(asset);

    return (
      <View
        key={asset.key}
        style={[
          styles.movementCard,
          isReturn ? styles.movementCardReturn : styles.movementCardLeave,
          isSelected &&
            (isReturn
              ? styles.movementCardReturnSelected
              : styles.movementCardLeaveSelected),
        ]}
      >
        <View style={styles.movementMain}>
          <View
            style={[
              styles.movementIconBox,
              {
                backgroundColor: isReturn ? "#ECFDF5" : "#EFF6FF",
                borderColor: isReturn ? "#BBF7D0" : "#BFDBFE",
              },
            ]}
          >
            {asset.imageUrl ? (
              <Image
                source={{ uri: asset.imageUrl }}
                style={styles.movementImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={getInventoryIconName("asset", asset.category)}
                size={21}
                color={accentColor}
              />
            )}
          </View>
          <View style={styles.movementContent}>
            <View style={styles.movementTitleRow}>
              <Text style={styles.movementTitle} numberOfLines={2}>
                {assetTitle}
              </Text>
              <View
                style={[
                  styles.selectedBadge,
                  isReturn
                    ? styles.selectedBadgeReturn
                    : styles.selectedBadgeLeave,
                ]}
              >
                <Text
                  style={[styles.selectedBadgeText, { color: accentColor }]}
                >
                  {isReturn ? "Return" : "Deposit"}
                </Text>
              </View>
            </View>
            {assetDetail ? (
              <Text style={styles.movementDetail} numberOfLines={1}>
                {assetDetail}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>
                  {isReturn ? "Held" : "On truck"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.valueActionRow}>
          <View style={styles.valueEditor}>
            <Text style={styles.valueLabel}>Value</Text>
            <View style={styles.valueInputRow}>
              <Text style={styles.valuePrefix}>AED</Text>
              <TextInput
                style={styles.valueInput}
                value={draft.price}
                onChangeText={(value) =>
                  handleChangeAssetPrice(asset.key, value)
                }
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.includeButton,
              isSelected && { backgroundColor: accentColor },
            ]}
            onPress={() => handleToggleAssetSelection(asset.key)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isSelected ? "checkmark-circle" : "add-circle-outline"}
              size={16}
              color={isSelected ? "#FFFFFF" : accentColor}
            />
            <Text
              style={[
                styles.includeButtonText,
                { color: isSelected ? "#FFFFFF" : accentColor },
              ]}
            >
              {isSelected ? "Added" : "Add"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderBottleReturnCard = (bottle: BottleReturnOption) => {
    const quantity = bottleReturnQuantities[bottle.key] ?? 0;
    const price = bottleReturnPrices[bottle.key] ?? "0.00";
    return (
      <View
        key={bottle.key}
        style={[
          styles.movementCard,
          styles.movementCardReturn,
          quantity > 0 && styles.movementCardReturnSelected,
        ]}
      >
        <View style={styles.movementMain}>
          <View
            style={[
              styles.movementIconBox,
              { backgroundColor: "#ECFDF5", borderColor: "#BBF7D0" },
            ]}
          >
            {bottle.imageUrl ? (
              <Image
                source={{ uri: bottle.imageUrl }}
                style={styles.movementImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="water-outline" size={21} color="#047857" />
            )}
          </View>
          <View style={styles.movementContent}>
            <View style={styles.movementTitleRow}>
              <Text style={styles.movementTitle} numberOfLines={2}>
                {bottle.label}
              </Text>
              <View style={[styles.selectedBadge, styles.selectedBadgeReturn]}>
                <Text style={[styles.selectedBadgeText, { color: "#047857" }]}>
                  Return
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>Held</Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>
                  Max {bottle.availableQuantity}
                </Text>
              </View>
              {bottle.unit ? (
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{bottle.unit}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.valueActionRow}>
          <View style={styles.valueEditor}>
            <Text style={styles.valueLabel}>Unit Value</Text>
            <View style={styles.valueInputRow}>
              <Text style={styles.valuePrefix}>AED</Text>
              <TextInput
                style={styles.valueInput}
                value={price}
                onChangeText={(value) =>
                  handleChangeBottleReturnPrice(bottle.key, value)
                }
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <QuantityStepper
            quantity={quantity}
            maxQuantity={bottle.availableQuantity}
            onDecrease={() => handleChangeBottleReturnQuantity(bottle.key, -1)}
            onIncrease={() => handleChangeBottleReturnQuantity(bottle.key, 1)}
            tone="return"
          />
        </View>
      </View>
    );
  };

  const renderBottleDepositCard = (bottle: BottleDepositOption) => {
    const quantity = bottleDepositQuantities[bottle.key] ?? 0;
    const price = bottleDepositPrices[bottle.key] ?? "0.00";
    return (
      <View
        key={bottle.key}
        style={[
          styles.movementCard,
          styles.movementCardLeave,
          quantity > 0 && styles.movementCardLeaveSelected,
        ]}
      >
        <View style={styles.movementMain}>
          <View
            style={[
              styles.movementIconBox,
              { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
            ]}
          >
            {bottle.imageUrl ? (
              <Image
                source={{ uri: bottle.imageUrl }}
                style={styles.movementImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="water-outline" size={21} color="#1D4ED8" />
            )}
          </View>
          <View style={styles.movementContent}>
            <View style={styles.movementTitleRow}>
              <Text style={styles.movementTitle} numberOfLines={2}>
                {bottle.label}
              </Text>
              <View style={[styles.selectedBadge, styles.selectedBadgeLeave]}>
                <Text style={[styles.selectedBadgeText, { color: "#1D4ED8" }]}>
                  Deposit
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>On truck</Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>
                  Avail {bottle.availableQuantity}
                </Text>
              </View>
              {bottle.unit ? (
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{bottle.unit}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.valueActionRow}>
          <View style={styles.valueEditor}>
            <Text style={styles.valueLabel}>Unit Value</Text>
            <View style={styles.valueInputRow}>
              <Text style={styles.valuePrefix}>AED</Text>
              <TextInput
                style={styles.valueInput}
                value={price}
                onChangeText={(value) =>
                  handleChangeBottleDepositPrice(bottle.key, value)
                }
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <QuantityStepper
            quantity={quantity}
            maxQuantity={bottle.availableQuantity}
            onDecrease={() => handleChangeBottleDepositQuantity(bottle.key, -1)}
            onIncrease={() => handleChangeBottleDepositQuantity(bottle.key, 1)}
            tone="leave"
          />
        </View>
      </View>
    );
  };

  if (!directSaleDraft) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.loadingBox}>
          <Ionicons name="alert-circle-outline" size={30} color="#DC2626" />
        </View>
        <Text style={styles.loadingText}>Direct sale draft not found.</Text>
        <TouchableOpacity
          style={styles.inlineButton}
          onPress={() => router.replace("/(root)/(tabs)/direct-sales")}
        >
          <Text style={styles.inlineButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Bottles & Assets</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {directSaleDraft.customerData?.name || "Direct sale"}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {collectedCount + leftCount}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: footerScrollClearance },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ApiErrorText error={null} />

        <View style={styles.sectionBlock}>
          <View style={[styles.sectionHeader, styles.sectionHeaderReturn]}>
            <View style={[styles.sectionIcon, styles.sectionIconReturn]}>
              <Ionicons
                name="return-up-back-outline"
                size={18}
                color="#047857"
              />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.sectionTitle, styles.sectionTitleReturn]}>
                Collected from Customer
              </Text>
              <Text
                style={[styles.sectionSubtitle, styles.sectionSubtitleReturn]}
              >
                Items returning to truck.
              </Text>
            </View>
            <View
              style={[styles.sectionCountPill, styles.sectionCountPillReturn]}
            >
              <Text
                style={[styles.sectionCountText, styles.sectionCountTextReturn]}
              >
                {collectedCount}
              </Text>
            </View>
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Bottle Returns</Text>
            {bottleReturnOptions.length > 0 ? (
              <View style={styles.itemList}>
                {bottleReturnOptions.map((bottle) =>
                  renderBottleReturnCard(bottle),
                )}
              </View>
            ) : (
              <EmptySection
                icon="water-outline"
                text="No bottle returns available for this customer."
              />
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Asset Returns</Text>
            {heldAssetOptions.length > 0 ? (
              <View style={styles.itemList}>
                {heldAssetOptions.map((asset) => renderAssetCard(asset))}
              </View>
            ) : (
              <EmptySection
                icon="cube-outline"
                text="No held assets are registered for this customer."
              />
            )}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <View style={[styles.sectionHeader, styles.sectionHeaderLeave]}>
            <View style={[styles.sectionIcon, styles.sectionIconLeave]}>
              <Ionicons name="arrow-redo-outline" size={18} color="#1D4ED8" />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={[styles.sectionTitle, styles.sectionTitleLeave]}>
                Left With Customer
              </Text>
              <Text
                style={[styles.sectionSubtitle, styles.sectionSubtitleLeave]}
              >
                Items staying at this site.
              </Text>
            </View>
            <View
              style={[styles.sectionCountPill, styles.sectionCountPillLeave]}
            >
              <Text
                style={[styles.sectionCountText, styles.sectionCountTextLeave]}
              >
                {leftCount}
              </Text>
            </View>
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Bottle Deposits</Text>
            {bottleDepositOptions.length > 0 ? (
              <View style={styles.itemList}>
                {bottleDepositOptions.map((bottle) =>
                  renderBottleDepositCard(bottle),
                )}
              </View>
            ) : (
              <EmptySection
                icon="water-outline"
                text="No bottle deposits available."
              />
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Asset Deposits</Text>
            {depositAssetOptions.length > 0 ? (
              <View style={styles.itemList}>
                {depositAssetOptions.map((asset) => renderAssetCard(asset))}
              </View>
            ) : (
              <EmptySection
                icon="cube-outline"
                text="No truck assets are available to leave with this customer."
              />
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.stickyFooter, { bottom: bottomNavClearance }]}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>Recorded Value</Text>
          <Text style={styles.footerValue} numberOfLines={1}>
            AED {recordedValue.toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.82}
        >
          <Text style={styles.continueButtonText}>Review Sale</Text>
          <View style={styles.continueArrow}>
            <Ionicons name="arrow-forward" size={16} color="#1E40AF" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  inlineButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "#2563EB",
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 14,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  sectionHeaderReturn: {
    backgroundColor: "#ECFDF5",
    borderColor: "#BBF7D0",
  },
  sectionHeaderLeave: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sectionIconReturn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A7F3D0",
  },
  sectionIconLeave: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionTitleReturn: {
    color: "#065F46",
  },
  sectionTitleLeave: {
    color: "#1E40AF",
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#64748B",
  },
  sectionSubtitleReturn: {
    color: "#047857",
  },
  sectionSubtitleLeave: {
    color: "#1D4ED8",
  },
  sectionCountPill: {
    minWidth: 36,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  sectionCountPillReturn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A7F3D0",
  },
  sectionCountPillLeave: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFDBFE",
  },
  sectionCountText: {
    fontSize: 13,
    fontWeight: "800",
  },
  sectionCountTextReturn: {
    color: "#047857",
  },
  sectionCountTextLeave: {
    color: "#1D4ED8",
  },
  subsection: {
    gap: 8,
  },
  subsectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemList: {
    gap: 10,
  },
  movementCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.025,
    shadowRadius: 8,
    elevation: 1,
  },
  movementCardReturn: {
    borderLeftWidth: 5,
    borderLeftColor: "#059669",
  },
  movementCardLeave: {
    borderLeftWidth: 5,
    borderLeftColor: "#2563EB",
  },
  movementCardReturnSelected: {
    borderColor: "#A7F3D0",
    borderLeftColor: "#059669",
    backgroundColor: "#F0FDF4",
  },
  movementCardLeaveSelected: {
    borderColor: "#BFDBFE",
    borderLeftColor: "#2563EB",
    backgroundColor: "#F8FAFF",
  },
  movementMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  movementIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  movementImage: {
    width: "100%",
    height: "100%",
  },
  movementContent: {
    flex: 1,
    minWidth: 0,
  },
  movementTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  movementTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#1E40AF",
  },
  movementDetail: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  selectedBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  selectedBadgeReturn: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  selectedBadgeLeave: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 7,
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  movementActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  movementVerb: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  valueActionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  valueEditor: {
    flex: 1,
    gap: 5,
  },
  valueLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  valueInputRow: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  valuePrefix: {
    marginRight: 7,
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  valueInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  includeButton: {
    height: 40,
    minWidth: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  includeButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 4,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepperDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#F1F5F9",
  },
  stepperValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
  },
  emptySection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptySectionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#64748B",
  },
  stickyFooter: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  footerSummary: {
    flex: 1,
    minWidth: 0,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  footerValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  continueButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  continueArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});

export default DirectSaleBottlesAssets;
