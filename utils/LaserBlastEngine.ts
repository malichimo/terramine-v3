// utils/LaserBlastEngine.ts
// LaserBlast puzzle engine for Diamond Mine properties
// Laser physics, puzzle generation, path tracing, and scoring

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'right' | 'left' | 'up' | 'down';

export type TileType =
  | 'empty'       // dark cave floor — laser passes through
  | 'mirror-/'    // reflects laser at 90° (/ orientation)
  | 'mirror-\\'   // reflects laser at 90° (\ orientation)
  | 'coal'        // target — terminates laser, records hit
  | 'obstacle'    // rock wall — terminates laser, not a hit
  | 'miner';      // laser emitter on grid edge (visual only, not in grid cells)

export type LaserColor = 'red' | 'blue' | 'green' | 'yellow';

export interface Cell {
  row: number;
  col: number;
  type: TileType;
  /** Only on coal cells — which miner index owns this target */
  coalIndex?: number;
  /** True when laser has hit this coal during a fire sequence */
  isHit?: boolean;
  /** Only on mirror cells — rotation count for animation (0–3) */
  rotations?: number;
}

export interface MinerConfig {
  /** Which edge the miner stands on */
  edge: 'top' | 'bottom' | 'left' | 'right';
  /** Row or col index on that edge */
  position: number;
  /** Direction the laser fires INTO the grid */
  fireDirection: Direction;
  color: LaserColor;
  /** Index into coals array — which coal this miner targets */
  coalIndex: number;
}

export interface LaserSegment {
  row: number;
  col: number;
  /** Entry direction into this cell */
  entryDir: Direction;
  /** Exit direction out of this cell (undefined if terminated here) */
  exitDir?: Direction;
  color: LaserColor;
}

export interface LaserResult {
  minerIndex: number;
  segments: LaserSegment[];
  /** true if this laser reached its assigned coal */
  hitTarget: boolean;
  color: LaserColor;
}

export interface PuzzleConfig {
  gridSize: number;
  grid: Cell[][];
  miners: MinerConfig[];
  /** Number of coal targets (= number of miners) */
  targetCount: number;
  /** Difficulty label */
  difficulty: string;
}

export interface FireResult {
  results: LaserResult[];
  allHit: boolean;
}

export interface ScoreResult {
  base: number;
  timeBonus: number;
  perfectBonus: number;
  livesPenalty: number;
  total: number;
  xpEarned: number;
  tbEarned: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const LASER_COLORS: LaserColor[] = ['red', 'blue', 'green', 'yellow'];

/** Map a laser color to its hex for rendering */
export const LASER_COLOR_HEX: Record<LaserColor, string> = {
  red:    '#FF3B30',
  blue:   '#007AFF',
  green:  '#34C759',
  yellow: '#FFD60A',
};

/** Coal glow colors matching laser */
export const COAL_GLOW_HEX: Record<LaserColor, string> = {
  red:    '#FF6B6B',
  blue:   '#5AC8FA',
  green:  '#4CD964',
  yellow: '#FFE066',
};

const MAX_LASER_STEPS = 200; // safety limit to prevent infinite loops

// ─── Difficulty helpers ───────────────────────────────────────────────────────

export interface LaserDifficulty {
  gridSize: number;
  mirrorCount: number;
  targetCount: number;  // miners + coals
  obstacleCount: number;
  timeLimit: number;    // seconds
  tapLimit: number | null;
}

export function getLaserDifficulty(gameLevel: number): LaserDifficulty {
  if (gameLevel <= 10) {
    return {
      gridSize: 5,
      mirrorCount: 2 + Math.floor(gameLevel / 4),      // 2–4
      targetCount: 1,
      obstacleCount: 0,
      timeLimit: 90,
      tapLimit: null,
    };
  } else if (gameLevel <= 25) {
    return {
      gridSize: 6,
      mirrorCount: 3 + Math.floor((gameLevel - 11) / 4),  // 3–6
      targetCount: 2,
      obstacleCount: 1 + Math.floor((gameLevel - 11) / 8), // 1–2
      timeLimit: Math.max(60, 75 - (gameLevel - 11)),
      tapLimit: null,
    };
  } else if (gameLevel <= 50) {
    return {
      gridSize: 7,
      mirrorCount: 4 + Math.floor((gameLevel - 26) / 5),  // 4–8
      targetCount: 2 + (gameLevel >= 38 ? 1 : 0),          // 2–3
      obstacleCount: 2 + Math.floor((gameLevel - 26) / 8), // 2–5
      timeLimit: Math.max(45, 60 - (gameLevel - 26)),
      tapLimit: Math.max(15, 20 - Math.floor((gameLevel - 26) / 5)),
    };
  } else {
    return {
      gridSize: 8,
      mirrorCount: 6 + Math.floor((gameLevel - 51) / 10), // 6–10+
      targetCount: 3 + (gameLevel >= 70 ? 1 : 0),          // 3–4
      obstacleCount: 3 + Math.floor((gameLevel - 51) / 10),// 3–7
      timeLimit: Math.max(35, 45 - Math.floor((gameLevel - 51) / 5)),
      tapLimit: Math.max(12, 15 - Math.floor((gameLevel - 51) / 10)),
    };
  }
}

export function getDifficultyLabel(gameLevel: number): string {
  if (gameLevel <= 10)  return 'Rookie';
  if (gameLevel <= 25)  return 'Miner';
  if (gameLevel <= 50)  return 'Foreman';
  return 'Master';
}

// ─── Laser physics ────────────────────────────────────────────────────────────

/**
 * Reflect a direction off a '/' mirror.
 * right→up, up→right, left→down, down→left
 */
function reflectSlash(dir: Direction): Direction {
  switch (dir) {
    case 'right': return 'up';
    case 'up':    return 'right';
    case 'left':  return 'down';
    case 'down':  return 'left';
  }
}

/**
 * Reflect a direction off a '\' mirror.
 * right→down, down→right, left→up, up→left
 */
function reflectBackslash(dir: Direction): Direction {
  switch (dir) {
    case 'right': return 'down';
    case 'down':  return 'right';
    case 'left':  return 'up';
    case 'up':    return 'left';
  }
}

/** Advance one step in a direction */
function step(row: number, col: number, dir: Direction): { row: number; col: number } {
  switch (dir) {
    case 'right': return { row, col: col + 1 };
    case 'left':  return { row, col: col - 1 };
    case 'up':    return { row: row - 1, col };
    case 'down':  return { row: row + 1, col };
  }
}

/**
 * Trace a single laser from a miner config through the grid.
 * Returns the list of segments and whether the laser hit its coal target.
 */
export function traceLaser(
  grid: Cell[][],
  miner: MinerConfig,
  gridSize: number,
): LaserResult {
  const segments: LaserSegment[] = [];
  const visited = new Set<string>();

  let row: number;
  let col: number;

  // Starting position: the first cell inside the grid from the miner's edge
  switch (miner.edge) {
    case 'left':   row = miner.position; col = 0; break;
    case 'right':  row = miner.position; col = gridSize - 1; break;
    case 'top':    row = 0; col = miner.position; break;
    case 'bottom': row = gridSize - 1; col = miner.position; break;
  }

  let dir = miner.fireDirection;
  let hitTarget = false;
  let steps = 0;

  while (steps < MAX_LASER_STEPS) {
    steps++;

    // Out of bounds — laser exits grid
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) break;

    // Loop detection
    const key = `${row},${col},${dir}`;
    if (visited.has(key)) break; // infinite loop — terminate
    visited.add(key);

    const cell = grid[row][col];
    const segment: LaserSegment = { row, col, entryDir: dir, color: miner.color };

    if (cell.type === 'obstacle') {
      // Blocked — terminate without adding segment for this cell
      break;
    }

    if (cell.type === 'coal') {
      segment.exitDir = undefined; // terminates here
      segments.push(segment);
      if (cell.coalIndex === miner.coalIndex) {
        hitTarget = true;
      }
      break; // coal always terminates laser
    }

    if (cell.type === 'mirror-/') {
      const exitDir = reflectSlash(dir);
      segment.exitDir = exitDir;
      segments.push(segment);
      dir = exitDir;
    } else if (cell.type === 'mirror-\\') {
      const exitDir = reflectBackslash(dir);
      segment.exitDir = exitDir;
      segments.push(segment);
      dir = exitDir;
    } else {
      // empty cell — passes straight through
      segment.exitDir = dir;
      segments.push(segment);
    }

    const next = step(row, col, dir);
    row = next.row;
    col = next.col;
  }

  return { minerIndex: miner.coalIndex, segments, hitTarget, color: miner.color };
}

/**
 * Fire all miners and return the combined result.
 */
export function fireLasers(puzzle: PuzzleConfig): FireResult {
  const results: LaserResult[] = puzzle.miners.map(miner =>
    traceLaser(puzzle.grid, miner, puzzle.gridSize)
  );
  const allHit = results.every(r => r.hitTarget);
  return { results, allHit };
}

// ─── Mirror interaction ───────────────────────────────────────────────────────

/**
 * Toggle a mirror cell between '/' and '\'.
 * Returns a new grid (immutable update).
 */
export function rotateMirror(grid: Cell[][], row: number, col: number): Cell[][] {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  const cell = newGrid[row][col];

  if (cell.type === 'mirror-/') {
    cell.type = 'mirror-\\';
  } else if (cell.type === 'mirror-\\') {
    cell.type = 'mirror-/';
  }
  cell.rotations = (cell.rotations ?? 0) + 1;

  return newGrid;
}

// ─── Puzzle generation ────────────────────────────────────────────────────────

/** Simple seeded-ish random using Math.random (sufficient for puzzle gen) */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build an empty grid of the given size.
 */
function buildEmptyGrid(size: number): Cell[][] {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({
      row,
      col,
      type: 'empty' as TileType,
    }))
  );
}

/**
 * Determine the fire direction for a miner based on its edge.
 */
function fireDirectionForEdge(edge: MinerConfig['edge']): Direction {
  switch (edge) {
    case 'left':   return 'right';
    case 'right':  return 'left';
    case 'top':    return 'down';
    case 'bottom': return 'up';
  }
}

/**
 * Generate a valid puzzle where every miner has a solvable path to its coal.
 *
 * Strategy:
 * 1. Place coal targets in the interior of the grid
 * 2. Place miners on edges (different edges or positions for each)
 * 3. Compute a random bouncing path from miner to coal using mirrors
 * 4. Place mirrors along that path
 * 5. Add decoy mirrors (extra mirrors placed randomly, start in wrong orientation)
 * 6. Add obstacles avoiding all path cells
 * 7. Shuffle all non-path mirrors to start in random orientations
 *    (the solution mirrors start correct — player must fix decoys)
 *
 * Actually we invert this: all mirrors start in WRONG orientation so the
 * player must tap each one to find the solution.
 */
export function generatePuzzle(gameLevel: number): PuzzleConfig {
  const difficulty = getLaserDifficulty(gameLevel);
  const { gridSize, mirrorCount, targetCount, obstacleCount } = difficulty;

  // Minimum bounces required per laser path — enforces puzzle complexity.
  // minBounces also controls the minimum travel distance before the first
  // mirror can be placed (see traceRoute — minTravelBeforeBounce).
  // Level  1–10:  1 bounce  (must deflect at least once)
  // Level 11–25:  2 bounces (must use two mirrors per path)
  // Level 26+:    3 bounces (complex multi-bounce shots)
  const minBounces = gameLevel <= 10 ? 1 : gameLevel <= 25 ? 2 : 3;

  // ✅ BUG-024 FIX: Increased from 50 → 150 attempts. On small grids (5×5)
  // many random coal/miner placements can't satisfy minBounces, so we need
  // more tries before falling back to a relaxed puzzle.
  for (let attempt = 0; attempt < 150; attempt++) {
    const result = tryGeneratePuzzle(gridSize, mirrorCount, targetCount, obstacleCount, gameLevel, minBounces);
    if (result) return result;
  }

  // Fallback: relax to 1 bounce minimum but still require a real bounce.
  // ✅ BUG-024 FIX: Increased from 20 → 50 attempts here too.
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = tryGeneratePuzzle(gridSize, mirrorCount, targetCount, obstacleCount, gameLevel, 1);
    if (result) return result;
  }

  // Last resort: a guaranteed-solvable puzzle that still requires 1 real bounce.
  return generateFallbackPuzzle(gridSize, gameLevel);
}

function tryGeneratePuzzle(
  gridSize: number,
  mirrorCount: number,
  targetCount: number,
  obstacleCount: number,
  gameLevel: number,
  minBounces: number,
): PuzzleConfig | null {
  const grid = buildEmptyGrid(gridSize);
  const usedCells = new Set<string>();
  const miners: MinerConfig[] = [];
  const solutionMirrorCells: Array<{ row: number; col: number; type: 'mirror-/' | 'mirror-\\' }> = [];

  const mark = (r: number, c: number) => usedCells.add(`${r},${c}`);
  const used = (r: number, c: number) => usedCells.has(`${r},${c}`);

  // ── 1. Pick coal positions (inner 60% of grid) ──────────────────────────────
  const margin = Math.max(1, Math.floor(gridSize * 0.2));
  const innerCells: Array<[number, number]> = [];
  for (let r = margin; r < gridSize - margin; r++) {
    for (let c = margin; c < gridSize - margin; c++) {
      innerCells.push([r, c]);
    }
  }
  if (innerCells.length < targetCount) return null;

  const shuffledInner = shuffle(innerCells);
  const coalPositions = shuffledInner.slice(0, targetCount);
  coalPositions.forEach(([r, c], idx) => {
    grid[r][c] = { row: r, col: c, type: 'coal', coalIndex: idx, isHit: false };
    mark(r, c);
  });

  // ── 2. Pick miner positions on edges (one per coal) ─────────────────────────
  const edges: Array<MinerConfig['edge']> = ['left', 'top', 'right', 'bottom'];
  const usedMinerSlots = new Set<string>();

  for (let i = 0; i < targetCount; i++) {
    let placed = false;
    const shuffledEdges = shuffle(edges);
    for (const edge of shuffledEdges) {
      const maxPos = gridSize - 1;
      const positions = shuffle(Array.from({ length: gridSize }, (_, k) => k));
      for (const pos of positions) {
        const slot = `${edge}-${pos}`;
        if (usedMinerSlots.has(slot)) continue;

        usedMinerSlots.add(slot);
        miners.push({
          edge,
          position: pos,
          fireDirection: fireDirectionForEdge(edge),
          color: LASER_COLORS[i % LASER_COLORS.length],
          coalIndex: i,
        });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) return null;
  }

  // ── 3. Route laser paths from each miner to its coal via mirrors ─────────────
  // We use a simple approach: build a path with at most 2–3 mirror bounces.
  const pathCells = new Set<string>();

  for (let i = 0; i < miners.length; i++) {
    const miner = miners[i];
    const [coalRow, coalCol] = coalPositions[i];
    const path = routePath(miner, coalRow, coalCol, grid, gridSize, usedCells, pathCells, minBounces);
    if (!path) return null;

    path.forEach(({ row, col, mirrorType }) => {
      if (mirrorType) {
        grid[row][col] = { row, col, type: mirrorType, rotations: 0 };
        mark(row, col);
        pathCells.add(`${row},${col}`);
        solutionMirrorCells.push({ row, col, type: mirrorType });
      } else {
        pathCells.add(`${row},${col}`);
      }
    });
  }

  // ── 4. Add decoy mirrors (already wrong orientation) ────────────────────────
  const decoyCount = Math.max(0, mirrorCount - solutionMirrorCells.length);
  let decoysPlaced = 0;
  const allCells = shuffle(
    Array.from({ length: gridSize }, (_, r) =>
      Array.from({ length: gridSize }, (_, c) => [r, c] as [number, number])
    ).flat()
  );

  for (const [r, c] of allCells) {
    if (decoysPlaced >= decoyCount) break;
    if (used(r, c)) continue;
    const mirrorType: TileType = Math.random() < 0.5 ? 'mirror-/' : 'mirror-\\';
    grid[r][c] = { row: r, col: c, type: mirrorType, rotations: 0 };
    mark(r, c);
    decoysPlaced++;
  }

  // ── 5. Add obstacles ─────────────────────────────────────────────────────────
  let obstaclesPlaced = 0;
  for (const [r, c] of allCells) {
    if (obstaclesPlaced >= obstacleCount) break;
    if (used(r, c)) continue;
    grid[r][c] = { row: r, col: c, type: 'obstacle' };
    mark(r, c);
    obstaclesPlaced++;
  }

  // ── 6. Scramble solution mirrors — guarantee at least 1 must be changed ───────
  // First, randomly flip each solution mirror (50% chance each).
  // Then ensure at least one is in the WRONG orientation so the puzzle always
  // requires at least one tap to solve.
  const flipped = solutionMirrorCells.map(({ row, col, type }) => {
    const doFlip = Math.random() < 0.5;
    if (doFlip) {
      grid[row][col].type = type === 'mirror-/' ? 'mirror-\\' : 'mirror-/';
    }
    return doFlip;
  });

  // If every solution mirror happened to stay correct, force-flip one at random
  const anyFlipped = flipped.some(f => f);
  if (!anyFlipped && solutionMirrorCells.length > 0) {
    const pick = Math.floor(Math.random() * solutionMirrorCells.length);
    const { row, col, type } = solutionMirrorCells[pick];
    grid[row][col].type = type === 'mirror-/' ? 'mirror-\\' : 'mirror-/';
  }

  // ── 7. Verify puzzle is solvable (solution mirrors restore to original) ──────
  // Build a solution grid with all solution mirrors in correct orientation
  const solutionGrid = grid.map(r => r.map(c => ({ ...c })));
  for (const { row, col, type } of solutionMirrorCells) {
    solutionGrid[row][col].type = type;
  }

  const testPuzzle: PuzzleConfig = {
    gridSize,
    grid: solutionGrid,
    miners,
    targetCount,
    difficulty: getDifficultyLabel(gameLevel),
  };

  const testFire = fireLasers(testPuzzle);
  if (!testFire.allHit) return null; // solution doesn't work — retry

  return {
    gridSize,
    grid,
    miners,
    targetCount,
    difficulty: getDifficultyLabel(gameLevel),
  };
}

// ─── Path routing ─────────────────────────────────────────────────────────────

interface PathStep {
  row: number;
  col: number;
  mirrorType?: 'mirror-/' | 'mirror-\\';
}

/**
 * Route a laser path from a miner to a coal using up to 3 mirror bounces.
 * Returns the list of cells (with mirror types for bounce cells) or null.
 */
function routePath(
  miner: MinerConfig,
  coalRow: number,
  coalCol: number,
  grid: Cell[][],
  gridSize: number,
  usedCells: Set<string>,
  pathCells: Set<string>,
  minBounces: number = 1,
): PathStep[] | null {
  // Starting position (first cell inside grid from edge)
  let startRow: number, startCol: number;
  switch (miner.edge) {
    case 'left':   startRow = miner.position; startCol = 0; break;
    case 'right':  startRow = miner.position; startCol = gridSize - 1; break;
    case 'top':    startRow = 0; startCol = miner.position; break;
    case 'bottom': startRow = gridSize - 1; startCol = miner.position; break;
  }

  // Try paths starting from minBounces up to 3 bounces
  // minBounces enforces puzzle difficulty — never allow a trivial straight shot
  for (let bounces = minBounces; bounces <= 3; bounces++) {
    const path = traceRoute(
      startRow, startCol, miner.fireDirection,
      coalRow, coalCol,
      gridSize, usedCells, pathCells,
      bounces, 0
    );
    if (path) return path;
  }
  return null;
}

function traceRoute(
  row: number,
  col: number,
  dir: Direction,
  targetRow: number,
  targetCol: number,
  gridSize: number,
  usedCells: Set<string>,
  pathCells: Set<string>,
  bouncesRemaining: number,
  depth: number,
  // ✅ BUG-024 FIX: Minimum cells to travel before the first mirror can be placed.
  // Without this, the generator places a mirror on the very first cell the
  // laser enters, creating a one-tap-from-the-edge puzzle even with minBounces=1.
  // We require at least 2 cells of straight travel before the first bounce,
  // and at least 1 cell between subsequent bounces, so puzzles always have
  // real traversal distance.
  minTravelBeforeBounce: number = 2,
): PathStep[] | null {
  if (depth > 20) return null; // safety

  const path: PathStep[] = [];
  let r = row;
  let c = col;
  let d = dir;
  let stepsSinceBounce = 0;

  while (true) {
    // Out of bounds
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;

    // Reached the target coal!
    if (r === targetRow && c === targetCol) {
      path.push({ row: r, col: c }); // coal cell — no mirror
      return path;
    }

    const key = `${r},${c}`;

    // Cell already used by another object (but not a path cell of THIS laser — allow sharing empty path)
    if (usedCells.has(key) && !pathCells.has(key)) {
      // Blocked by another object — can't route through
      return null;
    }

    path.push({ row: r, col: c });

    // ✅ BUG-024 FIX: Only attempt a bounce after travelling minTravelBeforeBounce
    // cells. On subsequent bounces (depth > 0), require at least 1 step between
    // mirrors so they're not placed adjacent to each other.
    const travelRequired = depth === 0 ? minTravelBeforeBounce : 1;
    const canBounceHere = stepsSinceBounce >= travelRequired;

    // Check if we can place a mirror here to redirect toward target
    if (bouncesRemaining > 0 && canBounceHere) {
      // Can we reach target with a bounce here?
      const mirror = getMirrorForRedirect(r, c, d, targetRow, targetCol, gridSize, usedCells, pathCells);
      if (mirror) {
        const newDir = mirror.type === 'mirror-/' ? reflectSlash(d) : reflectBackslash(d);
        const [nextR, nextC] = stepCoords(r, c, newDir);
        const subPath = traceRoute(
          nextR, nextC,
          newDir,
          targetRow, targetCol,
          gridSize, usedCells,
          new Set([...pathCells, key]),
          bouncesRemaining - 1,
          depth + 1,
          1, // subsequent bounces just need 1 step between them
        );
        if (subPath) {
          path[path.length - 1].mirrorType = mirror.type;
          return [...path, ...subPath];
        }
      }
    }

    stepsSinceBounce++;
    const next = step(r, c, d);
    r = next.row;
    c = next.col;
  }
}

function stepCoords(row: number, col: number, dir: Direction): [number, number] {
  const n = step(row, col, dir);
  return [n.row, n.col];
}

/**
 * Given a current position and direction, determine if placing a mirror here
 * can redirect the laser toward the target in a straight line.
 */
function getMirrorForRedirect(
  row: number,
  col: number,
  inDir: Direction,
  targetRow: number,
  targetCol: number,
  gridSize: number,
  usedCells: Set<string>,
  pathCells: Set<string>,
): { type: 'mirror-/' | 'mirror-\\' } | null {
  const key = `${row},${col}`;
  if (usedCells.has(key) && !pathCells.has(key)) return null;

  // Try both mirror types
  for (const type of ['mirror-/', 'mirror-\\'] as const) {
    const newDir = type === 'mirror-/' ? reflectSlash(inDir) : reflectBackslash(inDir);

    // Check if target is reachable in the new direction from next cell
    const next = step(row, col, newDir);
    if (isAligned(next.row, next.col, newDir, targetRow, targetCol, gridSize)) {
      return { type };
    }
  }
  return null;
}

/**
 * Returns true if (row, col) traveling in dir will reach (targetRow, targetCol)
 * in a straight line without leaving the grid.
 */
function isAligned(
  row: number,
  col: number,
  dir: Direction,
  targetRow: number,
  targetCol: number,
  gridSize: number,
): boolean {
  let r = row;
  let c = col;
  while (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
    if (r === targetRow && c === targetCol) return true;
    const n = step(r, c, dir);
    r = n.row;
    c = n.col;
  }
  return false;
}

// ─── Fallback puzzle ──────────────────────────────────────────────────────────

/**
 * ✅ BUG-024 FIX: Replaced the old generateTrivialPuzzle (which was a straight
 * shot requiring zero mirror taps) with a guaranteed 1-bounce puzzle.
 *
 * Layout (any gridSize ≥ 5):
 *   - Miner fires RIGHT from the left edge at row 1
 *   - Mirror at (1, midCol) deflects the laser DOWN
 *   - Coal at (gridSize-2, midCol) — must be hit going down
 *   - Two decoy mirrors placed off the path in wrong orientation
 *
 * The player must tap the mirror at (1, midCol) to solve — always 1 real tap.
 * This is the minimum acceptable puzzle complexity.
 */
function generateFallbackPuzzle(gridSize: number, gameLevel: number): PuzzleConfig {
  const grid = buildEmptyGrid(gridSize);
  const midCol = Math.floor(gridSize / 2);
  const minerRow = 1;
  const coalRow = gridSize - 2;

  // Coal target
  grid[coalRow][midCol] = {
    row: coalRow, col: midCol,
    type: 'coal', coalIndex: 0, isHit: false,
  };

  // Solution mirror at (minerRow, midCol) — deflects laser from right to down.
  // Correct orientation is 'mirror-\' (backslash: right→down).
  // We start it in WRONG orientation ('mirror-/') so the player must tap it.
  grid[minerRow][midCol] = {
    row: minerRow, col: midCol,
    type: 'mirror-/', // wrong — player must tap to flip to '\'
    rotations: 0,
  };

  // Decoy mirror 1 — off the laser path, wrong orientation
  const decoy1Row = coalRow;
  const decoy1Col = midCol === gridSize - 2 ? midCol - 2 : midCol + 2;
  if (decoy1Col >= 0 && decoy1Col < gridSize) {
    grid[decoy1Row][decoy1Col] = {
      row: decoy1Row, col: decoy1Col,
      type: 'mirror-\\', rotations: 0,
    };
  }

  // Decoy mirror 2 — off the laser path, wrong orientation
  const decoy2Row = minerRow === 0 ? 2 : 0;
  if (decoy2Row !== coalRow) {
    grid[decoy2Row][Math.floor(gridSize / 3)] = {
      row: decoy2Row, col: Math.floor(gridSize / 3),
      type: 'mirror-/', rotations: 0,
    };
  }

  const miners: MinerConfig[] = [{
    edge: 'left',
    position: minerRow,
    fireDirection: 'right',
    color: 'red',
    coalIndex: 0,
  }];

  return {
    gridSize,
    grid,
    miners,
    targetCount: 1,
    difficulty: getDifficultyLabel(gameLevel),
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Calculate score after a win.
 */
export function calculateScore(params: {
  gameLevel: number;
  targetCount: number;
  timeRemaining: number;
  timeLimit: number;
  tapsUsed: number;
  tapLimit: number | null;
  livesLost: number;
  fireAttempts: number;
}): ScoreResult {
  const {
    gameLevel,
    targetCount,
    timeRemaining,
    timeLimit,
    tapsUsed,
    tapLimit,
    livesLost,
    fireAttempts,
  } = params;

  // Base: 500 pts per coal target × level multiplier
  const base = targetCount * 500 * (1 + gameLevel * 0.05);

  // Time bonus: up to 300 pts for time remaining
  const timeRatio = Math.max(0, timeRemaining / timeLimit);
  const timeBonus = Math.round(300 * timeRatio);

  // Perfect first-fire bonus
  const perfectBonus = fireAttempts === 1 ? 200 : 0;

  // Lives lost penalty
  const livesPenalty = livesLost * 150;

  const total = Math.max(100, Math.round(base + timeBonus + perfectBonus - livesPenalty));

  // XP: 10–50 per game scaled by level and performance
  const xpEarned = Math.round(
    Math.min(50, Math.max(10, 10 + gameLevel * 0.5 + timeBonus * 0.05 - livesLost * 3))
  );

  // TB: 5–25
  const tbEarned = Math.round(
    Math.min(25, Math.max(5, 5 + gameLevel * 0.2 + (perfectBonus > 0 ? 5 : 0)))
  );

  return { base: Math.round(base), timeBonus, perfectBonus, livesPenalty, total, xpEarned, tbEarned };
}

// ─── Utility exports ─────────────────────────────────────────────────────────

/**
 * Return a deep clone of the grid (for resetting after failed fire).
 */
export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map(row => row.map(cell => ({ ...cell })));
}

/**
 * Apply hit states to grid cells based on fire results.
 * Returns new grid with isHit set on successfully-targeted coals.
 */
export function applyHitStates(grid: Cell[][], results: LaserResult[]): Cell[][] {
  const newGrid = cloneGrid(grid);
  for (const result of results) {
    if (result.hitTarget) {
      const lastSeg = result.segments[result.segments.length - 1];
      if (lastSeg) {
        newGrid[lastSeg.row][lastSeg.col].isHit = true;
      }
    }
  }
  return newGrid;
}
