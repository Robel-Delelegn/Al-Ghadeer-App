import { Driver, Order, Product } from "@/types/order";
import { useAuthStore } from "@/store/auth";
import type { CustomerHeldItems } from "@/utils/customerHeldItems";
import type { DriverHistoryDetail } from "@/utils/driverHistory";
import type { TruckAsset, TruckBulkItem } from "@/utils/truckLoad";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface LocationStore {
  userAddress: string | null;
  userLongitude: number | null;
  userLatitude: number | null;
  destinationLongitude: number | null;
  destinationLatitude: number | null;
  destinationAddress: string | null;
  setUserLocation: (value: {
    latitude: number;
    longitude: number;
    address: string;
  }) => void;
  setDestinationLocation: (value: {
    latitude: number;
    longitude: number;
    address: string;
  }) => void;
}

export const useLocationStore = create<LocationStore>((set) => ({
  userAddress: null,
  userLongitude: null,
  userLatitude: null,
  destinationLongitude: null,
  destinationLatitude: null,
  destinationAddress: null,
  setUserLocation: ({ latitude, longitude, address }) =>
    set({
      userLatitude: latitude,
      userLongitude: longitude,
      userAddress: address,
    }),
  setDestinationLocation: ({ latitude, longitude, address }) =>
    set({
      destinationLatitude: latitude,
      destinationLongitude: longitude,
      destinationAddress: address,
    }),
}));

// Expense tracking
interface ExpenseItem {
  id: string;
  type: string;
  amount: number;
  description?: string;
  receiptUri?: string;
  createdAt: string;
}

interface ExpenseStore {
  expenses: ExpenseItem[];
  addExpense: (expense: Omit<ExpenseItem, "id" | "createdAt">) => ExpenseItem;
  clearExpenses: () => void;
}

export const useExpenseStore = create<ExpenseStore>()(
  persist(
    (set, get) => ({
      expenses: [],
      addExpense: (expenseInput) => {
        const newExpense: ExpenseItem = {
          id: `EXP-${Date.now()}`,
          createdAt: new Date().toISOString(),
          ...expenseInput,
        };
        set((state) => ({ expenses: [newExpense, ...state.expenses] }));
        return newExpense;
      },
      clearExpenses: () => set({ expenses: [] }),
    }),
    {
      name: "expense-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ expenses: state.expenses }),
    },
  ),
);

// Cart Item for product management
interface CartItem {
  id: string;
  item_id?: string;
  item_type?: "asset" | "retail" | "refill";
  name: string;
  image?: { uri: string } | null;
  price: number;
  quantity: number;
  currency: string;
  category?: string; // Product category
  type?: "5L" | "10L" | "300ml" | "1L" | "20L" | "dispenser"; // Optional - not used in UI
}

type SelectedPaymentMethod = "cash" | "wallet" | "credit" | "check";

export type DirectSaleDraftPaymentMethod = SelectedPaymentMethod;

export interface DirectSaleDraftProduct {
  id: string;
  type: "retail" | "refill" | "assets" | "other";
  itemId: string;
  label: string;
  pricePerUnit: number;
  unit: string | null;
  image_url: string | null;
  category?: string | null;
  assetCategory?: string | null;
  originalPrice?: number;
  badge?: string;
  loaded_quantity?: number | string;
  available_stock?: number | string;
}

export interface DirectSaleDraftCustomerSite {
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

export interface DirectSaleDraftCustomer {
  id: string;
  name: string;
  phone: string;
  sites: DirectSaleDraftCustomerSite[];
}

export interface DirectSaleDraftCheckDetails {
  checkNumber: string;
  checkDate: string;
  bankName: string;
  accountNumber: string;
}

export interface DirectSaleDraftLocation {
  latitude: number;
  longitude: number;
  address: string;
}

export interface DirectSaleDraftAssetDraft {
  selected: boolean;
  price: string;
}

export interface DirectSaleDraft {
  products: DirectSaleDraftProduct[];
  quantities: Record<string, number>;
  customerData: DirectSaleDraftCustomer | null;
  selectedSite: DirectSaleDraftCustomerSite | null;
  paymentMethod: DirectSaleDraftPaymentMethod;
  checkDetails: DirectSaleDraftCheckDetails;
  remark: string;
  location: DirectSaleDraftLocation | null;
  truckBulkItems: TruckBulkItem[];
  truckAssets: TruckAsset[];
  heldItems: CustomerHeldItems;
  assetDrafts: Record<string, DirectSaleDraftAssetDraft>;
  bottleDepositPrices: Record<string, string>;
  bottleDepositQuantities: Record<string, number>;
  bottleReturnQuantities: Record<string, number>;
  creditCollectionAmount: string;
  creditCollectionRemark: string;
}

type LastConfirmPaymentResponse = {
  orderId: string;
  sale_id?: string;
  invoice_number?: string;
  order_number: string;
  detail?: DriverHistoryDetail | null;
};

// Enhanced Order Store with new Order structure
interface OrderStore {
  // Order management
  assignedOrders: Order[];
  selectedOrder: string | null;
  completedOrders: Order[];

  // Driver management
  currentDriver: Driver | null;

  // Product management
  products: Product[];
  cartItems: CartItem[];

  // Payment management
  selectedPaymentMethod: SelectedPaymentMethod;
  lastConfirmPaymentResponse: LastConfirmPaymentResponse | null;
  directSaleDraft: DirectSaleDraft | null;

  // Order actions
  selectOrder: (id: string) => void;
  updateOrderStatus: (
    id: string,
    status: Order["status"],
    failureReason?: string,
    failureNote?: string,
  ) => void;
  setAssignedOrders: (orders: Order[]) => void;

  // Driver actions
  updateDriverInfo: (info: {
    driver_number: string;
    name: string;
    helper_name: string;
    helper_phone: string;
    vehicle_name: string;
    vehicle_id: string;
    vehicle_plate: string;
    zones: string[]; // Array of zone names
    status: "online" | "offline";
    phone: string;
  }) => void;

  // Product actions
  setProducts: (products: Product[]) => void;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getAvailableStock: (productId: string) => number; // Get available stock for a product (loaded_quantity - cart quantity)

  // Payment actions
  setPaymentMethod: (method: SelectedPaymentMethod) => void;
  setLastConfirmPaymentResponse: (
    data: LastConfirmPaymentResponse | null,
  ) => void;
  setDirectSaleDraft: (draft: DirectSaleDraft | null) => void;
  clearDirectSaleDraft: () => void;

  // Utility actions
  getOrderHistory: () => Order[];
  getDriverMetrics: () => Driver["metrics"] | null;
}

export const useOrderStore = create<OrderStore>()(
  persist(
    (set, get) => ({
      // Order management state
      assignedOrders: [],
      selectedOrder: null,
      completedOrders: [],

      // Driver management state
      currentDriver: null,

      // Product management state
      products: [],
      cartItems: [],

      // Payment management state
      selectedPaymentMethod: "cash" as SelectedPaymentMethod,
      lastConfirmPaymentResponse: null,
      directSaleDraft: null,

      // Order management actions
      setAssignedOrders: (orders) => set(() => ({ assignedOrders: orders })),

      selectOrder: (id: string) => {
        set({ selectedOrder: id });
      },

      updateOrderStatus: (
        id: string,
        status: Order["status"],
        failureReason?: string,
        failureNote?: string,
      ) => {
        set((state) => {
          const order = state.assignedOrders.find((o) => o.id === id);
          if (!order) return state;

          const updatedOrder: Order = {
            ...order,
            status,
            delivery: {
              ...order.delivery,
              distance_km:
                order.delivery?.distance_km ?? order.distance_km ?? 0,
              delivery_zone:
                order.delivery?.delivery_zone ??
                order.delivery_zone ??
                "General",
              ...(status === "failed"
                ? { failure_reason: failureReason, failure_note: failureNote }
                : {}),
              ...(status === "delivered"
                ? { delivered_at: new Date().toISOString() }
                : {}),
              ...(status === "in_progress"
                ? { started_at: new Date().toISOString() }
                : {}),
            },
          };

          // If order is delivered or failed, remove from assignedOrders and add to completedOrders
          if (status === "delivered" || status === "failed") {
            return {
              assignedOrders: state.assignedOrders.filter((o) => o.id !== id),
              completedOrders: [...state.completedOrders, updatedOrder],
            };
          }

          // Otherwise, just update the status in assignedOrders
          return {
            assignedOrders: state.assignedOrders.map((o) =>
              o.id === id ? updatedOrder : o,
            ),
          };
        });
      },

      // Driver management actions
      updateDriverInfo: (info) => {
        set((state) => {
          const authenticatedDriverId = useAuthStore
            .getState()
            .user?.id?.trim();
          const existingDriverId = state.currentDriver?.id?.trim();
          const nextDriverId =
            authenticatedDriverId ||
            existingDriverId ||
            info.driver_number.trim();

          // Create a completely new driver object to ensure Zustand detects the change
          // This is critical for React to detect the update and re-render
          console.log("Updating driver info:", info);
          const updatedDriver: Driver = {
            id: nextDriverId,
            driver_number: info.driver_number,
            name: info.name,
            helper_name: info.helper_name || undefined,
            helper_phone: info.helper_phone || undefined,
            phone: info.phone,
            profile_image: state.currentDriver?.profile_image,
            vehicle: {
              type: info.vehicle_name,
              plate_number: info.vehicle_plate,
            },
            status: info.status,
            current_location: state.currentDriver?.current_location || {
              latitude: 0,
              longitude: 0,
              address: "",
              updated_at: new Date().toISOString(),
            },
            zones:
              Array.isArray(info.zones) && info.zones.length > 0
                ? info.zones
                : undefined,
          };

          return { currentDriver: updatedDriver };
        });
      },

      // Product management actions
      setProducts: (products: Product[]) => {
        set({ products });
      },

      addToCart: (product: Product, quantity: number) => {
        set((state) => {
          if (!product?.id || !product?.name) return state;

          // Check available stock
          const availableStock =
            product.loaded_quantity !== undefined
              ? product.loaded_quantity -
                (state.cartItems.find((item) => item.id === product.id)
                  ?.quantity || 0)
              : Infinity;

          // Limit quantity to available stock
          const maxQuantity = Math.max(0, availableStock);
          if (maxQuantity === 0 && quantity > 0) {
            // No stock available, don't add
            return state;
          }

          const actualQuantity = Math.min(quantity, maxQuantity);

          const existingItem = state.cartItems.find(
            (item) => item.id === product.id,
          );
          if (existingItem) {
            const newQuantity = existingItem.quantity + actualQuantity;
            // Check if new total exceeds available stock
            const finalQuantity =
              product.loaded_quantity !== undefined
                ? Math.min(newQuantity, product.loaded_quantity)
                : newQuantity;

            if (finalQuantity <= 0) {
              // Remove from cart if quantity becomes 0
              return {
                cartItems: state.cartItems.filter(
                  (item) => item.id !== product.id,
                ),
              };
            }

            return {
              cartItems: state.cartItems.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: finalQuantity }
                  : item,
              ),
            };
          }

          return {
            cartItems: [
              ...state.cartItems,
              {
                id: product.id,
                item_id: product.item_id,
                item_type: product.item_type,
                name: product.name,
                image: product.image_url ? { uri: product.image_url } : null,
                price:
                  typeof product.pricing === "number" ? product.pricing : 0,
                quantity: actualQuantity,
                currency: "AED",
                category: product.category, // Include category from product
              },
            ],
          };
        });
      },

      removeFromCart: (productId: string) => {
        set((state) => ({
          cartItems: state.cartItems.filter((item) => item.id !== productId),
        }));
      },

      updateCartItemQuantity: (productId: string, quantity: number) => {
        set((state) => {
          if (quantity <= 0) {
            return {
              cartItems: state.cartItems.filter(
                (item) => item.id !== productId,
              ),
            };
          }

          // Check available stock
          const product = state.products.find((p) => p.id === productId);
          if (product && product.loaded_quantity !== undefined) {
            // Limit quantity to loaded_quantity
            const maxQuantity = product.loaded_quantity;
            const limitedQuantity = Math.min(quantity, maxQuantity);

            return {
              cartItems: state.cartItems.map((item) =>
                item.id === productId
                  ? { ...item, quantity: limitedQuantity }
                  : item,
              ),
            };
          }

          return {
            cartItems: state.cartItems.map((item) =>
              item.id === productId ? { ...item, quantity } : item,
            ),
          };
        });
      },

      clearCart: () => {
        set({ cartItems: [] });
      },

      getAvailableStock: (productId: string) => {
        const state = get();
        // Find the product to get its loaded_quantity
        const product = state.products.find((p) => p.id === productId);
        if (!product || typeof product.loaded_quantity !== "number") {
          return Infinity; // No limit if product not found or no loaded_quantity
        }

        // Get current cart quantity for this product
        const cartItem = state.cartItems.find((item) => item.id === productId);
        const cartQuantity = cartItem?.quantity || 0;

        // Available stock = loaded_quantity - cart quantity
        return Math.max(0, product.loaded_quantity - cartQuantity);
      },

      // Payment management actions
      setPaymentMethod: (method: SelectedPaymentMethod) => {
        set({ selectedPaymentMethod: method });
      },
      setLastConfirmPaymentResponse: (data) => {
        set({ lastConfirmPaymentResponse: data });
      },
      setDirectSaleDraft: (draft) => {
        set({ directSaleDraft: draft });
      },
      clearDirectSaleDraft: () => {
        set({ directSaleDraft: null });
      },

      // Utility actions
      getOrderHistory: () => {
        return get().completedOrders;
      },

      getDriverMetrics: () => {
        const state = get();
        return state.currentDriver?.metrics || null;
      },
    }),
    {
      name: "order-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        cartItems: state.cartItems,
        currentDriver: state.currentDriver,
        products: state.products,
        completedOrders: state.completedOrders,
        selectedOrder: state.selectedOrder,
        directSaleDraft: state.directSaleDraft,
      }),
    },
  ),
);

// Export types for use in components
export type { CartItem, Driver, Order, Product };
