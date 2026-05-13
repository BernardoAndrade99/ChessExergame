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
const CANCEL_MS   = 250       // ms of holding cancel pose before it fires
const SWEEP_DEBOUNCE_MS     = 250   // ms a sweep target must be stable before committing
const POST_DROP_COOLDOWN_MS = 700   // ms to block gesture detection after any drop

const SWEEP_DEAD_ZONE     = 0.01   // min wrist displacement before sweep activates (normalized)
const SWEEP_MAX_STEPS     = 5      // full arm raise (wrist to shoulder dist) = this many squares

const KNIGHT_GESTURE_MS      = 120   // ms a pose must be held before it registers
const NOSE_TURN_THR           = 0.07  // nose X offset from shoulder midpoint to detect body turn
const KNIGHT_COOLDOWN_MS     = 800   // ms after a knight move before a new sequence can start
const HIP_LIFTOFF_VEL        = 0.14  // shoulder-midpoint Y velocity (normalized/SECOND) to detect liftoff
const HIP_LAND_VEL           = 0.08  // shoulder-midpoint Y velocity (normalized/SECOND) below which = landed
const JUMP_LATCH_MS          = 800   // ms to hold a detected jump direction for the debounce window
const MIN_AIRBORNE_MS        = 150   // minimum ms in airborne phase to avoid single-frame noise

type KnightDir = 'jump_fwd' | 'jump_back' | 'turn_left' | 'turn_right'
type SweepPiece = 'b' | 'r' | 'q' | 'k' | 'p' | 'n'

/** Both wrists clearly above their respective shoulders = cancel selection. */
function isCancelPose(arms: ArmLandmarks): boolean {
  const RAISE_THRESHOLD = 0.10  // wrist must be 10% of frame above shoulder (MediaPipe y: smaller = higher)
  return (
    arms.leftWrist.y  < arms.leftShoulder.y  - RAISE_THRESHOLD &&
    arms.rightWrist.y < arms.rightShoulder.y - RAISE_THRESHOLD
  )
}

/** Arms crossed in an X near chest level (used as castling trigger while king is grabbed). */
function isCastleXPose(arms: ArmLandmarks): boolean {
  const shouldersCrossed = arms.leftWrist.x > arms.rightWrist.x
  const wristYClose = Math.abs(arms.leftWrist.y - arms.rightWrist.y) < 0.20
  const shoulderMidY = (arms.leftShoulder.y + arms.rightShoulder.y) / 2
  const hipMidY = (arms.leftHip.y + arms.rightHip.y) / 2
  const wristsInBand =
    arms.leftWrist.y > shoulderMidY - 0.16 &&
    arms.leftWrist.y < hipMidY + 0.10 &&
    arms.rightWrist.y > shoulderMidY - 0.16 &&
    arms.rightWrist.y < hipMidY + 0.10
  return shouldersCrossed && wristYClose && wristsInBand
}

function getCastleTargets(
  selectedSquare: string,
  legalTargets: string[],
): string[] {
  const fromCol = 'abcdefgh'.indexOf(selectedSquare[0])
  const fromRank = selectedSquare[1]
  if (fromCol < 0) return []
  return legalTargets.filter((sq) => {
    const toCol = 'abcdefgh'.indexOf(sq[0])
    return sq[1] === fromRank && Math.abs(toCol - fromCol) === 2
  })
}

function chooseCastleTarget(
  selectedSquare: string,
  castleTargets: string[],
  preferredTarget: string | null,
): string | null {
  if (castleTargets.length === 0) return null
  if (preferredTarget && castleTargets.includes(preferredTarget)) return preferredTarget
  if (castleTargets.length === 1) return castleTargets[0]
  const fromCol = 'abcdefgh'.indexOf(selectedSquare[0])
  const sorted = [...castleTargets].sort((a, b) => {
    const da = 'abcdefgh'.indexOf(a[0]) - fromCol
    const db = 'abcdefgh'.indexOf(b[0]) - fromCol
    return db - da
  })
  // If both castles are legal and X has no side hint, default to king-side.
  return sorted[0]
}


/** Find the best destination for sweep-controlled pieces (including knight in non-step mode). */
function findSweepTarget(
  pieceType: SweepPiece,
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

  let best: string | null = null
  let bestScore = -Infinity

  for (const sq of legalTargets) {
    const toCol  = 'abcdefgh'.indexOf(sq[0])
    const toRank = parseInt(sq[1])
    const dCol  = toCol  - fromCol
    const dRank = toRank - fromRank
    if (dCol === 0 && dRank === 0) continue

    const diag = Math.abs(dCol) === Math.abs(dRank)
    const orth = dCol === 0 || dRank === 0

    if (pieceType === 'b' && !diag) continue
    if (pieceType === 'r' && !orth) continue
    if (pieceType === 'k' && (!orth && !diag)) continue

    // Pawn sweep: allow straight pushes (1-2) and diagonal forward captures (1).
    if (pieceType === 'p') {
      const absCol = Math.abs(dCol)
      const absRank = Math.abs(dRank)
      const forwardOk = playerSide === 'white' ? dRank > 0 : dRank < 0
      const isStraightPush = dCol === 0 && (absRank === 1 || absRank === 2)
      const isDiagonalCapture = absCol === 1 && absRank === 1
      if (!forwardOk || (!isStraightPush && !isDiagonalCapture)) continue
    }

    const steps = Math.max(Math.abs(dCol), Math.abs(dRank))
    if (steps === 0) continue

    // Screen direction: col+ = screen-right, rank+ = screen-up for white
    let screenDirX =  dCol  / steps
    let screenDirY = -(dRank / steps)   // rank+ = up on screen = −Y
    if (playerSide === 'black') { screenDirX = -screenDirX; screenDirY = -screenDirY }

    const alignment = fdx * screenDirX + fdy * screenDirY
    if (alignment <= 0.3) continue     // not pointing this way

    const normalizedSweep = sweepScale > 0 ? sweepMag / sweepScale : 0
    const expectedSteps = pieceType === 'k'
      ? (normalizedSweep > 0.5 ? 2 : 1)
      : pieceType === 'n'
        ? 2
      : pieceType === 'p'
        ? (Math.abs(dCol) === 1 ? 1 : (normalizedSweep > 0.46 ? 2 : 1))
        : Math.max(1, Math.round(normalizedSweep * SWEEP_MAX_STEPS))
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
  if (gesture.isOneIndex)    return 'p'  // Pawn:    index only (no thumb, index only)
  if (gesture.isFist)        return 'r'  // Rook:    fist
  if (gesture.isFourFingers) return 'k'  // King:    four fingers, no thumb
  if (gesture.isOpenPalm)    return 'q'  // Queen:   all five
  return null
}

export function useGesture(
  landmarks: NormalizedLandmark[] | null,
  poseLandmarksRef: { current: ArmLandmarks | null },
  containerRef: React.RefObject<HTMLElement>,
  _userLeftHandRef:  { current: NormalizedLandmark[] | null } = { current: null },
  userRightHandRef: { current: NormalizedLandmark[] | null } = { current: null }
) {
  const {
    calibration,
    setCursor,
    setGestureState,
    gestureState,
    playerSide,
    armModeEnabled,
  } = useGameStore()
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
  const hipPrevYRef            = useRef<number | null>(null)          // previous hip midY for velocity
  const hipPrevTimestampRef    = useRef<number | null>(null)          // timestamp of prev hip sample (FPS-independent velocity)
  const hipPhaseRef            = useRef<'idle' | 'airborne'>('idle')  // jump phase state machine
  const airborneStartRef       = useRef<number | null>(null)          // when airborne phase started (min duration guard)
  const hipJumpAnchorRef       = useRef<{ span: number; y: number } | null>(null)  // liftoff snapshot
  const jumpDirLatchRef        = useRef<{ dir: KnightDir; until: number } | null>(null)  // post-landing latch
  const lastHipYRef            = useRef<number | null>(null)           // last valid hip midY (survives arm dropout)
  const lastHipSpanRef         = useRef<number | null>(null)           // last valid hip span (survives arm dropout)
  const lastNoseOffsetRef      = useRef<number>(0)  // cached: nose.x minus shoulder midX (turn detection)
  const lastLoggedNoseOffsetRef = useRef<number>(999)  // last value we actually logged
  const lastStateSummaryRef    = useRef<string>('')  // last printed state summary (throttle debug spam)
  const lastDebugUpdateRef     = useRef(0)
  const knightSeq              = useRef<{ first: KnightDir; since: number } | null>(null)  // active sequence
  const knightCooldownUntil    = useRef(0)   // timestamp: ignore new sequences until after this
  const turnGestureRef         = useRef<{ dir: KnightDir; since: number; processed: boolean } | null>(null)  // owned exclusively by turn classifier
  const turnSuppressJumpUntilRef = useRef(0) // suppress jump liftoff while body is turning
  const wasTurningRef          = useRef(false)
  const pawnColumnRef          = useRef<{ count: number; since: number } | null>(null)  // active finger count for pawn column selection
  const pawnColumnChoiceRef    = useRef<{ file: string; index: number; total: number } | null>(null) // cycle when a file has multiple pawns
  const pawnLockRef            = useRef(false)  // true while user is counting fingers to pick a pawn — locks other piece gestures
  const oneHandPickRef         = useRef<{ pieceType: string; candidates: string[] } | null>(null)
  const leftFistPrevRef        = useRef(false)
  const rightFistPrevRef       = useRef(false)
  const castleXPosePrevRef     = useRef(false)
  const stepAnchorRef          = useRef<{ x: number; y: number; span: number; square: string; piece: 'k' | 'p' } | null>(null)
  const knightStepAnchorRef    = useRef<{ x: number; y: number; span: number; square: string } | null>(null)
  const knightStepStateRef     = useRef<-1 | 0 | 1>(0)
  const leftWristPrevRef       = useRef<{ x: number; y: number } | null>(null)
  const rightWristPrevRef      = useRef<{ x: number; y: number } | null>(null)
  const leftSwipeCooldownUntilRef  = useRef(0)
  const rightSwipeCooldownUntilRef = useRef(0)
  const postDropCooldownUntil     = useRef(0)                      // timestamp: block gesture detection after a drop
  const postSelectCooldownUntil   = useRef(0)                      // timestamp: block sweep/drop for 1.5s after piece selection
  const lastRightSquareRef        = useRef<string | null>(null)    // hysteresis for right-hand pointing
  const sweepCandidateRef         = useRef<string | null>(null)    // current raw sweep candidate
  const sweepCandidateSinceRef    = useRef<number>(0)              // when the current candidate was first seen
  const sweepCommittedRef         = useRef<string | null>(null)    // debounced stable sweep target
  const sweepThroughCooldownUntil = useRef(0)                      // timestamp: prevent double-fire of sweep-through
  const pawnCountCandidateRef     = useRef<{ count: number; since: number } | null>(null)  // stability buffer for pawn finger count
  const pointStableRef             = useRef<{ sq: string | null; since: number }>({ sq: null, since: 0 })  // right-hand pointing stability

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
      leftFistPrevRef.current = false
      rightFistPrevRef.current = false
      castleXPosePrevRef.current = false
      stepAnchorRef.current = null
      knightStepAnchorRef.current = null
      knightStepStateRef.current = 0
      oneHandPickRef.current = null
      useGameStore.getState().setOneHandPreviewSquare(null)
      leftWristPrevRef.current = null
      rightWristPrevRef.current = null
      lastRightSquareRef.current = null

      if (noHandSince.current === null) {
        noHandSince.current = performance.now()
      } else if (performance.now() - noHandSince.current > 2000) {
        // 2 seconds with no hand → clear all selections and highlights
        useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
        useGameStore.getState().setHandGesturePieceType(null)
        useGameStore.getState().setOneHandPreviewSquare(null)
        useGameStore.getState().setSweepPreviewSquare(null)
        useGameStore.getState().setKnightPreviewSquares([])
        activeGesture.current = null
        pawnColumnChoiceRef.current = null
        grabbedSquareRef.current = null
        stepAnchorRef.current = null
        knightStepAnchorRef.current = null
        knightStepStateRef.current = 0
        leftWristPrevRef.current = null
        rightWristPrevRef.current = null
        leftSwipeCooldownUntilRef.current = 0
        rightSwipeCooldownUntilRef.current = 0
        lastRightSquareRef.current = null
        sweepCandidateRef.current = null
        sweepCandidateSinceRef.current = 0
        sweepCommittedRef.current = null
        knightSeq.current = null
        turnGestureRef.current = null
        hipPrevTimestampRef.current = null
        airborneStartRef.current = null
        turnSuppressJumpUntilRef.current = 0
        wasTurningRef.current = false
        pawnColumnRef.current = null
        pawnLockRef.current = false
        oneHandPickRef.current = null
        rightFistPrevRef.current = false
        hipPrevYRef.current = null
        hipPhaseRef.current = 'idle'
        hipJumpAnchorRef.current = null
        jumpDirLatchRef.current = null
        lastHipYRef.current = null
        lastHipSpanRef.current = null
        knightCooldownUntil.current = 0
        useGameStore.getState().setKnightDebug({
          shoulderMidY: 0,
          shoulderSpan: 0,
          hipVelY: 0,
          noseOffset: 0,
          phase: 'idle',
        })
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
    let rightSquareName: string | null = null
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

      const rightIndexTip = userRightHandRef.current?.[8]
      if (rightIndexTip) {
        // Keep one-hand pointing on the same mirrored screen mapping as cursor mode.
        const { px: rightPx, py: rightPy } = coordsToPixel(
          rightIndexTip.x,
          rightIndexTip.y,
          window.innerWidth,
          window.innerHeight
        )
        const rbx = (rightPx - r.left) / r.width
        const rby = (rightPy - r.top) / r.height
        if (rbx >= 0 && rbx <= 1 && rby >= 0 && rby <= 1) {
          const screenCol = Math.min(7, Math.max(0, Math.floor(rbx * 8)))
          const screenRow = Math.min(7, Math.max(0, Math.floor(rby * 8)))
          const boardCol = playerSide === 'black' ? 7 - screenCol : screenCol
          const boardRow = playerSide === 'black' ? 7 - screenRow : screenRow
          const rCandidate = `${'abcdefgh'[boardCol]}${8 - boardRow}`
          // Dead-zone hysteresis: require crossing 60% of a square before changing.
          if (rCandidate !== lastRightSquareRef.current) {
            const sqW = r.width / 8
            const sqH = r.height / 8
            const prevRCol = lastRightSquareRef.current ? 'abcdefgh'.indexOf(lastRightSquareRef.current[0]) : -99
            const prevRRow = lastRightSquareRef.current ? 8 - parseInt(lastRightSquareRef.current[1]) : -99
            const rdx = Math.abs(boardCol - prevRCol) * sqW
            const rdy = Math.abs(boardRow - prevRRow) * sqH
            if (rdx >= sqW * 0.6 || rdy >= sqH * 0.6 || lastRightSquareRef.current === null) {
              lastRightSquareRef.current = rCandidate
            }
          }
          rightSquareName = lastRightSquareRef.current
        } else {
          lastRightSquareRef.current = null
        }
      } else {
        lastRightSquareRef.current = null
      }
    }

    // ── Arm mode: hand gestures select pieces, no cursor/pinch ──
    if (armModeEnabled) {
      // Clear squareName so stale cursor position never triggers isDropTarget/isHovered
      setCursor({ visible: false, squareName: null })
      const rightFistNow = !!(userRightHandRef.current && classifyGesture(userRightHandRef.current).isFist)
      const rightFistClosedEdge = rightFistNow && !rightFistPrevRef.current
      rightFistPrevRef.current = rightFistNow
      const confirmFistClosedEdge = rightFistClosedEdge
      const castleXPoseNow = !!(poseLandmarksRef.current && isCastleXPose(poseLandmarksRef.current))
      const castleXPoseEdge = castleXPoseNow && !castleXPosePrevRef.current
      castleXPosePrevRef.current = castleXPoseNow

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
          pawnColumnChoiceRef.current = null
          grabbedSquareRef.current = null
          stepAnchorRef.current = null
          knightStepAnchorRef.current = null
          knightStepStateRef.current = 0
          leftWristPrevRef.current = null
          rightWristPrevRef.current = null
          leftSwipeCooldownUntilRef.current = 0
          rightSwipeCooldownUntilRef.current = 0
          cancelSince.current = null
          activeGesture.current = null
          knightSeq.current = null
          turnGestureRef.current = null
          hipPrevTimestampRef.current = null
          airborneStartRef.current = null
          turnSuppressJumpUntilRef.current = 0
          wasTurningRef.current = false
          pawnColumnRef.current = null
          pawnLockRef.current = false
          oneHandPickRef.current = null
          useGameStore.getState().setOneHandPreviewSquare(null)
          rightFistPrevRef.current = false
          castleXPosePrevRef.current = false
          hipPrevYRef.current = null
          hipPhaseRef.current = 'idle'
          hipJumpAnchorRef.current = null
          jumpDirLatchRef.current = null
          lastHipYRef.current = null
          lastHipSpanRef.current = null
          knightCooldownUntil.current = 0
          useGameStore.getState().setKnightDebug({
            shoulderMidY: 0,
            shoulderSpan: 0,
            hipVelY: 0,
            noseOffset: 0,
            phase: 'idle',
          })
          cancelCooldownUntil.current = performance.now() + 1500  // 1500ms cooldown after cancel
          setGestureState('idle')
          return
        }

        // ── Sweep-through auto-drop ──────────────────────────────────────────
        // When the arm sweep preview (sweepCommittedRef) stabilises on a square,
        // fire the drop automatically. The App's onDropSquare validates legality.
        // Gated by postSelectCooldownUntil to prevent the piece from jumping
        // immediately after being grabbed.
        {
          const nowSt = performance.now()
          const sweepCheckSquare = sweepCommittedRef.current ?? rightSquareName ?? squareName
          if (
            grabbedSquareRef.current
            && sweepCheckSquare
            && sweepCheckSquare !== grabbedSquareRef.current
            && nowSt > sweepThroughCooldownUntil.current
            && nowSt > postSelectCooldownUntil.current
            && onDropSquare.current
          ) {
            useGameStore.getState().addGestureLog(`Sweep-through: ${grabbedSquareRef.current} → ${sweepCheckSquare}`)
            onDropSquare.current(grabbedSquareRef.current, sweepCheckSquare)
            useGameStore.getState().setSweepPreviewSquare(null)
            sweepThroughCooldownUntil.current = nowSt + POST_DROP_COOLDOWN_MS
            postDropCooldownUntil.current = nowSt + POST_DROP_COOLDOWN_MS
            sweepCandidateRef.current = null
            sweepCandidateSinceRef.current = 0
            sweepCommittedRef.current = null
            grabbedSquareRef.current = null
            setGestureState('idle')
            return
          }
        }


        // ── Sweep-controlled pieces + knight jump/turn detection ─────────
        // ── Jump phase machine — runs every frame using cached shoulder values ──
        // Shoulders are reliable even when lower body is out of frame.
        // Gate: only run jump detection when BOTH shoulders are clearly visible.
        // If one shoulder is hidden (body turned sideways), reset velocity baseline so
        // turning never produces a false liftoff from the Y midpoint shift.
        const SHOULDER_VIS_CACHE_MIN = 0.55
        // Cache nose offset every frame arms is available (needed for turn detection)
        if (arms) {
          const shoulderMidX = (arms.leftShoulder.x + arms.rightShoulder.x) / 2
          lastNoseOffsetRef.current = arms.nose.x - shoulderMidX
        }
        const shouldersGood = !!(arms
          && (arms.leftShoulder.visibility  ?? 0) > SHOULDER_VIS_CACHE_MIN
          && (arms.rightShoulder.visibility ?? 0) > SHOULDER_VIS_CACHE_MIN
        )
        if (shouldersGood) {
          lastHipYRef.current    = (arms!.leftShoulder.y + arms!.rightShoulder.y) / 2
          lastHipSpanRef.current = Math.abs(arms!.leftShoulder.x - arms!.rightShoulder.x)

          const cachedHipY    = lastHipYRef.current!
          const cachedHipSpan = lastHipSpanRef.current!
          const nowMs = performance.now()

          // FPS-independent velocity: Δy per second rather than Δy per frame
          const deltaT = hipPrevTimestampRef.current !== null ? (nowMs - hipPrevTimestampRef.current) / 1000 : null
          const hipVelY = (hipPrevYRef.current !== null && deltaT !== null && deltaT > 0)
            ? (cachedHipY - hipPrevYRef.current) / deltaT
            : 0
          hipPrevYRef.current = cachedHipY
          hipPrevTimestampRef.current = nowMs

          // Turning body → suppress jump detection for 300ms to avoid false liftoffs
          const isTurning = Math.abs(lastNoseOffsetRef.current) > NOSE_TURN_THR
          if (isTurning && !wasTurningRef.current) turnSuppressJumpUntilRef.current = nowMs + 300
          wasTurningRef.current = isTurning

          if (hipPhaseRef.current === 'idle'
            && hipVelY < -HIP_LIFTOFF_VEL
            && nowMs > turnSuppressJumpUntilRef.current
          ) {
            hipPhaseRef.current = 'airborne'
            airborneStartRef.current = nowMs
            hipJumpAnchorRef.current = { span: cachedHipSpan, y: cachedHipY }
            useGameStore.getState().addGestureLog(`Jump liftoff (vel=${hipVelY.toFixed(2)}/s, span=${cachedHipSpan.toFixed(3)})`)
          } else if (hipPhaseRef.current === 'airborne') {
            const anchor = hipJumpAnchorRef.current!
            const airborneMs = airborneStartRef.current !== null ? nowMs - airborneStartRef.current : 0
            // Require MIN_AIRBORNE_MS in air before allowing a landing (filters single-frame noise)
            if (airborneMs >= MIN_AIRBORNE_MS && cachedHipY >= anchor.y && Math.abs(hipVelY) < HIP_LAND_VEL) {
              const resolvedDir: KnightDir = (cachedHipSpan >= anchor.span) ? 'jump_fwd' : 'jump_back'
              useGameStore.getState().addGestureLog(`Jump landed: ${resolvedDir} (Δspan=${(cachedHipSpan - anchor.span).toFixed(3)})`)
              jumpDirLatchRef.current = { dir: resolvedDir, until: nowMs + JUMP_LATCH_MS }
              hipPhaseRef.current = 'idle'
              airborneStartRef.current = null
              hipJumpAnchorRef.current = null
            }
          }

          if (nowMs - lastDebugUpdateRef.current >= 80) {
            lastDebugUpdateRef.current = nowMs
            useGameStore.getState().setKnightDebug({
              shoulderMidY: cachedHipY,
              shoulderSpan: cachedHipSpan,
              hipVelY,
              noseOffset: lastNoseOffsetRef.current,
              phase: hipPhaseRef.current,
            })
          }
        } else {
          // One shoulder hidden — body turning sideways. Reset velocity baseline.
          hipPrevYRef.current = null
          hipPrevTimestampRef.current = null
          wasTurningRef.current = false
          const nowMs = performance.now()
          if (nowMs - lastDebugUpdateRef.current >= 120) {
            lastDebugUpdateRef.current = nowMs
            useGameStore.getState().setKnightDebug({
              shoulderMidY: 0,
              shoulderSpan: 0,
              hipVelY: 0,
              noseOffset: lastNoseOffsetRef.current,
              phase: hipPhaseRef.current,
            })
          }
        }
        if (jumpDirLatchRef.current && performance.now() > jumpDirLatchRef.current.until) {
          jumpDirLatchRef.current = null
        }

        // ── Turn classification — runs every frame using cached nose offset ──
        // nose.x - shoulderMidX: negative = turned one way, positive = the other.
        // Runs outside the arms guard so it works even when pose drops mid-turn.
        if (!jumpDirLatchRef.current) {
          const noseOffset = lastNoseOffsetRef.current
          if (Math.abs(noseOffset - lastLoggedNoseOffsetRef.current) > 0.01) {
            lastLoggedNoseOffsetRef.current = noseOffset
          }
          let turnDir: KnightDir | null = null
          if      (noseOffset < -NOSE_TURN_THR) turnDir = 'turn_right'
          else if (noseOffset >  NOSE_TURN_THR) turnDir = 'turn_left'
          // turnGestureRef is exclusively owned by the turn classifier
          if (turnDir !== null) {
            const cur = turnGestureRef.current
            if (!cur || cur.dir !== turnDir) {
              turnGestureRef.current = { dir: turnDir, since: performance.now(), processed: false }
            }
          } else {
            // Nose returned to center — clear unprocessed turn
            if (turnGestureRef.current && !turnGestureRef.current.processed) {
              turnGestureRef.current = null
            }
          }
        }

        const { selectedSquare, legalTargets, fen } = useGameStore.getState().game

        // ── Debug state summary — always print when in grabbing state ──────
        {
          const latchStr = jumpDirLatchRef.current  ? `latch:${jumpDirLatchRef.current.dir}` : 'latch:none'
          const turnStr  = turnGestureRef.current
            ? `turn:${turnGestureRef.current.dir}(proc=${turnGestureRef.current.processed})`
            : 'turn:none'
          const seqStr   = knightSeq.current ? `seq:${knightSeq.current.first}` : 'seq:none'
          const armsStr  = `arms:${arms ? 'ok' : 'NULL'}`
          const noseStr  = Math.abs(lastNoseOffsetRef.current) <= NOSE_TURN_THR
            ? 'nose:center'
            : lastNoseOffsetRef.current < 0 ? 'nose:right' : 'nose:left'
          const selStr   = `sel:${selectedSquare ?? 'none'}`
          const summary  = `${armsStr} | ${noseStr} | ${latchStr} | ${turnStr} | ${seqStr} | ${selStr}`
          // Only log when state changes — avoids flooding the gesture log every frame
          if (summary !== lastStateSummaryRef.current) {
            lastStateSummaryRef.current = summary
            useGameStore.getState().addGestureLog(`[SM] ${summary}`)
          }
        }

        if (selectedSquare && arms) {
          const chess = new Chess(fen)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const piece = chess.get(selectedSquare as any)
          if (piece && (
            piece.type === 'b'
            || piece.type === 'r'
            || piece.type === 'q'
            || piece.type === 'k'
            || piece.type === 'p'
            || piece.type === 'n'
          )) {
            knightStepAnchorRef.current = null
            knightStepStateRef.current = 0
            stepAnchorRef.current = null
            leftWristPrevRef.current = null
            rightWristPrevRef.current = null
            useGameStore.getState().setKnightPreviewSquares([])
            const wrist = arms.rightWrist

            // Pure aiming: shoulder→wrist direction determines target square
            const sdx = -(wrist.x - arms.rightShoulder.x)  // mirror X (camera is mirrored)
            const sdy =   wrist.y - arms.rightShoulder.y
            const sweepMag = Math.sqrt(sdx * sdx + sdy * sdy)
            // Shoulder span as body-size-invariant reference for step-count estimation
            const shoulderSpan = Math.abs(arms.leftShoulder.x - arms.rightShoulder.x) || 0.1

            const rawTarget = findSweepTarget(
              piece.type as SweepPiece, selectedSquare, legalTargets, sdx, sdy, sweepMag, shoulderSpan, playerSide
            )
            // Debounce sweep target: must be stable for SWEEP_DEBOUNCE_MS before committing.
            // Prevents shaky arm movements from accidentally changing destination right as fist closes.
            {
              const nowSweep = performance.now()
              if (rawTarget !== sweepCandidateRef.current) {
                sweepCandidateRef.current = rawTarget
                sweepCandidateSinceRef.current = nowSweep
              }
              if (nowSweep - sweepCandidateSinceRef.current >= SWEEP_DEBOUNCE_MS) {
                sweepCommittedRef.current = rawTarget
              }
            }
            const target = sweepCommittedRef.current
            const castleTargets = piece.type === 'k' ? getCastleTargets(selectedSquare, legalTargets) : []
            const castleTarget = piece.type === 'k'
              ? chooseCastleTarget(selectedSquare, castleTargets, target)
              : null
            const dropTarget = piece.type === 'k' && castleXPoseNow && castleTarget ? castleTarget : target
            useGameStore.getState().setSweepPreviewSquare(dropTarget)

            // King-only shortcut: cross both arms in X to trigger castling when legal.
            if (piece.type === 'k'
              && castleXPoseEdge
              && castleTarget
              && onDropSquare.current
              && grabbedSquareRef.current
            ) {
              useGameStore.getState().addGestureLog(`Castle X: ${grabbedSquareRef.current} → ${castleTarget}`)
              onDropSquare.current(grabbedSquareRef.current, castleTarget)
              useGameStore.getState().setSweepPreviewSquare(null)
              grabbedSquareRef.current = null
              setGestureState('idle')
              return
            }

            // Universal arm-mode drop trigger: close confirm hand (right in one-hand mode).
            // Gated by postSelectCooldownUntil to prevent the same fist-close that grabbed
            // the piece from immediately dropping it on the current sweep target.
            if (
              confirmFistClosedEdge
              && dropTarget
              && onDropSquare.current
              && grabbedSquareRef.current
              && performance.now() > postSelectCooldownUntil.current
            ) {
              useGameStore.getState().addGestureLog(`Drop trigger: ${grabbedSquareRef.current} → ${dropTarget}`)
              onDropSquare.current(grabbedSquareRef.current, dropTarget)
              useGameStore.getState().setSweepPreviewSquare(null)
              postDropCooldownUntil.current = performance.now() + POST_DROP_COOLDOWN_MS
              sweepCandidateRef.current = null
              sweepCandidateSinceRef.current = 0
              sweepCommittedRef.current = null
              grabbedSquareRef.current = null
              setGestureState('idle')
              return
            }
          } else if (piece?.type !== 'n') {
            knightStepAnchorRef.current = null
            knightStepStateRef.current = 0
            stepAnchorRef.current = null
            leftWristPrevRef.current = null
            rightWristPrevRef.current = null
            // Non-sweep, non-knight piece — clear any stale previews
            useGameStore.getState().setSweepPreviewSquare(null)
            useGameStore.getState().setKnightPreviewSquares([])
          }
        }

        // ── Knight dual-gesture sequence — runs without requiring arms ────
        // Jump and turn detection both run outside the arms guard, so the
        // sequence should not stall just because pose drops mid-gesture.
        if (selectedSquare) {
          const chess = new Chess(fen)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const piece = chess.get(selectedSquare as any)
          if (piece?.type === 'n') {
            // Knight sequence stays active indefinitely until completed, cancelled, or piece deselected

            // ── Determine which gesture (if any) is ready this frame ──────────
            // Jump: ready from latch window after landing (JUMP_LATCH_MS)
            // Turn: ready after held for KNIGHT_GESTURE_MS (debounce)
            const jumpAlreadyFirst = !!(jumpDirLatchRef.current && knightSeq.current?.first === jumpDirLatchRef.current.dir)
            const jumpReady = !!(jumpDirLatchRef.current && !jumpAlreadyFirst)
            const turnReady = !!(turnGestureRef.current
              && !turnGestureRef.current.processed
              && performance.now() - turnGestureRef.current.since >= KNIGHT_GESTURE_MS
            )
            const readyDir: KnightDir | null = jumpReady
              ? jumpDirLatchRef.current!.dir
              : turnReady ? turnGestureRef.current!.dir : null

            if (readyDir !== null && performance.now() > knightCooldownUntil.current) {
              // Mark source as processed so it doesn't fire again
              if (turnReady) turnGestureRef.current!.processed = true

              if (!knightSeq.current) {
                // First gesture — start sequence and preview reachable squares
                knightSeq.current = { first: readyDir, since: performance.now() }
                const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                const previews = sel ? knightLegalForFirstGesture(sel, legal, readyDir, playerSide) : []

                // ── Auto-infer jump direction when turn fires first with no previews ──
                if (previews.length === 0 && sel && (readyDir === 'turn_left' || readyDir === 'turn_right')) {
                  const fwdTarget  = findKnightTarget(sel, legal, 'jump_fwd',  readyDir, playerSide)
                  const backTarget = findKnightTarget(sel, legal, 'jump_back', readyDir, playerSide)
                  const autoTarget = (fwdTarget && !backTarget)  ? fwdTarget
                                   : (!fwdTarget && backTarget)  ? backTarget
                                   : null
                  if (autoTarget) {
                    const inferredJump = fwdTarget ? 'jump_fwd' : 'jump_back'
                    useGameStore.getState().addGestureLog(
                      `Knight auto-infer: ${inferredJump} implied + ${readyDir} → ${autoTarget}`
                    )
                    if (onDropSquare.current && grabbedSquareRef.current) {
                      onDropSquare.current(grabbedSquareRef.current, autoTarget)
                    }
                    useGameStore.getState().setKnightPreviewSquares([])
                    knightSeq.current = null
                    turnGestureRef.current = null
                    knightCooldownUntil.current = performance.now() + KNIGHT_COOLDOWN_MS
                    grabbedSquareRef.current = null
                    setGestureState('idle')
                    return
                  }
                }

                if (sel) useGameStore.getState().setKnightPreviewSquares(previews)
                useGameStore.getState().addGestureLog(`Knight 1st gesture: ${readyDir} → previewing ${previews.join(', ') || 'none'}`)
              } else {
                const firstAxis  = knightSeq.current.first.startsWith('jump') ? 'jump' : 'turn'
                const secondAxis = readyDir.startsWith('jump') ? 'jump' : 'turn'
                if (firstAxis !== secondAxis) {
                  // Second gesture on perpendicular axis — fire the move
                  const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                  const target = sel
                    ? findKnightTarget(sel, legal, knightSeq.current.first, readyDir, playerSide)
                    : null
                  useGameStore.getState().addGestureLog(
                    `Knight 2nd gesture: ${readyDir} → move: ${sel} → ${target ?? 'illegal'}`
                  )
                  if (target && onDropSquare.current && grabbedSquareRef.current) {
                    onDropSquare.current(grabbedSquareRef.current, target)
                  }
                  useGameStore.getState().setKnightPreviewSquares([])
                  knightSeq.current = null
                  turnGestureRef.current = null
                  knightCooldownUntil.current = performance.now() + KNIGHT_COOLDOWN_MS
                  grabbedSquareRef.current = null
                  setGestureState('idle')
                  return
                } else {
                  // Same axis — restart sequence with the new gesture
                  useGameStore.getState().addGestureLog(`Knight sequence restart: ${readyDir} (same axis)`)
                  knightSeq.current = { first: readyDir, since: performance.now() }
                  const { selectedSquare: sel, legalTargets: legal } = useGameStore.getState().game
                  if (sel) useGameStore.getState().setKnightPreviewSquares(
                    knightLegalForFirstGesture(sel, legal, readyDir, playerSide)
                  )
                }
              }
            }
          }
        }

        return
      }

      cancelSince.current = null
      stepAnchorRef.current = null
      knightStepAnchorRef.current = null
      knightStepStateRef.current = 0
      leftWristPrevRef.current = null
      rightWristPrevRef.current = null

      // Block gestures during post-cancel cooldown
      const inCooldown = performance.now() < cancelCooldownUntil.current

      // Only recognize hand gestures when at least one wrist is clearly above the hip midpoint.
      // Prevents accidental triggers when arms are resting at the side.
      // Falls back to allowing recognition if pose data is absent or hip visibility is low.
      const HAND_ABOVE_HIP_MARGIN = 0.05  // wrist must be at least 5% of frame above hip (MediaPipe y: smaller = higher)
      const HIP_VIS_MIN = 0.50
      const poseArms = poseLandmarksRef.current
      const hipsVisible = poseArms
        && (poseArms.leftHip.visibility  ?? 1) > HIP_VIS_MIN
        && (poseArms.rightHip.visibility ?? 1) > HIP_VIS_MIN
      const hipMidY = hipsVisible ? (poseArms!.leftHip.y + poseArms!.rightHip.y) / 2 : null
      const highestWristY = poseArms ? Math.min(poseArms.leftWrist.y, poseArms.rightWrist.y) : null
      const handAboveHip = (hipMidY !== null && highestWristY !== null)
        ? highestWristY < hipMidY - HAND_ABOVE_HIP_MARGIN
        : true  // no pose data or hips not visible → don't block

      const rightGestureType = userRightHandRef.current
        ? detectHandGesture(classifyGesture(userRightHandRef.current))
        : null
      const lockedOneHandType = userRightHandRef.current
        ? oneHandPickRef.current?.pieceType ?? null
        : null
      // While a multi-piece pick is active, lock detection to that type so that
      // changing fingers (e.g. showing 2 for bishop) doesn't reset piece selection.
      const rawDetected = (inCooldown || !handAboveHip || performance.now() < postDropCooldownUntil.current)
        ? null
        : lockedOneHandType ?? rightGestureType
      const detectedType = pawnLockRef.current ? 'p' : rawDetected

      if (detectedType) {
        const cur = activeGesture.current
        if (!cur || cur.pieceType !== detectedType) {
          activeGesture.current = { pieceType: detectedType, since: performance.now(), anchor: null, fired: false }
          // Keep pawn cycle memory across repeated pawn selections on the same file.
          // Reset only when switching away from pawn gesture.
          if (detectedType !== 'p') pawnColumnChoiceRef.current = null
          // no-op on same gesture: since stays the same, timer keeps running
        }
      } else {
        if (activeGesture.current) {
          activeGesture.current = null
          pawnLockRef.current = false
          pawnColumnRef.current = null
          oneHandPickRef.current = null
          useGameStore.getState().setHandGesturePieceType(null)
          useGameStore.getState().setOneHandPreviewSquare(null)
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
          oneHandPickRef.current = null
          cur.fired = true
          const targetSq = matchingSquares[0]
          if (onSelectSquare.current) {
            const selected = onSelectSquare.current(targetSq)
            if (selected) {
              useGameStore.getState().addGestureLog(`Gesture: ${cur.pieceType.toUpperCase()} → select ${targetSq} (auto)`)
              grabbedSquareRef.current = targetSq
              postSelectCooldownUntil.current = performance.now() + 600  // 600ms before sweep can drop
              sweepCandidateRef.current = null
              sweepCandidateSinceRef.current = 0
              sweepCommittedRef.current = null
              setGestureState('grabbing')
            }
          }
          activeGesture.current = null
          useGameStore.getState().setHandGesturePieceType(null)
          useGameStore.getState().setOneHandPreviewSquare(null)
        } else if (matchingSquares.length > 1) {
          // Multiple pieces — highlight all of them
          useGameStore.getState().setHandGesturePieceType(cur.pieceType)

          // ── Right-hand-only multi-piece selection ─────────────────────────────
          // Point right index at desired piece → hold for stability period.
          // Non-pawns: auto-select after 500ms (no fist needed — simpler and avoids
          //   the rook-gesture-is-fist conflict).
          // Pawns: 8 densely packed pieces need 800ms stability + fist-close to
          //   prevent accidental wrong-pawn selection.
          const IS_PAWN = cur.pieceType === 'p'
          const POINT_STABLE_MS = IS_PAWN ? 800 : 500

          pawnLockRef.current = false
          pawnColumnRef.current = null
          pawnCountCandidateRef.current = null
          oneHandPickRef.current = { pieceType: cur.pieceType, candidates: matchingSquares }

          const sqToCoord = (sq: string) => ({
            col: 'abcdefgh'.indexOf(sq[0]),
            row: Number.parseInt(sq[1], 10),
          })

          // Resolve which candidate the right index is closest to
          let rawTarget: string | null = null
          if (rightSquareName) {
            if (matchingSquares.includes(rightSquareName)) {
              rawTarget = rightSquareName
            } else {
              const p = sqToCoord(rightSquareName)
              let bestDist = Infinity
              for (const sq of matchingSquares) {
                const c = sqToCoord(sq)
                const d = Math.abs(c.col - p.col) + Math.abs(c.row - p.row)
                if (d < bestDist) { bestDist = d; rawTarget = sq }
              }
            }
          }

          // Stability gate: rawTarget must be unchanged for POINT_STABLE_MS
          const nowPoint = performance.now()
          if (rawTarget !== pointStableRef.current.sq) {
            pointStableRef.current = { sq: rawTarget, since: nowPoint }
          }
          const pointHeldMs = nowPoint - pointStableRef.current.since
          const stableTarget = (pointHeldMs >= POINT_STABLE_MS) ? rawTarget : null

          // Preview: use a 250ms stability gate before changing the highlighted square.
          // This stops the pawn preview from flickering on tiny hand tremors.
          const PREVIEW_STABLE_MS = 250
          const previewTarget = (pointHeldMs >= PREVIEW_STABLE_MS) ? rawTarget : pointStableRef.current.sq
          useGameStore.getState().setOneHandPreviewSquare(previewTarget)

          if (!IS_PAWN) {
            // ── Non-pawn: auto-select once pointer is stable ──────────────────
            if (stableTarget && onSelectSquare.current) {
              const selected = onSelectSquare.current(stableTarget)
              if (selected) {
                useGameStore.getState().addGestureLog(
                  `${cur.pieceType.toUpperCase()}: pointed ${pointHeldMs.toFixed(0)}ms → auto-select ${stableTarget}`
                )
                cur.fired = true
                sweepCandidateRef.current = null
                sweepCandidateSinceRef.current = 0
                sweepCommittedRef.current = null
                grabbedSquareRef.current = stableTarget
                postSelectCooldownUntil.current = performance.now() + 600  // 600ms: arm must deliberately move to new target
                setGestureState('grabbing')
                activeGesture.current = null
                oneHandPickRef.current = null
                pointStableRef.current = { sq: null, since: 0 }
                useGameStore.getState().setHandGesturePieceType(null)
                useGameStore.getState().setOneHandPreviewSquare(null)
              }
            }
          } else {
            // ── Pawn: stable point + fist-close to confirm ────────────────────
            if (confirmFistClosedEdge && stableTarget && onSelectSquare.current) {
              const selected = onSelectSquare.current(stableTarget)
              if (selected) {
                useGameStore.getState().addGestureLog(
                  `P: point ${pointHeldMs.toFixed(0)}ms + fist → select ${stableTarget}`
                )
                cur.fired = true
                sweepCandidateRef.current = null
                sweepCandidateSinceRef.current = 0
                sweepCommittedRef.current = null
                grabbedSquareRef.current = stableTarget
                postSelectCooldownUntil.current = performance.now() + 1500
                setGestureState('grabbing')
                activeGesture.current = null
                oneHandPickRef.current = null
                pointStableRef.current = { sq: null, since: 0 }
                useGameStore.getState().setHandGesturePieceType(null)
                useGameStore.getState().setOneHandPreviewSquare(null)
              }
            }
          }
          // else: keep pieces highlighted and wait
        } else {
          oneHandPickRef.current = null
          useGameStore.getState().setOneHandPreviewSquare(null)
        }
      }
      return
    }

      // ── Normal pinch/cursor mode ──────────────────────────────────────────
      // Ensure gesture state is clean when arm mode is off
      leftFistPrevRef.current = false
      rightFistPrevRef.current = false
      castleXPosePrevRef.current = false
      stepAnchorRef.current = null
      knightStepAnchorRef.current = null
      knightStepStateRef.current = 0
      wasTurningRef.current = false
    leftWristPrevRef.current = null
      rightWristPrevRef.current = null
      activeGesture.current = null
      oneHandPickRef.current = null
      useGameStore.getState().setHandGesturePieceType(null)
      useGameStore.getState().setOneHandPreviewSquare(null)

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
