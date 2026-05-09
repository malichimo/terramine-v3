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
import { NotificationService } from './NotificationService';

export interface BoostState {
  freeBoostsRemaining: number;
  adBoostsRemaining: number;
  boostExpiresAt: string | null;
  nextFreeBoostResetAt: string | null;
  lastAdBoostRefillAt: string;
}

// ── Milestone keys (FEAT-001) ─────────────────────────────────────────────
// One flag per milestone stored on the user Firestore doc.
export type MilestoneKey =
  | 'milestone_firstPurchase'
  | 'milestone_renamedTA'
  | 'milestone_addedPhoto'
  | 'milestone_sawUpgradePrompt'
  | 'milestone_firstDailyActivity'
  | 'milestone_firstCheckIn'
  | 'milestone_autoBoostGiven';

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
    const now = new Date().toISOString();
    await setDoc(propertyRef, {
      id: property.id,
      ownerId: userId,
      mineType: property.mineType,
      centerLat: property.centerLat,
      centerLng: property.centerLng,
      corners: property.corners,
      purchasedAt: now,
      lastActivityAt: now, // ✅ inactivity clock starts at purchase
    });

    // Check user has enough TB before deducting
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const currentBalance = userSnap.data().tbBalance ?? 0;
      if (currentBalance < tbCost) {
        throw new Error('Insufficient TB balance');
      }
    }

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

  // ── Check-in streak tracking ──────────────────────────────────────────────

  async getCheckInStreakToday(userId: string): Promise<number> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return 0;
      const data = userSnap.data();
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      if (data.checkInStreakDate !== today) return 0;
      return data.checkInStreakCount || 0;
    } catch { return 0; }
  }

  async incrementCheckInStreak(userId: string): Promise<number> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return 0;
      const data = userSnap.data();
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

      let newCount = 1;
      if (data.checkInStreakDate === today) {
        newCount = (data.checkInStreakCount || 0) + 1;
      }

      await updateDoc(userRef, {
        checkInStreakDate: today,
        checkInStreakCount: newCount,
      });

      return newCount;
    } catch { return 0; }
  }

  // Streak bonus TB amounts
  getStreakBonus(streakCount: number): number {
    if (streakCount === 3) return 10;
    if (streakCount === 5) return 25;
    if (streakCount === 10) return 50;
    return 0;
  }

  // ── Auto-boost for first session ────────────────────────────────────────────

  async grantFirstSessionBoost(userId: string, currentBoostState: BoostState): Promise<BoostState | null> {
    try {
      const alreadyGiven = await this.checkAndFireMilestone(userId, 'milestone_autoBoostGiven');
      if (!alreadyGiven) return null; // already given
      // Auto-activate 30 min boost
      return await this.useFreeBoost(userId, currentBoostState);
    } catch (e) {
      console.warn('Auto-boost grant failed (non-fatal):', e);
      return null;
    }
  }

  // Check-ins
  async createCheckIn(userId: string, propertyId: string, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string, mineType?: string) {
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

    // ✅ CRITICAL: This is the only write that MUST succeed.
    // All subsequent writes are non-fatal side effects — they must never
    // throw back to the caller, otherwise the visitor sees "Failed to save
    // check-in" even though the document saved, AND their TB is never awarded
    // because MainNavigator's updateUserBalance never runs.
    await setDoc(checkInRef, checkInData);

    // ✅ FIX: Wrapped in try/catch — a stats update failure must not abort
    // the check-in flow or prevent TB from being awarded to the visitor.
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        totalCheckIns: increment(1),
      });
    } catch (e) {
      console.warn('Failed to increment visitor totalCheckIns (non-fatal):', e);
    }

    // ✅ FIX: Wrapped in try/catch — owner TB award failure must not abort
    // the check-in flow. Owner TB is a side effect, not the core transaction.
    const SYSTEM_UID = 'terramine-system';
    if (propertyOwnerId !== SYSTEM_UID) {
      try {
        const ownerRef = doc(db, 'users', propertyOwnerId);
        await updateDoc(ownerRef, {
          tbBalance: increment(1),
          totalTBEarned: increment(1),
        });
      } catch (ownerTBError) {
        console.warn('Failed to award owner TB (non-fatal):', ownerTBError);
      }

      // Send push notification to property owner — already non-fatal
      try {
        const ownerRef = doc(db, 'users', propertyOwnerId);
        const ownerSnap = await getDoc(ownerRef);
        if (ownerSnap.exists()) {
          const ownerData = ownerSnap.data();
          const ownerPushToken: string | null = ownerData.expoPushToken ?? null;
          const mineName: string | undefined = ownerData.customName ?? undefined;

          if (ownerPushToken && propertyOwnerId !== userId) {
            await NotificationService.sendCheckInNotification(
              ownerPushToken,
              visitorNickname || 'Someone',
              mineType || 'rock',
              mineName,
            );
          }
        }
      } catch (notifError) {
        console.warn('Check-in notification failed (non-fatal):', notifError);
      }
    }

    // ✅ Stamp lastActivityAt on the property — already non-fatal
    try {
      const propertyRef = doc(db, 'properties', propertyId);
      await updateDoc(propertyRef, {
        lastActivityAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to stamp lastActivityAt on property (non-fatal):', e);
    }

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
        visitorNickname: data.visitorNickname || undefined,
        message: data.message || undefined,
        hasPhoto: data.hasPhoto || false,
        photoURL: data.photoURL || undefined,
        timestamp: data.timestamp,
        isAdult: data.isAdult,           // undefined for legacy, true/false for new
        isHidden: data.isHidden || false,
        reportCount: data.reportCount || 0,
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
  async updateUserProfile(userId: string, data: {
    nickname?: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const updates: Record<string, any> = {};
    if (data.nickname !== undefined) updates.nickname = data.nickname;
    if (data.firstName !== undefined) updates.firstName = data.firstName;
    if (data.lastName !== undefined) updates.lastName = data.lastName;
    if (data.address !== undefined) updates.address = data.address;
    if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
    await updateDoc(userRef, updates);
  }

  async uploadAvatar(userId: string, photoUri: string): Promise<string> {
    const timestamp = Date.now();
    const storageRef = ref(storage, `avatars/${userId}_${timestamp}.jpg`);
    const response = await fetch(photoUri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  }

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

  // ── TB Trade-In ──────────────────────────────────────────────────────────

  /**
   * Trade accumulated USD earnings for TerraBucks.
   * Atomically deducts usdAmount from usdEarnings and credits tbAmount to tbBalance.
   * Throws if the user doesn't have enough earnings.
   */
  async tradeEarningsForTB(userId: string, usdAmount: number, tbAmount: number): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) throw new Error('User not found');

    const data = userSnap.data();
    const currentEarnings = data.usdEarnings ?? 0;

    if (currentEarnings < usdAmount) {
      throw new Error('Insufficient earnings balance');
    }

    await updateDoc(userRef, {
      usdEarnings: currentEarnings - usdAmount,
      tbBalance: increment(tbAmount),
      totalTBEarned: increment(tbAmount),
    });
  }

  // ── TA Activity stamping ─────────────────────────────────────────────────

  /**
   * Stamp lastActivityAt on a property to reset its inactivity clock.
   * Call this when the owner views the visitor log, plays a mini-game,
   * or edits the property. Non-fatal — never blocks the user action.
   */
  async touchPropertyActivity(propertyId: string): Promise<void> {
    try {
      const propertyRef = doc(db, 'properties', propertyId);
      await updateDoc(propertyRef, {
        lastActivityAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('touchPropertyActivity failed (non-fatal):', e);
    }
  }

  /**
   * Update property details (name, photo) and stamp lastActivityAt.
   */
  async updatePropertyDetails(propertyId: string, updates: {
    customName?: string;
    photoURL?: string;
  }): Promise<void> {
    const detailsRef = doc(db, 'propertyDetails', propertyId);
    const now = new Date().toISOString();
    await setDoc(detailsRef, { ...updates, updatedAt: now }, { merge: true });

    // ✅ Also stamp lastActivityAt on the property doc — editing resets inactivity clock
    await this.touchPropertyActivity(propertyId);
  }

  // Push tokens
  async savePushToken(userId: string, token: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { expoPushToken: token });
  }

  async getPushToken(userId: string): Promise<string | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      return userSnap.exists() ? (userSnap.data().expoPushToken ?? null) : null;
    } catch { return null; }
  }

  // ── Milestone tracking (FEAT-001) ────────────────────────────────────────
  // Each milestone fires once per user. The flag is stored on the user doc.
  // Call checkAndFireMilestone() at the relevant trigger point — it reads the
  // flag, returns true (first time) or false (already seen), and sets the flag.

  async checkAndFireMilestone(userId: string, milestone: MilestoneKey): Promise<boolean> {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return false;

      const data = userSnap.data();
      if (data[milestone]) return false; // already fired

      await updateDoc(userRef, { [milestone]: true });
      return true; // first time — caller should show the celebratory prompt
    } catch (e) {
      console.error('Milestone check error:', e);
      return false;
    }
  }
}
