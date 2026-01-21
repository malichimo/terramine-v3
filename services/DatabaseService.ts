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
  addDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GridSquare } from '../utils/GridUtils';

export interface UserProfile {
  email: string;
  tbBalance: number;
  totalCheckIns: number;
  totalTBEarned: number;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  address?: string;
  // Real money earnings
  usdEarnings: number;
  lastEarningsUpdate: string; // ISO timestamp - when earnings were last calculated
  // Boost system
  boostEndTime: string | null; // ISO timestamp - when current boost expires
  lastBoostReset: string; // ISO timestamp - when free boosts were last reset
  freeBoostsRemaining: number; // 0-4, resets every 6 hours
  createdAt: string;
}

export class DatabaseService {
  // Rent rates per second in USD
  private rentRates = {
    rock: 0.0000000011,
    coal: 0.0000000016,
    gold: 0.0000000022,
    diamond: 0.0000000044,
  };

  // User data
  async getUserData(userId: string): Promise<UserProfile | null> {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as UserProfile : null;
  }

  async createUser(userId: string, email: string) {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      email,
      tbBalance: 1000,
      totalCheckIns: 0,
      totalTBEarned: 0,
      usdEarnings: 0,
      lastEarningsUpdate: new Date().toISOString(),
      boostEndTime: null,
      lastBoostReset: new Date().toISOString(),
      freeBoostsRemaining: 4,
      createdAt: new Date().toISOString(),
    });
  }

  async updateUserBalance(userId: string, amount: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      tbBalance: increment(amount),
    });
  }

  /**
   * Check if user's free boosts should be reset (every 6 hours)
   * and update if needed
   */
  async checkAndResetBoosts(userId: string): Promise<UserProfile | null> {
    const userData = await this.getUserData(userId);
    if (!userData) return null;

    const now = new Date();
    const lastReset = new Date(userData.lastBoostReset);
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);

    // Reset free boosts every 6 hours
    if (hoursSinceReset >= 6) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        freeBoostsRemaining: 4,
        lastBoostReset: now.toISOString(),
      });
      
      console.log('🔄 Free boosts reset to 4');
      
      // Return updated data
      return await this.getUserData(userId);
    }

    return userData;
  }

  /**
   * Activate boost for 30 minutes
   * @param userId - User ID
   * @param isFree - Whether this is a free boost or from ad
   * @returns Updated user data with boost info
   */
  async activateBoost(userId: string, isFree: boolean): Promise<{
    success: boolean;
    boostEndTime: Date | null;
    freeBoostsRemaining: number;
    message: string;
  }> {
    try {
      // Check and potentially reset free boosts
      let userData = await this.checkAndResetBoosts(userId);
      if (!userData) {
        return {
          success: false,
          boostEndTime: null,
          freeBoostsRemaining: 0,
          message: 'User not found',
        };
      }

      const now = new Date();
      const currentBoostEnd = userData.boostEndTime ? new Date(userData.boostEndTime) : null;

      // Check if boost is still active
      const isBoostActive = currentBoostEnd && currentBoostEnd > now;
      
      // Calculate total boost time (max 6 hours = 360 minutes)
      let totalBoostMinutes = 0;
      if (isBoostActive && currentBoostEnd) {
        const remainingMinutes = (currentBoostEnd.getTime() - now.getTime()) / (1000 * 60);
        totalBoostMinutes = Math.floor(remainingMinutes);
      }

      // Check if we can add more boost time
      if (totalBoostMinutes >= 360) {
        return {
          success: false,
          boostEndTime: currentBoostEnd,
          freeBoostsRemaining: userData.freeBoostsRemaining,
          message: 'Maximum boost time reached (6 hours)',
        };
      }

      // Check free boost availability
      if (isFree && userData.freeBoostsRemaining <= 0) {
        return {
          success: false,
          boostEndTime: currentBoostEnd,
          freeBoostsRemaining: 0,
          message: 'No free boosts remaining. Watch an ad or wait for reset.',
        };
      }

      // Add 30 minutes to boost
      const newBoostMinutes = Math.min(totalBoostMinutes + 30, 360);
      const newBoostEndTime = new Date(now.getTime() + newBoostMinutes * 60 * 1000);

      // Update database
      const userRef = doc(db, 'users', userId);
      const updates: any = {
        boostEndTime: newBoostEndTime.toISOString(),
      };

      if (isFree) {
        updates.freeBoostsRemaining = userData.freeBoostsRemaining - 1;
      }

      await updateDoc(userRef, updates);

      console.log(`✨ Boost activated! End time: ${newBoostEndTime.toISOString()}`);
      console.log(`   Free boosts remaining: ${isFree ? userData.freeBoostsRemaining - 1 : userData.freeBoostsRemaining}`);

      return {
        success: true,
        boostEndTime: newBoostEndTime,
        freeBoostsRemaining: isFree ? userData.freeBoostsRemaining - 1 : userData.freeBoostsRemaining,
        message: `+30 minutes added! Boost active until ${newBoostEndTime.toLocaleTimeString()}`,
      };
    } catch (error) {
      console.error('Error activating boost:', error);
      return {
        success: false,
        boostEndTime: null,
        freeBoostsRemaining: 0,
        message: 'Error activating boost',
      };
    }
  }

  /**
   * Get current boost status
   */
  async getBoostStatus(userId: string): Promise<{
    isActive: boolean;
    endTime: Date | null;
    remainingMinutes: number;
    freeBoostsRemaining: number;
    timeUntilReset: number; // minutes until free boosts reset
  }> {
    const userData = await this.checkAndResetBoosts(userId);
    if (!userData) {
      return {
        isActive: false,
        endTime: null,
        remainingMinutes: 0,
        freeBoostsRemaining: 0,
        timeUntilReset: 0,
      };
    }

    const now = new Date();
    const boostEndTime = userData.boostEndTime ? new Date(userData.boostEndTime) : null;
    const isActive = boostEndTime ? boostEndTime > now : false;
    const remainingMinutes = isActive && boostEndTime
      ? Math.floor((boostEndTime.getTime() - now.getTime()) / (1000 * 60))
      : 0;

    // Calculate time until next free boost reset
    const lastReset = new Date(userData.lastBoostReset);
    const nextReset = new Date(lastReset.getTime() + 6 * 60 * 60 * 1000);
    const timeUntilReset = Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / (1000 * 60)));

    return {
      isActive,
      endTime: boostEndTime,
      remainingMinutes,
      freeBoostsRemaining: userData.freeBoostsRemaining,
      timeUntilReset,
    };
  }

  /**
   * Calculate earnings based on time elapsed since last update
   * Now includes boost multiplier calculation
   * 
   * @param userId - User ID
   * @returns Object with totalEarnings and secondsElapsed
   */
  async calculateOfflineEarnings(userId: string): Promise<{
    totalEarnings: number;
    previousEarnings: number;
    newEarnings: number;
    secondsElapsed: number;
    boostedSeconds: number; // How many seconds had 2x multiplier
  }> {
    try {
      const userData = await this.getUserData(userId);
      if (!userData) {
        return { 
          totalEarnings: 0, 
          previousEarnings: 0,
          newEarnings: 0,
          secondsElapsed: 0,
          boostedSeconds: 0,
        };
      }

      const properties = await this.getPropertiesByOwner(userId);

      // Base earnings rate per second
      let baseRatePerSecond = 0;
      properties.forEach(property => {
        const rate = this.rentRates[property.mineType as keyof typeof this.rentRates] || 0;
        baseRatePerSecond += rate;
      });

      const lastUpdate = new Date(userData.lastEarningsUpdate);
      const now = new Date();
      const secondsElapsed = (now.getTime() - lastUpdate.getTime()) / 1000;

      // Check if there was an active boost during this period
      const boostEndTime = userData.boostEndTime ? new Date(userData.boostEndTime) : null;
      
      let boostedSeconds = 0;
      let normalSeconds = secondsElapsed;

      if (boostEndTime) {
        // Calculate how much of the elapsed time had boost active
        if (boostEndTime > lastUpdate) {
          const boostEnd = boostEndTime > now ? now : boostEndTime;
          boostedSeconds = (boostEnd.getTime() - lastUpdate.getTime()) / 1000;
          normalSeconds = secondsElapsed - boostedSeconds;
        }
      }

      // Calculate earnings with boost
      const normalEarnings = baseRatePerSecond * normalSeconds;
      const boostedEarnings = baseRatePerSecond * 2 * boostedSeconds; // 2x multiplier
      
      const newEarnings = normalEarnings + boostedEarnings;
      const previousEarnings = userData.usdEarnings || 0;
      const totalEarnings = previousEarnings + newEarnings;

      console.log('=== Offline Earnings Calculation ===');
      console.log('Last update:', lastUpdate.toISOString());
      console.log('Current time:', now.toISOString());
      console.log('Total seconds elapsed:', secondsElapsed.toFixed(2));
      console.log('Boosted seconds:', boostedSeconds.toFixed(2));
      console.log('Normal seconds:', normalSeconds.toFixed(2));
      console.log('Base rate:', baseRatePerSecond, 'USD/sec');
      console.log('Normal earnings:', normalEarnings);
      console.log('Boosted earnings (2x):', boostedEarnings);
      console.log('Total new earnings:', newEarnings);

      return {
        totalEarnings,
        previousEarnings,
        newEarnings,
        secondsElapsed,
        boostedSeconds,
      };
    } catch (error) {
      console.error('Error calculating offline earnings:', error);
      return { 
        totalEarnings: 0, 
        previousEarnings: 0,
        newEarnings: 0,
        secondsElapsed: 0,
        boostedSeconds: 0,
      };
    }
  }

  /**
   * Update user's USD earnings and timestamp
   */
  async updateUserEarnings(userId: string, earnings: number) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      usdEarnings: earnings,
      lastEarningsUpdate: new Date().toISOString(),
    });
    console.log(`💰 Saved earnings: $${earnings.toFixed(12)} for user ${userId}`);
  }

  /**
   * Get user's current USD earnings (without calculating new earnings)
   */
  async getUserEarnings(userId: string): Promise<number> {
    const userData = await this.getUserData(userId);
    return userData?.usdEarnings || 0;
  }

  /**
   * Calculate current earnings rate per second based on owned properties
   * Now includes boost multiplier if active
   */
  async getEarningsRate(userId: string, isBoostActive: boolean = false): Promise<number> {
    const properties = await this.getPropertiesByOwner(userId);
    let rate = 0;
    properties.forEach(property => {
      rate += this.rentRates[property.mineType as keyof typeof this.rentRates] || 0;
    });
    
    // Apply 2x multiplier if boost is active
    return isBoostActive ? rate * 2 : rate;
  }

  /**
   * Update user profile information
   */
  async updateUserProfile(
    userId: string, 
    updates: {
      firstName?: string;
      lastName?: string;
      nickname?: string;
      address?: string;
    }
  ) {
    const userRef = doc(db, 'users', userId);
    const updateData: any = {};
    
    if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
    if (updates.nickname !== undefined) updateData.nickname = updates.nickname;
    if (updates.address !== undefined) updateData.address = updates.address;
    
    await updateDoc(userRef, updateData);
  }

  // Properties
  async purchaseProperty(userId: string, property: GridSquare, tbCost: number) {
    const propertyRef = doc(db, 'properties', property.id);
    
    // Check if already owned
    const propertySnap = await getDoc(propertyRef);
    if (propertySnap.exists()) {
      throw new Error('Property already owned');
    }

    // IMPORTANT: Before purchasing, calculate and save current earnings
    const earningsData = await this.calculateOfflineEarnings(userId);
    await this.updateUserEarnings(userId, earningsData.totalEarnings);

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
        nickname: data.nickname || undefined,
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
        nickname: data.nickname || undefined,
      };
    });
  }

  async uploadCheckInPhoto(userId: string, propertyId: string, photoUri: string): Promise<string> {
    try {
      const timestamp = Date.now();
      const filename = `checkins/${propertyId}/${userId}_${timestamp}.jpg`;
      const storageRef = ref(storage, filename);

      const response = await fetch(photoUri);
      const blob = await response.blob();

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      return downloadURL;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  }

  async createCheckIn(
    userId: string,
    propertyId: string,
    propertyOwnerId: string,
    message?: string,
    photoUri?: string
  ): Promise<string> {
    try {
      let photoURL = null;
      
      if (photoUri) {
        photoURL = await this.uploadCheckInPhoto(userId, propertyId, photoUri);
      }
      
      const visitorData = await this.getUserData(userId);
      const visitorName = visitorData?.email?.split('@')[0] || 'Anonymous';
      
      const checkInData = {
        userId,
        visitorName,
        propertyId,
        propertyOwnerId,
        timestamp: new Date(),
        message: message || null,
        photoURL: photoURL || null,
      };
      
      const docRef = await addDoc(collection(db, 'checkIns'), checkInData);
      
      const propertyOwnersRef = collection(db, 'users');
      const q = query(propertyOwnersRef, where('uid', '==', propertyOwnerId));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const ownerDoc = snapshot.docs[0];
        const currentTB = ownerDoc.data().totalTB || 0;
        await updateDoc(ownerDoc.ref, { totalTB: currentTB + 1 });
      }
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating check-in:', error);
      throw error;
    }
  }

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
        message: data.message || undefined,
        hasPhoto: data.hasPhoto || false,
        photoURL: data.photoURL || undefined,
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
        photoURL: data.photoURL || undefined,
        timestamp: data.timestamp,
      };
    });
  }

  async updatePropertyNickname(propertyId: string, nickname: string) {
    const propertyRef = doc(db, 'properties', propertyId);
    await updateDoc(propertyRef, {
      nickname: nickname.trim() || null,
    });
  }
}
