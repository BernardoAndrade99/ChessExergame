/**
 * ArmMotionRecorder.tsx  — Phase 1.5 (Bimanual model)
 *
 * Bimanual interaction:
 *   RIGHT hand (detected by MediaPipe Hands) → pinch-selects piece (unchanged)
 *   LEFT wrist  (from MediaPipe Pose)        → swings the movement pattern
 *
 * While right hand holds pinch (gestureState = 'grabbing'):
 *   1. Records left-wrist trajectory → classifies piece type (Knight/Bishop/Rook)
 *   2. Tracks left-wrist FINAL position → maps to board square = destination
 *
 * On pinch release, useGesture.ts reads armDestinationSquare from store
 * and uses it as the drop target instead of the cursor-hovered square.
 */

import { useEffect, useRef } from 'react'
import type { ArmLandmarks } from '../../hooks/useMediaPipePose'
import { useGameStore } from '../../store/gameStore'
import { coordsToSquare } from '../../lib/coordinateMapper'
import type { ArmPieceType, MatchResult, Vec2 } from '../../lib/trajectoryMatcher'

// Map chess FEN piece char → ArmPieceType or null
function pieceCharToArm(ch: string | undefined): ArmPieceType | null {
  if (!ch) return null
  const t = ch.toLowerCase()
  if (t === 'n') return 'n'
  if (t === 'b') return 'b'
  if (t === 'r') return 'r'
  return null
}

interface ArmMotionRecorderProps {
  arms: ArmLandmarks | null
  armMotion: {
    startRecording: () => void
    addPoint: (wrist: Vec2) => void
    stopRecording: () => MatchResult
  }
}

export function ArmMotionRecorder({ arms, armMotion }: ArmMotionRecorderProps) {
  const {
    gestureState,
    armModeEnabled,
    game,
    calibration,
    playerSide,
    setArmMismatch,
    setArmDetection,
    setArmDestinationSquare,
  } = useGameStore()

  const { startRecording, addPoint, stopRecording } = armMotion

  const wasGrabbingRef = useRef(false)
  const lastLeftWristRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!armModeEnabled) return

    const nowGrabbing = gestureState === 'grabbing'

    // ── Grabbing starts ────────────────────────────────────────────────────
    if (nowGrabbing && !wasGrabbingRef.current) {
      startRecording()
      lastLeftWristRef.current = null
      setArmDestinationSquare(null)
    }

    // ── While grabbing: track LEFT wrist ───────────────────────────────────
    if (nowGrabbing && arms) {
      const lw = arms.leftWrist
      addPoint({ x: lw.x, y: lw.y }) // trajectory uses raw (mirroring handled in matcher)
      lastLeftWristRef.current = { x: lw.x, y: lw.y }

      // Update destination continuously so useGesture can drop on release frame.
      // Snap to legal targets + selected origin square (origin release cancels selection).
      const flipped = playerSide === 'black'
      const { squareName, col, row } = coordsToSquare(lw.x, lw.y, calibration, flipped)
      const snapped = snapToSelectableTarget(squareName, col, row, game.legalTargets, game.selectedSquare)
      setArmDestinationSquare(snapped)
    }

    // ── Grabbing ends: classify + compute destination ─────────────────────
    if (!nowGrabbing && wasGrabbingRef.current) {
      const result = stopRecording()

      // Destination square is updated continuously while grabbing.
      if (!lastLeftWristRef.current) setArmDestinationSquare(null)

      // — Piece-type mismatch check ———————————————————————————————————————
      if (result.pieceType !== null) {
        const selectedSq = game.selectedSquare
        if (selectedSq) {
          const grabbedArm = getArmTypeFromFenAndSquare(game.fen, selectedSq)
          const mismatch =
            grabbedArm !== null &&
            result.pieceType !== grabbedArm
          setArmMismatch(mismatch)
          if (mismatch) setTimeout(() => setArmMismatch(false), 1500)
        }
      } else {
        setArmDetection(null, 0)
      }
    }

    wasGrabbingRef.current = nowGrabbing
  }, [
    gestureState, armModeEnabled, arms, calibration, playerSide,
    startRecording, addPoint, stopRecording,
    game.selectedSquare, game.fen, game.legalTargets,
    setArmMismatch, setArmDetection, setArmDestinationSquare,
  ])

  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getArmTypeFromFenAndSquare(fen: string, square: string): ArmPieceType | null {
  try {
    const boardFen = fen.split(' ')[0]
    const ranks = boardFen.split('/')
    const file = square.charCodeAt(0) - 97
    const rank = 8 - parseInt(square[1])
    if (rank < 0 || rank > 7 || file < 0 || file > 7) return null
    const rankStr = ranks[rank]
    let col = 0
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') { col += parseInt(ch) }
      else { if (col === file) return pieceCharToArm(ch); col++ }
    }
  } catch { /* ignore */ }
  return null
}

function snapToSelectableTarget(
  candidateSquare: string,
  candidateCol: number,
  candidateRow: number,
  legalTargets: string[],
  selectedSquare: string | null,
): string {
  const targets = selectedSquare
    ? Array.from(new Set([selectedSquare, ...legalTargets]))
    : legalTargets

  if (!targets || targets.length === 0) return candidateSquare
  if (targets.includes(candidateSquare)) return candidateSquare

  let best = targets[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const sq of targets) {
    const file = sq.charCodeAt(0) - 97
    const rank = Number.parseInt(sq[1], 10)
    if (Number.isNaN(rank)) continue
    const row = 8 - rank
    const dist = (file - candidateCol) ** 2 + (row - candidateRow) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = sq
    }
  }
  return best
}
