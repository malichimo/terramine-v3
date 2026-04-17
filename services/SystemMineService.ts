// services/SystemMineService.ts
// Creates and manages the TerraMine HQ system mine

import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { GridSquare, latLngToGridId } from '../utils/GridUtils';

export const SYSTEM_UID = 'terramine-system';

export const SYSTEM_MINE_DEFAULTS = {
  customName: 'TerraMine HQ',
  greeting: 'Welcome to TerraMine! Check in here to earn your first bonus TB!',
  mineType: 'gold' as const,
};

export const SYSTEM_CHECKIN_REWARD_TB = 25;

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

export async function createSystemMineNear(
  firstProperty: GridSquare
): Promise<GridSquare | null> {
  try {
    const existingQ = query(
      collection(db, 'properties'),
      where('ownerId', '==', SYSTEM_UID)
    );
    const existingSnap = await getDocs(existingQ);

    for (const d of existingSnap.docs) {
      const data = d.data();
      const latDiff = Math.abs(data.centerLat - firstProperty.centerLat);
      const lngDiff = Math.abs(data.centerLng - firstProperty.centerLng);
      if (latDiff < 0.005 && lngDiff < 0.005) {
        console.log('System mine already exists nearby');
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

    const CELL_SIZE_DEG = 0.0001;
    const offsets = getCandidateOffsets();

    for (const [dr, dc] of offsets) {
      const candidateLat = firstProperty.centerLat + dr * CELL_SIZE_DEG;
      const candidateLng = firstProperty.centerLng + dc * CELL_SIZE_DEG;
      const candidateId = Math.floor(candidateLat / CELL_SIZE_DEG) + '_' + Math.floor(candidateLng / CELL_SIZE_DEG);

      const propRef = doc(db, 'properties', candidateId);
      const propSnap = await getDoc(propRef);
      if (propSnap.exists()) continue;

      const half = CELL_SIZE_DEG / 2;
      const corners = [
        { latitude: candidateLat - half, longitude: candidateLng - half },
        { latitude: candidateLat - half, longitude: candidateLng + half },
        { latitude: candidateLat + half, longitude: candidateLng + half },
        { latitude: candidateLat + half, longitude: candidateLng - half },
      ];

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
        dailyActivitiesRemaining: 0,
        lastActivityDate: null,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });

      console.log('System mine created at ' + candidateLat + ', ' + candidateLng);

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

export function isSystemMine(ownerId: string): boolean {
  return ownerId === SYSTEM_UID;
}
