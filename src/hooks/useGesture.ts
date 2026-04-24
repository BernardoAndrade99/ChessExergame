import { useEffect, useRef, useCallback } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { ArmLandmarks } from './useMediaPipePose'
import { Chess } from 'chess.js'
import { classifyGesture } from '../lib/gestureClassifier'
import { KalmanFilter2D } from '../lib/kalmanFilter'
import { coordsToPixel } from '../lib/coordinateMapper'
import { useGameStore } from '../store/gameStore'

const DEBOUNCE_FRAMES = 3
const GESTURE_FRAMES = 5      // stable frames before a hand gesture activates
const FLICK_THRESHOLD = 0.07  // normalized palm displacement to trigger piece selection
const CANCEL_FRAMES = 10      // ~165ms at 60fps of holding cancel pose

const SWEEP_DEAD_ZONE = 0.04      // min wrist displacement before sweep activates (normalized)
const SWEEP_SCALE    = 0.04      // wrist displacement per diagonal square (normalized)
const SWEEP_STOP_VEL = 0.006     // wrist velocity threshold for "arm stopped" (normalized/frame)
const SWEEP_STOP_MS  = 500       // ms of stillness required to commit a sweep

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
  playerSide: 'white' | 'black'
): string | null {
  if (sweepMag < SWEEP_DEAD_ZONE || legalTargets.length === 0) return null
  const fdx = sdx / sweepMag
  const fdy = sdy / sweepMag
  const fromCol  = 'abcdefgh'.indexOf(selectedSquare[0])
  const fromRank = parseInt(selectedSquare[1])           // 1–8
  const expectedSteps = Math.max(1, Math.round(sweepMag / SWEEP_SCALE))

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
 * Map a detected gesture to the piece type it represents.
 * Order matters — more specific patterns (fewer extended fingers) checked first.
 */
function detectHandGesture(gesture: ReturnType<typeof import('../lib/gestureClassifier').classifyGesture>): string | null {
  if (gesture.isLShape)      return 'n'  // Knight:  thumb + index
  if (gesture.isPeaceSign)   return 'b'  // Bishop:  index + middle
  if (gesture.isOneIndex)    return 'p'  // Pawn:    index only
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
  const pinchBuffer = useRef(0)
  const releaseBuffer = useRef(0)
  // Single object tracking whichever piece-gesture is currently active
  const activeGesture = useRef<{
    pieceType: string
    buffer: number
    anchor: { x: number; y: number } | null
    fired: boolean
  } | null>(null)
  const noHandSince = useRef<number | null>(null)
  const lastSquareRef = useRef<string | null>(null)
  const grabbedSquareRef = useRef<string | null>(null)
  const cancelPoseBuffer = useRef(0)
  const cancelCooldownUntil = useRef(0)  // timestamp: reject new gestures until after cancel cooldown
  const wristAnchorRef    = useRef<{ x: number; y: number } | null>(null)  // set on first grabbing frame
  const lastWristRef      = useRef<{ x: number; y: number } | null>(null)  // for velocity
  const sweepStillSince   = useRef<number | null>(null)                     // timestamp when arm first went still

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
      pinchBuffer.current = 0
      releaseBuffer.current = 0

      if (noHandSince.current === null) {
        noHandSince.current = performance.now()
      } else if (performance.now() - noHandSince.current > 2000) {
        // 2 seconds with no hand → clear all selections and highlights
        useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
        useGameStore.getState().setHandGesturePieceType(null)
        useGameStore.getState().setSweepPreviewSquare(null)
        activeGesture.current = null
        grabbedSquareRef.current = null
        wristAnchorRef.current = null
        lastWristRef.current   = null
        sweepStillSince.current = null
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
          cancelPoseBuffer.current = Math.min(cancelPoseBuffer.current + 1, CANCEL_FRAMES + 1)
        } else {
          cancelPoseBuffer.current = 0
        }
        if (cancelPoseBuffer.current >= CANCEL_FRAMES) {
          useGameStore.getState().setGame({ selectedSquare: null, legalTargets: [] })
          useGameStore.getState().setSweepPreviewSquare(null)
          grabbedSquareRef.current = null
          cancelPoseBuffer.current = 0
          activeGesture.current = null
          wristAnchorRef.current = null
          lastWristRef.current   = null
          sweepStillSince.current = null
          cancelCooldownUntil.current = performance.now() + 700  // 700ms cooldown after cancel
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

            // Initialise anchor on first frame of this grabbing session
            if (!wristAnchorRef.current) {
              wristAnchorRef.current = { x: wrist.x, y: wrist.y }
              lastWristRef.current   = { x: wrist.x, y: wrist.y }
            }

            // Velocity (mirror x to match screen space)
            const vx = -(wrist.x - (lastWristRef.current?.x ?? wrist.x))
            const vy =   wrist.y - (lastWristRef.current?.y ?? wrist.y)
            const velocity = Math.sqrt(vx * vx + vy * vy)
            lastWristRef.current = { x: wrist.x, y: wrist.y }

            // Sweep displacement from anchor (mirror x)
            const sdx = -(wrist.x - wristAnchorRef.current.x)
            const sdy =   wrist.y - wristAnchorRef.current.y
            const sweepMag = Math.sqrt(sdx * sdx + sdy * sdy)

            const target = findBishopSweepTarget(
              selectedSquare, legalTargets, sdx, sdy, sweepMag, playerSide
            )
            useGameStore.getState().setSweepPreviewSquare(target)

            if (target) {
              if (velocity < SWEEP_STOP_VEL) {
                if (sweepStillSince.current === null) {
                  sweepStillSince.current = performance.now()
                } else if (performance.now() - sweepStillSince.current >= SWEEP_STOP_MS) {
                  // Commit the move
                  if (onDropSquare.current && grabbedSquareRef.current) {
                    onDropSquare.current(grabbedSquareRef.current, target)
                  }
                  useGameStore.getState().setSweepPreviewSquare(null)
                  wristAnchorRef.current = null
                  lastWristRef.current   = null
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
          } else {
            // Non-bishop piece grabbed — clear any stale sweep preview
            useGameStore.getState().setSweepPreviewSquare(null)
          }
        }

        return
      }

      cancelPoseBuffer.current = 0

      // Block gestures during post-cancel cooldown
      const inCooldown = performance.now() < cancelCooldownUntil.current

      const detectedType = inCooldown ? null : detectHandGesture(gesture)

      if (detectedType) {
        const cur = activeGesture.current
        if (!cur || cur.pieceType !== detectedType) {
          activeGesture.current = { pieceType: detectedType, buffer: 1, anchor: null, fired: false }
        } else {
          cur.buffer = Math.min(cur.buffer + 1, GESTURE_FRAMES + 1)
        }
      } else {
        if (activeGesture.current) {
          activeGesture.current = null
          useGameStore.getState().setHandGesturePieceType(null)
        }
      }

      const cur = activeGesture.current
      if (cur && cur.buffer >= GESTURE_FRAMES && !cur.fired) {
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
      pinchBuffer.current = Math.min(pinchBuffer.current + 1, DEBOUNCE_FRAMES + 1)
      releaseBuffer.current = 0
    } else {
      releaseBuffer.current = Math.min(releaseBuffer.current + 1, DEBOUNCE_FRAMES + 1)
      pinchBuffer.current = 0
    }

    const stablePinch   = pinchBuffer.current   >= DEBOUNCE_FRAMES
    const stableRelease = releaseBuffer.current >= DEBOUNCE_FRAMES

    if (gestureState === 'idle' || gestureState === 'hovering') {
      setGestureState(squareName ? 'hovering' : 'idle')

      if (stablePinch && squareName && onSelectSquare.current) {
        const selected = onSelectSquare.current(squareName)
        if (selected) {
          grabbedSquareRef.current = squareName
          setGestureState('grabbing')
          pinchBuffer.current = 0
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
          releaseBuffer.current = 0
          return
        }

        if (!onDropSquare.current) return
        onDropSquare.current(grabbedSquareRef.current, dropTarget)
        if (armModeEnabled) {
          useGameStore.getState().setArmDestinationSquare(null)
        }
        grabbedSquareRef.current = null
        setGestureState('idle')
        releaseBuffer.current = 0
      }
    }
  }, [landmarks, calibration, gestureState, setCursor, setGestureState, containerRef, playerSide, armModeEnabled])

  return { registerHandlers }
}
