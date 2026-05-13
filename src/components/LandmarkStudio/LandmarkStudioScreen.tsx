/**
 * LandmarkStudioScreen.tsx
 * Fullscreen black canvas showing live MediaPipe hand + full-body pose landmarks.
 * Designed for screen-recording gesture demonstrations.
 */

import React, { useRef, useCallback, useEffect, useState } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useMediaPipeHands } from '../../hooks/useMediaPipeHands'
import { useMediaPipePose } from '../../hooks/useMediaPipePose'
import { useGameStore } from '../../store/gameStore'

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [0, 9], [9, 10], [10, 11], [11, 12],     // middle
  [0, 13], [13, 14], [14, 15], [15, 16],   // ring
  [0, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [5, 9], [9, 13], [13, 17],               // palm cross
]

// MediaPipe Pose — all 33 landmark connections
const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

// Face landmark indices
const FACE_LANDMARKS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
// Upper-body joint indices (larger dots)
const KEY_JOINTS = new Set([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28])

export const LandmarkStudioScreen: React.FC = () => {
  const { setAppScreen } = useGameStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const handLandmarksRef = useRef<NormalizedLandmark[] | null>(null)
  const allPoseLandmarksRef = useRef<NormalizedLandmark[] | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [initialized, setInitialized] = useState(false)

  // Track window size
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleHands = useCallback((lm: NormalizedLandmark[] | null) => {
    handLandmarksRef.current = lm
    if (lm && !initialized) setInitialized(true)
  }, [initialized])

  const handleAllPose = useCallback((lm: NormalizedLandmark[] | null) => {
    allPoseLandmarksRef.current = lm
    if (lm && !initialized) setInitialized(true)
  }, [initialized])

  useMediaPipeHands({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    onResults: handleHands,
    enabled: true,
  })

  useMediaPipePose({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    onResults: () => {},      // arm-only results not needed here
    onAllLandmarks: handleAllPose,
    enabled: true,
  })

  // Render loop — reads canvas.width/height directly so it's always up to date
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return }

      const W = canvas.width
      const H = canvas.height

      ctx.clearRect(0, 0, W, H)

      // ── Full-body pose ────────────────────────────────────────────────────
      const poseLm = allPoseLandmarksRef.current
      if (poseLm && poseLm.length >= 33) {
        // Mirror: pose landmarks use (1-x) for selfie view
        const m = (lm: NormalizedLandmark) => ({ x: (1 - lm.x) * W, y: lm.y * H })

        // Connections
        for (const [a, b] of POSE_CONNECTIONS) {
          if (!poseLm[a] || !poseLm[b]) continue
          const pa = m(poseLm[a])
          const pb = m(poseLm[b])
          // Face links dimmer
          const isFaceLink = FACE_LANDMARKS.has(a) && FACE_LANDMARKS.has(b)
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.strokeStyle = isFaceLink ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)'
          ctx.lineWidth = isFaceLink ? 1.5 : 2.5
          ctx.lineCap = 'round'
          ctx.stroke()
        }

        // Landmark dots
        for (let i = 0; i < poseLm.length; i++) {
          const p = m(poseLm[i])
          const isFace = FACE_LANDMARKS.has(i)
          const isKey = KEY_JOINTS.has(i)
          const r = isFace ? 3 : isKey ? 6 : 4
          const color = isFace
            ? 'rgba(255,255,255,0.35)'
            : [15, 16].includes(i) ? '#f59e0b'   // wrists — amber
            : [27, 28].includes(i) ? '#0ea5e9'   // ankles — sapphire
            : 'rgba(255,255,255,0.65)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }

      // ── Hand landmarks ────────────────────────────────────────────────────
      const handLm = handLandmarksRef.current
      if (handLm) {
        // Mirror horizontally (selfie view)
        ctx.save()
        ctx.scale(-1, 1)
        ctx.translate(-W, 0)

        // Connections
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        for (const [a, b] of HAND_CONNECTIONS) {
          const la = handLm[a]
          const lb = handLm[b]
          ctx.beginPath()
          ctx.moveTo(la.x * W, la.y * H)
          ctx.lineTo(lb.x * W, lb.y * H)
          ctx.stroke()
        }

        // Landmark dots
        for (let i = 0; i < handLm.length; i++) {
          const lm = handLm[i]
          const isTip = [4, 8, 12, 16, 20].includes(i)
          ctx.beginPath()
          ctx.arc(lm.x * W, lm.y * H, isTip ? 8 : 5, 0, Math.PI * 2)
          ctx.fillStyle = isTip ? '#f59e0b' : 'rgba(255, 255, 255, 0.85)'
          ctx.fill()
        }

        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* Hidden video — MediaPipe needs a real element with a camera stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
      />

      {/* Full-screen landmark canvas */}
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Status hint while initializing */}
      {!initialized && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.35)',
          fontFamily: 'Outfit, sans-serif',
          fontSize: '1rem',
          letterSpacing: '0.05em',
          pointerEvents: 'none',
        }}>
          Initializing camera…
        </div>
      )}

      {/* Back button — small and unobtrusive */}
      <button
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.7)',
          borderRadius: 8,
          padding: '6px 14px',
          cursor: 'pointer',
          fontFamily: 'Outfit, sans-serif',
          fontSize: '0.8rem',
        }}
        onClick={() => setAppScreen('sequences')}
      >
        ← Back
      </button>
    </div>
  )
}
