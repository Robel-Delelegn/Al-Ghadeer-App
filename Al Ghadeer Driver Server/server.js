require('dotenv').config();

const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors'); 

const app = express();
const port = process.env.PORT || 3000; // Use port from .env or default to 3000
console.log("Port: ", port)

// --- Database Connection Pool Setup ---
const connectionString = process.env.DATABASE_URL;

// Ensure the DATABASE_URL is set
if (!connectionString) {
    console.error('DATABASE_URL is not set in .env file!');
    process.exit(1); // Exit the process if the critical environment variable is missing
}

const pool = new Pool({
    connectionString: connectionString,
    connectionTimeoutMillis: 100000,
    // For Neon, SSL is required. rejectUnauthorized: false is often used for development/testing
    // if you don't have the CA certificate set up. For production, consider robust SSL.
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection on startup
pool.connect()
    .then(client => {
        console.log('Successfully connected to PostgreSQL database!');
        client.release(); // Release the client immediately after testing connection
    })
    .catch(err => {
        console.error('Failed to connect to PostgreSQL database:', err.message);
        process.exit(1); // Exit if database connection fails
    });

// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON request bodies

// CORS configuration:
// Allows requests from any origin during development.
// In a production environment, you should restrict this to your specific frontend domain(s)
// for better security (e.g., origin: 'https://your-expo-app.com').
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
}));

// --- API Routes ---

// GET /api/users - Retrieve all users from the database
app.get('/api/users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT id, name, email, clerk_id, created_at FROM users ORDER BY name ASC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// POST /api/users - Add a new user to the database
app.post('/api/users', async (req, res) => {
    const { name, email, clerk_id } = req.body;

    // Basic validation
    if (!name || !email || !clerk_id) {
        return res.status(400).json({ error: 'Name, email, and clerk_id are required fields.' });
    }
    if (typeof name !== 'string' || typeof email !== 'string' || typeof clerk_id !== 'string') {
        return res.status(400).json({ error: 'Name, email, and clerk_id must be strings.' });
    }
    if (!email.includes('@') || !email.includes('.')) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'INSERT INTO users (name, email, clerk_id) VALUES ($1, $2, $3) RETURNING id, name, email, clerk_id, created_at',
            [name, email, clerk_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding user:', err.stack);
        if (err.code === '23505') {
            if (err.constraint === 'users_email_key') {
                return res.status(409).json({ error: 'Email already exists.' });
            }
            return res.status(409).json({ error: 'Duplicate entry detected.' });
        }
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// GET /api/orders - Fetch current orders with optimized response
app.get('/api/orders', async (req, res) => {
    const { driver_id } = req.query;
    let client;
    try {
        client = await pool.connect();
        
        // Build query based on whether driver_id is provided
        let query = `
            SELECT 
                o.id,
                o.order_number,
                o.status,
                o.created_at,
                o.updated_at,
                o.customer_name,
                o.customer_phone,
                o.customer_email,
                o.customer_address,
                o.latitude,
                o.longitude,
                o.delivery_instructions,
                o.five_litre_bottles,
                o.ten_litre_bottles,
                o.three_hundred_ml_bottles,
                o.one_litre_bottles,
                o.twenty_litre_bottles,
                o.water_dispenser,
                o.total_amount,
                o.payment_method,
                o.payment_status,
                o.delivery_zone,
                o.driver_id
            FROM orders o 
            WHERE o.status IN ('pending', 'assigned', 'in_progress')
        `;
        
        let queryParams = [];
        
        // If driver_id is provided, filter by driver
        if (driver_id) {
            query += ` AND (o.driver_id = $1 OR o.driver_id IS NULL)`;
            queryParams.push(driver_id);
        }
        
        query += ` ORDER BY o.created_at DESC`;
        
        const result = await client.query(query, queryParams);
        
        // Return optimized flat structure
        const orders = result.rows.map(row => ({
            id: row.id.toString(),
            order_number: row.order_number,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            customer_email: row.customer_email,
            customer_address: row.customer_address,
            latitude: row.latitude,
            longitude: row.longitude,
            delivery_instructions: row.delivery_instructions,
            five_litre_bottles: row.five_litre_bottles || 0,
            ten_litre_bottles: row.ten_litre_bottles || 0,
            three_hundred_ml_bottles: row.three_hundred_ml_bottles || 0,
            one_litre_bottles: row.one_litre_bottles || 0,
            twenty_litre_bottles: row.twenty_litre_bottles || 0,
            water_dispenser: row.water_dispenser || 0,
            total_amount: row.total_amount || 0,
            payment_method: row.payment_method || 'cash',
            payment_status: row.payment_status || 'pending',
            delivery_zone: row.delivery_zone,
            driver_id: row.driver_id
        }));
        
        res.status(200).json(orders);
    } catch (err) {
        console.error('Error fetching orders:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// GET /api/history - Fetch delivery history with optimized response
app.get('/api/history', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(`
            SELECT 
                o.id,
                o.order_number,
                o.status,
                o.created_at,
                o.updated_at,
                o.customer_name,
                o.customer_phone,
                o.customer_email,
                o.customer_address,
                o.latitude,
                o.longitude,
                o.delivery_instructions,
                o.five_litre_bottles,
                o.ten_litre_bottles,
                o.three_hundred_ml_bottles,
                o.one_litre_bottles,
                o.twenty_litre_bottles,
                o.water_dispenser,
                o.total_amount,
                o.payment_method,
                o.payment_status,
                o.delivery_zone,
                o.assigned_at,
                o.completed_at
            FROM orders o 
            WHERE o.status IN ('delivered', 'failed', 'cancelled')
            ORDER BY o.delivered_at DESC, o.created_at DESC
        `);
        
        // Return optimized flat structure
        const orders = result.rows.map(row => ({
            id: row.id.toString(),
            order_number: row.order_number,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            customer_email: row.customer_email,
            customer_address: row.customer_address,
            latitude: row.latitude,
            longitude: row.longitude,
            delivery_instructions: row.delivery_instructions,
            five_litre_bottles: row.five_litre_bottles || 0,
            ten_litre_bottles: row.ten_litre_bottles || 0,
            three_hundred_ml_bottles: row.three_hundred_ml_bottles || 0,
            one_litre_bottles: row.one_litre_bottles || 0,
            twenty_litre_bottles: row.twenty_litre_bottles || 0,
            water_dispenser: row.water_dispenser || 0,
            total_amount: row.total_amount || 0,
            payment_method: row.payment_method || 'cash',
            payment_status: row.payment_status || 'pending',
            delivery_zone: row.delivery_zone,
            assigned_at: row.assigned_at,
            completed_at: row.completed_at
        }));
        
        res.status(200).json(orders);
    } catch (err) {
        console.error('Error fetching delivery history:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// PUT /api/orders/:id/status - Update order status (MISSING ENDPOINT)
app.put('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, failure_reason, failure_note } = req.body;

    // Validation
    if (!status) {
        return res.status(400).json({ error: 'Status is required.' });
    }

    const validStatuses = ['pending', 'assigned', 'in_progress', 'delivered', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value.' });
    }

    let client;
    try {
        client = await pool.connect();
        
        // Build dynamic update query based on status
        let updateFields = ['status = $2', 'updated_at = NOW()'];
        let values = [id, status];
        let paramCount = 2;

        if (status === 'in_progress') {
            updateFields.push('started_at = NOW()');
        } else if (status === 'delivered') {
            updateFields.push('delivered_at = NOW()');
            updateFields.push('completed_at = NOW()');
        } else if (status === 'failed') {
            if (failure_reason) {
                paramCount++;
                updateFields.push(`failure_reason = $${paramCount}`);
                values.push(failure_reason);
            }
            if (failure_note) {
                paramCount++;
                updateFields.push(`failure_note = $${paramCount}`);
                values.push(failure_note);
            }
        }

        const query = `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await client.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        res.status(200).json({ 
            message: 'Order status updated successfully',
            order: result.rows[0]
        });
    } catch (err) {
        console.error('Error updating order status:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release(); 
        }
    }
});

// POST /api/orders - Create new order 
app.post('/api/orders', async (req, res) => {
    const {
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        latitude,
        longitude,
        delivery_instructions,
        five_litre_bottles,
        ten_litre_bottles,
        three_hundred_ml_bottles,
        one_litre_bottles,
        twenty_litre_bottles,
        water_dispenser,
        subtotal,
        delivery_fee,
        vat,
        total_amount,
        payment_method,
        scheduled_time,
        distance_km,
        delivery_zone
    } = req.body;

    // Basic validation
    if (!customer_name || !customer_phone || !customer_address) {
        return res.status(400).json({ error: 'Customer name, phone, and address are required.' });
    }

    let client;
    try {
        client = await pool.connect(); 
        const result = await client.query(`
            INSERT INTO orders (
                order_number, status, priority, customer_name, customer_phone, customer_email,
                customer_address, latitude, longitude, delivery_instructions, five_litre_bottles,
                ten_litre_bottles, three_hundred_ml_bottles, one_litre_bottles, twenty_litre_bottles,
                water_dispenser, subtotal, delivery_fee, vat, total_amount, payment_method,
                scheduled_time, distance_km, delivery_zone
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
            ) RETURNING *
        `, [
            `ORD-${Date.now()}`, // order_number
            'pending', // status
            'normal', // priority
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            latitude,
            longitude,
            delivery_instructions,
            five_litre_bottles || 0,
            ten_litre_bottles || 0,
            three_hundred_ml_bottles || 0,
            one_litre_bottles || 0,
            twenty_litre_bottles || 0,
            water_dispenser || 0,
            subtotal || 0,
            delivery_fee || 0,
            vat || 0,
            total_amount || 0,
            payment_method || 'cash',
            scheduled_time,
            distance_km || 0,
            delivery_zone
        ]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating order:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release(); 
        }
    }
});

// GET /api/products - Fetch all available products
app.get('/api/products', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(`
            SELECT 
                id,
                name,
                description,
                price,
                unit,
                available_stock,
                category,
                image_url,
                is_active
            FROM products 
            WHERE is_active = true AND available_stock > 0
            ORDER BY category, name ASC
        `);
        
        const products = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            price: parseFloat(row.price),
            unit: row.unit,
            available_stock: row.available_stock,
            category: row.category,
            image_url: row.image_url,
            is_active: row.is_active
        }));
        
        res.status(200).json(products);
    } catch (err) {
        console.error('Error fetching products:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release(); 
        }
    }
});

// POST /api/orders/confirm-payment - Confirm payment and create order
app.post('/api/orders/confirm-payment', async (req, res) => {
    const {
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        latitude,
        longitude,
        delivery_instructions,
        products,
        subtotal,
        vat,
        total_amount,
        payment_method,
        delivery_zone
    } = req.body;

    // Validation
    if (!customer_name || !customer_phone || !customer_address) {
        return res.status(400).json({ error: 'Customer name, phone, and address are required.' });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Products are required.' });
    }

    let client;
    try {
        client = await pool.connect(); 
        
        // Start transaction
        await client.query('BEGIN');
        
        // Generate order number
        const orderNumber = `ORD-${Date.now()}`;
        
        // Create order
        const orderResult = await client.query(`
            INSERT INTO orders (
                order_number, status, priority, customer_name, customer_phone, customer_email,
                customer_address, latitude, longitude, delivery_instructions,
                five_litre_bottles, ten_litre_bottles, three_hundred_ml_bottles,
                one_litre_bottles, twenty_litre_bottles, water_dispenser,
                subtotal, delivery_fee, vat, total_amount, payment_method,
                payment_status, delivery_zone, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()
            ) RETURNING id, order_number, created_at
        `, [
            orderNumber,
            'pending',
            'normal',
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            latitude,
            longitude,
            delivery_instructions,
            products.find(p => p.name === '5L Bottle')?.quantity || 0,
            products.find(p => p.name === '10L Bottle')?.quantity || 0,
            products.find(p => p.name === '300ml Bottle')?.quantity || 0,
            products.find(p => p.name === '1L Bottle')?.quantity || 0,
            products.find(p => p.name === '20L Bottle')?.quantity || 0,
            products.find(p => p.name === 'Water Dispenser')?.quantity || 0,
            subtotal,
            0, // delivery_fee
            vat,
            total_amount,
            payment_method,
            'paid',
            delivery_zone
        ]);

        const order = orderResult.rows[0];
        
        // Update product stock
        for (const product of products) {
            if (product.quantity > 0) {
                await client.query(`
                    UPDATE products 
                    SET available_stock = available_stock - $1, updated_at = NOW()
                    WHERE name = $2 AND available_stock >= $1
                `, [product.quantity, product.name]);
            }
        }
        
        // Commit transaction
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            message: 'Payment confirmed and order created successfully',
            order: {
                id: order.id,
                order_number: order.order_number,
                created_at: order.created_at,
                total_amount: total_amount,
                payment_method: payment_method,
                status: 'pending'
            }
        });
        
    } catch (err) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        console.error('Error confirming payment:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (client) {
            client.release(); 
        }
    }
});

// POST /api/submit_expense - Submit expense request
app.post('/api/submit_expense', async (req, res) => {
    const {
        driver_id,
        type,
        amount,
        description,
        receipt_image,
        submission_date
    } = req.body;

    // Validation
    if (!driver_id || !type || !amount) {
        return res.status(400).json({ 
            error: 'Driver ID, expense type, and amount are required.' 
        });
    }

    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ 
            error: 'Amount must be a positive number.' 
        });
    }

    const validTypes = ['Fuel', 'Parking', 'Toll', 'Maintenance', 'Supplies', 'Other'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ 
            error: 'Invalid expense type.' 
        });
    }

    let client;
    try {
        client = await pool.connect();
        
        // Generate expense request ID
        const requestId = `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Insert expense request
        const result = await client.query(`
            INSERT INTO expenses (
                request_id, driver_id, type, amount, description, 
                receipt_image, status, submission_date, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
            ) RETURNING id, request_id, status, created_at
        `, [
            requestId,
            driver_id,
            type,
            amount,
            description || null,
            receipt_image || null,
            'pending',
            submission_date || new Date().toISOString()
        ]);

        const expense = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'Expense request submitted successfully',
            expense: {
                id: expense.id,
                request_id: expense.request_id,
                status: expense.status,
                created_at: expense.created_at
            }
        });

    } catch (err) {
        console.error('Error submitting expense:', err.stack);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: err.message 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// GET /api/expenses/:driver_id - Get expense requests for a driver
app.get('/api/expenses/:driver_id', async (req, res) => {
    const { driver_id } = req.params;
    const { status } = req.query; // Optional filter by status

    if (!driver_id) {
        return res.status(400).json({ 
            error: 'Driver ID is required.' 
        });
    }

    let client;
    try {
        client = await pool.connect();
        
        let query = `
            SELECT 
                id,
                request_id,
                type,
                amount,
                description,
                receipt_image,
                status,
                submission_date,
                created_at,
                updated_at,
                reviewed_at,
                reviewed_by,
                review_notes
            FROM expenses 
            WHERE driver_id = $1
        `;
        
        let queryParams = [driver_id];
        
        // Add status filter if provided
        if (status) {
            query += ` AND status = $2`;
            queryParams.push(status);
        }
        
        query += ` ORDER BY created_at DESC`;

        const result = await client.query(query, queryParams);

        const expenses = result.rows.map(row => ({
            id: row.id,
            request_id: row.request_id,
            type: row.type,
            amount: parseFloat(row.amount),
            description: row.description,
            receipt_image: row.receipt_image,
            status: row.status,
            submission_date: row.submission_date,
            created_at: row.created_at,
            updated_at: row.updated_at,
            reviewed_at: row.reviewed_at,
            reviewed_by: row.reviewed_by,
            review_notes: row.review_notes
        }));

        res.status(200).json(expenses);

    } catch (err) {
        console.error('Error fetching expenses:', err.stack);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: err.message 
        });
    } finally {
        if (client) {
            client.release(); 
        }
    }
});

// --- Start the Server ---
app.listen(3000, "0.0.0.0", () => {
    console.log(`Express backend server listening on port ${port}`);
    console.log(`Access API at http://localhost:${port}/api/users`);
});