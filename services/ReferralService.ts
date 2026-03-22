// services/ReferralService.ts
// Handles referral code generation, validation, and reward logic

import { db } from '../firebaseConfig';
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, increment
} from 'firebase/firestore';

export interface ReferralInfo {
  code: string;
  referralCount: number;
  tbEarnedFromReferrals: number;
  referrals: ReferralEntry[];
}

export interface ReferralEntry {
  referredUserId: string;
  referredNickname: string;
  completedAt: string; // ISO string when they bought their first TA
  tbAwarded: number;
}

const REFERRAL_REWARD_TB = 1000;

// ── Code generation ────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  let code = 'TM-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── Public API ─────────────────────────────────────────────────────────────

export class ReferralService {

  /**
   * Get or create a referral code for a user.
   * Called on app load — idempotent.
   */
  static async getOrCreateReferralCode(userId: string): Promise<string> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) throw new Error('User not found');

    const data = userSnap.data();
    if (data.referralCode) return data.referralCode;

    // Generate a unique code
    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const codeRef = doc(db, 'referralCodes', code);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) break;
      code = generateCode();
      attempts++;
    }

    // Save code to user doc and referralCodes collection
    await updateDoc(userRef, { referralCode: code, referralCount: 0, tbEarnedFromReferrals: 0 });
    await setDoc(doc(db, 'referralCodes', code), {
      referrerId: userId,
      code,
      createdAt: new Date().toISOString(),
    });

    return code;
  }

  /**
   * Validate a referral code and return the referrer's userId.
   * Returns null if code is invalid.
   */
  static async validateCode(code: string): Promise<string | null> {
    if (!code || code.trim().length === 0) return null;
    const normalized = code.trim().toUpperCase();
    const codeRef = doc(db, 'referralCodes', normalized);
    const codeSnap = await getDoc(codeRef);
    if (!codeSnap.exists()) return null;
    return codeSnap.data().referrerId;
  }

  /**
   * Apply a referral code to a new user on sign-up.
   * Stores referredBy on the new user — reward fires later on first purchase.
   */
  static async applyReferralCode(newUserId: string, code: string): Promise<boolean> {
    const referrerId = await this.validateCode(code);
    if (!referrerId) return false;
    if (referrerId === newUserId) return false; // can't refer yourself

    const userRef = doc(db, 'users', newUserId);
    await updateDoc(userRef, {
      referredBy: referrerId,
      referredByCode: code.trim().toUpperCase(),
    });

    return true;
  }

  /**
   * Called when a user purchases their first TerraAcre.
   * Awards 1,000 TB to both the new user and their referrer.
   * Only fires once per user.
   */
  static async processFirstPurchaseReferral(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();

    // Only process if referred and hasn't been rewarded yet
    if (!data.referredBy || data.hasCompletedReferral) return;

    const referrerId = data.referredBy;

    // Mark as completed first to prevent double-firing
    await updateDoc(userRef, {
      hasCompletedReferral: true,
      tbBalance: increment(REFERRAL_REWARD_TB),
    });

    // Reward the referrer
    const referrerRef = doc(db, 'users', referrerId);
    const referrerSnap = await getDoc(referrerRef);
    if (!referrerSnap.exists()) return;

    const referrerNickname = referrerSnap.data().nickname || 'Unknown';
    const newUserNickname = data.nickname || 'Someone';

    await updateDoc(referrerRef, {
      tbBalance: increment(REFERRAL_REWARD_TB),
      referralCount: increment(1),
      tbEarnedFromReferrals: increment(REFERRAL_REWARD_TB),
    });

    // Log the referral entry
    const referralLogRef = doc(collection(db, 'referralLogs'));
    await setDoc(referralLogRef, {
      referrerId,
      referredUserId: userId,
      referredNickname: newUserNickname,
      referrerNickname,
      code: data.referredByCode || '',
      tbAwarded: REFERRAL_REWARD_TB,
      completedAt: new Date().toISOString(),
    });

    console.log(`✅ Referral reward: ${REFERRAL_REWARD_TB} TB awarded to both ${referrerId} and ${userId}`);
  }

  /**
   * Get referral info for a user — code, count, history.
   */
  static async getReferralInfo(userId: string): Promise<ReferralInfo> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) throw new Error('User not found');
    const data = userSnap.data();

    // Fetch referral log entries for this referrer
    const q = query(
      collection(db, 'referralLogs'),
      where('referrerId', '==', userId)
    );
    const logsSnap = await getDocs(q);
    const referrals: ReferralEntry[] = logsSnap.docs.map(d => ({
      referredUserId: d.data().referredUserId,
      referredNickname: d.data().referredNickname || 'Unknown',
      completedAt: d.data().completedAt,
      tbAwarded: d.data().tbAwarded,
    }));

    // Sort by most recent
    referrals.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    return {
      code: data.referralCode || await this.getOrCreateReferralCode(userId),
      referralCount: data.referralCount || 0,
      tbEarnedFromReferrals: data.tbEarnedFromReferrals || 0,
      referrals,
    };
  }
}
