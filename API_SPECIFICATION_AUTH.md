# Authentication API Specification

## Base URL
```
/api/auth
```

---

## 1. Request OTP (First Time Login)

**Endpoint:** `POST /api/auth/request-otp`

**Request Body:**
```json
{
  "phone": "string"
}
```

**Response (Success - First Time User):**
```json
{
  "success": true,
  "message": "OTP sent to your phone number",
  "temp_token": "temporary_jwt_token_string",
  "requires_otp": true
}
```

**Response (User Not Found):**
```json
{
  "success": false,
  "message": "Phone number not registered"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid phone format" | "Failed to send OTP"
}
```

**Status Codes:**
- `200` - OTP sent successfully (first time user)
- `400` - Validation error
- `404` - Phone number not found in system
- `500` - Server error

**Notes:**
- Server checks if phone number exists in driver database
- If exists and first login: sends OTP via SMS and returns temporary token
- Temporary token expires in 10-15 minutes
- Temporary token must be used for OTP verification

---

## 2. Verify OTP (First Time Login)

**Endpoint:** `POST /api/auth/verify-otp`

**Headers:**
```
Authorization: Bearer <temp_token>
```

**Request Body:**
```json
{
  "phone": "string",
  "otp": "string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "token": "permanent_jwt_token_string",
  "refresh_token": "refresh_token_string",
  "user": {
    "id": "string",
    "name": "string",
    "phone": "string",
    "email": "string",
    "status": "approved" | "pending" | "rejected"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid OTP" | "OTP expired" | "OTP already used" | "Invalid temporary token"
}
```

**Status Codes:**
- `200` - OTP verified successfully, permanent token issued
- `400` - Invalid OTP
- `401` - Invalid/expired temporary token
- `410` - OTP expired
- `500` - Server error

**Notes:**
- Temporary token must be included in Authorization header
- After successful verification, permanent token is issued
- Permanent token is used for all subsequent API calls

---

## 3. Resend OTP (First Time Login)

**Endpoint:** `POST /api/auth/resend-otp`

**Headers:**
```
Authorization: Bearer <temp_token>
```

**Request Body:**
```json
{
  "phone": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent to your phone number"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid phone number" | "Invalid temporary token" | "Rate limit exceeded"
}
```

**Status Codes:**
- `200` - OTP resent successfully
- `400` - Invalid phone number
- `401` - Invalid/expired temporary token
- `429` - Rate limit exceeded
- `500` - Server error

---

## 4. Verify Token (Check Auth)

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (Valid Token):**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "status": "approved" | "pending" | "rejected"
  }
}
```

**Response (Invalid Token):**
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

**Status Codes:**
- `200` - Token valid
- `401` - Invalid/expired token
- `500` - Server error

---

## 5. Logout

**Endpoint:** `POST /api/auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Status Codes:**
- `200` - Logout successful
- `401` - Invalid token
- `500` - Server error

---

## Data Types

### User
```typescript
{
  id: string;                    // Unique user identifier
  name: string;                  // User's full name
  phone: string;                 // User's phone number (unique, required)
  email?: string;                // User's email (optional)
  status: "pending" | "approved" | "rejected";  // Account approval status
}
```

### Token Response
```typescript
{
  token: string;                 // JWT access token (expires in 24h or as configured)
  refresh_token?: string;        // Refresh token (optional, for token renewal)
  temp_token?: string;           // Temporary token for OTP verification (expires in 10-15 min)
}
```

---

## Security Requirements

1. **Password Requirements:**
   - Minimum 6 characters
   - Should be hashed using bcrypt or similar
   - Never return password in responses

2. **Token Requirements:**
   - JWT tokens with expiration
   - Store in secure storage on client
   - Include user ID and email in token payload
   - Validate token on protected routes

3. **Temporary Token Requirements:**
   - Issued when OTP is sent for first-time login
   - Expires in 10-15 minutes
   - Must be included in Authorization header for OTP verification
   - Single-use: invalidated after successful OTP verification

4. **Approval Workflow:**
   - Drivers are pre-registered in system by admin
   - First login requires OTP verification
   - After OTP verification, account status determines access
   - Only users with `status: "approved"` can access app
   - Admin must approve/reject accounts
   - Rejected users cannot login

5. **OTP Requirements:**
   - OTP should be 6 digits
   - OTP expires in 5-10 minutes (configurable)
   - OTP can only be used once
   - Rate limit OTP requests (max 3 per 15 minutes)
   - OTP is sent via SMS to registered phone number

6. **Error Handling:**
   - Generic error messages for security
   - Rate limiting on login attempts
   - Rate limiting on OTP requests
   - Don't reveal if phone exists in system (for security)

---

## Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "phone": "Invalid phone format",
    "password": "Password must be at least 6 characters",
    "otp": "Invalid OTP format"
  }
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Invalid credentials" | "Invalid or expired token"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Account not approved" | "Account rejected"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Notes

1. All timestamps use ISO 8601 format (UTC)
2. Tokens should be included in `Authorization: Bearer <token>` header
3. Phone numbers should be in international format (e.g., +971501234567)
4. Passwords must be hashed before storing in database
5. OTP codes are 6 digits, expire in 5-10 minutes
6. Implement rate limiting to prevent brute force attacks
7. Account status determines login access:
   - `pending` - Cannot login, waiting for approval
   - `approved` - Can login and access app
   - `rejected` - Cannot login, account rejected
8. **Authentication Flow:**
   
   **First Time / Token Expired:**
   - Step 1: User enters phone number
   - Step 2: POST /api/auth/request-otp → Server sends OTP via SMS + returns temporary token
   - Step 3: User enters OTP → POST /api/auth/verify-otp (with temp token) → Server returns permanent token
   - Step 4: Permanent token is stored securely on device
   - Step 5: User can access app (if status is "approved")
   
   **Subsequent App Launches (Token Valid):**
   - Step 1: App checks for stored token on launch
   - Step 2: GET /api/auth/me (with token) → Server validates token
   - Step 3: If token valid → User directly accesses app
   - Step 4: If token expired/invalid → User must go through OTP flow again
   
9. **Token Management:**
   - Permanent token is stored securely on device (SecureStore)
   - Token persists across app restarts
   - Token is used for all authenticated API requests
   - Token expiration is handled by backend (typically 24h or as configured)
   - When token expires, user must verify phone via OTP again
   
10. **Driver Management:**
   - Drivers are pre-registered in the system by administrator
   - Phone numbers are known to the server
   - No self-registration - all drivers must be added by admin
   - No password required - authentication is token-based only

