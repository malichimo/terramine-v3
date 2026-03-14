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

export interface BoostState {
  freeBoostsRemaining: number;
  adBoostsRemaining: number;
  boostExpiresAt: string | null;
  nextFreeBoostResetAt: string | null;
  lastAdBoostRefillAt: string;
}

export interface ActivityEvent {
  id: string;
  type: 'checkin_made' | 'visitor_received' | 'property_purchased' | 'game_played';
  timestamp: string;
  propertyId?: string;
  propertyOwnerId?: string;
  mineType?: string;
  message?: string;
  hasPhoto?: boolean;
  visitorNickname?: string;
  visitorUserId?: string;
  gameType?: string;
  tbEarned?: number;
}

export class DatabaseService {

  // ── User ──────────────────────────────────────────────────────────────────

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
    await updateDoc(userRef, { tbBalance: increment(amount) });
  }

  // Update any subset of profile fields
  async updateUserProfile(userId: string, profileData: {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    address?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const updates: Record<string, any> = {};
    if (profileData.firstName !== undefined) updates.firstName = profileData.firstName;
    if (profileData.lastName  !== undefined) updates.lastName  = profileData.lastName;
    if (profileData.nickname  !== undefined) updates.nickname  = profileData.nickname;
    if (profileData.address   !== undefined) updates.address   = profileData.address;
    if (profileData.avatarUrl !== undefined) updates.avatarUrl = profileData.avatarUrl;
    await updateDoc(userRef, updates);
  }

  // Upload avatar to Firebase Storage, return public download URL
  async uploadAvatar(userId: string, localUri: string): Promise<string> {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `avatars/${userId}.jpg`);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  }

  // ── Properties ────────────────────────────────────────────────────────────

  async purchaseProperty(userId: string, property: GridSquare, tbCost: number) {
    const propertyRef = doc(db, 'properties', property.id);
    const propertySnap = await getDoc(propertyRef);
    if (propertySnap.exists()) throw new Error('Property already owned');
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
  }

  async getPropertiesByOwner(userId: string): Promise<GridSquare[]> {
    const q = query(collection(db, 'properties'), where('ownerId', '==', userId));
    const querySnapshot = await getDocs(q);
    const properties = querySnapshot.docs.map(d => {
      const data = d.data();
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
    await Promise.all(properties.map(async (property) => {
      try {
        const detailsSnap = await getDoc(doc(db, 'propertyDetails', property.id));
        if (detailsSnap.exists()) {
          const name = detailsSnap.data().customName;
          if (name) property.customName = name;
        }
      } catch { /* non-fatal */ }
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
    return querySnapshot.docs.map(d => {
      const data = d.data();
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

  // ── Check-ins ─────────────────────────────────────────────────────────────

  async createCheckIn(
    userId: string,
    propertyId: string,
    propertyOwnerId: string,
    message?: string,
    hasPhoto?: boolean,
    photoUri?: string,
    visitorNickname?: string,
  ) {
    const checkInRef = doc(collection(db, 'checkIns'));
    let photoURL: string | undefined;
    if (photoUri && hasPhoto) {
      try {
        const response = await fetch(photoUri);
        const blob = await response.blob();
        const storageRef = ref(storage, `checkIns/${propertyId}_${userId}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      } catch (error) {
        console.error('Photo upload failed:', error);
      }
    }
    const checkInData: any = {
      userId,
      propertyId,
      propertyOwnerId,
      hasPhoto: !!photoURL,
      timestamp: new Date().toISOString(),
      ...(visitorNickname ? { visitorNickname } : {}),
    };
    if (message?.trim()) checkInData.message = message.trim();
    if (photoURL) checkInData.photoURL = photoURL;
    await setDoc(checkInRef, checkInData);
    await updateDoc(doc(db, 'users', userId), { totalCheckIns: increment(1) });
    await updateDoc(doc(db, 'users', propertyOwnerId), { tbBalance: increment(1) });
  }

  async getCheckInsForProperty(propertyId: string) {
    const q = query(collection(db, 'checkIns'), where('propertyId', '==', propertyId));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        visitorNickname: data.visitorNickname || undefined,
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
    const q = query(collection(db, 'checkIns'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        visitorNickname: data.visitorNickname || undefined,
        propertyId: data.propertyId,
        propertyOwnerId: data.propertyOwnerId,
        message: data.message || undefined,
        hasPhoto: data.hasPhoto || false,
        photoURL: data.photoURL || undefined,
        timestamp: data.timestamp,
      };
    });
  }

  // ── Activity Feed ─────────────────────────────────────────────────────────
  // NOTE: Queries on userId in checkIns may need a Firestore single-field index.
  // If you see an index error in the console with a link, click it to auto-create.

  async getRecentActivityFeed(userId: string, ownedPropertyIds: string[]): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];

    // 1. Check-ins I made
    try {
      const snap = await getDocs(query(collection(db, 'checkIns'), where('userId', '==', userId)));
      snap.forEach(d => {
        const data = d.data();
        events.push({
          id: `ci_${d.id}`,
          type: 'checkin_made',
          timestamp: data.timestamp,
          propertyId: data.propertyId,
          message: data.message || undefined,
          hasPhoto: data.hasPhoto || false,
        });
      });
    } catch (e) { console.warn('Activity: my check-ins error', e); }

    // 2. Visitors to my properties (chunk to stay under Firestore 'in' limit of 30)
    if (ownedPropertyIds.length > 0) {
      try {
        for (let i = 0; i < ownedPropertyIds.length; i += 30) {
          const chunk = ownedPropertyIds.slice(i, i + 30);
          const snap = await getDocs(query(collection(db, 'checkIns'), where('propertyId', 'in', chunk)));
          snap.forEach(d => {
            const data = d.data();
            if (data.userId === userId) return;
            events.push({
              id: `vr_${d.id}`,
              type: 'visitor_received',
              timestamp: data.timestamp,
              propertyId: data.propertyId,
              visitorNickname: data.visitorNickname || undefined,
              visitorUserId: data.userId,
              message: data.message || undefined,
              hasPhoto: data.hasPhoto || false,
            });
          });
        }
      } catch (e) { console.warn('Activity: visitors error', e); }
    }

    // 3. Properties I purchased
    try {
      const snap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', userId)));
      snap.forEach(d => {
        const data = d.data();
        events.push({
          id: `pp_${d.id}`,
          type: 'property_purchased',
          timestamp: data.purchasedAt || data.createdAt || new Date(0).toISOString(),
          propertyId: data.id,
          mineType: data.mineType,
        });
      });
    } catch (e) { console.warn('Activity: properties error', e); }

    // 4. Games played
    try {
      const snap = await getDocs(query(collection(db, 'gameResults'), where('userId', '==', userId)));
      snap.forEach(d => {
        const data = d.data();
        events.push({
          id: `gp_${d.id}`,
          type: 'game_played',
          timestamp: data.timestamp || data.createdAt || new Date(0).toISOString(),
          gameType: data.gameType || data.mineType || 'unknown',
          tbEarned: data.tbEarned ?? 0,
        });
      });
    } catch (e) { console.warn('Activity: games error', e); }

    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  async updateUSDEarnings(userId: string, amount: number) {
    await updateDoc(doc(db, 'users', userId), { usdEarnings: increment(amount) });
  }

  // Kept for backward compat with MapScreen photo uploads
  async uploadCheckInPhoto(userId: string, propertyId: string, localUri: string): Promise<string> {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `checkIns/${propertyId}_${userId}_${Date.now()}.jpg`);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  }

  // ── Boost ─────────────────────────────────────────────────────────────────

  async getBoostState(userId: string): Promise<BoostState> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return this.getDefaultBoostState();
    const data = userSnap.data();

    let adBoostsRemaining = data.adBoostsRemaining ?? 12;
    const lastRefill = data.lastAdBoostRefillAt ? new Date(data.lastAdBoostRefillAt) : new Date(0);
    const hoursSinceRefill = (Date.now() - lastRefill.getTime()) / (1000 * 60 * 60);
    let lastAdBoostRefillAt = data.lastAdBoostRefillAt || new Date().toISOString();
    if (hoursSinceRefill >= 24 && adBoostsRemaining < 12) {
      adBoostsRemaining = 12;
      lastAdBoostRefillAt = new Date().toISOString();
      await updateDoc(userRef, { adBoostsRemaining: 12, lastAdBoostRefillAt });
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
    await updateDoc(doc(db, 'users', userId), { lastActiveAt: new Date().toISOString() });
  }

  async updateBoostState(userId: string, boostState: BoostState): Promise<void> {
    await updateDoc(doc(db, 'users', userId), {
      freeBoostsRemaining: boostState.freeBoostsRemaining,
      adBoostsRemaining: boostState.adBoostsRemaining,
      boostExpiresAt: boostState.boostExpiresAt,
      nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
      lastAdBoostRefillAt: boostState.lastAdBoostRefillAt,
    });
  }

  async useFreeBoost(userId: string, currentState: BoostState): Promise<BoostState> {
    if (currentState.freeBoostsRemaining <= 0) throw new Error('No free boosts remaining');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const newState: BoostState = {
      ...currentState,
      freeBoostsRemaining: currentState.freeBoostsRemaining - 1,
      boostExpiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      nextFreeBoostResetAt: tomorrow.toISOString(),
    };
    await this.updateBoostState(userId, newState);
    return newState;
  }

  async useAdBoost(userId: string, currentState: BoostState): Promise<BoostState> {
    if (currentState.adBoostsRemaining <= 0) throw new Error('No ad boosts remaining');
    const now = new Date();
    const currentExpiry = currentState.boostExpiresAt ? new Date(currentState.boostExpiresAt) : now;
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const newState: BoostState = {
      ...currentState,
      adBoostsRemaining: currentState.adBoostsRemaining - 1,
      boostExpiresAt: new Date(baseTime.getTime() + 30 * 60 * 1000).toISOString(),
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
