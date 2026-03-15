// utils/TimeUtils.ts
// Phase 2: Time utilities for 4 AM EST daily resets

/**
 * Get the EST/EDT offset in minutes for a given date.
 * EDT = UTC-4 (second Sunday in March through first Sunday in November)
 * EST = UTC-5 (rest of year)
 */
function getESTOffset(date: Date): number {
  const year = date.getUTCFullYear();

  // Second Sunday in March
  const marchStart = new Date(Date.UTC(year, 2, 1));
  const marchDay = marchStart.getUTCDay(); // 0=Sun
  const dstStart = new Date(Date.UTC(year, 2, (14 - marchDay) % 7 + 1, 7)); // 2 AM EST = 7 UTC

  // First Sunday in November
  const novStart = new Date(Date.UTC(year, 10, 1));
  const novDay = novStart.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, (7 - novDay) % 7 + 1, 6)); // 2 AM EDT = 6 UTC

  const isDST = date >= dstStart && date < dstEnd;
  return isDST ? -4 * 60 : -5 * 60; // minutes
}

/**
 * Get the next 4 AM EST/EDT timestamp
 */
export function getNext4AMEST(): Date {
  const now = new Date();
  const estOffset = getESTOffset(now);
  const estNow = new Date(now.getTime() + estOffset * 60 * 1000);

  const next4AM = new Date(estNow);
  next4AM.setHours(4, 0, 0, 0);

  if (estNow.getHours() >= 4) {
    next4AM.setDate(next4AM.getDate() + 1);
  }

  return new Date(next4AM.getTime() - estOffset * 60 * 1000);
}

/**
 * Check if a daily reset should occur based on last reset time
 */
export function shouldResetDailyActivity(lastResetTime: string): boolean {
  const lastReset = new Date(lastResetTime);
  const last4AM = getLastPassed4AMEST();
  return lastReset < last4AM;
}

/**
 * Get the most recent 4 AM EST/EDT that has already passed
 */
export function getLastPassed4AMEST(): Date {
  const now = new Date();
  const estOffset = getESTOffset(now);
  const estNow = new Date(now.getTime() + estOffset * 60 * 1000);

  const today4AM = new Date(estNow);
  today4AM.setHours(4, 0, 0, 0);

  if (estNow.getHours() < 4) {
    today4AM.setDate(today4AM.getDate() - 1);
  }

  return new Date(today4AM.getTime() - estOffset * 60 * 1000);
}

/**
 * Get the current "reset day" in YYYY-MM-DD format (EST/EDT timezone)
 * The "day" changes at 4 AM EST/EDT, not midnight
 */
export function getResetDay(): string {
  const now = new Date();
  const estOffset = getESTOffset(now);
  const estNow = new Date(now.getTime() + estOffset * 60 * 1000);

  if (estNow.getHours() < 4) {
    estNow.setDate(estNow.getDate() - 1);
  }

  const year = estNow.getFullYear();
  const month = String(estNow.getMonth() + 1).padStart(2, '0');
  const day = String(estNow.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Get time until next 4 AM EST/EDT in milliseconds
 */
export function getTimeUntilNext4AMEST(): number {
  const next4AM = getNext4AMEST();
  const now = new Date();
  return next4AM.getTime() - now.getTime();
}

/**
 * Format time until next reset as human-readable string
 */
export function formatTimeUntilReset(): string {
  const ms = getTimeUntilNext4AMEST();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

/**
 * Check if two timestamps are on the same "reset day"
 * (same day considering 4 AM EST/EDT as the boundary)
 */
export function isSameResetDay(date1: string | Date, date2: string | Date): boolean {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;

  const offset1 = getESTOffset(d1);
  const offset2 = getESTOffset(d2);

  const est1 = new Date(d1.getTime() + offset1 * 60 * 1000);
  const est2 = new Date(d2.getTime() + offset2 * 60 * 1000);

  if (est1.getHours() < 4) est1.setDate(est1.getDate() - 1);
  if (est2.getHours() < 4) est2.setDate(est2.getDate() - 1);

  return (
    est1.getFullYear() === est2.getFullYear() &&
    est1.getMonth() === est2.getMonth() &&
    est1.getDate() === est2.getDate()
  );
}
