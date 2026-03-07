// screens/games/LaserBlast/LaserBlastGame.tsx
// LaserBlast puzzle game for Diamond Mine properties
// Rotate mirrors to redirect lasers — hit every coal target to win!

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { dbServicePhase2 } from '../../../services/DatabaseServicePhase2';
import { AdMobService } from '../../../services/AdMobService';
import type { GameReward } from '../../../services/DatabaseServicePhase2';
import {
  Cell,
  PuzzleConfig,
  LaserResult,
  LaserColor,
  generatePuzzle,
  fireLasers,
  rotateMirror,
  calculateScore,
  getDifficultyLabel,
  getLaserDifficulty,
  cloneGrid,
  applyHitStates,
  LASER_COLOR_HEX,
  COAL_GLOW_HEX,
} from '../../../utils/LaserBlastEngine';

// ─── Assets ───────────────────────────────────────────────────────────────────
const MINER_IMAGES: Record<LaserColor, any> = {
  red:    require('../../../assets/images/diamond-mine/hazmat-miner-red.png'),
  blue:   require('../../../assets/images/diamond-mine/hazmat-miner-blue.png'),
  green:  require('../../../assets/images/diamond-mine/hazmat-miner-green.png'),
  yellow: require('../../../assets/images/diamond-mine/hazmat-miner-yellow.png'),
};

const MINER_CELEBRATE   = require('../../../assets/images/diamond-mine/hazmat-miner-celebrate.png');
const MIRROR_SLASH      = require('../../../assets/images/diamond-mine/mirror-slash.png');
const MIRROR_BACKSLASH  = require('../../../assets/images/diamond-mine/mirror-backslash.png');
const COAL_LUMP         = require('../../../assets/images/diamond-mine/coal-lump.png');
const COAL_HIT: Record<LaserColor, any> = {
  red:    require('../../../assets/images/diamond-mine/coal-hit-red.png'),
  blue:   require('../../../assets/images/diamond-mine/coal-hit-blue.png'),
  green:  require('../../../assets/images/diamond-mine/coal-hit-green.png'),
  yellow: require('../../../assets/images/diamond-mine/coal-hit-yellow.png'),
};
const DIAMOND_SPARKLE   = require('../../../assets/images/diamond-mine/diamond-sparkle.png');
const ROCK_OBSTACLE     = require('../../../assets/images/diamond-mine/rock-obstacle.png');
const CAVE_FLOOR        = require('../../../assets/images/diamond-mine/cave-floor.png');
const BACKGROUND        = require('../../../assets/images/diamond-mine/diamond-cave-bg.png');

// ─── Types & constants ────────────────────────────────────────────────────────
type GamePhase = 'puzzle' | 'firing' | 'result' | 'celebrating' | 'gameover';

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H  = 80;
const FOOTER_H  = 110;
const PADDING   = 12;
const AVAIL_W   = SW - PADDING * 2;
const AVAIL_H   = SH - HEADER_H - FOOTER_H - PADDING * 2;

const MAX_LIVES = 3;

// A rendered laser beam segment — one cell-width line to draw
interface BeamSegment {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isDot?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LaserBlastGame({ route, navigation }: any) {
  const { property, propertyDetails } = route.params;
  const { user } = useAuth();

  const gameLevel   = propertyDetails?.gameLevel ?? 1;
  const difficulty  = getLaserDifficulty(gameLevel);
  const gridSize    = difficulty.gridSize;
  const timeLimit   = difficulty.timeLimit;
  const tapLimit    = difficulty.tapLimit;
  const TILE_SIZE   = Math.floor(Math.min(AVAIL_W, AVAIL_H) / (gridSize + 2)); // +2 for miner margin

  // ── State ──────────────────────────────────────────────────────────────────
  const [grid, setGrid]           = useState<Cell[][]>([]);
  const [phase, setPhase]         = useState<GamePhase>('puzzle');
  const [timeLeft, setTimeLeft]   = useState(timeLimit);
  const [tapsUsed, setTapsUsed]   = useState(0);
  const [livesLeft, setLivesLeft] = useState(MAX_LIVES);
  const [fireAttempts, setFireAttempts] = useState(0);
  const [beamSegs, setBeamSegs]   = useState<BeamSegment[]>([]);
  const [hitResults, setHitResults] = useState<LaserResult[]>([]);
  const [score, setScore]         = useState(0);
  const [reward, setReward]       = useState<GameReward | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel]   = useState(gameLevel);
  const [adLoading, setAdLoading] = useState(false);
  const [showAdOffer, setShowAdOffer] = useState(false);

  // ── Animated values ────────────────────────────────────────────────────────
  const beamOpacity      = useRef(new Animated.Value(0)).current;
  const celebrateScale   = useRef(new Animated.Value(0)).current;
  const diamondSparkleOp = useRef(new Animated.Value(0)).current;
  // Per-mirror flip animation (0 = slash, 1 = backslash in terms of visual state)
  const mirrorAnims = useRef<Record<string, Animated.Value>>({});

  // ── Refs ───────────────────────────────────────────────────────────────────
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultSaved   = useRef(false);
  const puzzleRef     = useRef<PuzzleConfig | null>(null);
  const adService     = useRef<AdMobService | null>(null);
  // Track live copies of state in refs for use inside closures
  const livesRef      = useRef(MAX_LIVES);
  const timeLeftRef   = useRef(timeLimit);
  const tapsUsedRef   = useRef(0);
  const fireAttemptsRef = useRef(0);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    initNewPuzzle();
    adService.current = new AdMobService();
  }, []);

  function initNewPuzzle() {
    const p = generatePuzzle(gameLevel);
    puzzleRef.current = p;
    setGrid(cloneGrid(p.grid));
    initMirrorAnims(p.grid);
  }

  function initMirrorAnims(g: Cell[][]) {
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const k = `${r},${c}`;
        const isSlash = g[r][c].type === 'mirror-/';
        if (!mirrorAnims.current[k]) {
          mirrorAnims.current[k] = new Animated.Value(isSlash ? 0 : 1);
        } else {
          mirrorAnims.current[k].setValue(isSlash ? 0 : 1);
        }
      }
    }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'puzzle') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        timeLeftRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Mirror tap ─────────────────────────────────────────────────────────────
  const handleCellTap = useCallback((row: number, col: number) => {
    if (phase !== 'puzzle') return;

    const cell = grid[row][col];
    if (cell.type !== 'mirror-/' && cell.type !== 'mirror-\\') return;

    if (tapLimit !== null && tapsUsedRef.current >= tapLimit) return;

    // Animate the mirror flip
    const k = `${row},${col}`;
    const anim = mirrorAnims.current[k];
    if (anim) {
      const isCurrentlySlash = cell.type === 'mirror-/';
      Animated.timing(anim, {
        toValue: isCurrentlySlash ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }

    const newGrid = rotateMirror(grid, row, col);
    setGrid(newGrid);

    tapsUsedRef.current += 1;
    setTapsUsed(tapsUsedRef.current);
  }, [phase, grid, tapLimit]);

  // ── Fire button ────────────────────────────────────────────────────────────
  const handleFire = useCallback(() => {
    if (phase !== 'puzzle' || !puzzleRef.current) return;

    clearInterval(timerRef.current!);
    setPhase('firing');

    const p: PuzzleConfig = { ...puzzleRef.current, grid };
    const fireResult = fireLasers(p);

    fireAttemptsRef.current += 1;
    setFireAttempts(fireAttemptsRef.current);

    // Build beam segments for rendering
    const segments = buildBeamSegments(fireResult.results);
    setBeamSegs(segments);
    setHitResults(fireResult.results);

    // Animate beams in
    beamOpacity.setValue(0);
    Animated.timing(beamOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      // Show hit/miss state on coal
      const updatedGrid = applyHitStates(grid, fireResult.results);
      setGrid(updatedGrid);

      if (fireResult.allHit) {
        // Win!
        setTimeout(() => handleWin(), 600);
      } else {
        // Miss — keep beams visible so player can see where lasers went
        setTimeout(() => {
          const newLives = livesRef.current - 1;
          livesRef.current = newLives;
          setLivesLeft(newLives);
          setPhase('result');
          if (newLives <= 0) {
            setShowAdOffer(true);
          }
          // else: stay in 'result' phase — player taps Retry
        }, 800);
      }
    });
  }, [phase, grid]);

  // ── Build beam segment rects from laser results ───────────────────────────
  // Groups consecutive same-direction cells into single rectangles.
  // At a mirror bounce, ends the run at cell center, drops a corner dot,
  // then starts a new run in the new direction from that same center.
  function buildBeamSegments(results: LaserResult[]): BeamSegment[] {
    const BEAM_W = Math.max(4, TILE_SIZE * 0.15);
    const segs: BeamSegment[] = [];

    for (const result of results) {
      const color = LASER_COLOR_HEX[result.color];
      const cells = result.segments;
      if (cells.length === 0) continue;

      // Start point = entry edge of first cell
      let runStart = cellEdgePt(cells[0].col, cells[0].row, cells[0].entryDir, true);

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const cx = cell.col * TILE_SIZE + TILE_SIZE / 2;
        const cy = cell.row * TILE_SIZE + TILE_SIZE / 2;
        const isTurn = cell.exitDir && cell.exitDir !== cell.entryDir;
        const isLast = i === cells.length - 1;

        if (isTurn) {
          // End run at mirror center, add corner dot, start new run
          segs.push(makeBeamRect(runStart.x, runStart.y, cx, cy, BEAM_W, color));
          segs.push({ x: cx - BEAM_W / 2, y: cy - BEAM_W / 2, width: BEAM_W, height: BEAM_W, color, isDot: true });
          runStart = { x: cx, y: cy };
        } else if (isLast) {
          const endPt = cell.exitDir
            ? cellEdgePt(cell.col, cell.row, cell.exitDir, false)
            : { x: cx, y: cy };
          segs.push(makeBeamRect(runStart.x, runStart.y, endPt.x, endPt.y, BEAM_W, color));
        }
        // else: straight continuation — extend the run on next iteration
      }
    }
    return segs;
  }

  /** Pixel coordinate of a cell's entry or exit edge center */
  function cellEdgePt(col: number, row: number, dir: string, isEntry: boolean): { x: number; y: number } {
    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;
    const h = TILE_SIZE / 2;
    switch (dir) {
      case 'right': return { x: isEntry ? cx - h : cx + h, y: cy };
      case 'left':  return { x: isEntry ? cx + h : cx - h, y: cy };
      case 'down':  return { x: cx, y: isEntry ? cy - h : cy + h };
      case 'up':    return { x: cx, y: isEntry ? cy + h : cy - h };
      default:      return { x: cx, y: cy };
    }
  }

  /** Axis-aligned rectangle between two points */
  function makeBeamRect(x1: number, y1: number, x2: number, y2: number, w: number, color: string): BeamSegment {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: Math.min(x1, x2), y: y1 - w / 2, width: Math.abs(dx) || 1, height: w, color };
    } else {
      return { x: x1 - w / 2, y: Math.min(y1, y2), width: w, height: Math.abs(dy) || 1, color };
    }
  }

  // ── Win ────────────────────────────────────────────────────────────────────
  function handleWin() {
    setPhase('celebrating');

    Animated.parallel([
      Animated.spring(celebrateScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(diamondSparkleOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(); // diamondSparkleOp stays at 1 until Play Again / Exit

    const finalScore = calculateScore({
      gameLevel,
      targetCount: difficulty.targetCount,
      timeRemaining: timeLeftRef.current,
      timeLimit,
      tapsUsed: tapsUsedRef.current,
      tapLimit,
      livesLost: MAX_LIVES - livesRef.current,
      fireAttempts: fireAttemptsRef.current,
    });

    setScore(finalScore.total);
    saveResult(true, finalScore.total, tapsUsedRef.current, timeLeftRef.current);
  }

  // ── Timeout ────────────────────────────────────────────────────────────────
  function handleTimeout() {
    if (phase !== 'puzzle') return;
    setPhase('gameover');
    saveResult(false, 0, tapsUsedRef.current, 0);
  }

  // ── Save result ────────────────────────────────────────────────────────────
  async function saveResult(won: boolean, finalScore: number, finalTaps: number, finalTimeLeft: number) {
    if (resultSaved.current || !user) return;
    resultSaved.current = true;
    try {
      const perfect    = won && fireAttemptsRef.current === 1;
      const levelBefore = propertyDetails?.gameLevel ?? gameLevel;
      const earned = await dbServicePhase2.recordGameResult(
        user.uid, property.id, property.mineType,
        won, perfect, finalScore, finalTimeLeft, finalTaps,
      );
      setReward(earned);

      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      if (updated && updated.gameLevel > levelBefore) {
        setLeveledUp(true);
        setNewLevel(updated.gameLevel);
      }
    } catch (e) {
      console.error('Error saving game result:', e);
    }
  }

  // ── Ad for extra life ─────────────────────────────────────────────────────
  async function handleAdForLife() {
    if (!adService.current) return;
    setAdLoading(true);
    try {
      await adService.current.showAd(
        () => {
          // Rewarded: give 1 life, resume
          livesRef.current = 1;
          setLivesLeft(1);
          setAdLoading(false);
          setShowAdOffer(false);
          const resetGrid = cloneGrid(grid).map(row =>
            row.map(cell => ({ ...cell, isHit: false }))
          );
          setGrid(resetGrid);
          setBeamSegs([]);
          setPhase('puzzle');
        },
        () => {
          // No reward — game over
          setAdLoading(false);
          setShowAdOffer(false);
          setPhase('gameover');
          saveResult(false, 0, tapsUsedRef.current, 0);
        }
      );
    } catch {
      setAdLoading(false);
      setShowAdOffer(false);
      setPhase('gameover');
      saveResult(false, 0, tapsUsedRef.current, 0);
    }
  }

  // ── Restart ────────────────────────────────────────────────────────────────
  function restart() {
    if (timerRef.current) clearInterval(timerRef.current);
    resultSaved.current  = false;
    livesRef.current     = MAX_LIVES;
    tapsUsedRef.current  = 0;
    fireAttemptsRef.current = 0;
    timeLeftRef.current  = timeLimit;

    beamOpacity.setValue(0);
    celebrateScale.setValue(0);
    diamondSparkleOp.setValue(0);

    setPhase('puzzle');
    setTimeLeft(timeLimit);
    setTapsUsed(0);
    setLivesLeft(MAX_LIVES);
    setFireAttempts(0);
    setBeamSegs([]);
    setHitResults([]);
    setScore(0);
    setReward(null);
    setLeveledUp(false);
    setNewLevel(gameLevel);
    setShowAdOffer(false);
    initNewPuzzle();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const GRID_OFFSET = TILE_SIZE; // 1-tile margin for miners on edges
  const GRID_PX     = gridSize * TILE_SIZE;
  const TOTAL_PX    = GRID_PX + GRID_OFFSET * 2;

  const timerColor = timeLeft <= 10 ? '#F44336' : timeLeft <= 20 ? '#FF9800' : '#B9F2FF';

  // ── Early return ───────────────────────────────────────────────────────────
  if (!puzzleRef.current || grid.length === 0) return null;

  const p = puzzleRef.current;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <Image source={BACKGROUND} style={styles.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('PropertyDetail', { property, userId: property.ownerId, refresh: Date.now() })}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnTxt}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.hCenter}>
          <Text style={styles.hTitle}>💎 LaserBlast</Text>
          <Text style={styles.hSub}>
            Level {leveledUp ? newLevel : gameLevel} · {getDifficultyLabel(gameLevel)}
          </Text>
          {/* XP meter */}
          <View style={styles.xpMeterRow}>
            <View style={styles.xpMeterBg}>
              <View style={[styles.xpMeterFill, {
                width: `${Math.min(100, ((propertyDetails?.gameXP ?? 0) / 1000) * 100)}%`,
              }]} />
            </View>
            <Text style={styles.xpMeterTxt}>{propertyDetails?.gameXP ?? 0}/1000 XP</Text>
          </View>
        </View>

        <View style={styles.hRight}>
          <Text style={[styles.timerTxt, { color: timerColor }]}>⏱ {timeLeft}s</Text>
          {/* Lives */}
          <Text style={styles.livesTxt}>
            {Array.from({ length: MAX_LIVES }, (_, i) => i < livesLeft ? '❤️' : '🖤').join('')}
          </Text>
          {tapLimit !== null && (
            <Text style={styles.tapsTxt}>
              👆 {Math.max(0, tapLimit - tapsUsed)} left
            </Text>
          )}
        </View>
      </View>

      {/* ── Grid area ── */}
      <View style={styles.gridOuter}>
        <View style={[styles.gridContainer, { width: TOTAL_PX, height: TOTAL_PX }]}>

          {/* ── Miners on edges ── */}
          {p.miners.map((miner, idx) => {
            const isHit = hitResults[idx]?.hitTarget ?? false;
            const img   = phase === 'celebrating' ? MINER_CELEBRATE : MINER_IMAGES[miner.color];

            let minerStyle: any = {
              position: 'absolute',
              width:  TILE_SIZE * 0.85,
              height: TILE_SIZE * 0.85,
              zIndex: 10,
            };

            // Position miner outside the grid based on edge + position
            switch (miner.edge) {
              case 'left':
                minerStyle.left = TILE_SIZE * 0.075;
                minerStyle.top  = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'right':
                minerStyle.right = TILE_SIZE * 0.075;
                minerStyle.top   = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'top':
                minerStyle.top  = TILE_SIZE * 0.075;
                minerStyle.left = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'bottom':
                minerStyle.bottom = TILE_SIZE * 0.075;
                minerStyle.left   = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
            }

            // Flip miner to face the grid — sprite faces right by default
            if (miner.fireDirection === 'left' || miner.fireDirection === 'up') {
              minerStyle.transform = [{ scaleX: -1 }];
            }

            return (
              <Image
                key={`miner-${idx}`}
                source={img}
                style={minerStyle}
                resizeMode="contain"
              />
            );
          })}

          {/* ── Grid border box ── */}
          <View style={[styles.gridBox, {
            left:   GRID_OFFSET,
            top:    GRID_OFFSET,
            width:  GRID_PX,
            height: GRID_PX,
          }]}>

            {/* ── Tiles ── */}
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const k = `${r},${c}`;
                const isInteractive = cell.type === 'mirror-/' || cell.type === 'mirror-\\';

                // Coal: show colored target image always; diamond sparkle on hit
                const coalMinerColor: LaserColor | null = (() => {
                  if (cell.type !== 'coal' || cell.coalIndex === undefined) return null;
                  return p.miners[cell.coalIndex]?.color ?? null;
                })();

                const coalIsHit: boolean = (() => {
                  if (cell.type !== 'coal' || cell.coalIndex === undefined) return false;
                  return hitResults.find(res => res.minerIndex === cell.coalIndex)?.hitTarget ?? false;
                })();

                const cellImg = (() => {
                  switch (cell.type) {
                    case 'obstacle':  return ROCK_OBSTACLE;
                    case 'coal':
                      if (coalIsHit) return DIAMOND_SPARKLE;
                      return coalMinerColor ? COAL_HIT[coalMinerColor] : COAL_LUMP;
                    case 'mirror-/':  return MIRROR_SLASH;
                    case 'mirror-\\': return MIRROR_BACKSLASH;
                    default:          return null;
                  }
                })();

                return (
                  <TouchableOpacity
                    key={k}
                    activeOpacity={isInteractive ? 0.7 : 1}
                    onPress={() => handleCellTap(r, c)}
                    style={[styles.tile, {
                      width:  TILE_SIZE,
                      height: TILE_SIZE,
                      left:   c * TILE_SIZE,
                      top:    r * TILE_SIZE,
                    }]}
                  >
                    {/* Cave floor base */}
                    <Image source={CAVE_FLOOR} style={styles.tileImg} />

                    {/* Cell content image */}
                    {cellImg && (
                      <Image
                        source={cellImg}
                        style={styles.tileImg}
                        resizeMode="contain"
                      />
                    )}

                    {/* Mirror tap indicator ring */}
                    {isInteractive && phase === 'puzzle' && (
                      <View style={[styles.mirrorRing, {
                        width:  TILE_SIZE - 4,
                        height: TILE_SIZE - 4,
                        borderRadius: (TILE_SIZE - 4) / 2,
                      }]} />
                    )}

                    {/* Coal color glow — subtle halo matching target color */}
                    {cell.type === 'coal' && coalMinerColor && !coalIsHit && (
                      <View style={{
                        position: 'absolute', top: 0, left: 0,
                        width: TILE_SIZE, height: TILE_SIZE,
                        backgroundColor: COAL_GLOW_HEX[coalMinerColor] + '33',
                        borderRadius: TILE_SIZE / 4,
                      }} />
                    )}

                    {/* Diamond glow aura on hit */}
                    {cell.type === 'coal' && coalIsHit && (
                      <Animated.View style={{
                        position: 'absolute', top: 0, left: 0,
                        width: TILE_SIZE, height: TILE_SIZE,
                        backgroundColor: '#B9F2FF44',
                        borderRadius: TILE_SIZE / 4,
                        opacity: diamondSparkleOp,
                      }} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            {/* ── Laser beams overlay ── */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { opacity: beamOpacity, zIndex: 30 }]}
            >
              {beamSegs.map((seg, i) => {
                if (seg.isDot) {
                  return (
                    <View key={i} style={{
                      position: 'absolute', left: seg.x, top: seg.y,
                      width: seg.width, height: seg.height,
                      backgroundColor: seg.color, borderRadius: seg.width / 2,
                      opacity: 0.95, shadowColor: seg.color,
                      shadowOpacity: 1, shadowRadius: 6, elevation: 8,
                    }} />
                  );
                }
                const isHoriz = seg.width > seg.height;
                const coreSize = isHoriz
                  ? { width: seg.width, height: Math.max(2, seg.height * 0.3), top: seg.height * 0.35, left: 0 }
                  : { height: seg.height, width: Math.max(2, seg.width * 0.3), left: seg.width * 0.35, top: 0 };
                return (
                  <View key={i} style={{
                    position: 'absolute', left: seg.x, top: seg.y,
                    width: seg.width, height: seg.height,
                    backgroundColor: seg.color, opacity: 0.8,
                    borderRadius: Math.min(seg.width, seg.height) / 2,
                    shadowColor: seg.color, shadowOpacity: 1, shadowRadius: 8, elevation: 6,
                  }}>
                    <View style={{
                      position: 'absolute', backgroundColor: 'rgba(255,255,255,0.85)',
                      borderRadius: 4, ...coreSize,
                    }} />
                  </View>
                );
              })}
            </Animated.View>

          </View>{/* end gridBox */}
        </View>{/* end gridContainer */}
      </View>{/* end gridOuter */}

      {/* ── Footer ── */}
      <View style={styles.footer}>

        {phase === 'puzzle' && (
          <>
            <Text style={styles.hint}>
              🔄 Tap mirrors to rotate · Press FIRE when ready
            </Text>
            <TouchableOpacity style={styles.fireBtn} onPress={handleFire}>
              <Text style={styles.fireBtnTxt}>🔴 FIRE</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'firing' && (
          <Text style={styles.hint}>⚡ Lasers firing…</Text>
        )}

        {phase === 'result' && (
          <View style={styles.resultPanel}>
            <Text style={styles.loseTitle}>💥 Missed! Adjust your mirrors and try again.</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.fireBtn}
                onPress={() => {
                  const resetGrid = grid.map(row =>
                    row.map(cell => ({ ...cell, isHit: false }))
                  );
                  beamOpacity.setValue(0);
                  setGrid(resetGrid);
                  setBeamSegs([]);
                  setHitResults([]);
                  setPhase('puzzle');
                  timeLeftRef.current = Math.max(1, timeLeftRef.current);
                }}
              >
                <Text style={styles.fireBtnTxt}>🔄 Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'celebrating' && (
          <View style={styles.resultPanel}>
            {leveledUp && (
              <View style={styles.levelUpBanner}>
                <Text style={styles.levelUpTxt}>⬆️ LEVEL UP! Now Level {newLevel}</Text>
              </View>
            )}
            <Text style={styles.winTitle}>💎 All Targets Hit!</Text>
            <Text style={styles.winScore}>
              Score: {score}  ·  Fire: #{fireAttempts}  ·  Taps: {tapsUsed}
            </Text>
            {reward && (
              <View style={styles.rewardRow}>
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardVal}>+{reward.propertyXP}</Text>
                  <Text style={styles.rewardLbl}>XP</Text>
                </View>
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardVal}>+{reward.tb}</Text>
                  <Text style={styles.rewardLbl}>TB</Text>
                </View>
                {reward.shards > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.shards}</Text>
                    <Text style={styles.rewardLbl}>Shards</Text>
                  </View>
                )}
                {reward.pieces > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.pieces}</Text>
                    <Text style={styles.rewardLbl}>Pieces</Text>
                  </View>
                )}
                {reward.stones > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.stones}</Text>
                    <Text style={styles.rewardLbl}>Stones</Text>
                  </View>
                )}
                {reward.diamonds > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.diamonds}</Text>
                    <Text style={styles.rewardLbl}>Diamonds</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={restart}>
                <Text style={styles.btnTxt}>🔄 Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnBlue]}
                onPress={() => navigation.navigate('PropertyDetail', { property, userId: property.ownerId, refresh: Date.now() })}
              >
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'gameover' && !showAdOffer && (
          <View style={styles.resultPanel}>
            <Text style={styles.loseTitle}>💥 Game Over</Text>
            <Text style={styles.hint}>
              {timeLeft <= 0 ? "Time's up! The coal escaped..." : 'The lasers missed their targets...'}
            </Text>
            {reward && (
              <Text style={styles.consolationTxt}>
                +{reward.propertyXP} XP · +{reward.tb} TB (consolation)
              </Text>
            )}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={restart}>
                <Text style={styles.btnTxt}>🔄 Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnBlue]}
                onPress={() => navigation.navigate('PropertyDetail', { property, userId: property.ownerId, refresh: Date.now() })}
              >
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>

      {/* ── Ad offer overlay (0 lives left) ── */}
      {showAdOffer && (
        <View style={styles.adOverlay}>
          <Text style={styles.adTitle}>💀 Out of Lives!</Text>
          <Text style={styles.adHint}>
            Your mirrors are close... watch an ad to get one more life and keep your current layout!
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGold, adLoading && { opacity: 0.6 }]}
            onPress={handleAdForLife}
            disabled={adLoading}
          >
            <Text style={styles.btnTxt}>
              {adLoading ? '⏳ Loading Ad...' : '📺 Watch Ad (+1 Life)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { marginTop: 10 }]}
            onPress={() => {
              setShowAdOffer(false);
              setPhase('gameover');
              saveResult(false, 0, tapsUsedRef.current, 0);
            }}
          >
            <Text style={styles.btnTxt}>🚪 Give Up</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width: SW, height: SH,
    resizeMode: 'cover',
    opacity: 0.45,
  },

  // Header
  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(5, 5, 30, 0.92)',
    borderBottomWidth: 2,
    borderBottomColor: '#B9F2FF',
  },
  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(185,242,255,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B9F2FF',
  },
  backBtnTxt:  { color: '#B9F2FF', fontWeight: 'bold', fontSize: 14 },
  hCenter:     { alignItems: 'center', flex: 1 },
  hTitle:      { color: '#B9F2FF', fontSize: 17, fontWeight: 'bold' },
  hSub:        { color: '#aaa', fontSize: 12, marginTop: 2 },
  hRight:      { alignItems: 'flex-end', minWidth: 72 },
  timerTxt:    { fontSize: 16, fontWeight: 'bold' },
  livesTxt:    { fontSize: 12, marginTop: 3 },
  tapsTxt:     { color: '#FF9800', fontSize: 11, marginTop: 2 },
  xpMeterRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, width: 160 },
  xpMeterBg:   { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  xpMeterFill: { height: '100%', backgroundColor: '#B9F2FF', borderRadius: 3 },
  xpMeterTxt:  { color: '#B9F2FF', fontSize: 9, fontWeight: 'bold', minWidth: 52, textAlign: 'right' },

  // Grid
  gridOuter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    position: 'relative',
  },
  gridBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#B9F2FF',
    borderRadius: 4,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#B9F2FF',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  tile: {
    position: 'absolute',
    overflow: 'hidden',
  },
  tileImg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  mirrorRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(185,242,255,0.3)',
    top: 2,
    left: 2,
  },
  coalGlow: {
    position: 'absolute',
    top: 0, left: 0,
  },

  // Footer
  footer: {
    minHeight: FOOTER_H,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(5, 5, 30, 0.92)',
    borderTopWidth: 2,
    borderTopColor: '#B9F2FF',
    gap: 8,
  },
  hint: { color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Fire button
  fireBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    elevation: 4,
    shadowColor: '#FF3B30',
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  fireBtnTxt: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 2,
  },

  // Result panels
  resultPanel:    { alignItems: 'center', width: '100%', gap: 4 },
  winTitle:       { color: '#B9F2FF', fontSize: 18, fontWeight: 'bold' },
  winScore:       { color: '#eee', fontSize: 12 },
  loseTitle:      { color: '#F44336', fontSize: 18, fontWeight: 'bold' },
  consolationTxt: { color: '#aaa', fontSize: 12 },

  levelUpBanner: {
    backgroundColor: '#B9F2FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 4,
  },
  levelUpTxt: { color: '#0a0a1a', fontWeight: 'bold', fontSize: 14 },

  rewardRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 4,
  },
  rewardItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(185,242,255,0.1)',
    borderWidth: 1,
    borderColor: '#B9F2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 52,
  },
  rewardVal: { color: '#B9F2FF', fontSize: 14, fontWeight: 'bold' },
  rewardLbl: { color: '#aaa', fontSize: 10 },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: {
    backgroundColor: '#B9F2FF',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnBlue: { backgroundColor: '#1a3a5a' },
  btnGold: { backgroundColor: '#F9A825' },
  btnTxt:  { color: '#0a0a1a', fontWeight: 'bold', fontSize: 14 },

  // Ad offer overlay
  adOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 50,
    paddingBottom: 60,
    paddingHorizontal: 24,
    gap: 0,
  },
  adTitle: {
    color: '#FF3B30',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  adHint: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.85,
    lineHeight: 22,
  },
});
