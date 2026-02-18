// BOOST TIMER FIX
// This addresses the negative time issue in the boost system

// The issue is likely in how the next reset time is calculated
// When the boost expires, nextFreeBoostResetAt should be set to 6 hours AFTER expiration

// TEMPORARY FIX: Reset all boost data for testing

import { db } from '../firebaseConfig';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export async function resetBoostData(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      console.error('User not found');
      return;
    }
    
    // Reset boost data to initial state
    await updateDoc(userRef, {
      freeBoostsRemaining: 4,
      boostExpiresAt: null,
      nextFreeBoostResetAt: null,
    });
    
    console.log('✅ Boost data reset successfully');
    console.log('You now have 4 free boosts available');
  } catch (error) {
    console.error('Error resetting boost data:', error);
    throw error;
  }
}

// PROPER FIX: This is the correct logic for boost timer
export function calculateNextResetTime(lastBoostUsedAt: string): string {
  const lastUsed = new Date(lastBoostUsedAt);
  const resetTime = new Date(lastUsed.getTime() + (6 * 60 * 60 * 1000)); // 6 hours later
  return resetTime.toISOString();
}

export function calculateBoostExpiration(currentExpiration: string | null, minutesToAdd: number): string {
  const now = new Date();
  
  if (currentExpiration) {
    const currentExp = new Date(currentExpiration);
    // If current expiration is in the future, add to it
    if (currentExp > now) {
      return new Date(currentExp.getTime() + (minutesToAdd * 60 * 1000)).toISOString();
    }
  }
  
  // Otherwise, start from now
  return new Date(now.getTime() + (minutesToAdd * 60 * 1000)).toISOString();
}

export function getTimeUntilBoostReset(nextResetAt: string | null): {
  hours: number;
  minutes: number;
  isNegative: boolean;
} {
  if (!nextResetAt) {
    return { hours: 0, minutes: 0, isNegative: false };
  }
  
  const now = new Date();
  const resetTime = new Date(nextResetAt);
  const diffMs = resetTime.getTime() - now.getTime();
  
  if (diffMs < 0) {
    // Boost should have reset already - this is the bug!
    return { hours: 0, minutes: 0, isNegative: true };
  }
  
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return { hours, minutes, isNegative: false };
}
