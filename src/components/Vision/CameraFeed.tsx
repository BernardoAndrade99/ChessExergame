/**
 * CameraFeed.tsx — Updated for Phase 1.5
 * Runs HandLandmarker + (optionally) PoseLandmarker on the same video element.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useMediaPipeHands } from '../../hooks/useMediaPipeHands'
import { useMediaPipePose } from '../../hooks/useMediaPipePose'
import type { ArmLandmarks } from '../../hooks/useMediaPipePose'
import { HandOverlay } from './HandOverlay'
import { PoseOverlay } from './PoseOverlay'
import { useGameStore } from '../../store/gameStore'

interface CameraFeedProps {
  onLandmarks: (landmarks: NormalizedLandmark[] | null) => void
  onPoseLandmarks?: (arms: ArmLandmarks | null) => void
  enabled?: boolean
  showControls?: boolean
}

type CameraSize = 'compact' | 'medium' | 'large'

const CAMERA_SIZES: Record<CameraSize, { label: string }> = {
  compact: { label: 'Compact' },
  medium: { label: 'Medium' },
  large: { label: 'Large' },
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  onLandmarks,
  onPoseLandmarks,
  enabled = true,
  showControls = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [arms, setArms] = useState<ArmLandmarks | null>(null)
  const [fps, setFps] = useState(0)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraSize, setCameraSize] = useState<CameraSize>(() => {
    const saved = localStorage.getItem('chessmove_camera_size_v1')
    return (saved === 'compact' || saved === 'medium' || saved === 'large') ? saved : 'medium'
  })
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { armModeEnabled } = useGameStore()

  const handleResults = useCallback((lm: NormalizedLandmark[] | null) => {
    setLandmarks(lm)
    onLandmarks(lm)
    if (lm && !cameraActive) setCameraActive(true)
  }, [onLandmarks, cameraActive])

  const handlePoseResults = useCallback((result: ArmLandmarks | null) => {
    setArms(result)
    onPoseLandmarks?.(result)
  }, [onPoseLandmarks])

  const { getFps } = useMediaPipeHands({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    onResults: handleResults,
    enabled,
  })

  useMediaPipePose({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    onResults: handlePoseResults,
    enabled: enabled && armModeEnabled,
  })

  useEffect(() => {
    fpsIntervalRef.current = setInterval(() => setFps(getFps()), 1000)
    return () => {
      if (fpsIntervalRef.current !== null) {
        clearInterval(fpsIntervalRef.current)
      }
    }
  }, [getFps])

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.onplay = () => setCameraActive(true)
    }
  }, [])

  const handleSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as CameraSize
    setCameraSize(next)
    localStorage.setItem('chessmove_camera_size_v1', next)
  }, [])

  return (
    <div className={`camera-container camera-size-${cameraSize}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <HandOverlay landmarks={landmarks} width={640} height={480} />
      {armModeEnabled && (
        <PoseOverlay arms={arms} width={640} height={480} />
      )}

      <div className="camera-status">
        <span className={`camera-dot ${cameraActive ? 'active' : ''}`} />
        {cameraActive ? `${fps} FPS` : 'Initializing…'}
        {armModeEnabled && (
          <span style={{
            marginLeft: 6,
            fontSize: '0.6rem',
            color: 'var(--accent-violet)',
            fontWeight: 600,
          }}>
            + Pose
          </span>
        )}
      </div>

      {showControls && (
        <div className="camera-options">
          <span className="camera-options-label">Size</span>
          <select
            className="camera-options-select"
            value={cameraSize}
            onChange={handleSizeChange}
            aria-label="Camera size"
          >
            {(Object.entries(CAMERA_SIZES) as Array<[CameraSize, { label: string }]>).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
