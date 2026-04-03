# Al Ghadeer Driver Server

Complete Express.js backend server with dummy data for all frontend API endpoints.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode (with auto-reload)
npm run dev
```

Server runs on **port 3001** by default (configurable via `PORT` environment variable).

## 📡 API Endpoints

### Authentication
- `POST /auth/request-otp` - Request OTP for phone verification
- `POST /auth/verify-otp` - Verify OTP and get permanent token
- `POST /auth/resend-otp` - Resend OTP code
- `GET /auth/me` - Verify token and get user info
- `POST /auth/logout` - Logout user

### Orders
- `GET /driver/orders?driver_id=xxx` - Get current orders (pending, assigned, in_progress)
- `GET /driver/history?driver_id=xxx` - Get delivery history (delivered, failed, cancelled)
- `POST /driver/orders/confirm-payment?driver_id=xxx` - Confirm payment and create order

### Loaded/Unloaded Items
- `GET /drivers/:driver_id/loaded-items/request` - Get items to load
- `POST /drivers/:driver_id/loaded-items/confirm` - Confirm loaded items
- `GET /drivers/:driver_id/unloaded-items/request` - Get items to unload
- `POST /drivers/:driver_id/unloaded-items/confirm` - Confirm unloaded items

### Failed Deliveries
- `GET /driver/failed-deliveries?driver_id=xxx` - Get failed deliveries
- `POST /failed-deliveries/submit?driver_id=xxx` - Submit failed delivery report

### Expenses
- `GET /expenses?driver_id=xxx&status=pending` - Get expense history (optional status filter)
- `POST /expenses/submit?driver_id=xxx` - Submit new expense

### Products
- `GET /products?driver_id=xxx&customer_site_id=xxx` - Get available products
- `GET /driver/products?driver_id=xxx&customer_site_id=xxx` - Get available products (alias)

### Health Check
- `GET /health` - Server health status

## 📝 Response Formats

All endpoints return JSON responses with consistent structure:

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": [...]
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description"
}
```

## 🔧 Configuration

Create a `.env` file (optional):
```env
PORT=3001
```

## 📦 Dependencies

- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variables

## 🎯 Features

- ✅ Complete dummy data for all endpoints
- ✅ CORS enabled for all origins
- ✅ JSON request/response handling
- ✅ Large payload support (50MB limit for base64 images)
- ✅ Consistent error handling
- ✅ Health check endpoint

## 📋 Notes

- All data is **dummy/mock data** - no database required
- Token validation is simplified (checks token prefix)
- OTP verification accepts any 6-digit code
- All endpoints return successful responses with realistic dummy data
- Server is ready for frontend integration

## 🔗 Frontend Integration

Update your frontend API base URL to:
```
http://yoniash.aa.uaeu.ac.ae:3001
```

Or use environment variable:
```env
EXPO_PUBLIC_IP_ADDRESS=http://yoniash.aa.uaeu.ac.ae:3001
```
