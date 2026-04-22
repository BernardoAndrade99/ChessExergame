import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { KalmanFilter2D } from '../../lib/kalmanFilter'
import { saveCalibration } from '../../lib/coordinateMapper'
import { useGameStore } from '../../store/gameStore'

const CORNERS = [
  { id: 'tl', label: 'TOP LEFT',     style: { top: 40, left: 40 } },
  { id: 'tr', label: 'TOP RIGHT',    style: { top: 40, right: 40 } },
  { id: 'br', label: 'BOTTOM RIGHT', style: { bottom: 40, right: 40 } },
  { id: 'bl', label: 'BOTTOM LEFT',  style: { bottom: 40, left: 40 } },
]

interface CalibrationWizardProps {
  landmarks: NormalizedLandmark[] | null
  onComplete: () => void
  onSkip: () => void
}

export const CalibrationWizard: React.FC<CalibrationWizardProps> = ({
  landmarks, onComplete, onSkip
}) => {
  const { setCalibration } = useGameStore()
  const [step, setStep] = useState(0)
  const [holdProgress, setHoldProgress] = useState(0)
  const [completedCorners, setCompletedCorners] = useState<number[]>([])
  const cornerDataRef = useRef<{ x: number; y: number }[]>([])
  const holdStartRef = useRef<number | null>(null)
  const kalman = useRef(new KalmanFilter2D(0.005, 0.08))
  const HOLD_DURATION = 1500 // ms

  const checkPinch = useCallback((lm: NormalizedLandmark[]) => {
    const dx = lm[4].x - lm[8].x
    const dy = lm[4].y - lm[8].y
    return Math.sqrt(dx * dx + dy * dy) < 0.055
  }, [])

  useEffect(() => {
    if (!landmarks || step >= 4) return
    const isPinching = checkPinch(landmarks)
    const smoothed = kalman.current.update(landmarks[8].x, landmarks[8].y)

    if (isPinching) {
      if (holdStartRef.current === null) holdStartRef.current = Date.now()
      const elapsed = Date.now() - holdStartRef.current
      const progress = Math.min(1, elapsed / HOLD_DURATION)
      setHoldProgress(progress)

      if (elapsed >= HOLD_DURATION) {
        // Record this corner
        cornerDataRef.current.push({ x: smoothed.x, y: smoothed.y })
        setCompletedCorners(prev => [...prev, step])
        holdStartRef.current = null
        setHoldProgress(0)

        if (step < 3) {
          setStep(prev => prev + 1)
        } else {
          // All 4 corners recorded — compute bounds
          const xs = cornerDataRef.current.map(c => c.x)
          const ys = cornerDataRef.current.map(c => c.y)
          // Mirror x since camera is mirrored
          const mirroredXs = xs.map(x => 1 - x)
          const bounds = {
            xMin: Math.min(...mirroredXs),
            xMax: Math.max(...mirroredXs),
            yMin: Math.min(...ys),
            yMax: Math.max(...ys),
          }
          saveCalibration(bounds)
          setCalibration(bounds)
          onComplete()
        }
      }
    } else {
      holdStartRef.current = null
      setHoldProgress(0)
    }
  }, [landmarks, step, checkPinch, setCalibration, onComplete])

  return (
    <div className="calibration-overlay">
      <div style={{ textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontFamily: 'Outfit', fontSize: '1.8rem', fontWeight: 700, marginBottom: 8 }}>
          🎯 Hand Calibration
        </div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 420 }}>
          Point your index finger to each corner of your interaction zone and hold a <strong>pinch</strong> for 1.5 seconds.
        </div>
        <div className="calibration-progress">
          <div
            className="calibration-progress-fill"
            style={{ width: `${(completedCorners.length / 4) * 100}%` }}
          />
        </div>
        <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Step {Math.min(step + 1, 4)} of 4 — {step < 4 ? CORNERS[step]?.label : 'Done!'}
        </div>
      </div>

      {CORNERS.map((c, i) => (
        <div
          key={c.id}
          className={`calibration-corner ${i === step ? 'active' : ''} ${completedCorners.includes(i) ? 'done' : ''}`}
          style={{ position: 'absolute', ...c.style } as React.CSSProperties}
        >
          {completedCorners.includes(i) ? '✓' : i + 1}
          {i === step && holdProgress > 0 && (
            <svg
              style={{ position: 'absolute', inset: -8, width: 76, height: 76 }}
              viewBox="0 0 76 76"
            >
              <circle
                cx="38" cy="38" r="35"
                fill="none"
                stroke="var(--accent-gold)"
                strokeWidth="3"
                strokeDasharray="219.9"
                strokeDashoffset={219.9 * (1 - holdProgress)}
                transform="rotate(-90 38 38)"
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
            </svg>
          )}
        </div>
      ))}

      <button
        className="btn btn-ghost"
        onClick={onSkip}
        style={{ position: 'absolute', bottom: 24, right: 24 }}
      >
        Skip (use defaults)
      </button>
    </div>
  )
}
