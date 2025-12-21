// Core Order Structure - Supports both nested and flat structures for backward compatibility
export interface Order {
  // Basic Order Info
  id: string;
  order_number: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'delivered' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
  
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
  special_requirements?: string;
  is_regular_customer?: boolean;
  
  // Product Details (Dynamic structure - can contain any product names and quantities)
  products?: Record<string, number>;
  
  // Pricing & Payment (Embedded - for backward compatibility)
  pricing?: {
    subtotal: number;
    delivery_fee: number;
    vat: number;
    total_amount: number;
    payment_method: 'cash' | 'wallet' | 'credit_card';
    payment_status: 'pending' | 'paid' | 'failed';
    driver_commission?: number;
  };
  
  // Pricing & Payment (Flat structure - new API format)
  subtotal?: number;
  delivery_fee?: number;
  vat?: number;
  total_amount?: number;
  wallet_balance?: number;
  payment_method?: 'cash' | 'wallet' | 'credit_card';
  payment_status?: 'pending' | 'paid' | 'failed';
  driver_commission?: number;
  
  // Delivery Details (Embedded - for backward compatibility)
  delivery?: {
    scheduled_time?: string;
    estimated_duration?: number;
    actual_duration?: number;
    distance_km: number;
    delivery_zone: string;
    started_at?: string;
    delivered_at?: string;
    delivery_notes?: string;
    failure_reason?: string;
    customer_rating?: number;
    customer_feedback?: string;
    proof_of_delivery?: string;
  };
  
  // Delivery Details (Flat structure - new API format)
  scheduled_time?: string;
  estimated_duration?: number;
  actual_duration?: number;
  distance_km?: number;
  delivery_zone?: string;
  started_at?: string;
  delivered_at?: string;
  delivery_notes?: string;
  failure_reason?: string;
  customer_rating?: number;
  customer_feedback?: string;
  proof_of_delivery?: string;
  
  // Tracking & Analytics (Embedded - for backward compatibility)
  tracking?: {
    assigned_at?: string;
    accepted_at?: string;
    started_at?: string;
    completed_at?: string;
    total_working_time?: number;
    fuel_cost?: number;
    expenses?: number;
  };
  
  // Tracking & Analytics (Flat structure - new API format)
  assigned_at?: string;
  accepted_at?: string;
  completed_at?: string;
  total_working_time?: number;
  fuel_cost?: number;
  expenses?: number;
  
  // Availability times
  start_time?: string;
  end_time?: string;
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
  type: '5L' | '10L' | '300ml' | '1L' | '20L' | 'dispenser';
  description: string;
  image_url: string;
  
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
