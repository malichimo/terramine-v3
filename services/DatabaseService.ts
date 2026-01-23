import { db } from '../firebaseConfig';
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
import { GridSquare } from '../utils/GridUtils';

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
      usdEarnings: 0, // Add USD earnings tracking
      totalCheckIns: 0,
      totalTBEarned: 0,
      // Boost tracking
      freeBoostsRemaining: 4,
      boostExpiresAt: null,
      nextFreeBoostResetAt: null,
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

  async updateBoostState(userId: string, boostData: {
    freeBoostsRemaining: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
  }) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, boostData);
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

  // Check-ins - FIXED to properly handle messages
  async createCheckIn(userId: string, propertyId: string, propertyOwnerId: string, message?: string, hasPhoto?: boolean) {
    const checkInRef = doc(collection(db, 'checkIns'));
    
    // Create check-in document with proper message handling
    const checkInData: any = {
      userId,
      propertyId,
      propertyOwnerId,
      hasPhoto: hasPhoto || false,
      timestamp: new Date().toISOString(),
    };
    
    // Only add message field if it exists and is not empty
    if (message && message.trim() !== '') {
      checkInData.message = message.trim();
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
      hasPhoto: hasPhoto || false,
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
        timestamp: data.timestamp,
      };
    });
  }
}
