// services/SystemMineService.ts
// Creates and manages the TerraMine HQ system mine
// Placed near a new user's first property purchase to enable tutorial check-in

import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { GridSquare, latLngToGridId, getGridSquare } from '../utils/GridUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SYSTEM_UID = 'terramine-system';

export const SYSTEM_MINE_DEFAULTS = {
  customName: '⚙️ TerraMine HQ',
  greeting: 'Welcome to TerraMine! Check in here to earn your first bonus TB! ⛏️',
  mineType: 'gold' as const, // Gold so it stands out visually
};

export const SYSTEM_CHECKIN_REWARD_TB = 25; // Special first check-in bonus

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns candidate offsets (in grid cells) sorted by distance from origin.
 * We try neighbors in expanding rings until we find an unowned cell.
 */
function getCandidateOffsets(): [number, number][] {
  const offsets: [number, number][] = [];
  for (let d = 1; d <= 5; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.abs(dr) === d || Math.abs(dc) === d) {
          offsets.push([dr, dc]);
        }
      }
    }
  }
  return offsets;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Called after a user's first property purchase.
 * Finds the nearest unowned grid cell and creates a system mine there.
 * Safe to call multiple times — checks if system mine already exists near the user.
 */
export async function createSystemMineNear(
  firstProperty: GridSquare
): Promise<GridSquare | null> {
  try {
    // Check if user already has a system mine nearby (idempotent guard)
    const existingQ = query(
      collection(db, 'properties'),
      where('ownerId', '==', SYSTEM_UID)
    );
    const existingSnap = await getDocs(existingQ);

    // If a system mine already exists within 10 cells, skip
    for (const d of existingSnap.docs) {
      const data = d.data();
      const latDiff = Math.abs(data.centerLat - firstProperty.centerLat);
      const lngDiff = Math.abs(data.centerLng - firstProperty.centerLng);
      if (latDiff < 0.005 && lngDiff < 0.005) {
        console.log('System mine already exists nearby — skipping creation');
        return {
          id: data.id,
          centerLat: data.centerLat,
          centerLng: data.centerLng,
          corners: data.corners,
          isOwned: true,
          ownerId: SYSTEM_UID,
          mineType: data.mineType,
          customName: SYSTEM_MINE_DEFAULTS.customName,
        };
      }
    }

    // Try candidate cells in expanding rings around the first property
    const CELL_SIZE_DEG = 0.0001; // matches GRID_SIZE in GridUtils.ts
    const offsets = getCandidateOffsets();

    for (const [dr, dc] of offsets) {
      const candidateLat = firstProperty.centerLat + dr * CELL_SIZE_DEG;
      const candidateLng = firstProperty.centerLng + dc * CELL_SIZE_DEG;

      // Generate ID using same logic as latLngToGridId in GridUtils
      const candidateId = `${Math.floor(candidateLat / CELL_SIZE_DEG)}_${Math.floor(candidateLng / CELL_SIZE_DEG)}`;

      // Check if already owned
      const propRef = doc(db, 'properties', candidateId);
      const propSnap = await getDoc(propRef);
      if (propSnap.exists()) continue;

      // Build corners (simple square approximation)
      const half = CELL_SIZE_DEG / 2;
      const corners = [
        { latitude: candidateLat - half, longitude: candidateLng - half },
        { latitude: candidateLat - half, longitude: candidateLng + half },
        { latitude: candidateLat + half, longitude: candidateLng + half },
        { latitude: candidateLat + half, longitude: candidateLng - half },
      ];

      // Create the system mine property
      await setDoc(propRef, {
        id: candidateId,
        ownerId: SYSTEM_UID,
        mineType: SYSTEM_MINE_DEFAULTS.mineType,
        centerLat: candidateLat,
        centerLng: candidateLng,
        corners,
        purchasedAt: new Date().toISOString(),
        isSystemMine: true,
      });

      // Create propertyDetails with greeting
      const detailsRef = doc(db, 'propertyDetails', candidateId);
      await setDoc(detailsRef, {
        propertyId: candidateId,
        customName: SYSTEM_MINE_DEFAULTS.customName,
        greeting: SYSTEM_MINE_DEFAULTS.greeting,
        productionLevel: 1,
        gameLevel: 1,
        gameXP: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        dailyActivitiesRemaining: 0, // system mine has no daily activities
        lastActivityDate: null,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });

      console.log(`✅ System mine created at ${candidateLat}, ${candidateLng}`);

      return {
        id: candidateId,
        centerLat: candidateLat,
        centerLng: candidateLng,
        corners,
        isOwned: true,
        ownerId: SYSTEM_UID,
        mineType: SYSTEM_MINE_DEFAULTS.mineType,
        customName: SYSTEM_MINE_DEFAULTS.customName,
      };
    }

    console.warn('Could not find an unowned cell for system mine');
    return null;
  } catch (error) {
    console.error('Error creating system mine (non-fatal):', error);
    return null;
  }
}

/**
 * Returns true if the given property is the system mine.
 */
export function isSystemMine(ownerId: string): boolean {
  return ownerId === SYSTEM_UID;
}
