import React, { useRef, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

interface HandOverlayProps {
  landmarks: NormalizedLandmark[] | null
  width: number
  height: number
}

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],         // thumb
  [0,5],[5,6],[6,7],[7,8],         // index
  [0,9],[9,10],[10,11],[11,12],    // middle
  [0,13],[13,14],[14,15],[15,16],  // ring
  [0,17],[17,18],[18,19],[19,20],  // pinky
  [5,9],[9,13],[13,17],            // palm
]

export const HandOverlay: React.FC<HandOverlayProps> = ({ landmarks, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    if (!landmarks) return

    // Mirror the canvas (because video is mirrored)
    ctx.save()
    ctx.scale(-1, 1)
    ctx.translate(-width, 0)

    // Draw connections
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'

    for (const [a, b] of CONNECTIONS) {
      const la = landmarks[a]
      const lb = landmarks[b]
      ctx.beginPath()
      ctx.moveTo(la.x * width, la.y * height)
      ctx.lineTo(lb.x * width, lb.y * height)
      ctx.stroke()
    }

    // Draw landmarks
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]
      const isKeyPoint = [4, 8, 12, 16, 20].includes(i) // fingertips
      ctx.beginPath()
      ctx.arc(lm.x * width, lm.y * height, isKeyPoint ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = isKeyPoint ? '#f59e0b' : 'rgba(255,255,255,0.7)'
      ctx.fill()
    }

    ctx.restore()
  }, [landmarks, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
    />
  )
}
