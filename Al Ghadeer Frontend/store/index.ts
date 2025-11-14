import { Driver, Order, Product } from "@/types/order";
import { DriverStore, LocationStore, MarkerData } from "@/types/type";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const useLocationStore = create<LocationStore>((set)=>({
    userAddress: null,
    userLongitude: null,
    userLatitude: null,
    destinationLongitude: null,
    destinationLatitude: null,
    destinationAddress: null,
    setUserLocation: ({latitude, longitude, address}) => set({userLatitude: latitude, userLongitude: longitude, userAddress: address }),
    setDestinationLocation: ({latitude, longitude, address}) => set({destinationLatitude: latitude, destinationLongitude: longitude, destinationAddress: address })

}))

export const useDriverStore = create<DriverStore>((set) => ({
    drivers: [] as MarkerData[],
    selectedDriver: null,
    setSelectedDriver: (driverId: number) => set({ selectedDriver: driverId}),
    setDrivers: (drivers: MarkerData[])=>set({drivers: drivers}),
    clearSelectedDriver: () => set({selectedDriver: null})
}))

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
  addExpense: (expense: Omit<ExpenseItem, 'id' | 'createdAt'>) => ExpenseItem;
  clearExpenses: () => void;
}

export const useExpenseStore = create<ExpenseStore>()(persist(
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
    clearExpenses: () => set({ expenses: [] })
  }),
  {
    name: 'expense-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({ expenses: state.expenses })
  }
));

// Cart Item for product management
interface CartItem {
  id: string;
  name: string;
  image: any;
  price: number;
  quantity: number;
  currency: string;
  type: '5L' | '10L' | '300ml' | '1L' | '20L' | 'dispenser';
}

interface ShippingDetails {
  name: string;
  address: string;
  contact: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  selected: boolean;
  icon: string;
}

interface OrderSummary {
  orderId: string;
  cartItems: CartItem[];
  shippingDetails: ShippingDetails;
  selectedPaymentMethod: string;
  subtotal: string;
  vat: string;
  totalWithVat: string;
  paymentDate?: string;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'failed';
}

// Enhanced Order Store with new Order structure
interface OrderStore {
  // Order management
  availableOrders: Order[];
  assignedOrders: Order[];
  selectedOrder: string | null;
  completedOrders: Order[];
  
  // Driver management
  currentDriver: Driver | null;
  
  // Product management
  products: Product[];
  cartItems: CartItem[];
  
  // Payment management
  selectedPaymentMethod: 'cash' | 'card';
  
  // Order actions
  selectOrder: (id: string) => void;
  acceptOrder: (id: string) => void;
  updateOrderStatus: (id: string, status: Order['status'], failureReason?: string, failureNote?: string) => void;
  setAssignedOrders: (orders: Order[]) => void;
  setAvailableOrders: (orders: Order[]) => void;
  completeOrder: (orderId: string) => void;
  
  // Driver actions
  setCurrentDriver: (driver: Driver) => void;
  initializeDriver: (user: any) => void;
  updateDriverStatus: (status: Driver['status']) => void;
  updateDriverLocation: (latitude: number, longitude: number, address: string) => void;
  
  // Product actions
  setProducts: (products: Product[]) => void;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Payment actions
  setPaymentMethod: (method: 'cash' | 'card') => void;
  
  // Utility actions
  getOrderHistory: () => Order[];
  getDriverMetrics: () => Driver['metrics'] | null;
}

export const useOrderStore = create<OrderStore>()(persist(
  (set, get) => ({
    // Order management state
    availableOrders: [],
    assignedOrders: [],
    selectedOrder: null,
    completedOrders: [],
    
    // Driver management state
    currentDriver: null,
    
    // Product management state
    products: [],
    cartItems: [],
    
    // Payment management state
    selectedPaymentMethod: 'cash' as 'cash' | 'card',

    
    // Order management actions
    setAssignedOrders: (orders) => set(() => ({ assignedOrders: orders })),
    setAvailableOrders: (orders) => set(() => ({ availableOrders: orders })),
    
    selectOrder: (id: string) => {
      set({ selectedOrder: id });
    },
    
    acceptOrder: (id: string) => {
      set((state) => {
        const order = state.availableOrders.find(o => o.id === id);
        if (order) {
          const updatedOrder = {
            ...order,
            status: 'assigned' as Order['status'],
            tracking: {
              ...order.tracking,
              assigned_at: new Date().toISOString()
            }
          };
          return {
            availableOrders: state.availableOrders.filter(o => o.id !== id),
            assignedOrders: [...state.assignedOrders, updatedOrder]
          };
        }
        return state;
      });
    },
    
    updateOrderStatus: (id: string, status: Order['status'], failureReason?: string, failureNote?: string) => {
      set((state) => ({
        assignedOrders: state.assignedOrders.map(o =>
          o.id === id
            ? { 
                ...o, 
                status,
                delivery: {
                  ...o.delivery,
                  ...(status === 'failed' ? { failure_reason: failureReason, failure_note: failureNote } : {}),
                  ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
                  ...(status === 'in_progress' ? { started_at: new Date().toISOString() } : {})
                }
              }
            : o
        )
      }));
    },
    
    completeOrder: (orderId: string) => {
      set((state) => {
        const order = state.assignedOrders.find(o => o.id === orderId);
        if (order) {
          const completedOrder = {
            ...order,
            status: 'delivered' as Order['status'],
            delivery: {
              ...order.delivery,
              delivered_at: new Date().toISOString()
            }
          };
          return {
            assignedOrders: state.assignedOrders.filter(o => o.id !== orderId),
            completedOrders: [...state.completedOrders, completedOrder]
          };
        }
        return state;
      });
    },
    
    // Driver management actions
    setCurrentDriver: (driver: Driver) => {
      set({ currentDriver: driver });
    },
    
    initializeDriver: (user: any) => {
      const driverData: Driver = {
        id: "b97f3fc1-0708-4b97-bf5d-deb424b2cd93",
        clerk_id: user.id,
        name: user.fullName || 'Driver',
        email: user.emailAddresses[0]?.emailAddress || '',
        phone: user.primaryPhoneNumber?.phoneNumber || '',
        profile_image: user.imageUrl,
        vehicle: {
          type: 'Van',
          plate_number: 'ABC-123',
          model: 'Ford Transit',
          year: 2020,
          capacity: 1000
        },
        status: 'online',
        current_location: {
          latitude: 0,
          longitude: 0,
          address: '',
          updated_at: new Date().toISOString()
        },
        metrics: {
          total_deliveries: 0,
          completed_deliveries: 0,
          failed_deliveries: 0,
          average_rating: 0,
          total_earnings: 0,
          total_distance_km: 0,
          average_delivery_time: 0,
          customer_satisfaction: 0
        },
        earnings: {
          daily_earnings: 0,
          weekly_earnings: 0,
          monthly_earnings: 0,
          commission_rate: 0.15,
          pending_payments: 0,
          total_paid: 0
        },
        schedule: {
          working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          start_time: '08:00',
          end_time: '18:00',
          is_available: true,
          preferred_zones: []
        },
        account: {
          joined_date: new Date().toISOString(),
          last_active: new Date().toISOString(),
          is_active: true,
          emergency_contact: ''
        }
      };
      set({ currentDriver: driverData });
    },
    
    updateDriverStatus: (status: Driver['status']) => {
      set((state) => ({
        currentDriver: state.currentDriver ? { ...state.currentDriver, status } : null
      }));
    },
    
    updateDriverLocation: (latitude: number, longitude: number, address: string) => {
      set((state) => ({
        currentDriver: state.currentDriver ? {
          ...state.currentDriver,
          current_location: {
            latitude,
            longitude,
            address,
            updated_at: new Date().toISOString()
          }
        } : null
      }));
    },
    
    // Product management actions
    setProducts: (products: Product[]) => {
      set({ products });
    },
    
    addToCart: (product: Product, quantity: number) => {
      set((state) => {
        // Validate product structure
        if (!product || !product.id || !product.name) {
          console.error('Invalid product passed to addToCart:', product);
          return state;
        }

        const existingItem = state.cartItems.find(item => item.id === product.id);
        if (existingItem) {
          return {
            cartItems: state.cartItems.map(item =>
              item.id === product.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          };
        } else {
          // Safe access to pricing with fallback
          const price = product.pricing?.selling_price || 0;
          const imageUrl = product.image_url || 'https://via.placeholder.com/150';
          
          console.log('Adding product to cart:', {
            id: product.id,
            name: product.name,
            price: price,
            quantity: quantity,
            imageUrl: imageUrl
          });

          return {
            cartItems: [...state.cartItems, {
              id: product.id,
              name: product.name,
              image: { uri: imageUrl },
              price: price,
              quantity,
              currency: 'AED',
              type: product.type
            }]
          };
        }
      });
    },
    
    removeFromCart: (productId: string) => {
      set((state) => ({
        cartItems: state.cartItems.filter(item => item.id !== productId)
      }));
    },
    
    updateCartItemQuantity: (productId: string, quantity: number) => {
      set((state) => {
        if (quantity <= 0) {
          return {
            cartItems: state.cartItems.filter(item => item.id !== productId)
          };
        }
        return {
          cartItems: state.cartItems.map(item =>
            item.id === productId ? { ...item, quantity } : item
          )
        };
      });
    },
    
    clearCart: () => {
      set({ cartItems: [] });
    },
    
    // Payment management actions
    setPaymentMethod: (method: 'cash' | 'card') => {
      set({ selectedPaymentMethod: method });
    },
    
    // Utility actions
    getOrderHistory: () => {
      return get().completedOrders;
    },
    
    getDriverMetrics: () => {
      const state = get();
      return state.currentDriver?.metrics || null;
    }
  }),
  {
    name: 'order-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      cartItems: state.cartItems,
      currentDriver: state.currentDriver,
      products: state.products,
      completedOrders: state.completedOrders,
      selectedOrder: state.selectedOrder
    })
  }
));

// Export types for use in components
export type { CartItem, Driver, Order, Product };

