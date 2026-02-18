// utils/TimeUtils.ts
// Phase 2: Time utilities for 4 AM EST daily resets

/**
 * Get the next 4 AM EST timestamp
 * Used for determining when free boosts and daily activities reset
 */
export function getNext4AMEST(): Date {
  const now = new Date();
  
  // Convert to EST (UTC-5, or UTC-4 during DST)
  // For simplicity, using UTC-5 (standard time)
  const estOffset = -5 * 60; // minutes
  const estNow = new Date(now.getTime() + estOffset * 60 * 1000);
  
  // Set to 4 AM
  const next4AM = new Date(estNow);
  next4AM.setHours(4, 0, 0, 0);
  
  // If past 4 AM today, move to tomorrow
  if (estNow.getHours() >= 4) {
    next4AM.setDate(next4AM.getDate() + 1);
  }
  
  // Convert back to UTC
  return new Date(next4AM.getTime() - estOffset * 60 * 1000);
}

/**
 * Check if a daily reset should occur based on last reset time
 * Returns true if we've passed a 4 AM EST boundary since lastResetTime
 */
export function shouldResetDailyActivity(lastResetTime: string): boolean {
  const lastReset = new Date(lastResetTime);
  const now = new Date();
  
  // Get the most recent 4 AM EST that has passed
  const last4AM = getLastPassed4AMEST();
  
  // Reset if last reset was before the most recent 4 AM
  return lastReset < last4AM;
}

/**
 * Get the most recent 4 AM EST that has already passed
 */
export function getLastPassed4AMEST(): Date {
  const now = new Date();
  
  // Convert to EST
  const estOffset = -5 * 60; // minutes
  const estNow = new Date(now.getTime() + estOffset * 60 * 1000);
  
  // Set to 4 AM today
  const today4AM = new Date(estNow);
  today4AM.setHours(4, 0, 0, 0);
  
  // If we haven't reached 4 AM today yet, use yesterday's 4 AM
  if (estNow.getHours() < 4) {
    today4AM.setDate(today4AM.getDate() - 1);
  }
  
  // Convert back to UTC
  return new Date(today4AM.getTime() - estOffset * 60 * 1000);
}

/**
 * Get the current "reset day" in YYYY-MM-DD format (EST timezone)
 * This is used for grouping daily activities by day
 * The "day" changes at 4 AM EST, not midnight
 */
export function getResetDay(): string {
  const estOffset = -5 * 60; // minutes
  const estNow = new Date(new Date().getTime() + estOffset * 60 * 1000);
  
  // If before 4 AM, use previous day
  if (estNow.getHours() < 4) {
    estNow.setDate(estNow.getDate() - 1);
  }
  
  const year = estNow.getFullYear();
  const month = String(estNow.getMonth() + 1).padStart(2, '0');
  const day = String(estNow.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get time until next 4 AM EST in milliseconds
 */
export function getTimeUntilNext4AMEST(): number {
  const next4AM = getNext4AMEST();
  const now = new Date();
  return next4AM.getTime() - now.getTime();
}

/**
 * Format time until next reset as human-readable string
 * Example: "18h 34m" or "2h 5m"
 */
export function formatTimeUntilReset(): string {
  const ms = getTimeUntilNext4AMEST();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

/**
 * Check if two timestamps are on the same "reset day"
 * (same day considering 4 AM EST as the boundary)
 */
export function isSameResetDay(date1: string | Date, date2: string | Date): boolean {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  const estOffset = -5 * 60;
  
  const est1 = new Date(d1.getTime() + estOffset * 60 * 1000);
  const est2 = new Date(d2.getTime() + estOffset * 60 * 1000);
  
  // Adjust for 4 AM boundary
  if (est1.getHours() < 4) est1.setDate(est1.getDate() - 1);
  if (est2.getHours() < 4) est2.setDate(est2.getDate() - 1);
  
  return (
    est1.getFullYear() === est2.getFullYear() &&
    est1.getMonth() === est2.getMonth() &&
    est1.getDate() === est2.getDate()
  );
}
