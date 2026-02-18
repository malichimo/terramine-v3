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
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GridSquare } from '../utils/GridUtils';
import { dbServicePhase2 } from './DatabaseServicePhase2';

export interface BoostState {
  freeBoostsRemaining: number;
  adBoostsRemaining: number;
  boostExpiresAt: string | null;
  nextFreeBoostResetAt: string | null;
  lastAdBoostRefillAt: string | null;
}

export class DatabaseService {
    private getNext4AMEST(): Date {
    const now = new Date();
    const estOffset = -5 * 60;
    const estNow = new Date(now.getTime() + estOffset * 60 * 1000);
    const next4AM = new Date(estNow);
    next4AM.setHours(4, 0, 0, 0);
    if (estNow.getHours() >= 4) {
      next4AM.setDate(next4AM.getDate() + 1);
    }
    return new Date(next4AM.getTime() - estOffset * 60 * 1000);
  }
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
      
      // Phase 2: Initialize resource pools
      rockResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
      coalResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
      goldResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
      diamondResources: { common: 0, uncommon: 0, rare: 0, epic: 0 },
      
      // Phase 2: Initialize boost fields
      freeBoostsRemaining: 4,
      adBoostsRemaining: 12,  // ✅ ADDED THIS
      boostExpiresAt: null,
      nextFreeBoostResetAt: null,
      lastAdBoostRefillAt: new Date().toISOString(),  // ✅ ADDED THIS
      
      createdAt: new Date().toISOString(),
    });
  }

  async updateUserBalance(userId: string, amount: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      tbBalance: increment(amount),
    });
  }

  async updateUSDEarnings(userId: string, amount: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      usdEarnings: increment(amount),
    });
  }

  // Boost State Management
  async getBoostState(userId: string): Promise<BoostState> {
    const userData = await this.getUserData(userId);
    
    if (!userData) {
      return {
        freeBoostsRemaining: 4,
        adBoostsRemaining: 12,
        boostExpiresAt: null,
        nextFreeBoostResetAt: null,
        lastAdBoostRefillAt: new Date().toISOString(),
      };
    }

    const now = new Date();
    
    // ✅ CHECK IF FREE BOOSTS SHOULD RESET
    let freeBoostsRemaining = userData.freeBoostsRemaining ?? 4;
    let nextFreeBoostResetAt = userData.nextFreeBoostResetAt ?? null;
    
    // If we have a reset time set and it's in the past, reset the boosts
    if (nextFreeBoostResetAt && new Date(nextFreeBoostResetAt) < now) {
      freeBoostsRemaining = 4;
      nextFreeBoostResetAt = null;
      
      // Update in Firebase
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        freeBoostsRemaining: 4,
        nextFreeBoostResetAt: null,
      });
      
      console.log('✅ Free boosts reset to 4 (passed reset time)');
    }
    
    const lastRefill = userData.lastAdBoostRefillAt 
      ? new Date(userData.lastAdBoostRefillAt) 
      : now;
    
    let adBoostsRemaining = userData.adBoostsRemaining ?? 0;
    
    // Auto-refill ad boosts if less than 12
    if (adBoostsRemaining < 12) {
      const minutesSinceRefill = (now.getTime() - lastRefill.getTime()) / (1000 * 60);
      const boostsToAdd = Math.floor(minutesSinceRefill / 30);
      
      if (boostsToAdd > 0) {
        adBoostsRemaining = Math.min(12, adBoostsRemaining + boostsToAdd);
        
        const newRefillTime = new Date(lastRefill.getTime() + (boostsToAdd * 30 * 60 * 1000));
        
        await this.updateBoostState(userId, {
          freeBoostsRemaining: userData.freeBoostsRemaining ?? 4,
          adBoostsRemaining,
          boostExpiresAt: userData.boostExpiresAt ?? null,
          nextFreeBoostResetAt: userData.nextFreeBoostResetAt ?? null,
          lastAdBoostRefillAt: newRefillTime.toISOString(),
        });
      }
    }

    return {
      freeBoostsRemaining,  // ✅ Use updated value
      adBoostsRemaining,
      boostExpiresAt: userData.boostExpiresAt ?? null,
      nextFreeBoostResetAt,  // ✅ Use updated value
      lastAdBoostRefillAt: userData.lastAdBoostRefillAt ?? new Date().toISOString(),
    };
  }

  async updateBoostState(userId: string, boostState: BoostState) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      freeBoostsRemaining: boostState.freeBoostsRemaining,
      adBoostsRemaining: boostState.adBoostsRemaining,
      boostExpiresAt: boostState.boostExpiresAt,
      nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
      lastAdBoostRefillAt: boostState.lastAdBoostRefillAt,
    });
  }

  async useFreeBoost(userId: string, currentBoostState: BoostState): Promise<BoostState> {
    const now = new Date();
    
    let newExpiryTime: Date;
    if (currentBoostState.boostExpiresAt) {
      const currentExpiry = new Date(currentBoostState.boostExpiresAt);
      if (currentExpiry > now) {
        newExpiryTime = new Date(currentExpiry.getTime() + 30 * 60 * 1000);
      } else {
        newExpiryTime = new Date(now.getTime() + 30 * 60 * 1000);
      }
    } else {
      newExpiryTime = new Date(now.getTime() + 30 * 60 * 1000);
    }

    const maxExpiryTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    if (newExpiryTime > maxExpiryTime) {
      newExpiryTime = maxExpiryTime;
    }

    const newState: BoostState = {
      freeBoostsRemaining: currentBoostState.freeBoostsRemaining - 1,
      adBoostsRemaining: currentBoostState.adBoostsRemaining,
      boostExpiresAt: newExpiryTime.toISOString(),
      nextFreeBoostResetAt: currentBoostState.nextFreeBoostResetAt 
        ? currentBoostState.nextFreeBoostResetAt  // ✅ Already set, keep it
        : this.getNext4AMEST().toISOString(),     // ✅ First boost used, set reset time
      lastAdBoostRefillAt: currentBoostState.lastAdBoostRefillAt,
    };

    await this.updateBoostState(userId, newState);
    return newState;
  }

  async useAdBoost(userId: string, currentBoostState: BoostState): Promise<BoostState> {
    const now = new Date();
    
    let newExpiryTime: Date;
    if (currentBoostState.boostExpiresAt) {
      const currentExpiry = new Date(currentBoostState.boostExpiresAt);
      if (currentExpiry > now) {
        newExpiryTime = new Date(currentExpiry.getTime() + 30 * 60 * 1000);
      } else {
        newExpiryTime = new Date(now.getTime() + 30 * 60 * 1000);
      }
    } else {
      newExpiryTime = new Date(now.getTime() + 30 * 60 * 1000);
    }

    const maxExpiryTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    if (newExpiryTime > maxExpiryTime) {
      newExpiryTime = maxExpiryTime;
    }

    const newState: BoostState = {
      freeBoostsRemaining: currentBoostState.freeBoostsRemaining,
      adBoostsRemaining: currentBoostState.adBoostsRemaining - 1,
      boostExpiresAt: newExpiryTime.toISOString(),
      nextFreeBoostResetAt: currentBoostState.nextFreeBoostResetAt,
      lastAdBoostRefillAt: now.toISOString(),
    };

    await this.updateBoostState(userId, newState);
    return newState;
  }

  // ✅ Upload photo to Firebase Storage
  async uploadCheckInPhoto(userId: string, propertyId: string, photoUri: string): Promise<string> {
    try {
      // Create a unique filename
      const timestamp = new Date().getTime();
      const filename = `checkIns/${userId}/${propertyId}_${timestamp}.jpg`;
      const storageRef = ref(storage, filename);
      
      // Convert URI to blob
      const response = await fetch(photoUri);
      const blob = await response.blob();
      
      // Upload to Firebase Storage
      await uploadBytes(storageRef, blob);
      
      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);
      
      console.log('✅ Photo uploaded successfully:', downloadUrl);
      return downloadUrl;
    } catch (error) {
      console.error('❌ Error uploading photo:', error);
      throw error;
    }
  }

  // Properties
  async purchaseProperty(userId: string, property: GridSquare, tbCost: number) {
    const propertyRef = doc(db, 'properties', property.id);
    
    const propertySnap = await getDoc(propertyRef);
    if (propertySnap.exists()) {
      throw new Error('Property already owned');
    }

    await setDoc(propertyRef, {
      id: property.id,
      ownerId: userId,
      mineType: property.mineType,
      centerLat: property.centerLat,
      centerLng: property.centerLng,
      corners: property.corners,
      purchasedAt: new Date().toISOString(),
    });

    await this.updateUserBalance(userId, -tbCost);

    await dbServicePhase2.initializePropertyDetails(property.id);
    await dbServicePhase2.initializeUserResources(userId);
  }

  async getPropertiesByOwner(userId: string): Promise<GridSquare[]> {
    const q = query(collection(db, 'properties'), where('ownerId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        corners: data.corners,
        isOwned: true,
        ownerId: data.ownerId,
        mineType: data.mineType as 'rock' | 'coal' | 'gold' | 'diamond',
      };
    });
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

  // ✅ UPDATED: Check-ins with photoUrl (download URL from Storage)
  async createCheckIn(userId: string, propertyId: string, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUrl?: string, visitorNickname?: string) {
    const checkInRef = doc(collection(db, 'checkIns'));
    
    const checkInData: any = {
      userId,
      propertyId,
      propertyOwnerId,
      hasPhoto: hasPhoto || false,
      timestamp: new Date().toISOString(),
    };
    
    if (message && message.trim() !== '') {
      checkInData.message = message.trim();
    }
    
    // ✅ Save photo URL (download URL from Firebase Storage)
    if (photoUrl && photoUrl.trim() !== '') {
      checkInData.photoUrl = photoUrl.trim();
    }
    
    // ✅ Save visitor nickname if provided
    if (visitorNickname && visitorNickname.trim() !== '') {
      checkInData.visitorNickname = visitorNickname.trim();
    }
    
    await setDoc(checkInRef, checkInData);

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      totalCheckIns: increment(1),
    });

    const ownerRef = doc(db, 'users', propertyOwnerId);
    await updateDoc(ownerRef, {
      tbBalance: increment(1),
    });
    
    console.log('Check-in saved to Firebase:', {
      propertyId,
      hasMessage: !!message,
      hasPhoto: hasPhoto || false,
      hasPhotoUrl: !!photoUrl,
      hasVisitorNickname: !!visitorNickname,
    });
  }

  // ✅ UPDATED: Return photoUrl in check-ins
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
        visitorNickname: data.visitorNickname || undefined,
        propertyId: data.propertyId,
        propertyOwnerId: data.propertyOwnerId,
        message: data.message || undefined,
        hasPhoto: data.hasPhoto || false,
        photoUrl: data.photoUrl || undefined,
        timestamp: data.timestamp,
      };
    });
  }

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
        timestamp: data.timestamp,
      };
    });
  }

  async updateLastActiveTime(userId: string) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      lastActiveAt: new Date().toISOString(),
    });
  }
}
