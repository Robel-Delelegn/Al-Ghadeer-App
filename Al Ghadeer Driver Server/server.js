require('dotenv').config();

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder'); 

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
// Stripe webhook needs raw body, so handle it before JSON parser
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log('\n🔔 Stripe Webhook Received');

    // If webhook secret is configured, verify the signature
    let event;
    if (webhookSecret) {
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('❌ Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    } else {
        // For testing without webhook secret, parse JSON directly
        try {
            event = JSON.parse(req.body.toString());
        } catch (err) {
            console.error('❌ Failed to parse webhook body:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    console.log('Event type:', event.type);

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('✅ Checkout session completed:', session.id);
        console.log('Payment status:', session.payment_status);
        console.log('Order ID:', session.metadata?.orderId);

        // Update stored session
        const storedSession = paymentSessions.get(session.id);
        if (storedSession) {
            storedSession.payment_status = session.payment_status;
            storedSession.order_number = `ORD-${Date.now()}`;
            if (session.payment_status === 'paid') {
                storedSession.paid_at = new Date().toISOString();
            }
            paymentSessions.set(session.id, storedSession);
            console.log('✅ Payment session updated in storage');
        }

        // In production, here you would:
        // 1. Update order status in database
        // 2. Send confirmation email
        // 3. Update inventory
        // etc.
    }

    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
});

app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// In-memory OTP storage (phone -> { otp, tempToken, expiresAt })
const otpStore = new Map();

// Demo driver directory (acts as DB)
const drivers = [
    {
        id: 'driver_001',
        phone: '+971501234567',
        driver_name: 'Ahmed Al-Rashid',
        helper_name: 'Khalid Hussein',
        vehicle_number: 'DUB-12345',
        vehicle_type: 'Truck',
        zone: 'Dubai Marina',
        status: 'approved'
    },
    {
        id: 'driver_002',
        phone: '+971501234568',
        driver_name: 'Fatima Noor',
        helper_name: 'Salem Mansoor',
        helper_phone: '+97150123492',
        vehicle_number: 'DXB-67890',
        vehicle_type: 'Van',
        zone: 'Jumeirah',
        status: 'approved'
    },
    {
        id: 'driver_003',
        phone: '+971501234569',
        driver_name: 'Omar Khalid',
        helper_name: 'Yousef Rahman',
        vehicle_number: 'AUH-11223',
        vehicle_type: 'Truck',
        zone: 'Business Bay',
        status: 'approved'
    }
];

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Clean expired OTPs
function cleanExpiredOTPs() {
    const now = Date.now();
    for (const [phone, data] of otpStore.entries()) {
        if (data.expiresAt < now) {
            otpStore.delete(phone);
        }
    }
}

// POST /api/auth/request-otp
app.post('/api/auth/request-otp', async (req, res) => {
    console.log('\n📥 ========== OTP REQUEST RECEIVED ==========');
    console.log('📥 Received OTP request');
    const { phone } = req.body;
    console.log('📱 Phone received:', phone);
    console.log('📥 ===========================================\n');

    if (!phone) {
        console.log('❌ Missing phone number');
        return res.status(400).json({
            success: false,
            message: 'Phone number is required'
        });
    }

    // Look up driver by phone (in real app, query database)
    const driver = drivers.find(d => d.phone === phone);
    
    if (!driver) {
        return res.status(404).json({
            success: false,
            message: 'Phone number not registered'
        });
    }

    // Clean expired OTPs
    cleanExpiredOTPs();

    // Generate 6-digit OTP
    const otp = generateOTP();
    
    // Generate temporary token
    const tempToken = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store OTP with expiration (10 minutes)
    otpStore.set(phone, {
        otp: otp,
        tempToken: tempToken,
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    // Log OTP to console for testing
    console.log('\n========================================');
    console.log('📱 OTP REQUESTED');
    console.log('========================================');
    console.log(`Phone: ${phone}`);
    console.log(`OTP Code: ${otp}`);
    console.log(`Temp Token: ${tempToken}`);
    console.log(`Expires in: 10 minutes`);
    console.log('========================================\n');

    console.log('✅ Sending response...');
    res.status(200).json({
        success: true,
        message: 'OTP sent to your phone number',
        temp_token: tempToken,
        requires_otp: true
    });
    console.log('✅ Response sent successfully');
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    const authHeader = req.headers.authorization;
    const tempToken = authHeader?.replace('Bearer ', '');

    if (!tempToken) {
        return res.status(401).json({
            success: false,
            message: 'Invalid temporary token'
        });
    }

    if (!phone || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Phone and OTP are required'
        });
    }

    // Validate OTP format
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid OTP format. OTP must be 6 digits.'
        });
    }

    // Clean expired OTPs
    cleanExpiredOTPs();

    // Get stored OTP data
    const storedData = otpStore.get(phone);

    if (!storedData) {
        return res.status(400).json({
            success: false,
            message: 'OTP not found or expired. Please request a new OTP.'
        });
    }

    // Check if temp token matches
    if (storedData.tempToken !== tempToken) {
        return res.status(401).json({
            success: false,
            message: 'Invalid temporary token'
        });
    }

    // Check if OTP is expired
    if (storedData.expiresAt < Date.now()) {
        otpStore.delete(phone);
        return res.status(410).json({
            success: false,
            message: 'OTP expired. Please request a new OTP.'
        });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
        console.log(`\n❌ OTP VERIFICATION FAILED`);
        console.log(`Phone: ${phone}`);
        console.log(`Expected: ${storedData.otp}`);
        console.log(`Received: ${otp}\n`);
        return res.status(400).json({
            success: false,
            message: 'Invalid OTP. Please check and try again.'
        });
    }

    // OTP verified successfully - remove from store
    otpStore.delete(phone);

    // Generate permanent token
    const permanentToken = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Lookup driver data (in real app, get from database)
    const driver = drivers.find(d => d.phone === phone);
    
    if (!driver) {
        return res.status(404).json({
            success: false,
            message: 'Driver not found for this phone number'
        });
    }

    const user = {
        id: driver.id,
        phone: driver.phone,
        name: driver.driver_name,
        status: driver.status
    };

    console.log('\n✅ OTP VERIFIED SUCCESSFULLY');
    console.log(`Phone: ${phone}`);
    console.log(`User: ${user.name}`);
    console.log(`Permanent Token: ${permanentToken}\n`);

    res.status(200).json({
        success: true,
        message: 'Phone number verified successfully',
        token: permanentToken,
        refresh_token: `refresh_${Date.now()}`,
        user: user
    });
});

// POST /api/auth/resend-otp
app.post('/api/auth/resend-otp', async (req, res) => {
    const { phone } = req.body;
    const authHeader = req.headers.authorization;
    const tempToken = authHeader?.replace('Bearer ', '');

    if (!tempToken) {
        return res.status(401).json({
            success: false,
            message: 'Invalid temporary token'
        });
    }

    if (!phone) {
        return res.status(400).json({
            success: false,
            message: 'Phone number is required'
        });
    }

    // Clean expired OTPs
    cleanExpiredOTPs();

    // Get existing data to verify temp token
    const existingData = otpStore.get(phone);
    
    if (!existingData || existingData.tempToken !== tempToken) {
        return res.status(401).json({
            success: false,
            message: 'Invalid temporary token'
        });
    }

    // Generate new OTP
    const newOtp = generateOTP();

    // Update stored OTP
    otpStore.set(phone, {
        otp: newOtp,
        tempToken: tempToken, // Keep same temp token
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    // Log new OTP to console
    console.log('\n========================================');
    console.log('📱 OTP RESENT');
    console.log('========================================');
    console.log(`Phone: ${phone}`);
    console.log(`New OTP Code: ${newOtp}`);
    console.log(`Temp Token: ${tempToken}`);
    console.log(`Expires in: 10 minutes`);
    console.log('========================================\n');

    res.status(200).json({ 
        success: true,
        message: 'OTP resent to your phone number'
    });
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !token.startsWith('perm_')) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }

    // Dummy user data
    const user = {
        id: 'b97f3fc1-0708-4b97-bf5d-deb424b2cd93',
        name: 'Ahmed Al-Rashid',
        phone: '+971501234567',
        email: 'ahmed@example.com',
        status: 'approved'
    };

    res.status(200).json({
        success: true,
        user: user
    });
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

// ============================================
// ORDER ENDPOINTS
// ============================================

// GET /api/driver/orders
app.get('/api/driver/orders', async (req, res) => {
    const { driver_id } = req.query;

    // Dummy orders data
    const orders = [
        {
            id: '1',
            order_number: 'ORD-001',
            status: 'pending',
            customer_name: 'Mohammed Ali',
            customer_phone: '+971501111111',
            customer_email: 'mohammed@example.com',
            customer_address: '123 Sheikh Zayed Road, Dubai',
            latitude: 25.2048,
            longitude: 55.2708,
            delivery_instructions: 'Ring doorbell twice',
            start_time: '09:00',
            end_time: '17:00',
            total_amount: 45.50,
            payment_status: 'pending',
            delivery_zone: 'Dubai Marina',
            customer_site_id: 'site_001',
            customer_id: 'cust_001',
            customer_type: 'individual',
            wallet_balance: 125.50,
            products: {
                '5L Water Bottle': 5,
                '300ml Water Bottle': 2
            },
            payment_method: 'cash',
            payment_status: 'pending',
        },
        {
            id: '2',
            order_number: 'ORD-002',
            status: 'assigned',
            customer_name: 'Fatima Hassan',
            customer_phone: '+971502222222',
            customer_email: 'fatima@example.com',
            customer_address: '456 Jumeirah Beach Road, Dubai',
            latitude: 25.1972,
            longitude: 55.2278,
            delivery_instructions: 'Leave at reception',
            start_time: '10:00',
            end_time: '18:00',
            total_amount: 32.00,
            payment_status: 'pending',
            delivery_zone: 'Jumeirah',
            customer_site_id: 'site_002',
            customer_id: 'cust_002',
            customer_type: 'individual',
            wallet_balance: 89.00,
            products: {
                '5L Water Bottle': 3,
                '300ml Water Bottle': 10
            },
            payment_method: 'wallet',
            payment_status: 'paid',
        },
        {
            id: '3',
            order_number: 'ORD-003',
            status: 'in_progress',
            customer_name: 'Omar Khalid',
            customer_phone: '+971503333333',
            customer_email: 'omar@example.com',
            customer_address: '789 Business Bay, Dubai',
            latitude: 25.1868,
            longitude: 55.2644,
            delivery_instructions: 'Call before arrival',
            start_time: '08:00',
            end_time: '16:00',
            total_amount: 67.25,
            payment_status: 'pending',
            delivery_zone: 'Business Bay',
            customer_site_id: 'site_003',
            customer_id: 'cust_003',
            customer_type: 'individual',
            wallet_balance: 0,
            products: {
                '5L Water Bottle': 4,
                "Water Dispenser": 1
            },
            payment_method: 'cash',
            payment_status: 'pending',
        },
        {
            id: '4',
            order_number: 'ORD-004',
            status: 'pending',
            customer_name: 'South School',
            customer_phone: '+971501111111',
            customer_email: 'southschool@example.com',
            customer_address: '123 Sheikh Zayed Road, Dubai',
            latitude: 25.2048,
            longitude: 55.2708,
            delivery_instructions: 'Ring doorbell twice',
            start_time: '09:00',
            end_time: '17:00',
            total_amount: 450.00,
            payment_status: 'pending',
            delivery_zone: 'Dubai Marina',
            customer_site_id: 'site_001',
            customer_id: 'cust_004',
            customer_type: 'organization',
            wallet_balance: 1250.00,
            products: {
                '5L Water Bottle': 100,
                "10L Water Bottle": 30
            },
            payment_method: 'wallet',
            payment_status: 'paid',
        },
        {
            id: '5',
            order_number: 'ORD-005',
            status: 'pending',
            customer_name: 'UAE University',
            customer_phone: '+971509999999',
            customer_email: 'procurement@uaeu.ac.ae',
            customer_address: 'UAE University Campus, Al Ain',
            latitude: 25.2048,
            longitude: 55.2708,
            delivery_instructions: 'Show your ID to the guards',
            start_time: '09:00',
            end_time: '17:00',
            total_amount: 2850.00,
            payment_status: 'pending',
            delivery_zone: 'Al Ain',
            customer_site_id: 'site_005',
            customer_id: 'cust_005',
            customer_type: 'organization',
            wallet_balance: -500.00,
            products: {
                '5L Water Bottle': 500,
                "10L Water Bottle": 200
            },
            payment_method: 'wallet',
            payment_status: 'due',
        }
    ];

    res.status(200).json({
        success: true,
        data: orders
    });
});

// GET /api/driver/info
app.get('/api/driver/info', async (req, res) => {
    const { driver_id } = req.query;

    console.log('\n👤 Driver Info Request');
    console.log('Driver ID:', driver_id);

    // Find driver by ID or phone
    const driver = drivers.find(d => d.id === driver_id || d.phone === driver_id);
    
    if (!driver) {
        return res.status(404).json({
            success: false,
            message: 'Driver not found'
        });
    }

    // Return driver info with helper phone (mock data)
    const driverInfo = {
        id: driver.id,
        driver_number: driver.id,
        name: driver.driver_name,
        helper_name: driver.helper_name || '',
        helper_phone: driver.helper_phone || '+971501234500', // Mock helper phone
        vehicle_name: driver.vehicle_type,
        vehicle_id: driver.vehicle_id || driver.id + '_vehicle', // Mock vehicle ID
        vehicle_plate: driver.vehicle_number,
        zone: driver.zone,
        status: driver.status === 'approved' ? 'online' : 'offline',
        phone: driver.phone
    };

    res.status(200).json({
        success: true,
        data: driverInfo
    });
});

// GET /api/driver/history
app.get('/api/driver/history', async (req, res) => {
    const { driver_id } = req.query;

    console.log('\n📋 Delivery History Request');
    console.log('Driver ID:', driver_id);

    // Dummy delivery history (completed, failed, cancelled orders)
    const history = [
        {
            id: '101',
            order_number: 'ORD-101',
            status: 'delivered',
            customer_name: 'Sarah Ahmed',
            customer_phone: '+971504444444',
            customer_email: 'sarah@example.com',
            customer_address: '321 Al Barsha, Dubai',
            latitude: 25.1172,
            longitude: 55.2014,
            total_amount: 28.50,
            payment_method: 'cash',
            payment_status: 'paid',
            delivery_zone: 'Al Barsha',
            customer_site_id: 'site_101',
            customer_id: 'cust_001',
            products: {
                "5L Water Bottle": 3,
                "10L Water Bottle": 2
            },
            completed_at: new Date(Date.now() - 82800000).toISOString(),
        },
        {
            id: '102',
            order_number: 'ORD-102',
            status: 'failed',
            customer_name: 'Khalid Ibrahim',
            customer_phone: '+971505555555',
            customer_email: 'khalid@example.com',
            customer_address: '654 Deira, Dubai',
            latitude: 25.2653,
            longitude: 55.3093,
            total_amount: 35.00,
            payment_method: 'wallet',
            payment_status: 'refunded',
            delivery_zone: 'Deira',
            customer_site_id: 'site_102',
            customer_id: 'cust_002',
            products: {
                "5L Water Bottle": 2,
                "10L Water Bottle": 2
            },
            completed_at: null,
        },
        {
            id: '103',
            order_number: 'ORD-103',
            status: 'delivered',
            customer_name: 'Layla Mohammed',
            customer_phone: '+971506666666',
            customer_email: 'layla@example.com',
            customer_address: '987 Downtown Dubai',
            latitude: 25.1972,
            longitude: 55.2794,
            total_amount: 52.75,
            payment_method: 'cash',
            payment_status: 'paid',
            delivery_zone: 'Downtown',
            customer_site_id: 'site_103',
            customer_id: 'cust_003',
            products: {
                "5L Water Bottle": 4,
                "1L Water Bottle": 5
            },
            completed_at: new Date(Date.now() - 255600000).toISOString(),

        },
        {
            id: '104',
            order_number: 'ORD-104',
            status: 'cancelled',
            customer_name: 'Omar Hassan',
            customer_phone: '+971507777777',
            customer_email: 'omar@example.com',
            customer_address: '456 Business Bay, Dubai',
            latitude: 25.1868,
            longitude: 55.2650,
            total_amount: 45.00,
            payment_method: 'wallet',
            payment_status: 'refunded',
            delivery_zone: 'Business Bay',
            customer_site_id: 'site_104',
            customer_id: 'cust_004',
            products: {
                "10L Water Bottle": 3,
                "5L Water Bottle": 2
            },
            completed_at: null,
        }
    ];

    console.log(`✅ Returning ${history.length} history items`);

    res.status(200).json({
        success: true,
        data: history
    });
});

// GET /api/driver/failed-deliveries (also supports /api/failed-deliveries)
app.get('/api/driver/failed-deliveries', async (req, res) => {
    const { driver_id } = req.query;

    const failedDeliveries = [
        {
            id: '201',
            order_number: 'ORD-201',
            status: 'failed',
            customer_name: 'Ahmed Saleh',
            customer_phone: '+971507777777',
            customer_address: '111 Al Qusais, Dubai',
            failure_reason: 'Customer not available',
            failure_notes: 'Tried calling multiple times, no response',
            created_at: new Date(Date.now() - 43200000).toISOString()
        },
        {
            id: '202',
            order_number: 'ORD-202',
            status: 'failed',
            customer_name: 'Mariam Ali',
            customer_phone: '+971508888888',
            customer_address: '222 Al Nahda, Dubai',
            failure_reason: 'Wrong address',
            failure_notes: 'Address provided does not exist',
            created_at: new Date(Date.now() - 86400000).toISOString()
        }
    ];

    res.status(200).json(failedDeliveries);
});

// POST /api/failed-deliveries/submit
app.post('/api/failed-deliveries/submit', async (req, res) => {
    const { driver_id } = req.query;
    const failureData = req.body;

        res.status(200).json({ 
        success: true,
        message: 'Failed delivery report submitted successfully',
        failure_id: `FAIL-${Date.now()}`
    });
});

// Dummy customer wallet data (in production, fetch from database)
// Each customer has their own wallet balance that they deposited
const customerWallets = {
    'cust_001': { balance: 125.50, currency: 'AED', customer_type: 'individual' },
    'cust_002': { balance: 89.00, currency: 'AED', customer_type: 'individual' },
    'cust_003': { balance: 0.00, currency: 'AED', customer_type: 'individual' },
    'cust_004': { balance: 1250.00, currency: 'AED', customer_type: 'organization', organization_name: 'South School' },
    'cust_005': { balance: -500.00, currency: 'AED', customer_type: 'organization', organization_name: 'UAE University' },
    // Default wallet for unknown customers
    'default': { balance: 0.00, currency: 'AED', customer_type: 'individual' }
};

// Organization credit records (tracks signed credit deliveries)
const organizationCredits = [];

// Payment sessions storage (checkoutSessionId -> order data)
const paymentSessions = new Map();

// Helper function to get customer wallet balance
function getCustomerWallet(customerId) {
    return customerWallets[customerId] || customerWallets['default'];
}

// Helper function to check if customer is an organization
function isOrganizationCustomer(customerId) {
    const wallet = getCustomerWallet(customerId);
    return wallet.customer_type === 'organization';
}

// Helper function to update wallet balance (deduct or add credit)
function updateWalletBalance(customerId, amount, isCredit = false) {
    if (customerWallets[customerId]) {
        if (isCredit) {
            // For credit, we subtract from balance (making it more negative)
            customerWallets[customerId].balance -= amount;
        } else {
            // For regular payment, we also subtract
            customerWallets[customerId].balance -= amount;
        }
        return customerWallets[customerId].balance;
    }
    return null;
}

// POST /api/driver/orders/validate-payment
app.post('/api/driver/orders/validate-payment', async (req, res) => {
    const { payment_method, amount, order_id, customer_id, customer_type, wallet_balance } = req.body;

    console.log('\n📋 Payment Validation Request');
    console.log('Payment Method:', payment_method);
    console.log('Amount:', amount);
    console.log('Order ID:', order_id);
    console.log('Customer ID:', customer_id);
    console.log('Customer Type (from order):', customer_type);
    console.log('Wallet Balance (from order):', wallet_balance);

    // Validate required fields
    if (!payment_method) {
        return res.status(400).json({
            success: false,
            message: 'Payment method is required'
        });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Valid amount is required'
        });
    }

    // Validate payment method
    const validMethods = ['cash', 'wallet', 'credit_card'];
    const normalizedMethod = payment_method.toLowerCase();
    console.log(`🔍 Validating payment method: "${normalizedMethod}" against valid methods: [${validMethods.join(', ')}]`);
    
    if (!validMethods.includes(normalizedMethod)) {
        console.log(`❌ Invalid payment method: "${normalizedMethod}"`);
        return res.status(400).json({
            success: false,
            message: 'Invalid payment method. Must be "cash", "wallet", or "credit_card"'
        });
    }
    
    console.log(`✅ Payment method "${normalizedMethod}" is valid`);

    // Validate amount (should be positive and reasonable)
    if (amount < 0.01) {
        return res.status(400).json({
            success: false,
            message: 'Amount must be greater than 0'
        });
    }

    // If wallet payment method, validate wallet balance
    if (normalizedMethod === 'wallet') {
        
        // Check if organization - prefer order data, fallback to wallet lookup
        const isOrg = customer_type === 'organization';
    

        console.log(`💰 Wallet Check - Customer: ${customer_id}, Balance: ${wallet_balance}, Required: ${amount}, Organization: ${isOrg}`);

        // For organizations, ALWAYS allow wallet payment (even with negative balance) - requires signature
        if (isOrg) {
            console.log(`🏢 Organization customer - wallet payment allowed, signature required`);
            return res.status(200).json({
                success: true,
                message: 'Organization wallet payment - signature required',
                validated: true,
                payment_method: normalizedMethod,
                amount: amount,
                wallet_balance: wallet_balance,
                requires_signature: true,
            });
        }
        
        // For individuals, check if balance is sufficient
        if (wallet_balance < amount) {
            console.log(`❌ Individual customer - insufficient wallet balance`);
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Available: AED ${walletBalance.toFixed(2)}, Required: AED ${amount.toFixed(2)}`,
                wallet_balance: walletBalance,
                required_amount: amount,
                insufficient: true
            });
        }

        console.log(`✅ Individual wallet balance sufficient: ${wallet_balance} >= ${amount}`);
    }

    console.log('✅ Payment validation successful');
    res.status(200).json({
        success: true,
        message: 'Payment method and amount validated successfully',
        validated: true,
        payment_method: normalizedMethod,
        amount: amount,
        requires_signature: false,
    });
});

// POST /api/driver/orders/confirm-payment
app.post('/api/driver/orders/confirm-payment', async (req, res) => {
    const { driver_id } = req.query;
    const orderData = req.body;

    // Check if this is a Stripe credit card payment that needs webhook confirmation
    if (orderData.payment_method === 'credit_card' && orderData.checkout_session_id) {
        // Payment already completed via Stripe webhook
        const sessionData = paymentSessions.get(orderData.checkout_session_id);
        if (sessionData && sessionData.payment_status === 'paid') {
            const order = {
                id: sessionData.order_id || `order_${Date.now()}`,
                order_number: sessionData.order_number || `ORD-${Date.now()}`,
                created_at: new Date().toISOString(),
                total_amount: orderData.total_amount,
                payment_method: orderData.payment_method,
                status: 'completed',
                payment_status: 'paid'
            };

            return res.status(201).json({
                success: true,
                message: `Order ${order.order_number} has been confirmed and payment received.`,
                order: order
            });
        }
    }

    const order = {
        id: `order_${Date.now()}`,
        order_number: `ORD-${Date.now()}`,
        created_at: new Date().toISOString(),
        total_amount: orderData.total_amount,
        payment_method: orderData.payment_method,
        status: 'pending'
    };

    res.status(201).json({
        success: true,
        message: `Order ${order.order_number} has been created successfully.`,
        order: order
    });
});

// POST /api/driver/orders/organization-credit-delivery
// Handles credit delivery for organizations - requires signature
app.post('/api/driver/orders/organization-credit-delivery', async (req, res) => {
    const { driver_id } = req.query;
    const { 
        order_id,
        order_number,
        customer_id,
        customer_name,
        customer_type,
        organization_name,
        wallet_balance: order_wallet_balance,
        amount,
        items,
        signature_data, // Base64 encoded signature image
        receiver_name,
        receiver_position,
        notes
    } = req.body;

    console.log('\n🏢 Organization Credit Delivery Request');
    console.log('Driver ID:', driver_id);
    console.log('Order ID:', order_id);
    console.log('Customer ID:', customer_id);
    console.log('Customer Type:', customer_type);
    console.log('Organization:', organization_name || customer_name);
    console.log('Amount:', amount);
    console.log('Receiver:', receiver_name);
    console.log('Signature provided:', !!signature_data);

    // Validate required fields
    if (!signature_data) {
        return res.status(400).json({
            success: false,
            message: 'Signature is required for credit delivery'
        });
    }

    if (!receiver_name || !receiver_name.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Receiver name is required'
        });
    }

    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Valid amount is required'
        });
    }

    // Verify this is an organization customer - check both order data and wallet
    const isOrg = customer_type === 'organization' || isOrganizationCustomer(customer_id);
    if (!isOrg) {
        return res.status(400).json({
            success: false,
            message: 'Credit delivery is only available for organization customers'
        });
    }

    // Get current wallet info - use order data if available
    const wallet = customer_id ? getCustomerWallet(customer_id) : null;
    const previousBalance = (typeof order_wallet_balance === 'number') ? order_wallet_balance : (wallet?.balance ?? 0);

    // Update wallet balance (subtract the amount, making it more negative if needed)
    let newBalance = updateWalletBalance(customer_id, amount, true);
    
    // If wallet update failed (customer not in database), calculate new balance from order data
    if (newBalance === null) {
        newBalance = previousBalance - amount;
        console.log(`📝 Customer ${customer_id} not in wallet DB, calculated new balance: ${newBalance}`);
    }

    // Create credit record
    const creditRecord = {
        id: `credit_${Date.now()}`,
        credit_number: `CR-${Date.now()}`,
        order_id: order_id,
        order_number: order_number,
        driver_id: driver_id,
        customer_id: customer_id,
        customer_name: customer_name,
        organization_name: organization_name || customer_name,
        amount: amount,
        items: items,
        receiver_name: receiver_name.trim(),
        receiver_position: receiver_position?.trim() || '',
        notes: notes?.trim() || '',
        signature_data: signature_data, // In production, save to file storage
        previous_balance: previousBalance,
        new_balance: newBalance,
        status: 'pending_payment',
        delivery_date: new Date().toISOString(),
        created_at: new Date().toISOString()
    };

    // Store credit record
    organizationCredits.push(creditRecord);

    console.log('✅ Organization credit delivery recorded');
    console.log('Previous Balance:', previousBalance);
    console.log('New Balance:', newBalance);
    console.log('Credit Number:', creditRecord.credit_number);

    res.status(201).json({
        success: true,
        message: `Credit delivery confirmed for ${organization_name || customer_name}. Payment will be collected later.`,
        credit_record: {
            id: creditRecord.id,
            credit_number: creditRecord.credit_number,
            organization_name: creditRecord.organization_name,
            amount: creditRecord.amount,
            receiver_name: creditRecord.receiver_name,
            previous_balance: previousBalance,
            new_balance: newBalance,
            delivery_date: creditRecord.delivery_date
        }
    });
});

// GET /api/driver/organization-credits - Get all organization credit records
app.get('/api/driver/organization-credits', async (req, res) => {
    const { driver_id, customer_id } = req.query;

    let credits = [...organizationCredits];

    if (driver_id) {
        credits = credits.filter(c => c.driver_id === driver_id);
    }

    if (customer_id) {
        credits = credits.filter(c => c.customer_id === customer_id);
    }

    res.status(200).json({
        success: true,
        data: credits,
        count: credits.length
    });
});

// POST /api/driver/direct-sales
app.post('/api/driver/direct-sales', async (req, res) => {
    const saleData = req.body;

    console.log('\n💰 Direct Sale Request');
    console.log('Driver ID:', saleData.driver_id);
    console.log('Customer:', saleData.customer_name);
    console.log('Phone:', saleData.customer_phone);
    console.log('Location:', saleData.latitude, saleData.longitude);
    console.log('Products:', saleData.products);
    console.log('Total Amount:', saleData.total_amount);

    // Validate required fields
    if (!saleData.driver_id) {
        return res.status(400).json({ 
            success: false,
            message: 'Driver ID is required'
        });
    }

    if (!saleData.customer_name || !saleData.customer_name.trim()) {
        return res.status(400).json({ 
            success: false,
            message: 'Customer name is required'
        });
    }

    if (!saleData.customer_phone || !saleData.customer_phone.trim()) {
        return res.status(400).json({ 
            success: false,
            message: 'Customer phone number is required'
        });
    }

    if (!saleData.latitude || !saleData.longitude) {
        return res.status(400).json({
            success: false,
            message: 'Location coordinates are required'
        });
    }

    if (!saleData.products || !Array.isArray(saleData.products) || saleData.products.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'At least one product is required'
        });
    }

    if (!saleData.total_amount || saleData.total_amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Valid total amount is required'
        });
    }

    // Create sale record
    const sale = {
        id: `sale_${Date.now()}`,
        sale_number: `DS-${Date.now()}`,
    };

    console.log('✅ Direct sale created:', sale.sale_number);

    res.status(201).json({
            success: true,
        message: `Direct sale ${sale.sale_number} has been recorded successfully.`,
        sale_number: sale.sale_number
    });
});

// ============================================
// LOADED/UNLOADED ITEMS ENDPOINTS
// ============================================

// GET /api/drivers/:driver_id/loaded-items/request
app.get('/api/drivers/loaded-items/request', async (req, res) => {
    const { driver_id } = req.query;

    const items = [
        {
            id: 'water_5l_001',
            name: '5L Water Bottles',
            quantity: 50,
            unit: 'bottles',
            category: 'Drinking Water',
            condition: 'full'
        },
        {
            id: 'water_10l_001',
            name: '10L Water Bottles',
            quantity: 25,
            unit: 'bottles',
            category: 'Drinking Water',
            condition: 'full'
        },
        {
            id: 'water_300ml_001',
            name: '300ml Water Bottles',
            quantity: 100,
            unit: 'bottles',
            category: 'Drinking Water',
            condition: 'full'
        },
        {
            id: 'dispenser_001',
            name: 'Water Dispensers',
            quantity: 5,
            unit: 'units',
            category: 'Accessories',
            condition: 'full'
        },
        {
            id: 'water_1l_001',
            name: '1L Water Bottles',
            quantity: 75,
            unit: 'bottles',
            category: 'Drinking Water',
            condition: 'full'
        }
    ];
        
    res.status(200).json({
        success: true,
        message: 'Items retrieved successfully',
        data: items,
    });
});

// POST /api/drivers/:driver_id/loaded-items/confirm
app.post('/api/drivers/loaded-items/confirm', async (req, res) => {
    const { driver_id } = req.query;
    const { items, is_correct, confirmed_at } = req.body;

    res.status(200).json({
        success: true,
        message: 'Loaded items confirmed successfully',
        agreement: {
            status: is_correct ? 'agreed' : 'disagreed',
            notes: is_correct ? 'All items verified' : 'Discrepancy noted',
            final_items: items
        }
    });
});
        
// GET /api/drivers/:driver_id/unloaded-items/request
app.get('/api/drivers/:driver_id/unloaded-items/request', async (req, res) => {
    const { driver_id } = req.params;

    const items = [
        {
            id: 'water_5l_002',
            name: '5L Water Bottles',
            quantity: 28,
            unit: 'bottles',
            category: 'Water',
            condition: 'empty'
        },
        {
            id: 'water_10l_002',
            name: '10L Water Bottles',
            quantity: 15,
            unit: 'bottles',
            category: 'Water',
            condition: 'full'
        },
        {
            id: 'water_5l_003',
            name: '5L Water Bottles',
            quantity: 3,
            unit: 'bottles',
            category: 'Water',
            condition: 'leaked'
        },
        {
            id: 'water_10l_003',
            name: '10L Water Bottles',
            quantity: 2,
            unit: 'bottles',
            category: 'Water',
            condition: 'damaged'
        }
    ];
        
    res.status(200).json({
            success: true,
        message: 'Items retrieved successfully',
        data: items,
        requested_at: new Date().toISOString()
    });
});

// POST /api/drivers/:driver_id/unloaded-items/confirm
app.post('/api/drivers/:driver_id/unloaded-items/confirm', async (req, res) => {
    const { driver_id } = req.params;
    const { items, is_correct, confirmed_at } = req.body;

    res.status(200).json({
        success: true,
        message: 'Unloaded items confirmed successfully',
        agreement: {
            status: is_correct ? 'agreed' : 'disagreed',
            notes: is_correct ? 'All items verified' : 'Discrepancy noted',
            final_items: items
        }
    });
});

// ============================================
// EXPENSES ENDPOINTS
// ============================================

// GET /api/expenses
app.get('/api/expenses', async (req, res) => {
    const { driver_id, status } = req.query;

    const expenses = [
        {
            id: 'exp_001',
            request_id: 'EXP-001',
            type: 'Fuel',
            amount: 150.00,
            description: 'Gas station refill',
            receipt_image: null,
            status: 'pending',
            submission_date: new Date(Date.now() - 86400000).toISOString(),
            reviewed_at: null,
            reviewed_by: null,
            review_notes: null
        },
        {
            id: 'exp_002',
            request_id: 'EXP-002',
            type: 'Parking',
            amount: 25.00,
            description: 'Parking fee at delivery location',
            receipt_image: 'base64_image_data_here',
            status: 'approved',
            submission_date: new Date(Date.now() - 172800000).toISOString(),
            reviewed_at: new Date(Date.now() - 86400000).toISOString(),
            reviewed_by: 'admin_001',
            review_notes: 'Approved'
        },
        {
            id: 'exp_003',
            request_id: 'EXP-003',
            type: 'Maintenance',
            amount: 300.00,
            description: 'Vehicle maintenance',
            receipt_image: null,
            status: 'rejected',
            submission_date: new Date(Date.now() - 259200000).toISOString(),
            reviewed_at: new Date(Date.now() - 172800000).toISOString(),
            reviewed_by: 'admin_001',
            review_notes: 'Receipt required'
        }
    ];

    let filteredExpenses = expenses;
        if (status) {
        filteredExpenses = expenses.filter(exp => exp.status === status);
    }

    res.status(200).json(filteredExpenses);
});

// POST /api/expenses/submit
app.post('/api/expenses/submit', async (req, res) => {
    const { driver_id } = req.query;
    const expenseData = req.body;

    const expense = {
        id: `exp_${Date.now()}`,
        request_id: `EXP-${Date.now()}`,
        status: 'pending',
    };

        res.status(201).json({
            success: true,
            message: 'Expense request submitted successfully',
        expense: expense
    });
});

// ============================================
// PRODUCTS ENDPOINTS
// ============================================

// GET /api/products (also supports /api/driver/products)
app.get('/api/products', async (req, res) => {
    const { driver_id, customer_site_id, customer_id } = req.query;

    const products = {
        "Drinking waters": [
          {
            id: "200ml-cup",
            name: "200ml Cup",
            price: 7.35,
            image_url: "https://www.alghadeerwater.com/lovable-uploads/e97e8c8a-a180-42e5-b588-5013648484bb.png",
            description: "Premium quality drinking water in a convenient 200ml cup. Perfect for on-the-go hydration with BPA-free materials.",
            category: "Drinking Water"
          },
          {
            id: "200ml-bottle-30",
            name: "200ml Bottle",
            price: 10.5,
            image_url: "https://images.unsplash.com/photo-1698664434322-94a43b98b9ba?q=80&w=765&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            description: "Compact 200ml bottle ideal for daily hydration. Made with eco-friendly materials.",
            category: "Drinking Water"
          },
          {
            id: "330ml-bottle-12",
            name: "330ml Bottle",
            price: 5.25,
            image_url: "https://www.alghadeerwater.com/lovable-uploads/46c6c613-4f2b-4bc0-8e8e-b20545592e93.png",
            description: "Standard 330ml bottle of premium purified water. Great value for everyday use.",
            category: "Drinking Water"
          },
          {
            id: "500ml-bottle-12",
            name: "500ml Bottle",
            price: 5.25,
            image_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYjjcwgr-oWl6b3iTio1sYOj-Y-iB5RHfOzQ&s",
            description: "500ml bottle of pure drinking water. Perfect size for work or travel.",
            category: "Drinking Water"
          },
          {
            id: "w19",
            name: "19L Water Bottle",
            price: 12.0,
            image_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRB8Ozlj1C0ndAc2SmXnKckp99URIGms7nvHw&s",
            description: "Large 19-liter bottle for home or office use. Premium quality water delivered fresh.",
            category: "Drinking Water"
          },
          {
            id: "w05",
            name: "5L Water Bottle",
            price: 6.0,
            image_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRHNxKaqhMnBJGK8ccZvgv65-SMZUQn84vpNg&s",
            description: "Convenient 5-liter bottle. Ideal for small families or single households.",
            category: "Drinking Water"
          }
        ],
        "Accessories": [
          {
            id: "cooler",
            name: "Water Cooler",
            price: 350,
            image_url: "https://www.alghadeerwater.com/lovable-uploads/33ae9524-aa29-4945-a1a0-90d4e13adccd.png",
            description: "Premium water cooler with hot and cold water dispensing. Modern design with energy-efficient operation.",
            category: "Accessories"
          },
          {
            id: "kitchen-dispenser",
            name: "Kitchen Dispenser",
            price: 40,
            image_url: "https://images.unsplash.com/photo-1544198841-10f34f31f8dd?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            description: "Compact kitchen water dispenser. Easy to install and perfect for any kitchen space.",
            category: "Accessories"
          },
          {
            id: "manual-pump",
            name: "Manual Pump",
            price: 25,
            image_url: "https://plus.unsplash.com/premium_photo-1667516700355-4e153de39581?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1yZWxhdGVkfDEyfHx8ZW58MHx8fHx8",
            description: "Durable manual water pump. No electricity required, perfect for any location.",
            category: "Accessories"
          },
          {
            id: "disp",
            name: "Water Dispenser Rental",
            price: 30.0,
            image_url: "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=300&h=300&fit=crop",
            description: "Monthly rental for premium water dispenser. Includes maintenance and service.",
            category: "Accessories"
          }
        ],
        "Special offers": [
          {
            id: "family-pack",
            name: "Family Pack",
            price: 420,
            originalPrice: 495,
            image_url: "https://www.alghadeerwater.com/lovable-uploads/d2973658-4577-4d76-834d-0259988c1eaf.png",
            description: "Cooler + 5 full bottles + coupon book + free 200ml carton. Best value for families. Everything you need to start your water delivery service.",
            category: "Special Offers",
            badge: "Best Value"
          },
          {
            id: "standard-pack",
            name: "Standard Pack",
            price: 380,
            originalPrice: 425,
            image_url: "https://www.alghadeerwater.com/assets/build-your-own-bundle-Cq1_iSCi.png",
            description: "Cooler + 3 full bottles + coupon book + free 200ml carton. Most popular starter package for new customers.",
            category: "Special Offers",
            badge: "Most Popular"
          },
          {
            id: "starter-pack",
            name: "Starter Pack",
            price: 125,
            originalPrice: 140,
            image_url: "https://www.alghadeerwater.com/lovable-uploads/36bdc5fe-0ba9-4c4d-a9f5-946184d4a039.png",
            description: "Manual pump + 3 full bottles + coupon book + free 200ml carton. Perfect for trying our service.",
            category: "Special Offers",
            badge: "Starter Pack"
          }
        ]
      }

    res.status(200).json({
        success: true,
        data: products,
        });
});

// GET /api/driver/products (alias for /api/products)
app.get('/api/driver/products', async (req, res) => {
    const { driver_id, customer_site_id, customer_id } = req.query;

    const products = [
        {
            id: 'prod_001',
            name: '5L Water Bottle',
            description: 'Premium 5-liter water bottle',
            price: 8.50,
            unit: 'bottle',
            available_stock: 500,
            category: 'Water',
            image_url: 'https://example.com/images/5l-bottle.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        },
        {
            id: 'prod_002',
            name: '10L Water Bottle',
            description: 'Premium 10-liter water bottle',
            price: 15.00,
            unit: 'bottle',
            available_stock: 300,
            category: 'Water',
            image_url: 'https://example.com/images/10l-bottle.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        },
        {
            id: 'prod_003',
            name: '300ml Water Bottle',
            description: 'Compact 300ml water bottle',
            price: 2.00,
            unit: 'bottle',
            available_stock: 1000,
            category: 'Water',
            image_url: 'https://example.com/images/300ml-bottle.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        },
        {
            id: 'prod_004',
            name: '1L Water Bottle',
            description: 'Standard 1-liter water bottle',
            price: 3.50,
            unit: 'bottle',
            available_stock: 800,
            category: 'Water',
            image_url: 'https://example.com/images/1l-bottle.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        },
        {
            id: 'prod_005',
            name: '20L Water Bottle',
            description: 'Large 20-liter water bottle',
            price: 25.00,
            unit: 'bottle',
            available_stock: 200,
            category: 'Water',
            image_url: 'https://example.com/images/20l-bottle.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        },
        {
            id: 'prod_006',
            name: 'Water Dispenser',
            description: 'Premium water dispenser unit',
            price: 150.00,
            unit: 'unit',
            available_stock: 50,
            category: 'Equipment',
            image_url: 'https://example.com/images/dispenser.jpg',
            is_active: true,
            customer_site_id: customer_site_id || 'site_001',
            customer_id: customer_id || 'cust_001'
        }
    ];

    res.status(200).json({
        success: true,
        message: 'Products retrieved successfully',
        data: products,
        count: products.length
    });
});

// ============================================
// STRIPE PAYMENT ENDPOINTS
// ============================================

// POST /api/payments/create-checkout-session
app.post('/api/payments/create-checkout-session', async (req, res) => {
    const { orderId, amount, currency = 'AED', customerId, customerSiteId } = req.body;

    console.log('\n💳 Stripe Checkout Session Request');
    console.log('Customer ID:', customerId);
    console.log('Customer Site ID:', customerSiteId);
    console.log('Order ID:', orderId);
    console.log('Amount:', amount);
    console.log('Currency:', currency);

    // Validate required fields
    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Order ID is required'
        });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Valid amount is required'
        });
    }

    try {
        // Convert amount to cents (Stripe uses smallest currency unit)
        const amountInCents = Math.round(amount * 100);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: currency.toLowerCase(),
                        product_data: {
                            name: `Order ${orderId}`,
                            description: 'Al Ghadeer Water Delivery'
                        },
                        unit_amount: amountInCents
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: `${process.env.STRIPE_SUCCESS_URL || 'https://example.com/success'}?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
            cancel_url: `${process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel'}?order_id=${orderId}`,
            metadata: {
                orderId: orderId.toString()
            }
        });

        // Store session data for later retrieval
        paymentSessions.set(session.id, {
            customer_id: customerId,
            customer_site_id: customerSiteId,
            checkout_session_id: session.id,
            order_id: orderId,
            amount: amount,
            currency: currency,
            payment_status: 'pending',
            created_at: new Date().toISOString()
        });

        console.log('✅ Stripe Checkout Session created:', session.id);
        console.log('Checkout URL:', session.url);

        res.status(200).json({
            success: true,
            checkoutUrl: session.url,
            checkoutSessionId: session.id,
            orderId: orderId
        });
    } catch (error) {
        console.error('❌ Stripe error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create checkout session',
            error: error.message
        });
    }
});

// GET /api/payments/status/:checkoutSessionId
app.get('/api/payments/status/:checkoutSessionId', async (req, res) => {
    const { checkoutSessionId } = req.params;

    console.log('\n🔍 Payment Status Check');
    console.log('Checkout Session ID:', checkoutSessionId);

    try {
        // Retrieve session from Stripe
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
        
        // Get stored session data
        const storedSession = paymentSessions.get(checkoutSessionId);
        
        const paymentStatus = {
            checkout_session_id: checkoutSessionId,
            payment_status: session.payment_status, // 'paid', 'unpaid', 'no_payment_required'
            payment_intent: session.payment_intent,
            order_id: storedSession?.order_id || session.metadata?.orderId,
            amount_total: session.amount_total ? session.amount_total / 100 : storedSession?.amount,
            currency: session.currency?.toUpperCase() || storedSession?.currency
        };

        // Update stored session status
        if (storedSession) {
            storedSession.payment_status = session.payment_status;
            if (session.payment_status === 'paid') {
                storedSession.order_number = `ORD-${Date.now()}`;
            }
            paymentSessions.set(checkoutSessionId, storedSession);
        }

        console.log('Payment Status:', paymentStatus.payment_status);

        res.status(200).json({
            success: true,
            paymentStatus: paymentStatus
        });
    } catch (error) {
        console.error('❌ Error retrieving payment status:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment status',
            error: error.message
        });
    }
});


// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START SERVER
// ============================================

// Get network interfaces to show actual IP
const os = require('os');

function getNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const networkIP = getNetworkIP();

app.listen(port, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Al Ghadeer Driver Server is RUNNING`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Listening on: 0.0.0.0:${port}`);
    console.log(`🌐 Network IP: ${networkIP}`);
    console.log(`\n📍 Access URLs:`);
    console.log(`   Local:  http://localhost:${port}/api`);
    console.log(`   Network: http://${networkIP}:${port}/api`);
    console.log(`\n✅ Health Check:`);
    console.log(`   http://${networkIP}:${port}/api/health`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   Auth: POST /api/auth/request-otp, /api/auth/verify-otp, /api/auth/resend-otp`);
    console.log(`   Auth: GET /api/auth/me, POST /api/auth/logout`);
    console.log(`   Orders: GET /api/driver/orders, GET /api/driver/history`);
    console.log(`   Items: GET/POST /api/drivers/:driver_id/loaded-items/*`);
    console.log(`   Items: GET/POST /api/drivers/:driver_id/unloaded-items/*`);
    console.log(`   Expenses: GET /api/expenses, POST /api/expenses/submit`);
    console.log(`   Products: GET /api/products`);
    console.log(`   Payment: POST /api/driver/orders/validate-payment`);
    console.log(`   Payment: POST /api/driver/orders/confirm-payment`);
    console.log(`   Direct Sales: POST /api/driver/direct-sales`);
    console.log(`   Failed: GET/POST /api/driver/failed-deliveries`);
    console.log(`\n💡 OTP codes will be printed to console for testing`);
    console.log(`\n⚠️  Make sure your .env file has: EXPO_PUBLIC_IP_ADDRESS=http://${networkIP}:${port}/api`);
    console.log(`${'='.repeat(60)}\n`);
});
