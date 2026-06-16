// utils/ResourceNames.ts
//
// Single source of truth for mine-type-specific resource tier display names.
// Resources are stored in Firestore as generic common/uncommon/rare/epic
// counts (see ResourcePool in types/PropertyTypes.ts), but each mine type
// has its own flavor names for those tiers.
//
// ✅ BUG-062/063/064/065 FIX: GoldRush/LaserBlast win screens and the Gold/Coal
// Upgrades Office screens each had their own (drifted) copies of this table.
// Centralizing here so future changes only need to happen in one place.
//
// Corrected per PROJECT_INSTRUCTIONS resource name table (June 14, 2026):
// Diamond Common was "Carbon" (now "Diamond Chip"), Diamond Rare was
// "Gem Diamond" (now "Cut Diamond") — corrected against the Diamond
// Upgrades Office screen, which is ground truth.

export type ResourceTier = 'common' | 'uncommon' | 'rare' | 'epic';

export type MineType = 'rock' | 'coal' | 'gold' | 'diamond';

export const RESOURCE_NAMES: Record<MineType, Record<ResourceTier, string>> = {
  rock:    { common: 'Gravel',       uncommon: 'Slate',       rare: 'Granite',     epic: 'Marble'           },
  coal:    { common: 'Coal Dust',    uncommon: 'Lignite',     rare: 'Anthracite',  epic: 'Diamond Coal'     },
  gold:    { common: 'Gold Flakes',  uncommon: 'Gold Nugget', rare: 'Gold Bar',    epic: 'Gold Ingot'       },
  diamond: { common: 'Diamond Chip', uncommon: 'Raw Diamond', rare: 'Cut Diamond', epic: 'Flawless Diamond' },
};

/**
 * Get the resource tier display names for a given mine type.
 * Falls back to the rock table for unrecognized mine types so callers
 * never crash on an unexpected/missing mineType value.
 */
export function getResourceNames(mineType: string): Record<ResourceTier, string> {
  return RESOURCE_NAMES[mineType as MineType] ?? RESOURCE_NAMES.rock;
}
