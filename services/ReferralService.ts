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
  completedAt: string; // ISO string when the signup bonus was awarded
  tbAwarded: number;
}

// ✅ BUG-078 CHANGE (replaces the old first-purchase-gated reward):
// The reward now fires at SIGNUP, once the new user's base tbBalance exists —
// not gated on first purchase. New users who came in via a referral code
// should start with 2000 TB total (1000 standard base + 1000 bonus) instead
// of the standard 1000, so they comfortably have enough to buy their first
// TerraAcre without the "Insufficient TB" trap. The referrer still gets
// 1000 TB, same as before.
const SIGNUP_REFERRAL_BONUS_TB = 1000; // added on top of the new user's existing 1000 base → 2000 total
const REFERRER_REWARD_TB = 1000;

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

    // Save code to user doc and referralCodes collection.
    // ✅ Uses setDoc(merge:true) on the user doc rather than updateDoc — consistent
    // with the BUG-072 fix elsewhere in this file. updateDoc() throws if the doc
    // doesn't exist yet, which is exactly the race this bug family is about.
    await setDoc(userRef, { referralCode: code, referralCount: 0, tbEarnedFromReferrals: 0 }, { merge: true });
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
   * Stores referredBy/referredByCode on the new user — the TB reward itself
   * fires later via awardSignupReferralBonus(), once the caller has confirmed
   * the user's base tbBalance has been created (see MainNavigator.loadUserData).
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
   * (creates a new doc containing ONLY referredBy/referredByCode).
   *
   * ⚠️ BUG-078 NOTE: this is exactly the write that creates the PARTIAL doc
   * responsible for BUG-078 (new users left with no tbBalance at all). The
   * fix for that bug lives in MainNavigator.loadUserData() — it must check
   * `userData.tbBalance === undefined`, not just doc existence, before
   * deciding whether to call createUser(). See MainNavigator.tsx comments.
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
   * ✅ BUG-078 CHANGE — NEW signup-time reward path (replaces the old
   * first-purchase-gated processFirstPurchaseReferral()).
   *
   * Call this from MainNavigator.loadUserData() AFTER the new user's doc is
   * confirmed to have a real tbBalance (i.e. after the createUser()/retry
   * logic has run, not before). This ordering matters: awarding the bonus
   * before tbBalance exists would just increment(1000) on top of `undefined`,
   * which Firestore's increment() does NOT safely coerce to 1000 — it can
   * leave the field in an inconsistent state depending on the SDK version,
   * so always sequence this after tbBalance is known-good.
   *
   * Awards:
   *   - New (referred) user: +1000 TB on top of their existing 1000 base → 2000 total
   *   - Referrer: +1000 TB, referralCount +1, tbEarnedFromReferrals +1000
   *
   * Idempotent via the same `hasCompletedReferral` flag used previously —
   * safe to call on every login; it no-ops after the first successful award.
   */
  static async awardSignupReferralBonus(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();

    // Only process if referred and hasn't been rewarded yet
    if (!data.referredBy || data.hasCompletedReferral) return;

    // ✅ Guard: only award once tbBalance is a real number. If this fires
    // before MainNavigator's createUser()/retry logic has finished, bail out
    // silently — the next login (or the same session, once loadUserData
    // resolves) will pick it up since hasCompletedReferral is still false.
    if (typeof data.tbBalance !== 'number') {
      console.warn('Referral: tbBalance not yet initialized, deferring signup bonus for', userId);
      return;
    }

    const referrerId = data.referredBy;

    // Verify referrer exists BEFORE marking complete or awarding anything —
    // a missing referrer doc should not silently consume the referral.
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
      tbBalance: increment(SIGNUP_REFERRAL_BONUS_TB),
    });

    // Wrap referrer update in try/catch — a Firestore rules rejection or
    // network error here must not undo the new user's already-awarded bonus,
    // and must be logged for manual recovery rather than silently dropped.
    try {
      await updateDoc(referrerRef, {
        tbBalance: increment(REFERRER_REWARD_TB),
        referralCount: increment(1),
        tbEarnedFromReferrals: increment(REFERRER_REWARD_TB),
      });
    } catch (e) {
      console.error(
        '❌ Referral: referrer TB award failed — manual recovery needed for referrerId:',
        referrerId,
        'referredUserId:',
        userId,
        e,
      );
      // Non-fatal: new user already got their bonus and is marked complete.
      // Referrer can be compensated manually via admin dashboard / repair script.
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
        tbAwarded: REFERRER_REWARD_TB,
        newUserBonusAwarded: SIGNUP_REFERRAL_BONUS_TB,
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Referral: log write failed (non-fatal):', e);
    }

    console.log(`✅ Signup referral bonus: +${SIGNUP_REFERRAL_BONUS_TB} TB to new user ${userId}, +${REFERRER_REWARD_TB} TB to referrer ${referrerId}`);
  }

  /**
   * @deprecated Superseded by awardSignupReferralBonus(), which fires at
   * signup instead of first purchase (see BUG-078). Left in place only in
   * case any older client build still calls it — it now no-ops for anyone
   * already marked hasCompletedReferral by the new signup-time path, so it's
   * safe to leave wired up temporarily during rollout. Remove once all
   * active clients are confirmed past 1.1.7(56)/(55).
   */
  static async processFirstPurchaseReferral(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    if (!data.referredBy || data.hasCompletedReferral) return;

    // If we get here, the signup-time bonus never fired for this user
    // (e.g. they're on an old build, or hit the tbBalance-not-ready guard
    // and never got a second chance). Fall back to the original behavior
    // so the referral isn't lost.
    await this.awardSignupReferralBonus(userId);
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
