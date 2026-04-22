/**
 * useArmMotion.ts
 * Phase 1.5 — Wrist trajectory recorder + piece-type classifier.
 *
 * Usage:
 *   - Call startRecording() when pinch-grab begins
 *   - Call addPoint(wrist) every frame while grabbing
 *   - Call stopRecording() on pinch-release → returns MatchResult
 */

import { useRef, useCallback } from 'react'
import { matchPieceType } from '../lib/trajectoryMatcher'
import type { Vec2, MatchResult, ArmPieceType } from '../lib/trajectoryMatcher'
import { useGameStore } from '../store/gameStore'

// Sample every N frames to avoid too-dense trajectories
const SAMPLE_EVERY_N_FRAMES = 1
// Minimum points required to attempt classification
const MIN_POINTS = 5

export function useArmMotion() {
  const { setArmDetection, setRecordingTrajectory, armModeEnabled } = useGameStore()

  const isRecording = useRef(false)
  const frameCount = useRef(0)
  const trajectory = useRef<Vec2[]>([])
  const lastResultRef = useRef<MatchResult | null>(null)

  const startRecording = useCallback(() => {
    if (!armModeEnabled) return
    isRecording.current = true
    frameCount.current = 0
    trajectory.current = []
    setRecordingTrajectory(true)
    setArmDetection(null, 0)
  }, [armModeEnabled, setArmDetection, setRecordingTrajectory])

  const addPoint = useCallback((wrist: Vec2) => {
    if (!isRecording.current || !armModeEnabled) return
    frameCount.current++
    if (frameCount.current % SAMPLE_EVERY_N_FRAMES !== 0) return
    trajectory.current.push({ x: wrist.x, y: wrist.y })
  }, [armModeEnabled])

  const stopRecording = useCallback((): MatchResult => {
    isRecording.current = false
    setRecordingTrajectory(false)

    if (!armModeEnabled || trajectory.current.length < MIN_POINTS) {
      const noMatch: MatchResult = { pieceType: null, confidence: 0, label: 'Too short' }
      lastResultRef.current = noMatch
      setArmDetection(null, 0)
      return noMatch
    }

    const result = matchPieceType(trajectory.current)
    lastResultRef.current = result
    setArmDetection(result.pieceType as ArmPieceType | null, result.confidence)
    trajectory.current = []
    return result
  }, [armModeEnabled, setArmDetection, setRecordingTrajectory])

  const getTrajectory = useCallback((): Vec2[] => {
    return [...trajectory.current]
  }, [])

  const getLastResult = useCallback((): MatchResult | null => {
    return lastResultRef.current
  }, [])

  return { startRecording, addPoint, stopRecording, getTrajectory, getLastResult }
}
