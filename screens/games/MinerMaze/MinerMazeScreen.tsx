// screens/games/MinerMaze/MinerMazeScreen.tsx
// TerraMine – Miner Maze  v3
//
// ARCHITECTURE:
//  • Miner is ALWAYS centred on screen — the world translates around him
//  • Maze is large (up to 25×35 cells) — much bigger than the screen
//  • Camera offset = miner pixel position - screen centre
//  • All cells rendered relative to camera offset via a single translated View
//  • Darkness: black View tiles over every non-lit cell (no SVG needed)
//  • Horizontal passage = mine tunnel with timber beams + rock walls
//  • Vertical passage   = shaft with wooden ladder rungs
//  • Image sprites for: floor, timber wall, ladder, water, fire, gas, collapse, exit
//  • Miner image faces direction of travel; flipped horizontally for left
//  • Headlamp cone computed in cell-space; amber tint on lit cells

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Alert, Animated, Easing, ScrollView,
  Image, Platform, StatusBar, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdMobService } from '../../../services/AdMobService';
import { soundService } from '../../../services/SoundService';
import { dbServicePhase2 } from '../../../services/DatabaseServicePhase2';
import { getResourceNames } from '../../../utils/ResourceNames';
import { useAuth } from '../../../contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────
//  SCREEN METRICS
// ─────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');
const STATUS_H   = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44;
const HEADER_H   = STATUS_H + 48;
const HUD_H      = 50;
const VIEWPORT_W = SW;
// VIEWPORT_H: approximate height of the game viewport for camera math
// (header + hud + controls are approx 340px; tab bar ~83px on iOS)
const TAB_BAR_H  = Platform.OS === 'ios' ? 83 : 0;
const APPROX_CHROME = HEADER_H + HUD_H + 175 + TAB_BAR_H; // header+hud+controls approx
const VIEWPORT_H = SH - APPROX_CHROME;

// Cell size — fixed, large enough to show artwork
const SZ = 96;  // larger cells — Mario-style scale

// ─────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────

type Dir = 'up' | 'down' | 'left' | 'right';

interface Cell {
  row: number;
  col: number;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  isExit: boolean;
  hazard: HazardType | null;
  hasLadderUp: boolean;    // top wall open AND vertical passage
  hasLadderDown: boolean;  // bottom wall open AND vertical passage
  visited?: boolean;       // used only during maze generation
}

type HazardType = 'water' | 'fire' | 'gas' | 'collapse';

interface HazardDef {
  type: HazardType;
  label: string;
  damage: number;
  color: string;
}

interface DiffCfg {
  label: string;
  emoji: string;
  cols: number;
  rows: number;
  timeLimit: number;
  hazardCount: number;
  coneLen: number;
  coneAngle: number;
  tbReward: number;
  resMult: number;
}

interface MinerPos {
  row: number;
  col: number;
  dir: Dir;
}

interface PowerUps {
  charges: number;
  boosted: boolean;
  boostLeft: number;
  canary: boolean;
}

// ─────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────

const HAZARD_DEFS: Record<HazardType, HazardDef> = {
  water:    { type: 'water',    label: 'Flooding',      damage: 20, color: '#1565C0' },
  fire:     { type: 'fire',     label: 'Gas Fire',       damage: 30, color: '#BF360C' },
  gas:      { type: 'gas',      label: 'Toxic Gas',      damage: 15, color: '#546E7A' },
  collapse: { type: 'collapse', label: 'Roof Collapse',  damage: 25, color: '#4E342E' },
};
const HAZARD_TYPES: HazardType[] = ['water', 'fire', 'gas', 'collapse'];

const DIFFS: Record<string, DiffCfg> = {
  easy:   { label:'Easy',   emoji:'🟢', cols:8,  rows:10, timeLimit:240, hazardCount:2,  coneLen:4.0, coneAngle:120, tbReward:15, resMult:1   },
  medium: { label:'Medium', emoji:'🟡', cols:15, rows:19, timeLimit:150, hazardCount:6,  coneLen:2.8, coneAngle:80,  tbReward:30, resMult:1.5 },
  hard:   { label:'Hard',   emoji:'🔴', cols:25, rows:33, timeLimit:90,  hazardCount:20, coneLen:2.2, coneAngle:65,  tbReward:60, resMult:2.5 },
};

const BOOST_DUR   = 12;
const CANARY_DIST = 2;

// ─────────────────────────────────────────────────────────────────
//  IMAGE ASSETS
//  *** Replace require() paths once your sprite PNGs are in assets ***
// ─────────────────────────────────────────────────────────────────
//
// Expected files (all transparent-background PNGs, 144×144px minimum):
//   assets/images/maze/floor.png          – dark rocky mine floor tile
//   assets/images/maze/wall_h.png         – horizontal timber-beam wall (top/bottom)
//   assets/images/maze/wall_v.png         – vertical timber-beam wall (left/right)
//   assets/images/maze/ladder.png         – wooden ladder (full cell height)
//   assets/images/maze/hazard_water.png   – cartoon flooding water
//   assets/images/maze/hazard_fire.png    – cartoon gas fire / flame jet
//   assets/images/maze/hazard_gas.png     – cartoon toxic gas cloud
//   assets/images/maze/hazard_collapse.png– cartoon rock fall / rubble pile
//   assets/images/maze/exit.png           – mine exit door / ladder up to surface
//   assets/images/maze/darkness.png       – solid black tile (can just be a black PNG)
//   assets/images/MinerImageClearBack.png – miner walking sprite (already have)
//
// Until sprites are ready we render coloured placeholder tiles.

const SPRITES = {
  miner:       require('../../../assets/images/MinerImageClearBack.png'),
  minerCone:   require('../../../assets/images/MinerImage30Degree.png'),
  minerCone75: require('../../../assets/images/MinerImage75Degree.png'),
  wall:        require('../../../assets/images/maze/rock_no_beam.png'),
  tileDeadEnd: require('../../../assets/images/maze/dead_grey.png'),
  tileHoriz:   require('../../../assets/images/maze/horiz_grey.png'),
  tileVert:    require('../../../assets/images/maze/vert_grey.png'),
  tileCross:   require('../../../assets/images/maze/rock_no_beam_grey.png'),
  tileT:       require('../../../assets/images/maze/t_grey.png'),
  tileCorner:  require('../../../assets/images/maze/corner_grey.png'),
  canary:      require('../../../assets/images/maze/canary.png'),
  ladder:      require('../../../assets/images/maze/ladder.png'),
  exit:        require('../../../assets/images/maze/exit.png'),
  water:       require('../../../assets/images/maze/hazard_water.png'),
  fire:        require('../../../assets/images/maze/hazard_fire.png'),
  gas:         require('../../../assets/images/maze/hazard_gas.png'),
  collapse:    require('../../../assets/images/maze/hazard_collapse.png'),
};

// ─────────────────────────────────────────────────────────────────
//  MAZE GENERATOR  (recursive backtracker)
// ─────────────────────────────────────────────────────────────────

function buildMaze(rows: number, cols: number): Cell[][] {
  const g: Cell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r, col: c,
      walls: { top: true, right: true, bottom: true, left: true },
      isExit: false, hazard: null,
      hasLadderUp: false, hasLadderDown: false,
    }))
  );

  const opp: Record<Dir, Dir> = { up:'down', down:'up', left:'right', right:'left' };
  const dlt: Record<Dir, [number,number]> = { up:[-1,0], down:[1,0], left:[0,-1], right:[0,1] };
  const DIRS: Dir[] = ['up','down','left','right'];
  // Map Dir→wall key: 'up'→'top', 'down'→'bottom' (keys don't match otherwise)
  const d2w = (d: Dir): keyof Cell['walls'] => d === 'up' ? 'top' : d === 'down' ? 'bottom' : d;

  const stack: [number,number][] = [];
  let [cr, cc]: [number,number] = [0, 0];
  g[cr][cc].visited = true; // reuse visited for generation

  for (;;) {
    const avail = DIRS.map(d => {
      const [dr, dc] = dlt[d];
      const nr = cr + dr, nc = cc + dc;
      return (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !(g[nr][nc] as any).visited)
        ? { d, nr, nc } : null;
    }).filter(Boolean) as {d:Dir,nr:number,nc:number}[];

    if (avail.length) {
      stack.push([cr, cc]);
      const { d, nr, nc } = avail[Math.floor(Math.random() * avail.length)];
      g[cr][cc].walls[d2w(d)] = false;
      g[nr][nc].walls[d2w(opp[d])] = false;
      (g[nr][nc] as any).visited = true;
      // Ladder flags are computed post-build based on cell topology
      [cr, cc] = [nr, nc];
    } else if (stack.length) {
      [cr, cc] = stack.pop()!;
    } else break;
  }

  // Post-process: assign ladder flags only to "shaft" cells.
  // A shaft cell has at least one vertical opening (top or bottom)
  // but NO horizontal openings (pure vertical passage).
  // This means the player must use the ladder to traverse — it's the only way.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = g[r][c];
      const hasVertical   = !cell.walls.top || !cell.walls.bottom;
      const hasHorizontal = !cell.walls.left || !cell.walls.right;
      if (hasVertical && !hasHorizontal) {
        // Pure shaft — always show ladder
        cell.hasLadderUp   = !cell.walls.top;
        cell.hasLadderDown = !cell.walls.bottom;
      } else {
        // Cross-cell or horizontal — no ladder drawn
        cell.hasLadderUp   = false;
        cell.hasLadderDown = false;
      }
    }
  }

  g[rows - 1][cols - 1].isExit = true;
  return g;
}

function addHazards(g: Cell[][], count: number): Cell[][] {
  const out = g.map(r => r.map(c => ({ ...c })));
  const R = out.length, C = out[0].length;
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const r = Math.floor(Math.random() * R);
    const c = Math.floor(Math.random() * C);
    if ((r === 0 && c === 0) || (r === R-1 && c === C-1)) continue;
    if (out[r][c].hazard) continue;
    out[r][c].hazard = HAZARD_TYPES[Math.floor(Math.random() * HAZARD_TYPES.length)];
    placed++;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
//  VISIBILITY  (headlamp cone in cell-space)
// ─────────────────────────────────────────────────────────────────

function dirDeg(d: Dir): number {
  return d === 'right' ? 0 : d === 'down' ? 90 : d === 'left' ? 180 : 270;
}

function cellLit(m: MinerPos, r: number, c: number, cfg: DiffCfg, boosted: boolean): boolean {
  const dr = r - m.row, dc = c - m.col;
  const dist = Math.sqrt(dr * dr + dc * dc);
  if (dist === 0) return true;
  const len   = boosted ? cfg.coneLen * 2.2 : cfg.coneLen;
  if (dist > len) return false;
  const angle = boosted ? Math.min(cfg.coneAngle * 1.6, 340) : cfg.coneAngle;
  const cellDeg = (Math.atan2(dr, dc) * 180) / Math.PI;
  const faceDeg = dirDeg(m.dir);
  let diff = Math.abs(cellDeg - faceDeg);
  if (diff > 180) diff = 360 - diff;
  return diff <= angle / 2;
}

function computeLit(m: MinerPos, g: Cell[][], cfg: DiffCfg, boosted: boolean): Set<string> {
  const s = new Set<string>();
  const len = Math.ceil(boosted ? cfg.coneLen * 2.2 : cfg.coneLen);
  for (let dr = -len; dr <= len; dr++) {
    for (let dc = -len; dc <= len; dc++) {
      const r = m.row + dr, c = m.col + dc;
      if (r >= 0 && r < g.length && c >= 0 && c < g[0].length && cellLit(m, r, c, cfg, boosted))
        s.add(`${r},${c}`);
    }
  }
  return s;
}



// ─────────────────────────────────────────────────────────────────
//  CELL RENDERER  (side-view mine shaft tile)
// ─────────────────────────────────────────────────────────────────

interface TileProps {
  cell: Cell;
  lit: boolean;
  hasMiner: boolean;
  canaryWarn: boolean;
}

// ─── WORLD LAYER CONSTANTS ──────────────────────────────────────────────────
// We no longer render per-cell tiles.
// Instead the world is drawn as separate full-world passes (layers).
// This eliminates all white-border / seam issues permanently.
const BW = Math.round(SZ * 0.22);  // beam strip thickness


const Vignette = () => (
  <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
    {/* Top */}
    <View style={{ position:'absolute', top:0, left:0, right:0, height: VIEWPORT_H*0.25,
      backgroundColor:'#000', opacity:0.55 }} />
    {/* Bottom */}
    <View style={{ position:'absolute', bottom:0, left:0, right:0, height: VIEWPORT_H*0.25,
      backgroundColor:'#000', opacity:0.55 }} />
    {/* Left */}
    <View style={{ position:'absolute', top:0, left:0, bottom:0, width: VIEWPORT_W*0.2,
      backgroundColor:'#000', opacity:0.55 }} />
    {/* Right */}
    <View style={{ position:'absolute', top:0, right:0, bottom:0, width: VIEWPORT_W*0.2,
      backgroundColor:'#000', opacity:0.55 }} />
  </View>
);

// ✅ BUG-060 FIX: Difficulty is predetermined by mine level, not player choice.
// Levels 1–10 → Easy (8×10), 11–30 → Medium (15×19), 31+ → Hard (25×33)
function getDiffKeyForLevel(gameLevel: number): string {
  if (gameLevel <= 10) return 'easy';
  if (gameLevel <= 30) return 'medium';
  return 'hard';
}

// ─────────────────────────────────────────────────────────────────
//  MAIN SCREEN
// ─────────────────────────────────────────────────────────────────

export default function MinerMazeScreen({ route, navigation }: any) {
  const { property, propertyDetails, onBalanceUpdate } = route.params;
  const { user } = useAuth();
  const resultSaved = useRef(false);

  // ✅ BUG-028 FIX: isMounted ref prevents setState calls after unmount
  const isMounted = useRef(true);

  // Lazy-init AdMob: create exactly once, never on re-renders
  const adService = useRef<AdMobService | null>(null);
  // ✅ PRELOAD FIX: Dedicated AdMobService instance for the level-up ad.
  // adService is used for in-game power-up ads (boost, canary, health, time)
  // and may be mid-reinitialize when the win screen appears. This instance
  // starts loading when the 'won' phase begins so it's ready when the player
  // taps the level-up button.
  const adLevelService = useRef<AdMobService | null>(null);
  useEffect(() => {
    adService.current = new AdMobService();
    // ✅ BUG-028 FIX: Destroy the ad on unmount so the native AVPlayer (iOS) /
    // ExoPlayer (Android) is torn down before the component is deallocated.
    // Without this, pending notification observers fire on a freed object →
    // EXC_BAD_ACCESS on iOS / equivalent crash on Android.
    return () => {
      isMounted.current = false;
      adService.current?.destroyAd();
      adLevelService.current?.destroyAd();
    };
  }, []);  // empty deps = runs once on mount

  // ── state ──────────────────────────────────────────────────
  const [phase,   setPhase]   = useState<'menu'|'playing'|'paused'|'won'|'lost'>('menu');
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel,  setNewLevel]  = useState(1);
  const [adLevelLoading, setAdLevelLoading] = useState(false);
  const [liveDetails, setLiveDetails] = useState(propertyDetails);
  // ✅ BUG-060 FIX: diffKey is derived from gameLevel — not a player-controlled
  // state value. Updated after a level-up so "Try Again" on the end screen
  // uses the new tier automatically.
  const [diffKey, setDiffKey] = useState(() => getDiffKeyForLevel(propertyDetails?.gameLevel ?? 1));
  const [grid,    setGrid]    = useState<Cell[][]>([]);
  const [miner,   setMiner]   = useState<MinerPos>({ row:0, col:0, dir:'right' });
  // lookAngle: free rotation in degrees (0=right, 90=down, 180=left, 270=up)
  // Separate from miner.dir so the cone can point anywhere while miner faces a cardinal dir
  const [lookAngle, setLookAngle] = useState(0);
  const lookAngleRef = useRef(0);  // for use inside PanResponder without stale closure
  // Dial PanResponder — created once, reads dialCenter ref to compute angle
  const dialPanRef = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      const angle = (Math.atan2(pageY - dialCenter.current.y, pageX - dialCenter.current.x) * 180 / Math.PI + 360) % 360;
      lookAngleRef.current = angle;
      setLookAngle(angle);
    },
    onPanResponderMove: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      const angle = (Math.atan2(pageY - dialCenter.current.y, pageX - dialCenter.current.x) * 180 / Math.PI + 360) % 360;
      lookAngleRef.current = angle;
      setLookAngle(angle);
    },
  }));
  const [health,  setHealth]  = useState(100);
  const [tLeft,   setTLeft]   = useState(120);
  const [score,   setScore]   = useState(0);
  const [steps,   setSteps]   = useState(0);
  const [pu,      setPu]      = useState<PowerUps>({ charges:1, boosted:false, boostLeft:0, canary:false });
  const [litSet,  setLitSet]  = useState<Set<string>>(new Set());
  const [visitedCells, setVisitedCells] = useState<Set<string>>(new Set());
  const [lastHaz, setLastHaz] = useState<HazardDef|null>(null);
  const [reward,  setReward]  = useState<{tb:number,common:number,uncommon:number,rare:number,epic:number}|null>(null);

  // Animated camera offset (px) – world translates so miner stays centred
  const camX = useRef(new Animated.Value(0)).current;
  const camY = useRef(new Animated.Value(0)).current;
  // Dial refs — must be at component level, not inside render
  const dialCenter = useRef<{x:number, y:number}>({ x:0, y:0 });
  const vpW  = useRef(VIEWPORT_W);
  const vpH  = useRef(VIEWPORT_H);
  const damAnim  = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const bstRef   = useRef<ReturnType<typeof setInterval>|null>(null);

  // Stable refs so callbacks see latest values without re-creating
  const minerRef  = useRef(miner);
  const gridRef   = useRef(grid);
  const puRef     = useRef(pu);
  const phaseRef  = useRef(phase);
  // ✅ BUG-002 FIX: refs for score/tLeft/health so doEnd always reads current
  //    values even when called from inside a stale interval closure
  const scoreRef  = useRef(score);
  const tLeftRef  = useRef(tLeft);
  const healthRef = useRef(health);
  minerRef.current = miner;
  gridRef.current  = grid;
  puRef.current    = pu;
  phaseRef.current = phase;
  scoreRef.current  = score;
  tLeftRef.current  = tLeft;
  healthRef.current = health;

  const cfg = DIFFS[diffKey];

  // ── MAIN TIMER ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTLeft(t => {
        // ✅ BUG-002 FIX: Use Math.max to guarantee we never go below 0,
        //    and check tLeftRef (the live value) rather than relying solely
        //    on the closure value `t` which can lag by one tick after an ad extension
        const next = t - 1;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          // Small delay so setTLeft(0) renders before doEnd fires
          setTimeout(() => doEnd('lost'), 50);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── BOOST TIMER ────────────────────────────────────────────
  useEffect(() => {
    if (!pu.boosted) return;
    bstRef.current = setInterval(() => {
      setPu(p => {
        const left = p.boostLeft - 1;
        if (left <= 0) {
          clearInterval(bstRef.current!);
          setLitSet(computeLit(minerRef.current, gridRef.current, cfg, false));
          return { ...p, boosted: false, boostLeft: 0 };
        }
        return { ...p, boostLeft: left };
      });
    }, 1000);
    return () => { if (bstRef.current) clearInterval(bstRef.current); };
  }, [pu.boosted]);


  // ── camera helpers ─────────────────────────────────────────
  // World pixel position of miner centre
    // Camera: miner centered in SZ-based cell grid
  const minerPxX = (col: number) => col * SZ + Math.round(VIEWPORT_W / 2) + SZ / 2;
  const minerPxY = (row: number) => row * SZ + Math.round(VIEWPORT_H / 2) + SZ / 2;

  // Translate world so miner is centered on screen
  // Camera always centers the miner — no clamping, tan background shows at edges
  const worldOffsetX = (col: number) => vpW.current / 2 - minerPxX(col);
  const worldOffsetY = (row: number) => vpH.current / 2 - minerPxY(row);

  const onViewportLayout = useCallback((e: any) => {
    vpW.current = e.nativeEvent.layout.width;
    vpH.current = e.nativeEvent.layout.height;
    camX.setValue(worldOffsetX(minerRef.current.col));
    camY.setValue(worldOffsetY(minerRef.current.row));
  }, []);

  // Smooth camera track (still called with CELL coords)
  const animateCamera = useCallback((col: number, row: number) => {
    Animated.timing(camX, {
      toValue: worldOffsetX(col),
      duration: 120,
      useNativeDriver: true,
    }).start();
    Animated.timing(camY, {
      toValue: worldOffsetY(row),
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, []);


    // ── LOOK (rotate cone freely without moving) ──────────────────
  const setLookAngleDeg = useCallback((deg: number) => {
    const normalized = ((deg % 360) + 360) % 360;
    lookAngleRef.current = normalized;
    setLookAngle(normalized);
  }, []);

  // When move() is called, snap lookAngle back to miner.dir
  const snapLookToDir = useCallback((dir: Dir) => {
    const snap: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };
    setLookAngleDeg(snap[dir]);
  }, [setLookAngleDeg]);

    // ── MOVE ───────────────────────────────────────────────────
  // Movement stays in CELL coordinates. Walls come from the N×M Cell grid.
  // (The 2N+1 tile-map is purely a render representation.)
  const move = useCallback((dir: Dir) => {
    if (phaseRef.current !== 'playing') return;

    setMiner(prev => {
      const cell = gridRef.current[prev.row]?.[prev.col];
      if (!cell) return prev;

      const DLT: Record<Dir, [number, number]> = {
        up: [-1, 0],
        down: [1, 0],
        left: [0, -1],
        right: [0, 1],
      };

      const [dr, dc] = DLT[dir];
      const nr = prev.row + dr;
      const nc = prev.col + dc;

      // Map Dir keys → walls keys ('up'→'top', 'down'→'bottom')
      const dirToWall: Record<Dir, keyof Cell['walls']> = {
        up: 'top', down: 'bottom', left: 'left', right: 'right',
      };
      const wallBlocked = cell.walls[dirToWall[dir]];
      const inBounds = nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols;
      if (wallBlocked || !inBounds) {
        if (prev.dir === dir) return prev;
        const turned: MinerPos = { ...prev, dir };
        setLitSet(computeLit(turned, gridRef.current, cfg, puRef.current.boosted));
        snapLookToDir(dir);
        return turned;
      }

      const next: MinerPos = { row: nr, col: nc, dir };
      setLitSet(computeLit(next, gridRef.current, cfg, puRef.current.boosted));
      snapLookToDir(dir);
      setSteps(s => s + 1);
      setScore(s => s + 10);
      setVisitedCells(prev => new Set(prev).add(`${nr},${nc}`));
      animateCamera(nc, nr);
      soundService.play('step');

      const tgt = gridRef.current[nr][nc];
      if (tgt.hazard) {
        const hd = HAZARD_DEFS[tgt.hazard];
        setLastHaz(hd);
        flashDmg();
        soundService.play('hazard');
        setHealth(hp => {
          const n = hp - hd.damage;
          if (n <= 0) {
            setTimeout(() => doEnd('lost'), 300);
            return 0;
          }
          return n;
        });
      } else {
        setLastHaz(null);
      }

      if (tgt.isExit) setTimeout(() => doEnd('won'), 250);
      return next;
    });
  }, [cfg, animateCamera]);

  const flashDmg = () => {
    Animated.sequence([
      Animated.timing(damAnim, { toValue:1, duration:80,  useNativeDriver:true, easing:Easing.linear }),
      Animated.timing(damAnim, { toValue:0, duration:600, useNativeDriver:true, easing:Easing.linear }),
    ]).start();
  };

  const doEnd = (res: 'won'|'lost') => {
    if (timerRef.current) clearInterval(timerRef.current);
    // ✅ BUG-002 FIX: Read from refs so we always get current values,
    //    not stale closure values from when the interval was created
    const currentScore  = scoreRef.current;
    const currentTLeft  = tLeftRef.current;
    const currentHealth = healthRef.current;
    const finalSc = res === 'won'
      ? currentScore + currentTLeft * 5 + currentHealth * 2
      : currentScore;
    if (res === 'won') {
      const tb  = Math.max(cfg.tbReward, Math.floor(cfg.tbReward * finalSc / 1000));
      const res2 = Math.floor(50 * cfg.resMult);
      setScore(finalSc);
      setReward({ tb, res: res2 });
      soundService.play('win');
      setPhase('won');
      saveResult(true, finalSc);
    } else {
      // Offer time extension via ad before declaring loss
      if (adService.current) {
        Alert.alert(
          '⏱️ Time\'s Up!',
          'Watch an ad to get +30 more seconds?',
          [
            {
              text: 'End Game',
              style: 'cancel',
              onPress: () => { soundService.play('lose'); setPhase('lost'); saveResult(false, finalSc); },
            },
            {
              text: '📺 Watch Ad (+30s)',
              onPress: async () => {
                // ✅ BUG-002 FIX: Timeout ensures game ends even if ad never loads.
                //    Without this, a failed ad load leaves the game frozen but playable.
                let resolved = false;
                const adTimeout = setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    soundService.play('lose');
                    setPhase('lost');
                    saveResult(false, finalSc);
                  }
                }, 10000); // 10s timeout — if ad hasn't loaded by then, end the game

                try {
                  await adService.current!.showAd(
                    () => {
                      if (resolved) return;
                      if (!isMounted.current) return;
                      resolved = true;
                      clearTimeout(adTimeout);
                      // ✅ BUG-010 FIX: Route through 'paused' before 'playing'.
                      // If phase is already 'playing' when doEnd fires, setPhase('playing')
                      // is a no-op — React skips the update and the timer useEffect never
                      // re-fires, leaving tLeft frozen at 30. Going paused→playing forces
                      // a genuine phase change that restarts the interval correctly.
                      setTLeft(30);
                      setPhase('paused');
                      setTimeout(() => setPhase('playing'), 50);
                    },
                    () => {
                      if (resolved) return;
                      resolved = true;
                      clearTimeout(adTimeout);
                      soundService.play('lose');
                      setPhase('lost');
                      saveResult(false, finalSc);
                    }
                  );
                } catch {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(adTimeout);
                    soundService.play('lose');
                    setPhase('lost');
                    saveResult(false, finalSc);
                  }
                }
              },
            },
          ]
        );
      } else {
        soundService.play('lose');
        setPhase('lost');
        saveResult(false, finalSc);
      }
    }
  };

  const saveResult = async (won: boolean, finalScore: number) => {
    if (resultSaved.current || !user) return;
    resultSaved.current = true;
    try {
      const perfect = won && steps <= (cfg.cols * cfg.rows);
      const levelBefore = liveDetails?.gameLevel ?? 1;
      const earned = await dbServicePhase2.recordGameResult(
        user.uid,
        property.id,
        property.mineType,
        won,
        perfect,
        finalScore,
        tLeft,
        steps
      );

      // ✅ BUG-027 FIX: Notify parent of TB earned so map screen balance
      // updates immediately without requiring a re-login.
      if (earned?.tb && onBalanceUpdate) {
        onBalanceUpdate(earned.tb);
      }
      // Store earned rewards for display on win screen
      if (isMounted.current) {
        setReward({
          tb:       earned?.tb       ?? 0,
          common:   earned?.common   ?? 0,
          uncommon: earned?.uncommon ?? 0,
          rare:     earned?.rare     ?? 0,
          epic:     earned?.epic     ?? 0,
        });
      }
      // Re-fetch so XP meter reflects the just-saved values
      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      if (updated) {
        setLiveDetails(updated);
        if (won && updated.gameLevel > levelBefore) {
          setLeveledUp(true);
          setNewLevel(updated.gameLevel);
          // ✅ BUG-060 FIX: re-derive difficulty for the new level so "Try Again"
          // on the end screen uses the correct tier (e.g. Easy→Medium on Lv 11).
          setDiffKey(getDiffKeyForLevel(updated.gameLevel));
        }
      }
    } catch (e) {
      console.error('MinerMaze: error saving result:', e);
    }
  };


  // ✅ PRELOAD FIX: Start loading the level-up ad the moment the player wins.
  // Power-up ads (boost/canary/health/time) use adService and may leave it
  // mid-reinitialize. This dedicated instance has a full load cycle head start
  // before the player taps the level-up button.
  useEffect(() => {
    if (phase === 'won') {
      adLevelService.current?.destroyAd();
      adLevelService.current = new AdMobService();
    }
  }, [phase]);

  // ── Ad to play next level ──────────────────────────────────────
  const handlePlayNextLevel = async () => {
    if (!adLevelService.current) return;
    setAdLevelLoading(true);
    try {
      await adLevelService.current.showAd(
        async () => {
          if (!isMounted.current) return;
          const updated = await dbServicePhase2.getPropertyDetails(property.id);
          if (!isMounted.current) return;
          setAdLevelLoading(false);
          navigation.replace('MinerMaze', { property, propertyDetails: updated ?? propertyDetails });
        },
        () => { if (isMounted.current) setAdLevelLoading(false); }
      );
    } catch {
      if (isMounted.current) setAdLevelLoading(false);
    }
  };

  // ── START GAME ─────────────────────────────────────────────
  const startGame = useCallback(() => {
    const raw  = buildMaze(cfg.rows, cfg.cols);
    const full = addHazards(raw, cfg.hazardCount);
    const m0: MinerPos = { row: 0, col: 0, dir: 'right' };
    setGrid(full);
    setMiner(m0);
    setLookAngle(0); lookAngleRef.current = 0;
    setHealth(100);
    setTLeft(cfg.timeLimit);
    setScore(0);
    setSteps(0);
    setPu({ charges: 1, boosted: false, boostLeft: 0, canary: true });
    setLitSet(computeLit(m0, full, cfg, false));
    setVisitedCells(new Set(['0,0']));
    setLastHaz(null);
    setReward(null);
    // Delay camera snap until after viewport onLayout has fired
    setPhase('playing');
    setTimeout(() => {
      camX.setValue(worldOffsetX(0));
      camY.setValue(worldOffsetY(0));
    }, 150);
  }, [diffKey, cfg]);

  // ── POWER-UPS ──────────────────────────────────────────────
  const activateBoost = () => {
    if (pu.charges <= 0 || pu.boosted) return;
    soundService.play('boost');
    setPu(p => ({ ...p, charges: p.charges - 1, boosted: true, boostLeft: BOOST_DUR }));
    setLitSet(computeLit(miner, grid, cfg, true));
  };
  const adBoost  = async () => { if (!adService.current) return; try { await adService.current.showAd(() => { if (!isMounted.current) return; soundService.play('chime'); setPu(p => ({...p, charges: p.charges+1})); }, () => {}); } catch {} };
  const adCanary = async () => { if (pu.canary || !adService.current) return; try { await adService.current.showAd(() => { if (!isMounted.current) return; soundService.play('canary'); setPu(p => ({...p, canary:true})); }, () => {}); } catch {} };
  const adHealth = async () => { if (!adService.current) return; try { await adService.current.showAd(() => { if (!isMounted.current) return; soundService.play('chime'); setHealth(h => Math.min(100, h+30)); }, () => {}); } catch {} };
  const adTime   = async () => { if (!adService.current) return; try { await adService.current.showAd(() => { if (!isMounted.current) return; soundService.play('chime'); setTLeft(t => t + 30); }, () => {}); } catch {} };

  const isCanaryWarn = useCallback((r: number, c: number) => {
    if (!pu.canary) return false;
    for (let dr = -CANARY_DIST; dr <= CANARY_DIST; dr++)
      for (let dc = -CANARY_DIST; dc <= CANARY_DIST; dc++)
        if (grid[r+dr]?.[c+dc]?.hazard) return true;
    return false;
  }, [grid, pu.canary]);

  // ── WORLD RENDERER ─────────────────────────────────────────
  // Cell-based: one tile image per cell, baked beams, no stacking.
  // getTileProps returns {source, rotation} for each cell's wall config.
  const RENDER_RADIUS = 12;  // larger window so tiles fill screen past center

  const getTileProps = (cell: Cell): { source: any; rotation: string } => {
    // CONFIRMED BEAM MAP:
    //   horiz_grey       : beams top+bottom     → open LEFT+RIGHT   (horizontal corridor)
    //   vert_grey        : beams left+right      → open TOP+BOTTOM   (vertical corridor)
    //   dead_grey        : beams top+bottom+left → open RIGHT        at 0°
    //   t_grey           : beam right only        → open TOP+BOTTOM+LEFT  at 0°
    //   rock_no_beam_grey: no beams               → all 4 open
    //
    // RN rotation is clockwise. To aim the open/beam side:
    //   dead_grey open=RIGHT: 0°→right, 90°→bottom, 180°→left, 270°→top
    //   t_grey    beam=RIGHT: 0°→right, 90°→bottom, 180°→left, 270°→top

    const { top: wT, bottom: wB, left: wL, right: wR } = cell.walls;
    const openCount = [!wT, !wB, !wL, !wR].filter(Boolean).length;

    // 4 open → cross (no beams)
    if (openCount === 4) {
      return { source: SPRITES.tileCross, rotation: '0deg' };
    }

    // 3 open → t_grey: beam=RIGHT at 0°, rotate so beam faces the one closed wall
    if (openCount === 3) {
      if (wR) return { source: SPRITES.tileT, rotation: '0deg' };   // wall right
      if (wB) return { source: SPRITES.tileT, rotation: '90deg' };  // wall bottom
      if (wL) return { source: SPRITES.tileT, rotation: '180deg' }; // wall left
      /* wT */ return { source: SPRITES.tileT, rotation: '270deg' }; // wall top
    }

    // 2 open straight corridors
    if (openCount === 2) {
      if (!wL && !wR) return { source: SPRITES.tileHoriz, rotation: '0deg' };  // horiz: open L+R
      if (!wT && !wB) return { source: SPRITES.tileVert, rotation: '0deg' };  // vert: open T+B
      // Corners: corner_grey has beams=top+right, open=left+bottom at 0°
      // Rotate CW so beams always face the 2 closed walls
      if (!wL && !wB) return { source: SPRITES.tileCorner, rotation: '0deg' };   // open left+bottom
      if (!wT && !wL) return { source: SPRITES.tileCorner, rotation: '90deg' };  // open top+left
      if (!wT && !wR) return { source: SPRITES.tileCorner, rotation: '180deg' }; // open top+right
      /* !wR && !wB */ return { source: SPRITES.tileCorner, rotation: '270deg' };// open right+bottom
    }

    // 1 open → dead_grey: beams=top+bottom+left, open=RIGHT at 0°
    if (openCount === 1) {
      if (!wR) return { source: SPRITES.tileDeadEnd, rotation: '0deg' };   // open right
      if (!wB) return { source: SPRITES.tileDeadEnd, rotation: '90deg' };  // open bottom
      if (!wL) return { source: SPRITES.tileDeadEnd, rotation: '180deg' }; // open left
      /* !wT */ return { source: SPRITES.tileDeadEnd, rotation: '270deg' }; // open top
    }

    return { source: SPRITES.wall, rotation: '0deg' };
  };

  const worldLayers = useMemo(() => {
    if (!grid?.length || !grid[0]?.length) return null;

    const rows = grid.length;
    const cols = grid[0].length;

    const rMin = Math.max(0, miner.row - RENDER_RADIUS);
    const rMax = Math.min(rows - 1, miner.row + RENDER_RADIUS);
    const cMin = Math.max(0, miner.col - RENDER_RADIUS);
    const cMax = Math.min(cols - 1, miner.col + RENDER_RADIUS);

    const wallTiles:  React.ReactElement[] = [];
    const pathTiles:  React.ReactElement[] = [];
    const overlays:   React.ReactElement[] = [];

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const cell = grid[r][c];
        const x = c * SZ + Math.round(VIEWPORT_W / 2);
        const y = r * SZ + Math.round(VIEWPORT_H / 2);
        const key = `${r},${c}`;
        const { top: wT, bottom: wB, left: wL, right: wR } = cell.walls;
        const isOpen = !wT || !wB || !wL || !wR;
        const isHere = miner.row === r && miner.col === c;

        // Layer 1: Solid tan View — no image, no rocky border, no sub-pixel gaps
        wallTiles.push(
          <View key={`w-${key}`}
            style={{ position:'absolute', left: x-1, top: y-1,
                     width: SZ+2, height: SZ+2, backgroundColor: '#5C3D1E' }} />
        );

        if (!isOpen) continue;

        // Layer 1b: Dark underlay under path tiles — so transparent tile edges
        // show dark stone rather than the tan wall behind
        pathTiles.push(
          <View key={`u-${key}`}
            style={{ position:'absolute', left: x, top: y,
                     width: SZ, height: SZ, backgroundColor: '#1C0F05' }} />
        );

        // Layer 2: Path tile — oversized so beams align with cell boundaries.
        // Each tile image has its beam inset ~14% from the edge. By rendering the
        // image 28px larger and offsetting -14px, the beam lands exactly at the
        // cell border so adjacent tile beams meet seamlessly with no brown gap.
        const BEAM_INSET = 14;
        const TILE_SIZE  = SZ + BEAM_INSET * 2;  // 124px
        const { source, rotation } = getTileProps(cell);
        pathTiles.push(
          <View key={`p-${key}`} style={{
            position: 'absolute',
            left: x - BEAM_INSET,
            top:  y - BEAM_INSET,
            width: SZ + BEAM_INSET * 2,
            height: SZ + BEAM_INSET * 2,
            overflow: 'hidden',
          }}>
            <Image source={source}
              style={{
                width: TILE_SIZE, height: TILE_SIZE,
                transform: rotation !== '0deg' ? [{ rotate: rotation }] : undefined,
              }}
              resizeMode="cover"
            />
          </View>
        );

        // Layer 3: Overlays — exit, ladders, hazards, canary warning
        const oInset = Math.round(SZ * 0.15);
        const oSize  = SZ - oInset * 2;
        const oLeft  = x + oInset;
        const oTop   = y + oInset;

        if (cell.isExit && !isHere) {
          overlays.push(
            <Image key={`exit-${key}`} source={SPRITES.exit}
              style={{ position:'absolute', left: oLeft, top: oTop, width: oSize, height: oSize }}
              resizeMode="contain" />
          );
        }

        // Ladder is baked into vert_grey tile art — no separate overlay needed

        if (cell.hazard && !isHere) {
          const hazSrc = cell.hazard==='water' ? SPRITES.water :
                         cell.hazard==='fire'  ? SPRITES.fire  :
                         cell.hazard==='gas'   ? SPRITES.gas   : SPRITES.collapse;
          overlays.push(
            <Image key={`haz-${key}`} source={hazSrc}
              style={{ position:'absolute', left: oLeft, top: oTop, width: oSize, height: oSize }}
              resizeMode="contain" />
          );
        }

        if (pu.canary && isCanaryWarn(r, c) && !isHere) {
          overlays.push(
            <View key={`cw-${key}`}
              style={{ position:'absolute', left: x, top: y, width: SZ, height: SZ,
                       backgroundColor:'rgba(255,220,0,0.18)' }} />
          );
        }
      }
    }

    return <>{wallTiles}{pathTiles}{overlays}</>;
  }, [grid, miner, pu.canary, isCanaryWarn]);




  // ─────────────────────────────────────────────────────────────
  //  MENU
  // ─────────────────────────────────────────────────────────────
  if (phase === 'menu') return (
    <View style={st.screen}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
          <Ionicons name="arrow-back" size={24} color="#FFD700" />
        </TouchableOpacity>
        <Text style={st.hTitle}>⛏️  Miner Maze</Text>
        <View style={{ width:40 }} />
      </View>

      <ScrollView contentContainerStyle={st.menuBody}>
        <View style={{ alignItems:'center', marginBottom:8 }}>
          <Image source={SPRITES.miner} style={{ width:130, height:130 }} resizeMode="contain" />
        </View>
        <Text style={st.tagline}>Navigate the Dark!</Text>
        <Text style={st.desc}>
          Your headlamp reveals a narrow cone ahead. Explore the coal mine,
          climb ladders, dodge hazards, and find the exit before time runs out.
          The miner stays centred — the mine moves around you.
        </Text>

        {/* Controls explainer */}
        <View style={st.box}>
          <Text style={st.boxTitle}>🎮  Controls</Text>
          <Text style={st.bTxt}>• First tap: Turn to face that direction</Text>
          <Text style={st.bTxt}>• Second tap: Move forward</Text>
          <Text style={st.bTxt}>• ⬆️⬇️ uses ladders to change levels</Text>
        </View>

        <View style={st.box}>
          <Text style={st.boxTitle}>⚠️  Hazards</Text>
          {Object.values(HAZARD_DEFS).map(h => (
            <View key={h.type} style={st.row}>
              <Text style={st.rIco}>
                {h.type==='water'?'💧':h.type==='fire'?'🔥':h.type==='gas'?'☁️':'🪨'}
              </Text>
              <Text style={st.rTxt}>{h.label}</Text>
              <Text style={[st.rTxt,{color:'#EF9A9A',marginLeft:'auto'}]}>−{h.damage} HP</Text>
            </View>
          ))}
        </View>

        <View style={st.box}>
          <Text style={st.boxTitle}>💡  Power-Ups</Text>
          <View style={st.row}><Text style={st.rIco}>🔦</Text><Text style={st.rTxt}>Headlamp – wide cone for {BOOST_DUR}s (1 free, watch ad for more)</Text></View>
          <View style={st.row}><Text style={st.rIco}>🐦</Text><Text style={st.rTxt}>Canary – warns when hazards within {CANARY_DIST} cells (watch ad)</Text></View>
          <View style={st.row}><Text style={st.rIco}>⏱️</Text><Text style={st.rTxt}>Time – add 30 seconds (watch ad)</Text></View>
          <View style={st.row}><Text style={st.rIco}>❤️</Text><Text style={st.rTxt}>First Aid – restore 30 HP (watch ad)</Text></View>
        </View>

        {/* ✅ BUG-060 FIX: Difficulty is predetermined by mine level.
            Replaced the Easy/Medium/Hard selector buttons with a single
            info card showing the auto-selected tier and what unlocks next. */}
        <Text style={st.secLbl}>Difficulty</Text>
        <View style={[st.box, { borderColor: '#FFD700' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 26, marginRight: 10 }}>{cfg.emoji}</Text>
            <View>
              <Text style={[st.dLbl, { fontSize: 16 }]}>{cfg.label}</Text>
              <Text style={st.dSub}>Level {liveDetails?.gameLevel ?? 1} Mine</Text>
            </View>
          </View>
          <Text style={st.bTxt}>🗺️  Grid: {cfg.cols}×{cfg.rows}  ·  ⏱️ {cfg.timeLimit}s  ·  ⛏️ +{cfg.tbReward} TB</Text>
          {diffKey === 'easy' && (
            <Text style={[st.dSub, { marginTop: 6 }]}>Reach Level 11 to unlock Medium difficulty</Text>
          )}
          {diffKey === 'medium' && (
            <Text style={[st.dSub, { marginTop: 6 }]}>Reach Level 31 to unlock Hard difficulty</Text>
          )}
        </View>

        <TouchableOpacity style={st.bigBtn} onPress={() => { resultSaved.current = false; startGame(); }}>
          <Text style={st.bigBtnTxt}>🚇  Enter the Mine</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  //  WIN / LOSE
  // ─────────────────────────────────────────────────────────────
  if (phase === 'won' || phase === 'lost') return (
    <View style={st.screen}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
          <Ionicons name="arrow-back" size={24} color="#FFD700" />
        </TouchableOpacity>
        <Text style={st.hTitle}>⛏️  Miner Maze</Text>
        <View style={{ width:40 }} />
      </View>
      <View style={st.endWrap}>
        <Image source={SPRITES.miner} style={{ width:110, height:110, marginBottom:10 }} resizeMode="contain" />
        <Text style={st.endTitle}>{phase==='won' ? '🎉  Escaped!' : '💀  Cave-In!'}</Text>
        <View style={st.rewardBox}>
          {phase==='won' && reward ? <>
            {leveledUp && (
              <View style={st.levelUpBanner}>
                <Text style={st.levelUpTxt}>⬆️ LEVEL UP! Now Level {newLevel}</Text>
                {adLevelLoading ? (
                  <Text style={st.levelUpTxt}>⏳ Loading ad...</Text>
                ) : (
                  <TouchableOpacity style={st.levelUpAdBtn} onPress={handlePlayNextLevel}
                    disabled={adLevelLoading}>
                    <Text style={st.levelUpAdTxt}>{adLevelLoading ? '⏳ Loading...' : `📺 Play Level ${newLevel}`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Text style={st.rHead}>Rewards</Text>
            <Text style={st.rLine}>⛏️  +{reward.tb} TB</Text>
            {(() => {
              const rn = getResourceNames(property.mineType);
              return <>
                {reward.common   > 0 && <Text style={st.rLine}>🪨  +{reward.common} {rn.common}</Text>}
                {reward.uncommon > 0 && <Text style={st.rLine}>🟡  +{reward.uncommon} {rn.uncommon}</Text>}
                {reward.rare     > 0 && <Text style={st.rLine}>🔵  +{reward.rare} {rn.rare}</Text>}
                {reward.epic     > 0 && <Text style={st.rLine}>🟣  +{reward.epic} {rn.epic}</Text>}
              </>;
            })()}
            <Text style={st.rLine}>📊  Score: {score.toLocaleString()}</Text>
            <Text style={st.rLine}>👣  Steps: {steps}</Text>
            <View style={st.xpRow}>
              <Text style={st.xpLbl}>⚡ Lv {liveDetails?.gameLevel ?? 1}</Text>
              <View style={st.xpBg}>
                <View style={[st.xpFill, { width: `${Math.min(100, ((liveDetails?.gameXP ?? 0) / 1000) * 100)}%` }]} />
              </View>
              <Text style={st.xpTxt}>{liveDetails?.gameXP ?? 0}/1000 XP</Text>
            </View>
          </> : <>
            <Text style={st.rHead}>Result</Text>
            <Text style={st.rLine}>❤️  HP remaining: {health}</Text>
            <Text style={st.rLine}>⏱️  Time left: {tLeft}s</Text>
            <Text style={st.rLine}>👣  Steps: {steps}</Text>
            <Text style={st.rLine}>📊  +10 XP earned</Text>
            <View style={st.xpRow}>
              <Text style={st.xpLbl}>⚡ Lv {liveDetails?.gameLevel ?? 1}</Text>
              <View style={st.xpBg}>
                <View style={[st.xpFill, { width: `${Math.min(100, ((liveDetails?.gameXP ?? 0) / 1000) * 100)}%` }]} />
              </View>
              <Text style={st.xpTxt}>{liveDetails?.gameXP ?? 0}/1000 XP</Text>
            </View>
          </>}
        </View>
        <TouchableOpacity style={st.bigBtn} onPress={() => { resultSaved.current = false; startGame(); }}>
          <Text style={st.bigBtnTxt}>🔄  Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.bigBtn,{backgroundColor:'#4E342E',marginTop:10}]} onPress={() => setPhase('menu')}>
          <Text style={st.bigBtnTxt}>🏠  Menu</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  //  PLAYING
  // ─────────────────────────────────────────────────────────────

  const dmgOpacity = damAnim.interpolate({ inputRange:[0,1], outputRange:[0,0.55] });
  // World container needs extra padding so centered camera never clips
  const totalW = cfg.cols * SZ + VIEWPORT_W;
  const totalH = cfg.rows * SZ + VIEWPORT_H;

  return (
    <View style={st.screen}>
      {/* Damage flash */}
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFillObject,{backgroundColor:'#F44336',opacity:dmgOpacity,zIndex:100}]} />

      {/* ── Header ── */}
      <View style={st.header}>
        <TouchableOpacity style={st.back} onPress={() => Alert.alert('Quit Mine?','Your progress will be lost.',[
          { text:'Stay', style:'cancel' },
          { text:'Quit', onPress:()=>{ if(timerRef.current)clearInterval(timerRef.current); setPhase('menu'); } },
        ])}>
          <Ionicons name="arrow-back" size={24} color="#FFD700" />
        </TouchableOpacity>
        <Text style={st.hTitle}>{cfg.emoji}  {cfg.label} Mine</Text>
        <View style={{ width:40 }} />
      </View>

      {/* ── HUD ── */}
      <View style={st.hud}>
        <View style={st.hudC}>
          <Text style={st.hudLbl}>❤️ HP</Text>
          <View style={st.hpBg}>
            <View style={[st.hpFg,{ width:`${health}%`, backgroundColor:health>50?'#4CAF50':health>25?'#FF9800':'#F44336' }]} />
          </View>
          <Text style={st.hudV}>{health}</Text>
        </View>
        <View style={[st.hudC,st.hudMid]}>
          <Text style={st.hudLbl}>⏱️ TIME</Text>
          <Text style={[st.hudTime, tLeft < 20 && { color:'#F44336' }]}>{tLeft}s</Text>
        </View>
        <View style={st.hudC}>
          <Text style={st.hudLbl}>📊 SCORE</Text>
          <Text style={st.hudV}>{score}</Text>
        </View>
      </View>

      {/* ── XP Meter ── */}
      <View style={st.xpRow}>
        <Text style={st.xpLbl}>⚡ Lv {liveDetails?.gameLevel ?? 1}</Text>
        <View style={st.xpBg}>
          <View style={[st.xpFill, { width: `${Math.min(100, ((liveDetails?.gameXP ?? 0) / 1000) * 100)}%` }]} />
        </View>
        <Text style={st.xpTxt}>{liveDetails?.gameXP ?? 0}/1000 XP</Text>
      </View>

      {/* ── Status banners ── */}
      {lastHaz && (
        <View style={[st.banner,{backgroundColor:lastHaz.color+'EE'}]}>
          <Text style={st.bannerT}>
            {lastHaz.type==='water'?'💧':lastHaz.type==='fire'?'🔥':lastHaz.type==='gas'?'☁️':'🪨'}
            {' '}{lastHaz.label}! −{lastHaz.damage} HP
          </Text>
        </View>
      )}
      {pu.canary && isCanaryWarn(miner.row, miner.col) && (
        <View style={[st.banner,{backgroundColor:'#F9A825EE'}]}>
          <Text style={[st.bannerT,{color:'#000'}]}>🐦 DANGER NEARBY!</Text>
        </View>
      )}
      {pu.boosted && (
        <View style={[st.banner,{backgroundColor:'#1565C0EE'}]}>
          <Text style={st.bannerT}>🔦 Headlamp Boosted — {pu.boostLeft}s</Text>
        </View>
      )}

      {/* ══════════════════════════════════════════
          VIEWPORT  –  clipped window into the world
          The Animated.View inside is the "world" that
          translates so the miner stays centred.
      ══════════════════════════════════════════ */}
      <View style={st.viewport} onLayout={onViewportLayout}>
        <Animated.View style={[
          { position:'absolute', width: totalW, height: totalH, backgroundColor: '#5C3D1E' },
          { transform: [{ translateX: camX }, { translateY: camY }] },
        ]}>
          {/* ── Layer 1–4: world terrain + beams + overlays ── */}
          {worldLayers}

          {/* Miner + headlamp cone overlay — single image, flips with direction */}
          {(() => {
            // The overlay image is 1000x1000.
            // Miner character center in image: ~(473px from left, 479px from top) = (47.3%, 47.9%)
            // We want the miner character in the overlay to sit exactly on his grid cell center.
            // Render the overlay large enough to cover the full viewport.
            // Image is 1420x1420, miner within it is 192px → scale to match SZ
            // Canvas expanded from 1000→1420 so corners don't show during rotation
            const CONE_SIZE = 1420 * (SZ / 192);
            // Miner center in image: (683px, 689px) out of 1420px
            const CONE_MINER_X = 683 / 1420;
            const CONE_MINER_Y = 689 / 1420;
            const minerCenterX = miner.col * SZ + Math.round(VIEWPORT_W / 2) + Math.round(SZ * 0.5);
            const minerCenterY = miner.row * SZ + Math.round(VIEWPORT_H / 2) + Math.round(SZ * 0.5);
            return (
              <Image
                source={pu.boosted ? SPRITES.minerCone75 : SPRITES.minerCone}
                style={{
                  position: 'absolute',
                  left:   minerCenterX - CONE_SIZE * CONE_MINER_X,
                  top:    minerCenterY - CONE_SIZE * CONE_MINER_Y,
                  width:  CONE_SIZE,
                  height: CONE_SIZE,
                  zIndex: 20,
                  transform: [
                    { rotate: `${lookAngle}deg` },
                  ],
                }}
                resizeMode="cover"
              />
            );
          })()}
        </Animated.View>

        {/* Compass direction indicator */}
        <View style={st.compass}>
          <Text style={st.compassTxt}>
            {miner.dir==='up'?'⬆️':miner.dir==='down'?'⬇️':miner.dir==='left'?'⬅️':'➡️'}
          </Text>
        </View>

        {/* Mini-map overlay */}
        {grid.length > 0 && (() => {
          const MM_CELL = Math.max(2, Math.floor(80 / Math.max(grid.length, grid[0]?.length ?? 1)));
          const MM_W = (grid[0]?.length ?? 0) * MM_CELL;
          const MM_H = grid.length * MM_CELL;
          return (
            <View style={{
              position: 'absolute', bottom: 8, left: 8,
              width: MM_W + 4, height: MM_H + 4,
              backgroundColor: 'rgba(0,0,0,0.65)',
              borderRadius: 4, borderWidth: 1, borderColor: '#6D4C1F',
              padding: 2,
            }}>
              {grid.map((rowArr, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {rowArr.map((cell, c) => {
                    const key = `${r},${c}`;
                    const isMiner   = miner.row === r && miner.col === c;
                    const isExit    = cell.isExit;
                    const isVisited = visitedCells.has(key);
                    const isOpen    = !cell.walls.top || !cell.walls.bottom || !cell.walls.left || !cell.walls.right;
                    let bg = '#0A0400'; // unvisited — dark
                    if (isMiner)        bg = '#FFD700'; // player — gold
                    else if (isExit && isVisited) bg = '#4CAF50'; // exit revealed — green
                    else if (isVisited && cell.hazard) bg = '#F44336'; // hazard revealed — red
                    else if (isVisited && isOpen) bg = '#8B7355'; // visited path — tan
                    else if (isVisited) bg = '#3E2723'; // visited wall — dark brown
                    return (
                      <View key={c} style={{
                        width: MM_CELL, height: MM_CELL,
                        backgroundColor: bg,
                      }} />
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })()}

      </View>

      {/* ══ CONTROLS ══ */}
      <View style={st.ctrlWrap}>
        {/* Power-up row — 4 slots */}
        <View style={st.pRow}>
          {/* Headlamp: tap to activate a charge; long-press / ad button to get more */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <TouchableOpacity style={[st.pBtn,(pu.charges<=0||pu.boosted)&&st.pDim]}
              onPress={activateBoost} disabled={pu.charges<=0||pu.boosted}>
              <Text style={st.pIco}>🔦</Text>
              <Text style={st.pLbl}>Headlamp ({pu.charges})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.pBtn, { paddingVertical: 3 }]} onPress={adBoost}>
              <Text style={{ color:'#A1887F', fontSize:10 }}>📺 +1 via Ad</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[st.pBtn, pu.canary && st.pOn]} onPress={adCanary} disabled={pu.canary}>
            <Text style={st.pIco}>🐦</Text>
            <Text style={st.pLbl}>{pu.canary ? 'Canary ✓' : 'Canary'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.pBtn} onPress={adTime}>
            <Text style={st.pIco}>⏱️</Text>
            <Text style={st.pLbl}>+30s</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.pBtn} onPress={adHealth}>
            <Text style={st.pIco}>❤️</Text>
            <Text style={st.pLbl}>+30 HP</Text>
          </TouchableOpacity>
        </View>

        {/* D-Pads: MOVE (left) + LOOK (right) */}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap: 24 }}>

          {/* Move pad */}
          <View style={{ alignItems:'center' }}>
            <Text style={st.padLabel}>MOVE</Text>
            <View style={st.dpad}>
              <TouchableOpacity style={st.dBtn} onPress={() => move('up')}>
                <Ionicons name="arrow-up" size={28} color="#FFD700" />
              </TouchableOpacity>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <TouchableOpacity style={st.dBtn} onPress={() => move('left')}>
                  <Ionicons name="arrow-back" size={28} color="#FFD700" />
                </TouchableOpacity>
                <View style={st.dCtr}>
                  <Image source={SPRITES.miner} style={{ width:34, height:34 }} resizeMode="contain" />
                </View>
                <TouchableOpacity style={st.dBtn} onPress={() => move('right')}>
                  <Ionicons name="arrow-forward" size={28} color="#FFD700" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={st.dBtn} onPress={() => move('down')}>
                <Ionicons name="arrow-down" size={28} color="#FFD700" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Look dial — drag finger around the ring to rotate the headlamp */}
          {(() => {
            const DIAL_SIZE = 140;
            const CENTER = DIAL_SIZE / 2;
            const KNOB_R = DIAL_SIZE * 0.36;  // orbit radius for the knob dot
            // Knob position on the ring
            const knobAngleRad = (lookAngle * Math.PI) / 180;
            const knobX = CENTER + KNOB_R * Math.cos(knobAngleRad);
            const knobY = CENTER + KNOB_R * Math.sin(knobAngleRad);

            // Cardinal tick marks
            const ticks = [0, 90, 180, 270];
            const tickLabels: Record<number,string> = { 0:'E', 90:'S', 180:'W', 270:'N' };

            return (
              <View style={{ alignItems:'center' }}>
                <Text style={st.padLabel}>LOOK</Text>
                <View
                  style={{
                    width: DIAL_SIZE, height: DIAL_SIZE,
                    borderRadius: DIAL_SIZE / 2,
                    backgroundColor: '#2A1A08',
                    borderWidth: 3, borderColor: '#4FC3F7',
                    justifyContent: 'center', alignItems: 'center',
                    position: 'relative',
                  }}
                  onLayout={(e) => {
                    e.target.measure((_x, _y, _w, _h, pageX, pageY) => {
                      dialCenter.current = { x: pageX + DIAL_SIZE/2, y: pageY + DIAL_SIZE/2 };
                    });
                  }}
                  {...dialPanRef.current.panHandlers}
                >
                  {/* Cardinal tick marks */}
                  {ticks.map(t => {
                    const rad = (t * Math.PI) / 180;
                    const tx = CENTER + (DIAL_SIZE * 0.44) * Math.cos(rad) - 8;
                    const ty = CENTER + (DIAL_SIZE * 0.44) * Math.sin(rad) - 8;
                    return (
                      <Text key={t} style={{
                        position:'absolute', left: tx, top: ty,
                        color: '#4FC3F7', fontSize: 10, fontWeight:'700', width:16, textAlign:'center',
                      }}>{tickLabels[t]}</Text>
                    );
                  })}
                  {/* Centre eye icon */}
                  <Text style={{ fontSize: 20, zIndex: 2 }}>👁️</Text>
                  {/* Rotating knob dot */}
                  <View style={{
                    position:'absolute',
                    left: knobX - 8, top: knobY - 8,
                    width: 16, height: 16,
                    borderRadius: 8,
                    backgroundColor: '#4FC3F7',
                    zIndex: 3,
                  }} />
                  {/* Direction line from center to knob — thin line using rotation */}
                  <View style={{
                    position:'absolute',
                    left: CENTER - 1,
                    top: CENTER - KNOB_R,
                    width: 2,
                    height: KNOB_R,
                    backgroundColor: 'rgba(79,195,247,0.5)',
                    transform: [
                      { translateY: KNOB_R / 2 },
                      { rotate: `${lookAngle + 90}deg` },
                      { translateY: -(KNOB_R / 2) },
                    ],
                    zIndex: 1,
                  }} />
                </View>
              </View>
            );
          })()}

        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex:1, backgroundColor:'#3B2010' },

  header: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    backgroundColor:'#1A0900',
    paddingTop: STATUS_H + 6, paddingBottom:10, paddingHorizontal:16,
    height: HEADER_H,
    borderBottomWidth:2, borderBottomColor:'#6D4C1F',
  },
  hTitle: { color:'#FFD700', fontSize:18, fontWeight:'bold' },
  back:   { width:40, height:40, justifyContent:'center', alignItems:'center' },

  hud: {
    flexDirection:'row', height: HUD_H, alignItems:'center',
    backgroundColor:'#0A0400',
    paddingHorizontal:12,
    borderBottomWidth:1, borderBottomColor:'#3E2723',
  },
  hudC:   { flex:1, alignItems:'center' },
  hudMid: { borderLeftWidth:1, borderRightWidth:1, borderColor:'#3E2723' },
  hudLbl: { color:'#6D4C1F', fontSize:10, fontWeight:'bold' },
  hudV:   { color:'#FFF', fontSize:13, fontWeight:'bold' },
  xpRow:  { flexDirection:'row', alignItems:'center', backgroundColor:'#0A0400', paddingHorizontal:12, paddingVertical:4, gap:6 },
  xpLbl:  { color:'#FFD700', fontSize:10, fontWeight:'bold', minWidth:42 },
  xpBg:   { flex:1, height:6, backgroundColor:'rgba(255,255,255,0.12)', borderRadius:3, overflow:'hidden' },
  xpFill: { height:'100%', backgroundColor:'#FFD700', borderRadius:3 },
  xpTxt:  { color:'#FFD700', fontSize:10, fontWeight:'bold', minWidth:62, textAlign:'right' },
  hudTime:{ color:'#FFD700', fontSize:20, fontWeight:'bold' },
  hpBg:   { width:'80%', height:6, backgroundColor:'#3E2723', borderRadius:3, overflow:'hidden', marginVertical:2 },
  hpFg:   { height:6, borderRadius:3 },

  banner:  { alignItems:'center', paddingVertical:5 },
  bannerT: { color:'#FFF', fontWeight:'bold', fontSize:13 },

  // ── Viewport ──────────────────────────────────────────────
  viewport: {
    flex: 1,                 // fills all space between HUD and controls
    width: VIEWPORT_W,
    backgroundColor: '#5C3D1E',  // matches wall color — no visible gaps
    overflow: 'hidden',
  },

  compass: {
    position:'absolute', top:8, right:12,
    backgroundColor:'rgba(0,0,0,0.6)',
    borderRadius:20, width:36, height:36,
    justifyContent:'center', alignItems:'center',
  },
  compassTxt: { fontSize:20 },

  // ── Controls ──────────────────────────────────────────────
  ctrlWrap: {
    backgroundColor:'#0A0400',
    borderTopWidth:2, borderTopColor:'#6D4C1F',
    paddingTop:8,
    // Account for bottom tab bar + home indicator on iOS
    paddingBottom: Platform.OS === 'ios' ? 90 : 12,
    flexShrink: 0,
  },
  pRow: { flexDirection:'row', justifyContent:'space-around', marginBottom:6, paddingHorizontal:8 },
  pBtn: { backgroundColor:'#3E2723', borderRadius:10, paddingVertical:6, paddingHorizontal:8, alignItems:'center', minWidth:70 },
  pDim: { opacity:0.35 },
  pOn:  { backgroundColor:'#1B5E20' },
  pIco: { fontSize:20 },
  pLbl: { color:'#A1887F', fontSize:10, marginTop:2, textAlign:'center' },

  padLabel: {
    color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    marginBottom: 2,
  },
  dpad: { alignItems:'center' },
  dBtn: {
    backgroundColor:'#3E2723', width:52, height:52, borderRadius:10,
    margin:2, justifyContent:'center', alignItems:'center',
    borderWidth:1, borderColor:'#6D4C1F',
  },
  dCtr: { width:52, height:52, margin:2, justifyContent:'center', alignItems:'center' },

  // ── Menu ──────────────────────────────────────────────────
  menuBody:  { padding:20, paddingBottom:50 },
  tagline:   { color:'#FFD700', fontSize:22, fontWeight:'bold', textAlign:'center', marginBottom:6 },
  desc:      { color:'#A1887F', fontSize:14, textAlign:'center', lineHeight:20, marginBottom:20 },
  box:       { backgroundColor:'#1A0900', borderRadius:12, padding:14, marginBottom:14, borderWidth:1, borderColor:'#3E2723' },
  boxTitle:  { color:'#FFD700', fontWeight:'bold', fontSize:15, marginBottom:10 },
  bTxt:      { color:'#EFEBE9', fontSize:13, marginBottom:4 },
  row:       { flexDirection:'row', alignItems:'center', marginBottom:6 },
  rIco:      { fontSize:18, width:28 },
  rTxt:      { color:'#EFEBE9', fontSize:13, flex:1 },
  secLbl:    { color:'#FFD700', fontSize:15, fontWeight:'bold', marginBottom:10 },
  dRow:      { flexDirection:'row', gap:8, marginBottom:24 },
  mDBtn:     { flex:1, backgroundColor:'#1A0900', borderRadius:12, padding:12, alignItems:'center', borderWidth:2, borderColor:'#3E2723' },
  dBtnOn:    { borderColor:'#FFD700', backgroundColor:'#2C1206' },
  dLbl:      { color:'#FFF', fontWeight:'bold', fontSize:13, marginTop:4 },
  dSub:      { color:'#795548', fontSize:11, marginTop:2 },
  dTb:       { color:'#FFD700', fontSize:12, fontWeight:'bold', marginTop:4 },
  levelUpBanner: { backgroundColor: '#FFF9C4', borderRadius: 8, padding: 10, marginBottom: 10, alignItems: 'center' },
  levelUpTxt:    { color: '#5D4037', fontWeight: 'bold', fontSize: 13 },
  levelUpAdBtn:  { marginTop: 6, backgroundColor: '#FF9800', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  levelUpAdTxt:  { color: 'white', fontWeight: 'bold', fontSize: 13 },
  bigBtn:    { backgroundColor:'#8B4513', borderRadius:12, padding:16, alignItems:'center', borderWidth:1, borderColor:'#FFD700' },
  bigBtnTxt: { color:'#FFD700', fontSize:16, fontWeight:'bold' },

  // ── End screen ────────────────────────────────────────────
  endWrap:   { flex:1, justifyContent:'center', alignItems:'center', padding:24 },
  endTitle:  { color:'#FFD700', fontSize:26, fontWeight:'bold', marginBottom:20 },
  rewardBox: { backgroundColor:'#1A0900', borderRadius:16, padding:20, width:'100%', marginBottom:24, borderWidth:1, borderColor:'#3E2723' },
  rHead:     { color:'#FFD700', fontSize:17, fontWeight:'bold', marginBottom:10, textAlign:'center' },
  rLine:     { color:'#EFEBE9', fontSize:15, marginBottom:6 },
});
