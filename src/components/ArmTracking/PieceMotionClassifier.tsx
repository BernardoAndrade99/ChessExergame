/**
 * PieceMotionClassifier.tsx
 * Phase 1.5 — Visual debug/feedback component for arm tracking.
 * Shows: live trajectory trace on camera overlay, detected piece type badge, confidence bar.
 *
 * Mount this inside the camera area (position: absolute, same size as video).
 */

import React, { useRef, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { Vec2 } from '../../lib/trajectoryMatcher'

interface PieceMotionClassifierProps {
  getTrajectory: () => Vec2[]
  width: number
  height: number
}

const PIECE_LABELS: Record<string, string> = {
  n: '♞ Knight',
  b: '♝ Bishop',
  r: '♜ Rook',
}

const PIECE_COLORS: Record<string, string> = {
  n: '#f59e0b',   // amber
  b: '#8b5cf6',   // violet
  r: '#0ea5e9',   // sapphire
}

export const PieceMotionClassifier: React.FC<PieceMotionClassifierProps> = ({
  getTrajectory,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { detectedPieceType, armConfidence, isRecordingTrajectory, armModeEnabled, armMismatch } =
    useGameStore()

  // Draw trajectory trace on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !armModeEnabled) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    if (!isRecordingTrajectory) return

    const pts = getTrajectory()
    if (pts.length < 2) return

    // Convert normalized [0,1] to canvas pixels (mirrored horizontally)
    const toCanvas = (p: Vec2) => ({ x: (1 - p.x) * width, y: p.y * height })

    ctx.beginPath()
    const first = toCanvas(pts[0])
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < pts.length; i++) {
      const cp = toCanvas(pts[i])
      ctx.lineTo(cp.x, cp.y)
    }
    ctx.strokeStyle = 'rgba(239,68,68,0.8)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Arrow head at last point
    if (pts.length >= 2) {
      const last = toCanvas(pts[pts.length - 1])
      ctx.beginPath()
      ctx.arc(last.x, last.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444'
      ctx.fill()
    }
  }, [isRecordingTrajectory, getTrajectory, width, height, armModeEnabled])

  if (!armModeEnabled) return null

  const label = detectedPieceType ? PIECE_LABELS[detectedPieceType] : null
  const color = detectedPieceType ? PIECE_COLORS[detectedPieceType] : '#6b7280'
  const confPct = Math.round(armConfidence * 100)

  return (
    <>
      {/* Trajectory canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* HUD badge — bottom of camera feed */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}>
        {/* Mismatch warning */}
        {armMismatch && (
          <div style={{
            background: 'rgba(239,68,68,0.9)',
            color: '#fff',
            borderRadius: 7,
            padding: '3px 8px',
            fontSize: '0.62rem',
            fontWeight: 700,
            fontFamily: 'Outfit, sans-serif',
            animation: 'fadeIn 0.2s ease',
          }}>
            ⚠️ Wrong arm pattern!
          </div>
        )}

        {/* Piece type badge */}
        {(isRecordingTrajectory || label) && (
          <div style={{
            background: 'rgba(10,10,20,0.85)',
            border: `1px solid ${color}66`,
            borderRadius: 8,
            padding: '4px 9px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              fontSize: '0.62rem',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              color: isRecordingTrajectory && !label ? '#ef4444' : color,
              letterSpacing: '0.04em',
            }}>
              {isRecordingTrajectory && !label ? '⏺ Recording…' : label ?? ''}
            </div>
            {/* Confidence bar */}
            {!isRecordingTrajectory && detectedPieceType && (
              <div style={{ width: 66, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  width: `${confPct}%`,
                  borderRadius: 2,
                  background: armConfidence >= 0.75 ? '#10b981'
                    : armConfidence >= 0.5 ? '#f59e0b'
                    : '#ef4444',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
            {!isRecordingTrajectory && detectedPieceType && (
              <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'Outfit' }}>
                {confPct}% confidence
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
