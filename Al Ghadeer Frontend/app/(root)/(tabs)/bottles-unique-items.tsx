import ApiErrorText from "@/components/ApiErrorText";
import { useAuthStore, authenticatedFetch } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { showWarningAlert } from "@/store/utils/alert";
import type { Order } from "@/types/order";
import { parseApiResponseWithSoftError } from "@/utils/api";
import {
  mergeUniqueItemProductsIntoRentItems,
  toTransferableUniqueItemProduct,
} from "@/utils/uniqueItemTransfers";
import {
  mergeHeldItemsIntoRentItems,
  normalizeCustomerHeldItems,
  type CustomerHeldItems,
} from "@/utils/customerHeldItems";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { getApiBaseUrl, resolveResourceUrl } from "@/utils/resources";
import {
  getOrderSelectedDeliveryActions,
  getRentItemDepositAction,
  getRentItemDepositKind,
  getRentItemDisplayLabel,
  getRentItemQuantityLimit,
  isGenericItemDeposit,
} from "@/utils/rentItems";
import {
  extractTruckUniqueItems,
  extractTruckBulkItems,
  getTruckBulkItemMatchKeys,
  mergeTruckUniqueItemsIntoRentItems,
  type TruckUniqueItem,
  type TruckBulkItem,
} from "@/utils/truckLoad";
import {
  getSpecificUniqueItemCategory,
  isUniqueItemSignal,
  UNIQUE_ITEM_KIND,
  UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
  UNIQUE_ITEMS_GROUP,
} from "@/utils/uniqueItems";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const IP_ADDRESS = getApiBaseUrl();

interface ServerProduct {
  id: string;
  itemId: string;
  type: "retail" | "refill" | "unique-items" | "assets" | "other";
  name: string;
  price: number;
  unit: string | null;
  image_url: string | null;
  description: string | null;
  category: string;
  assetCategory?: string | null;
  loaded_quantity?: number;
}

interface BottleDepositOption {
  key: string;
  itemId: string;
  label: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
  kind: "bottle" | "item";
}

type RentItem = NonNullable<Order["rent_items"]>[number];

const normalizeCategory = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const normalizeProductType = (value: unknown): ServerProduct["type"] => {
  const raw = normalizeCategory(typeof value === "string" ? value : "");
  if (raw.includes("refill")) return "refill";
  if (raw.includes("retail") || raw.includes("bulk")) return "retail";
  if (isUniqueItemSignal(raw)) return UNIQUE_ITEMS_GROUP;
  return "other";
};

const toStringValue = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableStringValue = (value: unknown): string | null => {
  const text = toStringValue(value);
  return text.length > 0 ? text : null;
};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const sanitizeMoneyInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) {
    return whole;
  }
  return `${whole}.${fractionParts.join("")}`;
};

const toMoneyDraft = (value: unknown) => {
  const parsed = toNumberValue(value);
  return parsed !== null && parsed >= 0 ? parsed.toFixed(2) : "0.00";
};

const toDepositPriceValue = (value?: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
};

const appendUniqueDisplayPart = (parts: string[], value?: string | null) => {
  const label = (value || "").trim();
  if (!label) return;
  const normalized = label.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === normalized)) return;
  parts.push(label);
};

const getAssetMovementTitle = (item: RentItem) =>
  getSpecificUniqueItemCategory(
    item.unique_item_category,
    item.asset_category,
  ) ||
  item.name ||
  getRentItemDisplayLabel(item);

const getAssetMovementDetail = (item: RentItem) => {
  const title = getAssetMovementTitle(item);
  const parts: string[] = [];

  if (item.name.trim().toLowerCase() !== title.trim().toLowerCase()) {
    appendUniqueDisplayPart(parts, item.name);
  }
  if (item.serial) {
    appendUniqueDisplayPart(parts, `S/N ${item.serial}`);
  } else if ((item.item_id || item.id) !== item.name) {
    appendUniqueDisplayPart(parts, `ID: ${item.item_id || item.id}`);
  }

  return parts.join(" · ");
};

const normalizeProductRecord = (
  raw: unknown,
  fallbackType?: string,
): ServerProduct | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = toStringValue(source.id);
  const itemId =
    toStringValue(source.itemId) || toStringValue(source.item_id) || id;
  const name = toStringValue(source.label) || toStringValue(source.name);
  const price = toNumberValue(
    source.pricePerUnit ?? source.price_per_unit ?? source.price,
  );
  const type = normalizeProductType(source.type ?? fallbackType);

  if (!id || !itemId || !name || price === null) {
    return null;
  }

  return {
    id,
    itemId,
    type,
    name,
    price,
    unit: toNullableStringValue(source.unit),
    image_url: toNullableStringValue(source.image_url),
    description: toNullableStringValue(source.description),
    category:
      type === UNIQUE_ITEMS_GROUP
        ? toStringValue(
            source.uniqueItemCategory ??
              source.unique_item_category ??
              source.assetCategory ??
              source.asset_category,
          ) || "Unique Items"
        : type,
    assetCategory: toNullableStringValue(
      source.uniqueItemCategory ??
        source.unique_item_category ??
        source.assetCategory ??
        source.asset_category,
    ),
    loaded_quantity:
      toNumberValue(source.loaded_quantity ?? source.available_stock) ??
      undefined,
  };
};

const normalizeProductsPayload = (payload: unknown): ServerProduct[] => {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => normalizeProductRecord(entry))
      .filter((entry): entry is ServerProduct => entry !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const normalized: ServerProduct[] = [];
  Object.entries(payload as Record<string, unknown>).forEach(
    ([categoryKey, products]) => {
      if (!Array.isArray(products)) return;
      products.forEach((entry) => {
        const record = normalizeProductRecord(entry, categoryKey);
        if (record) normalized.push(record);
      });
    },
  );
  return normalized;
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

const getInventoryIconName = (
  kind: "bottle" | "unique-item",
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

const getMovementCopy = (item: RentItem) => {
  const action = getRentItemDepositAction(item);
  const kind = getRentItemDepositKind(item);
  const isReturn = action === "deposit_return";
  const isGenericItem = isGenericItemDeposit(item);

  return {
    label: isGenericItem
      ? "Left item"
      : isReturn
        ? kind === UNIQUE_ITEM_KIND
          ? "Collected unique item"
          : "Collected empty bottle"
        : kind === UNIQUE_ITEM_KIND
          ? "Left unique item"
          : "Left empty bottle",
    verb: isReturn ? "Collect" : "Leave",
    tone: isReturn ? "return" : "leave",
  };
};

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

const MovementItem = ({
  item,
  quantity,
  onChangeQuantity,
  showPriceInput = false,
  priceDraft,
  onChangePrice,
}: {
  item: RentItem;
  quantity: number;
  onChangeQuantity: (itemId: string, delta: number) => void;
  showPriceInput?: boolean;
  priceDraft?: string;
  onChangePrice?: (itemId: string, value: string) => void;
}) => {
  const depositKind = getRentItemDepositKind(item);
  const maxQuantity = getRentItemQuantityLimit(item);
  const copy = getMovementCopy(item);
  const imageUrl = resolveResourceUrl(item.image_url);
  const isReturn = getRentItemDepositAction(item) === "deposit_return";
  const accentColor = isReturn ? "#047857" : "#1D4ED8";
  const accentBackground = isReturn ? "#ECFDF5" : "#EFF6FF";
  const isAsset = depositKind === UNIQUE_ITEM_KIND;
  const isGenericItem = isGenericItemDeposit(item);
  const movementTitle = isAsset
    ? getAssetMovementTitle(item)
    : item.name || getRentItemDisplayLabel(item);
  const movementDetail = isAsset
    ? getAssetMovementDetail(item)
    : isGenericItem
      ? item.description || ""
      : "";

  return (
    <View
      style={[
        styles.movementCard,
        isReturn ? styles.movementCardReturn : styles.movementCardLeave,
        quantity > 0 &&
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
              backgroundColor: accentBackground,
              borderColor: accentBackground,
            },
          ]}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.movementImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={getInventoryIconName(depositKind, item.asset_category)}
              size={22}
              color={accentColor}
            />
          )}
        </View>

        <View style={styles.movementContent}>
          <View style={styles.movementTitleRow}>
            <Text style={styles.movementTitle} numberOfLines={2}>
              {movementTitle}
            </Text>
            {quantity > 0 ? (
              <View
                style={[
                  styles.selectedBadge,
                  isReturn
                    ? styles.selectedBadgeReturn
                    : styles.selectedBadgeLeave,
                ]}
              >
                <Ionicons name="checkmark" size={10} color={accentColor} />
                <Text
                  style={[styles.selectedBadgeText, { color: accentColor }]}
                >
                  Set
                </Text>
              </View>
            ) : null}
          </View>
          {movementDetail ? (
            <Text style={styles.movementDetail} numberOfLines={1}>
              {movementDetail}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{copy.label}</Text>
            </View>
            {Number.isFinite(maxQuantity) ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>Max {maxQuantity}</Text>
              </View>
            ) : null}
            {item.unit ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaPillText}>{item.unit}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.movementActionRow}>
        <Text style={[styles.movementVerb, { color: accentColor }]}>
          {copy.verb}
        </Text>
        <QuantityStepper
          quantity={quantity}
          maxQuantity={maxQuantity}
          onDecrease={() => onChangeQuantity(item.id, -1)}
          onIncrease={() => onChangeQuantity(item.id, 1)}
          tone={copy.tone as "return" | "leave"}
        />
      </View>

      {showPriceInput ? (
        <View style={styles.depositPriceRow}>
          <View style={styles.depositPriceCopy}>
            <Text style={styles.depositPriceLabel}>
              {isReturn ? "Return Value" : "Deposit Price"}
            </Text>
            <Text style={styles.depositPriceHelper}>
              {isReturn ? "Price per item returned" : "Price per item left"}
            </Text>
          </View>
          <View style={styles.depositPriceInputRow}>
            <Text style={styles.depositPricePrefix}>AED</Text>
            <TextInput
              style={styles.depositPriceInput}
              value={priceDraft ?? "0.00"}
              onChangeText={(value) => onChangePrice?.(item.id, value)}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
};

const BottleDepositItem = ({
  bottle,
  quantity,
  onChangeQuantity,
  priceDraft,
  onChangePrice,
}: {
  bottle: BottleDepositOption;
  quantity: number;
  onChangeQuantity: (bottleKey: string, delta: number) => void;
  priceDraft: string;
  onChangePrice: (bottleKey: string, value: string) => void;
}) => {
  const isBottle = bottle.kind === "bottle";
  const detailParts: string[] = [];
  appendUniqueDisplayPart(detailParts, bottle.category);
  appendUniqueDisplayPart(detailParts, bottle.description);
  const detail = detailParts.join(" · ");

  return (
    <View
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
            { backgroundColor: "#EFF6FF", borderColor: "#DBEAFE" },
          ]}
        >
          {bottle.imageUrl ? (
            <Image
              source={{ uri: bottle.imageUrl }}
              style={styles.movementImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={isBottle ? "water-outline" : "cube-outline"}
              size={22}
              color="#1D4ED8"
            />
          )}
        </View>

        <View style={styles.movementContent}>
          <View style={styles.movementTitleRow}>
            <Text style={styles.movementTitle} numberOfLines={2}>
              {bottle.label}
            </Text>
            {quantity > 0 ? (
              <View style={[styles.selectedBadge, styles.selectedBadgeLeave]}>
                <Ionicons name="checkmark" size={10} color="#1D4ED8" />
                <Text style={[styles.selectedBadgeText, { color: "#1D4ED8" }]}>
                  Set
                </Text>
              </View>
            ) : null}
          </View>
          {detail ? (
            <Text style={styles.movementDetail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {isBottle ? "Left empty bottle" : "Left item"}
              </Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                On truck {bottle.availableQuantity}
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

      <View style={styles.movementActionRow}>
        <Text style={[styles.movementVerb, { color: "#1D4ED8" }]}>Leave</Text>
        <QuantityStepper
          quantity={quantity}
          maxQuantity={bottle.availableQuantity}
          onDecrease={() => onChangeQuantity(bottle.key, -1)}
          onIncrease={() => onChangeQuantity(bottle.key, 1)}
          tone="leave"
        />
      </View>

      <View style={styles.depositPriceRow}>
        <View style={styles.depositPriceCopy}>
          <Text style={styles.depositPriceLabel}>Deposit Price</Text>
          <Text style={styles.depositPriceHelper}>
            {isBottle ? "Price per empty bottle" : "Price per item left"}
          </Text>
        </View>
        <View style={styles.depositPriceInputRow}>
          <Text style={styles.depositPricePrefix}>AED</Text>
          <TextInput
            style={styles.depositPriceInput}
            value={priceDraft}
            onChangeText={(value) => onChangePrice(bottle.key, value)}
            placeholder="0.00"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
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

const BottlesUniqueItems = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const { assignedOrders, selectedOrder, currentDriver, setAssignedOrders } =
    useOrderStore();
  const { user } = useAuthStore();

  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [truckBulkItems, setTruckBulkItems] = useState<TruckBulkItem[]>([]);
  const [truckAssets, setTruckAssets] = useState<TruckUniqueItem[]>([]);
  const [heldItems, setHeldItems] = useState<CustomerHeldItems>({
    bottles: [],
    assets: [],
  });
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [heldItemsError, setHeldItemsError] = useState<string | null>(null);
  const [truckLoadError, setTruckLoadError] = useState<string | null>(null);

  const currentOrder = assignedOrders.find(
    (order) => order.id === selectedOrder,
  );
  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [currentDriver, user],
  );

  const fetchMovementData = useCallback(async () => {
    try {
      setLoading(true);
      setApiError(null);
      setHeldItemsError(null);
      setTruckLoadError(null);
      setHeldItems({ bottles: [], assets: [] });
      setTruckBulkItems([]);
      setTruckAssets([]);

      if (!driverId) {
        setProducts([]);
        setApiError("Driver ID is missing. Please sign in again.");
        return;
      }

      const store = useOrderStore.getState();
      const order = store.assignedOrders.find(
        (entry) => entry.id === selectedOrder,
      );
      const params = new URLSearchParams();
      if (order?.customer_site_id) {
        params.set("siteId", order.customer_site_id);
      }
      params.set("filter", "all");
      const query = params.toString();
      const productsUrl = `${IP_ADDRESS}/products${query ? `?${query}` : ""}`;

      const [productsResponse, heldItemsResponse, truckResponse] =
        await Promise.all([
          authenticatedFetch(productsUrl, {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          }),
          order?.customer_id
            ? authenticatedFetch(
                `${IP_ADDRESS}/customers/${encodeURIComponent(order.customer_id)}/held-items`,
                {
                  method: "GET",
                },
              )
            : Promise.resolve(null),
          authenticatedFetch(`${IP_ADDRESS}/truck`, {
            method: "GET",
            headers: {
              "X-Driver-Id": driverId,
            },
          }),
        ]);

      const productsResult =
        await parseApiResponseWithSoftError<unknown>(productsResponse);
      if (!productsResult.ok) {
        setProducts([]);
        setApiError(productsResult.error);
      } else {
        setProducts(normalizeProductsPayload(productsResult.data));
      }

      const truckResult =
        await parseApiResponseWithSoftError<unknown>(truckResponse);
      if (!truckResult.ok) {
        setTruckBulkItems([]);
        setTruckAssets([]);
        setTruckLoadError(truckResult.error);
      } else {
        setTruckBulkItems(extractTruckBulkItems(truckResult.data));
        setTruckAssets(extractTruckUniqueItems(truckResult.data));
      }

      if (!heldItemsResponse) {
        setHeldItems({ bottles: [], assets: [] });
      } else {
        const heldResult =
          await parseApiResponseWithSoftError<unknown>(heldItemsResponse);
        if (!heldResult.ok) {
          setHeldItems({ bottles: [], assets: [] });
          setHeldItemsError(heldResult.error);
        } else {
          setHeldItems(normalizeCustomerHeldItems(heldResult.data));
        }
      }
    } catch (error) {
      console.error("Error fetching bottle and unique item data:", error);
      setProducts([]);
      setTruckBulkItems([]);
      setTruckAssets([]);
      setHeldItems({ bottles: [], assets: [] });
      setApiError(
        error instanceof Error
          ? error.message
          : "Failed to load bottle and unique item data.",
      );
    } finally {
      setLoading(false);
    }
  }, [driverId, selectedOrder]);

  useFocusEffect(
    useCallback(() => {
      void fetchMovementData();
    }, [fetchMovementData]),
  );

  const selectedDeliveryActions = useMemo(
    () => getOrderSelectedDeliveryActions(currentOrder),
    [currentOrder],
  );

  const transferableAssetProducts = useMemo(
    () =>
      products
        .filter((product) => product.type === UNIQUE_ITEMS_GROUP)
        .map((product) =>
          toTransferableUniqueItemProduct({
            id: product.id,
            itemId: product.itemId,
            label: product.name,
            assetCategory: product.assetCategory,
            image_url: product.image_url,
            description: product.description,
            unit: product.unit,
          }),
        ),
    [products],
  );

  const selectableRentItems = useMemo(
    () =>
      mergeHeldItemsIntoRentItems(
        mergeTruckUniqueItemsIntoRentItems(
          mergeUniqueItemProductsIntoRentItems(
            currentOrder?.rent_items,
            truckAssets.length > 0 ? [] : transferableAssetProducts,
          ),
          truckAssets,
        ),
        heldItems,
      ),
    [
      currentOrder?.rent_items,
      heldItems,
      transferableAssetProducts,
      truckAssets,
    ],
  );

  const selectedDeliveryActionMap = useMemo(() => {
    const next = new Map<string, RentItem>();

    selectedDeliveryActions.forEach((item) => {
      next.set(item.id, item);
      if (item.item_id) {
        next.set(item.item_id, item);
      }
    });

    return next;
  }, [selectedDeliveryActions]);

  const [rentItemQuantities, setRentItemQuantities] = useState<
    Record<string, number>
  >({});
  const [rentItemDepositPrices, setRentItemDepositPrices] = useState<
    Record<string, string>
  >({});
  const [bottleDepositQuantities, setBottleDepositQuantities] = useState<
    Record<string, number>
  >({});
  const [bottleDepositPrices, setBottleDepositPrices] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const initial: Record<string, number> = {};
    selectableRentItems.forEach((item) => {
      const selectedItem =
        selectedDeliveryActionMap.get(item.id) ||
        (item.item_id
          ? selectedDeliveryActionMap.get(item.item_id)
          : undefined);
      initial[item.id] = Math.max(0, selectedItem?.quantity || 0);
    });
    setRentItemQuantities(initial);
  }, [selectableRentItems, selectedDeliveryActionMap]);

  useEffect(() => {
    setRentItemDepositPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};

      selectableRentItems.forEach((item) => {
        const selectedItem =
          selectedDeliveryActionMap.get(item.id) ||
          (item.item_id
            ? selectedDeliveryActionMap.get(item.item_id)
            : undefined);

        nextPrices[item.id] =
          previousPrices[item.id] ??
          toMoneyDraft(selectedItem?.price ?? item.price);
      });

      return nextPrices;
    });
  }, [selectableRentItems, selectedDeliveryActionMap]);

  const handleChangeRentItemQuantity = useCallback(
    (itemId: string, delta: number) => {
      const item = selectableRentItems.find((entry) => entry.id === itemId);
      const maxQuantity = item ? getRentItemQuantityLimit(item) : Infinity;

      setRentItemQuantities((previousQuantities) => {
        const currentQuantity = previousQuantities[itemId] ?? 0;
        const nextQuantity = Math.max(0, currentQuantity + delta);
        const cappedQuantity = Number.isFinite(maxQuantity)
          ? Math.min(nextQuantity, maxQuantity)
          : nextQuantity;
        return {
          ...previousQuantities,
          [itemId]: cappedQuantity,
        };
      });
    },
    [selectableRentItems],
  );

  const handleChangeRentItemDepositPrice = useCallback(
    (itemId: string, value: string) => {
      setRentItemDepositPrices((previousPrices) => ({
        ...previousPrices,
        [itemId]: sanitizeMoneyInput(value),
      }));
    },
    [],
  );

  const refillProducts = useMemo(
    () => products.filter((product) => product.type === "refill"),
    [products],
  );

  const bottleDepositOptions = useMemo<BottleDepositOption[]>(() => {
    const productsById = new Map<string, ServerProduct>();
    const refillProductsById = new Map<string, ServerProduct>();
    products.forEach((product) => {
      productsById.set(product.itemId, product);
      productsById.set(product.id, product);
    });
    refillProducts.forEach((product) => {
      refillProductsById.set(product.itemId, product);
      refillProductsById.set(product.id, product);
    });

    return truckBulkItems.reduce<BottleDepositOption[]>((options, bulkItem) => {
      const matchKeys = getTruckBulkItemMatchKeys(bulkItem);
      const matchedProduct = matchKeys
        .map((key) => productsById.get(key))
        .find((product): product is ServerProduct => Boolean(product));
      const refillProduct = matchKeys
        .map((key) => refillProductsById.get(key))
        .find((product): product is ServerProduct => Boolean(product));

      const availableQuantity = Math.max(0, Math.floor(bulkItem.quantity));

      if (availableQuantity <= 0) {
        return options;
      }

      const isBottleDeposit =
        bulkItem.isRefillableBottle || Boolean(refillProduct);
      const matchedProductCategory = normalizeCategory(
        matchedProduct?.category,
      );
      const matchedProductType = normalizeCategory(matchedProduct?.type);
      const bulkCategory = normalizeCategory(bulkItem.category);
      const isAssetBulkItem =
        matchedProduct?.type === UNIQUE_ITEMS_GROUP ||
        isUniqueItemSignal(matchedProductType) ||
        isUniqueItemSignal(matchedProductCategory) ||
        isUniqueItemSignal(bulkCategory);

      if (!isBottleDeposit && isAssetBulkItem) {
        return options;
      }

      options.push({
        key: `truck:${isBottleDeposit ? "bottle" : "item"}:${bulkItem.id}`,
        itemId: isBottleDeposit
          ? bulkItem.emptyBottleId || bulkItem.itemId || bulkItem.id
          : bulkItem.itemId || bulkItem.id,
        label: isBottleDeposit
          ? toEmptyRefillLabel(refillProduct?.name || bulkItem.label)
          : matchedProduct?.name || bulkItem.label,
        description: matchedProduct?.description ?? bulkItem.description,
        category: matchedProduct?.category ?? bulkItem.category,
        unit: matchedProduct?.unit ?? refillProduct?.unit ?? bulkItem.unit,
        imageUrl:
          resolveResourceUrl(matchedProduct?.image_url) ||
          resolveResourceUrl(refillProduct?.image_url) ||
          resolveResourceUrl(bulkItem.image_url),
        availableQuantity,
        kind: isBottleDeposit ? "bottle" : "item",
      });

      return options;
    }, []);
  }, [products, refillProducts, truckBulkItems]);

  const refillBottleDepositOptions = useMemo(
    () => bottleDepositOptions.filter((item) => item.kind === "bottle"),
    [bottleDepositOptions],
  );

  const truckItemDepositOptions = useMemo(
    () => bottleDepositOptions.filter((item) => item.kind === "item"),
    [bottleDepositOptions],
  );

  const currentBottleDepositMap = useMemo(() => {
    const currentBottleDeposits = new Map<string, RentItem>();
    selectedDeliveryActions.forEach((item) => {
      if (
        getRentItemDepositAction(item) === "deposit" &&
        getRentItemDepositKind(item) === "bottle"
      ) {
        currentBottleDeposits.set(item.item_id || item.id, item);
      }
    });
    return currentBottleDeposits;
  }, [selectedDeliveryActions]);

  useEffect(() => {
    setBottleDepositQuantities((previousQuantities) => {
      const nextQuantities: Record<string, number> = {};

      bottleDepositOptions.forEach((bottle) => {
        const existingQuantity =
          currentBottleDepositMap.get(bottle.itemId)?.quantity ?? 0;
        const previousQuantity =
          previousQuantities[bottle.key] ?? existingQuantity;

        nextQuantities[bottle.key] = Math.max(
          0,
          Math.min(previousQuantity, bottle.availableQuantity),
        );
      });

      return nextQuantities;
    });
  }, [bottleDepositOptions, currentBottleDepositMap]);

  useEffect(() => {
    setBottleDepositPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};

      bottleDepositOptions.forEach((bottle) => {
        nextPrices[bottle.key] =
          previousPrices[bottle.key] ??
          toMoneyDraft(currentBottleDepositMap.get(bottle.itemId)?.price);
      });

      return nextPrices;
    });
  }, [bottleDepositOptions, currentBottleDepositMap]);

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
      setBottleDepositPrices((previousPrices) => ({
        ...previousPrices,
        [bottleKey]: sanitizeMoneyInput(value),
      }));
    },
    [],
  );

  const bottleReturnItems = useMemo(
    () =>
      selectableRentItems.filter(
        (item) =>
          getRentItemDepositAction(item) === "deposit_return" &&
          getRentItemDepositKind(item) === "bottle",
      ),
    [selectableRentItems],
  );

  const heldAssetReturnItems = useMemo(
    () =>
      selectableRentItems.filter(
        (item) =>
          getRentItemDepositAction(item) === "deposit_return" &&
          getRentItemDepositKind(item) === UNIQUE_ITEM_KIND,
      ),
    [selectableRentItems],
  );

  const depositAssetItems = useMemo(
    () =>
      selectableRentItems.filter(
        (item) =>
          getRentItemDepositAction(item) === "deposit" &&
          getRentItemDepositKind(item) === UNIQUE_ITEM_KIND,
      ),
    [selectableRentItems],
  );

  const selectedActionItems = useMemo<RentItem[]>(
    () =>
      selectableRentItems.flatMap((item) => {
        const quantity = Math.max(0, rentItemQuantities[item.id] ?? 0);
        if (quantity <= 0) return [];

        return [
          {
            ...item,
            price: toDepositPriceValue(
              rentItemDepositPrices[item.id] ?? toMoneyDraft(item.price),
            ),
            quantity,
            in_truck: true,
          },
        ];
      }),
    [rentItemDepositPrices, rentItemQuantities, selectableRentItems],
  );

  const selectedBottleDepositItems = useMemo<RentItem[]>(
    () =>
      bottleDepositOptions.flatMap((bottle) => {
        const quantity = bottleDepositQuantities[bottle.key] ?? 0;
        if (quantity <= 0) return [];

        return [
          {
            id: bottle.key,
            item_id: bottle.itemId,
            name: bottle.label,
            category: "deposit" as const,
            price: toDepositPriceValue(bottleDepositPrices[bottle.key]),
            quantity,
            image_url: bottle.imageUrl || "",
            description: bottle.description,
            in_truck: true,
            max_quantity: bottle.availableQuantity,
            deposit_action: "deposit" as const,
            deposit_kind:
              bottle.kind === "bottle" ? ("bottle" as const) : UNIQUE_ITEM_KIND,
            action_source:
              bottle.kind === "bottle"
                ? ("product_asset" as const)
                : ("product_unique_item" as const),
            unit: bottle.unit,
            other_action_type:
              bottle.kind === "bottle"
                ? ("item-movement-to-customer" as const)
                : UNIQUE_ITEM_MOVEMENT_TO_CUSTOMER,
            other_action_item_type:
              bottle.kind === "bottle" ? ("bottle" as const) : UNIQUE_ITEM_KIND,
          },
        ];
      }),
    [bottleDepositOptions, bottleDepositPrices, bottleDepositQuantities],
  );

  const movementSummary = useMemo(() => {
    const countSelected = (items: RentItem[]) =>
      items.reduce(
        (sum, item) => sum + Math.max(0, rentItemQuantities[item.id] ?? 0),
        0,
      );

    const collectedBottles = countSelected(bottleReturnItems);
    const collectedAssets = countSelected(heldAssetReturnItems);
    const leftBottles = selectedBottleDepositItems
      .filter((item) => !isGenericItemDeposit(item))
      .reduce((sum, item) => sum + item.quantity, 0);
    const leftItems = selectedBottleDepositItems
      .filter((item) => isGenericItemDeposit(item))
      .reduce((sum, item) => sum + item.quantity, 0);
    const leftAssets = countSelected(depositAssetItems);
    return {
      collectedBottles,
      collectedAssets,
      leftBottles,
      leftItems,
      leftAssets,
      totalSelected:
        collectedBottles +
        collectedAssets +
        leftBottles +
        leftItems +
        leftAssets,
    };
  }, [
    bottleReturnItems,
    depositAssetItems,
    heldAssetReturnItems,
    rentItemQuantities,
    selectedBottleDepositItems,
  ]);

  const handleCollectAllReturns = useCallback(() => {
    setRentItemQuantities((previousQuantities) => {
      const nextQuantities = { ...previousQuantities };
      [...bottleReturnItems, ...heldAssetReturnItems].forEach((item) => {
        const maxQuantity = getRentItemQuantityLimit(item);
        nextQuantities[item.id] = Number.isFinite(maxQuantity)
          ? maxQuantity
          : Math.max(0, item.quantity || 0);
      });
      return nextQuantities;
    });
  }, [bottleReturnItems, heldAssetReturnItems]);

  const handleContinue = useCallback(() => {
    if (!currentOrder) {
      showWarningAlert("Order not found", "Please select a delivery again.");
      return;
    }

    const updatedOrder: Order = {
      ...currentOrder,
      draft_delivery_actions: [
        ...selectedActionItems,
        ...selectedBottleDepositItems,
      ],
    };

    setAssignedOrders(
      assignedOrders.map((order) =>
        order.id === currentOrder.id ? updatedOrder : order,
      ),
    );

    router.push({
      pathname: "/(root)/(tabs)/checkout",
      params: { backTo: "bottles-unique-items" },
    });
  }, [
    assignedOrders,
    currentOrder,
    router,
    selectedActionItems,
    selectedBottleDepositItems,
    setAssignedOrders,
  ]);

  const handleBack = useCallback(() => {
    if (params.backTo === "checkout") {
      router.replace({
        pathname: "/(root)/(tabs)/checkout",
        params: { backTo: "bottles-unique-items" },
      });
      return;
    }

    router.replace({
      pathname: "/(root)/(tabs)/add-products",
      params: { backTo: "order-details" },
    });
  }, [params.backTo, router]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { paddingTop: insets.top },
        ]}
      >
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
        <Text style={styles.loadingText}>
          Loading bottles and unique items...
        </Text>
      </View>
    );
  }

  if (!currentOrder) {
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
        <Text style={styles.loadingText}>Order not found.</Text>
        <TouchableOpacity style={styles.inlineButton} onPress={handleBack}>
          <Text style={styles.inlineButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const returnsAvailable =
    bottleReturnItems.length + heldAssetReturnItems.length;
  const bottomNavClearance = Math.max(insets.bottom, 12) + 92;
  const footerScrollClearance = bottomNavClearance + 100;
  const collectedCount =
    movementSummary.collectedBottles + movementSummary.collectedAssets;
  const leftCount =
    movementSummary.leftBottles +
    movementSummary.leftItems +
    movementSummary.leftAssets;

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
          <Text style={styles.headerTitle}>Deposits & Returns</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {currentOrder.customer_name || "Current delivery"}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {movementSummary.totalSelected}
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
        <ApiErrorText error={apiError} />

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
            <View style={styles.sectionActions}>
              <View
                style={[styles.sectionCountPill, styles.sectionCountPillReturn]}
              >
                <Text
                  style={[
                    styles.sectionCountText,
                    styles.sectionCountTextReturn,
                  ]}
                >
                  {collectedCount}
                </Text>
              </View>
              {returnsAvailable > 0 ? (
                <TouchableOpacity
                  style={[styles.quickAction, styles.quickActionReturn]}
                  onPress={handleCollectAllReturns}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.quickActionText,
                      styles.quickActionTextReturn,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {heldItemsError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{heldItemsError}</Text>
            </View>
          ) : null}

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Bottle Returns</Text>
            {bottleReturnItems.length > 0 ? (
              <View style={styles.itemList}>
                {bottleReturnItems.map((item) => (
                  <MovementItem
                    key={item.id}
                    item={item}
                    quantity={Math.max(0, rentItemQuantities[item.id] ?? 0)}
                    onChangeQuantity={handleChangeRentItemQuantity}
                    showPriceInput
                    priceDraft={
                      rentItemDepositPrices[item.id] ?? toMoneyDraft(item.price)
                    }
                    onChangePrice={handleChangeRentItemDepositPrice}
                  />
                ))}
              </View>
            ) : (
              <EmptySection
                icon="water-outline"
                text="No customer-held bottles are available for return."
              />
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Unique Item Returns</Text>
            {heldAssetReturnItems.length > 0 ? (
              <View style={styles.itemList}>
                {heldAssetReturnItems.map((item) => (
                  <MovementItem
                    key={item.id}
                    item={item}
                    quantity={Math.max(0, rentItemQuantities[item.id] ?? 0)}
                    onChangeQuantity={handleChangeRentItemQuantity}
                    showPriceInput
                    priceDraft={
                      rentItemDepositPrices[item.id] ?? toMoneyDraft(item.price)
                    }
                    onChangePrice={handleChangeRentItemDepositPrice}
                  />
                ))}
              </View>
            ) : (
              <EmptySection
                icon="cube-outline"
                text="No customer-held unique items are registered."
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

          {truckLoadError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{truckLoadError}</Text>
            </View>
          ) : null}

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Bottle Deposits</Text>
            {refillBottleDepositOptions.length > 0 ? (
              <View style={styles.itemList}>
                {refillBottleDepositOptions.map((bottle) => (
                  <BottleDepositItem
                    key={bottle.key}
                    bottle={bottle}
                    quantity={Math.max(
                      0,
                      bottleDepositQuantities[bottle.key] ?? 0,
                    )}
                    onChangeQuantity={handleChangeBottleDepositQuantity}
                    priceDraft={bottleDepositPrices[bottle.key] ?? "0.00"}
                    onChangePrice={handleChangeBottleDepositPrice}
                  />
                ))}
              </View>
            ) : (
              <EmptySection
                icon="water-outline"
                text="No empty bottle deposits available."
              />
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Item Deposits</Text>
            {truckItemDepositOptions.length > 0 ? (
              <View style={styles.itemList}>
                {truckItemDepositOptions.map((item) => (
                  <BottleDepositItem
                    key={item.key}
                    bottle={item}
                    quantity={Math.max(
                      0,
                      bottleDepositQuantities[item.key] ?? 0,
                    )}
                    onChangeQuantity={handleChangeBottleDepositQuantity}
                    priceDraft={bottleDepositPrices[item.key] ?? "0.00"}
                    onChangePrice={handleChangeBottleDepositPrice}
                  />
                ))}
              </View>
            ) : (
              <EmptySection
                icon="cube-outline"
                text="No retail item deposits available from the truck."
              />
            )}
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Unique Item Deposits</Text>
            {depositAssetItems.length > 0 ? (
              <View style={styles.itemList}>
                {depositAssetItems.map((item) => (
                  <MovementItem
                    key={item.id}
                    item={item}
                    quantity={Math.max(0, rentItemQuantities[item.id] ?? 0)}
                    onChangeQuantity={handleChangeRentItemQuantity}
                    showPriceInput
                    priceDraft={
                      rentItemDepositPrices[item.id] ?? toMoneyDraft(item.price)
                    }
                    onChangePrice={handleChangeRentItemDepositPrice}
                  />
                ))}
              </View>
            ) : (
              <EmptySection
                icon="cube-outline"
                text="No truck unique items are available to leave with this customer."
              />
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.stickyFooter, { bottom: bottomNavClearance }]}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>Next</Text>
          <Text style={styles.footerValue} numberOfLines={1}>
            {collectedCount} collected | {leftCount} left
          </Text>
        </View>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.82}
        >
          <Text style={styles.continueButtonText}>To Payment</Text>
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
  sectionActions: {
    alignItems: "flex-end",
    gap: 6,
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
  quickAction: {
    height: 30,
    minWidth: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  quickActionReturn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A7F3D0",
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  quickActionTextReturn: {
    color: "#047857",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
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
  depositPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  depositPriceCopy: {
    flex: 1,
    minWidth: 0,
  },
  depositPriceLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1D4ED8",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  depositPriceHelper: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  depositPriceInputRow: {
    width: 136,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
  },
  depositPricePrefix: {
    marginRight: 6,
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  depositPriceInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
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
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#B91C1C",
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

export default BottlesUniqueItems;
