// GridUtils.ts - Unified Grid System with Proper Radius Calculation
// All grid calculations MUST use the same GRID_SIZE constant

// Grid size in degrees (approximately 10 meters at mid-latitudes)
const GRID_SIZE = 0.0001;

// Safety limits to prevent infinite loops
const MAX_GRID_SQUARES = 500; // Reduced from 1000 for better performance

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GridSquare {
  id: string;
  centerLat: number;
  centerLng: number;
  corners: LatLng[];
  mineType: 'rock' | 'coal' | 'gold' | 'diamond';
  isOwned: boolean;
  ownerId?: string;
  ownerNickname?: string;
}

/**
 * Convert latitude/longitude to Grid ID
 * This is the DEFINITIVE way to determine which grid square a coordinate is in
 */
export function latLngToGridId(latitude: number, longitude: number): string {
  const x = Math.floor(latitude / GRID_SIZE);
  const y = Math.floor(longitude / GRID_SIZE);
  return `${x}_${y}`;
}

/**
 * Convert Grid ID back to lat/lng coordinates
 */
export function gridToLatLng(gridX: number, gridY: number, refLat?: number): { latitude: number; longitude: number } {
  // Calculate the center of the grid square
  const latitude = (gridX + 0.5) * GRID_SIZE;
  const longitude = (gridY + 0.5) * GRID_SIZE;
  
  return { latitude, longitude };
}

/**
 * Generate a GridSquare from lat/lng coordinates
 * Grid ID is calculated using latLngToGridId for consistency
 */
export function generateGridSquare(latitude: number, longitude: number): GridSquare {
  // Validate inputs
  if (!isFinite(latitude) || !isFinite(longitude)) {
    console.error('Invalid coordinates for generateGridSquare:', { latitude, longitude });
    throw new Error('Invalid coordinates');
  }
  
  // Use the standard Grid ID calculation
  const id = latLngToGridId(latitude, longitude);
  
  // Parse the ID to get grid coordinates
  const [x, y] = id.split('_').map(Number);
  
  // Calculate the exact center of this grid square
  const centerLat = (x + 0.5) * GRID_SIZE;
  const centerLng = (y + 0.5) * GRID_SIZE;
  
  // Calculate corners (clockwise from bottom-left)
  const corners = [
    { latitude: x * GRID_SIZE, longitude: y * GRID_SIZE },
    { latitude: (x + 1) * GRID_SIZE, longitude: y * GRID_SIZE },
    { latitude: (x + 1) * GRID_SIZE, longitude: (y + 1) * GRID_SIZE },
    { latitude: x * GRID_SIZE, longitude: (y + 1) * GRID_SIZE },
  ];
  
  return {
    id,
    centerLat,
    centerLng,
    corners,
    mineType: 'rock',
    isOwned: false,
  };
}

/**
 * Get all visible grid squares within a radius
 * WITH PROPER CALCULATION and SAFETY LIMITS
 */
export function getVisibleGridSquares(
  centerLat: number,
  centerLng: number,
  radiusInMeters: number
): string[] {
  // Validate inputs
  if (!isFinite(centerLat) || !isFinite(centerLng) || !isFinite(radiusInMeters)) {
    console.error('Invalid inputs for getVisibleGridSquares:', { centerLat, centerLng, radiusInMeters });
    return [];
  }
  
  // Sanity check on coordinates (must be valid Earth coordinates)
  if (Math.abs(centerLat) > 90 || Math.abs(centerLng) > 180) {
    console.error('Coordinates out of bounds:', { centerLat, centerLng });
    return [];
  }
  
  // Limit radius to reasonable value for performance
  // 150m radius = ~15 grid squares per side = ~900 total squares (under our 500 limit)
  const effectiveRadius = Math.min(radiusInMeters, 150);
  
  // CORRECTED CALCULATION:
  // Each grid square is ~10 meters (0.0001 degrees)
  // For a circular area, we approximate with a square
  const gridSquaresInRadius = Math.ceil(effectiveRadius / 10);
  
  // Get the center grid square
  const centerGridId = latLngToGridId(centerLat, centerLng);
  const [centerX, centerY] = centerGridId.split('_').map(Number);
  
  // Calculate range (how many grid squares in each direction)
  const range = gridSquaresInRadius;
  
  const minX = centerX - range;
  const maxX = centerX + range;
  const minY = centerY - range;
  const maxY = centerY + range;
  
  // Safety check: calculate how many squares this would create
  const xRange = maxX - minX + 1;
  const yRange = maxY - minY + 1;
  const totalSquares = xRange * yRange;
  
  console.log('Grid calculation:', {
    radiusInMeters: effectiveRadius,
    gridSquaresInRadius,
    range,
    xRange,
    yRange,
    totalSquares
  });
  
  if (totalSquares > MAX_GRID_SQUARES) {
    console.warn('Too many grid squares!', {
      totalSquares,
      requested: totalSquares,
      max: MAX_GRID_SQUARES,
      reducing: true
    });
    
    // Reduce the range to fit within MAX_GRID_SQUARES
    const reducedRange = Math.floor(Math.sqrt(MAX_GRID_SQUARES) / 2);
    
    const gridIds: string[] = [];
    for (let x = centerX - reducedRange; x <= centerX + reducedRange; x++) {
      for (let y = centerY - reducedRange; y <= centerY + reducedRange; y++) {
        gridIds.push(`${x}_${y}`);
      }
    }
    
    console.log(`Reduced to ${gridIds.length} grid squares (range: ${reducedRange})`);
    return gridIds;
  }
  
  const gridIds: string[] = [];
  
  // Generate all grid IDs in range
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      gridIds.push(`${x}_${y}`);
    }
  }
  
  console.log(`Generated ${gridIds.length} grid squares for ${effectiveRadius}m radius`);
  return gridIds;
}

/**
 * Check if a point is within a grid square
 * Uses Grid ID comparison for reliability
 */
export function isWithinGridSquare(
  lat: number,
  lng: number,
  square: GridSquare
): boolean {
  // Simple approach: just compare Grid IDs
  const userGridId = latLngToGridId(lat, lng);
  return userGridId === square.id;
}

/**
 * Check if user is adjacent to (or within) a grid square
 * Used for purchase range validation
 */
export function isAdjacentToUser(
  userLat: number,
  userLng: number,
  square: GridSquare
): boolean {
  const userGridId = latLngToGridId(userLat, userLng);
  const [userX, userY] = userGridId.split('_').map(Number);
  const [squareX, squareY] = square.id.split('_').map(Number);
  
  // Check if within 1 square distance (including diagonals)
  const xDiff = Math.abs(userX - squareX);
  const yDiff = Math.abs(userY - squareY);
  
  return xDiff <= 1 && yDiff <= 1;
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
