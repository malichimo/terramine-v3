// utils/GoldRushEngine.ts
// Pure logic engine for the Gold Rush puzzle game

export type TileType = 'straight' | 'curve' | 't-junction' | 'cross' | 'dead-end' | 'grass';
export type Direction = 'N' | 'S' | 'E' | 'W';
export type Rotation = 0 | 90 | 180 | 270;

export interface TileConnections {
  N: boolean; S: boolean; E: boolean; W: boolean;
}

export interface GameTile {
  type: TileType;
  rotation: Rotation;
  correctRotation: Rotation;
  row: number;
  col: number;
  isStart: boolean;
  isEnd: boolean;
  isOnPath: boolean;
  isSolutionPath: boolean;
}

export interface PuzzleConfig {
  gridSize: number;
  tiles: GameTile[][];
  startCell: { row: number; col: number };
  endCell: { row: number; col: number };
}

// ─── Base connections at rotation=0 ──────────────────────────────────────────
const BASE: Record<TileType, TileConnections> = {
  straight:     { N: true,  S: true,  E: false, W: false },  // vertical ║
  curve:        { N: false, S: true,  E: true,  W: false },  // corner ╰
  't-junction': { N: true,  S: false, E: true,  W: true  },  // T shape ╦ (closed=S at rot=0)
  cross:        { N: true,  S: true,  E: true,  W: true  },  // plus ╬
  'dead-end':   { N: false, S: true,  E: false, W: false },  // dead end ╹
  grass:        { N: false, S: false, E: false, W: false },
};

const OPP: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIRS: Direction[] = ['N', 'S', 'E', 'W'];

// Correct rotation lookup tables
// straight at rot=0 opens N+S (vertical). rot=90 opens E+W (horizontal).
const STRAIGHT_ROT: Record<string, Rotation> = {
  'N,S': 0, 'S,N': 0,
  'E,W': 90, 'W,E': 90,
};
// curve at rot=0 opens S+E. Rotate clockwise to get other corners.
const CURVE_ROT: Record<string, Rotation> = {
  'S,E': 0,   'E,S': 0,
  'S,W': 90,  'W,S': 90,
  'N,W': 180, 'W,N': 180,
  'N,E': 270, 'E,N': 270,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function adj(row: number, col: number, dir: Direction) {
  if (dir === 'N') return { row: row - 1, col };
  if (dir === 'S') return { row: row + 1, col };
  if (dir === 'E') return { row, col: col + 1 };
  return { row, col: col - 1 };
}

function dirBetween(
  from: { row: number; col: number },
  to:   { row: number; col: number }
): Direction {
  if (to.row < from.row) return 'N';
  if (to.row > from.row) return 'S';
  return to.col > from.col ? 'E' : 'W';
}

// ─── Public: connections ──────────────────────────────────────────────────────
export function rotateConnections(base: TileConnections, rotation: Rotation): TileConnections {
  let c = { ...base };
  for (let i = 0; i < rotation / 90; i++) c = { N: c.W, E: c.N, S: c.E, W: c.S };
  return c;
}

export function getTileConnections(tile: GameTile): TileConnections {
  return rotateConnections(BASE[tile.type], tile.rotation);
}

function tileOpens(tile: GameTile, dir: Direction): boolean {
  return getTileConnections(tile)[dir];
}

// ─── BFS path finding ─────────────────────────────────────────────────────────
// Works purely on road-tile connectivity. Start and end are grass tiles on
// the outer columns — the BFS operates only on inner tiles (col 1..gs-2).
// A path exists when:
//   - tiles[start.row][1] opens West AND tiles[end.row][gs-2] opens East
//   - There is a connected road from (start.row, 1) to (end.row, gs-2)
export function findPath(
  tiles: GameTile[][],
  start: { row: number; col: number },
  end:   { row: number; col: number }
): Array<{ row: number; col: number }> | null {
  const gs = tiles.length;
  const entryRow = start.row;
  const exitRow  = end.row;
  const entryCol = 1;
  const exitCol  = gs - 2;

  // Guard: 1-wide inner grid (gs=3) — entry and exit are the same column
  if (entryCol > exitCol) return null;

  // The entry tile must open West (toward start grass)
  if (!tileOpens(tiles[entryRow][entryCol], 'W')) return null;
  // The exit tile must open East (toward end grass)
  if (!tileOpens(tiles[exitRow][exitCol], 'E')) return null;

  const visited = Array.from({ length: gs }, () => Array(gs).fill(false));
  const parent: Record<string, string | null> = {};
  const key = (r: number, c: number) => `${r},${c}`;

  const entry = { row: entryRow, col: entryCol };
  const exit  = { row: exitRow,  col: exitCol  };

  visited[entry.row][entry.col] = true;
  parent[key(entry.row, entry.col)] = null;
  const queue = [entry];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.row === exit.row && cur.col === exit.col) {
      const inner: Array<{ row: number; col: number }> = [];
      let k: string | null = key(exit.row, exit.col);
      while (k !== null) {
        const [r, c] = k.split(',').map(Number);
        inner.unshift({ row: r, col: c });
        k = parent[k] ?? null;
      }
      return [start, ...inner, end];
    }
    for (const dir of DIRS) {
      const { row: nr, col: nc } = adj(cur.row, cur.col, dir);
      if (nr < 0 || nr >= gs || nc < 0 || nc >= gs) continue;
      if (nc < entryCol || nc > exitCol) continue;  // stay in inner columns
      if (visited[nr][nc]) continue;
      // Both tiles must mutually open toward each other
      if (!tileOpens(tiles[cur.row][cur.col], dir)) continue;
      if (!tileOpens(tiles[nr][nc], OPP[dir])) continue;
      visited[nr][nc] = true;
      parent[key(nr, nc)] = key(cur.row, cur.col);
      queue.push({ row: nr, col: nc });
    }
  }
  return null;
}

export function markPath(
  tiles: GameTile[][],
  path: Array<{ row: number; col: number }>
): GameTile[][] {
  const out = tiles.map(row => row.map(t => ({ ...t, isOnPath: false })));
  for (const { row, col } of path) out[row][col] = { ...out[row][col], isOnPath: true };
  return out;
}

export function rotateTile(tile: GameTile): GameTile {
  return { ...tile, rotation: ((tile.rotation + 90) % 360) as Rotation };
}

// ─── GoldRush grid sizing ─────────────────────────────────────────────────────
export function getGoldRushGridSize(gameLevel: number): number {
  if (gameLevel <= 15) return 4;
  if (gameLevel <= 35) return 5;
  return 6;
}

// ─── Puzzle generation ────────────────────────────────────────────────────────
//
// Layout:
//   col 0      = start grass (leprechaun), random row
//   col 1..n-2 = inner road grid (path + decoys)
//   col n-1    = end grass (pot of gold), random row
//
// TILE PROGRESSION (answer to your question — YES, intentional):
//   Levels  1-10: solution uses straight+curve only. Decoys: straight, curve
//   Levels 11-25: same solution tiles. Decoys add t-junction
//   Levels 26+:   same solution tiles. Decoys add dead-end
// The solution path is always straight+curve because those are the only tile
// types needed to make any path. The other tiles appear as red herrings.
//
export function generatePuzzle(gridSize: number, gameLevel: number): PuzzleConfig {
  const pickRows = () => {
    const startRow = Math.floor(Math.random() * gridSize);
    if (Math.random() < 0.25) {
      return { startRow, endRow: startRow };
    }
    const others = Array.from({ length: gridSize }, (_, i) => i).filter(i => i !== startRow);
    return { startRow, endRow: others[Math.floor(Math.random() * others.length)] };
  };

  // Try different-row puzzles first (75% of budget)
  for (let attempt = 0; attempt < 300; attempt++) {
    const { startRow, endRow } = pickRows();

    const startCell = { row: startRow, col: 0 };
    const endCell   = { row: endRow,   col: gridSize - 1 };
    const tiles     = makeGrid(gridSize, startCell, endCell);
    const path      = carvePath(gridSize, startRow, endRow);
    if (!path) continue;

    assignSolutionPath(tiles, path);
    fillDecoys(tiles, gridSize, gameLevel);

    if (isSolvable(tiles, startCell, endCell)) {
      return { gridSize, tiles, startCell, endCell };
    }
  }

  // Fallback: force a different-row straight path (never same row)
  return buildFallback(gridSize, gameLevel);
}

// ─── Grid factory ─────────────────────────────────────────────────────────────
function makeGrid(
  gs: number,
  startCell: { row: number; col: number },
  endCell:   { row: number; col: number }
): GameTile[][] {
  return Array.from({ length: gs }, (_, r) =>
    Array.from({ length: gs }, (_, c) => ({
      type:            'grass' as TileType,
      rotation:        0 as Rotation,
      correctRotation: 0 as Rotation,
      row: r, col: c,
      isStart:        r === startCell.row && c === startCell.col,
      isEnd:          r === endCell.row   && c === endCell.col,
      isOnPath:       false,
      isSolutionPath: false,
    }))
  );
}

// ─── Path carver ──────────────────────────────────────────────────────────────
function carvePath(
  gs: number,
  startRow: number,
  endRow: number
): Array<{ row: number; col: number }> | null {
  const col1    = 1;
  const colLast = gs - 2;

  // Same-row: simple straight horizontal path, always works
  if (startRow === endRow) {
    return Array.from(
      { length: colLast - col1 + 1 },
      (_, i) => ({ row: startRow, col: col1 + i })
    );
  }

  // Different-row: winding path that MUST reach a different end row
  // Require at least 2 turns so it's never visually trivial
  const minTurns = 2;

  for (let attempt = 0; attempt < 400; attempt++) {
    const path: Array<{ row: number; col: number }> = [{ row: startRow, col: col1 }];
    const seen = new Set([`${startRow},${col1}`]);
    let cur = { row: startRow, col: col1 };
    let lastDir: string | null = null;
    let turns = 0;
    let stuck = false;

    for (let step = 0; step < gs * gs * 6; step++) {
      if (cur.row === endRow && cur.col === colLast) break;

      const rowDiff   = endRow  - cur.row;
      const colDiff   = colLast - cur.col;
      const manhattan = Math.abs(rowDiff) + Math.abs(colDiff);
      const stepsLeft = gs * gs * 6 - step;

      // Once manhattan distance fills remaining steps we must go direct
      const mustGoDirect = manhattan >= stepsLeft;

      const moves = [
        { dr: 0,  dc: 1,  dir: 'E' },
        { dr: 0,  dc: -1, dir: 'W' },
        { dr: 1,  dc: 0,  dir: 'S' },
        { dr: -1, dc: 0,  dir: 'N' },
      ];

      const candidates: Array<{ row: number; col: number; w: number }> = [];

      for (const { dr, dc, dir } of moves) {
        const nr = cur.row + dr;
        const nc = cur.col + dc;
        if (nr < 0 || nr >= gs) continue;
        if (nc < col1 || nc > colLast) continue;
        if (seen.has(`${nr},${nc}`)) continue;

        if (mustGoDirect) {
          if (dc > 0 && colDiff <= 0) continue;
          if (dc < 0 && colDiff >= 0) continue;
          if (dr > 0 && rowDiff <= 0) continue;
          if (dr < 0 && rowDiff >= 0) continue;
        }

        const isTurn = lastDir !== null && dir !== lastDir;
        const needsTurns = turns < minTurns;

        let w: number;
        if (mustGoDirect) {
          w = 4;
        } else if (needsTurns) {
          // Encourage vertical movement and direction changes
          if (isTurn && dr !== 0) w = 8;
          else if (isTurn)        w = 5;
          else if (dr !== 0)      w = 4;
          else if (dc > 0)        w = 1;
          else                    w = 2;
        } else {
          // Enough turns — loosely bias toward exit
          if (dc > 0 && colDiff > 0)                                          w = 4;
          else if (dr !== 0 && Math.sign(dr) === Math.sign(rowDiff))          w = 3;
          else                                                                  w = 2;
        }

        candidates.push({ row: nr, col: nc, w });
      }

      if (candidates.length === 0) { stuck = true; break; }

      const pool: Array<{ row: number; col: number }> = [];
      for (const c of candidates) for (let i = 0; i < c.w; i++) pool.push({ row: c.row, col: c.col });
      const next = pool[Math.floor(Math.random() * pool.length)];

      const nextDir = next.col > cur.col ? 'E' : next.col < cur.col ? 'W' : next.row > cur.row ? 'S' : 'N';
      if (lastDir !== null && nextDir !== lastDir) turns++;
      lastDir = nextDir;

      seen.add(`${next.row},${next.col}`);
      path.push(next);
      cur = next;
    }

    if (!stuck && cur.row === endRow && cur.col === colLast && turns >= minTurns) {
      return path;
    }
  }

  return null; // signal failure — caller will retry with new rows
}

// ─── Assign tile types + correct rotations to solution path ───────────────────
// fromSide = which side of this tile the path ENTERS (opposite of travel direction)
// toSide   = which side of this tile the path EXITS  (same as travel direction to next)
// A straight tile has fromSide === OPP[toSide] (passes straight through)
// A curve tile turns 90° (fromSide !== toSide and fromSide !== OPP[toSide])
function assignSolutionPath(
  tiles: GameTile[][],
  path: Array<{ row: number; col: number }>
): void {
  const allRots: Rotation[] = [0, 90, 180, 270];

  for (let i = 0; i < path.length; i++) {
    const { row, col } = path[i];

    // The side this tile is ENTERED from = opposite of the travel direction to reach it
    const fromSide: Direction = i === 0
      ? 'W'  // first tile: path enters from the West (from start grass)
      : OPP[dirBetween(path[i - 1], path[i])];  // opposite of travel direction

    // The side this tile EXITS toward = travel direction to the next tile
    const toSide: Direction = i === path.length - 1
      ? 'E'  // last tile: path exits East (toward end grass)
      : dirBetween(path[i], path[i + 1]);  // travel direction to next

    let type: TileType;
    let correctRotation: Rotation;

    if (fromSide === OPP[toSide]) {
      // Passes straight through (e.g. enters W, exits E = horizontal straight)
      type            = 'straight';
      correctRotation = STRAIGHT_ROT[`${fromSide},${toSide}`] ?? 90;
    } else {
      // Turns 90° (e.g. enters W, exits S = curve)
      type            = 'curve';
      correctRotation = CURVE_ROT[`${fromSide},${toSide}`] ?? 0;
    }

    // Scramble to a wrong rotation so player must fix it
    const wrong    = allRots.filter(r => r !== correctRotation);
    const startRot = wrong[Math.floor(Math.random() * wrong.length)];

    tiles[row][col] = {
      ...tiles[row][col],
      type,
      rotation:        startRot,
      correctRotation: correctRotation,
      isSolutionPath:  true,
    };
  }
}

// ─── Fill decoys ──────────────────────────────────────────────────────────────
// Tile type progression (your question — intentional design):
//   Level  1-10: straight + curve only (learn the basics)
//   Level 11-25: adds t-junction (more complex intersections)
//   Level 26+:   adds dead-end (maximum misdirection)
function fillDecoys(tiles: GameTile[][], gs: number, gameLevel: number): void {
  const chance = Math.min(0.7, 0.3 + gameLevel * 0.01);
  const pool: TileType[] =
    gameLevel <= 10 ? ['straight', 'curve'] :
    gameLevel <= 25 ? ['straight', 'curve', 't-junction'] :
                      ['straight', 'curve', 't-junction', 'dead-end'];
  const rots: Rotation[] = [0, 90, 180, 270];

  for (let r = 0; r < gs; r++) {
    for (let c = 1; c <= gs - 2; c++) {
      const t = tiles[r][c];
      if (t.isSolutionPath || t.isStart || t.isEnd) continue;
      if (Math.random() < chance) {
        tiles[r][c] = {
          ...t,
          type:            pool[Math.floor(Math.random() * pool.length)],
          rotation:        rots[Math.floor(Math.random() * 4)],
          correctRotation: 0,
        };
      }
    }
  }
}

// ─── Solvability check ────────────────────────────────────────────────────────
// Temporarily applies correctRotation to all solution tiles, then runs findPath.
// This confirms the puzzle CAN be solved (regardless of current scrambled state).
function isSolvable(
  tiles: GameTile[][],
  start: { row: number; col: number },
  end:   { row: number; col: number }
): boolean {
  const solved = tiles.map(row =>
    row.map(t => ({ ...t, rotation: t.isSolutionPath ? t.correctRotation : t.rotation }))
  );
  return findPath(solved, start, end) !== null;
}

// ─── Fallback: L-shaped path between different rows ───────────────────────────
// Only fires if carvePath fails 300 times (extremely rare).
// Always uses different rows so the 25% same-row rule is never broken by fallback.
function buildFallback(gs: number, gameLevel: number): PuzzleConfig {
  const startRow = Math.floor(Math.random() * gs);
  const others   = Array.from({ length: gs }, (_, i) => i).filter(i => i !== startRow);
  const endRow   = others[Math.floor(Math.random() * others.length)];

  const startCell = { row: startRow, col: 0 };
  const endCell   = { row: endRow,   col: gs - 1 };
  const tiles     = makeGrid(gs, startCell, endCell);
  const col1      = 1;
  const colLast   = gs - 2;
  const wrongRots: Rotation[] = [0, 180];

  // L-shaped path: go right on startRow, then drop down to endRow, then right to end
  const midCol = Math.floor((col1 + colLast) / 2);
  const path: Array<{ row: number; col: number }> = [];

  // Horizontal segment on startRow: col1 → midCol
  for (let c = col1; c <= midCol; c++) path.push({ row: startRow, col: c });
  // Vertical segment: startRow → endRow at midCol
  const step = endRow > startRow ? 1 : -1;
  for (let r = startRow + step; r !== endRow + step; r += step) path.push({ row: r, col: midCol });
  // Horizontal segment on endRow: midCol+1 → colLast
  for (let c = midCol + 1; c <= colLast; c++) path.push({ row: endRow, col: c });

  assignSolutionPath(tiles, path);
  fillDecoys(tiles, gs, gameLevel);
  return { gridSize: gs, tiles, startCell, endCell };
}

// ─── Score & labels ───────────────────────────────────────────────────────────
export function calculateScore(
  timeRemaining: number,
  timeLimit:     number,
  totalTaps:     number,
  won:           boolean
): number {
  if (!won) return 0;
  return 300 + Math.floor((timeRemaining / timeLimit) * 500) + Math.max(0, 200 - totalTaps * 5);
}

export function getDifficultyLabel(gameLevel: number): string {
  if (gameLevel <= 10) return 'Novice';
  if (gameLevel <= 25) return 'Apprentice';
  if (gameLevel <= 50) return 'Expert';
  return 'Master';
}
