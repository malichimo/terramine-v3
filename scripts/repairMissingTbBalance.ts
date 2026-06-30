// scripts/repairMissingTbBalance.ts
//
// ✅ BUG-072 / BUG-078 REPAIR SCRIPT
//
// Finds existing users whose Firestore doc is missing tbBalance — caused by
// the applyReferralCode/createUser race condition where applyReferralCode
// wrote a partial doc (referredBy only) via setDoc(merge:true) BEFORE
// createUser ran, and loadUserData's old `if (!userData)` check saw the
// partial doc and skipped createUser entirely (BUG-078 — see MainNavigator.tsx
// comments for the full root-cause writeup).
//
// ✅ BUG-078 UPDATE: This script now also handles the referral-reward side
// of the same bug. Under the current reward design:
//   - A referred new user should end up with 2000 TB total (1000 base + 1000
//     signup bonus), not just the 1000 base.
//   - The referrer should receive 1000 TB, referralCount +1, tbEarnedFromReferrals +1000.
// Accounts caught by this script were created via the broken code path, so
// even if they're later fixed by app updates, the referral bonus needs to be
// applied retroactively here — `hasCompletedReferral` was never set for them,
// so ReferralService.awardSignupReferralBonus() would do this automatically
// on next login UNLESS the referrer doc itself also has issues, or the user
// never opens the app again. This script catches both cases in one pass and
// is the safer/auditable option for a one-time bulk repair.
//
// This script is SAFE to run multiple times:
//   - tbBalance: only touches users with tbBalance missing/undefined.
//   - Referral bonus: only touches users with referredBy set AND
//     hasCompletedReferral NOT true. Once applied, hasCompletedReferral is
//     set, so a re-run will skip them.
//
// Usage (run once from your local machine with Firebase Admin SDK credentials):
//   npx ts-node scripts/repairMissingTbBalance.ts --dry-run   (preview only)
//   npx ts-node scripts/repairMissingTbBalance.ts             (apply fixes)
//
// Requires: firebase-admin installed, and GOOGLE_APPLICATION_CREDENTIALS env
// var pointing at your service account JSON key (downloaded from Firebase
// Console → Project Settings → Service Accounts → Generate new private key).
//
// Uses the modern modular firebase-admin SDK (firebase-admin/app,
// firebase-admin/firestore) — Google's recommended approach since v11+.

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();
const DEFAULT_STARTING_TB = 1000;
const SIGNUP_REFERRAL_BONUS_TB = 1000; // on top of the 1000 base → 2000 total for referred users
const REFERRER_REWARD_TB = 1000;

interface AffectedTbUser {
  id: string;
  email: string;
  nickname: string;
  hadReferral: boolean;
}

interface AffectedReferralUser {
  id: string;
  email: string;
  nickname: string;
  referrerId: string;
  referrerExists: boolean;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🔍 DRY RUN — no writes will be made\n' : '⚠️  LIVE RUN — fixes will be applied\n');

  const usersSnap = await db.collection('users').get();
  console.log(`Scanning ${usersSnap.size} user documents...\n`);

  // ── Pass 1: missing tbBalance ──────────────────────────────────────────
  const affectedTb: AffectedTbUser[] = [];

  // ── Pass 2: referred users never awarded the signup bonus ─────────────
  const affectedReferral: AffectedReferralUser[] = [];

  // Cache referrer existence checks so we don't re-query the same referrer
  // doc repeatedly if multiple referred users share a referrer.
  const referrerExistsCache = new Map<string, boolean>();

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    const missingBalance = data.tbBalance === undefined || data.tbBalance === null;

    if (missingBalance) {
      affectedTb.push({
        id: docSnap.id,
        email: data.email || '(no email)',
        nickname: data.nickname || '(no nickname)',
        hadReferral: !!data.referredBy,
      });
    }

    const needsReferralBonus = !!data.referredBy && !data.hasCompletedReferral;
    if (needsReferralBonus) {
      const referrerId = data.referredBy;
      if (!referrerExistsCache.has(referrerId)) {
        const referrerSnap = await db.collection('users').doc(referrerId).get();
        referrerExistsCache.set(referrerId, referrerSnap.exists);
      }
      affectedReferral.push({
        id: docSnap.id,
        email: data.email || '(no email)',
        nickname: data.nickname || '(no nickname)',
        referrerId,
        referrerExists: referrerExistsCache.get(referrerId)!,
      });
    }
  }

  console.log(`Found ${affectedTb.length} user(s) with missing tbBalance:\n`);
  affectedTb.forEach(u => {
    console.log(`  [TB]  ${u.id}  ${u.email}  ${u.nickname}  referred=${u.hadReferral}`);
  });

  console.log(`\nFound ${affectedReferral.length} user(s) with an unpaid signup referral bonus:\n`);
  affectedReferral.forEach(u => {
    const flag = u.referrerExists ? '' : '  ⚠️ REFERRER MISSING — will skip';
    console.log(`  [REF] ${u.id}  ${u.email}  ${u.nickname}  referrer=${u.referrerId}${flag}`);
  });

  if (affectedTb.length === 0 && affectedReferral.length === 0) {
    console.log('\n✅ No affected users found. Nothing to fix.');
    return;
  }

  if (dryRun) {
    console.log(`\n🔍 Dry run complete. Re-run without --dry-run to:`);
    if (affectedTb.length > 0) {
      console.log(`   - Apply ${DEFAULT_STARTING_TB} TB starting balance to ${affectedTb.length} account(s) missing tbBalance.`);
    }
    if (affectedReferral.length > 0) {
      const payable = affectedReferral.filter(u => u.referrerExists).length;
      console.log(`   - Award the ${SIGNUP_REFERRAL_BONUS_TB} TB signup bonus to ${payable} referred user(s), and ${REFERRER_REWARD_TB} TB to their referrer(s).`);
      if (payable < affectedReferral.length) {
        console.log(`   - ${affectedReferral.length - payable} referred user(s) will be SKIPPED (referrer doc no longer exists — needs manual review).`);
      }
    }
    return;
  }

  // ── Apply: missing tbBalance ───────────────────────────────────────────
  if (affectedTb.length > 0) {
    console.log(`\n⚠️  Applying ${DEFAULT_STARTING_TB} TB starting balance to ${affectedTb.length} account(s)...`);
    let fixedTb = 0;
    for (const u of affectedTb) {
      try {
        await db.collection('users').doc(u.id).set(
          {
            tbBalance: DEFAULT_STARTING_TB,
            totalCheckIns: 0,
            totalTBEarned: 0,
            // Don't overwrite createdAt if it already exists; only set if missing.
          },
          { merge: true }
        );
        fixedTb++;
        console.log(`  ✅ [TB] Fixed ${u.id} (${u.email})`);
      } catch (e) {
        console.error(`  ❌ [TB] Failed to fix ${u.id}:`, e);
      }
    }
    console.log(`\n✅ tbBalance repair complete: ${fixedTb}/${affectedTb.length} accounts fixed.`);
  }

  // ── Apply: unpaid signup referral bonus ────────────────────────────────
  if (affectedReferral.length > 0) {
    console.log(`\n⚠️  Awarding signup referral bonuses to ${affectedReferral.length} account(s)...`);
    let fixedReferral = 0;
    let skippedReferral = 0;
    for (const u of affectedReferral) {
      if (!u.referrerExists) {
        console.warn(`  ⚠️  [REF] Skipped ${u.id} — referrer ${u.referrerId} no longer exists. Needs manual review.`);
        skippedReferral++;
        continue;
      }
      try {
        // Award the referred user's bonus and mark complete.
        await db.collection('users').doc(u.id).set(
          {
            hasCompletedReferral: true,
            tbBalance: FieldValue.increment(SIGNUP_REFERRAL_BONUS_TB),
          },
          { merge: true }
        );

        // Award the referrer.
        await db.collection('users').doc(u.referrerId).set(
          {
            tbBalance: FieldValue.increment(REFERRER_REWARD_TB),
            referralCount: FieldValue.increment(1),
            tbEarnedFromReferrals: FieldValue.increment(REFERRER_REWARD_TB),
          },
          { merge: true }
        );

        // Log it, same shape as ReferralService.awardSignupReferralBonus().
        await db.collection('referralLogs').add({
          referrerId: u.referrerId,
          referredUserId: u.id,
          referredNickname: u.nickname,
          code: '',
          tbAwarded: REFERRER_REWARD_TB,
          newUserBonusAwarded: SIGNUP_REFERRAL_BONUS_TB,
          completedAt: new Date().toISOString(),
          source: 'repairMissingTbBalance.ts (one-time backfill)',
        });

        fixedReferral++;
        console.log(`  ✅ [REF] Awarded ${u.id} (${u.email}) +${SIGNUP_REFERRAL_BONUS_TB} TB, referrer ${u.referrerId} +${REFERRER_REWARD_TB} TB`);
      } catch (e) {
        console.error(`  ❌ [REF] Failed to award ${u.id}:`, e);
      }
    }
    console.log(`\n✅ Referral bonus repair complete: ${fixedReferral}/${affectedReferral.length} awarded, ${skippedReferral} skipped (referrer missing).`);
    if (skippedReferral > 0) {
      console.log(`\nNote: skipped accounts had a referrer whose doc no longer exists (likely a`);
      console.log(`banned/deleted account). These referred users still got the tbBalance fix above`);
      console.log(`if they needed it, but did not receive the +${SIGNUP_REFERRAL_BONUS_TB} TB referral`);
      console.log(`bonus since there's no valid referrer to also credit. Review manually if needed.`);
    }
  }

  console.log(`\n✅ All repairs complete.`);
}

main().catch(e => {
  console.error('Script failed:', e);
  process.exit(1);
});
