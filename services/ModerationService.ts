// services/ModerationService.ts
// Handles reporting, blocking, and content moderation

import { db } from '../firebaseConfig';
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, increment, arrayUnion, arrayRemove
} from 'firebase/firestore';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_photo'
  | 'hate_speech'
  | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam',               label: 'Spam or misleading' },
  { key: 'harassment',         label: 'Harassment or bullying' },
  { key: 'inappropriate_photo',label: 'Inappropriate photo' },
  { key: 'hate_speech',        label: 'Hate speech' },
  { key: 'other',              label: 'Other' },
];

// Auto-hide threshold — content hidden from public view after this many reports
const AUTO_HIDE_THRESHOLD = 3;

export class ModerationService {

  // ── Reporting ──────────────────────────────────────────────────────────────

  /**
   * Report a check-in message or photo.
   * Increments reportCount on the checkIn doc.
   * Auto-hides if threshold is reached.
   */
  static async reportCheckIn(
    reporterId: string,
    checkInId: string,
    reason: ReportReason
  ): Promise<void> {
    // Check if already reported by this user
    const existingQ = query(
      collection(db, 'reports'),
      where('reporterId', '==', reporterId),
      where('contentId', '==', checkInId)
    );
    const existing = await getDocs(existingQ);
    if (!existing.empty) throw new Error('already_reported');

    // Create report doc
    const reportRef = doc(collection(db, 'reports'));
    await setDoc(reportRef, {
      reporterId,
      contentId: checkInId,
      contentType: 'checkIn',
      reason,
      createdAt: new Date().toISOString(),
      reviewed: false,
    });

    // Increment report count on checkIn
    const checkInRef = doc(db, 'checkIns', checkInId);
    const checkInSnap = await getDoc(checkInRef);
    if (!checkInSnap.exists()) return;

    const newCount = (checkInSnap.data().reportCount || 0) + 1;
    const shouldHide = newCount >= AUTO_HIDE_THRESHOLD;

    await updateDoc(checkInRef, {
      reportCount: increment(1),
      ...(shouldHide ? { isHidden: true } : {}),
    });
  }

  /**
   * Toggle the isAdult flag on a check-in photo.
   * Called by the uploader to mark/unmark their own photo.
   */
  static async setPhotoAdultFlag(
    checkInId: string,
    isAdult: boolean
  ): Promise<void> {
    const checkInRef = doc(db, 'checkIns', checkInId);
    await updateDoc(checkInRef, { isAdult });
  }

  // ── Blocking ───────────────────────────────────────────────────────────────

  /**
   * Block a user. Adds to the blocker's blockedUsers array.
   */
  static async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new Error('Cannot block yourself');
    const userRef = doc(db, 'users', blockerId);
    await updateDoc(userRef, {
      blockedUsers: arrayUnion(blockedId),
    });
  }

  /**
   * Unblock a user.
   */
  static async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const userRef = doc(db, 'users', blockerId);
    await updateDoc(userRef, {
      blockedUsers: arrayRemove(blockedId),
    });
  }

  /**
   * Get the list of users blocked by a user.
   */
  static async getBlockedUsers(userId: string): Promise<string[]> {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return [];
    return snap.data().blockedUsers || [];
  }

  // ── Age / Adult content ────────────────────────────────────────────────────

  /**
   * Check if a user is an adult based on their stored dateOfBirth.
   */
  static isAdultFromDOB(dateOfBirth: string): boolean {
    try {
      // Handle both YYYY-MM-DD (ISO, stored format) and MM/DD/YYYY (legacy)
      let year: number, month: number, day: number;
      if (dateOfBirth.includes('-')) {
        const parts = dateOfBirth.split('-');
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        const parts = dateOfBirth.split('/');
        month = parseInt(parts[0], 10);
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
      const today = new Date();
      const age = today.getFullYear() - year - (
        today.getMonth() + 1 < month ||
        (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0
      );
      return age >= 18;
    } catch {
      return false;
    }
  }

  /**
   * Save date of birth and isAdult flag to user doc.
   */
  static async saveDateOfBirth(userId: string, dateOfBirth: string): Promise<void> {
    const isAdult = this.isAdultFromDOB(dateOfBirth);
    const userRef = doc(db, 'users', userId);
    // Use setDoc with merge:true so this works even if the user doc
    // hasn't been created yet by MainNavigator.loadUserData
    await setDoc(userRef, { dateOfBirth, isAdult }, { merge: true });
  }

  /**
   * Determine if a check-in photo should be visible to a viewer.
   *
   * Rules:
   * - Adult viewer → sees all photos
   * - Minor viewer → only sees photos explicitly marked isAdult: false
   *   (i.e. taken by another minor). Photos with isAdult: true OR
   *   photos with no isAdult field (legacy, unknown) are hidden from minors.
   *
   * @param checkInIsAdult  The isAdult flag on the checkIn doc (undefined = unknown/legacy)
   * @param viewerIsAdult   Whether the viewing user is 18+
   */
  static shouldShowPhoto(
    checkInIsAdult: boolean | undefined,
    viewerIsAdult: boolean
  ): boolean {
    // Adult viewers see everything
    if (viewerIsAdult) return true;
    // Minor viewers only see photos explicitly tagged as non-adult (isAdult === false)
    // Unknown/legacy photos (undefined) are treated as restricted for safety
    return checkInIsAdult === false;
  }
}
