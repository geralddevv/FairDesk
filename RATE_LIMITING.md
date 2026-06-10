# Rate Limiting Guide

## Overview
Four rate limiters are available in `utils/limiters.js`:
- **loginLimiter**: 20 requests per 15 minutes (for login endpoint)
- **createLimiter**: 10 requests per minute (for POST create operations)
- **updateLimiter**: 30 requests per minute (for PUT/PATCH update operations)
- **deleteLimiter**: 5 requests per minute (for DELETE operations)

## Usage in Route Files

### 1. Import the limiters

```javascript
import { createLimiter, updateLimiter, deleteLimiter } from "../../utils/limiters.js";
```

### 2. Apply to routes

```javascript
// Create endpoint
router.post("/form/tape", requireAuth, createLimiter, async (req, res) => {
  // Handle tape creation
});

// Update endpoint
router.post("/edit/tape", requireAuth, updateLimiter, async (req, res) => {
  // Handle tape update
});

// Delete endpoint
router.post("/delete/tape", requireAuth, deleteLimiter, async (req, res) => {
  // Handle tape deletion
});
```

### 3. Middleware order
The correct middleware order is:
1. **requireAuth** - Verify user is logged in
2. **Limiter** (createLimiter, updateLimiter, deleteLimiter) - Rate limit the request
3. **Handler** - Process the request

```javascript
router.post("/endpoint", requireAuth, [limiter], handler);
```

## Status Codes & Headers
When a rate limit is exceeded:
- **Status Code**: 429 (Too Many Requests)
- **Header**: `Retry-After` shows seconds to wait
- **Message**: Custom message from the limiter

## Configuration
To modify limits, edit `utils/limiters.js`:
- `windowMs`: Time window in milliseconds
- `max`: Maximum requests per window
- `message`: Error message to display

## Example: Complete Route File

```javascript
import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createLimiter, updateLimiter, deleteLimiter } from "../../utils/limiters.js";

const router = express.Router();

// Create
router.post("/form/item", requireAuth, createLimiter, async (req, res) => {
  // Create logic
});

// Read
router.get("/item/:id", requireAuth, (req, res) => {
  // Read logic (no limiter needed)
});

// Update
router.post("/edit/item", requireAuth, updateLimiter, async (req, res) => {
  // Update logic
});

// Delete
router.post("/delete/item", requireAuth, deleteLimiter, async (req, res) => {
  // Delete logic
});

export default router;
```
