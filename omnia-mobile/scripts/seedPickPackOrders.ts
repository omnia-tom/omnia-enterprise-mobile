/**
 * Pick Pack Order Seeding Script
 * 
 * This script seeds pick pack orders for all users in the system.
 * 
 * Setup:
 *   1. Install dependencies:
 *      npm install firebase-admin ts-node --save-dev
 *   
 *   2. Set up Firebase Admin:
 *      - Download service account key from Firebase Console
 *      - Place it in the project root or set GOOGLE_APPLICATION_CREDENTIALS
 * 
 * Usage:
 *   npx ts-node scripts/seedPickPackOrders.ts
 *   npx ts-node scripts/seedPickPackOrders.ts --users user1@example.com user2@example.com
 * 
 * Prerequisites:
 *   - Firebase Admin SDK configured with service account
 *   - Node.js with TypeScript support
 *   - Access to Firestore database
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
// You'll need to set up a service account JSON file
// See: https://firebase.google.com/docs/admin/setup
if (!admin.apps.length) {
  try {
    // Option 1: Use service account file (recommended)
    // Place your serviceAccountKey.json in the project root
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Initialized Firebase Admin with service account file');
  } catch (error) {
    try {
      // Option 2: Use environment variable
      // Set GOOGLE_APPLICATION_CREDENTIALS to path of service account JSON
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log('✅ Initialized Firebase Admin with application default credentials');
    } catch (envError) {
      console.error('❌ Failed to initialize Firebase Admin');
      console.error('Please set up Firebase Admin SDK:');
      console.error('1. Download service account key from Firebase Console');
      console.error('2. Place it as serviceAccountKey.json in project root');
      console.error('3. Or set GOOGLE_APPLICATION_CREDENTIALS environment variable');
      process.exit(1);
    }
  }
}

const db = getFirestore();

/**
 * Sample pick items for seeding
 * Replace with your actual product data
 */
const SAMPLE_PICK_ITEMS = [
  {
    productId: 'prod-001',
    upc: '123456789012',
    productName: 'Widget A - Standard Size',
    quantity: 3,
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
    productName: 'Widget B - Large Size',
    quantity: 2,
    location: {
      aisle: 'B',
      shelf: '2',
      bin: 'C-24'
    },
    scanned: false
  },
  {
    productId: 'prod-003',
    upc: '123456789014',
    productName: 'Widget C - Premium',
    quantity: 1,
    location: {
      aisle: 'C',
      shelf: '3',
      bin: 'D-36'
    },
    scanned: false
  },
  {
    productId: 'prod-004',
    upc: '123456789015',
    productName: 'Widget D - Economy',
    quantity: 4,
    location: {
      aisle: 'A',
      shelf: '2',
      bin: 'E-48'
    },
    scanned: false
  },
  {
    productId: 'prod-005',
    upc: '123456789016',
    productName: 'Widget E - Deluxe',
    quantity: 1,
    location: {
      aisle: 'D',
      shelf: '1',
      bin: 'F-60'
    },
    scanned: false
  }
];

/**
 * Generate a unique pick order ID
 */
function generatePickOrderId(): string {
  return `pick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get user's display name from user data
 */
function getUserDisplayName(userData: any): string {
  if (userData.firstName && userData.lastName) {
    return `${userData.firstName} ${userData.lastName}`.trim();
  }
  if (userData.name) {
    return userData.name;
  }
  if (userData.email) {
    return userData.email.split('@')[0];
  }
  return 'Unknown User';
}

/**
 * Check if user has an active pick order
 */
async function hasActivePickOrder(userId: string): Promise<boolean> {
  const activeOrders = await db.collection('pickOrders')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'in_progress'])
    .limit(1)
    .get();
  
  return !activeOrders.empty;
}

/**
 * Create a pick order for a user
 */
async function createPickOrderForUser(
  userId: string,
  userData: any,
  items: typeof SAMPLE_PICK_ITEMS
): Promise<string> {
  const pickOrderId = generatePickOrderId();
  const userName = getUserDisplayName(userData);
  const organizationId = userData.organizationId || 'default-org';
  
  const pickOrder = {
    id: pickOrderId,
    userId,
    userName,
    organizationId,
    items: items.map(item => ({
      ...item,
      scanned: false
    })),
    currentStep: 0,
    status: 'pending' as const,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  // Option 1: Store in Firestore collection 'pickOrders'
  await db.collection('pickOrders').doc(pickOrderId).set(pickOrder);
  
  // Option 2: If your backend expects a different structure,
  // you might need to call the API instead:
  /*
  const API_URL = process.env.API_URL || 'https://omnia-api-447424955509.us-central1.run.app';
  const response = await fetch(`${API_URL}/api/pickpack/picks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pickOrder)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create pick order: ${response.statusText}`);
  }
  */
  
  return pickOrderId;
}

/**
 * Main seeding function
 */
async function seedPickPackOrders() {
  console.log('🌱 Starting pick pack order seeding...\n');
  
  try {
    // Get all users from Firestore
    console.log('📋 Fetching users from Firestore...');
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('⚠️  No users found in Firestore');
      return;
    }
    
    console.log(`✅ Found ${usersSnapshot.size} users\n`);
    
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      try {
        // Check if user already has an active pick order
        const hasActive = await hasActivePickOrder(userId);
        
        if (hasActive) {
          console.log(`⏭️  Skipping ${userData.email || userId} - already has active order`);
          skippedCount++;
          continue;
        }
        
        // Create pick order for user
        const pickOrderId = await createPickOrderForUser(
          userId,
          userData,
          SAMPLE_PICK_ITEMS
        );
        
        console.log(`✅ Created pick order ${pickOrderId} for ${userData.email || userId}`);
        createdCount++;
        
      } catch (error: any) {
        console.error(`❌ Error creating order for ${userData.email || userId}:`, error.message);
        errorCount++;
      }
    }
    
    // Summary
    console.log('\n📊 Seeding Summary:');
    console.log(`   ✅ Created: ${createdCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📦 Total: ${usersSnapshot.size}`);
    
  } catch (error: any) {
    console.error('❌ Fatal error during seeding:', error);
    process.exit(1);
  }
}

/**
 * Seed orders for specific users (by email)
 */
async function seedForSpecificUsers(emails: string[]) {
  console.log(`🌱 Seeding pick orders for ${emails.length} specific users...\n`);
  
  try {
    let createdCount = 0;
    let notFoundCount = 0;
    
    for (const email of emails) {
      const usersSnapshot = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (usersSnapshot.empty) {
        console.log(`⚠️  User not found: ${email}`);
        notFoundCount++;
        continue;
      }
      
      const userDoc = usersSnapshot.docs[0];
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      const hasActive = await hasActivePickOrder(userId);
      if (hasActive) {
        console.log(`⏭️  ${email} already has active order`);
        continue;
      }
      
      const pickOrderId = await createPickOrderForUser(
        userId,
        userData,
        SAMPLE_PICK_ITEMS
      );
      
      console.log(`✅ Created order ${pickOrderId} for ${email}`);
      createdCount++;
    }
    
    console.log(`\n✅ Created ${createdCount} orders, ${notFoundCount} users not found`);
    
  } catch (error: any) {
    console.error('❌ Error:', error);
  }
}

// Run the script
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] === '--users') {
    // Seed for specific users
    const emails = args.slice(1);
    seedForSpecificUsers(emails)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    // Seed for all users
    seedPickPackOrders()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
}

export { seedPickPackOrders, seedForSpecificUsers };

