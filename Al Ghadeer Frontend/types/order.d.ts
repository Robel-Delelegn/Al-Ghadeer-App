// Confirm payment request/response types
export interface ConfirmPaymentRequest {
  customer_site_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  products: Array<{
    id?: string;
    name: string;
    quantity: number;
    price: number;
    category?: "bulk_item" | "asset" | "refill";
  }>;
  subtotal: number;
  vat: number;
  total_amount: number;
  payment_method: string;
  order_type?: "site" | "external";
  signature_data?: string;
  receiver_name?: string;
  receiver_position?: string;
  remark?: string;
  reasons: Array<{
    type: "customer_request" | "external_request" | "subscription";
    id: string;
  }>;
  other_actions?: Array<{
    id: string;
    name: string;
    type:
      | "item-movement-from-customer"
      | "item-movement-to-customer"
      | "asset-movement-from-customer"
      | "asset-movement-to-customer"
      | "deposit"
      | "deposit-refund";
    price: number;
    quantity?: number;
    item_type?: "asset" | "bottle";
  }>;
}

export interface ConfirmPaymentResponse {
  success: true;
  data: {
    message: string;
    order_number: string;
    delivery_report_id: string;
    created_at: string;
    invoice_number?: string;
    sale_id: string; // Use this for invoice generation
    delivery_info?: {
      signature_resource_id?: string;
      receiver_name?: string;
      receiver_position?: string;
      remark?: string;
    };
  };
}

// API Response type for /driver/orders - expected response from orders endpoint
export interface OrdersResponse {
  success: true;
  data: ApiOrderItem[];
}

export interface ApiOrderItem {
  order_number: string;
  status: string;
  delivery_address: string;
  latitude: number;
  longitude: number;
  delivery_instructions: string | null;
  start_time: string;
  end_time: string;
  total_amount: number;
  delivery_zone: string | null;
  payment_method: string;
  order_type?: "site" | "external";
  products: Array<{
    id: string;
    name: string;
    quantity: number;
    category: "retail-item" | "refill" | "assets";
    price: number;
    in_truck: boolean;
  }>;
  other_actions?: Array<{
    id: string;
    item: {
      id: string;
      label: string;
      type: "asset" | "bottle";
      image_url: string | null;
    };
    quantity: number;
    price_per_unit: number;
    type:
      | "item-movement-from-customer"
      | "item-movement-to-customer"
      | "asset-movement-from-customer"
      | "asset-movement-to-customer"
      | "deposit"
      | "deposit-refund";
    request_id?: string;
    customer_location_id?: string;
    direction?: "from_inventory" | "to_inventory";
  }>;
  reasons: Array<{
    type: "customer_request" | "external_request" | "subscription";
    id: string;
  }>;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    site_id: string;
    availability: {
      start_time: string;
      end_time: string;
    } | null;
    requires_signature: boolean;
    customer_type: string;
  } | null;
}

// Core Order Structure - Supports both nested and flat structures for backward compatibility
export interface Order {
  // Basic Order Info
  id: string;
  order_number: string;
  display_id?: string;
  date?: string;
  invoice_number?: string;
  status:
    | "pending"
    | "assigned"
    | "in_progress"
    | "delivered"
    | "failed"
    | "cancelled";
  // Customer Information (Flat structure - new API format)
  customer_id?: string;
  customer_site_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_type?: "individual" | "organization";
  latitude?: number;
  longitude?: number;
  delivery_instructions?: string;
  route_id?: string;
  route_name?: string;
  driver_id?: string;
  earlier_visits_today_count?: number;
  has_new_items?: boolean;
  has_exact_location?: boolean;
  tasks?: unknown[];

  // Product Details - supports both array format (new) and Record format (legacy)
  // New format: Array of product objects with id, name, quantity, type, category
  // Legacy format: Record<string, number> where key is product name and value is quantity
  products?:
    | Array<{
        id: string;
        item_id?: string;
        name: string;
        quantity: number;
        price?: number;
        unit?: string | null;
        image_url?: string | null;
        type?: string;
        category?: string;
      }>
    | Record<string, number>;
  total_amount?: number;
  wallet_balance?: number;
  payment_method?:
    | "cash"
    | "wallet"
    | "credit"
    | "check"
    | "invoice"
    | "credit_invoice"; // invoice/credit_invoice from API shown as Credit
  payment_status?: "pending" | "paid" | "failed" | "due";
  zone?: string;
  delivery_zone?: string;
  // Availability times
  start_time?: string;
  end_time?: string;
  // Completion time (for history)
  completed_at?: string;
  // Signature requirement
  requires_signature?: boolean;
  requires_immediate_invoice?: boolean;
  // Rent items - items that are borrowed or deposited
  rent_items?: Array<{
    id: string;
    name: string;
    category: "borrow" | "deposit";
    price: number;
    quantity: number;
    image_url: string;
    in_truck?: boolean; // Whether the item is currently in the truck
    other_action_type?: NonNullable<
      ConfirmPaymentRequest["other_actions"]
    >[0]["type"];
    other_action_item_type?: NonNullable<
      ConfirmPaymentRequest["other_actions"]
    >[0]["item_type"];
  }>;
  // Reasons for the order - same structure as API (do not parse)
  reasons?: Array<{
    type: "customer_request" | "external_request" | "subscription";
    id: string;
  }>;
}

// Driver Structure
export interface Driver {
  // Basic Info
  id: string;
  driver_number?: string;
  name: string;
  helper_name?: string;
  helper_phone?: string;
  phone: string;
  profile_image?: string;

  // Vehicle & License
  vehicle: {
    type: string;
    plate_number: string;
  };

  // Status & Location
  status: "online" | "offline";
  current_location: {
    latitude: number;
    longitude: number;
    address: string;
    updated_at: string;
  };
  zones?: string[]; // Array of zone names
}

// Product Structure
export interface Product {
  // Basic Info
  id: string;
  item_id?: string;
  item_type?: "asset" | "retail" | "refill";
  name: string;
  description: string;
  image_url: string;
  category?: string; // Product category

  // Pricing
  pricing: number;

  // Loaded quantity - quantity loaded on the vehicle for this product
  loaded_quantity?: number;

  // Inventory
  inventory?: {
    current_stock: number;
    reserved_stock: number;
    available_stock: number;
    minimum_stock: number;
    maximum_stock: number;
    warehouse_location: string;
  };
}
