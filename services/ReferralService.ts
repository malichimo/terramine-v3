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
   *
   * ✅ BUG-072 FIX: Previously used updateDoc(), which THROWS if the target
   * document doesn't exist yet. For Google/Apple sign-in users, this function
   * is called from LoginScreen.applyPendingReferralIfEligible() IMMEDIATELY
   * after signInWithGoogle/Apple() resolves — but the user's Firestore doc
   * isn't created until later, inside MainNavigator's loadUserData() →
   * createUser(), which runs in a separate component via a separate useEffect.
   *
   * Race result: updateDoc() throws "No document to update", the error is
   * swallowed by the caller's try/catch, and referredBy is silently never
   * written. createUser() then creates the doc fresh afterward with no
   * referredBy field — the referral relationship is permanently lost with
   * no error surfaced anywhere. This required manual TB credits to fix.
   *
   * Fix: use setDoc(..., { merge: true }) instead. This works whether the
   * doc already exists (merges referredBy into it) or doesn't exist yet
   * (creates a new doc containing ONLY referredBy/referredByCode — safe,
   * since createUser() runs later and also uses merge-safe writes elsewhere
   * in the codebase per the setDoc-merge pattern documented in DatabaseService).
   *
   * Note: this does NOT fix the ordering issue itself (referral code can still
   * be applied before tbBalance is set) — it just makes the write succeed
   * regardless of ordering, which is what actually matters since
   * processFirstPurchaseReferral() only checks for referredBy's presence,
   * not when it was written.
   */
  static async applyReferralCode(newUserId: string, code: string): Promise<boolean> {
    const referrerId = await this.validateCode(code);
    if (!referrerId) return false;
    if (referrerId === newUserId) return false; // can't refer yourself

    const userRef = doc(db, 'users', newUserId);
    await setDoc(userRef, {
      referredBy: referrerId,
      referredByCode: code.trim().toUpperCase(),
    }, { merge: true });

    return true;
  }

  /**
   * Called when a user purchases their first TerraAcre.
   * Awards 1,000 TB to both the new user and their referrer.
   * Only fires once per user.
   *
   * ✅ BUG FIX: Previously the referrer's existence was checked AFTER marking
   * hasCompletedReferral and awarding the new user's TB. Any failure between
   * those two writes (network error, referrer doc missing, Firestore rules
   * rejection) would silently consume the referral — the new user was marked
   * complete so it could never retry, but the referrer never got their TB.
   *
   * Fix: verify referrer exists BEFORE any writes. Then wrap the referrer
   * update in its own try/catch so a rules rejection or network error is
   * logged for manual recovery rather than silently dropped.
   *
   * ✅ RULES FIX (deploy separately): The referrer update writes tbBalance +
   * referralCount + tbEarnedFromReferrals to a doc the caller doesn't own.
   * The old isVisitorTBReward() only allowed ['tbBalance'], so referralCount
   * and tbEarnedFromReferrals caused the entire write to be rejected by
   * Firestore. Add isReferralReward() to the users update rule — see
   * firestore.rules comment block.
   */
  static async processFirstPurchaseReferral(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();

    // Only process if referred and hasn't been rewarded yet
    if (!data.referredBy || data.hasCompletedReferral) return;

    const referrerId = data.referredBy;

    // ✅ FIX: Verify referrer exists BEFORE marking complete or awarding anything.
    // Previously this check happened after the new user was already marked complete,
    // so a missing referrer doc would silently consume the referral with no retry.
    const referrerRef = doc(db, 'users', referrerId);
    const referrerSnap = await getDoc(referrerRef);
    if (!referrerSnap.exists()) {
      console.warn('Referral: referrer doc not found, aborting without marking complete:', referrerId);
      return;
    }

    const referrerNickname = referrerSnap.data().nickname || 'Unknown';
    const newUserNickname = data.nickname || 'Someone';

    // Award new user and mark complete — this is the idempotency gate.
    // Do this first so a crash after this point doesn't cause double-award
    // on retry (better to manually compensate a missed referrer than to
    // double-award both sides).
    await updateDoc(userRef, {
      hasCompletedReferral: true,
      tbBalance: increment(REFERRAL_REWARD_TB),
    });

    // ✅ FIX: Wrap referrer update in try/catch.
    // Previously this was a bare await — any failure (Firestore rules rejection,
    // network error) would throw, leave the referrer unrewarded, and since
    // hasCompletedReferral was already true, no retry was ever possible.
    // Now we log the failure for manual recovery instead of silently dropping it.
    try {
      await updateDoc(referrerRef, {
        tbBalance: increment(REFERRAL_REWARD_TB),
        referralCount: increment(1),
        tbEarnedFromReferrals: increment(REFERRAL_REWARD_TB),
      });
    } catch (e) {
      console.error(
        '❌ Referral: referrer TB award failed — manual recovery needed for referrerId:',
        referrerId,
        'referredUserId:',
        userId,
        e,
      );
      // Non-fatal: new user already got their TB and is marked complete.
      // Referrer can be compensated manually via admin dashboard.
      // Once the Firestore isReferralReward() rule is deployed, this path
      // should no longer be hit.
      return;
    }

    // Log the referral entry — non-fatal if this fails
    try {
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
    } catch (e) {
      console.warn('Referral: log write failed (non-fatal):', e);
    }

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
