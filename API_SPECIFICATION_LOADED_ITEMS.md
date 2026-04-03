# Loaded/Unloaded Items API Specification

## Base URL
```
/drivers/:driver_id
```

---

## 1. Request Items (Load)

**Endpoint:** `GET /drivers/:driver_id/loaded-items/request`

**Response:**
```json
{
  "success": true,
  "message": "Items retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "condition": "full"
    }
  ],
  "requested_at": "2024-01-15T10:00:00Z"
}
```

**Empty Response (no items available):**
```json
{
  "success": true,
  "message": "No items available for loading",
  "data": [],
  "requested_at": "2024-01-15T10:00:00Z"
}
```

---

## 2. Request Items (Unload)

**Endpoint:** `GET /drivers/:driver_id/unloaded-items/request`

**Response:**
```json
{
  "success": true,
  "message": "Items retrieved successfully",
  "data": [
    {
      "id": "string",
      "name": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "condition": "full" | "empty" | "leaked" | "damaged"
    }
  ],
  "requested_at": "2024-01-15T10:00:00Z"
}
```

**Empty Response (no items available):**
```json
{
  "success": true,
  "message": "No items available for unloading",
  "data": [],
  "requested_at": "2024-01-15T10:00:00Z"
}
```

---

## 3. Confirm Items (Load)

**Endpoint:** `POST /drivers/:driver_id/loaded-items/confirm`

**Request Body:**
```json
{
  "driver_id": "string",
  "items": [
    {
      "id": "string",
      "name": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "condition": "full"
    }
  ],
  "is_correct": boolean,
  "confirmed_at": "2024-01-15T10:00:00Z"
}
```

**Response (Agreed):**
```json
{
  "success": true,
  "message": "Items have been loaded and agreed upon successfully",
  "agreement": {
    "status": "agreed",
    "notes": "All items confirmed. Items are now in your vehicle."
  }
}
```

**Response (Disagreed):**
```json
{
  "success": true,
  "message": "Disagreement noted",
  "agreement": {
    "status": "disagreed",
    "notes": "Quantity mismatch detected. Please verify with store manager.",
    "final_items": [
      {
        "id": "string",
        "name": "string",
        "quantity": number,
        "unit": "string",
        "category": "string",
        "condition": "full"
      }
    ]
  }
}
```

---

## 4. Confirm Items (Unload)

**Endpoint:** `POST /drivers/:driver_id/unloaded-items/confirm`

**Request Body:**
```json
{
  "driver_id": "string",
  "items": [
    {
      "id": "string",
      "name": "string",
      "quantity": number,
      "unit": "string",
      "category": "string",
      "condition": "full" | "empty" | "leaked" | "damaged"
    }
  ],
  "is_correct": boolean,
  "confirmed_at": "2024-01-15T10:00:00Z"
}
```

**Response (Agreed):**
```json
{
  "success": true,
  "message": "Items have been unloaded and agreed upon successfully",
  "agreement": {
    "status": "agreed",
    "notes": "All items confirmed by management. Items have been returned to warehouse."
  }
}
```

**Response (Disagreed):**
```json
{
  "success": true,
  "message": "Disagreement noted.",
  "agreement": {
    "status": "disagreed",
    "notes": "Quantity mismatch detected. Please verify with store manager.",
    "final_items": [
      {
        "id": "string",
        "name": "string",
        "quantity": number,
        "unit": "string",
        "category": "string",
        "condition": "full" | "empty" | "leaked" | "damaged"
      }
    ]
  }
}
```

---

## Data Types

### Item
```typescript
{
  id: string;                    // Unique item identifier
  name: string;                  // Item name (e.g., "5L Water Bottles")
  quantity: number;              // Quantity (must be > 0)
  unit: string;                  // Unit of measurement (e.g., "bottles", "units")
  category: string;              // Category (e.g., "Water", "Equipment")
  condition?: string;            // Only for unload: "full" | "empty" | "leaked" | "damaged"
}
```

### Condition Values (Unload Only)
- `"full"` - Full bottles being returned
- `"empty"` - Empty bottles being returned
- `"leaked"` - Leaked bottles being returned
- `"damaged"` - Damaged bottles being returned

---

## Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Invalid request data",
  "error": "Validation error details"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Driver not found"
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
2. `driver_id` in URL must match `driver_id` in request body
3. Empty `data` array is valid when no items are available
4. `condition` field is optional for load operations (defaults to "full")
5. `condition` field is required for unload operations
6. `final_items` in disagreement response contains corrected quantities
