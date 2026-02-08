# Pick Pack Workflow Seeding Guide

This guide explains how to seed pick pack orders for all users in the system.

## Overview

The pick pack workflow allows warehouse workers to pick items using smart glasses. To test or deploy this feature, you need to create pick orders for users. This document explains how to seed (pre-populate) pick orders for all users.

## Pick Order Structure

A pick order contains:

- **id**: Unique identifier for the pick order
- **userId**: Firebase user ID
- **userName**: Display name of the user
- **organizationId**: Organization the user belongs to
- **items**: Array of items to pick, each containing:
  - `productId`: Unique product identifier
  - `upc`: Barcode/UPC code (12 or 13 digits)
  - `productName`: Name of the product
  - `quantity`: Number of units to pick
  - `location`: Warehouse location (aisle, shelf, bin)
  - `scanned`: Boolean indicating if item has been scanned
  - `scannedAt`: Timestamp when item was scanned (optional)
- **currentStep**: Current step in the picking process
- **status**: `'pending' | 'in_progress' | 'completed'`
- **startedAt**: When the order was started (optional)
- **completedAt**: When the order was completed (optional)
- **createdAt**: When the order was created

## API Endpoints

The pick pack API is hosted at:
```
https://omnia-api-447424955509.us-central1.run.app
```

### Available Endpoints

1. **GET** `/api/pickpack/picks/user/:userId`
   - Get active pick order for a user
   - Returns 404 if no active order exists

2. **POST** `/api/pickpack/picks/:pickId/scan`
   - Submit a UPC scan for validation
   - Body: `{ upc: string }`

3. **POST** `/api/pickpack/picks/:pickId/complete`
   - Mark a pick order as complete

### Creating Pick Orders

**Note**: The client-side code doesn't expose a create endpoint. Pick orders are typically created by:
1. Backend API endpoint (if available)
2. Direct Firestore writes (using Firebase Admin SDK)
3. Backend admin interface

## Seeding Methods

### Method 1: Using Backend API (Recommended)

If your backend API has a create endpoint (e.g., `POST /api/pickpack/picks`), you can use it:

```typescript
const API_URL = 'https://omnia-api-447424955509.us-central1.run.app';

async function createPickOrder(userId: string, userName: string, organizationId: string) {
  const response = await fetch(`${API_URL}/api/pickpack/picks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      userName,
      organizationId,
      items: [
        {
          productId: 'prod-001',
          upc: '123456789012',
          productName: 'Sample Product 1',
          quantity: 2,
          location: {
            aisle: 'A',
            shelf: '1',
            bin: 'B-12'
          },
          scanned: false
        },
        {
          productId: 'prod-002',
          upc: '123456789013',
          productName: 'Sample Product 2',
          quantity: 1,
          location: {
            aisle: 'B',
            shelf: '2',
            bin: 'C-24'
          },
          scanned: false
        }
      ],
      currentStep: 0,
      status: 'pending',
      createdAt: new Date()
    })
  });

  return response.json();
}
```

### Method 2: Direct Firestore Write (Using Firebase Admin SDK)

If you have access to Firebase Admin SDK, you can write directly to Firestore:

```typescript
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (requires service account)
const db = getFirestore();

async function seedPickOrders() {
  // Get all users from Firestore
  const usersSnapshot = await db.collection('users').get();
  
  const sampleItems = [
    {
      productId: 'prod-001',
      upc: '123456789012',
      productName: 'Sample Product 1',
      quantity: 2,
      location: { aisle: 'A', shelf: '1', bin: 'B-12' },
      scanned: false
    },
    {
      productId: 'prod-002',
      upc: '123456789013',
      productName: 'Sample Product 2',
      quantity: 1,
      location: { aisle: 'B', shelf: '2', bin: 'C-24' },
      scanned: false
    }
  ];

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    
    // Check if user already has an active pick order
    const existingOrders = await db.collection('pickOrders')
      .where('userId', '==', userDoc.id)
      .where('status', 'in', ['pending', 'in_progress'])
      .get();
    
    if (existingOrders.empty) {
      // Create new pick order
      const pickOrder = {
        userId: userDoc.id,
        userName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
        organizationId: userData.organizationId || 'default-org',
        items: sampleItems,
        currentStep: 0,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('pickOrders').add(pickOrder);
      console.log(`Created pick order for user: ${userData.email}`);
    }
  }
}
```

### Method 3: Using the Seeding Script

A Node.js script is provided in `scripts/seedPickPackOrders.ts` that automates the seeding process.

## Sample Pick Order Data

Here's a complete example of a pick order:

```json
{
  "id": "pick-order-123",
  "userId": "user-abc123",
  "userName": "John Doe",
  "organizationId": "org-xyz789",
  "items": [
    {
      "productId": "prod-001",
      "upc": "123456789012",
      "productName": "Widget A",
      "quantity": 3,
      "location": {
        "aisle": "A",
        "shelf": "1",
        "bin": "B-12"
      },
      "scanned": false
    },
    {
      "productId": "prod-002",
      "upc": "123456789013",
      "productName": "Widget B",
      "quantity": 2,
      "location": {
        "aisle": "B",
        "shelf": "2",
        "bin": "C-24"
      },
      "scanned": false
    },
    {
      "productId": "prod-003",
      "upc": "123456789014",
      "productName": "Widget C",
      "quantity": 1,
      "location": {
        "aisle": "C",
        "shelf": "3",
        "bin": "D-36"
      },
      "scanned": false
    }
  ],
  "currentStep": 0,
  "status": "pending",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

## Important Notes

### UPC Codes

- UPC codes can be 12 digits (UPC-A) or 13 digits (EAN-13)
- The system handles conversion between formats automatically
- Ensure UPC codes match actual product barcodes for testing

### Location Format

- **Aisle**: Typically a letter (A, B, C) or alphanumeric
- **Shelf**: Shelf number within the aisle
- **Bin**: Specific bin location (e.g., "B-12", "C-24")

### Status Flow

1. **pending**: Order created but not started
2. **in_progress**: User has started picking items
3. **completed**: All items have been scanned

### Active Orders

- Only one active (pending or in_progress) order per user at a time
- When seeding, check for existing active orders to avoid duplicates
- Completed orders remain in the database for historical tracking

## Testing Seeded Orders

After seeding:

1. **Verify in Mobile App**:
   - Log in as a seeded user
   - Navigate to the Pick Pack screen
   - Verify the order appears with all items

2. **Test Scanning**:
   - Connect smart glasses
   - Start scanning
   - Scan the UPC codes in order
   - Verify items are marked as scanned

3. **Test Completion**:
   - Scan all items
   - Verify order is marked as completed
   - Check that a new order can be loaded (if seeded)

## Troubleshooting

### No Orders Appearing

- Check that pick orders were created in Firestore
- Verify the API endpoint is accessible
- Check user authentication status
- Ensure `organizationId` matches between user and order

### Scanning Not Working

- Verify UPC codes match exactly (including leading zeros)
- Check that glasses are connected and video stream is active
- Review console logs for barcode detection events

### Duplicate Orders

- Ensure seeding script checks for existing active orders
- Use unique identifiers for each order
- Consider adding a timestamp or sequence number

## Using the Seeding Script

A seeding script is provided at `omnia-mobile/scripts/seedPickPackOrders.ts`.

### Setup

1. **Install dependencies**:
   ```bash
   cd omnia-mobile
   npm install firebase-admin ts-node --save-dev
   ```

2. **Set up Firebase Admin**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file as `serviceAccountKey.json` in the project root
   - **Important**: Add `serviceAccountKey.json` to `.gitignore` to avoid committing credentials

3. **Run the script**:
   ```bash
   # Seed orders for all users
   npx ts-node scripts/seedPickPackOrders.ts
   
   # Seed orders for specific users
   npx ts-node scripts/seedPickPackOrders.ts --users user1@example.com user2@example.com
   ```

### Customizing Sample Data

Edit the `SAMPLE_PICK_ITEMS` array in the script to match your actual products:

```typescript
const SAMPLE_PICK_ITEMS = [
  {
    productId: 'your-product-id',
    upc: '123456789012',  // Replace with actual UPC
    productName: 'Your Product Name',
    quantity: 2,
    location: {
      aisle: 'A',
      shelf: '1',
      bin: 'B-12'
    },
    scanned: false
  },
  // Add more items...
];
```

## Next Steps

1. **Set up the script**: Follow the setup instructions above
2. **Define Sample Products**: Update the sample items with your actual product data
3. **Test Workflow**: Seed orders and test the complete pick-pack flow
4. **Production Seeding**: If needed, create a production seeding process with proper error handling and logging

## Related Documentation

- [Pick Pack Screen Implementation](../omnia-mobile/src/screens/PickPackScreen.tsx)
- [Pick Pack API Service](../omnia-mobile/src/services/pickPackApi.ts)
- [Pick Pack Types](../omnia-mobile/src/types/pickPack.ts)

