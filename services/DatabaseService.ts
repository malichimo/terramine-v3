import { db, storage } from '../firebaseConfig';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GridSquare } from '../utils/GridUtils';
import { getNext4AMEST } from '../utils/TimeUtils';

export interface BoostState {
  freeBoostsRemaining: number;
  adBoostsRemaining: number;
  boostExpiresAt: string | null;
  nextFreeBoostResetAt: string | null;
  lastAdBoostRefillAt: string;
}

export class DatabaseService {
  // User data
  async getUserData(userId: string) {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  }

  async createUser(userId: string, email: string) {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      email,
      tbBalance: 1000,
      totalCheckIns: 0,
      totalTBEarned: 0,
      createdAt: new Date().toISOString(),
    });
  }

  async updateUserBalance(userId: string, amount: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      tbBalance: increment(amount),
    });
  }

  // Properties
  async purchaseProperty(userId: string, property: GridSquare, tbCost: number) {
    const propertyRef = doc(db, 'properties', property.id);
    
    // Check if already owned
    const propertySnap = await getDoc(propertyRef);
    if (propertySnap.exists()) {
      throw new Error('Property already owned');
    }

    // Save property
    await setDoc(propertyRef, {
      id: property.id,
      ownerId: userId,
      mineType: property.mineType,
      centerLat: property.centerLat,
      centerLng: property.centerLng,
      corners: property.corners,
      purchasedAt: new Date().toISOString(),
    });

    // Deduct TB from user
    await this.updateUserBalance(userId, -tbCost);
  }

  async getPropertiesByOwner(userId: string): Promise<GridSquare[]> {
    const q = query(collection(db, 'properties'), where('ownerId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const properties = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        corners: data.corners,
        isOwned: true,
        ownerId: data.ownerId,
        mineType: data.mineType as 'rock' | 'coal' | 'gold' | 'diamond',
      } as GridSquare;
    });

    // Fetch customName from propertyDetails for each property
    await Promise.all(properties.map(async (property) => {
      try {
        const detailsSnap = await getDoc(doc(db, 'propertyDetails', property.id));
        if (detailsSnap.exists()) {
          const name = detailsSnap.data().customName;
          if (name) property.customName = name;
        }
      } catch {
        // Non-fatal — property just won't have a custom name
      }
    }));

    return properties;
  }

  async getPropertyById(propertyId: string): Promise<GridSquare | null> {
    const docRef = doc(db, 'properties', propertyId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    return {
      id: data.id,
      centerLat: data.centerLat,
      centerLng: data.centerLng,
      corners: data.corners,
      isOwned: true,
      ownerId: data.ownerId,
      mineType: data.mineType,
    };
  }

  async getAllProperties(): Promise<GridSquare[]> {
    const querySnapshot = await getDocs(collection(db, 'properties'));
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        corners: data.corners,
        isOwned: true,
        ownerId: data.ownerId,
        mineType: data.mineType,
      };
    });
  }

  // Upload a check-in photo to Firebase Storage and return the download URL
  async uploadCheckInPhoto(userId: string, propertyId: string, photoUri: string): Promise<string> {
    const timestamp = Date.now();
    const storageRef = ref(storage, `checkIns/${propertyId}_${userId}_${timestamp}.jpg`);
    const response = await fetch(photoUri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  }

  // Check-ins
  async createCheckIn(userId: string, propertyId: string, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string) {
    const checkInRef = doc(collection(db, 'checkIns'));

    // photoUri here is already an uploaded download URL — no re-upload needed
    const photoURL = hasPhoto && photoUri ? photoUri : undefined;

    const checkInData: any = {
      userId,
      propertyId,
      propertyOwnerId,
      hasPhoto: !!photoURL,
      timestamp: new Date().toISOString(),
      ...(visitorNickname ? { visitorNickname } : {}),
    };

    if (message && message.trim() !== '') {
      checkInData.message = message.trim();
    }

    if (photoURL) {
      checkInData.photoURL = photoURL;
    }

    await setDoc(checkInRef, checkInData);

    // Update visitor stats
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      totalCheckIns: increment(1),
    });

    // Reward property owner with 1 TB
    const ownerRef = doc(db, 'users', propertyOwnerId);
    await updateDoc(ownerRef, {
      tbBalance: increment(1),
    });

    console.log('Check-in saved to Firebase:', {
      propertyId,
      hasMessage: !!message,
      hasPhoto: !!photoURL,
      messageLength: message?.length || 0
    });
  }

  // Get check-ins for a property
  async getCheckInsForProperty(propertyId: string) {
    const q = query(
      collection(db, 'checkIns'), 
      where('propertyId', '==', propertyId)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        propertyId: data.propertyId,
        propertyOwnerId: data.propertyOwnerId,
        message: data.message || undefined, // Convert null to undefined
        hasPhoto: data.hasPhoto || false,
        photoURL: data.photoURL || undefined,
        timestamp: data.timestamp,
      };
    });
  }

  // Get all check-ins by a user
  async getCheckInsByUser(userId: string) {
    const q = query(
      collection(db, 'checkIns'),
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        propertyId: data.propertyId,
        propertyOwnerId: data.propertyOwnerId,
        message: data.message || undefined,
        hasPhoto: data.hasPhoto || false,
        photoURL: data.photoURL || undefined,
        timestamp: data.timestamp,
      };
    });
  }

  // USD Earnings
  async updateUSDEarnings(userId: string, amount: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      usdEarnings: increment(amount),
    });
  }

  // Boost system
  async getBoostState(userId: string): Promise<BoostState> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return this.getDefaultBoostState();
    }

    const data = userSnap.data();

    // Ad boost refill: 1 per 30 minutes, max 12
    const MAX_AD_BOOSTS = 12;
    const REFILL_INTERVAL_MS = 30 * 60 * 1000;
    let adBoostsRemaining = data.adBoostsRemaining ?? MAX_AD_BOOSTS;
    const lastRefill = data.lastAdBoostRefillAt
      ? new Date(data.lastAdBoostRefillAt)
      : new Date(0);
    const msSinceRefill = Date.now() - lastRefill.getTime();
    const boostsToAdd = Math.floor(msSinceRefill / REFILL_INTERVAL_MS);

    let lastAdBoostRefillAt = data.lastAdBoostRefillAt || new Date().toISOString();
    if (boostsToAdd > 0 && adBoostsRemaining < MAX_AD_BOOSTS) {
      adBoostsRemaining = Math.min(MAX_AD_BOOSTS, adBoostsRemaining + boostsToAdd);
      const newRefill = new Date(lastRefill.getTime() + boostsToAdd * REFILL_INTERVAL_MS);
      lastAdBoostRefillAt = newRefill.toISOString();
      await updateDoc(userRef, {
        adBoostsRemaining,
        lastAdBoostRefillAt,
      });
    }

    return {
      freeBoostsRemaining: data.freeBoostsRemaining ?? 4,
      adBoostsRemaining,
      boostExpiresAt: data.boostExpiresAt ?? null,
      nextFreeBoostResetAt: data.nextFreeBoostResetAt ?? null,
      lastAdBoostRefillAt,
    };
  }

  async updateLastActiveTime(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      lastActiveAt: new Date().toISOString(),
    });
  }

  async updateBoostState(userId: string, boostState: BoostState): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      freeBoostsRemaining: boostState.freeBoostsRemaining,
      adBoostsRemaining: boostState.adBoostsRemaining,
      boostExpiresAt: boostState.boostExpiresAt,
      nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
      lastAdBoostRefillAt: boostState.lastAdBoostRefillAt,
    });
  }

  async useFreeBoost(userId: string, currentState: BoostState): Promise<BoostState> {
    if (currentState.freeBoostsRemaining <= 0) {
      throw new Error('No free boosts remaining');
    }

    const boostDurationMs = 30 * 60 * 1000; // 30 minutes
    const now = new Date();

    // Extend from current expiry if already active, otherwise from now
    const currentExpiry = currentState.boostExpiresAt
      ? new Date(currentState.boostExpiresAt)
      : now;
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const boostExpiresAt = new Date(baseTime.getTime() + boostDurationMs).toISOString();

    // Reset free boosts at next 4 AM EST (consistent with all other daily resets)
    const nextFreeBoostResetAt = getNext4AMEST().toISOString();

    const newState: BoostState = {
      ...currentState,
      freeBoostsRemaining: currentState.freeBoostsRemaining - 1,
      boostExpiresAt,
      nextFreeBoostResetAt,
    };

    await this.updateBoostState(userId, newState);
    return newState;
  }

  async useAdBoost(userId: string, currentState: BoostState): Promise<BoostState> {
    if (currentState.adBoostsRemaining <= 0) {
      throw new Error('No ad boosts remaining');
    }

    const boostDurationMs = 30 * 60 * 1000; // 30 minutes
    const MAX_BOOST_MS = 8 * 60 * 60 * 1000; // 8-hour cap
    const now = new Date();

    const currentExpiry = currentState.boostExpiresAt
      ? new Date(currentState.boostExpiresAt)
      : now;
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const maxExpiry = new Date(now.getTime() + MAX_BOOST_MS);

    if (baseTime >= maxExpiry) {
      throw new Error('Boost already at maximum 8-hour limit');
    }

    const proposedExpiry = new Date(baseTime.getTime() + boostDurationMs);
    const boostExpiresAt = (proposedExpiry <= maxExpiry ? proposedExpiry : maxExpiry).toISOString();

    const newState: BoostState = {
      ...currentState,
      adBoostsRemaining: currentState.adBoostsRemaining - 1,
      boostExpiresAt,
    };

    await this.updateBoostState(userId, newState);
    return newState;
  }

  private getDefaultBoostState(): BoostState {
    return {
      freeBoostsRemaining: 4,
      adBoostsRemaining: 12,
      boostExpiresAt: null,
      nextFreeBoostResetAt: null,
      lastAdBoostRefillAt: new Date().toISOString(),
    };
  }
}
