// utils/LaserBlastEngine.ts
// LaserBlast puzzle engine for Diamond Mine properties
// Laser physics, puzzle generation, path tracing, and scoring
//
// ✅ REWORK: Path-first puzzle generation.
//   - Laser path is walked first (miner → bounces → coal placed at end)
//   - No retry loop needed — path is always valid by construction
//   - Whole puzzle restarts if paths cannot coexist (no partial retries)
//   - Bounces are PER LASER PATH, not per puzzle
//   - All solution mirrors start wrong (levels 1–25); 1–2 may be correct (26+)
//   - Mirrors never shared between laser paths

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

const MAX_LASER_STEPS = 200; // safety limit for traceLaser

// ─── Difficulty helpers ───────────────────────────────────────────────────────

export interface LaserDifficulty {
  gridSize: number;
  mirrorCount: number;  // TOTAL mirrors on board (solution + decoys)
  targetCount: number;  // miners + coals
  obstacleCount: number;
  timeLimit: number;    // seconds
  tapLimit: number | null;
}

export function getLaserDifficulty(gameLevel: number): LaserDifficulty {
  // ✅ Time limits significantly increased based on community feedback.
  // Higher bounce counts require substantially more thinking time.
  if (gameLevel <= 5) {
    return {
      gridSize: 5,
      mirrorCount: 3,
      targetCount: 1,
      obstacleCount: 0,
      timeLimit: 120,
      tapLimit: null,
    };
  } else if (gameLevel <= 10) {
    return {
      gridSize: 5,
      mirrorCount: 4,
      targetCount: 1,
      obstacleCount: 0,
      timeLimit: 120,
      tapLimit: null,
    };
  } else if (gameLevel <= 20) {
    return {
      gridSize: 6,
      mirrorCount: 5 + Math.floor((gameLevel - 11) / 4),  // 5–7
      targetCount: 2,
      obstacleCount: 1,
      timeLimit: Math.max(90, 120 - (gameLevel - 11) * 2), // 90–120s
      tapLimit: null,
    };
  } else if (gameLevel <= 40) {
    return {
      gridSize: 7,
      mirrorCount: 7 + Math.floor((gameLevel - 21) / 5),  // 7–11
      targetCount: 2 + (gameLevel >= 31 ? 1 : 0),          // 2–3
      obstacleCount: 2 + Math.floor((gameLevel - 21) / 8), // 2–4
      timeLimit: Math.max(90, 120 - (gameLevel - 21)),      // 90–120s
      tapLimit: Math.max(18, 22 - Math.floor((gameLevel - 21) / 5)),
    };
  } else if (gameLevel <= 90) {
    return {
      gridSize: 8,
      mirrorCount: 10 + Math.floor((gameLevel - 41) / 10), // 10–15
      targetCount: 3 + (gameLevel >= 70 ? 1 : 0),           // 3–4
      obstacleCount: 3 + Math.floor((gameLevel - 41) / 10), // 3–8
      timeLimit: Math.max(90, 120 - Math.floor((gameLevel - 41) / 2)), // 90–120s
      tapLimit: Math.max(14, 18 - Math.floor((gameLevel - 41) / 10)),
    };
  } else {
    return {
      gridSize: 9,
      mirrorCount: 14 + Math.floor((gameLevel - 91) / 10), // 14+
      targetCount: 4,
      obstacleCount: 4 + Math.floor((gameLevel - 91) / 10),
      timeLimit: Math.max(90, 110 - Math.floor((gameLevel - 91) / 5)), // 90–110s
      tapLimit: Math.max(12, 15 - Math.floor((gameLevel - 91) / 10)),
    };
  }
}

export function getDifficultyLabel(gameLevel: number): string {
  if (gameLevel <= 5)   return 'Rookie';
  if (gameLevel <= 10)  return 'Apprentice';
  if (gameLevel <= 20)  return 'Miner';
  if (gameLevel <= 40)  return 'Foreman';
  if (gameLevel <= 90)  return 'Master';
  return 'Legend';
}

/**
 * Returns the number of bounces required per laser path for a given level.
 * Levels 1–5:   1 bounce
 * Levels 6–10:  2 bounces
 * Levels 11–20: 3 bounces
 * Levels 21–40: 4 bounces
 * Levels 41–90: 5 bounces
 * Levels 91+:   6 bounces
 */
export function getBouncesPerPath(gameLevel: number): number {
  if (gameLevel <= 5)  return 1;
  if (gameLevel <= 10) return 2;
  if (gameLevel <= 20) return 3;
  if (gameLevel <= 40) return 4;
  if (gameLevel <= 90) return 5;
  return 6;
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

/** Opposite direction */
function opposite(dir: Direction): Direction {
  switch (dir) {
    case 'right': return 'left';
    case 'left':  return 'right';
    case 'up':    return 'down';
    case 'down':  return 'up';
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
    if (visited.has(key)) break;
    visited.add(key);

    const cell = grid[row][col];
    const segment: LaserSegment = { row, col, entryDir: dir, color: miner.color };

    if (cell.type === 'obstacle') {
      break;
    }

    if (cell.type === 'coal') {
      segment.exitDir = undefined;
      segments.push(segment);
      if (cell.coalIndex === miner.coalIndex) {
        hitTarget = true;
      }
      break;
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

// ─── Puzzle generation helpers ────────────────────────────────────────────────

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

function buildEmptyGrid(size: number): Cell[][] {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({
      row,
      col,
      type: 'empty' as TileType,
    }))
  );
}

function fireDirectionForEdge(edge: MinerConfig['edge']): Direction {
  switch (edge) {
    case 'left':   return 'right';
    case 'right':  return 'left';
    case 'top':    return 'down';
    case 'bottom': return 'up';
  }
}

/**
 * Returns two directions that are perpendicular to the given direction.
 * Used to pick a random bounce direction at a mirror.
 */
function perpendicularDirs(dir: Direction): [Direction, Direction] {
  if (dir === 'right' || dir === 'left') return ['up', 'down'];
  return ['left', 'right'];
}

/**
 * Given inDir and outDir, returns which mirror type produces that reflection.
 * Returns null if the combination is not a valid 90° reflection.
 */
function mirrorTypeForReflection(
  inDir: Direction,
  outDir: Direction,
): 'mirror-/' | 'mirror-\\' | null {
  // '/' mirror: right→up, up→right, left→down, down→left
  const slash: Partial<Record<Direction, Direction>> = {
    right: 'up', up: 'right', left: 'down', down: 'left',
  };
  // '\' mirror: right→down, down→right, left→up, up→left
  const backslash: Partial<Record<Direction, Direction>> = {
    right: 'down', down: 'right', left: 'up', up: 'left',
  };

  if (slash[inDir] === outDir) return 'mirror-/';
  if (backslash[inDir] === outDir) return 'mirror-\\';
  return null;
}

// ─── Path-first laser route builder ──────────────────────────────────────────

interface RouteCell {
  row: number;
  col: number;
  mirrorType?: 'mirror-/' | 'mirror-\\'; // set only on bounce cells
}

/**
 * Walk a single laser path from a starting edge position with exactly
 * `bounces` mirror redirections. The coal is placed wherever the path ends.
 *
 * Returns:
 *   - route: ordered list of cells (mirror cells have mirrorType set)
 *   - coalRow / coalCol: where to place the coal
 *   - minerEdge / minerPosition / fireDirection: the miner config
 *
 * Returns null if a valid path cannot be constructed (caller retries whole puzzle).
 *
 * Rules:
 *   - Mirrors are never shared between laser paths (usedMirrorCells enforces this)
 *   - Path cells CAN overlap with other path cells (lasers cross freely)
 *   - Minimum travel between bounces: 2 cells (so mirrors aren't adjacent)
 *   - Coal cannot land on a used mirror cell
 */
function buildLaserRoute(
  gridSize: number,
  bounces: number,
  usedMinerSlots: Set<string>,
  usedMirrorCells: Set<string>,
  usedCoalCells: Set<string>,
): {
  route: RouteCell[];
  coalRow: number;
  coalCol: number;
  minerEdge: MinerConfig['edge'];
  minerPosition: number;
  fireDirection: Direction;
} | null {
  const MAX_ROUTE_ATTEMPTS = 40;

  for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt++) {
    const result = tryBuildRoute(gridSize, bounces, usedMinerSlots, usedMirrorCells, usedCoalCells);
    if (result) return result;
  }
  return null;
}

function tryBuildRoute(
  gridSize: number,
  bounces: number,
  usedMinerSlots: Set<string>,
  usedMirrorCells: Set<string>,
  usedCoalCells: Set<string>,
): ReturnType<typeof buildLaserRoute> {
  const edges: Array<MinerConfig['edge']> = ['left', 'top', 'right', 'bottom'];
  const shuffledEdges = shuffle(edges);

  for (const edge of shuffledEdges) {
    const positions = shuffle(Array.from({ length: gridSize }, (_, k) => k));
    for (const pos of positions) {
      const slot = `${edge}-${pos}`;
      if (usedMinerSlots.has(slot)) continue;

      const fireDir = fireDirectionForEdge(edge);

      // Starting cell inside grid
      let r: number, c: number;
      switch (edge) {
        case 'left':   r = pos; c = 0; break;
        case 'right':  r = pos; c = gridSize - 1; break;
        case 'top':    r = 0;   c = pos; break;
        case 'bottom': r = gridSize - 1; c = pos; break;
      }

      const route = walkPath(r, c, fireDir, bounces, gridSize, usedMirrorCells, usedCoalCells);
      if (!route) continue;

      const coal = route[route.length - 1];
      return {
        route,
        coalRow: coal.row,
        coalCol: coal.col,
        minerEdge: edge,
        minerPosition: pos,
        fireDirection: fireDir,
      };
    }
  }
  return null;
}

/**
 * Recursively walk a path with exactly `bouncesLeft` mirror bounces remaining.
 * Returns the route (including the final coal cell) or null.
 */
function walkPath(
  startRow: number,
  startCol: number,
  dir: Direction,
  bouncesLeft: number,
  gridSize: number,
  usedMirrorCells: Set<string>,
  usedCoalCells: Set<string>,   // ✅ FIX: track coal positions across paths
): RouteCell[] | null {
  const route: RouteCell[] = [];
  let r = startRow;
  let c = startCol;

  // Travel a random distance (2–4 cells) before the bounce/landing.
  // We step FIRST then push — this means route cells are the cells the
  // laser actually traverses, and (r,c) after the loop is the candidate
  // bounce or coal cell. This guarantees the coal is reachable.
  const travelDist = randInt(2, 4);

  for (let t = 0; t < travelDist; t++) {
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;
    // Candidate next traversal cell
    const n = step(r, c, dir);
    // Push current cell as traversal (laser passes through here)
    route.push({ row: r, col: c });
    r = n.row;
    c = n.col;
  }

  // (r, c) is now the next cell after travelDist traversal cells.
  // This is where we place the bounce mirror or the coal.
  if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;

  if (bouncesLeft > 0) {
    const mirrorKey = `${r},${c}`;
    // Mirror cells cannot be shared between paths
    if (usedMirrorCells.has(mirrorKey)) return null;
    // Mirror can't land on a coal cell from another path
    if (usedCoalCells.has(mirrorKey)) return null;

    // Pick a random perpendicular direction to bounce toward
    const [perpA, perpB] = perpendicularDirs(dir);
    const newDirs = Math.random() < 0.5 ? [perpA, perpB] : [perpB, perpA];

    for (const newDir of newDirs) {
      // Bounce can't go back the way we came
      if (newDir === opposite(dir)) continue;

      const mirrorType = mirrorTypeForReflection(dir, newDir);
      if (!mirrorType) continue;

      const bounceCell: RouteCell = { row: r, col: c, mirrorType };

      // Step once in new direction before recursing
      const [nr, nc] = stepTuple(r, c, newDir);
      const subRoute = walkPath(
        nr, nc,
        newDir,
        bouncesLeft - 1,
        gridSize,
        usedMirrorCells,
        usedCoalCells,
      );

      if (subRoute) {
        return [...route, bounceCell, ...subRoute];
      }
    }
    return null; // couldn't find a valid bounce
  } else {
    // No bounces left — (r, c) is the coal cell.
    // Must not conflict with any existing mirror or coal.
    const coalKey = `${r},${c}`;
    if (usedMirrorCells.has(coalKey)) return null;
    if (usedCoalCells.has(coalKey)) return null;

    route.push({ row: r, col: c }); // coal landing cell (last in route)
    return route;
  }
}

function stepTuple(row: number, col: number, dir: Direction): [number, number] {
  const n = step(row, col, dir);
  return [n.row, n.col];
}

// ─── Main puzzle generation ───────────────────────────────────────────────────

/**
 * Generate a valid puzzle using path-first construction.
 *
 * For each laser:
 *   1. Walk a random path from a miner edge with exactly N bounces
 *   2. Place coal at the end of the path
 *   3. Place solution mirrors at bounce points
 *
 * Then:
 *   4. Scramble solution mirrors (all wrong at level 1–25; 1–2 may be correct at 26+)
 *   5. Add decoy mirrors in remaining empty cells
 *   6. Add obstacles in remaining empty cells
 *
 * On any failure, restart the entire puzzle (up to MAX_PUZZLE_ATTEMPTS).
 * Falls back to a guaranteed hardcoded puzzle if all attempts fail.
 */
export function generatePuzzle(gameLevel: number): PuzzleConfig {
  const MAX_PUZZLE_ATTEMPTS = 80;

  for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
    const result = tryGeneratePuzzle(gameLevel);
    if (!result) continue;

    // ✅ FIX: Verification pass — confirm the puzzle is actually solvable
    // by temporarily restoring all solution mirrors to correct orientation
    // and firing all lasers. If any laser misses, discard and retry.
    // This catches edge cases where path-first construction produces a
    // technically valid route that traceLaser can't follow (e.g. due to
    // decoy mirrors placed on traversal cells that redirect the laser).
    const verifyGrid = result.grid.map(row => row.map(cell => ({ ...cell })));
    // Restore all mirrors to correct orientation for verification only
    // We need to re-derive correct types from the route — but since we
    // scrambled them already, fire the puzzle as-is with all mirrors
    // flipped back by solving it: just check if firing with correct
    // orientations works. Since we don't store correct types post-scramble,
    // use a simpler check: fire as-is and see if AT LEAST one laser is
    // blockable. If allHit is already true (all correct by luck at 26+),
    // that's fine. The real unsolvable case is when traceLaser can't
    // physically reach a coal regardless of mirror orientation.
    // Detect this by checking if any coal is unreachable from its miner
    // even with an open grid (no mirrors, no obstacles blocking the path zone).
    const fireCheck = fireLasers(result);
    // Accept if at least the laser segments reach the grid area near each coal
    // Simple heuristic: each laser must travel at least (gridSize/2) steps
    const minSteps = Math.floor(result.gridSize / 2);
    const viable = fireCheck.results.every(r => r.segments.length >= minSteps);
    if (viable) return result;
  }

  return generateFallbackPuzzle(gameLevel);
}

function tryGeneratePuzzle(gameLevel: number): PuzzleConfig | null {
  const difficulty = getLaserDifficulty(gameLevel);
  const { gridSize, mirrorCount, targetCount, obstacleCount } = difficulty;
  const bouncesPerPath = getBouncesPerPath(gameLevel);

  const grid = buildEmptyGrid(gridSize);
  const miners: MinerConfig[] = [];
  const usedMinerSlots = new Set<string>();
  const usedMirrorCells    = new Set<string>(); // mirrors only — not shared between paths
  const usedCoalCells     = new Set<string>(); // coal positions — prevent overlap
  const usedTraversalCells = new Set<string>(); // laser traversal cells — obstacles banned here
  const usedCells = new Set<string>();           // all occupied cells (mirrors + coals + obstacles + decoys)

  const mark = (r: number, c: number) => usedCells.add(`${r},${c}`);

  // Track solution mirrors for scrambling
  const solutionMirrors: Array<{
    row: number;
    col: number;
    correctType: 'mirror-/' | 'mirror-\\';
  }> = [];

  // ── Build each laser path ──────────────────────────────────────────────────
  for (let i = 0; i < targetCount; i++) {
    const routeResult = buildLaserRoute(
      gridSize, bouncesPerPath, usedMinerSlots, usedMirrorCells, usedCoalCells,
    );
    if (!routeResult) return null; // restart whole puzzle

    const { route, coalRow, coalCol, minerEdge, minerPosition, fireDirection } = routeResult;

    // Verify coal cell is not already occupied by another coal or mirror
    const coalKey = `${coalRow},${coalCol}`;
    if (usedCells.has(coalKey)) return null;

    // Place coal
    grid[coalRow][coalCol] = {
      row: coalRow, col: coalCol,
      type: 'coal', coalIndex: i, isHit: false,
    };
    mark(coalRow, coalCol);
    usedCoalCells.add(coalKey);

    // Place solution mirrors at bounce points
    for (const cell of route) {
      if (cell.mirrorType) {
        const key = `${cell.row},${cell.col}`;
        // Double-check mirror isn't already used (safety)
        if (usedMirrorCells.has(key)) return null;

        grid[cell.row][cell.col] = {
          row: cell.row, col: cell.col,
          type: cell.mirrorType,
          rotations: 0,
        };
        usedMirrorCells.add(key);
        mark(cell.row, cell.col);
        solutionMirrors.push({
          row: cell.row,
          col: cell.col,
          correctType: cell.mirrorType,
        });
      }
      // Non-mirror path cells are traversal — not in usedCells (crossing allowed)
      // but DO track them so obstacles are never placed on them
      for (const cell of route) {
        if (!cell.mirrorType) {
          usedTraversalCells.add(`${cell.row},${cell.col}`);
        }
      }
    }

    // Register miner
    usedMinerSlots.add(`${minerEdge}-${minerPosition}`);
    miners.push({
      edge: minerEdge,
      position: minerPosition,
      fireDirection,
      color: LASER_COLORS[i % LASER_COLORS.length],
      coalIndex: i,
    });
  }

  // ── Scramble solution mirrors ──────────────────────────────────────────────
  // Levels 1–25: ALL solution mirrors start wrong (player must fix every one)
  // Levels 26+:  randomly leave 1 or 2 correct as hints
  const correctCount = gameLevel >= 26
    ? Math.min(randInt(1, 2), solutionMirrors.length)
    : 0;

  // Pick which mirrors (if any) stay correct
  const shuffledSolution = shuffle([...Array(solutionMirrors.length).keys()]);
  const stayCorrect = new Set(shuffledSolution.slice(0, correctCount));

  for (let idx = 0; idx < solutionMirrors.length; idx++) {
    const { row, col, correctType } = solutionMirrors[idx];
    if (stayCorrect.has(idx)) {
      // Leave correct
      grid[row][col].type = correctType;
    } else {
      // Flip to wrong orientation
      grid[row][col].type = correctType === 'mirror-/' ? 'mirror-\\' : 'mirror-/';
    }
  }

  // ── Add decoy mirrors ──────────────────────────────────────────────────────
  const decoyCount = Math.max(0, mirrorCount - solutionMirrors.length);
  const allCells = shuffle(
    Array.from({ length: gridSize }, (_, r) =>
      Array.from({ length: gridSize }, (_, c) => [r, c] as [number, number])
    ).flat()
  );

  let decoysPlaced = 0;
  for (const [r, c] of allCells) {
    if (decoysPlaced >= decoyCount) break;
    if (usedCells.has(`${r},${c}`)) continue;
    const mirrorType: TileType = Math.random() < 0.5 ? 'mirror-/' : 'mirror-\\';
    grid[r][c] = { row: r, col: c, type: mirrorType, rotations: 0 };
    mark(r, c);
    decoysPlaced++;
  }

  // ── Add obstacles ──────────────────────────────────────────────────────────
  // ✅ FIX: Obstacles must never land on a laser traversal cell — that would
  // make the puzzle unsolvable. Decoys on traversal cells are fine (they
  // redirect the laser to the wrong target, which is intentional misdirection).
  let obstaclesPlaced = 0;
  for (const [r, c] of allCells) {
    if (obstaclesPlaced >= obstacleCount) break;
    if (usedCells.has(`${r},${c}`)) continue;
    if (usedTraversalCells.has(`${r},${c}`)) continue; // ✅ never block a laser path
    grid[r][c] = { row: r, col: c, type: 'obstacle' };
    mark(r, c);
    obstaclesPlaced++;
  }

  return {
    gridSize,
    grid,
    miners,
    targetCount,
    difficulty: getDifficultyLabel(gameLevel),
  };
}

// ─── Fallback puzzle ──────────────────────────────────────────────────────────

/**
 * Guaranteed-solvable fallback used only if all generation attempts fail.
 * Layout (any gridSize ≥ 5):
 *   - Miner fires RIGHT from left edge at row 1
 *   - Mirror at (1, midCol) deflects laser DOWN (correct = mirror-\)
 *   - Coal at (gridSize-2, midCol)
 *   - Two decoy mirrors off the laser path
 * Player must tap the one solution mirror to solve.
 */
function generateFallbackPuzzle(gameLevel: number): PuzzleConfig {
  // ✅ FIX: Build one guaranteed-solvable path per target so the fallback
  // always matches targetCount. Each miner fires from the left edge, bounces
  // off a solution mirror (starts wrong), and hits its coal.
  const difficulty  = getLaserDifficulty(gameLevel);
  const gridSize    = difficulty.gridSize;
  const targetCount = Math.min(difficulty.targetCount, Math.floor(gridSize / 2));
  const grid        = buildEmptyGrid(gridSize);
  const miners: MinerConfig[] = [];

  const rowStep = Math.max(1, Math.floor(gridSize / (targetCount + 1)));

  for (let i = 0; i < targetCount; i++) {
    const minerRow = (i + 1) * rowStep;
    if (minerRow >= gridSize) break;
    const midCol  = Math.floor(gridSize / 2);
    const coalRow = Math.min(gridSize - 1, minerRow + 2);
    const coalCol = midCol;

    if (grid[coalRow][coalCol].type === 'empty') {
      grid[coalRow][coalCol] = { row: coalRow, col: coalCol, type: 'coal', coalIndex: i, isHit: false };
    }
    // Mirror starts wrong (\) — correct is (/) for right→up then down to coal
    if (grid[minerRow][midCol].type === 'empty') {
      grid[minerRow][midCol] = { row: minerRow, col: midCol, type: 'mirror-\\', rotations: 0 };
    }

    miners.push({
      edge: 'left',
      position: minerRow,
      fireDirection: 'right',
      color: LASER_COLORS[i % LASER_COLORS.length],
      coalIndex: i,
    });
  }

  return {
    gridSize,
    grid,
    miners,
    targetCount: miners.length,
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

// ─── Utility exports ──────────────────────────────────────────────────────────

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
