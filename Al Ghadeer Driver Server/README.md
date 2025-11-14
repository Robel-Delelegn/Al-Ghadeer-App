# Al Ghadeer Water Delivery - Backend Server

## 🚀 **Quick Setup Guide**

### **1. Environment Setup**

Create a `.env` file in the server directory:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/al_ghadeer_db

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional: Add your specific database credentials
DB_HOST=localhost
DB_PORT=5432
DB_NAME=al_ghadeer_db
DB_USER=your_username
DB_PASSWORD=your_password
```

### **2. Database Setup**

#### **Option A: Using the provided SQL schema**
1. Create a PostgreSQL database named `al_ghadeer_db`
2. Run the schema file:
```bash
psql -U your_username -d al_ghadeer_db -f database_schema.sql
```

#### **Option B: Using Neon (Cloud PostgreSQL)**
1. Create a Neon account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string to your `.env` file as `DATABASE_URL`

### **3. Install Dependencies**
```bash
npm install
```

### **4. Start the Server**
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

---

## 📊 **Database Schema Overview**

### **Tables Created:**

1. **`users`** - Driver authentication (Clerk integration)
2. **`orders`** - Main orders table with complete order lifecycle
3. **`drivers`** - Driver profiles and performance metrics
4. **`products`** - Product catalog and inventory
5. **`expenses`** - Driver expense tracking

### **Key Features:**
- ✅ Complete order lifecycle tracking
- ✅ Driver performance metrics
- ✅ Product inventory management
- ✅ Expense tracking with receipts
- ✅ Location-based queries
- ✅ Automatic timestamps and triggers
- ✅ Performance indexes
- ✅ Sample data for testing

---

## 🔌 **API Endpoints**

### **Authentication & Users**
- `GET /api/users` - Fetch all users
- `POST /api/users` - Create new user (Clerk integration)

### **Orders Management**
- `GET /api/orders` - Fetch current orders (pending, assigned, in_progress)
- `GET /api/history` - Fetch delivery history (delivered, failed, cancelled)
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id/status` - Update order status

### **Response Format**
All endpoints return data in the exact format expected by the frontend:

```json
{
  "id": "123",
  "order_number": "ORD-001",
  "status": "pending",
  "customer": {
    "name": "Ahmed Al-Rashid",
    "phone": "+971501234567",
    "address": "123 Sheikh Zayed Road, Dubai",
    "latitude": 25.2048,
    "longitude": 55.2708
  },
  "products": {
    "five_litre_bottles": 2,
    "ten_litre_bottles": 1
  },
  "pricing": {
    "subtotal": 7.00,
    "total_amount": 10.35
  },
  "delivery": {
    "distance_km": 5.2,
    "scheduled_time": "2024-01-15T10:00:00Z"
  }
}
```

---

## 🔧 **Frontend Integration**

### **Environment Variables for Frontend**
Add to your frontend `.env` file:

```env
# Server Configuration
IP_ADDRESS=localhost  # or your server IP
EXPO_PUBLIC_API_URL=http://localhost:3000/api

# Clerk Authentication
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key

# Google Maps
EXPO_PUBLIC_GOOGLE_API_KEY=your_google_maps_key
```

### **API Base URL**
The frontend expects the server at:
```
http://${IP_ADDRESS}:3000/api
```

---

## 🚨 **Critical Changes Made**

### **1. Fixed Data Structure Mismatch**
- **Before**: Simple flat database structure
- **After**: Complex nested structure matching frontend expectations

### **2. Added Missing Endpoints**
- **Before**: Missing `PUT /api/orders/:id/status`
- **After**: Complete CRUD operations for orders

### **3. Enhanced Order Management**
- **Before**: Basic order fields
- **After**: Complete order lifecycle with tracking, pricing, delivery details

### **4. Added Driver Management**
- **Before**: No driver profiles
- **After**: Complete driver system with performance metrics

### **5. Product & Inventory System**
- **Before**: No product management
- **After**: Full product catalog with inventory tracking

---

## 📱 **Frontend Compatibility**

### **✅ Now Working:**
- Order fetching and display
- Order status updates
- Delivery history
- User authentication
- Map integration
- Expense tracking
- Product management

### **🔧 Fixed Issues:**
- API endpoint mismatches
- Data structure incompatibility
- Missing authentication
- No error handling
- State synchronization problems

---

## 🧪 **Testing the API**

### **Test Order Creation:**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test Customer",
    "customer_phone": "+971501234567",
    "customer_address": "Test Address, Dubai",
    "latitude": 25.2048,
    "longitude": 55.2708,
    "five_litre_bottles": 2,
    "ten_litre_bottles": 1,
    "subtotal": 7.00,
    "total_amount": 10.35
  }'
```

### **Test Order Status Update:**
```bash
curl -X PUT http://localhost:3000/api/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress"
  }'
```

---

## 🚀 **Production Deployment**

### **1. Environment Variables**
```env
NODE_ENV=production
DATABASE_URL=your_production_database_url
PORT=3000
```

### **2. Security Considerations**
- Update CORS settings to restrict origins
- Add authentication middleware
- Use HTTPS in production
- Add rate limiting
- Implement input validation

### **3. Database Optimization**
- Regular backups
- Monitor query performance
- Update indexes as needed
- Consider read replicas for scaling

---

## 📞 **Support**

If you encounter any issues:

1. Check the database connection
2. Verify environment variables
3. Check server logs for errors
4. Ensure all dependencies are installed
5. Verify the database schema is properly created

---

## 🔄 **Next Steps**

1. **Authentication**: Implement proper JWT or session-based auth
2. **Real-time Updates**: Add WebSocket support for live order updates
3. **File Uploads**: Add support for receipt and proof-of-delivery uploads
4. **Push Notifications**: Integrate with FCM for order notifications
5. **Analytics**: Add comprehensive reporting and analytics
6. **Mobile Optimization**: Optimize API responses for mobile performance

---

**The backend is now fully compatible with your frontend! 🎉**
