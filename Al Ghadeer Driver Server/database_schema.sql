-- =====================================================
-- AL GHADEER WATER DELIVERY - DATABASE SCHEMA
-- =====================================================
-- This schema supports the complete frontend data structure
-- Run these commands in your PostgreSQL database

-- =====================================================
-- 1. USERS TABLE (for driver authentication)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. ORDERS TABLE (main orders table with all fields)
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
    -- Basic Order Info
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'delivered', 'failed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Customer Information
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    customer_address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    delivery_instructions TEXT,
    special_requirements TEXT,
    is_regular_customer BOOLEAN DEFAULT FALSE,
    
    -- Product Details
    five_litre_bottles INTEGER DEFAULT 0,
    ten_litre_bottles INTEGER DEFAULT 0,
    three_hundred_ml_bottles INTEGER DEFAULT 0,
    one_litre_bottles INTEGER DEFAULT 0,
    twenty_litre_bottles INTEGER DEFAULT 0,
    water_dispenser INTEGER DEFAULT 0,
    
    -- Pricing & Payment
    subtotal DECIMAL(10, 2) DEFAULT 0,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    vat DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'wallet')),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    driver_commission DECIMAL(10, 2) DEFAULT 0,
    
    -- Delivery Details
    scheduled_time TIMESTAMP,
    estimated_duration INTEGER DEFAULT 0, -- in minutes
    actual_duration INTEGER, -- in minutes
    distance_km DECIMAL(8, 2) DEFAULT 0,
    delivery_zone VARCHAR(100),
    started_at TIMESTAMP,
    delivered_at TIMESTAMP,
    delivery_notes TEXT,
    failure_reason TEXT,
    failure_note TEXT,
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    customer_feedback TEXT,
    proof_of_delivery TEXT, -- URL or file path
    
    -- Tracking & Analytics
    assigned_at TIMESTAMP,
    accepted_at TIMESTAMP,
    completed_at TIMESTAMP,
    total_working_time INTEGER, -- in minutes
    fuel_cost DECIMAL(10, 2),
    expenses DECIMAL(10, 2)
);

-- =====================================================
-- 3. DRIVERS TABLE (for driver management)
-- =====================================================
CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    profile_image TEXT,
    
    -- Vehicle Information
    vehicle_type VARCHAR(50) DEFAULT 'Van',
    plate_number VARCHAR(20),
    vehicle_model VARCHAR(100),
    vehicle_year INTEGER,
    vehicle_capacity INTEGER DEFAULT 1000, -- in liters
    
    -- Status & Location
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'unavailable')),
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    current_address TEXT,
    location_updated_at TIMESTAMP,
    
    -- Performance Metrics
    total_deliveries INTEGER DEFAULT 0,
    completed_deliveries INTEGER DEFAULT 0,
    failed_deliveries INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_earnings DECIMAL(12, 2) DEFAULT 0,
    total_distance_km DECIMAL(10, 2) DEFAULT 0,
    average_delivery_time INTEGER DEFAULT 0, -- in minutes
    customer_satisfaction DECIMAL(3, 2) DEFAULT 0,
    
    -- Financial
    daily_earnings DECIMAL(10, 2) DEFAULT 0,
    weekly_earnings DECIMAL(10, 2) DEFAULT 0,
    monthly_earnings DECIMAL(10, 2) DEFAULT 0,
    commission_rate DECIMAL(5, 4) DEFAULT 0.15,
    pending_payments DECIMAL(10, 2) DEFAULT 0,
    total_paid DECIMAL(12, 2) DEFAULT 0,
    
    -- Work Schedule
    working_days TEXT[], -- Array of days: ['Monday', 'Tuesday', ...]
    start_time TIME DEFAULT '08:00',
    end_time TIME DEFAULT '18:00',
    is_available BOOLEAN DEFAULT TRUE,
    preferred_zones TEXT[], -- Array of delivery zones
    
    -- Account Info
    joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    emergency_contact VARCHAR(20),
    
    -- Bank Details (optional)
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(100),
    bank_branch_code VARCHAR(20),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. PRODUCTS TABLE (for product management)
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('5L', '10L', '300ml', '1L', '20L', 'dispenser')),
    description TEXT,
    image_url TEXT,
    
    -- Pricing
    cost_price DECIMAL(10, 2) NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    driver_commission DECIMAL(10, 2) DEFAULT 0,
    profit_margin DECIMAL(5, 4) DEFAULT 0,
    
    -- Inventory
    current_stock INTEGER DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    available_stock INTEGER DEFAULT 0,
    minimum_stock INTEGER DEFAULT 10,
    maximum_stock INTEGER DEFAULT 200,
    warehouse_location VARCHAR(100),
    
    -- Product Details
    weight DECIMAL(8, 2), -- in kg
    length DECIMAL(8, 2), -- in cm
    width DECIMAL(8, 2), -- in cm
    height DECIMAL(8, 2), -- in cm
    material VARCHAR(100),
    brand VARCHAR(100) DEFAULT 'Al Ghadeer',
    expiry_date DATE,
    batch_number VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 5. EXPENSES TABLE (for driver expense tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Fuel', 'Parking', 'Toll', 'Maintenance', 'Supplies', 'Other')),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    receipt_uri TEXT, -- File path or URL
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 6. INDEXES FOR PERFORMANCE
-- =====================================================

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(latitude, longitude);

-- Drivers indexes
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_latitude, current_longitude);
CREATE INDEX IF NOT EXISTS idx_drivers_clerk_id ON drivers(clerk_id);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_driver_id ON expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- =====================================================
-- 7. TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update updated_at timestamp on orders
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_orders_updated_at();

-- Update updated_at timestamp on drivers
CREATE OR REPLACE FUNCTION update_drivers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_drivers_updated_at();

-- Update available_stock when current_stock changes
CREATE OR REPLACE FUNCTION update_available_stock()
RETURNS TRIGGER AS $$
BEGIN
    NEW.available_stock = NEW.current_stock - NEW.reserved_stock;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_available_stock
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_available_stock();

-- =====================================================
-- 8. SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert sample products
INSERT INTO products (name, type, description, cost_price, selling_price, driver_commission, current_stock, minimum_stock, maximum_stock, weight, material, brand) VALUES
('5L Water Bottle', '5L', 'Premium 5L water bottle', 1.50, 2.00, 0.20, 100, 10, 200, 5.2, 'Plastic', 'Al Ghadeer'),
('10L Water Bottle', '10L', 'Premium 10L water bottle', 2.50, 3.00, 0.30, 80, 10, 150, 10.5, 'Plastic', 'Al Ghadeer'),
('Water Dispenser', 'dispenser', 'Premium water dispenser', 8.00, 10.00, 1.00, 20, 5, 50, 2.0, 'Plastic', 'Al Ghadeer'),
('300ml Water Bottle', '300ml', 'Small water bottle', 0.30, 0.50, 0.05, 200, 20, 500, 0.3, 'Plastic', 'Al Ghadeer'),
('1L Water Bottle', '1L', '1L water bottle', 0.60, 1.00, 0.10, 150, 15, 300, 1.0, 'Plastic', 'Al Ghadeer'),
('20L Water Bottle', '20L', 'Large 20L water bottle', 4.00, 5.00, 0.50, 50, 5, 100, 20.0, 'Plastic', 'Al Ghadeer');

-- Insert sample orders
INSERT INTO orders (
    order_number, customer_name, customer_phone, customer_email, customer_address, 
    latitude, longitude, five_litre_bottles, ten_litre_bottles, 
    subtotal, delivery_fee, vat, total_amount, distance_km, delivery_zone
) VALUES
('ORD-001', 'Ahmed Al-Rashid', '+971501234567', 'ahmed@example.com', '123 Sheikh Zayed Road, Dubai', 25.2048, 55.2708, 2, 1, 7.00, 2.00, 1.35, 10.35, 5.2, 'Downtown Dubai'),
('ORD-002', 'Fatima Hassan', '+971507654321', 'fatima@example.com', '456 Jumeirah Beach Road, Dubai', 25.2194, 55.2723, 1, 2, 8.00, 2.00, 1.50, 11.50, 3.8, 'Jumeirah'),
('ORD-003', 'Mohammed Ali', '+971509876543', 'mohammed@example.com', '789 Al Wasl Road, Dubai', 25.2285, 55.2603, 3, 0, 6.00, 2.00, 1.20, 9.20, 4.5, 'Al Wasl');

-- =====================================================
-- 9. VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for active orders with customer details
CREATE OR REPLACE VIEW active_orders AS
SELECT 
    o.*,
    CASE 
        WHEN o.status = 'pending' THEN 'Pending'
        WHEN o.status = 'assigned' THEN 'Assigned'
        WHEN o.status = 'in_progress' THEN 'In Progress'
        ELSE o.status
    END as status_display
FROM orders o
WHERE o.status IN ('pending', 'assigned', 'in_progress')
ORDER BY o.created_at DESC;

-- View for delivery history
CREATE OR REPLACE VIEW delivery_history AS
SELECT 
    o.*,
    CASE 
        WHEN o.status = 'delivered' THEN 'Delivered'
        WHEN o.status = 'failed' THEN 'Failed'
        WHEN o.status = 'cancelled' THEN 'Cancelled'
        ELSE o.status
    END as status_display
FROM orders o
WHERE o.status IN ('delivered', 'failed', 'cancelled')
ORDER BY o.delivered_at DESC, o.created_at DESC;

-- View for driver performance
CREATE OR REPLACE VIEW driver_performance AS
SELECT 
    d.*,
    COUNT(o.id) as total_orders,
    COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
    COUNT(CASE WHEN o.status = 'failed' THEN 1 END) as failed_orders,
    AVG(o.customer_rating) as avg_rating
FROM drivers d
LEFT JOIN orders o ON d.id = o.driver_id
GROUP BY d.id;

-- =====================================================
-- 10. GRANT PERMISSIONS (adjust as needed)
-- =====================================================

-- Grant permissions to your application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
