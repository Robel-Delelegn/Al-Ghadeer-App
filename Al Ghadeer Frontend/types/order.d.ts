// Core Order Structure - Supports both nested and flat structures for backward compatibility
export interface Order {
  // Basic Order Info
  id: string;
  order_number: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'delivered' | 'failed' | 'cancelled';
  // Customer Information (Flat structure - new API format)
  customer_id?: string;
  customer_site_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_type?: 'individual' | 'organization';
  latitude?: number;
  longitude?: number;
  delivery_instructions?: string;
  
  // Product Details - supports both array format (new) and Record format (legacy)
  // New format: Array of product objects with id, name, quantity, type, category
  // Legacy format: Record<string, number> where key is product name and value is quantity
  products?: Array<{
    id: string;
    name: string;
    quantity: number;
    type?: string;
    category?: string;
  }> | Record<string, number>;
  total_amount?: number;
  wallet_balance?: number;
  payment_method?: 'cash' | 'wallet' | 'credit_card';
  payment_status?: 'pending' | 'paid' | 'failed' | 'due';
  zone?: string;
  // Availability times
  start_time?: string;
  end_time?: string;
  // Signature requirement
  requires_signature?: boolean;
}

// Driver Structure
export interface Driver {
  // Basic Info
  id: string;
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
  status: 'online' | 'offline';
  current_location: {
    latitude: number;
    longitude: number;
    address: string;
    updated_at: string;
  };
  zone?: string;
}

// Product Structure
export interface Product {
  // Basic Info
  id: string;
  name: string;
  description: string;
  image_url: string;
  category?: string; // Product category
  
  // Pricing
  pricing: number;
  
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
