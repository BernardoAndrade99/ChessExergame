import { useEffect, useRef, useCallback } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { classifyGesture } from '../lib/gestureClassifier'
import { KalmanFilter2D } from '../lib/kalmanFilter'
import { coordsToPixel } from '../lib/coordinateMapper'
import { useGameStore } from '../store/gameStore'

const DEBOUNCE_FRAMES = 4  // slightly more debounce for stability

export function useGesture(
  landmarks: NormalizedLandmark[] | null,
  containerRef: React.RefObject<HTMLElement>
) {
  const { calibration, setCursor, setGestureState, gestureState, playerSide } = useGameStore()
  // Higher measurement noise R = more smoothing, less jitter (at cost of slight lag)
  const kalman = useRef(new KalmanFilter2D(0.005, 0.40))
  const pinchBuffer = useRef(0)
  const releaseBuffer = useRef(0)
  const lastSquareRef = useRef<string | null>(null)  // dead-zone tracking
  const grabbedSquareRef = useRef<string | null>(null)

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
      return
    }

    const gesture = classifyGesture(landmarks)

    // Smooth index fingertip with higher R for less jitter
    const raw = gesture.indexTip
    const smoothed = kalman.current.update(raw.x, raw.y)

    // Map hand to full screen cursor position
    const { px, py } = coordsToPixel(smoothed.x, smoothed.y, window.innerWidth, window.innerHeight)

    // Compute hovered square from SCREEN position relative to the board element.
    // This ensures cursor and square are always in sync regardless of calibration.
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
        // Dead-zone: only update square if cursor moved noticeably (> ~0.6 of a square width)
        // This prevents flickering at square boundaries
        if (candidate !== lastSquareRef.current) {
          const sqW = r.width / 8
          const sqH = r.height / 8
          const prevCol = lastSquareRef.current ? 'abcdefgh'.indexOf(lastSquareRef.current[0]) : -99
          const prevRow = lastSquareRef.current ? 8 - parseInt(lastSquareRef.current[1]) : -99
          const dx = Math.abs(boardCol - prevCol) * sqW
          const dy = Math.abs(boardRow - prevRow) * sqH
          // Accept if moved at least half a square in either axis
          if (dx >= sqW * 0.5 || dy >= sqH * 0.5 || lastSquareRef.current === null) {
            lastSquareRef.current = candidate
          }
        }
        squareName = lastSquareRef.current
      } else {
        lastSquareRef.current = null
      }
    }

    setCursor({ x: px, y: py, squareName, visible: true })

    // Pinch debounce (3 consecutive frames)
    if (gesture.isPinching) {
      pinchBuffer.current = Math.min(pinchBuffer.current + 1, DEBOUNCE_FRAMES + 1)
      releaseBuffer.current = 0
    } else {
      releaseBuffer.current = Math.min(releaseBuffer.current + 1, DEBOUNCE_FRAMES + 1)
      pinchBuffer.current = 0
    }

    const stablePinch   = pinchBuffer.current   >= DEBOUNCE_FRAMES
    const stableRelease = releaseBuffer.current >= DEBOUNCE_FRAMES

    // State machine
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
      if (stableRelease && grabbedSquareRef.current && squareName && onDropSquare.current) {
        onDropSquare.current(grabbedSquareRef.current, squareName)
        grabbedSquareRef.current = null
        setGestureState('idle')
        releaseBuffer.current = 0
      }
    }
  }, [landmarks, calibration, gestureState, setCursor, setGestureState, containerRef, playerSide])

  return { registerHandlers }
}
