import { useEffect, useRef, useCallback } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { ArmLandmarks } from './useMediaPipePose'
import { Chess } from 'chess.js'
import { classifyGesture } from '../lib/gestureClassifier'
import { KalmanFilter2D } from '../lib/kalmanFilter'
import { coordsToPixel } from '../lib/coordinateMapper'
import { useGameStore } from '../store/gameStore'

const DEBOUNCE_MS = 80        // ms of stable pinch/release before it registers
const GESTURE_MS  = 150       // ms of stable hand gesture before it activates
const FLICK_THRESHOLD = 0.07  // normalized palm displacement to trigger piece selection
const CANCEL_MS   = 250       // ms of holding cancel pose before it fires

const SWEEP_DEAD_ZONE     = 0.01   // min wrist displacement before sweep activates (normalized)
const SWEEP_MAX_STEPS     = 5      // full arm raise (wrist to shoulder dist) = this many squares
const SWEEP_STOP_VEL      = 0.006  // wrist velocity threshold for "arm stopped" (normalized/frame)
const SWEEP_STOP_MS       = 500    // ms of stillness required to commit a sweep
const SWEEP_COOL_MS       = 600    // ms cooldown after selection before anchor can lock
const ANCHOR_SETTLE_MS    = 300    // ms arm must be still to lock the sweep anchor

const KNIGHT_SEQ_MS          = 1200  // ms window after first knight gesture to complete the sequence
const KNIGHT_GESTURE_MS      = 120   // ms a pose must be held before it registers
const HIP_VIS_TURN_THR       = 0.35  // hip visibility below this = body turned sideways
const HIP_VIS_STABLE_THR     = 0.60  // opposite hip must stay above this to confirm turn direction
const KNIGHT_COOLDOWN_MS     = 800   // ms after a knight move before a new sequence can start

type KnightDir = 'jump_fwd' | 'jump_back' | 'turn_left' | 'turn_right'

/** Both wrists clearly above their respective shoulders = cancel selection. */
function isCancelPose(arms: ArmLandmarks): boolean {
  const RAISE_THRESHOLD = 0.10  // wrist must be 10% of frame above shoulder (MediaPipe y: smaller = higher)
  return (
    arms.leftWrist.y  < arms.leftShoulder.y  - RAISE_THRESHOLD &&
    arms.rightWrist.y < arms.rightShoulder.y - RAISE_THRESHOLD
  )
}

/**
 * Find the best bishop destination given a screen-space sweep displacement.
 * sdx/sdy are in screen coordinates (x: right=+, y: down=+, camera mirror already applied).
 */
function findBishopSweepTarget(
  selectedSquare: string,
  legalTargets: string[],
  sdx: number,
  sdy: number,
  sweepMag: number,
  sweepScale: number,        // shoulder-to-anchor distance, body-size invariant
  playerSide: 'white' | 'black'
): string | null {
  if (sweepMag < SWEEP_DEAD_ZONE || legalTargets.length === 0) return null
  const fdx = sdx / sweepMag
  const fdy = sdy / sweepMag
  const fromCol  = 'abcdefgh'.indexOf(selectedSquare[0])
  const fromRank = parseInt(selectedSquare[1])           // 1–8
  // normalizedSweep 0→1 maps to 0→SWEEP_MAX_STEPS squares
  const normalizedSweep = sweepScale > 0 ? sweepMag / sweepScale : 0
  const expectedSteps = Math.max(1, Math.round(normalizedSweep * SWEEP_MAX_STEPS))

  let best: string | null = null
  let bestScore = -Infinity

  for (const sq of legalTargets) {
    const toCol  = 'abcdefgh'.indexOf(sq[0])
    const toRank = parseInt(sq[1])
    const dCol  = toCol  - fromCol
    const dRank = toRank - fromRank
    const steps = Math.abs(dCol)        // bishop: |dCol| === |dRank| always
    if (steps === 0) continue

    // Screen direction: col+ = screen-right, rank+ = screen-up for white
    let screenDirX =  dCol  / steps
    let screenDirY = -(dRank / steps)   // rank+ = up on screen = −Y
    if (playerSide === 'black') { screenDirX = -screenDirX; screenDirY = -screenDirY }

    const alignment = fdx * screenDirX + fdy * screenDirY
    if (alignment <= 0.3) continue     // not pointing this way

    const distScore = 1 - Math.abs(steps - expectedSteps) / 7
    const score = alignment * 0.6 + distScore * 0.4
    if (score > bestScore) { bestScore = score; best = sq }
  }

  return best
}

/**
 * Compute the exact target square for a knight move given a 2-gesture sequence.
 * Jump-first → long side (2 sq) in jump direction, short side (1 sq) in turn direction.
 * Turn-first → long side (2 sq) in turn direction, short side (1 sq) in jump direction.
 */
function findKnightTarget(
  selectedSquare: string,
  legalTargets: string[],
  first: KnightDir,
  second: KnightDir,
  playerSide: 'white' | 'black'
): string | null {
  const fromCol  = 'abcdefgh'.indexOf(selectedSquare[0])
  const fromRank = parseInt(selectedSquare[1])  // 1–8
  let dCol: number, dRank: number
  if (first === 'jump_fwd' || first === 'jump_back') {
    dRank = first  === 'jump_fwd'   ? 2 : -2
    dCol  = second === 'turn_right' ? 1 : -1
  } else {
    dCol  = first  === 'turn_right' ? 2 : -2
    dRank = second === 'jump_fwd'   ? 1 : -1
  }
  if (playerSide === 'black') { dCol = -dCol; dRank = -dRank }
  const targetCol  = fromCol  + dCol
  const targetRank = fromRank + dRank
  if (targetCol < 0 || targetCol > 7 || targetRank < 1 || targetRank > 8) return null
  const targetSq = `${'abcdefgh'[targetCol]}${targetRank}`
  return legalTargets.includes(targetSq) ? targetSq : null
}

/** Return all legal squares reachable by pairing the first gesture with either valid second. */
function knightLegalForFirstGesture(
  selectedSquare: string,
  legalTargets: string[],
  first: KnightDir,
  playerSide: 'white' | 'black'
): string[] {
  const seconds: KnightDir[] = (first === 'jump_fwd' || first === 'jump_back')
    ? ['turn_left', 'turn_right']
    : ['jump_fwd', 'jump_back']
  return seconds
    .map(s => findKnightTarget(selectedSquare, legalTargets, first, s, playerSide))
    .filter((sq): sq is string => sq !== null)
}

/**
 * Order matters — more specific patterns (fewer extended fingers) checked first.
 */
function detectHandGesture(gesture: ReturnType<typeof import('../lib/gestureClassifier').classifyGesture>): string | null {
  if (gesture.isLShape)      return 'n'  // Knight:  thumb + index
  if (gesture.isPeaceSign)   return 'b'  // Bishop:  index + middle
  // if (gesture.isOneIndex)    return 'p'  // Pawn:    index only (disabled — conflicts with knight)
  if (gesture.isFist)        return 'r'  // Rook:    fist
  if (gesture.isFourFingers) return 'k'  // King:    four fingers, no thumb
  if (gesture.isOpenPalm)    return 'q'  // Queen:   all five
  return null
}

/**
 * Given a flick direction (display space, x mirrored),
 * find the current player's piece of the given type that best matches.
 */
function findPieceByFlick(
  pieceType: string,
  dx: number,
  dy: number,
  fen: string,
  turn: 'w' | 'b',
  playerSide: 'white' | 'black'
): string | null {
  const chess = new Chess(fen)
  const squares: string[] = []
  chess.board().forEach((rankArr, rowIdx) => {
    rankArr.forEach((piece, colIdx) => {
      if (piece && piece.type === pieceType && piece.color === turn) {
        squares.push(`${'abcdefgh'[colIdx]}${8 - rowIdx}`)
      }
    })
  })

  if (squares.length === 0) return null
  if (squares.length === 1) return squares[0]

  const flickMag = Math.sqrt(dx * dx + dy * dy)
  if (flickMag < 0.001) return null
  const fdx = dx / flickMag
  const fdy = dy / flickMag

  const centerCol = 3.5
  const centerRow = 3.5
  let best: string | null = null
  let bestDot = -Infinity

  for (const sq of squares) {
    const col = 'abcdefgh'.indexOf(sq[0])
    const row = 8 - parseInt(sq[1])
    let boardDx = col - centerCol
    let boardDy = row - centerRow
    if (playerSide === 'black') { boardDx = -boardDx; boardDy = -boardDy }
    const mag = Math.sqrt(boardDx * boardDx + boardDy * boardDy)
    if (mag < 0.01) continue
    const dot = fdx * (boardDx / mag) + fdy * (boardDy / mag)
    if (dot > bestDot) { bestDot = dot; best = sq }
  }

  return best
}

export function useGesture(
  landmarks: NormalizedLandmark[] | null,
  poseLandmarksRef: { current: ArmLandmarks | null },
  containerRef: React.RefObject<HTMLElement>
) {
  const { calibration, setCursor, setGestureState, gestureState, playerSide, armModeEnabled } = useGameStore()
  const kalman = useRef(new KalmanFilter2D(0.005, 0.30))
  const pinchSince   = useRef<number | null>(null)
  const releaseSince = useRef<number | null>(null)
  // Single object tracking whichever piece-gesture is currently active
  const activeGesture = useRef<{
    pieceType: string
    since: number
    anchor: { x: number; y: number } | null
    fired: boolean
  } | null>(null)
  const noHandSince = useRef<number | null>(null)
  const lastSquareRef = useRef<string | null>(null)
  const grabbedSquareRef = useRef<string | null>(null)
  const cancelSince = useRef<number | null>(null)
  const cancelCooldownUntil = useRef(0)  // timestamp: reject new gestures until after cancel cooldown
  const sweepCooldownUntil  = useRef(0)  // timestamp: bishop selected, wait before locking anchor
  const anchorSettleSince   = useRef<number | null>(null)  // when arm first went still post-cooldown
  const wristAnchorRef      = useRef<{ x: number; y: number } | null>(null)  // locked sweep origin
  const sweepScaleRef       = useRef(0)  // shoulder-to-anchor dist at lock time (body-size invariant)
  const lastWristRef        = useRef<{ x: number; y: number } | null>(null)  // for velocity
  const sweepStillSince     = useRef<number | null>(null)  // timestamp when arm first went still on target

  const hipSpanBaselineRef  = useRef<number | null>(null)  // EMA of hip span for jump detection
  const knightSeq = useRef<{ first: KnightDir; since: number } | null>(null)  // active sequence
  const knightCooldownUntil = useRef(0)   // timestamp: ignore new sequences until after this
  const knightGestureRef    = useRef<{ dir: KnightDir; since: number; processed: boolean } | null>(null)

  // ── Read arm destination without adding it to the dep array ────────────
  // Critical: if we read armDestinationSquare from the hook's reactive
  // destructure, it appears in the dep array and re-runs this effect on
  // every store write from ArmMotionRecorder, resetting the release buffer
  // mid-grab and breaking pinch detection. Instead we call getState()
  // directly inside the effect — always fresh, never causes re-renders.


  const onSelectSquare = useRef<((sq: string) => boolean) | null>(null)
  const onDropSquare = useRef<((from: string, to: string) => void) | null>(null)

  const registerHandlers = useCallback((
    select: (sq: string) => boolean,
    drop: (from: string, to: string) => void
  ) => {
    onSelectSquare.current = select
    onDropSquare.current = drop
  }, [])

  useEffect(() => {
    if (!landmarks) {
      setCursor({ visible: false })
      pinchSince.current = null
      releaseSince.current = null

      if (noHandSince.current === null) {
        noHandSince.current = performance.now()
      } else if (performance.now() - noHandSince.current > 2000) {
        // 2 seconds with no hand → clear all selections and highlights
        useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
        useGameStore.getState().setHandGesturePieceType(null)
        useGameStore.getState().setSweepPreviewSquare(null)
        useGameStore.getState().setKnightPreviewSquares([])
        activeGesture.current = null
        grabbedSquareRef.current = null
        sweepCooldownUntil.current = 0
        wristAnchorRef.current = null
        sweepScaleRef.current = 0
        lastWristRef.current   = null
        anchorSettleSince.current  = null
        sweepStillSince.current = null
        knightSeq.current = null
        knightGestureRef.current = null
        hipSpanBaselineRef.current = null
        knightCooldownUntil.current = 0
        setGestureState('idle')
        noHandSince.current = null
      }
      return
    }

    noHandSince.current = null

    const gesture = classifyGesture(landmarks)

    const raw = gesture.indexTip
    const smoothed = kalman.current.update(raw.x, raw.y)
    const { px, py } = coordsToPixel(smoothed.x, smoothed.y, window.innerWidth, window.innerHeight)

    let squareName: string | null = null
    const boardEl = document.querySelector('[data-board]')
    if (boardEl) {
      const r = boardEl.getBoundingClientRect()
      const bx = (px - r.left) / r.width
      const by = (py - r.top) / r.height
      if (bx >= 0 && bx <= 1 && by >= 0 && by <= 1) {
        const screenCol = Math.min(7, Math.max(0, Math.floor(bx * 8)))
        const screenRow = Math.min(7, Math.max(0, Math.floor(by * 8)))
        const boardCol = playerSide === 'black' ? 7 - screenCol : screenCol
        const boardRow = playerSide === 'black' ? 7 - screenRow : screenRow
        const candidate = `${'abcdefgh'[boardCol]}${8 - boardRow}`
        if (candidate !== lastSquareRef.current) {
          const sqW = r.width / 8
          const sqH = r.height / 8
          const prevCol = lastSquareRef.current ? 'abcdefgh'.indexOf(lastSquareRef.current[0]) : -99
          const prevRow = lastSquareRef.current ? 8 - parseInt(lastSquareRef.current[1]) : -99
          const dx = Math.abs(boardCol - prevCol) * sqW
          const dy = Math.abs(boardRow - prevRow) * sqH
          if (dx >= sqW * 0.5 || dy >= sqH * 0.5 || lastSquareRef.current === null) {
            lastSquareRef.current = candidate
          }
        }
        squareName = lastSquareRef.current
      } else {
        lastSquareRef.current = null
      }
    }

    // ── Arm mode: hand gestures select pieces, no cursor/pinch ──
    if (armModeEnabled) {
      // Clear squareName so stale cursor position never triggers isDropTarget/isHovered
      setCursor({ visible: false, squareName: null })

      // ── Grabbing state: watch for cancel pose (both wrists raised) ──
      if (gestureState === 'grabbing') {
        const arms = poseLandmarksRef.current
        if (arms && isCancelPose(arms)) {
          if (cancelSince.current === null) cancelSince.current = performance.now()
        } else {
          cancelSince.current = null
        }
        if (cancelSince.current !== null && performance.now() - cancelSince.current >= CANCEL_MS) {
          useGameStore.getState().addGestureLog('Cancel — selection cleared')
          useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
          useGameStore.getState().setSweepPreviewSquare(null)
          useGameStore.getState().setKnightPreviewSquares([])
          grabbedSquareRef.current = null
          cancelSince.current = null
          activeGesture.current = null
          sweepCooldownUntil.current = 0
          wristAnchorRef.current = null
          sweepScaleRef.current = 0
          lastWristRef.current   = null
          anchorSettleSince.current  = null
          sweepStillSince.current = null
          knightSeq.current = null
          knightGestureRef.current = null
          knightCooldownUntil.current = 0
          cancelCooldownUntil.current = performance.now() + 1500  // 1500ms cooldown after cancel
          setGestureState('idle')
          return
        }

        // ── Bishop arm sweep ──────────────────────────────────────────────
        const { selectedSquare, legalTargets, fen } = useGameStore.getState().game
        if (selectedSquare && arms) {
          const chess = new Chess(fen)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const piece = chess.get(selectedSquare as any)
          if (piece?.type === 'b') {
            const wrist = arms.rightWrist

            // Always track velocity for phase detection
            const vx = lastWristRef.current ? -(wrist.x - lastWristRef.current.x) : 0
            const vy = lastWristRef.current ?   wrist.y - lastWristRef.current.y  : 0
            const velocity = Math.sqrt(vx * vx + vy * vy)
            lastWristRef.current = { x: wrist.x, y: wrist.y }

            // Phase 1: cooldown — arm descending to rest, no sweep yet
            if (performance.now() < sweepCooldownUntil.current) {
              useGameStore.getState().setSweepPreviewSquare(null)
            // Phase 2: waiting for arm to settle before locking anchor
            } else if (!wristAnchorRef.current) {
              if (velocity < SWEEP_STOP_VEL) {
                if (anchorSettleSince.current === null) {
                  anchorSettleSince.current = performance.now()
                } else if (performance.now() - anchorSettleSince.current >= ANCHOR_SETTLE_MS) {
                  // Arm has been still long enough — lock anchor here
                  wristAnchorRef.current = { x: wrist.x, y: wrist.y }
                  // Compute body-size-invariant scale: distance from anchor to right shoulder
                  const dsX = wrist.x - arms.rightShoulder.x
                  const dsY = wrist.y - arms.rightShoulder.y
                  sweepScaleRef.current = Math.sqrt(dsX * dsX + dsY * dsY) || 0.1
                  anchorSettleSince.current = null
                }
              } else {
                anchorSettleSince.current = null
              }
              useGameStore.getState().setSweepPreviewSquare(null)
            // Phase 3: anchor locked — measure sweep displacement and show preview
            } else {
              const sdx = -(wrist.x - wristAnchorRef.current.x)
              const sdy =   wrist.y - wristAnchorRef.current.y
              const sweepMag = Math.sqrt(sdx * sdx + sdy * sdy)

              const target = findBishopSweepTarget(
                selectedSquare, legalTargets, sdx, sdy, sweepMag, sweepScaleRef.current, playerSide
              )
              useGameStore.getState().setSweepPreviewSquare(target)

              if (target) {
                if (velocity < SWEEP_STOP_VEL) {
                  if (sweepStillSince.current === null) {
                    sweepStillSince.current = performance.now()
                  } else if (performance.now() - sweepStillSince.current >= SWEEP_STOP_MS) {
                    // Commit the move
                    if (onDropSquare.current && grabbedSquareRef.current) {
                      useGameStore.getState().addGestureLog(`Sweep commit: ${grabbedSquareRef.current} → ${target}`)
                      onDropSquare.current(grabbedSquareRef.current, target)
                    }
                    useGameStore.getState().setSweepPreviewSquare(null)
                    sweepCooldownUntil.current = 0
                    wristAnchorRef.current = null
                    sweepScaleRef.current = 0
                    lastWristRef.current   = null
                    anchorSettleSince.current  = null
                    sweepStillSince.current = null
                    grabbedSquareRef.current = null
                    setGestureState('idle')
                    return
                  }
                } else {
                  sweepStillSince.current = null
                }
              } else {
                sweepStillSince.current = null
              }
            }
          } else if (piece?.type === 'n' && arms) {
            // ── Knight dual-gesture sequence ───────────────────────────────
            useGameStore.getState().setSweepPreviewSquare(null)

            const hipSpan = Math.abs(arms.leftHip.x - arms.rightHip.x)

            // Update EMA baseline slowly — only when outside a sequence and cooldown
            if (!knightSeq.current && performance.now() > knightCooldownUntil.current) {
              hipSpanBaselineRef.current = hipSpanBaselineRef.current === null
                ? hipSpan
                : hipSpanBaselineRef.current * 0.97 + hipSpan * 0.03
            }

            // Expire timed-out sequence
            if (knightSeq.current && performance.now() - knightSeq.current.since > KNIGHT_SEQ_MS) {
              useGameStore.getState().addGestureLog(`Knight sequence expired (>${KNIGHT_SEQ_MS}ms)`)
              knightSeq.current = null
              useGameStore.getState().setKnightPreviewSquares([])
            }

            // Classify current-frame gesture
            const baseline = hipSpanBaselineRef.current ?? hipSpan
            let frameDir: KnightDir | null = null
            if (baseline > 0.01) {
              const rel = (hipSpan - baseline) / baseline
              if      (rel > 0) frameDir = 'jump_fwd'
              else if (rel < 0) frameDir = 'jump_back'
            }
            if (!frameDir) {
              const leftVis  = arms.leftHip.visibility  ?? 1
              const rightVis = arms.rightHip.visibility ?? 1
              if      (rightVis < HIP_VIS_TURN_THR && leftVis  > HIP_VIS_STABLE_THR) frameDir = 'turn_right'
              else if (leftVis  < HIP_VIS_TURN_THR && rightVis > HIP_VIS_STABLE_THR) frameDir = 'turn_left'
            }

            // Debounce: hold gesture for KNIGHT_GESTURE_MS before registering
            if (frameDir !== null) {
              const cur = knightGestureRef.current
              if (!cur || cur.dir !== frameDir) {
                knightGestureRef.current = { dir: frameDir, since: performance.now(), processed: false }
              } else if (!cur.processed && performance.now() - cur.since >= KNIGHT_GESTURE_MS) {
                cur.processed = true
                if (performance.now() > knightCooldownUntil.current) {
                  const dir = cur.dir
                  if (!knightSeq.current) {
                    // First gesture — start sequence and preview which squares are reachable
                    knightSeq.current = { first: dir, since: performance.now() }
                    const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                    const previews = sel ? knightLegalForFirstGesture(sel, legal, dir, playerSide) : []
                    if (sel) useGameStore.getState().setKnightPreviewSquares(previews)
                    useGameStore.getState().addGestureLog(`Knight 1st gesture: ${dir} → previewing ${previews.join(', ') || 'none'}`)
                  } else {
                    const firstAxis  = knightSeq.current.first.startsWith('jump') ? 'jump' : 'turn'
                    const secondAxis = dir.startsWith('jump') ? 'jump' : 'turn'
                    if (firstAxis !== secondAxis) {
                      // Second gesture on perpendicular axis — fire the move
                      const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                      const target = sel
                        ? findKnightTarget(sel, legal, knightSeq.current.first, dir, playerSide)
                        : null
                      useGameStore.getState().addGestureLog(
                        `Knight 2nd gesture: ${dir} → move: ${sel} → ${target ?? 'illegal'}`
                      )
                      if (target && onDropSquare.current && grabbedSquareRef.current) {
                        onDropSquare.current(grabbedSquareRef.current, target)
                      }
                      useGameStore.getState().setKnightPreviewSquares([])
                      knightSeq.current = null
                      knightGestureRef.current = null
                      knightCooldownUntil.current = performance.now() + KNIGHT_COOLDOWN_MS
                      grabbedSquareRef.current = null
                      setGestureState('idle')
                      return
                    } else {
                      // Same axis — restart sequence with the new gesture
                      useGameStore.getState().addGestureLog(`Knight sequence restart: ${dir} (same axis)`)
                      knightSeq.current = { first: dir, since: performance.now() }
                      const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                      if (sel) useGameStore.getState().setKnightPreviewSquares(
                        knightLegalForFirstGesture(sel, legal, dir, playerSide)
                      )
                    }
                  }
                }
              }
            } else {
              knightGestureRef.current = null
            }
          } else {
            // Non-bishop, non-knight piece — clear any stale previews
            useGameStore.getState().setSweepPreviewSquare(null)
            useGameStore.getState().setKnightPreviewSquares([])
          }
        }

        return
      }

      cancelSince.current = null

      // Block gestures during post-cancel cooldown
      const inCooldown = performance.now() < cancelCooldownUntil.current

      // Only recognize hand gestures when at least one hand is clearly above the hip midpoint.
      // Prevents accidental triggers when both arms are resting at the side.
      // Falls back to allowing recognition if pose data is absent or hip visibility is low.
      const HAND_ABOVE_HIP_MARGIN = 0.05  // wrist must be at least 5% above hip (MediaPipe y: smaller = higher)
      const HIP_VIS_MIN = 0.50            // minimum hip visibility to trust the y coordinate
      const poseArms = poseLandmarksRef.current
      const hipsVisible = poseArms
        && (poseArms.leftHip.visibility  ?? 1) > HIP_VIS_MIN
        && (poseArms.rightHip.visibility ?? 1) > HIP_VIS_MIN
      const hipMidY = hipsVisible ? (poseArms!.leftHip.y + poseArms!.rightHip.y) / 2 : null
      const highestWristY = poseArms ? Math.min(poseArms.leftWrist.y, poseArms.rightWrist.y) : null
      const handAboveHip = (hipMidY !== null && highestWristY !== null)
        ? highestWristY < hipMidY - HAND_ABOVE_HIP_MARGIN
        : true  // no pose data or hips not visible → don't block

      const detectedType = (inCooldown || !handAboveHip) ? null : detectHandGesture(gesture)

      if (detectedType) {
        const cur = activeGesture.current
        if (!cur || cur.pieceType !== detectedType) {
          activeGesture.current = { pieceType: detectedType, since: performance.now(), anchor: null, fired: false }
          // no-op on same gesture: since stays the same, timer keeps running
        }
      } else {
        if (activeGesture.current) {
          activeGesture.current = null
          useGameStore.getState().setHandGesturePieceType(null)
        }
      }

      const cur = activeGesture.current
      if (cur && performance.now() - cur.since >= GESTURE_MS && !cur.fired) {
        const { fen, turn } = useGameStore.getState().game
        const chess = new Chess(fen)
        const matchingSquares: string[] = []
        chess.board().forEach((rankArr, rowIdx) => {
          rankArr.forEach((piece, colIdx) => {
            if (piece && piece.type === cur.pieceType && piece.color === turn) {
              matchingSquares.push(`${'abcdefgh'[colIdx]}${8 - rowIdx}`)
            }
          })
        })

        if (matchingSquares.length === 1) {
          // Only one piece of this type — auto-select immediately without a flick
          cur.fired = true
          const targetSq = matchingSquares[0]
          if (onSelectSquare.current) {
            const selected = onSelectSquare.current(targetSq)
            if (selected) {
              useGameStore.getState().addGestureLog(`Gesture: ${cur.pieceType.toUpperCase()} → select ${targetSq} (auto)`)
              // Start cooldown — user needs 600ms to lower arm to rest before sweep begins
              if (cur.pieceType === 'b') {
                sweepCooldownUntil.current = performance.now() + SWEEP_COOL_MS
                wristAnchorRef.current = null
                anchorSettleSince.current  = null
                lastWristRef.current = poseLandmarksRef.current
                  ? { x: poseLandmarksRef.current.rightWrist.x, y: poseLandmarksRef.current.rightWrist.y }
                  : null
              }
              grabbedSquareRef.current = targetSq
              setGestureState('grabbing')
            }
          }
          activeGesture.current = null
          useGameStore.getState().setHandGesturePieceType(null)
        } else if (matchingSquares.length > 1) {
          // Multiple pieces — highlight them and wait for a directional flick
          useGameStore.getState().setHandGesturePieceType(cur.pieceType)

          const palm = gesture.palmCenter
          if (!cur.anchor) {
            cur.anchor = { x: palm.x, y: palm.y }
          }

          const dx = -(palm.x - cur.anchor.x)
          const dy = palm.y - cur.anchor.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > FLICK_THRESHOLD) {
            cur.fired = true
            const targetSq = findPieceByFlick(cur.pieceType, dx, dy, fen, turn, playerSide)
            if (targetSq && onSelectSquare.current) {
              const selected = onSelectSquare.current(targetSq)
              if (selected) {
                useGameStore.getState().addGestureLog(`Gesture: ${cur.pieceType.toUpperCase()} → flick → select ${targetSq}`)
                // Start cooldown — user needs 600ms to lower arm to rest before sweep begins
                if (cur.pieceType === 'b') {
                  sweepCooldownUntil.current = performance.now() + SWEEP_COOL_MS
                  wristAnchorRef.current = null
                  anchorSettleSince.current  = null
                  lastWristRef.current = poseLandmarksRef.current
                    ? { x: poseLandmarksRef.current.rightWrist.x, y: poseLandmarksRef.current.rightWrist.y }
                    : null
                }
                grabbedSquareRef.current = targetSq
                setGestureState('grabbing')
              }
            }
            activeGesture.current = null
            useGameStore.getState().setHandGesturePieceType(null)
          }
        }
      }
      return
    }

    // ── Normal pinch/cursor mode ──────────────────────────────────────────
    // Ensure gesture state is clean when arm mode is off
    activeGesture.current = null
    useGameStore.getState().setHandGesturePieceType(null)

    setCursor({ x: px, y: py, squareName, visible: true })

    if (gesture.isPinching) {
      if (pinchSince.current === null) pinchSince.current = performance.now()
      releaseSince.current = null
    } else {
      if (releaseSince.current === null) releaseSince.current = performance.now()
      pinchSince.current = null
    }

    const stablePinch   = pinchSince.current   !== null && performance.now() - pinchSince.current   >= DEBOUNCE_MS
    const stableRelease = releaseSince.current !== null && performance.now() - releaseSince.current >= DEBOUNCE_MS

    if (gestureState === 'idle' || gestureState === 'hovering') {
      setGestureState(squareName ? 'hovering' : 'idle')

      if (stablePinch && squareName && onSelectSquare.current) {
        const selected = onSelectSquare.current(squareName)
        if (selected) {
          grabbedSquareRef.current = squareName
          setGestureState('grabbing')
          pinchSince.current = null
        }
      }
    } else if (gestureState === 'grabbing') {
      const dropTarget = squareName

      if (stableRelease && grabbedSquareRef.current && dropTarget) {
        // Release over origin square = cancel selection (no move)
        if (dropTarget === grabbedSquareRef.current) {
          useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
          if (armModeEnabled) {
            useGameStore.getState().setArmDestinationSquare(null)
          }
          grabbedSquareRef.current = null
          setGestureState('idle')
          releaseSince.current = null
          return
        }

        if (!onDropSquare.current) return
        onDropSquare.current(grabbedSquareRef.current, dropTarget)
        if (armModeEnabled) {
          useGameStore.getState().setArmDestinationSquare(null)
        }
        grabbedSquareRef.current = null
        setGestureState('idle')
        releaseSince.current = null
      }
    }
  }, [landmarks, calibration, gestureState, setCursor, setGestureState, containerRef, playerSide, armModeEnabled])

  return { registerHandlers }
}
