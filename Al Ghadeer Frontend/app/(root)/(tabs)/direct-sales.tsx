import ApiErrorText from "@/components/ApiErrorText";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { Order } from "@/types/order";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { AssignmentRoute, AssignmentsPayload } from "@/utils/assignments";
import { resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  type: "retail" | "refill" | "other";
  itemId: string;
  label: string;
  pricePerUnit: number;
  unit: string | null;
  image_url: string | null;
  originalPrice?: number;
  badge?: string;
  loaded_quantity?: number | string;
  available_stock?: number | string;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: "cash-outline" as const },
  { id: "wallet", label: "Wallet", icon: "wallet-outline" as const },
  { id: "credit", label: "Credit", icon: "receipt-outline" as const },
];

type ProductGroup = "wholesale" | "refill" | "other";

const normalizeCategory = (category?: string) =>
  (category || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const getProductGroup = (type?: string): ProductGroup => {
  const normalized = normalizeCategory(type);

  if (normalized.includes("refill")) return "refill";
  if (normalized.includes("retail")) {
    return "wholesale";
  }
  return "other";
};

type SaleLineType = "retail" | "refill";

const getSaleLineType = (type?: string): SaleLineType => {
  const normalized = normalizeCategory(type);
  if (normalized.includes("refill")) return "refill";
  return "retail";
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
    label,
    pricePerUnit,
    type,
    unit: toNullableStringValue(source.unit),
    image_url: resolveResourceUrl(toNullableStringValue(source.image_url)),
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

interface SaleRequestBody {
  customerId: string;
  paymentMethod: "cash" | "wallet" | "credit";
  remark?: string;
  retails?: {
    id: string;
    quantity: number;
    price: number;
  }[];
  refills?: {
    filledBottleId: string;
    filledQuantity: number;
    price: number;
  }[];
  assets?: {
    id: string;
    price: number;
  }[];
}

interface SalePaymentCash {
  method: "cash";
  paidAmount: number;
  saleTotal: number;
}

interface SalePaymentWallet {
  method: "wallet";
  paidAmount: number;
  saleTotal: number;
  walletActionId: string;
  newBalance: number;
}

interface SalePaymentCredit {
  method: "credit";
}

type SalePayment = SalePaymentCash | SalePaymentWallet | SalePaymentCredit;

// Response data structure for POST /sale
interface DirectSaleApiResponse {
  saleId: string;
  invoiceNumber?: string;
  payment: SalePayment;
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
}

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  sites: CustomerSite[];
}

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

const DirectSales: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    currentDriver,
    selectOrder,
    setPaymentMethod: setGlobalPaymentMethod,
    setLastConfirmPaymentResponse,
    clearCart,
  } = useOrderStore();
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerIdQuery, setCustomerIdQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "wallet" | "credit"
  >("cash");
  const [remark, setRemark] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [customerSearchResults, setCustomerSearchResults] = useState<
    CustomerData[]
  >([]);
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [selectedSite, setSelectedSite] = useState<CustomerSite | null>(null);
  const [todayRoutes, setTodayRoutes] = useState<AssignmentRoute[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [siteFormMode, setSiteFormMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(EMPTY_SITE_DRAFT);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isAssigningRoute, setIsAssigningRoute] = useState(false);
  const driverId = user?.id || currentDriver?.id;

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
        setProducts(normalizedProducts);
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [driverId, selectedSite?.id],
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const applySelectedSite = useCallback((site: CustomerSite | null) => {
    setSelectedSite(site);
    setSelectedRouteId("");

    if (!site) return;

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
  }, []);

  const applyCustomerSelection = useCallback(
    (customer: CustomerData) => {
      const preferredSite =
        customer.sites.find((site) => Boolean(site.routeId)) ||
        customer.sites[0] ||
        null;

      setCustomerData(customer);
      setCustomerName(customer.name || "");
      setCustomerPhone(customer.phone || "");
      setCustomerIdQuery(customer.id);
      setIsExistingCustomer(true);
      setCustomerChecked(true);
      setSiteFormMode(null);
      setSiteDraft(EMPTY_SITE_DRAFT);
      applySelectedSite(preferredSite);
      if (preferredSite?.routeId) {
        setSelectedRouteId(preferredSite.routeId);
      }
    },
    [applySelectedSite],
  );

  const fetchTodayRoutes = useCallback(async () => {
    if (!driverId) {
      setTodayRoutes([]);
      return;
    }

    setIsLoadingRoutes(true);
    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/assignments?_ts=${Date.now()}`,
        {
          method: "GET",
          headers: {
            "X-Driver-Id": driverId,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
      );
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
        fetchTodayRoutes(),
      ]);
    } finally {
      setRefreshingProducts(false);
    }
  }, [fetchProducts, fetchTodayRoutes]);

  const checkCustomer = useCallback(async () => {
    if (!driverId) {
      showWarningAlert(
        "Driver Missing",
        "Driver information is not available.",
      );
      return;
    }

    const trimmedPhone = customerPhone.trim();
    const trimmedId = customerIdQuery.trim();
    if (!trimmedPhone && !trimmedId) {
      showWarningAlert(
        "Search Required",
        "Enter phone or customer ID to search.",
      );
      return;
    }

    setIsCheckingCustomer(true);
    setIsExistingCustomer(false);
    setCustomerChecked(false);
    setCustomerData(null);
    setCustomerSearchResults([]);
    applySelectedSite(null);
    setSiteFormMode(null);
    setSiteDraft(EMPTY_SITE_DRAFT);

    try {
      setApiError(null);
      const params = new URLSearchParams();
      if (trimmedPhone) {
        params.set("phone", trimmedPhone);
      }
      if (trimmedId) {
        params.set("id", trimmedId);
      }

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
        await parseApiResponseWithSoftError<CustomerData[]>(response);

      if (!parseResult.ok) {
        setApiError(parseResult.error);
        setIsExistingCustomer(false);
        setCustomerChecked(true);
        return;
      }

      const customers = Array.isArray(parseResult.data) ? parseResult.data : [];
      setCustomerSearchResults(customers);
      setCustomerChecked(true);

      if (customers.length === 0) {
        setIsExistingCustomer(false);
        showWarningAlert(
          "Customer not found",
          "No existing customer matched this phone/ID. Use Create Customer below.",
        );
        return;
      }

      const exactMatch =
        customers.find((customer) => {
          const isPhoneMatch =
            trimmedPhone.length > 0 && customer.phone === trimmedPhone;
          const isIdMatch = trimmedId.length > 0 && customer.id === trimmedId;
          return isPhoneMatch || isIdMatch;
        }) || customers[0];

      applyCustomerSelection(exactMatch);

      if (customers.length > 1) {
        showWarningAlert(
          "Multiple Matches",
          "Multiple customers matched. We selected one; you can switch below.",
        );
      }
    } catch (error) {
      console.error("Error searching customers:", error);
      setIsExistingCustomer(false);
      setCustomerChecked(false);
      setApiError(
        error instanceof Error ? error.message : "Failed to search customers.",
      );
    } finally {
      setIsCheckingCustomer(false);
    }
  }, [
    applyCustomerSelection,
    applySelectedSite,
    customerIdQuery,
    customerPhone,
    driverId,
  ]);

  const handleCreateCustomer = useCallback(async () => {
    if (!driverId) {
      showWarningAlert(
        "Driver Missing",
        "Driver information is not available.",
      );
      return;
    }

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

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
        headers: {
          "X-Driver-Id": driverId,
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
        }),
      });
      const result =
        await parseApiResponseWithSoftError<CustomerData>(response);
      if (!result.ok) {
        setApiError(result.error);
        return;
      }

      setCustomerSearchResults([result.data]);
      applyCustomerSelection(result.data);
      showSuccessAlert(
        "Customer Created",
        `${result.data.name} is ready for direct sale.`,
      );
    } catch (error) {
      console.error("Error creating customer:", error);
      setApiError(
        error instanceof Error ? error.message : "Failed to create customer.",
      );
    } finally {
      setIsCreatingCustomer(false);
    }
  }, [applyCustomerSelection, customerName, customerPhone, driverId]);

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

  const applyCurrentLocationToSiteForm = useCallback(() => {
    if (!location) {
      showWarningAlert(
        "Location Unavailable",
        "Current location is not available right now.",
      );
      return;
    }
    setSiteDraft((prev) => ({
      ...prev,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    }));
  }, [location]);

  const saveSite = useCallback(async () => {
    if (!driverId || !customerData) {
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
        headers: {
          "X-Driver-Id": driverId,
        },
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
    driverId,
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
      setApiError(`Invalid customer UUID: ${customerId || "N/A"}`);
      showWarningAlert(
        "Invalid Customer ID",
        "Selected customer id is not a valid UUID. Please re-search the customer.",
      );
      return;
    }
    if (!isUuid(siteId)) {
      setApiError(`Invalid site UUID: ${siteId || "N/A"}`);
      showWarningAlert(
        "Invalid Site ID",
        "Selected site id is not a valid UUID. Re-select or recreate the site.",
      );
      return;
    }
    if (!isUuid(routeId)) {
      setApiError(`Invalid route UUID: ${routeId || "N/A"}`);
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
        `Assigned ${selectedRoute?.label || updatedSite.routeId} to this site.`,
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
      return label || routeId;
    },
    [todayRoutes],
  );

  useEffect(() => {
    void fetchTodayRoutes();
  }, [fetchTodayRoutes]);

  useEffect(() => {
    const getLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          showWarningAlert(
            "Permission Denied",
            "Location permission is required.",
          );
          return;
        }

        const locationData = await Location.getCurrentPositionAsync({});
        const addressData = await Location.reverseGeocodeAsync({
          latitude: locationData.coords.latitude,
          longitude: locationData.coords.longitude,
        });

        setLocation({
          latitude: locationData.coords.latitude,
          longitude: locationData.coords.longitude,
          address: `${addressData[0]?.name || ""}, ${addressData[0]?.city || ""}`,
        });
      } catch (error) {
        console.error("Error getting location:", error);
      }
    };
    getLocation();
  }, []);

  const handleChangeQuantity = useCallback(
    (product: ServerProduct, delta: number) => {
      let blockedByStock = false;
      const stockLimit = getCoolerStockLimit(product);

      setQuantities((prev) => {
        const current = prev[product.id] || 0;
        const next = Math.max(0, current + delta);
        const capped = Number.isFinite(stockLimit)
          ? Math.min(next, stockLimit)
          : next;
        blockedByStock =
          delta > 0 && Number.isFinite(stockLimit) && next > stockLimit;
        return { ...prev, [product.id]: capped };
      });

      if (blockedByStock) {
        showWarningAlert(
          "Stock limit reached",
          `${product.label} stock is limited to ${stockLimit}.`,
        );
      }
    },
    [],
  );

  const selectedProducts = useMemo(() => {
    return products.filter((p) => (quantities[p.id] || 0) > 0);
  }, [products, quantities]);

  const groupedProducts = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        const group = getProductGroup(product.type);
        acc[group].push(product);
        return acc;
      },
      {
        wholesale: [] as ServerProduct[],
        refill: [] as ServerProduct[],
        other: [] as ServerProduct[],
      },
    );
  }, [products]);

  const totalItems = useMemo(() => {
    return Object.values(quantities).reduce((sum, q) => sum + q, 0);
  }, [quantities]);

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, product) => {
      return sum + product.pricePerUnit * (quantities[product.id] || 0);
    }, 0);
  }, [selectedProducts, quantities]);

  const vat = useMemo(() => subtotal * 0.05, [subtotal]);
  const totalAmount = useMemo(() => subtotal + vat, [subtotal, vat]);

  const isFormValid = selectedProducts.length > 0 && Boolean(customerData?.id);

  const renderProductCard = (
    product: ServerProduct,
    index: number,
    group: ProductGroup,
  ) => {
    const quantity = quantities[product.id] || 0;
    const isSelected = quantity > 0;
    const stockLimit = getCoolerStockLimit(product);
    const hasStockLimit = Number.isFinite(stockLimit);
    const isMaxStock = hasStockLimit && quantity >= stockLimit;
    const groupCardStyle =
      group === "refill"
        ? styles.productCardRefill
        : group === "wholesale"
          ? styles.productCardWholesale
          : styles.productCardOther;

    const displayPrice = product.originalPrice ? (
      <View style={styles.priceContainer}>
        <Text style={styles.productPriceOriginal}>
          AED {product.originalPrice}
        </Text>
        <Text style={styles.productPrice}>AED {product.pricePerUnit}</Text>
      </View>
    ) : (
      <Text style={styles.productPrice}>AED {product.pricePerUnit}</Text>
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
        <View style={styles.productInfo}>
          <View style={styles.productNameContainer}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.label}
            </Text>
            {product.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{product.badge}</Text>
              </View>
            )}
          </View>
          {displayPrice}
          {hasStockLimit && (
            <Text style={styles.productStockText}>Stock: {stockLimit}</Text>
          )}
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

  const handleConfirmSale = useCallback(async () => {
    if (!driverId) {
      showWarningAlert(
        "Driver Missing",
        "Driver information is not loaded yet. Please try again in a moment.",
      );
      return;
    }

    if (selectedProducts.length === 0) {
      showWarningAlert("No Items", "Please select at least one product.");
      return;
    }

    if (!customerPhone.trim()) {
      showWarningAlert("Required", "Please enter phone number.");
      return;
    }

    if (!customerData?.id) {
      showWarningAlert(
        "Customer Required",
        "Direct sale now requires an existing customer. Search by phone and select a valid customer first.",
      );
      return;
    }

    setIsSubmitting(true);
    setApiError(null);
    try {
      const retails: NonNullable<SaleRequestBody["retails"]> = [];
      const refills: NonNullable<SaleRequestBody["refills"]> = [];
      const assets: NonNullable<SaleRequestBody["assets"]> = [];

      selectedProducts.forEach((product) => {
        const quantity = quantities[product.id] || 0;
        if (quantity <= 0) return;

        const unitPrice = Number(product.pricePerUnit);
        if (!Number.isFinite(unitPrice)) return;

        const lineType = getSaleLineType(product.type);
        if (lineType === "refill") {
          refills.push({
            filledBottleId: product.itemId,
            filledQuantity: quantity,
            price: unitPrice,
          });
          return;
        }

        retails.push({
          id: product.itemId,
          quantity,
          price: unitPrice,
        });
      });

      if (retails.length === 0 && refills.length === 0 && assets.length === 0) {
        showWarningAlert(
          "Invalid Cart",
          "Please select valid products with quantities greater than zero.",
        );
        return;
      }

      const saleData: SaleRequestBody = {
        customerId: customerData.id,
        paymentMethod,
      };

      const normalizedRemark = remark.trim();
      if (normalizedRemark) {
        saleData.remark = normalizedRemark;
      }
      if (retails.length > 0) {
        saleData.retails = retails;
      }
      if (refills.length > 0) {
        saleData.refills = refills;
      }
      if (assets.length > 0) {
        saleData.assets = assets;
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/sale`, {
        method: "POST",
        headers: {
          "X-Driver-Id": driverId,
        },
        body: JSON.stringify(saleData),
      });

      const parseResult =
        await parseApiResponseWithSoftError<DirectSaleApiResponse>(response);
      if (!parseResult.ok) {
        setApiError(parseResult.error);
        return;
      }
      const data = parseResult.data;

      // Prepare cart items from selected products for receipt display
      clearCart();
      const cartItemsFromSale = selectedProducts.map((product) => ({
        id: product.id,
        name: product.label,
        image: { uri: product.image_url || "https://via.placeholder.com/150" },
        price: product.pricePerUnit,
        quantity: quantities[product.id],
        currency: "AED" as const,
        category: product.type || "",
      }));

      // Create order object for receipt page using POST /sale response
      const saleId = data.saleId;
      const invoiceNumber = data.invoiceNumber;
      const orderNumber = `SALE-${saleId}`;

      const paymentResult = data.payment;
      const responsePaymentMethod = paymentResult?.method || paymentMethod;
      const saleTotal =
        "saleTotal" in paymentResult &&
        typeof paymentResult.saleTotal === "number"
          ? paymentResult.saleTotal
          : totalAmount;

      const newOrder: Order = {
        id: saleId,
        order_number: orderNumber,
        invoice_number: invoiceNumber,
        status: "delivered",
        customer_id: customerData.id,
        customer_name: customerData.name || customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address:
          formatSiteAddress(selectedSite) ||
          selectedSite?.siteName ||
          location?.address ||
          "N/A",
        total_amount: saleTotal,
        payment_method: responsePaymentMethod,
        products: selectedProducts.map((product) => ({
          id: product.id,
          name: product.label,
          quantity: quantities[product.id],
          price: product.pricePerUnit,
        })),
      };

      // Add order to completedOrders and set cart items in one update
      const store = useOrderStore.getState();
      useOrderStore.setState({
        completedOrders: [...store.completedOrders, newOrder],
        cartItems: cartItemsFromSale,
      });

      // Set selected order and payment method for receipt page
      selectOrder(newOrder.id);
      setGlobalPaymentMethod(responsePaymentMethod);
      setLastConfirmPaymentResponse({
        orderId: saleId,
        sale_id: saleId, // Used by receipt page invoice generation API
        invoice_number: invoiceNumber,
        order_number: orderNumber,
      });

      // Document type from response: invoice_number present → Invoice, absent → Delivery Note
      const hasInvoice = !!invoiceNumber;
      const documentType = hasInvoice ? "Invoice" : "Delivery Note";

      // Show success alert with option to view invoice/receipt
      showSuccessAlert(
        "Sale Confirmed",
        paymentResult.method === "credit"
          ? `Credit sale ${saleId} confirmed successfully.`
          : `Sale of AED ${saleTotal.toFixed(2)} confirmed successfully.`,
        [
          {
            text: "Done",
            style: "cancel",
            onPress: () => {
              setQuantities({});
              setCustomerName("");
              setCustomerPhone("");
              setCustomerData(null);
              setSelectedSite(null);
              setCustomerChecked(false);
              setIsExistingCustomer(false);
              setRemark("");
              clearCart();
              router.back();
            },
          },
          {
            text: `View ${documentType}`,
            onPress: () => {
              router.push("/(root)/(tabs)/payment-receipt");
            },
          },
        ],
      );
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Failed to confirm sale.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    driverId,
    selectedProducts,
    customerData,
    paymentMethod,
    remark,
    quantities,
    totalAmount,
    customerName,
    customerPhone,
    selectedSite,
    location?.address,
    router,
    clearCart,
    selectOrder,
    setGlobalPaymentMethod,
    setLastConfirmPaymentResponse,
  ]);

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
          {/* Customer Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Name"
                  placeholderTextColor="#CBD5E1"
                  value={customerName}
                  onChangeText={setCustomerName}
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
                  style={[styles.input, styles.phoneInput]}
                  placeholder="Phone"
                  placeholderTextColor="#CBD5E1"
                  value={customerPhone}
                  onChangeText={(text) => {
                    setCustomerPhone(text);
                    setIsExistingCustomer(false);
                    setCustomerChecked(false);
                    setCustomerData(null);
                    setCustomerSearchResults([]);
                    applySelectedSite(null);
                    setSiteFormMode(null);
                    setSiteDraft(EMPTY_SITE_DRAFT);
                  }}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="barcode-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Customer ID (optional)"
                  placeholderTextColor="#CBD5E1"
                  value={customerIdQuery}
                  onChangeText={(text) => {
                    setCustomerIdQuery(text);
                    setIsExistingCustomer(false);
                    setCustomerChecked(false);
                    setCustomerData(null);
                    setCustomerSearchResults([]);
                    applySelectedSite(null);
                    setSiteFormMode(null);
                    setSiteDraft(EMPTY_SITE_DRAFT);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.customerActionsRow}>
                <TouchableOpacity
                  style={styles.customerActionButton}
                  onPress={checkCustomer}
                  disabled={
                    isCheckingCustomer ||
                    (!customerPhone.trim() && !customerIdQuery.trim())
                  }
                  activeOpacity={0.8}
                >
                  {isCheckingCustomer ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="search" size={14} color="#FFFFFF" />
                      <Text style={styles.customerActionButtonText}>
                        Search Existing
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.customerActionButton,
                    styles.customerCreateButton,
                  ]}
                  onPress={handleCreateCustomer}
                  disabled={isCreatingCustomer}
                  activeOpacity={0.8}
                >
                  {isCreatingCustomer ? (
                    <ActivityIndicator size="small" color="#1E40AF" />
                  ) : (
                    <>
                      <Ionicons
                        name="person-add-outline"
                        size={14}
                        color="#1E40AF"
                      />
                      <Text
                        style={[
                          styles.customerActionButtonText,
                          styles.customerCreateButtonText,
                        ]}
                      >
                        Create Customer
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {customerChecked && (
                <View
                  style={[
                    styles.customerNote,
                    isExistingCustomer
                      ? styles.customerNoteExisting
                      : styles.customerNoteNew,
                  ]}
                >
                  <Ionicons
                    name={
                      isExistingCustomer ? "checkmark-circle" : "person-add"
                    }
                    size={14}
                    color={isExistingCustomer ? "#10B981" : "#3B82F6"}
                  />
                  <Text
                    style={[
                      styles.customerNoteText,
                      isExistingCustomer
                        ? styles.customerNoteTextExisting
                        : styles.customerNoteTextNew,
                    ]}
                  >
                    {isExistingCustomer
                      ? "Existing customer selected"
                      : "No customer selected yet"}
                  </Text>
                </View>
              )}

              {customerSearchResults.length > 1 && (
                <View style={styles.customerMatchesContainer}>
                  <Text style={styles.sitesLabel}>Matching Customers</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.sitesScroll}
                  >
                    {customerSearchResults.map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        style={[
                          styles.customerMatchCard,
                          customerData?.id === customer.id &&
                            styles.customerMatchCardActive,
                        ]}
                        onPress={() => applyCustomerSelection(customer)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.customerMatchName,
                            customerData?.id === customer.id &&
                              styles.customerMatchNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {customer.name}
                        </Text>
                        <Text
                          style={[
                            styles.customerMatchMeta,
                            customerData?.id === customer.id &&
                              styles.customerMatchMetaActive,
                          ]}
                          numberOfLines={1}
                        >
                          {customer.phone}
                        </Text>
                        <Text
                          style={[
                            styles.customerMatchMeta,
                            customerData?.id === customer.id &&
                              styles.customerMatchMetaActive,
                          ]}
                          numberOfLines={1}
                        >
                          {customer.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {customerData ? (
                <View style={styles.selectedCustomerCard}>
                  <Text style={styles.selectedCustomerName}>
                    {customerData.name}
                  </Text>
                  <Text style={styles.selectedCustomerMeta}>
                    {customerData.phone}
                  </Text>
                  <Text style={styles.selectedCustomerMeta}>
                    {customerData.id}
                  </Text>
                  <Text style={styles.selectedCustomerMeta}>
                    {customerData.sites.length} site
                    {customerData.sites.length === 1 ? "" : "s"}
                  </Text>
                </View>
              ) : null}

              {isExistingCustomer && customerData && (
                <View style={styles.sitesContainer}>
                  <Text style={styles.sitesLabel}>Customer Sites</Text>

                  {customerData.sites.length === 0 ? (
                    <Text style={styles.siteHelperText}>
                      No site found yet. Add a site to improve delivery
                      accuracy.
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
                            selectedSite?.id === site.id &&
                              styles.siteOptionActive,
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
                              selectedSite?.id === site.id
                                ? "#FFFFFF"
                                : "#64748B"
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
                        {getSiteLabel(selectedSite, 0)}
                      </Text>
                      <Text style={styles.siteDetailMeta}>
                        {formatSiteAddress(selectedSite) ||
                          "No address details"}
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
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
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
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
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
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
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
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
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

                        <View style={styles.siteInputRow}>
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
                            <Ionicons
                              name="location-outline"
                              size={18}
                              color="#94A3B8"
                              style={styles.inputIcon}
                            />
                            <TextInput
                              style={styles.input}
                              placeholder="Latitude"
                              placeholderTextColor="#CBD5E1"
                              value={siteDraft.latitude}
                              onChangeText={(value) =>
                                setSiteDraft((prev) => ({
                                  ...prev,
                                  latitude: value,
                                }))
                              }
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View
                            style={[styles.inputWrapper, styles.siteInputHalf]}
                          >
                            <Ionicons
                              name="location-outline"
                              size={18}
                              color="#94A3B8"
                              style={styles.inputIcon}
                            />
                            <TextInput
                              style={styles.input}
                              placeholder="Longitude"
                              placeholderTextColor="#CBD5E1"
                              value={siteDraft.longitude}
                              onChangeText={(value) =>
                                setSiteDraft((prev) => ({
                                  ...prev,
                                  longitude: value,
                                }))
                              }
                              keyboardType="decimal-pad"
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
                          style={styles.siteFormGhostButton}
                          onPress={applyCurrentLocationToSiteForm}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="locate-outline"
                            size={14}
                            color="#1E40AF"
                          />
                          <Text style={styles.siteFormGhostButtonText}>
                            Use Current Location
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
                            <Text style={styles.siteFormSaveText}>
                              Save Site
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {selectedSite ? (
                    <View style={styles.routeAssignCard}>
                      <Text style={styles.routeAssignTitle}>
                        Route Assignment
                      </Text>

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
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Remark (Optional)</Text>
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

              {/* Bottom Row: Credit */}
              <View style={[styles.paymentRow, styles.paymentRowBottom]}>
                {PAYMENT_METHODS.filter((m) => m.id === "credit").map(
                  (method) => {
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
                  },
                )}
              </View>
            </View>
          </View>

          {/* Products */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Products</Text>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1E40AF" />
              </View>
            ) : products.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color="#E2E8F0" />
                <Text style={styles.emptyText}>No products available</Text>
              </View>
            ) : (
              <View style={styles.productsSections}>
                {groupedProducts.refill.length > 0 && (
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
                )}

                {groupedProducts.wholesale.length > 0 && (
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
                )}

                {groupedProducts.other.length > 0 && (
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
                )}
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
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !isFormValid && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirmSale}
              disabled={!isFormValid || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.confirmText}>Confirm Sale</Text>
                  <View style={styles.confirmArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#1E40AF" />
                  </View>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginRight: 10,
    width: 210,
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
  selectedCustomerMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#475569",
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
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  productCardWholesale: {
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  productCardRefill: {
    borderLeftWidth: 4,
    borderLeftColor: "#06B6D4",
  },
  productCardOther: {
    borderLeftWidth: 4,
    borderLeftColor: "#94A3B8",
  },
  productCardSelected: {
    backgroundColor: "#F0FDF4",
    borderColor: "#10B981",
  },
  productInfo: {
    flex: 1,
    marginRight: 16,
  },
  productNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
    flex: 1,
  },
  badge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#92400E",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    color: "#10B981",
  },
  productStockText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
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
