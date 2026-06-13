import ApiErrorText from "@/components/ApiErrorText";
import { VAT_RATE } from "@/constants/tax";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { DirectSaleDraft, useOrderStore } from "@/store/index";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { toTransferableAssetProduct } from "@/utils/assetTransfers";
import { AssignmentRoute, AssignmentsPayload } from "@/utils/assignments";
import {
  CustomerHeldItems,
  normalizeCustomerHeldItems,
} from "@/utils/customerHeldItems";
import { getDriverRequestId } from "@/utils/driverIdentity";
import { resolveResourceUrl } from "@/utils/resources";
import {
  extractTruckBulkItems,
  extractTruckAssets,
  getTruckBulkItemMatchKeys,
  TruckBulkItem,
  TruckAsset,
} from "@/utils/truckLoad";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
  Image,
} from "react-native";
import { showSuccessAlert, showWarningAlert } from "@/store/utils/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

// Unified product structure used by direct-sale UI.
interface ServerProduct {
  id: string;
  type: "retail" | "refill" | "assets" | "other";
  itemId: string;
  assetId?: string;
  assetDisplayId?: string | null;
  assetDisplayLabel?: string | null;
  label: string;
  pricePerUnit: number;
  unit: string | null;
  image_url: string | null;
  description: string | null;
  category?: string | null;
  assetCategory?: string | null;
  originalPrice?: number;
  badge?: string;
  loaded_quantity?: number | string;
  available_stock?: number | string;
}

type DirectSalePaymentMethod = "cash" | "wallet" | "check" | "credit";

const PAYMENT_METHODS: {
  id: DirectSalePaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "cash", label: "Cash", icon: "cash-outline" as const },
  { id: "wallet", label: "Wallet", icon: "wallet-outline" as const },
  { id: "check", label: "Check", icon: "document-text-outline" as const },
  { id: "credit", label: "Credit", icon: "receipt-outline" as const },
];

type ProductGroup = "wholesale" | "refill" | "assets" | "other";

const EMPTY_BOTTLE_PRODUCT_PREFIX = "sale-empty-bottle:";
const TRUCK_ASSET_PRODUCT_PREFIX = "sale-asset:";
const EMPTY_BOTTLE_CATEGORY = "empty_bottle";

const normalizeCategory = (category?: string | null) =>
  (category || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const isEmptyBottleSaleProduct = (
  product: Pick<ServerProduct, "id" | "category">,
) =>
  product.id.startsWith(EMPTY_BOTTLE_PRODUCT_PREFIX) ||
  normalizeCategory(product.category || undefined) ===
    normalizeCategory(EMPTY_BOTTLE_CATEGORY);

const isTruckAssetSaleProduct = (product: Pick<ServerProduct, "id">) =>
  product.id.startsWith(TRUCK_ASSET_PRODUCT_PREFIX);

const isSyntheticSaleProduct = (
  product: Pick<ServerProduct, "id" | "category">,
) => isEmptyBottleSaleProduct(product) || isTruckAssetSaleProduct(product);

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

const getAssetProductLabel = (
  metadata: ServerProduct | undefined,
  asset: TruckAsset,
) =>
  metadata?.label ||
  metadata?.assetCategory ||
  asset.category ||
  asset.label ||
  "Asset";

const getAssetProductTitle = (product: ServerProduct) =>
  getSpecificAssetCategory(product.assetCategory, product.category) ||
  product.label ||
  "Asset";

const getAssetProductDetail = (product: ServerProduct) => {
  const title = getAssetProductTitle(product);
  const parts: string[] = [];

  if (product.label.trim().toLowerCase() !== title.trim().toLowerCase()) {
    appendUniqueDisplayPart(parts, product.label);
  }
  appendUniqueDisplayPart(parts, product.assetDisplayLabel);
  if (product.assetDisplayId) {
    appendUniqueDisplayPart(parts, `ID: ${product.assetDisplayId}`);
  }

  return parts.join(" · ");
};

const getProductStockGroupKey = (
  product: Pick<ServerProduct, "id" | "itemId" | "type" | "category">,
) => {
  if (isTruckAssetSaleProduct(product)) {
    return product.id;
  }

  if (product.type === "refill") {
    return `bottle:${product.itemId || product.id}`;
  }

  return product.id;
};

const getProductGroup = (
  product: Pick<ServerProduct, "type" | "category">,
): ProductGroup => {
  const normalized = normalizeCategory(product.type);
  const normalizedCategory = normalizeCategory(product.category || undefined);

  if (normalized.includes("refill")) return "refill";
  if (normalized.includes("asset") || normalizedCategory.includes("asset")) {
    return "assets";
  }
  if (normalized.includes("retail")) {
    return "wholesale";
  }
  return "other";
};

type DirectSaleAssetAction = "deposit" | "deposit_return";

interface DirectSaleAssetOption {
  key: string;
  itemId: string;
  label: string;
  serial: string | null;
  category: string | null;
  imageUrl: string | null;
  source: "product" | "held";
  defaultAction: DirectSaleAssetAction;
  defaultPrice: number;
}

interface DirectSaleAssetDraft {
  selected: boolean;
  price: string;
}

interface DirectSaleBottleReturnOption {
  key: string;
  itemId: string;
  label: string;
  description: string | null;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

interface DirectSaleBottleDepositOption {
  key: string;
  itemId: string;
  label: string;
  unit: string | null;
  imageUrl: string | null;
  availableQuantity: number;
}

interface SiteSubscription {
  itemId: string;
  averageWeeklyQuantity: number;
  startDate?: string | null;
  endDate?: string | null;
}

interface AvailableSubscriptionItem {
  id: string;
  type: "refill";
  itemId: string;
  label: string;
  description: string | null;
  pricePerUnit: number;
  unit: string | null;
  image_url: string | null;
}

interface SubscriptionDraft {
  selected: boolean;
  averageWeeklyQuantity: string;
}

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

const parseStockNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
};

const toQuantityDraft = (value: unknown): string => {
  const parsed = toPriceValue(value);
  if (parsed === null || parsed <= 0) return "";
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
};

const sanitizeQuantityInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fractionParts.join("")}`;
};

const sanitizeDateInput = (value: string) =>
  value.replace(/[^0-9-]/g, "").slice(0, 10);

const getTodayDateInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string): Date | null => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const normalizeSiteSubscriptionRecord = (
  raw: unknown,
): SiteSubscription | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const itemId =
    toStringValue(source.itemId) ||
    toStringValue(source.item_id) ||
    toStringValue(source.id);
  const averageWeeklyQuantity =
    toPriceValue(
      source.averageWeeklyQuantity ?? source.average_weekly_quantity,
    ) ?? 0;

  if (!itemId || averageWeeklyQuantity <= 0) return null;

  return {
    itemId,
    averageWeeklyQuantity,
    startDate:
      toNullableStringValue(source.startDate ?? source.start_date) ?? null,
    endDate: toNullableStringValue(source.endDate ?? source.end_date) ?? null,
  };
};

const getSiteSubscriptions = (
  site?: { subscriptions?: unknown } | null,
): SiteSubscription[] => {
  const subscriptions = site?.subscriptions;
  if (!Array.isArray(subscriptions)) return [];

  return subscriptions
    .map((entry) => normalizeSiteSubscriptionRecord(entry))
    .filter((entry): entry is SiteSubscription => entry !== null);
};

const normalizeAvailableSubscriptionRecord = (
  raw: unknown,
): AvailableSubscriptionItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = toStringValue(source.id);
  const itemId =
    toStringValue(source.itemId) ||
    toStringValue(source.item_id) ||
    toStringValue(source.id);
  const label = toStringValue(source.label) || toStringValue(source.name);
  const pricePerUnit =
    toPriceValue(
      source.pricePerUnit ?? source.price_per_unit ?? source.price,
    ) ?? 0;

  if (!id || !itemId || !label) return null;

  return {
    id,
    itemId,
    label,
    type: "refill",
    pricePerUnit,
    unit: toNullableStringValue(source.unit),
    description: toNullableStringValue(source.description),
    image_url: resolveResourceUrl(toNullableStringValue(source.image_url)),
  };
};

const normalizeAvailableSubscriptionsPayload = (
  payload: unknown,
): AvailableSubscriptionItem[] => {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((entry) => normalizeAvailableSubscriptionRecord(entry))
    .filter((entry): entry is AvailableSubscriptionItem => entry !== null);
};

const formatSubscriptionQuantity = (quantity: number) =>
  Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);

const buildSubscriptionDrafts = (
  siteSubscriptions: SiteSubscription[],
  options: AvailableSubscriptionItem[],
): Record<string, SubscriptionDraft> => {
  const drafts: Record<string, SubscriptionDraft> = {};

  options.forEach((option) => {
    drafts[option.itemId] = {
      selected: false,
      averageWeeklyQuantity: "",
    };
  });

  siteSubscriptions.forEach((subscription) => {
    drafts[subscription.itemId] = {
      selected: true,
      averageWeeklyQuantity: toQuantityDraft(
        subscription.averageWeeklyQuantity,
      ),
    };
  });

  return drafts;
};

const buildFallbackSubscriptionItem = (
  subscription: SiteSubscription,
): AvailableSubscriptionItem => ({
  id: `subscription:${subscription.itemId}`,
  itemId: subscription.itemId,
  type: "refill",
  label: `Subscription ${subscription.itemId.slice(0, 8)}`,
  description: null,
  pricePerUnit: 0,
  unit: null,
  image_url: null,
});

const isCoolerProduct = (
  product: Pick<ServerProduct, "id" | "label" | "itemId">,
) => {
  const idNormalized = normalizeCategory(product.id);
  const labelNormalized = normalizeCategory(product.label);
  const itemIdNormalized = normalizeCategory(product.itemId);
  return (
    idNormalized.includes("cooler") ||
    labelNormalized.includes("cooler") ||
    itemIdNormalized.includes("cooler")
  );
};

const getCoolerStockLimit = (product: ServerProduct): number => {
  if (!isCoolerProduct(product)) return Infinity;
  const candidates = [product.loaded_quantity, product.available_stock];
  for (const candidate of candidates) {
    const parsed = parseStockNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return Infinity;
};

const getProductIconName = (type?: string) => {
  const normalized = normalizeCategory(type);
  if (normalized.includes("refill")) return "water-outline" as const;
  if (normalized.includes("retail")) return "storefront-outline" as const;
  return "cube-outline" as const;
};

const toStringValue = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const toNullableStringValue = (value: unknown): string | null => {
  const text = toStringValue(value);
  return text.length > 0 ? text : null;
};

const toPriceValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeProductType = (value: unknown): ServerProduct["type"] => {
  const normalized = normalizeCategory(toStringValue(value));
  if (normalized.includes("refill")) return "refill";
  if (normalized.includes("retail")) return "retail";
  if (normalized.includes("asset")) return "assets";
  return "other";
};

const normalizeProductRecord = (
  raw: unknown,
  fallbackType?: string,
): ServerProduct | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const id = toStringValue(source.id);
  const itemId =
    toStringValue(source.itemId) ||
    toStringValue(source.item_id) ||
    toStringValue(source.id);
  const label = toStringValue(source.label) || toStringValue(source.name);
  const pricePerUnit = toPriceValue(
    source.pricePerUnit ?? source.price_per_unit ?? source.price,
  );
  const type = normalizeProductType(source.type ?? fallbackType);

  if (!id || !itemId || !label || pricePerUnit === null) {
    return null;
  }

  const originalPrice = toPriceValue(source.originalPrice);
  const badge = toStringValue(source.badge);

  return {
    id,
    itemId,
    assetId:
      toStringValue(source.assetId) ||
      toStringValue(source.asset_id) ||
      undefined,
    label,
    pricePerUnit,
    type,
    unit: toNullableStringValue(source.unit),
    image_url: resolveResourceUrl(toNullableStringValue(source.image_url)),
    description: toNullableStringValue(source.description),
    category: toNullableStringValue(source.category),
    assetCategory: toNullableStringValue(
      source.assetCategory ?? source.asset_category,
    ),
    originalPrice: originalPrice ?? undefined,
    badge: badge || undefined,
    loaded_quantity: source.loaded_quantity as number | string | undefined,
    available_stock: source.available_stock as number | string | undefined,
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

  const mapped: ServerProduct[] = [];
  Object.entries(payload as Record<string, unknown>).forEach(
    ([categoryKey, products]) => {
      if (!Array.isArray(products)) return;
      products.forEach((entry) => {
        const normalized = normalizeProductRecord(entry, categoryKey);
        if (normalized) {
          mapped.push(normalized);
        }
      });
    },
  );
  return mapped;
};

const buildSellableProducts = (
  baseProducts: ServerProduct[],
  truckAssets: TruckAsset[],
): ServerProduct[] => {
  const cleanBaseProducts = baseProducts.filter(
    (product) => !isSyntheticSaleProduct(product),
  );

  const assetProductsById = new Map<string, ServerProduct>();
  cleanBaseProducts
    .filter((product) => product.type === "assets")
    .forEach((product) => {
      assetProductsById.set(product.itemId, product);
      assetProductsById.set(product.id, product);
    });

  const truckAssetItemIds = new Set<string>();
  const truckAssetProducts = truckAssets.flatMap((asset) => {
    const metadata =
      assetProductsById.get(asset.itemId) || assetProductsById.get(asset.id);
    truckAssetItemIds.add(asset.itemId);

    const assetDisplayId = asset.serial || asset.id;

    return [
      {
        id: `${TRUCK_ASSET_PRODUCT_PREFIX}${asset.id}:${asset.serial || asset.itemId}`,
        type: "assets" as const,
        itemId: asset.itemId,
        assetId: asset.id,
        assetDisplayId,
        assetDisplayLabel: asset.label || metadata?.label || null,
        label: getAssetProductLabel(metadata, asset),
        pricePerUnit: metadata?.pricePerUnit ?? 0,
        unit: metadata?.unit ?? null,
        image_url:
          resolveResourceUrl(asset.image_url) || metadata?.image_url || null,
        description: metadata?.description ?? asset.description ?? null,
        category: asset.category || metadata?.category || "Assets",
        assetCategory: asset.category || metadata?.assetCategory || null,
        originalPrice: metadata?.originalPrice,
        badge: "Asset",
        loaded_quantity: 1,
        available_stock: 1,
      },
    ];
  });

  const visibleBaseProducts = cleanBaseProducts.filter(
    (product) =>
      product.type !== "assets" || !truckAssetItemIds.has(product.itemId),
  );

  const deduped = new Map<string, ServerProduct>();
  [...visibleBaseProducts, ...truckAssetProducts].forEach((product) => {
    if (!deduped.has(product.id)) {
      deduped.set(product.id, product);
    }
  });

  return Array.from(deduped.values());
};

interface DirectSaleCheckDraft {
  checkNumber: string;
  checkDate: string;
  bankName: string;
  accountNumber: string;
}

// Customer lookup response structures
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
  subscriptions?: SiteSubscription[];
}

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  walletBalance: number;
  sites: CustomerSite[];
}

const normalizeCustomerData = (raw: unknown): CustomerData | null => {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = toStringValue(source.id);
  const name = toStringValue(source.name);
  const phone = toStringValue(source.phone);

  if (!id || !name) return null;

  const walletBalance =
    toPriceValue(source.walletBalance ?? source.wallet_balance) ?? 0;
  const sites = Array.isArray(source.sites)
    ? (source.sites as CustomerSite[]).map((site) => ({
        ...site,
        subscriptions: Array.isArray(site.subscriptions)
          ? site.subscriptions
          : [],
      }))
    : [];

  return {
    id,
    name,
    phone,
    walletBalance,
    sites,
  };
};

const normalizeCustomerList = (raw: unknown): CustomerData[] =>
  Array.isArray(raw)
    ? raw
        .map((customer) => normalizeCustomerData(customer))
        .filter((customer): customer is CustomerData => customer !== null)
    : [];

const getCustomerWalletBalance = (
  customer?: Pick<CustomerData, "walletBalance"> | null,
) =>
  typeof customer?.walletBalance === "number" &&
  Number.isFinite(customer.walletBalance)
    ? customer.walletBalance
    : 0;

const formatCustomerWalletBalance = (balance: number) => {
  if (balance < 0) {
    return `Outstanding balance: AED ${Math.abs(balance).toFixed(2)}`;
  }
  return `Wallet balance: AED ${balance.toFixed(2)}`;
};

interface SiteDraft {
  siteName: string;
  latitude: string;
  longitude: string;
  streetName: string;
  city: string;
  areaName: string;
  buildingNo: string;
  flatNo: string;
  deliveryInstructions: string;
}

type ReverseGeocodeResult = Awaited<
  ReturnType<typeof Location.reverseGeocodeAsync>
>[number];

const EMPTY_SITE_DRAFT: SiteDraft = {
  siteName: "",
  latitude: "",
  longitude: "",
  streetName: "",
  city: "",
  areaName: "",
  buildingNo: "",
  flatNo: "",
  deliveryInstructions: "",
};

const EMPTY_CHECK_DETAILS: DirectSaleCheckDraft = {
  checkNumber: "",
  checkDate: "",
  bankName: "",
  accountNumber: "",
};

const EMPTY_HELD_ITEMS: CustomerHeldItems = {
  bottles: [],
  assets: [],
};

const firstText = (...values: (string | null | undefined)[]) => {
  for (const value of values) {
    const text = (value || "").trim();
    if (text) return text;
  }
  return "";
};

const joinAddressParts = (...values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const parts: string[] = [];

  values.forEach((value) => {
    const text = (value || "").trim();
    if (!text) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    parts.push(text);
  });

  return parts.join(", ");
};

const formatReverseGeocodeAddress = (
  address?: ReverseGeocodeResult,
): string => {
  if (!address) return "";

  return joinAddressParts(
    address.name,
    address.street,
    address.district,
    address.subregion,
    address.city,
    address.region,
    address.country,
  );
};

const buildSiteDraftPatchFromGeocode = (
  address?: ReverseGeocodeResult,
): Partial<SiteDraft> => {
  if (!address) return {};

  const streetName = firstText(address.street, address.name);
  const areaName = firstText(address.district, address.subregion);
  const city = firstText(address.city, address.subregion, address.region);
  const siteName = firstText(address.name, address.street, areaName, city);

  return {
    ...(siteName ? { siteName } : {}),
    ...(streetName ? { streetName } : {}),
    ...(address.streetNumber ? { buildingNo: address.streetNumber } : {}),
    ...(areaName ? { areaName } : {}),
    ...(city ? { city } : {}),
  };
};

const resolveCurrentLocationForSite = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission is required.");
  }

  const locationData = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const latitude = locationData.coords.latitude;
  const longitude = locationData.coords.longitude;

  let address: ReverseGeocodeResult | undefined;
  try {
    const addressData = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    address = addressData[0];
  } catch (error) {
    console.warn("Failed to reverse geocode current location:", error);
  }

  const formattedAddress =
    formatReverseGeocodeAddress(address) ||
    `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  return {
    latitude,
    longitude,
    address: formattedAddress,
    siteDraftPatch: buildSiteDraftPatchFromGeocode(address),
  };
};

const formatSiteAddress = (site?: CustomerSite | null): string => {
  if (!site) return "";
  const parts = [
    site.streetName,
    site.buildingNo,
    site.flatNo,
    site.areaName,
    site.city,
  ]
    .map((part) => (part || "").trim())
    .filter((part) => part.length > 0);

  return parts.join(", ");
};

const getSiteLabel = (site: CustomerSite, index: number): string => {
  const name = (site.siteName || "").trim();
  if (name) return name;
  const address = formatSiteAddress(site);
  if (address) return address;
  return `Site ${index + 1}`;
};

const toOptionalNumber = (rawValue: string, fieldName: string) => {
  const value = rawValue.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return parsed;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
};

const toTrimmedString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const findUuidInText = (value: string): string => {
  const match = value.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return match ? match[0] : "";
};

const getRouteCandidateId = (route: Record<string, unknown>): string => {
  const candidates = [
    toTrimmedString(route.id),
    toTrimmedString(route.routeId),
    toTrimmedString(route.route_id),
    toTrimmedString(route.uuid),
    toTrimmedString(route.routeUuid),
    toTrimmedString(route.route_uuid),
  ].filter((candidate) => candidate.length > 0);

  const directUuid = candidates.find((candidate) => isUuid(candidate));
  if (directUuid) return directUuid;

  for (let i = 0; i < candidates.length; i += 1) {
    const uuid = findUuidInText(candidates[i]);
    if (uuid) return uuid;
  }

  const objectValues = Object.values(route);
  for (let i = 0; i < objectValues.length; i += 1) {
    const candidateValue = objectValues[i];
    if (typeof candidateValue !== "string") continue;
    const uuid = findUuidInText(candidateValue);
    if (uuid) return uuid;
  }

  return candidates[0] || "";
};

const getRouteCandidateLabel = (
  route: Record<string, unknown>,
  fallbackIndex: number,
): string => {
  const label =
    toTrimmedString(route.label) ||
    toTrimmedString(route.name) ||
    `Route ${fallbackIndex + 1}`;
  return label;
};

const sanitizeMoneyInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) {
    return whole;
  }
  return `${whole}.${fractionParts.join("")}`;
};

const parseMoneyDraft = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAssetSourceLabel = (source: DirectSaleAssetOption["source"]) => {
  return source === "held" ? "Held" : "On Truck";
};

const isReturnOnlyAsset = (asset: DirectSaleAssetOption) => {
  return asset.source === "held";
};

const getAssetOptionTitle = (asset: DirectSaleAssetOption) =>
  getSpecificAssetCategory(asset.category) || asset.label || "Asset";

const getAssetOptionDetail = (asset: DirectSaleAssetOption) => {
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

interface ActionModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  topInset: number;
  bottomInset: number;
  children: React.ReactNode;
}

const ActionModal = ({
  visible,
  title,
  onClose,
  topInset,
  bottomInset,
  children,
}: ActionModalProps) => (
  <Modal
    visible={visible}
    animationType="slide"
    presentationStyle="fullScreen"
    onRequestClose={onClose}
  >
    <KeyboardAvoidingView
      style={styles.modalOverlay}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.modalCard,
          {
            paddingTop: Math.max(topInset, 12) + 8,
            paddingBottom: Math.max(bottomInset, 16),
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={20} color="#475569" />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const DirectSales: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    currentDriver,
    setDirectSaleDraft,
    directSaleDraft,
    directSaleResetCounter,
  } = useOrderStore();
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [truckBulkItems, setTruckBulkItems] = useState<TruckBulkItem[]>([]);
  const [truckAssets, setTruckAssets] = useState<TruckAsset[]>([]);
  const [heldItems, setHeldItems] =
    useState<CustomerHeldItems>(EMPTY_HELD_ITEMS);
  const [assetDrafts, setAssetDrafts] = useState<
    Record<string, DirectSaleAssetDraft>
  >({});
  const [bottleDepositPrices, setBottleDepositPrices] = useState<
    Record<string, string>
  >({});
  const [bottleDepositQuantities, setBottleDepositQuantities] = useState<
    Record<string, number>
  >({});
  const [bottleReturnPrices, setBottleReturnPrices] = useState<
    Record<string, string>
  >({});
  const [bottleReturnQuantities, setBottleReturnQuantities] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [assetActionsModalVisible, setAssetActionsModalVisible] =
    useState(false);
  const [customerSearchModalVisible, setCustomerSearchModalVisible] =
    useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [hasSearchedCustomers, setHasSearchedCustomers] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<
    "create" | "manage"
  >("create");
  const [customerCreatedInModal, setCustomerCreatedInModal] = useState(false);
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerPhone, setCreateCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<DirectSalePaymentMethod>("cash");
  const [checkDetails, setCheckDetails] =
    useState<DirectSaleCheckDraft>(EMPTY_CHECK_DETAILS);
  const [creditCollectionAmount, setCreditCollectionAmount] = useState("");
  const [creditCollectionRemark, setCreditCollectionRemark] = useState("");
  const [remark, setRemark] = useState("");
  const [isRemarkExpanded, setIsRemarkExpanded] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [heldItemsError, setHeldItemsError] = useState<string | null>(null);
  const [truckAssetsError, setTruckAssetsError] = useState<string | null>(null);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [customerSearchResults, setCustomerSearchResults] = useState<
    CustomerData[]
  >([]);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [selectedSite, setSelectedSite] = useState<CustomerSite | null>(null);
  const [availableSubscriptions, setAvailableSubscriptions] = useState<
    AvailableSubscriptionItem[]
  >([]);
  const [subscriptionModalVisible, setSubscriptionModalVisible] =
    useState(false);
  const [subscriptionDrafts, setSubscriptionDrafts] = useState<
    Record<string, SubscriptionDraft>
  >({});
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState("");
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [isSavingSubscriptions, setIsSavingSubscriptions] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [todayRoutes, setTodayRoutes] = useState<AssignmentRoute[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [siteFormMode, setSiteFormMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(EMPTY_SITE_DRAFT);
  const [isResolvingSiteLocation, setIsResolvingSiteLocation] = useState(false);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isAssigningRoute, setIsAssigningRoute] = useState(false);
  const heldItemsRequestIdRef = useRef(0);
  const driverId = useMemo(
    () =>
      getDriverRequestId({
        user,
        currentDriver,
      }),
    [user, currentDriver],
  );

  const resetDirectSaleMovementState = useCallback(() => {
    setHeldItems(EMPTY_HELD_ITEMS);
    setHeldItemsError(null);
    setAssetDrafts({});
    setBottleDepositPrices({});
    setBottleDepositQuantities({});
    setBottleReturnPrices({});
    setBottleReturnQuantities({});
  }, []);

  const resetDirectSaleWorkflowState = useCallback(() => {
    setQuantities({});
    setCustomerData(null);
    setSelectedSite(null);
    setSubscriptionModalVisible(false);
    setSubscriptionDrafts({});
    setSubscriptionStartDate("");
    setSubscriptionEndDate("");
    setSubscriptionError(null);
    setSelectedRouteId("");
    setPaymentMethod("cash");
    setCheckDetails(EMPTY_CHECK_DETAILS);
    setRemark("");
    setIsRemarkExpanded(false);
    setLocation(null);
    setCreditCollectionAmount("");
    setCreditCollectionRemark("");
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setHasSearchedCustomers(false);
    setCustomerCreatedInModal(false);
    setCustomerModalMode("create");
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);
    resetDirectSaleMovementState();
  }, [resetDirectSaleMovementState]);

  useEffect(() => {
    resetDirectSaleWorkflowState();
  }, [directSaleResetCounter, resetDirectSaleWorkflowState]);

  useEffect(() => {
    if (!directSaleDraft) return;

    setProducts(directSaleDraft.products);
    setQuantities(directSaleDraft.quantities);
    setCustomerData(directSaleDraft.customerData);
    setSelectedSite(directSaleDraft.selectedSite);
    setPaymentMethod(directSaleDraft.paymentMethod);
    setCheckDetails(directSaleDraft.checkDetails);
    setRemark(directSaleDraft.remark);
    setLocation(directSaleDraft.location);
    setTruckBulkItems(directSaleDraft.truckBulkItems);
    setTruckAssets(directSaleDraft.truckAssets);
    setHeldItems(directSaleDraft.heldItems);
    setAssetDrafts(directSaleDraft.assetDrafts);
    setBottleDepositPrices(directSaleDraft.bottleDepositPrices);
    setBottleDepositQuantities(directSaleDraft.bottleDepositQuantities);
    setBottleReturnPrices(directSaleDraft.bottleReturnPrices || {});
    setBottleReturnQuantities(directSaleDraft.bottleReturnQuantities);
    setCreditCollectionAmount(directSaleDraft.creditCollectionAmount);
    setCreditCollectionRemark(directSaleDraft.creditCollectionRemark);
  }, [directSaleDraft]);

  const fetchProducts = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!driverId) {
        setProducts([]);
        if (showLoading) {
          setLoading(false);
        }
        setApiError(
          "Driver information is not available yet. Please reopen Direct Sale after login finishes.",
        );
        return;
      }

      try {
        if (showLoading) {
          setLoading(true);
        }
        setApiError(null);
        const params = new URLSearchParams();
        const selectedSiteId = selectedSite?.id?.trim();
        if (selectedSiteId) {
          params.set("siteId", selectedSiteId);
        }
        params.set("filter", "all");
        const url = `${API_BASE_URL}/products${params.toString() ? `?${params.toString()}` : ""}`;

        const response = await authenticatedFetch(url, {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        });
        const result = await parseApiResponseWithSoftError<unknown>(response);
        if (!result.ok) {
          setProducts([]);
          setApiError(result.error);
          return;
        }

        const normalizedProducts = normalizeProductsPayload(result.data);
        setProducts(buildSellableProducts(normalizedProducts, truckAssets));
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [driverId, selectedSite?.id, truckAssets],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchProducts();
    }, [fetchProducts]),
  );

  const fetchAvailableSubscriptions = useCallback(async () => {
    setIsLoadingSubscriptions(true);
    try {
      setSubscriptionError(null);
      const response = await authenticatedFetch(
        `${API_BASE_URL}/available-subscriptions`,
        {
          method: "GET",
        },
      );
      const result = await parseApiResponseWithSoftError<unknown>(response);
      if (!result.ok) {
        setAvailableSubscriptions([]);
        setSubscriptionError(result.error);
        return;
      }

      setAvailableSubscriptions(
        normalizeAvailableSubscriptionsPayload(result.data),
      );
    } catch (error) {
      console.error("Error loading subscription options:", error);
      setAvailableSubscriptions([]);
      setSubscriptionError(
        error instanceof Error
          ? error.message
          : "Failed to load subscription options.",
      );
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchAvailableSubscriptions();
    }, [fetchAvailableSubscriptions]),
  );

  const fetchTruckAssets = useCallback(async () => {
    if (!driverId) {
      setTruckBulkItems([]);
      setTruckAssets([]);
      setTruckAssetsError(null);
      return;
    }

    try {
      setTruckAssetsError(null);
      const response = await authenticatedFetch(`${API_BASE_URL}/truck`, {
        method: "GET",
        headers: {
          "X-Driver-Id": driverId,
        },
      });
      const result = await parseApiResponseWithSoftError<unknown>(response);
      if (!result.ok) {
        setTruckBulkItems([]);
        setTruckAssets([]);
        setTruckAssetsError(result.error);
        return;
      }

      setTruckBulkItems(extractTruckBulkItems(result.data));
      setTruckAssets(extractTruckAssets(result.data));
    } catch (error) {
      console.error("Error fetching truck assets:", error);
      setTruckBulkItems([]);
      setTruckAssets([]);
      setTruckAssetsError(
        error instanceof Error ? error.message : "Failed to load truck assets.",
      );
    }
  }, [driverId]);

  useFocusEffect(
    useCallback(() => {
      void fetchTruckAssets();
    }, [fetchTruckAssets]),
  );

  const fetchHeldItems = useCallback(async (customerId?: string | null) => {
    const requestId = heldItemsRequestIdRef.current + 1;
    heldItemsRequestIdRef.current = requestId;
    const isCurrentRequest = () => heldItemsRequestIdRef.current === requestId;
    const normalizedCustomerId = customerId?.trim();
    if (!normalizedCustomerId) {
      setHeldItems(EMPTY_HELD_ITEMS);
      setHeldItemsError(null);
      return;
    }

    try {
      setHeldItems(EMPTY_HELD_ITEMS);
      setHeldItemsError(null);
      const response = await authenticatedFetch(
        `${API_BASE_URL}/customers/${encodeURIComponent(normalizedCustomerId)}/held-items`,
        {
          method: "GET",
        },
      );
      const result = await parseApiResponseWithSoftError<unknown>(response);
      if (!isCurrentRequest()) return;

      if (!result.ok) {
        setHeldItems(EMPTY_HELD_ITEMS);
        setHeldItemsError(result.error);
        return;
      }

      setHeldItems(normalizeCustomerHeldItems(result.data));
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error("Error fetching held items:", error);
      setHeldItems(EMPTY_HELD_ITEMS);
      setHeldItemsError(
        error instanceof Error ? error.message : "Failed to load held items.",
      );
    }
  }, []);

  useEffect(() => {
    void fetchHeldItems(customerData?.id);
  }, [customerData?.id, fetchHeldItems]);

  const clearDirectSaleDownstreamDrafts = useCallback(
    ({
      clearProducts = true,
      resetPayment = false,
    }: { clearProducts?: boolean; resetPayment?: boolean } = {}) => {
      setDirectSaleDraft(null);
      if (clearProducts) {
        setQuantities({});
      }
      if (resetPayment) {
        setPaymentMethod("cash");
        setCheckDetails(EMPTY_CHECK_DETAILS);
        setRemark("");
        setIsRemarkExpanded(false);
      }
      setCreditCollectionAmount("");
      setCreditCollectionRemark("");
      resetDirectSaleMovementState();
    },
    [resetDirectSaleMovementState, setDirectSaleDraft],
  );

  const applySelectedSite = useCallback(
    (site: CustomerSite | null) => {
      const previousSiteId = selectedSite?.id?.trim() || "";
      const nextSiteId = site?.id?.trim() || "";
      if (previousSiteId !== nextSiteId) {
        clearDirectSaleDownstreamDrafts({ clearProducts: true });
      }

      setSelectedSite(site);
      setSelectedRouteId("");

      if (!site) {
        setLocation(null);
        return;
      }

      const formattedAddress = formatSiteAddress(site);
      if (site.latitude != null && site.longitude != null) {
        setLocation({
          latitude: site.latitude,
          longitude: site.longitude,
          address:
            formattedAddress || site.siteName || "Selected customer location",
        });
        return;
      }

      if (formattedAddress) {
        setLocation((prev) =>
          prev
            ? {
                ...prev,
                address: formattedAddress,
              }
            : prev,
        );
      }
    },
    [clearDirectSaleDownstreamDrafts, selectedSite?.id],
  );

  const applyCustomerSelection = useCallback(
    (customer: CustomerData) => {
      const previousCustomerId = customerData?.id?.trim() || "";
      const nextCustomerId = customer.id.trim();
      if (previousCustomerId !== nextCustomerId) {
        clearDirectSaleDownstreamDrafts({
          clearProducts: true,
          resetPayment: true,
        });
      }

      const preferredSite =
        customer.sites.find((site) => Boolean(site.routeId)) ||
        customer.sites[0] ||
        null;

      setCustomerData(customer);
      setCustomerCreatedInModal(false);
      setSiteFormMode(null);
      setSiteDraft(EMPTY_SITE_DRAFT);
      applySelectedSite(preferredSite);
      if (preferredSite?.routeId) {
        setSelectedRouteId(preferredSite.routeId);
      }
    },
    [applySelectedSite, clearDirectSaleDownstreamDrafts, customerData?.id],
  );

  const closeSearchCustomerModal = useCallback(() => {
    setCustomerSearchModalVisible(false);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setHasSearchedCustomers(false);
  }, []);

  const openSearchCustomerModal = useCallback(() => {
    setApiError(null);
    setCustomerSearchModalVisible(true);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setHasSearchedCustomers(false);
  }, []);

  const closeCustomerModal = useCallback(() => {
    setCustomerModalVisible(false);
    setCustomerModalMode("create");
    setCustomerCreatedInModal(false);
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);
  }, []);

  const openCreateCustomerModal = useCallback(() => {
    setApiError(null);
    setCustomerModalMode("create");
    setCustomerCreatedInModal(false);
    setCreateCustomerName("");
    setCreateCustomerPhone("");
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);
    setCustomerModalVisible(true);
  }, []);

  const openManageCustomerModal = useCallback(() => {
    if (!customerData) {
      showWarningAlert(
        "Customer Required",
        "Search or create a customer first.",
      );
      return;
    }

    setApiError(null);
    setCustomerCreatedInModal(false);
    setCustomerModalMode("manage");
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);
    setCustomerModalVisible(true);
  }, [customerData]);

  const closeSubscriptionModal = useCallback(() => {
    setSubscriptionModalVisible(false);
    setSubscriptionError(null);
  }, []);

  const openSubscriptionModal = useCallback(() => {
    if (!customerData) {
      showWarningAlert(
        "Customer Required",
        "Search or create a customer first.",
      );
      return;
    }
    if (!selectedSite) {
      showWarningAlert(
        "Site Required",
        "Select or add a customer site before creating subscriptions.",
      );
      openManageCustomerModal();
      return;
    }

    const siteSubscriptions = getSiteSubscriptions(selectedSite);
    const firstSubscriptionWithDates = siteSubscriptions.find(
      (subscription) => subscription.startDate || subscription.endDate,
    );

    setSubscriptionDrafts(
      buildSubscriptionDrafts(siteSubscriptions, availableSubscriptions),
    );
    setSubscriptionStartDate(
      firstSubscriptionWithDates?.startDate || getTodayDateInputValue(),
    );
    setSubscriptionEndDate(firstSubscriptionWithDates?.endDate || "");
    setSubscriptionError(null);
    setSubscriptionModalVisible(true);

    if (availableSubscriptions.length === 0 && !isLoadingSubscriptions) {
      void fetchAvailableSubscriptions();
    }
  }, [
    availableSubscriptions,
    customerData,
    fetchAvailableSubscriptions,
    isLoadingSubscriptions,
    openManageCustomerModal,
    selectedSite,
  ]);

  const handleCustomerPicked = useCallback(
    (customer: CustomerData) => {
      applyCustomerSelection(customer);
      closeSearchCustomerModal();
    },
    [applyCustomerSelection, closeSearchCustomerModal],
  );

  const fetchTodayRoutes = useCallback(async () => {
    if (!driverId) {
      setTodayRoutes([]);
      return;
    }

    setIsLoadingRoutes(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/assignments`, {
        method: "GET",
        headers: {
          "X-Driver-Id": driverId,
        },
      });
      const result =
        await parseApiResponseWithSoftError<AssignmentsPayload>(response);
      if (!result.ok) {
        setTodayRoutes([]);
        return;
      }

      const todayDayOfWeek = result.data.todayDayOfWeek;
      const today = result.data.days.find(
        (day) => day.dayOfWeek === todayDayOfWeek,
      );
      const rawRoutes = Array.isArray(today?.routes)
        ? (today?.routes as unknown[])
        : [];
      const normalizedRoutes: AssignmentRoute[] = rawRoutes
        .map((rawRoute, index) => {
          const routeObject =
            rawRoute && typeof rawRoute === "object"
              ? (rawRoute as Record<string, unknown>)
              : {};
          const id = getRouteCandidateId(routeObject);
          const label = getRouteCandidateLabel(routeObject, index);
          return { id, label };
        })
        .filter((route) => route.id.length > 0);

      console.log(
        "[direct-sales] normalized assignment routes:",
        normalizedRoutes.map((route) => ({
          id: route.id,
          isUuid: isUuid(route.id),
          label: route.label,
        })),
      );
      if (normalizedRoutes.some((route) => !isUuid(route.id))) {
        console.warn(
          "[direct-sales] assignment route contains non-uuid id after normalization.",
          normalizedRoutes,
        );
      }

      setTodayRoutes(normalizedRoutes);
    } catch (error) {
      console.error("Error loading assignment routes:", error);
      setTodayRoutes([]);
    } finally {
      setIsLoadingRoutes(false);
    }
  }, [driverId]);

  const handleRefreshProducts = useCallback(async () => {
    setRefreshingProducts(true);
    try {
      await Promise.all([
        fetchProducts({ showLoading: false }),
        fetchTruckAssets(),
        fetchTodayRoutes(),
        fetchHeldItems(customerData?.id),
        fetchAvailableSubscriptions(),
      ]);
    } finally {
      setRefreshingProducts(false);
    }
  }, [
    customerData?.id,
    fetchAvailableSubscriptions,
    fetchHeldItems,
    fetchProducts,
    fetchTodayRoutes,
    fetchTruckAssets,
  ]);

  const searchCustomers = useCallback(async () => {
    if (!driverId) {
      showWarningAlert(
        "Driver Missing",
        "Driver information is not available.",
      );
      return;
    }

    const query = customerSearchQuery.trim();
    if (!query) {
      showWarningAlert(
        "Search Required",
        "Enter search text to look up a customer.",
      );
      return;
    }

    setIsCheckingCustomer(true);
    setCustomerSearchResults([]);
    setHasSearchedCustomers(false);

    try {
      setApiError(null);
      const params = new URLSearchParams();
      params.set("search", query);

      const response = await authenticatedFetch(
        `${API_BASE_URL}/customers?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
          },
        },
      );
      const parseResult =
        await parseApiResponseWithSoftError<unknown>(response);

      if (!parseResult.ok) {
        setApiError(parseResult.error);
        setHasSearchedCustomers(true);
        return;
      }

      const customers = normalizeCustomerList(parseResult.data);
      setCustomerSearchResults(customers);
      setHasSearchedCustomers(true);

      if (customers.length === 0) {
        showWarningAlert(
          "Customer not found",
          "No existing customer matched that query.",
        );
      }
    } catch (error) {
      console.error("Error searching customers:", error);
      setHasSearchedCustomers(false);
      setApiError(
        error instanceof Error ? error.message : "Failed to search customers.",
      );
    } finally {
      setIsCheckingCustomer(false);
    }
  }, [customerSearchQuery, driverId]);

  const handleCreateCustomer = useCallback(async () => {
    const trimmedName = createCustomerName.trim();
    const trimmedPhone = createCustomerPhone.trim();

    if (!trimmedName) {
      showWarningAlert("Name Required", "Enter customer name to create.");
      return;
    }
    if (!trimmedPhone) {
      showWarningAlert("Phone Required", "Enter phone number to create.");
      return;
    }

    setIsCreatingCustomer(true);
    try {
      setApiError(null);
      const response = await authenticatedFetch(`${API_BASE_URL}/customers`, {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
        }),
      });
      const result = await parseApiResponseWithSoftError<unknown>(response);
      if (!result.ok) {
        setApiError(result.error);
        return;
      }

      const createdCustomer = normalizeCustomerData(result.data);
      if (!createdCustomer) {
        setApiError("Customer was created, but the response was incomplete.");
        return;
      }

      setCustomerSearchResults([createdCustomer]);
      applyCustomerSelection(createdCustomer);
      setCustomerCreatedInModal(true);
      setCustomerModalMode("manage");
      showSuccessAlert(
        "Customer Created",
        `${createdCustomer.name} is ready. You can add a site or route before closing.`,
      );
    } catch (error) {
      console.error("Error creating customer:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to create customer.",
      );
    } finally {
      setIsCreatingCustomer(false);
    }
  }, [applyCustomerSelection, createCustomerName, createCustomerPhone]);

  const openCreateSiteForm = useCallback(() => {
    setSiteFormMode("create");
    setSiteDraft({
      ...EMPTY_SITE_DRAFT,
      latitude: location ? String(location.latitude) : "",
      longitude: location ? String(location.longitude) : "",
    });
  }, [location]);

  const openEditSiteForm = useCallback(() => {
    if (!selectedSite) {
      showWarningAlert(
        "Select Site",
        "Please select a customer site before editing.",
      );
      return;
    }

    setSiteFormMode("edit");
    setSiteDraft({
      siteName: selectedSite.siteName || "",
      latitude:
        selectedSite.latitude == null ? "" : String(selectedSite.latitude),
      longitude:
        selectedSite.longitude == null ? "" : String(selectedSite.longitude),
      streetName: selectedSite.streetName || "",
      city: selectedSite.city || "",
      areaName: selectedSite.areaName || "",
      buildingNo: selectedSite.buildingNo || "",
      flatNo: selectedSite.flatNo || "",
      deliveryInstructions: selectedSite.deliveryInstructions || "",
    });
  }, [selectedSite]);

  const closeSiteForm = useCallback(() => {
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);
  }, []);

  const applyCurrentLocationToSiteForm = useCallback(async () => {
    setIsResolvingSiteLocation(true);
    try {
      setApiError(null);
      const resolvedLocation = await resolveCurrentLocationForSite();

      setLocation({
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        address: resolvedLocation.address,
      });

      setSiteDraft((prev) => ({
        ...prev,
        latitude: String(resolvedLocation.latitude),
        longitude: String(resolvedLocation.longitude),
        siteName:
          prev.siteName.trim().length > 0
            ? prev.siteName
            : resolvedLocation.siteDraftPatch.siteName || prev.siteName,
        streetName:
          resolvedLocation.siteDraftPatch.streetName || prev.streetName,
        buildingNo:
          resolvedLocation.siteDraftPatch.buildingNo || prev.buildingNo,
        areaName: resolvedLocation.siteDraftPatch.areaName || prev.areaName,
        city: resolvedLocation.siteDraftPatch.city || prev.city,
      }));
    } catch (error) {
      showWarningAlert(
        "Location Unavailable",
        error instanceof Error
          ? error.message
          : "Current location is not available right now.",
      );
    } finally {
      setIsResolvingSiteLocation(false);
    }
  }, []);

  const saveSite = useCallback(async () => {
    if (!customerData) {
      showWarningAlert(
        "Customer Required",
        "Search or create a customer first.",
      );
      return;
    }
    if (!siteFormMode) return;
    if (siteFormMode === "edit" && !selectedSite) {
      showWarningAlert("Site Required", "Select a site to edit.");
      return;
    }

    let latitude: number | undefined;
    let longitude: number | undefined;
    try {
      latitude = toOptionalNumber(siteDraft.latitude, "Latitude");
      longitude = toOptionalNumber(siteDraft.longitude, "Longitude");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Invalid location.");
      return;
    }

    const payload: Record<string, string | number> = {};
    const siteName = siteDraft.siteName.trim();
    const streetName = siteDraft.streetName.trim();
    const city = siteDraft.city.trim();
    const areaName = siteDraft.areaName.trim();
    const buildingNo = siteDraft.buildingNo.trim();
    const flatNo = siteDraft.flatNo.trim();
    const deliveryInstructions = siteDraft.deliveryInstructions.trim();

    if (siteName) payload.siteName = siteName;
    if (streetName) payload.streetName = streetName;
    if (city) payload.city = city;
    if (areaName) payload.areaName = areaName;
    if (buildingNo) payload.buildingNo = buildingNo;
    if (flatNo) payload.flatNo = flatNo;
    if (latitude !== undefined) payload.latitude = latitude;
    if (longitude !== undefined) payload.longitude = longitude;
    if (siteFormMode === "create" && deliveryInstructions) {
      payload.deliveryInstructions = deliveryInstructions;
    }

    if (Object.keys(payload).length === 0) {
      showWarningAlert(
        "Site Details Missing",
        "Enter at least one site field before saving.",
      );
      return;
    }

    setIsSavingSite(true);
    try {
      setApiError(null);
      const basePath = `${API_BASE_URL}/customers/${customerData.id}/sites`;
      const endpoint =
        siteFormMode === "create"
          ? basePath
          : `${basePath}/${selectedSite?.id || ""}`;
      const method = siteFormMode === "create" ? "POST" : "PATCH";

      const response = await authenticatedFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      const result =
        await parseApiResponseWithSoftError<CustomerSite>(response);
      if (!result.ok) {
        setApiError(result.error);
        return;
      }

      const savedSite = result.data;
      setCustomerData((prev) => {
        if (!prev) return prev;
        const nextSites =
          siteFormMode === "create"
            ? [...prev.sites, savedSite]
            : prev.sites.map((site) =>
                site.id === savedSite.id ? savedSite : site,
              );
        const nextCustomer = { ...prev, sites: nextSites };
        setCustomerSearchResults((customers) =>
          customers.map((customer) =>
            customer.id === nextCustomer.id ? nextCustomer : customer,
          ),
        );
        return nextCustomer;
      });

      applySelectedSite(savedSite);
      closeSiteForm();
      showSuccessAlert(
        siteFormMode === "create" ? "Site Added" : "Site Updated",
        "Customer site information has been saved.",
      );
    } catch (error) {
      console.error("Error saving customer site:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to save site.",
      );
    } finally {
      setIsSavingSite(false);
    }
  }, [
    applySelectedSite,
    closeSiteForm,
    customerData,
    selectedSite,
    siteDraft,
    siteFormMode,
  ]);

  const assignRouteToSelectedSite = useCallback(async () => {
    if (!driverId || !customerData || !selectedSite) {
      showWarningAlert(
        "Site Required",
        "Search customer and select a site first.",
      );
      return;
    }
    const customerId = customerData.id?.trim();
    const siteId = selectedSite.id?.trim();
    const routeId = selectedRouteId.trim();

    if (!routeId) {
      showWarningAlert("Route Required", "Select a route before assigning.");
      return;
    }
    if (!isUuid(customerId)) {
      setApiError("Selected customer reference is invalid.");
      showWarningAlert(
        "Invalid Customer",
        "The selected customer reference is invalid. Please search again.",
      );
      return;
    }
    if (!isUuid(siteId)) {
      setApiError("Selected site reference is invalid.");
      showWarningAlert(
        "Invalid Site",
        "The selected site reference is invalid. Re-select or recreate the site.",
      );
      return;
    }
    if (!isUuid(routeId)) {
      setApiError("Selected route reference is invalid.");
      console.warn("[direct-sales] routeId is not UUID. Sending anyway.", {
        customerId,
        siteId,
        routeId,
      });
    }
    if (selectedSite.routeId) {
      showWarningAlert(
        "Route Already Assigned",
        "This site already has a route assigned.",
      );
      return;
    }

    setIsAssigningRoute(true);
    try {
      setApiError(null);
      console.log("[direct-sales] assigning route request payload", {
        customerId,
        siteId,
        routeId,
      });
      const response = await authenticatedFetch(
        `${API_BASE_URL}/customers/${encodeURIComponent(customerId)}/sites/${encodeURIComponent(siteId)}/route`,
        {
          method: "POST",
          headers: {
            "X-Driver-Id": driverId,
          },
          body: JSON.stringify({
            routeId,
          }),
        },
      );
      const result =
        await parseApiResponseWithSoftError<CustomerSite>(response);
      if (!result.ok) {
        setApiError(result.error);
        return;
      }

      const updatedSite = result.data;
      setCustomerData((prev) => {
        if (!prev) return prev;
        const nextSites = prev.sites.map((site) =>
          site.id === updatedSite.id ? updatedSite : site,
        );
        const nextCustomer = { ...prev, sites: nextSites };
        setCustomerSearchResults((customers) =>
          customers.map((customer) =>
            customer.id === nextCustomer.id ? nextCustomer : customer,
          ),
        );
        return nextCustomer;
      });
      applySelectedSite(updatedSite);
      setSelectedRouteId(updatedSite.routeId || routeId);

      const selectedRoute = todayRoutes.find(
        (route) => route.id === updatedSite.routeId,
      );
      showSuccessAlert(
        "Route Assigned",
        `Assigned ${selectedRoute?.label || "the selected route"} to this site.`,
      );
    } catch (error) {
      console.error("Error assigning route:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to assign route.",
      );
    } finally {
      setIsAssigningRoute(false);
    }
  }, [
    applySelectedSite,
    customerData,
    driverId,
    selectedRouteId,
    selectedSite,
    todayRoutes,
  ]);

  const getRouteLabelById = useCallback(
    (routeId: string | null | undefined) => {
      if (!routeId) return "Unassigned";
      const match = todayRoutes.find((route) => route.id === routeId);
      const label = match?.label?.trim();
      return label || "Assigned route";
    },
    [todayRoutes],
  );

  useEffect(() => {
    void fetchTodayRoutes();
  }, [fetchTodayRoutes]);

  useEffect(() => {
    const getLocation = async () => {
      try {
        const resolvedLocation = await resolveCurrentLocationForSite();
        setLocation({
          latitude: resolvedLocation.latitude,
          longitude: resolvedLocation.longitude,
          address: resolvedLocation.address,
        });
      } catch (error) {
        console.error("Error getting location:", error);
      }
    };
    getLocation();
  }, [directSaleResetCounter]);

  const getSelectableProductStock = useCallback(
    (product: ServerProduct) => {
      const parsedStock =
        parseStockNumber(product.loaded_quantity) ??
        parseStockNumber(product.available_stock);
      const stockLimit = parsedStock ?? getCoolerStockLimit(product);

      if (!Number.isFinite(stockLimit)) {
        return Infinity;
      }

      const stockGroupKey = getProductStockGroupKey(product);
      const reservedByOtherProducts = products.reduce((sum, entry) => {
        if (entry.id === product.id) return sum;
        if (getProductStockGroupKey(entry) !== stockGroupKey) return sum;
        return sum + Math.max(0, quantities[entry.id] || 0);
      }, 0);

      return Math.max(0, stockLimit - reservedByOtherProducts);
    },
    [products, quantities],
  );

  const handleChangeQuantity = useCallback(
    (product: ServerProduct, delta: number) => {
      const stockLimit = getSelectableProductStock(product);
      const current = quantities[product.id] || 0;
      const next = Math.max(0, current + delta);
      const capped = Number.isFinite(stockLimit)
        ? Math.min(next, stockLimit)
        : next;
      const blockedByStock =
        delta > 0 && Number.isFinite(stockLimit) && next > stockLimit;

      if (capped !== current) {
        if (directSaleDraft) {
          clearDirectSaleDownstreamDrafts({ clearProducts: false });
        }
        setQuantities((prev) => ({ ...prev, [product.id]: capped }));
      }

      if (blockedByStock) {
        showWarningAlert(
          "Stock limit reached",
          `${product.label} stock is limited to ${stockLimit}.`,
        );
      }
    },
    [
      clearDirectSaleDownstreamDrafts,
      directSaleDraft,
      getSelectableProductStock,
      quantities,
    ],
  );

  const selectedProducts = useMemo(() => {
    return products.filter((p) => (quantities[p.id] || 0) > 0);
  }, [products, quantities]);
  const productsForDraft = products;
  const transferableAssetProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.type === "assets" && !isTruckAssetSaleProduct(product),
        )
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
        ),
    [products],
  );
  const directSaleAssetOptions = useMemo<DirectSaleAssetOption[]>(() => {
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
        defaultAction: "deposit" as const,
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
      defaultAction: "deposit_return" as const,
      defaultPrice: 0,
    }));

    return [...productAssets, ...heldAssets];
  }, [heldItems.assets, transferableAssetProducts, truckAssets]);

  useEffect(() => {
    setAssetDrafts((previousDrafts) => {
      const nextDrafts: Record<string, DirectSaleAssetDraft> = {};

      directSaleAssetOptions.forEach((asset) => {
        const existingDraft = previousDrafts[asset.key];
        nextDrafts[asset.key] = {
          selected: existingDraft?.selected ?? false,
          price: existingDraft?.price ?? asset.defaultPrice.toFixed(2),
        };
      });

      return nextDrafts;
    });
  }, [directSaleAssetOptions]);

  const selectedAssetEntries = useMemo(
    () =>
      directSaleAssetOptions
        .map((asset) => {
          const draft = assetDrafts[asset.key];
          if (!draft?.selected) return null;

          const parsedPrice = Number(draft.price);
          return {
            ...asset,
            action: isReturnOnlyAsset(asset) ? "deposit_return" : "deposit",
            price: parsedPrice,
          };
        })
        .filter(
          (
            asset,
          ): asset is DirectSaleAssetOption & {
            action: DirectSaleAssetAction;
            price: number;
          } => asset !== null,
        ),
    [assetDrafts, directSaleAssetOptions],
  );
  const directSaleBottleOptions = useMemo<DirectSaleBottleReturnOption[]>(
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
  const directSaleBottleDepositOptions = useMemo<
    DirectSaleBottleDepositOption[]
  >(() => {
    const refillProductsById = new Map<string, ServerProduct>();
    products
      .filter((product) => product.type === "refill")
      .forEach((product) => {
        refillProductsById.set(product.itemId, product);
        refillProductsById.set(product.id, product);
      });

    return truckBulkItems.reduce<DirectSaleBottleDepositOption[]>(
      (options, bulkItem) => {
        const matchKeys = getTruckBulkItemMatchKeys(bulkItem);
        const refillProduct = matchKeys
          .map((key) => refillProductsById.get(key))
          .find((product): product is ServerProduct => Boolean(product));

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
      },
      [],
    );
  }, [products, truckBulkItems]);
  const heldAssetOptions = useMemo(
    () => directSaleAssetOptions.filter((asset) => asset.source === "held"),
    [directSaleAssetOptions],
  );
  const depositAssetOptions = useMemo(
    () => directSaleAssetOptions.filter((asset) => asset.source === "product"),
    [directSaleAssetOptions],
  );

  useEffect(() => {
    setBottleReturnQuantities((previousQuantities) => {
      const nextQuantities: Record<string, number> = {};

      directSaleBottleOptions.forEach((bottle) => {
        const previousQuantity = previousQuantities[bottle.key] ?? 0;
        nextQuantities[bottle.key] = Math.max(
          0,
          Math.min(previousQuantity, bottle.availableQuantity),
        );
      });

      return nextQuantities;
    });
  }, [directSaleBottleOptions]);

  useEffect(() => {
    setBottleDepositQuantities((previousQuantities) => {
      const nextQuantities: Record<string, number> = {};

      directSaleBottleDepositOptions.forEach((bottle) => {
        const previousQuantity = previousQuantities[bottle.key] ?? 0;
        nextQuantities[bottle.key] = Math.max(
          0,
          Math.min(previousQuantity, bottle.availableQuantity),
        );
      });

      return nextQuantities;
    });
  }, [directSaleBottleDepositOptions]);

  useEffect(() => {
    setBottleDepositPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};

      directSaleBottleDepositOptions.forEach((bottle) => {
        nextPrices[bottle.key] = previousPrices[bottle.key] ?? "0.00";
      });

      return nextPrices;
    });
  }, [directSaleBottleDepositOptions]);

  useEffect(() => {
    setBottleReturnPrices((previousPrices) => {
      const nextPrices: Record<string, string> = {};

      directSaleBottleOptions.forEach((bottle) => {
        nextPrices[bottle.key] = previousPrices[bottle.key] ?? "0.00";
      });

      return nextPrices;
    });
  }, [directSaleBottleOptions]);

  const selectedBottleReturnEntries = useMemo(
    () =>
      directSaleBottleOptions
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
          ): bottle is DirectSaleBottleReturnOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [bottleReturnPrices, bottleReturnQuantities, directSaleBottleOptions],
  );
  const selectedBottleDepositEntries = useMemo(
    () =>
      directSaleBottleDepositOptions
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
          ): bottle is DirectSaleBottleDepositOption & {
            quantity: number;
            priceDraft: string;
            unitPrice: number;
          } => bottle !== null,
        ),
    [
      bottleDepositPrices,
      bottleDepositQuantities,
      directSaleBottleDepositOptions,
    ],
  );

  const groupedProducts = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        const group = getProductGroup(product);
        acc[group].push(product);
        return acc;
      },
      {
        wholesale: [] as ServerProduct[],
        refill: [] as ServerProduct[],
        assets: [] as ServerProduct[],
        other: [] as ServerProduct[],
      },
    );
  }, [products]);

  const totalItems = useMemo(() => {
    const productCount = Object.values(quantities).reduce(
      (sum, q) => sum + q,
      0,
    );
    const bottleDepositCount = selectedBottleDepositEntries.reduce(
      (sum, bottle) => sum + bottle.quantity,
      0,
    );
    const bottleReturnCount = selectedBottleReturnEntries.reduce(
      (sum, bottle) => sum + bottle.quantity,
      0,
    );
    return (
      productCount +
      selectedAssetEntries.length +
      bottleDepositCount +
      bottleReturnCount
    );
  }, [
    quantities,
    selectedAssetEntries.length,
    selectedBottleDepositEntries,
    selectedBottleReturnEntries,
  ]);

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, product) => {
      return sum + product.pricePerUnit * (quantities[product.id] || 0);
    }, 0);
  }, [selectedProducts, quantities]);

  const vat = useMemo(() => subtotal * VAT_RATE, [subtotal]);
  const totalAmount = useMemo(() => subtotal + vat, [subtotal, vat]);
  const totalAssetActionValue = useMemo(() => {
    return selectedAssetEntries.reduce((sum, asset) => {
      return Number.isFinite(asset.price) ? sum + asset.price : sum;
    }, 0);
  }, [selectedAssetEntries]);
  const totalBottleDepositValue = useMemo(
    () =>
      selectedBottleDepositEntries.reduce((sum, bottle) => {
        return Number.isFinite(bottle.unitPrice)
          ? sum + bottle.unitPrice * bottle.quantity
          : sum;
      }, 0),
    [selectedBottleDepositEntries],
  );
  const totalBottleReturnValue = useMemo(
    () =>
      selectedBottleReturnEntries.reduce((sum, bottle) => {
        return Number.isFinite(bottle.unitPrice)
          ? sum + bottle.unitPrice * bottle.quantity
          : sum;
      }, 0),
    [selectedBottleReturnEntries],
  );
  const totalBottleReturnCount = useMemo(
    () =>
      selectedBottleReturnEntries.reduce(
        (sum, bottle) => sum + bottle.quantity,
        0,
      ),
    [selectedBottleReturnEntries],
  );
  const totalBottleDepositCount = useMemo(
    () =>
      selectedBottleDepositEntries.reduce(
        (sum, bottle) => sum + bottle.quantity,
        0,
      ),
    [selectedBottleDepositEntries],
  );
  const totalActionSelections = useMemo(
    () =>
      selectedAssetEntries.length +
      totalBottleDepositCount +
      totalBottleReturnCount,
    [
      selectedAssetEntries.length,
      totalBottleDepositCount,
      totalBottleReturnCount,
    ],
  );
  const parsedCreditCollectionAmount = useMemo(
    () => parseMoneyDraft(creditCollectionAmount),
    [creditCollectionAmount],
  );
  const hasCreditCollectionDraft = useMemo(
    () =>
      parsedCreditCollectionAmount !== null && parsedCreditCollectionAmount > 0,
    [parsedCreditCollectionAmount],
  );
  const actionSummaryText = useMemo(() => {
    const sentences: string[] = [];
    const parts: string[] = [];

    if (selectedAssetEntries.length > 0) {
      parts.push(
        `${selectedAssetEntries.length} asset action${selectedAssetEntries.length === 1 ? "" : "s"}`,
      );
    }

    if (totalBottleDepositCount > 0) {
      parts.push(
        `${totalBottleDepositCount} bottle deposit${totalBottleDepositCount === 1 ? "" : "s"}`,
      );
    }

    if (totalBottleReturnCount > 0) {
      parts.push(
        `${totalBottleReturnCount} bottle return${totalBottleReturnCount === 1 ? "" : "s"}`,
      );
    }

    if (parts.length > 0) {
      const summary =
        parts.length === 1
          ? parts[0]
          : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

      const recordedActionValue =
        totalAssetActionValue +
        totalBottleDepositValue +
        totalBottleReturnValue;

      sentences.push(
        `${summary} will be recorded outside the VAT total. Recorded movement value: AED ${recordedActionValue.toFixed(2)}.`,
      );
    }
    if (hasCreditCollectionDraft && parsedCreditCollectionAmount !== null) {
      sentences.push(
        `Credit collection recorded: AED ${parsedCreditCollectionAmount.toFixed(2)}.`,
      );
    }

    return sentences.join(" ");
  }, [
    hasCreditCollectionDraft,
    parsedCreditCollectionAmount,
    selectedAssetEntries.length,
    totalAssetActionValue,
    totalBottleDepositValue,
    totalBottleReturnValue,
    totalBottleDepositCount,
    totalBottleReturnCount,
  ]);
  const hasSaleProducts = useMemo(() => {
    return (
      groupedProducts.refill.length > 0 ||
      groupedProducts.wholesale.length > 0 ||
      groupedProducts.assets.length > 0 ||
      groupedProducts.other.length > 0
    );
  }, [groupedProducts]);
  const selectedSiteLabel = useMemo(() => {
    if (!customerData || !selectedSite) return null;
    const siteIndex = customerData.sites.findIndex(
      (site) => site.id === selectedSite.id,
    );
    return getSiteLabel(selectedSite, siteIndex >= 0 ? siteIndex : 0);
  }, [customerData, selectedSite]);
  const selectedSiteSubscriptions = useMemo(
    () => getSiteSubscriptions(selectedSite),
    [selectedSite],
  );
  const availableSubscriptionsByItemId = useMemo(() => {
    const map = new Map<string, AvailableSubscriptionItem>();
    availableSubscriptions.forEach((subscription) => {
      map.set(subscription.itemId, subscription);
    });
    return map;
  }, [availableSubscriptions]);
  const subscriptionModalItems = useMemo(() => {
    const itemsByItemId = new Map<string, AvailableSubscriptionItem>();
    availableSubscriptions.forEach((subscription) => {
      itemsByItemId.set(subscription.itemId, subscription);
    });
    selectedSiteSubscriptions.forEach((subscription) => {
      if (!itemsByItemId.has(subscription.itemId)) {
        itemsByItemId.set(
          subscription.itemId,
          buildFallbackSubscriptionItem(subscription),
        );
      }
    });
    return Array.from(itemsByItemId.values());
  }, [availableSubscriptions, selectedSiteSubscriptions]);
  const selectedSubscriptionSummaries = useMemo(
    () =>
      selectedSiteSubscriptions.map((subscription) => {
        const option = availableSubscriptionsByItemId.get(subscription.itemId);
        return {
          ...subscription,
          label:
            option?.label || `Subscription ${subscription.itemId.slice(0, 8)}`,
          unit: option?.unit || null,
        };
      }),
    [availableSubscriptionsByItemId, selectedSiteSubscriptions],
  );
  const selectedSubscriptionDraftCount = useMemo(
    () =>
      Object.values(subscriptionDrafts).filter((draft) => draft.selected)
        .length,
    [subscriptionDrafts],
  );

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
      const bottle = directSaleBottleOptions.find(
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
    [directSaleBottleOptions],
  );
  const handleChangeBottleReturnPrice = useCallback(
    (bottleKey: string, value: string) => {
      const sanitizedValue = sanitizeMoneyInput(value);
      setBottleReturnPrices((previousPrices) => ({
        ...previousPrices,
        [bottleKey]: sanitizedValue,
      }));
    },
    [],
  );
  const handleChangeBottleDepositQuantity = useCallback(
    (bottleKey: string, delta: number) => {
      const bottle = directSaleBottleDepositOptions.find(
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
    [directSaleBottleDepositOptions],
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
  const handleChangeCreditCollectionAmount = useCallback((value: string) => {
    setCreditCollectionAmount(sanitizeMoneyInput(value));
  }, []);

  const handleToggleSubscriptionDraft = useCallback((itemId: string) => {
    setSubscriptionDrafts((previousDrafts) => {
      const currentDraft = previousDrafts[itemId] || {
        selected: false,
        averageWeeklyQuantity: "",
      };
      const nextSelected = !currentDraft.selected;
      return {
        ...previousDrafts,
        [itemId]: {
          selected: nextSelected,
          averageWeeklyQuantity:
            currentDraft.averageWeeklyQuantity || (nextSelected ? "1" : ""),
        },
      };
    });
  }, []);

  const handleChangeSubscriptionQuantity = useCallback(
    (itemId: string, value: string) => {
      const sanitizedValue = sanitizeQuantityInput(value);
      setSubscriptionDrafts((previousDrafts) => {
        const currentDraft = previousDrafts[itemId] || {
          selected: true,
          averageWeeklyQuantity: "",
        };
        return {
          ...previousDrafts,
          [itemId]: {
            ...currentDraft,
            selected: true,
            averageWeeklyQuantity: sanitizedValue,
          },
        };
      });
    },
    [],
  );

  const handleAdjustSubscriptionQuantity = useCallback(
    (itemId: string, delta: number) => {
      setSubscriptionDrafts((previousDrafts) => {
        const currentDraft = previousDrafts[itemId] || {
          selected: true,
          averageWeeklyQuantity: "1",
        };
        const currentQuantity = toPriceValue(
          currentDraft.averageWeeklyQuantity,
        );
        const nextQuantity = Math.max(1, (currentQuantity || 0) + delta);
        return {
          ...previousDrafts,
          [itemId]: {
            selected: true,
            averageWeeklyQuantity: String(nextQuantity),
          },
        };
      });
    },
    [],
  );

  const saveSubscriptions = useCallback(async () => {
    if (!customerData || !selectedSite) {
      showWarningAlert(
        "Site Required",
        "Select a customer site before saving subscriptions.",
      );
      return;
    }

    const selectedSubscriptions = Object.entries(subscriptionDrafts)
      .filter(([, draft]) => draft.selected)
      .map(([itemId, draft]) => {
        const averageWeeklyQuantity = toPriceValue(draft.averageWeeklyQuantity);
        return {
          itemId,
          averageWeeklyQuantity:
            averageWeeklyQuantity === null
              ? Number.NaN
              : Number(averageWeeklyQuantity.toFixed(2)),
        };
      });

    if (selectedSubscriptions.length === 0) {
      showWarningAlert(
        "Subscription Required",
        "Select at least one refill item before saving.",
      );
      return;
    }

    const invalidSubscription = selectedSubscriptions.find(
      (subscription) =>
        !Number.isFinite(subscription.averageWeeklyQuantity) ||
        subscription.averageWeeklyQuantity <= 0,
    );
    if (invalidSubscription) {
      const option = availableSubscriptionsByItemId.get(
        invalidSubscription.itemId,
      );
      showWarningAlert(
        "Quantity Required",
        `Enter an average weekly quantity for ${option?.label || "the selected item"}.`,
      );
      return;
    }

    const startDate = subscriptionStartDate.trim();
    const endDate = subscriptionEndDate.trim();
    const parsedStartDate = startDate ? parseDateInput(startDate) : null;
    const parsedEndDate = endDate ? parseDateInput(endDate) : null;

    if (startDate && !parsedStartDate) {
      showWarningAlert("Invalid Date", "Start date must be YYYY-MM-DD.");
      return;
    }
    if (endDate && !parsedEndDate) {
      showWarningAlert("Invalid Date", "End date must be YYYY-MM-DD.");
      return;
    }
    if (
      parsedStartDate &&
      parsedEndDate &&
      parsedEndDate.getTime() < parsedStartDate.getTime()
    ) {
      showWarningAlert("Invalid Date", "End date cannot be before start date.");
      return;
    }

    const endpoint = `${API_BASE_URL}/customers/${encodeURIComponent(customerData.id)}/sites/${encodeURIComponent(selectedSite.id)}`;
    const hasDateFields = Boolean(startDate || endDate);
    const buildPayload = (includeDates: boolean) => ({
      subscriptions: selectedSubscriptions.map((subscription) => ({
        itemId: subscription.itemId,
        averageWeeklyQuantity: subscription.averageWeeklyQuantity,
        ...(includeDates && startDate ? { startDate } : {}),
        ...(includeDates && endDate ? { endDate } : {}),
      })),
    });

    const sendSaveRequest = async (includeDates: boolean) => {
      const response = await authenticatedFetch(endpoint, {
        method: "PATCH",
        body: JSON.stringify(buildPayload(includeDates)),
      });
      return parseApiResponseWithSoftError<CustomerSite>(response);
    };

    setIsSavingSubscriptions(true);
    try {
      setSubscriptionError(null);
      let savedWithDates = hasDateFields;
      let result = await sendSaveRequest(hasDateFields);

      if (!result.ok && hasDateFields) {
        savedWithDates = false;
        result = await sendSaveRequest(false);
      }

      if (!result.ok) {
        setSubscriptionError(result.error);
        return;
      }

      const responseSubscriptions = getSiteSubscriptions(result.data);
      const fallbackSubscriptions = buildPayload(savedWithDates).subscriptions;
      const savedSite: CustomerSite = {
        ...result.data,
        subscriptions:
          responseSubscriptions.length > 0
            ? responseSubscriptions
            : fallbackSubscriptions,
      };

      setCustomerData((prev) => {
        if (!prev) return prev;
        const nextSites = prev.sites.map((site) =>
          site.id === savedSite.id ? savedSite : site,
        );
        const nextCustomer = { ...prev, sites: nextSites };
        setCustomerSearchResults((customers) =>
          customers.map((customer) =>
            customer.id === nextCustomer.id ? nextCustomer : customer,
          ),
        );
        return nextCustomer;
      });
      setSelectedSite(savedSite);
      setSubscriptionModalVisible(false);
      showSuccessAlert(
        "Subscriptions Saved",
        savedWithDates || !hasDateFields
          ? "Customer subscriptions have been updated."
          : "Subscriptions saved. Date fields are not supported by the current API.",
      );
      void fetchProducts({ showLoading: false });
    } catch (error) {
      console.error("Error saving subscriptions:", error);
      setSubscriptionError(
        error instanceof Error
          ? error.message
          : "Failed to save subscriptions.",
      );
    } finally {
      setIsSavingSubscriptions(false);
    }
  }, [
    availableSubscriptionsByItemId,
    customerData,
    fetchProducts,
    selectedSite,
    subscriptionDrafts,
    subscriptionEndDate,
    subscriptionStartDate,
  ]);

  const renderSubscriptionOptionCard = (
    subscription: AvailableSubscriptionItem,
  ) => {
    const draft = subscriptionDrafts[subscription.itemId] || {
      selected: false,
      averageWeeklyQuantity: "",
    };
    const isSelected = draft.selected;

    return (
      <View
        key={subscription.itemId}
        style={[
          styles.subscriptionOptionCard,
          isSelected && styles.subscriptionOptionCardSelected,
        ]}
      >
        <View style={styles.subscriptionOptionTopRow}>
          <View
            style={[
              styles.subscriptionOptionIcon,
              isSelected && styles.subscriptionOptionIconSelected,
            ]}
          >
            {subscription.image_url ? (
              <Image
                source={{ uri: subscription.image_url }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="water-outline"
                size={18}
                color={isSelected ? "#FFFFFF" : "#0F766E"}
              />
            )}
          </View>

          <View style={styles.subscriptionOptionCopy}>
            <Text style={styles.subscriptionOptionTitle} numberOfLines={2}>
              {subscription.label}
            </Text>
            <Text style={styles.subscriptionOptionMeta} numberOfLines={1}>
              {subscription.unit || "Refill"} · AED{" "}
              {subscription.pricePerUnit.toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.subscriptionToggleButton,
              isSelected && styles.subscriptionToggleButtonActive,
            ]}
            onPress={() => handleToggleSubscriptionDraft(subscription.itemId)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isSelected ? "checkmark" : "add"}
              size={14}
              color={isSelected ? "#FFFFFF" : "#1D4ED8"}
            />
            <Text
              style={[
                styles.subscriptionToggleText,
                isSelected && styles.subscriptionToggleTextActive,
              ]}
            >
              {isSelected ? "Selected" : "Add"}
            </Text>
          </TouchableOpacity>
        </View>

        {isSelected ? (
          <View style={styles.subscriptionQuantityRow}>
            <View style={styles.subscriptionQuantityCopy}>
              <Text style={styles.subscriptionQuantityLabel}>
                Average weekly quantity
              </Text>
              <Text style={styles.subscriptionQuantityHint}>
                Per week estimate.
              </Text>
            </View>
            <View style={styles.subscriptionStepper}>
              <TouchableOpacity
                style={styles.subscriptionStepperButton}
                onPress={() =>
                  handleAdjustSubscriptionQuantity(subscription.itemId, -1)
                }
                activeOpacity={0.8}
              >
                <Ionicons name="remove" size={16} color="#0F766E" />
              </TouchableOpacity>
              <TextInput
                style={styles.subscriptionQuantityInput}
                value={draft.averageWeeklyQuantity}
                onChangeText={(value) =>
                  handleChangeSubscriptionQuantity(subscription.itemId, value)
                }
                placeholder="1"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.subscriptionStepperButton}
                onPress={() =>
                  handleAdjustSubscriptionQuantity(subscription.itemId, 1)
                }
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#0F766E" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const buildDirectSaleDraft = useCallback(
    (): DirectSaleDraft => ({
      products: productsForDraft,
      quantities,
      customerData,
      selectedSite,
      paymentMethod,
      checkDetails,
      remark,
      location,
      truckBulkItems,
      truckAssets,
      heldItems,
      assetDrafts,
      bottleDepositPrices,
      bottleDepositQuantities,
      bottleReturnPrices,
      bottleReturnQuantities,
      creditCollectionAmount,
      creditCollectionRemark,
    }),
    [
      assetDrafts,
      bottleDepositPrices,
      bottleDepositQuantities,
      bottleReturnPrices,
      bottleReturnQuantities,
      checkDetails,
      creditCollectionAmount,
      creditCollectionRemark,
      customerData,
      heldItems,
      location,
      paymentMethod,
      productsForDraft,
      quantities,
      remark,
      selectedSite,
      truckAssets,
      truckBulkItems,
    ],
  );

  const handleContinueToBottlesAssets = useCallback(() => {
    if (!customerData?.id) {
      showWarningAlert("Customer Required", "Select a customer first.");
      return;
    }

    setDirectSaleDraft(buildDirectSaleDraft());
    router.push({
      pathname: "/(root)/(tabs)/direct-sale-bottles-assets",
      params: { backTo: "direct-sales" },
    });
  }, [buildDirectSaleDraft, customerData?.id, router, setDirectSaleDraft]);

  const selectedCustomerWalletBalance = getCustomerWalletBalance(customerData);

  const renderProductCard = (
    product: ServerProduct,
    index: number,
    group: ProductGroup,
  ) => {
    const assetTitle = group === "assets" ? getAssetProductTitle(product) : "";
    const assetDetail =
      group === "assets" ? getAssetProductDetail(product) : "";
    const quantity = quantities[product.id] || 0;
    const isSelected = quantity > 0;
    const stockLimit = getSelectableProductStock(product);
    const hasStockLimit = Number.isFinite(stockLimit);
    const isMaxStock = hasStockLimit && quantity >= stockLimit;
    const groupCardStyle =
      group === "refill"
        ? styles.productCardRefill
        : group === "wholesale"
          ? styles.productCardWholesale
          : group === "assets"
            ? styles.productCardAssets
            : styles.productCardOther;
    const unitPrice = product.pricePerUnit;

    const displayPrice = product.originalPrice ? (
      <View style={styles.priceContainer}>
        <Text style={styles.productPriceOriginal}>
          AED {product.originalPrice.toFixed(2)}
        </Text>
        <Text style={styles.productPrice}>AED {unitPrice.toFixed(2)}</Text>
      </View>
    ) : (
      <Text style={styles.productPrice}>AED {unitPrice.toFixed(2)}</Text>
    );

    return (
      <View
        key={`${product.id}-${group}-${index}`}
        style={[
          styles.productCard,
          groupCardStyle,
          isSelected && styles.productCardSelected,
        ]}
      >
        <View style={styles.productMain}>
          <View
            style={[
              styles.productIconBox,
              isSelected && styles.productIconBoxSelected,
            ]}
          >
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={getProductIconName(product.type)}
                size={18}
                color={isSelected ? "#FFFFFF" : "#1D4ED8"}
              />
            )}
          </View>

          <View style={styles.productInfo}>
            <View style={styles.productNameContainer}>
              <Text style={styles.productName} numberOfLines={2}>
                {assetTitle || product.label}
              </Text>
              {product.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{product.badge}</Text>
                </View>
              )}
            </View>
            {group === "assets" && assetDetail ? (
              <Text style={styles.productAssetIdText} numberOfLines={1}>
                {assetDetail}
              </Text>
            ) : null}
            <Text style={styles.productMetaText}>
              {group === "refill"
                ? "Refill item"
                : group === "wholesale"
                  ? isEmptyBottleSaleProduct(product)
                    ? "Empty bottle"
                    : "Retail item"
                  : group === "assets"
                    ? "Asset item"
                    : "Other product"}
              {product.unit ? ` - ${product.unit}` : ""}
            </Text>
            {displayPrice}
            {hasStockLimit && (
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>Stock: {stockLimit}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              quantity === 0 && styles.quantityButtonDisabled,
            ]}
            onPress={() => handleChangeQuantity(product, -1)}
            disabled={quantity === 0}
          >
            <Ionicons
              name="remove"
              size={18}
              color={quantity === 0 ? "#CBD5E1" : "#1E40AF"}
            />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{quantity}</Text>

          <TouchableOpacity
            style={[
              styles.quantityButton,
              isMaxStock && styles.quantityButtonDisabled,
            ]}
            onPress={() => handleChangeQuantity(product, 1)}
            disabled={isMaxStock}
          >
            <Ionicons
              name="add"
              size={18}
              color={isMaxStock ? "#CBD5E1" : "#1E40AF"}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAssetActionCard = (asset: DirectSaleAssetOption) => {
    const draft = assetDrafts[asset.key] || {
      selected: false,
      price: asset.defaultPrice.toFixed(2),
    };
    const isSelected = draft.selected;
    const isHeldAsset = isReturnOnlyAsset(asset);
    const imageUrl = asset.imageUrl;
    const assetTitle = getAssetOptionTitle(asset);
    const assetDetail = getAssetOptionDetail(asset);

    return (
      <View
        key={asset.key}
        style={[
          styles.assetActionCard,
          isHeldAsset
            ? styles.assetActionCardHeld
            : styles.assetActionCardTruck,
          isSelected && styles.assetActionCardSelected,
          isSelected &&
            (isHeldAsset
              ? styles.assetActionCardSelectedHeld
              : styles.assetActionCardSelectedTruck),
        ]}
      >
        <View style={styles.assetActionTopRow}>
          <View style={styles.assetActionMedia}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.assetActionImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="cube-outline"
                size={18}
                color={isSelected ? "#FFFFFF" : "#1D4ED8"}
              />
            )}
          </View>

          <View style={styles.assetActionContent}>
            <View style={styles.assetActionHeaderRow}>
              <Text style={styles.assetActionLabel} numberOfLines={2}>
                {assetTitle}
              </Text>
              <View
                style={[
                  styles.assetActionRuleBadge,
                  isHeldAsset
                    ? styles.assetActionRuleBadgeHeld
                    : styles.assetActionRuleBadgeDeposit,
                ]}
              >
                <Ionicons
                  name={
                    isHeldAsset
                      ? "return-up-back-outline"
                      : "arrow-forward-outline"
                  }
                  size={12}
                  color={isHeldAsset ? "#047857" : "#6D28D9"}
                />
                <Text
                  style={[
                    styles.assetActionRuleText,
                    isHeldAsset
                      ? styles.assetActionRuleTextHeld
                      : styles.assetActionRuleTextDeposit,
                  ]}
                >
                  {isHeldAsset ? "Return" : "Deposit"}
                </Text>
              </View>
            </View>
            {assetDetail ? (
              <Text style={styles.assetActionDetail} numberOfLines={1}>
                {assetDetail}
              </Text>
            ) : null}

            <View style={styles.modalActionMetaRow}>
              <View
                style={[
                  styles.modalActionMetaPill,
                  asset.source === "held"
                    ? styles.modalActionMetaPillHeld
                    : styles.assetSourceBadgeTruck,
                ]}
              >
                <Text
                  style={[
                    styles.modalActionMetaPillText,
                    asset.source === "held"
                      ? styles.modalActionMetaPillTextHeld
                      : styles.assetSourceBadgeTextTruck,
                  ]}
                >
                  {getAssetSourceLabel(asset.source)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.assetActionControls}>
          <View style={styles.assetActionFooterRow}>
            <View style={styles.assetPriceEditor}>
              <Text style={styles.assetPriceLabel}>Value</Text>
              <View style={styles.assetPriceInputRow}>
                <Text style={styles.assetPricePrefix}>AED</Text>
                <TextInput
                  style={styles.assetPriceInput}
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
                styles.assetIncludeButton,
                isSelected && styles.assetIncludeButtonActive,
              ]}
              onPress={() => handleToggleAssetSelection(asset.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isSelected ? "checkmark-circle" : "add-circle-outline"}
                size={16}
                color={isSelected ? "#FFFFFF" : "#1D4ED8"}
              />
              <Text
                style={[
                  styles.assetIncludeButtonText,
                  isSelected && styles.assetIncludeButtonTextActive,
                ]}
              >
                {isSelected ? "Added" : "Add"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };
  const renderBottleDepositCard = (bottle: DirectSaleBottleDepositOption) => {
    const quantity = bottleDepositQuantities[bottle.key] ?? 0;
    const price = bottleDepositPrices[bottle.key] ?? "0.00";
    const isSelected = quantity > 0;
    const isMaxQuantity = quantity >= bottle.availableQuantity;

    return (
      <View
        key={bottle.key}
        style={[
          styles.productCard,
          styles.productCardRefill,
          styles.modalActionCardCompact,
          styles.modalActionCardStacked,
          isSelected && styles.bottleDepositCardSelected,
        ]}
      >
        <View style={[styles.productMain, styles.modalActionMainCompact]}>
          <View
            style={[
              styles.productIconBox,
              styles.modalActionIconBoxCompact,
              isSelected && styles.bottleDepositIconBoxSelected,
            ]}
          >
            {bottle.imageUrl ? (
              <Image
                source={{ uri: bottle.imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="water-outline"
                size={18}
                color={isSelected ? "#FFFFFF" : "#0286FF"}
              />
            )}
          </View>

          <View style={styles.productInfo}>
            <View style={styles.modalActionTitleRow}>
              <Text style={styles.modalActionTitle} numberOfLines={2}>
                {bottle.label}
              </Text>
              <View style={styles.bottleDepositBadge}>
                <Text style={styles.bottleDepositBadgeText}>Deposit</Text>
              </View>
            </View>

            <View style={styles.modalActionMetaRow}>
              <View style={styles.modalActionMetaPill}>
                <Text style={styles.modalActionMetaPillText}>On truck</Text>
              </View>
              {bottle.unit ? (
                <View style={styles.modalActionMetaPill}>
                  <Text style={styles.modalActionMetaPillText}>
                    {bottle.unit}
                  </Text>
                </View>
              ) : null}
              <View style={styles.modalActionMetaPill}>
                <Text style={styles.modalActionMetaPillText}>
                  Avail {bottle.availableQuantity}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.assetActionControls}>
          <View style={styles.assetActionFooterRow}>
            <View style={styles.assetPriceEditor}>
              <Text style={styles.assetPriceLabel}>Value</Text>
              <View style={styles.assetPriceInputRow}>
                <Text style={styles.assetPricePrefix}>AED</Text>
                <TextInput
                  style={styles.assetPriceInput}
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

            <View
              style={[
                styles.quantityControl,
                styles.modalActionQuantityControlCompact,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  styles.modalActionQuantityButtonCompact,
                  quantity === 0 && styles.quantityButtonDisabled,
                ]}
                onPress={() =>
                  handleChangeBottleDepositQuantity(bottle.key, -1)
                }
                disabled={quantity === 0}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={quantity === 0 ? "#CBD5E1" : "#0286FF"}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.quantityText,
                  styles.modalActionQuantityTextCompact,
                ]}
              >
                {quantity}
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  styles.modalActionQuantityButtonCompact,
                  isMaxQuantity && styles.quantityButtonDisabled,
                ]}
                onPress={() => handleChangeBottleDepositQuantity(bottle.key, 1)}
                disabled={isMaxQuantity}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={isMaxQuantity ? "#CBD5E1" : "#0286FF"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };
  const renderBottleReturnCard = (bottle: DirectSaleBottleReturnOption) => {
    const quantity = bottleReturnQuantities[bottle.key] ?? 0;
    const price = bottleReturnPrices[bottle.key] ?? "0.00";
    const isSelected = quantity > 0;
    const isMaxQuantity = quantity >= bottle.availableQuantity;

    return (
      <View
        key={bottle.key}
        style={[
          styles.productCard,
          styles.productCardRefill,
          styles.modalActionCardCompact,
          isSelected && styles.bottleReturnCardSelected,
        ]}
      >
        <View style={[styles.productMain, styles.modalActionMainCompact]}>
          <View
            style={[
              styles.productIconBox,
              styles.modalActionIconBoxCompact,
              isSelected && styles.productIconBoxSelected,
            ]}
          >
            {bottle.imageUrl ? (
              <Image
                source={{ uri: bottle.imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="water-outline"
                size={18}
                color={isSelected ? "#FFFFFF" : "#0F766E"}
              />
            )}
          </View>

          <View style={styles.productInfo}>
            <View style={styles.modalActionTitleRow}>
              <Text style={styles.modalActionTitle} numberOfLines={2}>
                {bottle.label}
              </Text>
              <View style={styles.bottleReturnBadge}>
                <Text style={styles.bottleReturnBadgeText}>Return</Text>
              </View>
            </View>

            <View style={styles.modalActionMetaRow}>
              <View
                style={[
                  styles.modalActionMetaPill,
                  styles.modalActionMetaPillHeld,
                ]}
              >
                <Text
                  style={[
                    styles.modalActionMetaPillText,
                    styles.modalActionMetaPillTextHeld,
                  ]}
                >
                  Held
                </Text>
              </View>
              {bottle.unit ? (
                <View style={styles.modalActionMetaPill}>
                  <Text style={styles.modalActionMetaPillText}>
                    {bottle.unit}
                  </Text>
                </View>
              ) : null}
              <View style={styles.modalActionMetaPill}>
                <Text style={styles.modalActionMetaPillText}>
                  Held {bottle.availableQuantity}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.assetActionControls}>
          <View style={styles.assetActionFooterRow}>
            <View style={styles.assetPriceEditor}>
              <Text style={styles.assetPriceLabel}>Value</Text>
              <View style={styles.assetPriceInputRow}>
                <Text style={styles.assetPricePrefix}>AED</Text>
                <TextInput
                  style={styles.assetPriceInput}
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

            <View
              style={[
                styles.quantityControl,
                styles.modalActionQuantityControlCompact,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  styles.modalActionQuantityButtonCompact,
                  quantity === 0 && styles.quantityButtonDisabled,
                ]}
                onPress={() => handleChangeBottleReturnQuantity(bottle.key, -1)}
                disabled={quantity === 0}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={quantity === 0 ? "#CBD5E1" : "#0F766E"}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.quantityText,
                  styles.modalActionQuantityTextCompact,
                ]}
              >
                {quantity}
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  styles.modalActionQuantityButtonCompact,
                  isMaxQuantity && styles.quantityButtonDisabled,
                ]}
                onPress={() => handleChangeBottleReturnQuantity(bottle.key, 1)}
                disabled={isMaxQuantity}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={isMaxQuantity ? "#CBD5E1" : "#0F766E"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ApiErrorText error={apiError} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Sale</Text>
          {location && (
            <View style={styles.locationBadge}>
              <Ionicons name="location" size={12} color="#10B981" />
              <Text style={styles.locationText} numberOfLines={1}>
                {location.address}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {totalItems > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartCount}>{totalItems}</Text>
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshingProducts}
              onRefresh={handleRefreshProducts}
              tintColor="#1E40AF"
              colors={["#1E40AF"]}
            />
          }
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>

            <View style={styles.customerActionsRow}>
              <TouchableOpacity
                style={styles.customerActionButton}
                onPress={openSearchCustomerModal}
                activeOpacity={0.8}
              >
                <Ionicons name="search" size={14} color="#FFFFFF" />
                <Text style={styles.customerActionButtonText}>
                  Search Customer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.customerActionButton,
                  styles.customerCreateButton,
                ]}
                onPress={openCreateCustomerModal}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={14} color="#1E40AF" />
                <Text
                  style={[
                    styles.customerActionButtonText,
                    styles.customerCreateButtonText,
                  ]}
                >
                  Create Customer
                </Text>
              </TouchableOpacity>
            </View>

            {customerData ? (
              <View style={styles.selectedCustomerCard}>
                <View style={styles.selectedCustomerTopRow}>
                  <View style={styles.selectedCustomerCopy}>
                    <Text style={styles.selectedCustomerName}>
                      {customerData.name}
                    </Text>
                    <Text style={styles.selectedCustomerMeta}>
                      {customerData.phone}
                    </Text>
                    <View style={styles.customerBalanceRow}>
                      <Ionicons
                        name={
                          selectedCustomerWalletBalance < 0
                            ? "alert-circle-outline"
                            : "wallet-outline"
                        }
                        size={13}
                        color={
                          selectedCustomerWalletBalance < 0
                            ? "#DC2626"
                            : "#0F766E"
                        }
                      />
                      <Text
                        style={[
                          styles.customerBalanceText,
                          selectedCustomerWalletBalance < 0
                            ? styles.customerBalanceNegative
                            : styles.customerBalancePositive,
                        ]}
                      >
                        {formatCustomerWalletBalance(
                          selectedCustomerWalletBalance,
                        )}
                      </Text>
                    </View>
                    <Text style={styles.selectedCustomerMeta}>
                      {customerData.sites.length} site
                      {customerData.sites.length === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.selectedCustomerMeta} numberOfLines={1}>
                      Site:{" "}
                      {selectedSiteLabel ||
                        (customerData.sites.length > 0
                          ? "Not selected yet"
                          : "Not added yet")}
                    </Text>
                    <Text style={styles.selectedCustomerMeta} numberOfLines={1}>
                      Route:{" "}
                      {selectedSite
                        ? getRouteLabelById(selectedSite.routeId)
                        : "Unassigned"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.manageCustomerButton}
                    onPress={openManageCustomerModal}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={14}
                      color="#1E40AF"
                    />
                    <Text style={styles.manageCustomerButtonText}>Manage</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.customerPlaceholderCard}>
                <Ionicons
                  name="person-circle-outline"
                  size={28}
                  color="#94A3B8"
                />
                <Text style={styles.customerPlaceholderTitle}>
                  No customer selected
                </Text>
                <Text style={styles.customerPlaceholderText}>
                  Search an existing customer or create a new one before
                  confirming the sale.
                </Text>
              </View>
            )}
          </View>

          {customerData ? (
            <View style={styles.section}>
              <View style={styles.subscriptionLauncherPanel}>
                <TouchableOpacity
                  style={[
                    styles.subscriptionLauncherButton,
                    !selectedSite && styles.subscriptionLauncherButtonDisabled,
                  ]}
                  onPress={openSubscriptionModal}
                  activeOpacity={0.86}
                >
                  <View style={styles.subscriptionLauncherIcon}>
                    <Ionicons name="repeat-outline" size={18} color="#0F766E" />
                  </View>
                  <View style={styles.subscriptionLauncherCopy}>
                    <Text style={styles.subscriptionLauncherTitle}>
                      Subscriptions
                    </Text>
                    <Text
                      style={styles.subscriptionLauncherText}
                      numberOfLines={1}
                    >
                      {selectedSite
                        ? selectedSiteSubscriptions.length > 0
                          ? `${selectedSiteSubscriptions.length} active on this site`
                          : "No active subscription on this site"
                        : "Select a site first"}
                    </Text>
                  </View>
                  <View style={styles.subscriptionLauncherAction}>
                    <Text style={styles.subscriptionLauncherActionText}>
                      {selectedSiteSubscriptions.length > 0 ? "Edit" : "Create"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#1D4ED8"
                    />
                  </View>
                </TouchableOpacity>

                {selectedSubscriptionSummaries.length > 0 ? (
                  <View style={styles.subscriptionSummaryList}>
                    {selectedSubscriptionSummaries.map((subscription) => (
                      <View
                        key={subscription.itemId}
                        style={styles.subscriptionSummaryChip}
                      >
                        <Ionicons
                          name="water-outline"
                          size={13}
                          color="#0F766E"
                        />
                        <Text
                          style={styles.subscriptionSummaryText}
                          numberOfLines={1}
                        >
                          {subscription.label}
                        </Text>
                        <Text style={styles.subscriptionSummaryQty}>
                          {formatSubscriptionQuantity(
                            subscription.averageWeeklyQuantity,
                          )}
                          /wk
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setIsRemarkExpanded((value) => !value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.sectionTitle, styles.collapsibleTitle]}>
                Remark (Optional)
              </Text>
              <View style={styles.collapsibleHeaderRight}>
                <Text style={styles.collapsibleHeaderText}>
                  {isRemarkExpanded ? "Hide" : remark.trim() ? "Edit" : "Add"}
                </Text>
                <Ionicons
                  name={isRemarkExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#64748B"
                />
              </View>
            </TouchableOpacity>

            {isRemarkExpanded ? (
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Add a note for this sale"
                  placeholderTextColor="#CBD5E1"
                  value={remark}
                  onChangeText={setRemark}
                />
              </View>
            ) : remark.trim() ? (
              <Text style={styles.remarkPreview}>{remark.trim()}</Text>
            ) : null}
          </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.paymentContainer}>
              {/* Top Row: Cash, Wallet */}
              <View style={styles.paymentRow}>
                {PAYMENT_METHODS.filter((m) =>
                  ["cash", "wallet"].includes(m.id),
                ).map((method) => {
                  const isDisabled = false;
                  return (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionTop,
                        paymentMethod === method.id &&
                          styles.paymentOptionActive,
                        isDisabled && styles.paymentOptionDisabled,
                      ]}
                      onPress={() =>
                        !isDisabled &&
                        setPaymentMethod(method.id as typeof paymentMethod)
                      }
                      disabled={isDisabled}
                      activeOpacity={isDisabled ? 1 : 0.7}
                    >
                      <View
                        style={[
                          styles.paymentIconBox,
                          paymentMethod === method.id &&
                            styles.paymentIconBoxActive,
                          isDisabled && styles.paymentIconBoxDisabled,
                        ]}
                      >
                        <Ionicons
                          name={method.icon}
                          size={22}
                          color={
                            isDisabled
                              ? "#CBD5E1"
                              : paymentMethod === method.id
                                ? "#FFFFFF"
                                : "#94A3B8"
                          }
                        />
                      </View>
                      <Text
                        style={[
                          styles.paymentLabel,
                          paymentMethod === method.id &&
                            styles.paymentLabelActive,
                          isDisabled && styles.paymentLabelDisabled,
                        ]}
                      >
                        {method.label}
                      </Text>
                      {paymentMethod === method.id && !isDisabled && (
                        <View style={styles.paymentCheck}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#10B981"
                          />
                        </View>
                      )}
                      {isDisabled && (
                        <View style={styles.paymentDisabledBadge}>
                          <Text style={styles.paymentDisabledText}>
                            Not Available
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Bottom Row: Check, Credit */}
              <View style={[styles.paymentRow, styles.paymentRowBottom]}>
                {PAYMENT_METHODS.filter((m) =>
                  ["check", "credit"].includes(m.id),
                ).map((method) => {
                  const isDisabled = false;
                  return (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionBottom,
                        paymentMethod === method.id &&
                          styles.paymentOptionActive,
                        isDisabled && styles.paymentOptionDisabled,
                      ]}
                      onPress={() =>
                        !isDisabled &&
                        setPaymentMethod(method.id as typeof paymentMethod)
                      }
                      disabled={isDisabled}
                      activeOpacity={isDisabled ? 1 : 0.7}
                    >
                      <View
                        style={[
                          styles.paymentIconBox,
                          paymentMethod === method.id &&
                            styles.paymentIconBoxActive,
                          isDisabled && styles.paymentIconBoxDisabled,
                        ]}
                      >
                        <Ionicons
                          name={method.icon}
                          size={22}
                          color={
                            isDisabled
                              ? "#CBD5E1"
                              : paymentMethod === method.id
                                ? "#FFFFFF"
                                : "#94A3B8"
                          }
                        />
                      </View>
                      <Text
                        style={[
                          styles.paymentLabel,
                          paymentMethod === method.id &&
                            styles.paymentLabelActive,
                          isDisabled && styles.paymentLabelDisabled,
                        ]}
                      >
                        {method.label}
                      </Text>
                      {paymentMethod === method.id && !isDisabled && (
                        <View style={styles.paymentCheck}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#10B981"
                          />
                        </View>
                      )}
                      {isDisabled && (
                        <View style={styles.paymentDisabledBadge}>
                          <Text style={styles.paymentDisabledText}>
                            Not Available
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {paymentMethod === "check" ? (
              <View style={styles.siteFormCard}>
                <Text style={styles.siteFormTitle}>Check Details</Text>
                <View style={styles.siteInputRow}>
                  <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color="#94A3B8"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Check number"
                      placeholderTextColor="#CBD5E1"
                      value={checkDetails.checkNumber}
                      onChangeText={(value) =>
                        setCheckDetails((prev) => ({
                          ...prev,
                          checkNumber: value,
                        }))
                      }
                    />
                  </View>
                  <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color="#94A3B8"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#CBD5E1"
                      value={checkDetails.checkDate}
                      onChangeText={(value) =>
                        setCheckDetails((prev) => ({
                          ...prev,
                          checkDate: value,
                        }))
                      }
                    />
                  </View>
                </View>
                <View style={[styles.siteInputRow, { marginTop: 10 }]}>
                  <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color="#94A3B8"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Bank name"
                      placeholderTextColor="#CBD5E1"
                      value={checkDetails.bankName}
                      onChangeText={(value) =>
                        setCheckDetails((prev) => ({
                          ...prev,
                          bankName: value,
                        }))
                      }
                    />
                  </View>
                  <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                    <Ionicons
                      name="card-outline"
                      size={18}
                      color="#94A3B8"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Account number"
                      placeholderTextColor="#CBD5E1"
                      value={checkDetails.accountNumber}
                      onChangeText={(value) =>
                        setCheckDetails((prev) => ({
                          ...prev,
                          accountNumber: value,
                        }))
                      }
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {/* Products */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Products</Text>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1E40AF" />
              </View>
            ) : (
              <View style={styles.productsSections}>
                {!hasSaleProducts &&
                directSaleAssetOptions.length === 0 &&
                directSaleBottleOptions.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="cube-outline" size={48} color="#E2E8F0" />
                    <Text style={styles.emptyText}>No products available</Text>
                  </View>
                ) : null}

                {groupedProducts.refill.length > 0 ? (
                  <View style={styles.productCategorySection}>
                    <View style={styles.productCategoryHeader}>
                      <View
                        style={[
                          styles.productCategoryBadge,
                          styles.productCategoryBadgeRefill,
                        ]}
                      >
                        <Ionicons
                          name="water-outline"
                          size={14}
                          color="#0C4A6E"
                        />
                        <Text style={styles.productCategoryTitle}>Refill</Text>
                      </View>
                      <View style={styles.productCategoryCountBadge}>
                        <Text style={styles.productCategoryCount}>
                          {groupedProducts.refill.length}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.productGrid}>
                      {groupedProducts.refill.map((product, index) =>
                        renderProductCard(product, index, "refill"),
                      )}
                    </View>
                  </View>
                ) : null}

                {groupedProducts.wholesale.length > 0 ? (
                  <View style={styles.productCategorySection}>
                    <View style={styles.productCategoryHeader}>
                      <View
                        style={[
                          styles.productCategoryBadge,
                          styles.productCategoryBadgeWholesale,
                        ]}
                      >
                        <Ionicons
                          name="storefront-outline"
                          size={14}
                          color="#1E40AF"
                        />
                        <Text style={styles.productCategoryTitle}>Retail</Text>
                      </View>
                      <View style={styles.productCategoryCountBadge}>
                        <Text style={styles.productCategoryCount}>
                          {groupedProducts.wholesale.length}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.productGrid}>
                      {groupedProducts.wholesale.map((product, index) =>
                        renderProductCard(product, index, "wholesale"),
                      )}
                    </View>
                  </View>
                ) : null}

                {groupedProducts.assets.length > 0 ? (
                  <View style={styles.productCategorySection}>
                    <View style={styles.productCategoryHeader}>
                      <View
                        style={[
                          styles.productCategoryBadge,
                          styles.productCategoryBadgeAssets,
                        ]}
                      >
                        <Ionicons
                          name="cube-outline"
                          size={14}
                          color="#6D28D9"
                        />
                        <Text style={styles.productCategoryTitle}>Assets</Text>
                      </View>
                      <View style={styles.productCategoryCountBadge}>
                        <Text style={styles.productCategoryCount}>
                          {groupedProducts.assets.length}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.productGrid}>
                      {groupedProducts.assets.map((product, index) =>
                        renderProductCard(product, index, "assets"),
                      )}
                    </View>
                  </View>
                ) : null}

                {groupedProducts.other.length > 0 ? (
                  <View style={styles.productCategorySection}>
                    <View style={styles.productCategoryHeader}>
                      <View
                        style={[
                          styles.productCategoryBadge,
                          styles.productCategoryBadgeOther,
                        ]}
                      >
                        <Ionicons
                          name="cube-outline"
                          size={14}
                          color="#475569"
                        />
                        <Text style={styles.productCategoryTitle}>
                          Other Products
                        </Text>
                      </View>
                      <View style={styles.productCategoryCountBadge}>
                        <Text style={styles.productCategoryCount}>
                          {groupedProducts.other.length}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.productGrid}>
                      {groupedProducts.other.map((product, index) =>
                        renderProductCard(product, index, "other"),
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* Action Section */}
          <View style={styles.actionSection}>
            {/* Summary */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>
                  AED {subtotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>VAT (5%)</Text>
                <Text style={styles.summaryValue}>AED {vat.toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  AED {totalAmount.toFixed(2)}
                </Text>
              </View>
              {actionSummaryText ? (
                <Text style={styles.summaryNote}>{actionSummaryText}</Text>
              ) : null}
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !customerData?.id && styles.confirmButtonDisabled,
              ]}
              onPress={handleContinueToBottlesAssets}
              disabled={!customerData?.id}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>Bottles & Assets</Text>
              <View style={styles.confirmArrow}>
                <Ionicons name="arrow-forward" size={18} color="#1E40AF" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionModal
        visible={assetActionsModalVisible}
        title="Bottles & Assets"
        onClose={() => setAssetActionsModalVisible(false)}
        topInset={insets.top}
        bottomInset={insets.bottom}
      >
        <ScrollView
          style={styles.modalResultsList}
          contentContainerStyle={styles.assetActionsModalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.assetActionsIntroCard}>
            <Text style={styles.assetActionsIntroTitle}>
              Separate from billed items
            </Text>
            <Text style={styles.assetActionsIntroText}>
              Returns first. Deposits second.
            </Text>
          </View>

          <View style={styles.assetActionsSummaryRow}>
            <View style={styles.assetLauncherChip}>
              <Text style={styles.assetLauncherChipText}>
                {directSaleBottleOptions.length + heldAssetOptions.length}{" "}
                return
                {directSaleBottleOptions.length + heldAssetOptions.length === 1
                  ? ""
                  : "s"}
              </Text>
            </View>
            <View style={styles.assetLauncherChip}>
              <Text style={styles.assetLauncherChipText}>
                {directSaleBottleDepositOptions.length} bottle deposit
                {directSaleBottleDepositOptions.length === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.assetLauncherChip}>
              <Text style={styles.assetLauncherChipText}>
                {depositAssetOptions.length} asset deposit
                {depositAssetOptions.length === 1 ? "" : "s"}
              </Text>
            </View>
            {totalActionSelections > 0 ? (
              <View
                style={[
                  styles.assetLauncherChip,
                  styles.assetLauncherChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.assetLauncherChipText,
                    styles.assetLauncherChipTextSelected,
                  ]}
                >
                  {totalActionSelections} selected
                </Text>
              </View>
            ) : null}
            {hasCreditCollectionDraft ? (
              <View
                style={[
                  styles.assetLauncherChip,
                  styles.assetLauncherChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.assetLauncherChipText,
                    styles.assetLauncherChipTextSelected,
                  ]}
                >
                  credit collection set
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.creditCollectionCard}>
            <View style={styles.creditCollectionHeader}>
              <Text style={styles.creditCollectionTitle}>
                Credit Collection
              </Text>
              <Text style={styles.creditCollectionText}>
                Record any recovered balance on this stop.
              </Text>
            </View>

            <View style={styles.creditCollectionFields}>
              <View style={styles.creditCollectionField}>
                <Text style={styles.creditCollectionLabel}>Amount</Text>
                <View style={styles.assetPriceInputRow}>
                  <Text style={styles.assetPricePrefix}>AED</Text>
                  <TextInput
                    style={styles.assetPriceInput}
                    value={creditCollectionAmount}
                    onChangeText={handleChangeCreditCollectionAmount}
                    placeholder="0.00"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.creditCollectionField}>
                <Text style={styles.creditCollectionLabel}>Remark</Text>
                <TextInput
                  style={styles.creditCollectionRemarkInput}
                  value={creditCollectionRemark}
                  onChangeText={setCreditCollectionRemark}
                  placeholder="Reference or note"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          </View>

          <View style={styles.assetActionsSection}>
            <View style={styles.assetActionsSectionHeader}>
              <View style={styles.assetReturnBadge}>
                <Ionicons
                  name="return-up-back-outline"
                  size={14}
                  color="#0F766E"
                />
                <Text style={styles.assetReturnBadgeText}>Returns</Text>
              </View>
              <View style={styles.productCategoryCountBadge}>
                <Text style={styles.productCategoryCount}>
                  {directSaleBottleOptions.length + heldAssetOptions.length}
                </Text>
              </View>
            </View>

            <Text style={styles.assetSectionHelperText}>
              {customerData
                ? "Collected on this stop."
                : "Select a customer to load returns."}
            </Text>

            {directSaleBottleOptions.length === 0 &&
            heldAssetOptions.length === 0 &&
            !heldItemsError &&
            customerData ? (
              <View style={styles.heldItemsInfoCard}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={16}
                  color="#0F766E"
                />
                <Text style={styles.heldItemsInfoText}>
                  No held returns for this customer.
                </Text>
              </View>
            ) : null}

            <View style={styles.assetActionSubsection}>
              <Text style={styles.assetActionSubsectionTitle}>
                Bottle Returns
              </Text>
              <Text style={styles.assetActionSubsectionText}>
                Customer-held bottles.
              </Text>

              {directSaleBottleOptions.length > 0 ? (
                <View style={styles.productGrid}>
                  {directSaleBottleOptions.map((bottle) =>
                    renderBottleReturnCard(bottle),
                  )}
                </View>
              ) : (
                <View style={styles.assetSectionEmptyCard}>
                  <Ionicons name="water-outline" size={18} color="#94A3B8" />
                  <Text style={styles.assetSectionEmptyText}>
                    No bottle returns available.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.assetActionSubsection}>
              <View style={styles.assetActionsSectionHeader}>
                <Text style={styles.assetActionSubsectionTitle}>
                  Asset Returns
                </Text>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {heldAssetOptions.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.assetActionSubsectionText}>
                Customer-held assets. Set unit value.
              </Text>

              {!customerData ? (
                <View style={styles.heldItemsInfoCard}>
                  <Ionicons
                    name="person-circle-outline"
                    size={16}
                    color="#64748B"
                  />
                  <Text style={styles.heldItemsInfoText}>
                    Choose a customer to load asset returns.
                  </Text>
                </View>
              ) : heldItemsError ? (
                <View style={styles.assetSectionErrorBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color="#DC2626"
                  />
                  <Text style={styles.assetSectionErrorText}>
                    {heldItemsError}
                  </Text>
                </View>
              ) : heldAssetOptions.length > 0 ? (
                <View style={styles.productGrid}>
                  {heldAssetOptions.map((asset) =>
                    renderAssetActionCard(asset),
                  )}
                </View>
              ) : (
                <View style={styles.assetSectionEmptyCard}>
                  <Ionicons name="cube-outline" size={18} color="#94A3B8" />
                  <Text style={styles.assetSectionEmptyText}>
                    No held assets registered.
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.assetActionsSection}>
            <View style={styles.assetActionSubsection}>
              <View style={styles.assetActionsSectionHeader}>
                <View
                  style={[
                    styles.productCategoryBadge,
                    styles.productCategoryBadgeRefill,
                  ]}
                >
                  <Ionicons name="water-outline" size={14} color="#0F766E" />
                  <Text style={styles.productCategoryTitle}>
                    Bottle Deposits
                  </Text>
                </View>
                <View style={styles.productCategoryCountBadge}>
                  <Text style={styles.productCategoryCount}>
                    {directSaleBottleDepositOptions.length}
                  </Text>
                </View>
              </View>

              <Text style={styles.assetSectionHelperText}>
                From current truck load.
              </Text>

              {directSaleBottleDepositOptions.length === 0 ? (
                <View style={styles.assetSectionEmptyCard}>
                  <Ionicons name="water-outline" size={18} color="#94A3B8" />
                  <Text style={styles.assetSectionEmptyText}>
                    No bottle deposits available.
                  </Text>
                </View>
              ) : (
                <View style={styles.productGrid}>
                  {directSaleBottleDepositOptions.map((bottle) =>
                    renderBottleDepositCard(bottle),
                  )}
                </View>
              )}
            </View>

            <View style={styles.assetActionsSectionHeader}>
              <View
                style={[
                  styles.productCategoryBadge,
                  styles.productCategoryBadgeAssets,
                ]}
              >
                <Ionicons name="cube-outline" size={14} color="#581C87" />
                <Text style={styles.productCategoryTitle}>Asset Deposits</Text>
              </View>
              <View style={styles.productCategoryCountBadge}>
                <Text style={styles.productCategoryCount}>
                  {depositAssetOptions.length}
                </Text>
              </View>
            </View>

            <Text style={styles.assetSectionHelperText}>
              From truck load. Set unit value.
            </Text>

            {truckAssetsError ? (
              <View style={styles.assetSectionErrorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color="#DC2626"
                />
                <Text style={styles.assetSectionErrorText}>
                  {truckAssetsError}
                </Text>
              </View>
            ) : depositAssetOptions.length === 0 ? (
              <View style={styles.assetSectionEmptyCard}>
                <Ionicons name="cube-outline" size={18} color="#94A3B8" />
                <Text style={styles.assetSectionEmptyText}>
                  No asset deposits available.
                </Text>
              </View>
            ) : (
              <View style={styles.productGrid}>
                {depositAssetOptions.map((asset) =>
                  renderAssetActionCard(asset),
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </ActionModal>

      <ActionModal
        visible={customerSearchModalVisible}
        title="Search Customer"
        onClose={closeSearchCustomerModal}
        topInset={insets.top}
        bottomInset={insets.bottom}
      >
        <View style={styles.modalBody}>
          <View style={styles.modalSearchRow}>
            <View style={styles.modalSearchInputWrapper}>
              <Ionicons
                name="search"
                size={18}
                color="#94A3B8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Search customer"
                placeholderTextColor="#CBD5E1"
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void searchCustomers()}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              style={[
                styles.modalPrimaryButton,
                !customerSearchQuery.trim() &&
                  styles.modalPrimaryButtonDisabled,
              ]}
              onPress={() => void searchCustomers()}
              disabled={isCheckingCustomer || !customerSearchQuery.trim()}
              activeOpacity={0.8}
            >
              {isCheckingCustomer ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {isCheckingCustomer ? (
            <View style={styles.modalStateCard}>
              <ActivityIndicator size="small" color="#1E40AF" />
              <Text style={styles.modalStateText}>Searching customers...</Text>
            </View>
          ) : customerSearchResults.length > 0 ? (
            <ScrollView
              style={styles.modalResultsList}
              contentContainerStyle={styles.modalResultsContent}
              keyboardShouldPersistTaps="handled"
            >
              {customerSearchResults.map((customer) => {
                const walletBalance = getCustomerWalletBalance(customer);
                return (
                  <TouchableOpacity
                    key={customer.id}
                    style={styles.customerMatchCard}
                    onPress={() => handleCustomerPicked(customer)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.customerMatchName} numberOfLines={1}>
                      {customer.name}
                    </Text>
                    <Text style={styles.customerMatchMeta} numberOfLines={1}>
                      {customer.phone}
                    </Text>
                    <Text
                      style={[
                        styles.customerMatchBalance,
                        walletBalance < 0
                          ? styles.customerBalanceNegative
                          : styles.customerBalancePositive,
                      ]}
                    >
                      {formatCustomerWalletBalance(walletBalance)}
                    </Text>
                    <Text style={styles.customerMatchMeta}>
                      {customer.sites.length} site
                      {customer.sites.length === 1 ? "" : "s"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : hasSearchedCustomers ? (
            <View style={styles.modalStateCard}>
              <Ionicons
                name="search-circle-outline"
                size={30}
                color="#94A3B8"
              />
              <Text style={styles.modalStateTitle}>No customers found</Text>
              <Text style={styles.modalStateText}>
                Try a different query or create a new customer.
              </Text>
            </View>
          ) : (
            <Text style={styles.modalHelperText}>
              Search using a single query. The app will send only the `search`
              field to the customer endpoint.
            </Text>
          )}
        </View>
      </ActionModal>

      <ActionModal
        visible={subscriptionModalVisible}
        title="Subscriptions"
        onClose={closeSubscriptionModal}
        topInset={insets.top}
        bottomInset={insets.bottom}
      >
        <ScrollView
          style={styles.modalResultsList}
          contentContainerStyle={styles.subscriptionModalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.subscriptionContextCard}>
            <View style={styles.subscriptionContextIcon}>
              <Ionicons name="location-outline" size={18} color="#1D4ED8" />
            </View>
            <View style={styles.subscriptionContextCopy}>
              <Text style={styles.subscriptionContextTitle} numberOfLines={1}>
                {selectedSite
                  ? selectedSiteLabel || getSiteLabel(selectedSite, 0)
                  : "No site selected"}
              </Text>
              <Text style={styles.subscriptionContextText} numberOfLines={2}>
                {selectedSite
                  ? formatSiteAddress(selectedSite) || customerData?.name || ""
                  : "Select a site before saving."}
              </Text>
            </View>
            <View style={styles.subscriptionContextBadge}>
              <Text style={styles.subscriptionContextBadgeText}>
                {selectedSubscriptionDraftCount}
              </Text>
            </View>
          </View>

          <View style={styles.subscriptionScheduleCard}>
            <Text style={styles.subscriptionSectionTitle}>Schedule</Text>
            <View style={styles.subscriptionDateRow}>
              <View style={styles.subscriptionDateField}>
                <Text style={styles.subscriptionDateLabel}>Start Date</Text>
                <View style={styles.subscriptionDateInputWrapper}>
                  <Ionicons name="calendar-outline" size={15} color="#64748B" />
                  <TextInput
                    style={styles.subscriptionDateInput}
                    value={subscriptionStartDate}
                    onChangeText={(value) =>
                      setSubscriptionStartDate(sanitizeDateInput(value))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
              <View style={styles.subscriptionDateField}>
                <Text style={styles.subscriptionDateLabel}>End Date</Text>
                <View style={styles.subscriptionDateInputWrapper}>
                  <Ionicons
                    name="calendar-clear-outline"
                    size={15}
                    color="#64748B"
                  />
                  <TextInput
                    style={styles.subscriptionDateInput}
                    value={subscriptionEndDate}
                    onChangeText={(value) =>
                      setSubscriptionEndDate(sanitizeDateInput(value))
                    }
                    placeholder="Optional"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>
          </View>

          {subscriptionError ? (
            <View style={styles.assetSectionErrorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.assetSectionErrorText}>
                {subscriptionError}
              </Text>
            </View>
          ) : null}

          <View style={styles.subscriptionOptionsSection}>
            <View style={styles.assetActionsSectionHeader}>
              <Text style={styles.subscriptionSectionTitle}>Refill Items</Text>
              <View style={styles.productCategoryCountBadge}>
                <Text style={styles.productCategoryCount}>
                  {subscriptionModalItems.length}
                </Text>
              </View>
            </View>

            {isLoadingSubscriptions ? (
              <View style={styles.modalStateCard}>
                <ActivityIndicator size="small" color="#1E40AF" />
                <Text style={styles.modalStateText}>
                  Loading subscription items...
                </Text>
              </View>
            ) : subscriptionModalItems.length > 0 ? (
              <View style={styles.subscriptionOptionsList}>
                {subscriptionModalItems.map((subscription) =>
                  renderSubscriptionOptionCard(subscription),
                )}
              </View>
            ) : (
              <View style={styles.assetSectionEmptyCard}>
                <Ionicons name="water-outline" size={18} color="#94A3B8" />
                <Text style={styles.assetSectionEmptyText}>
                  No subscription items available.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.subscriptionModalActionRow}>
            <TouchableOpacity
              style={styles.siteFormCancelButton}
              onPress={closeSubscriptionModal}
              activeOpacity={0.8}
            >
              <Text style={styles.siteFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.siteFormSaveButton,
                (isSavingSubscriptions ||
                  isLoadingSubscriptions ||
                  subscriptionModalItems.length === 0) &&
                  styles.subscriptionSaveButtonDisabled,
              ]}
              onPress={saveSubscriptions}
              disabled={
                isSavingSubscriptions ||
                isLoadingSubscriptions ||
                subscriptionModalItems.length === 0
              }
              activeOpacity={0.8}
            >
              {isSavingSubscriptions ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.siteFormSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ActionModal>

      <ActionModal
        visible={customerModalVisible}
        title={
          customerModalMode === "create" ? "Create Customer" : "Manage Customer"
        }
        onClose={closeCustomerModal}
        topInset={insets.top}
        bottomInset={insets.bottom}
      >
        {customerModalMode === "create" ? (
          <View style={styles.modalBody}>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#94A3B8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Customer name"
                placeholderTextColor="#CBD5E1"
                value={createCustomerName}
                onChangeText={setCreateCustomerName}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="call-outline"
                size={18}
                color="#94A3B8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#CBD5E1"
                value={createCustomerPhone}
                onChangeText={setCreateCustomerPhone}
                keyboardType="phone-pad"
              />
            </View>

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => void handleCreateCustomer()}
              disabled={isCreatingCustomer}
              activeOpacity={0.8}
            >
              {isCreatingCustomer ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>
                  Create Customer
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.modalHelperText}>
              After creation, you can add a site or assign a route before
              closing this modal.
            </Text>
          </View>
        ) : customerData ? (
          <ScrollView
            style={styles.modalResultsList}
            contentContainerStyle={styles.customerManageContent}
            keyboardShouldPersistTaps="handled"
          >
            {customerCreatedInModal ? (
              <View style={styles.customerNoticeCard}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.customerNoticeText}>
                  Customer created. Add a site or route now if needed.
                </Text>
              </View>
            ) : null}

            <View style={styles.selectedCustomerCard}>
              <Text style={styles.selectedCustomerName}>
                {customerData.name}
              </Text>
              <Text style={styles.selectedCustomerMeta}>
                {customerData.phone}
              </Text>
              <View style={styles.customerBalanceRow}>
                <Ionicons
                  name={
                    selectedCustomerWalletBalance < 0
                      ? "alert-circle-outline"
                      : "wallet-outline"
                  }
                  size={13}
                  color={
                    selectedCustomerWalletBalance < 0 ? "#DC2626" : "#0F766E"
                  }
                />
                <Text
                  style={[
                    styles.customerBalanceText,
                    selectedCustomerWalletBalance < 0
                      ? styles.customerBalanceNegative
                      : styles.customerBalancePositive,
                  ]}
                >
                  {formatCustomerWalletBalance(selectedCustomerWalletBalance)}
                </Text>
              </View>
              <Text style={styles.selectedCustomerMeta}>
                {customerData.sites.length} site
                {customerData.sites.length === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={styles.sitesContainer}>
              <Text style={styles.sitesLabel}>Customer Sites</Text>

              {customerData.sites.length === 0 ? (
                <Text style={styles.siteHelperText}>
                  No site found yet. Add a site to improve delivery accuracy.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.sitesScroll}
                >
                  {customerData.sites.map((site, index) => (
                    <TouchableOpacity
                      key={site.id}
                      style={[
                        styles.siteOption,
                        selectedSite?.id === site.id && styles.siteOptionActive,
                      ]}
                      onPress={() => {
                        applySelectedSite(site);
                        setSelectedRouteId(site.routeId || "");
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="location"
                        size={14}
                        color={
                          selectedSite?.id === site.id ? "#FFFFFF" : "#64748B"
                        }
                      />
                      <Text
                        style={[
                          styles.siteOptionText,
                          selectedSite?.id === site.id &&
                            styles.siteOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {getSiteLabel(site, index)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={styles.siteActionRow}>
                <TouchableOpacity
                  style={styles.siteActionButton}
                  onPress={openCreateSiteForm}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={14} color="#1E40AF" />
                  <Text style={styles.siteActionButtonText}>Add Site</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.siteActionButton,
                    !selectedSite && styles.siteActionButtonDisabled,
                  ]}
                  onPress={openEditSiteForm}
                  disabled={!selectedSite}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={!selectedSite ? "#94A3B8" : "#1E40AF"}
                  />
                  <Text
                    style={[
                      styles.siteActionButtonText,
                      !selectedSite && styles.siteActionButtonTextDisabled,
                    ]}
                  >
                    Edit Site
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedSite ? (
                <View style={styles.siteDetailCard}>
                  <Text style={styles.siteDetailTitle}>
                    {selectedSiteLabel || getSiteLabel(selectedSite, 0)}
                  </Text>
                  <Text style={styles.siteDetailMeta}>
                    {formatSiteAddress(selectedSite) || "No address details"}
                  </Text>
                  <Text style={styles.siteDetailMeta}>
                    Route: {getRouteLabelById(selectedSite.routeId)}
                  </Text>
                  {selectedSite.deliveryInstructions ? (
                    <Text style={styles.siteDetailMeta}>
                      Instructions: {selectedSite.deliveryInstructions}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {siteFormMode ? (
                <View style={styles.siteFormCard}>
                  <Text style={styles.siteFormTitle}>
                    {siteFormMode === "create" ? "Add Site" : "Edit Site"}
                  </Text>
                  <View style={styles.inputRow}>
                    <View style={styles.inputWrapper}>
                      <Ionicons
                        name="business-outline"
                        size={18}
                        color="#94A3B8"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Site name"
                        placeholderTextColor="#CBD5E1"
                        value={siteDraft.siteName}
                        onChangeText={(value) =>
                          setSiteDraft((prev) => ({
                            ...prev,
                            siteName: value,
                          }))
                        }
                      />
                    </View>

                    <View style={styles.inputWrapper}>
                      <Ionicons
                        name="navigate-outline"
                        size={18}
                        color="#94A3B8"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Street name"
                        placeholderTextColor="#CBD5E1"
                        value={siteDraft.streetName}
                        onChangeText={(value) =>
                          setSiteDraft((prev) => ({
                            ...prev,
                            streetName: value,
                          }))
                        }
                      />
                    </View>

                    <View style={styles.siteInputRow}>
                      <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                        <Ionicons
                          name="business"
                          size={18}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Building no."
                          placeholderTextColor="#CBD5E1"
                          value={siteDraft.buildingNo}
                          onChangeText={(value) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              buildingNo: value,
                            }))
                          }
                        />
                      </View>
                      <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                        <Ionicons
                          name="home-outline"
                          size={18}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Flat no."
                          placeholderTextColor="#CBD5E1"
                          value={siteDraft.flatNo}
                          onChangeText={(value) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              flatNo: value,
                            }))
                          }
                        />
                      </View>
                    </View>

                    <View style={styles.siteInputRow}>
                      <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                        <Ionicons
                          name="map-outline"
                          size={18}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Area"
                          placeholderTextColor="#CBD5E1"
                          value={siteDraft.areaName}
                          onChangeText={(value) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              areaName: value,
                            }))
                          }
                        />
                      </View>
                      <View style={[styles.inputWrapper, styles.siteInputHalf]}>
                        <Ionicons
                          name="pin-outline"
                          size={18}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="City"
                          placeholderTextColor="#CBD5E1"
                          value={siteDraft.city}
                          onChangeText={(value) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              city: value,
                            }))
                          }
                        />
                      </View>
                    </View>

                    {siteFormMode === "create" ? (
                      <View style={styles.inputWrapper}>
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Delivery instructions (optional)"
                          placeholderTextColor="#CBD5E1"
                          value={siteDraft.deliveryInstructions}
                          onChangeText={(value) =>
                            setSiteDraft((prev) => ({
                              ...prev,
                              deliveryInstructions: value,
                            }))
                          }
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.siteFormActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.siteFormGhostButton,
                        isResolvingSiteLocation &&
                          styles.siteFormGhostButtonDisabled,
                      ]}
                      onPress={applyCurrentLocationToSiteForm}
                      disabled={isResolvingSiteLocation}
                      activeOpacity={0.8}
                    >
                      {isResolvingSiteLocation ? (
                        <ActivityIndicator size="small" color="#1E40AF" />
                      ) : (
                        <Ionicons
                          name="locate-outline"
                          size={14}
                          color="#1E40AF"
                        />
                      )}
                      <Text style={styles.siteFormGhostButtonText}>
                        {isResolvingSiteLocation
                          ? "Locating..."
                          : "Use Current Location"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.siteFormActionRow}>
                    <TouchableOpacity
                      style={styles.siteFormCancelButton}
                      onPress={closeSiteForm}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.siteFormCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.siteFormSaveButton}
                      onPress={saveSite}
                      disabled={isSavingSite}
                      activeOpacity={0.8}
                    >
                      {isSavingSite ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.siteFormSaveText}>Save Site</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {selectedSite ? (
                <View style={styles.routeAssignCard}>
                  <Text style={styles.routeAssignTitle}>Route Assignment</Text>

                  {selectedSite.routeId ? (
                    <View style={styles.routeAssignedBadge}>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={14}
                        color="#0F766E"
                      />
                      <Text style={styles.routeAssignedText}>
                        Assigned: {getRouteLabelById(selectedSite.routeId)}
                      </Text>
                    </View>
                  ) : isLoadingRoutes ? (
                    <View style={styles.routeLoadingRow}>
                      <ActivityIndicator size="small" color="#1E40AF" />
                      <Text style={styles.routeLoadingText}>
                        {"Loading today's routes..."}
                      </Text>
                    </View>
                  ) : todayRoutes.length === 0 ? (
                    <Text style={styles.siteHelperText}>
                      No routes available on your truck today.
                    </Text>
                  ) : (
                    <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.sitesScroll}
                      >
                        {todayRoutes.map((route, index) => (
                          <TouchableOpacity
                            key={route.id}
                            style={[
                              styles.routeOption,
                              selectedRouteId === route.id &&
                                styles.routeOptionActive,
                            ]}
                            onPress={() => setSelectedRouteId(route.id)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.routeOptionText,
                                selectedRouteId === route.id &&
                                  styles.routeOptionTextActive,
                              ]}
                            >
                              {route.label?.trim()
                                ? route.label
                                : `Route ${index + 1}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TouchableOpacity
                        style={styles.routeAssignButton}
                        onPress={assignRouteToSelectedSite}
                        disabled={!selectedRouteId || isAssigningRoute}
                        activeOpacity={0.8}
                      >
                        {isAssigningRoute ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.routeAssignButtonText}>
                            Assign Selected Route
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.modalStateCard}>
            <Ionicons name="person-circle-outline" size={32} color="#94A3B8" />
            <Text style={styles.modalStateTitle}>No customer selected</Text>
            <Text style={styles.modalStateText}>
              Search or create a customer first.
            </Text>
          </View>
        )}
      </ActionModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.3,
  },
  locationBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: "#64748B",
    maxWidth: 180,
  },
  headerRight: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadge: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  cartCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  inputRow: {
    gap: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1E40AF",
    fontWeight: "500",
  },
  phoneInput: {
    paddingRight: 8,
  },
  customerPlaceholderCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 16,
    alignItems: "center",
  },
  customerPlaceholderTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  customerPlaceholderText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },
  customerActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  customerActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1E40AF",
    borderRadius: 12,
    height: 42,
  },
  customerActionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  customerCreateButton: {
    backgroundColor: "#E2E8F0",
  },
  customerCreateButtonText: {
    color: "#1E40AF",
  },
  checkButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  customerNote: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginLeft: 50,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  customerNoteExisting: {
    backgroundColor: "#F0FDF4",
  },
  customerNoteNew: {
    backgroundColor: "#EFF6FF",
  },
  customerNoteText: {
    fontSize: 12,
    fontWeight: "500",
  },
  customerNoteTextExisting: {
    color: "#10B981",
  },
  customerNoteTextNew: {
    color: "#3B82F6",
  },
  customerMatchesContainer: {
    marginTop: 8,
  },
  customerMatchCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    width: "100%",
  },
  customerMatchCardActive: {
    borderColor: "#1E40AF",
    backgroundColor: "#EFF6FF",
  },
  customerMatchName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
  },
  customerMatchNameActive: {
    color: "#1E40AF",
  },
  customerMatchMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  customerMatchBalance: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  customerMatchMetaActive: {
    color: "#1E3A8A",
  },
  selectedCustomerCard: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
  },
  selectedCustomerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  selectedCustomerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  selectedCustomerCopy: {
    flex: 1,
  },
  selectedCustomerMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#475569",
  },
  customerBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  customerBalanceText: {
    fontSize: 11,
    fontWeight: "700",
  },
  customerBalancePositive: {
    color: "#0F766E",
  },
  customerBalanceNegative: {
    color: "#DC2626",
  },
  manageCustomerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  manageCustomerButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  sitesContainer: {
    marginTop: 12,
  },
  sitesLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  sitesScroll: {
    flexGrow: 0,
  },
  siteOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  siteOptionActive: {
    backgroundColor: "#1E40AF",
    borderColor: "#1E40AF",
  },
  siteOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
    maxWidth: 150,
  },
  siteOptionTextActive: {
    color: "#FFFFFF",
  },
  siteHelperText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 8,
  },
  siteActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  siteActionButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  siteActionButtonDisabled: {
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  siteActionButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  siteActionButtonTextDisabled: {
    color: "#94A3B8",
  },
  siteDetailCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 4,
  },
  siteDetailTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  siteDetailMeta: {
    fontSize: 12,
    color: "#475569",
  },
  siteFormCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  siteFormTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 10,
  },
  siteInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  siteInputHalf: {
    flex: 1,
  },
  siteFormActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  siteFormGhostButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  siteFormGhostButtonDisabled: {
    opacity: 0.72,
  },
  siteFormGhostButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  siteFormCancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  siteFormCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  siteFormSaveButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1E40AF",
    alignItems: "center",
    justifyContent: "center",
  },
  siteFormSaveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  subscriptionLauncherPanel: {
    gap: 8,
  },
  subscriptionLauncherButton: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subscriptionLauncherButtonDisabled: {
    opacity: 0.72,
  },
  subscriptionLauncherIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  subscriptionLauncherCopy: {
    flex: 1,
    gap: 3,
    marginRight: 8,
  },
  subscriptionLauncherTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionLauncherText: {
    fontSize: 12,
    color: "#64748B",
  },
  subscriptionLauncherAction: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  subscriptionLauncherActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  subscriptionSummaryList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subscriptionSummaryChip: {
    maxWidth: "100%",
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subscriptionSummaryText: {
    maxWidth: 180,
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
  },
  subscriptionSummaryQty: {
    fontSize: 11,
    fontWeight: "800",
    color: "#134E4A",
  },
  subscriptionModalContent: {
    paddingBottom: 8,
    gap: 12,
  },
  subscriptionContextCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FAFC",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  subscriptionContextIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  subscriptionContextCopy: {
    flex: 1,
    gap: 3,
    marginRight: 10,
  },
  subscriptionContextTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionContextText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  subscriptionContextBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  subscriptionContextBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subscriptionScheduleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  subscriptionSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionDateRow: {
    flexDirection: "row",
    gap: 10,
  },
  subscriptionDateField: {
    flex: 1,
    gap: 6,
  },
  subscriptionDateLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  subscriptionDateInputWrapper: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  subscriptionDateInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionOptionsSection: {
    gap: 10,
  },
  subscriptionOptionsList: {
    gap: 10,
  },
  subscriptionOptionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 12,
  },
  subscriptionOptionCardSelected: {
    borderColor: "#5EEAD4",
    backgroundColor: "#F0FDFA",
  },
  subscriptionOptionTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  subscriptionOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  subscriptionOptionIconSelected: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  subscriptionOptionCopy: {
    flex: 1,
    gap: 3,
    marginRight: 8,
  },
  subscriptionOptionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionOptionMeta: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  subscriptionToggleButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
  },
  subscriptionToggleButtonActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  subscriptionToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  subscriptionToggleTextActive: {
    color: "#FFFFFF",
  },
  subscriptionQuantityRow: {
    borderTopWidth: 1,
    borderTopColor: "#CCFBF1",
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subscriptionQuantityCopy: {
    flex: 1,
    gap: 3,
  },
  subscriptionQuantityLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  subscriptionQuantityHint: {
    fontSize: 11,
    color: "#64748B",
  },
  subscriptionStepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#FFFFFF",
    padding: 3,
  },
  subscriptionStepperButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionQuantityInput: {
    minWidth: 42,
    maxWidth: 58,
    paddingHorizontal: 6,
    paddingVertical: 0,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: "#0F766E",
  },
  subscriptionModalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  subscriptionSaveButtonDisabled: {
    opacity: 0.65,
  },
  routeAssignCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  routeAssignTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
  },
  routeAssignedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#5EEAD4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  routeAssignedText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
  },
  routeLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeLoadingText: {
    fontSize: 12,
    color: "#64748B",
  },
  routeOption: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  routeOptionActive: {
    backgroundColor: "#1E40AF",
    borderColor: "#1E40AF",
  },
  routeOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  routeOptionTextActive: {
    color: "#FFFFFF",
  },
  routeAssignButton: {
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1E40AF",
    alignItems: "center",
    justifyContent: "center",
  },
  routeAssignButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  collapsibleTitle: {
    marginBottom: 0,
  },
  collapsibleHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  collapsibleHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  remarkPreview: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    gap: 12,
  },
  modalSearchRow: {
    gap: 12,
  },
  modalSearchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
  },
  modalPrimaryButton: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "#1E40AF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalHelperText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  modalResultsList: {
    flexGrow: 0,
  },
  modalResultsContent: {
    paddingBottom: 4,
  },
  customerManageContent: {
    paddingBottom: 4,
  },
  modalStateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalStateTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalStateText: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    textAlign: "center",
  },
  customerNoticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    padding: 12,
    marginTop: 2,
    marginBottom: 2,
  },
  customerNoticeText: {
    flex: 1,
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  paymentContainer: {
    gap: 12,
  },
  paymentRow: {
    flexDirection: "row",
    gap: 12,
  },
  paymentRowBottom: {
    justifyContent: "center",
  },
  paymentOption: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
    minHeight: 100,
    justifyContent: "center",
  },
  paymentOptionTop: {
    flex: 1,
  },
  paymentOptionBottom: {
    flex: 0,
    minWidth: "48%",
    maxWidth: "48%",
  },
  paymentOptionActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#10B981",
    ...Platform.select({
      ios: {
        shadowColor: "#10B981",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  paymentIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#1E40AF",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  paymentIconBoxActive: {
    backgroundColor: "#10B981",
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },
  paymentLabelActive: {
    color: "#1E40AF",
  },
  paymentCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 2,
  },
  paymentOptionDisabled: {
    backgroundColor: "#F8FAFC",
    opacity: 0.6,
  },
  paymentIconBoxDisabled: {
    backgroundColor: "#F1F5F9",
  },
  paymentLabelDisabled: {
    color: "#CBD5E1",
  },
  paymentDisabledBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  paymentDisabledText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#DC2626",
    textAlign: "center",
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    fontWeight: "500",
  },
  productsSections: {
    gap: 20,
  },
  productCategorySection: {
    gap: 10,
  },
  productCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  productCategoryBadgeWholesale: {
    backgroundColor: "#DBEAFE",
  },
  productCategoryBadgeRefill: {
    backgroundColor: "#CFFAFE",
  },
  productCategoryBadgeOther: {
    backgroundColor: "#E2E8F0",
  },
  productCategoryBadgeAssets: {
    backgroundColor: "#F3E8FF",
  },
  productCategoryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  productCategoryCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  productCategoryCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  productGrid: {
    gap: 10,
  },
  assetSectionHelperText: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  assetSectionErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  assetSectionErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#B91C1C",
    fontWeight: "500",
  },
  assetSectionEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  assetSectionEmptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  assetLauncherCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  assetLauncherHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  assetLauncherIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  assetLauncherCopy: {
    flex: 1,
    gap: 4,
    marginRight: 10,
  },
  assetLauncherTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetLauncherText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  assetLauncherMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  assetLauncherChip: {
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assetLauncherChipSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  assetLauncherChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  assetLauncherChipTextSelected: {
    color: "#1D4ED8",
  },
  assetActionsModalContent: {
    paddingBottom: 8,
    gap: 12,
  },
  assetActionsIntroCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  assetActionsIntroTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetActionsIntroText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  creditCollectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    padding: 16,
    gap: 14,
  },
  creditCollectionHeader: {
    gap: 4,
  },
  creditCollectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  creditCollectionText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  creditCollectionFields: {
    gap: 12,
  },
  creditCollectionField: {
    gap: 6,
  },
  creditCollectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  creditCollectionRemarkInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  assetActionsSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  assetActionsSection: {
    gap: 10,
  },
  assetActionsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assetActionSubsection: {
    gap: 8,
  },
  assetActionSubsectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetActionSubsectionText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  assetReturnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  assetReturnBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  heldItemsInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  heldItemsInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  productCardWholesale: {
    borderLeftWidth: 5,
    borderLeftColor: "#2563EB",
  },
  productCardRefill: {
    borderLeftWidth: 5,
    borderLeftColor: "#0891B2",
  },
  productCardAssets: {
    borderLeftWidth: 5,
    borderLeftColor: "#7C3AED",
  },
  productCardOther: {
    borderLeftWidth: 5,
    borderLeftColor: "#64748B",
  },
  productCardSelected: {
    backgroundColor: "#F8FAFF",
    borderColor: "#2563EB",
  },
  productMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  productIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginRight: 14,
  },
  productIconBoxSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productInfo: {
    flex: 1,
  },
  productNameContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 5,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
  },
  productAssetIdText: {
    marginBottom: 5,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  modalActionCardCompact: {
    borderRadius: 14,
    padding: 12,
    shadowOpacity: 0.025,
    shadowRadius: 10,
    elevation: 1,
  },
  modalActionCardStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 10,
  },
  modalActionMainCompact: {
    marginRight: 10,
  },
  modalActionIconBoxCompact: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 10,
  },
  modalActionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  modalActionTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalActionMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  modalActionMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalActionMetaPillHeld: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  modalActionMetaPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  modalActionMetaPillTextHeld: {
    color: "#047857",
  },
  productMetaText: {
    marginBottom: 8,
    fontSize: 12,
    color: "#64748B",
  },
  badge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1D4ED8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  productPriceOriginal: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  productPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  adjustablePriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 9,
  },
  priceInputPrefix: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
    marginRight: 5,
  },
  priceInput: {
    minWidth: 68,
    paddingVertical: Platform.OS === "ios" ? 4 : 0,
    paddingHorizontal: 0,
    fontSize: 14,
    fontWeight: "700",
    color: "#059669",
  },
  stockBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modalActionQuantityControlCompact: {
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  modalActionQuantityButtonCompact: {
    width: 30,
    height: 30,
    borderRadius: 9,
  },
  quantityButtonDisabled: {
    backgroundColor: "#F8FAFC",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
    minWidth: 32,
    textAlign: "center",
  },
  modalActionQuantityTextCompact: {
    minWidth: 26,
    fontSize: 14,
  },
  assetActionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.025,
    shadowRadius: 10,
    elevation: 1,
    gap: 10,
  },
  assetActionCardTruck: {
    backgroundColor: "#FFFFFF",
  },
  assetActionCardHeld: {
    backgroundColor: "#FCFFFD",
    borderColor: "#D1FAE5",
  },
  assetActionCardSelected: {
    shadowOpacity: 0.08,
    elevation: 3,
  },
  assetActionCardSelectedTruck: {
    borderColor: "#7C3AED",
    backgroundColor: "#FCFAFF",
  },
  assetActionCardSelectedHeld: {
    borderColor: "#10B981",
    backgroundColor: "#F0FDF4",
  },
  assetActionTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  assetActionMedia: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 10,
  },
  assetActionImage: {
    width: "100%",
    height: "100%",
  },
  assetActionContent: {
    flex: 1,
    gap: 6,
  },
  assetActionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  assetActionLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  assetActionDetail: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  assetSourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  assetSourceBadgeHeld: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  assetSourceBadgeTruck: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  assetSourceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  assetSourceBadgeTextHeld: {
    color: "#047857",
  },
  assetSourceBadgeTextTruck: {
    color: "#1D4ED8",
  },
  assetActionMeta: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  assetActionSerial: {
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
  },
  assetActionControls: {
    gap: 8,
  },
  assetActionLockedRow: {
    gap: 8,
  },
  assetActionToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  assetActionRuleBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  assetActionRuleBadgeHeld: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  assetActionRuleBadgeDeposit: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  assetActionRuleText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  assetActionRuleTextHeld: {
    color: "#047857",
  },
  assetActionRuleTextDeposit: {
    color: "#6D28D9",
  },
  assetActionModeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8B4FE",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  assetActionModeButtonActive: {
    backgroundColor: "#6D28D9",
    borderColor: "#6D28D9",
  },
  assetActionModeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6D28D9",
  },
  assetActionModeTextActive: {
    color: "#FFFFFF",
  },
  assetActionNote: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  assetActionFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  assetPriceEditor: {
    flex: 1,
    gap: 4,
  },
  assetPriceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  assetPriceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    minHeight: 38,
    paddingHorizontal: 10,
  },
  assetPricePrefix: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginRight: 6,
  },
  assetPriceInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    paddingVertical: 0,
  },
  assetIncludeButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  assetIncludeButtonActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8",
  },
  assetIncludeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  assetIncludeButtonTextActive: {
    color: "#FFFFFF",
  },
  bottleReturnCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
    gap: 12,
  },
  bottleReturnCardSelected: {
    backgroundColor: "#F0FDF4",
    borderColor: "#10B981",
  },
  bottleDepositCardSelected: {
    backgroundColor: "#F8FAFF",
    borderColor: "#93C5FD",
  },
  bottleDepositIconBoxSelected: {
    backgroundColor: "#0286FF",
    borderColor: "#0286FF",
  },
  bottleReturnMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  bottleReturnMedia: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 14,
  },
  bottleReturnMediaSelected: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  bottleReturnImage: {
    width: "100%",
    height: "100%",
  },
  bottleReturnContent: {
    flex: 1,
    gap: 4,
  },
  bottleReturnBadge: {
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bottleReturnBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  bottleDepositBadge: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bottleDepositBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1D4ED8",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  bottleReturnHeldText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F766E",
  },
  bottleReturnDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  bottleReturnControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  assetQuantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  assetQuantityButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  assetQuantityValue: {
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  assetQuantityValueText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  actionSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 14,
    color: "#1E40AF",
    fontWeight: "600",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    color: "#1E40AF",
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 24,
    color: "#1E40AF",
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  summaryNote: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: "#0F766E",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 56,
    borderRadius: 16,
    gap: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: "#E2E8F0",
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  confirmArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default DirectSales;
