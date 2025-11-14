// Core Order Structure - Supports both nested and flat structures for backward compatibility
export interface Order {
  // Basic Order Info
  id: string;
  order_number: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'delivered' | 'failed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  driver_id?: number;
  
  // Customer Information (Embedded - for backward compatibility)
  customer?: {
    id: string;
    site_id?: string;
    name: string;
    phone: string;
    email?: string;
    address: string;
    latitude: number;
    longitude: number;
    delivery_instructions?: string;
    special_requirements?: string;
    is_regular?: boolean;
  };
  
  // Customer Information (Flat structure - new API format)
  customer_id?: string;
  customer_site_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  latitude?: number;
  longitude?: number;
  delivery_instructions?: string;
  special_requirements?: string;
  is_regular_customer?: boolean;
  
  // Product Details (Dynamic structure - can contain any product names and quantities)
  products?: Record<string, number>;
  
  // Legacy flat product fields (for backward compatibility)
  five_litre_bottles?: number;
  ten_litre_bottles?: number;
  three_hundred_ml_bottles?: number;
  one_litre_bottles?: number;
  twenty_litre_bottles?: number;
  water_dispenser?: number;
  
  // Pricing & Payment (Embedded - for backward compatibility)
  pricing?: {
    subtotal: number;
    delivery_fee: number;
    vat: number;
    total_amount: number;
    payment_method: 'cash' | 'card' | 'wallet';
    payment_status: 'pending' | 'paid' | 'failed';
    driver_commission?: number;
  };
  
  // Pricing & Payment (Flat structure - new API format)
  subtotal?: number;
  delivery_fee?: number;
  vat?: number;
  total_amount?: number;
  wallet_balance?: number;
  payment_method?: 'cash' | 'card' | 'wallet';
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
  clerk_id: string;
  name: string;
  email: string;
  phone: string;
  profile_image?: string;
  
  // Vehicle & License
  vehicle: {
    type: string;
    plate_number: string;
    model: string;
    year: number;
    capacity: number;
  };
  
  // Status & Location
  status: 'online' | 'offline' | 'busy' | 'unavailable';
  current_location: {
    latitude: number;
    longitude: number;
    address: string;
    updated_at: string;
  };
  
  // Performance Metrics
  metrics: {
    total_deliveries: number;
    completed_deliveries: number;
    failed_deliveries: number;
    average_rating: number;
    total_earnings: number;
    total_distance_km: number;
    average_delivery_time: number;
    customer_satisfaction: number;
  };
  
  // Financial
  earnings: {
    daily_earnings: number;
    weekly_earnings: number;
    monthly_earnings: number;
    commission_rate: number;
    pending_payments: number;
    total_paid: number;
  };
  
  // Work Schedule
  schedule: {
    working_days: string[];
    start_time: string;
    end_time: string;
    is_available: boolean;
    preferred_zones: string[];
  };
  
  // Account Info
  account: {
    joined_date: string;
    last_active: string;
    is_active: boolean;
    emergency_contact: string;
    bank_details?: {
      account_number: string;
      bank_name: string;
      branch_code: string;
    };
  };
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
  pricing: {
    cost_price: number;
    selling_price: number;
    driver_commission: number;
    profit_margin: number;
  };
  
  // Inventory
  inventory: {
    current_stock: number;
    reserved_stock: number;
    available_stock: number;
    minimum_stock: number;
    maximum_stock: number;
    warehouse_location: string;
  };
  
  // Product Details
  details: {
    weight: number;
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
    material: string;
    brand: string;
    expiry_date?: string;
    batch_number?: string;
  };
}
