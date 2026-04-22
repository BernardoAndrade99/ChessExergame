import { useEffect, useRef, useCallback } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { classifyGesture } from '../lib/gestureClassifier'
import { KalmanFilter2D } from '../lib/kalmanFilter'
import { coordsToPixel } from '../lib/coordinateMapper'
import { useGameStore } from '../store/gameStore'

const DEBOUNCE_FRAMES = 3

export function useGesture(
  landmarks: NormalizedLandmark[] | null,
  containerRef: React.RefObject<HTMLElement>
) {
  const { calibration, setCursor, setGestureState, gestureState, playerSide, armModeEnabled } = useGameStore()
  const kalman = useRef(new KalmanFilter2D(0.005, 0.30))
  const pinchBuffer = useRef(0)
  const releaseBuffer = useRef(0)
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
      return
    }

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

    if (armModeEnabled && gestureState === 'grabbing') {
      const armDest = useGameStore.getState().armDestinationSquare
      if (armDest) squareName = armDest
    }

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
      // Arm mode: left-wrist endpoint is the drop target (no cursor needed)
      // Hand mode: original behaviour — cursor must be over a valid square
      const armDest = armModeEnabled ? useGameStore.getState().armDestinationSquare : null
      const dropTarget = armDest ?? squareName

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
