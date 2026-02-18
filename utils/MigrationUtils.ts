// Migration utility for TerraMine Phase 2
// Run this once to initialize resource pools for existing users

import { db } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Initializes resource pools for all existing users
 * Safe to run multiple times - only updates users who don't have resources
 */
export async function migrateUsersToPhase2(): Promise<void> {
  console.log('Starting Phase 2 user migration...');
  
  try {
    const usersCollection = collection(db, 'users');
    const querySnapshot = await getDocs(usersCollection);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const userDoc of querySnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Check if user already has resource pools
      if (userData.rockResources) {
        console.log(`User ${userId} already has resources, skipping`);
        skippedCount++;
        continue;
      }
      
      // Initialize resource pools
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        rockResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
        coalResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
        goldResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
        diamondResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
        // Phase 2: Initialize boost fields (if they don't exist)
        freeBoostsRemaining: 4,
        adBoostsRemaining: 12,
        boostExpiresAt: null,
        nextFreeBoostResetAt: null,
        lastAdBoostRefillAt: new Date().toISOString(),
      });
      
      console.log(`✅ Initialized resources for user: ${userId}`);
      updatedCount++;
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Updated: ${updatedCount} users`);
    console.log(`Skipped: ${skippedCount} users (already migrated)`);
    console.log(`Total: ${querySnapshot.docs.length} users`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Initializes PropertyDetails for all existing properties
 * Safe to run multiple times - only creates details for properties that don't have them
 */
export async function migratePropertiesToPhase2(): Promise<void> {
  console.log('Starting Phase 2 property migration...');
  
  try {
    const propertiesCollection = collection(db, 'properties');
    const querySnapshot = await getDocs(propertiesCollection);
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const propertyDoc of querySnapshot.docs) {
      const propertyId = propertyDoc.id;
      
      // Check if property details already exist
      const detailsRef = doc(db, 'propertyDetails', propertyId);
      const detailsSnap = await getDoc(detailsRef);
      
      if (detailsSnap.exists()) {
        console.log(`Property ${propertyId} already has details, skipping`);
        skippedCount++;
        continue;
      }
      
      // Create property details (use setDoc instead of updateDoc)
      await setDoc(detailsRef, {
        propertyId,
        productionLevel: 1,
        gameLevel: 1,
        gameXP: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        dailyActivitiesRemaining: 1,
        doubleRewardAvailable: true,
        lastDailyReset: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
      
      console.log(`✅ Created details for property: ${propertyId}`);
      createdCount++;
    }
    
    console.log('\n=== Property Migration Complete ===');
    console.log(`Created: ${createdCount} property details`);
    console.log(`Skipped: ${skippedCount} properties (already migrated)`);
    console.log(`Total: ${querySnapshot.docs.length} properties`);
    
  } catch (error) {
    console.error('❌ Property migration failed:', error);
    throw error;
  }
}

/**
 * Run both migrations
 */
export async function runAllMigrations(): Promise<void> {
  console.log('\n🚀 Starting TerraMine Phase 2 Migration\n');
  
  try {
    await migrateUsersToPhase2();
    console.log('\n---\n');
    await migratePropertiesToPhase2();
    
    console.log('\n✅ All migrations completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Check migration status without running migrations
 */
export async function checkMigrationStatus(): Promise<{
  usersMigrated: number;
  usersTotal: number;
  propertiesMigrated: number;
  propertiesTotal: number;
}> {
  console.log('Checking migration status...\n');
  
  try {
    // Check users
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const usersTotal = usersSnapshot.docs.length;
    const usersMigrated = usersSnapshot.docs.filter(doc => 
      doc.data().rockResources !== undefined
    ).length;
    
    // Check properties
    const propertiesCollection = collection(db, 'properties');
    const propertiesSnapshot = await getDocs(propertiesCollection);
    const propertiesTotal = propertiesSnapshot.docs.length;
    
    let propertiesMigrated = 0;
    for (const propertyDoc of propertiesSnapshot.docs) {
      const detailsRef = doc(db, 'propertyDetails', propertyDoc.id);
      const detailsSnap = await getDoc(detailsRef);
      if (detailsSnap.exists()) {
        propertiesMigrated++;
      }
    }
    
    console.log('=== Migration Status ===');
    console.log(`Users: ${usersMigrated}/${usersTotal} migrated`);
    console.log(`Properties: ${propertiesMigrated}/${propertiesTotal} migrated`);
    
    if (usersMigrated === usersTotal && propertiesMigrated === propertiesTotal) {
      console.log('\n✅ All data is migrated!');
    } else {
      console.log('\n⚠️  Migration needed - run runAllMigrations()');
    }
    
    return {
      usersMigrated,
      usersTotal,
      propertiesMigrated,
      propertiesTotal,
    };
  } catch (error) {
    console.error('Error checking migration status:', error);
    throw error;
  }
}

/**
 * Initialize ad tracking for all existing properties (Phase 2 Week 5)
 * Adds adAttemptsUsedToday and lastAdAttemptDate fields to properties that don't have them
 * Safe to run multiple times - only updates properties missing the fields
 */
export async function migratePropertiesToAdTracking(): Promise<void> {
  console.log('Starting property ad tracking migration...');
  
  try {
    const propertiesCollection = collection(db, 'propertyDetails');
    const querySnapshot = await getDocs(propertiesCollection);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const propertyDoc of querySnapshot.docs) {
      const propertyId = propertyDoc.id;
      const data = propertyDoc.data();
      
      // Check if already has ad tracking fields
      if (data.adAttemptsUsedToday !== undefined && data.lastAdAttemptDate) {
        console.log(`Property ${propertyId} already has ad tracking, skipping`);
        skippedCount++;
        continue;
      }
      
      // Add fields if they don't exist
      const updates: any = {};
      if (data.adAttemptsUsedToday === undefined) {
        updates.adAttemptsUsedToday = 0;
      }
      if (!data.lastAdAttemptDate) {
        updates.lastAdAttemptDate = new Date().toISOString();
      }
      
      if (Object.keys(updates).length > 0) {
        const propertyRef = doc(db, 'propertyDetails', propertyId);
        await updateDoc(propertyRef, updates);
        console.log(`✅ Added ad tracking to property: ${propertyId}`);
        updatedCount++;
      }
    }
    
    console.log(`\n=== Ad Tracking Migration Complete ===`);
    console.log(`Updated: ${updatedCount} properties`);
    console.log(`Skipped: ${skippedCount} properties (already migrated)`);
  } catch (error) {
    console.error('Error migrating ad tracking:', error);
    throw error;
  }
}
