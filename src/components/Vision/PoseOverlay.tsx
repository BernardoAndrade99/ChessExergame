/**
 * PoseOverlay.tsx
 * Phase 1.5 — Canvas overlay drawing body skeleton (shoulder→elbow→wrist).
 * Renders on top of the camera feed using the same dimensions.
 */

import React, { useRef, useEffect } from 'react'
import type { ArmLandmarks } from '../../hooks/useMediaPipePose'
import { useGameStore } from '../../store/gameStore'

interface PoseOverlayProps {
  arms: ArmLandmarks | null
  width: number
  height: number
}

type SkeletonPoint = { x: number; y: number }

export const PoseOverlay: React.FC<PoseOverlayProps> = ({ arms, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isRecordingTrajectory, detectedPieceType, armModeEnabled } = useGameStore()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    if (!arms || !armModeEnabled) return

    // Mirror horizontally (selfie view)
    const mirror = (lm: { x: number; y: number }): SkeletonPoint => ({
      x: (1 - lm.x) * width,
      y: lm.y * height,
    })

    const leftShoulder  = mirror(arms.leftShoulder)
    const rightShoulder = mirror(arms.rightShoulder)
    const leftElbow     = mirror(arms.leftElbow)
    const rightElbow    = mirror(arms.rightElbow)
    const leftWrist     = mirror(arms.leftWrist)
    const rightWrist    = mirror(arms.rightWrist)

    // Color scheme
    const isRecording = isRecordingTrajectory
    const pieceColor =
      detectedPieceType === 'n' ? '#f59e0b' :  // Knight — amber
      detectedPieceType === 'b' ? '#8b5cf6' :  // Bishop — violet
      detectedPieceType === 'r' ? '#0ea5e9' :  // Rook — sapphire
      isRecording ? '#ef4444' :                 // Recording — red
      'rgba(255,255,255,0.4)'                   // Idle — dim white

    const lineColor = isRecording ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.25)'
    const lineWidth = isRecording ? 2 : 1.5

    // Draw skeleton limbs
    const drawLine = (a: SkeletonPoint, b: SkeletonPoint) => {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // Shoulder bar
    drawLine(leftShoulder, rightShoulder)
    // Left arm
    drawLine(leftShoulder, leftElbow)
    drawLine(leftElbow, leftWrist)
    // Right arm
    drawLine(rightShoulder, rightElbow)
    drawLine(rightElbow, rightWrist)

    // Joint dots
    const drawDot = (p: SkeletonPoint, radius: number, color: string) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    const jointColor = 'rgba(255,255,255,0.6)'
    drawDot(leftShoulder,  4, jointColor)
    drawDot(rightShoulder, 4, jointColor)
    drawDot(leftElbow,     5, jointColor)
    drawDot(rightElbow,    5, jointColor)

    // Wrist dots — larger, colored when recording
    drawDot(leftWrist,  isRecording ? 9 : 6, isRecording ? pieceColor : jointColor)
    drawDot(rightWrist, isRecording ? 9 : 6, isRecording ? pieceColor : jointColor)

    // Pulse ring on wrists when recording
    if (isRecording) {
      const pulse = (Date.now() % 800) / 800  // 0–1 cycle
      const radius = 10 + pulse * 6
      const alpha = 1 - pulse
      ;[leftWrist, rightWrist].forEach(wrist => {
        ctx.beginPath()
        ctx.arc(wrist.x, wrist.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(239,68,68,${alpha})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
      // Re-request animation frame to animate the pulse
      requestAnimationFrame(() => {
        // trigger re-render via parent state (handled by parent RAF)
      })
    }

    // Piece-type badge near dominant (right) wrist when detected
    if (detectedPieceType) {
      const icon = detectedPieceType === 'n' ? '♞' : detectedPieceType === 'b' ? '♝' : '♜'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillStyle = pieceColor
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 4
      ctx.fillText(icon, rightWrist.x + 12, rightWrist.y - 12)
      ctx.shadowBlur = 0
    }
  }, [arms, width, height, isRecordingTrajectory, detectedPieceType, armModeEnabled])

  return (
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
        transform: 'scaleX(1)',  // NOT mirrored — we mirror coords manually
      }}
    />
  )
}
