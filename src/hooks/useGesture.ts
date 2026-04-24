import { useEffect, useRef, useCallback } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { Chess } from 'chess.js'
import { classifyGesture } from '../lib/gestureClassifier'
import { KalmanFilter2D } from '../lib/kalmanFilter'
import { coordsToPixel } from '../lib/coordinateMapper'
import { useGameStore } from '../store/gameStore'

const DEBOUNCE_FRAMES = 3
const GESTURE_FRAMES = 5      // stable frames before a hand gesture activates
const FLICK_THRESHOLD = 0.07  // normalized palm displacement to trigger piece selection

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
        activeGesture.current = null
        grabbedSquareRef.current = null
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
      setCursor({ visible: false })

      const detectedType = detectHandGesture(gesture)

      if (detectedType) {
        const cur = activeGesture.current
        if (!cur || cur.pieceType !== detectedType) {
          // New gesture — reset state
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
      if (cur && cur.buffer >= GESTURE_FRAMES) {
        useGameStore.getState().setHandGesturePieceType(cur.pieceType)

        const palm = gesture.palmCenter
        if (!cur.anchor) {
          cur.anchor = { x: palm.x, y: palm.y }
        }

        if (!cur.fired) {
          const dx = -(palm.x - cur.anchor.x)
          const dy = palm.y - cur.anchor.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > FLICK_THRESHOLD) {
            cur.fired = true
            const { fen, turn } = useGameStore.getState().game
            const targetSq = findPieceByFlick(cur.pieceType, dx, dy, fen, turn, playerSide)

            if (targetSq && onSelectSquare.current) {
              const selected = onSelectSquare.current(targetSq)
              if (selected) {
                grabbedSquareRef.current = targetSq
                setGestureState('grabbing')
              }
            }
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
