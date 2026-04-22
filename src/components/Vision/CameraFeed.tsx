import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useMediaPipeHands } from '../../hooks/useMediaPipeHands'
import { HandOverlay } from './HandOverlay'

interface CameraFeedProps {
  onLandmarks: (landmarks: NormalizedLandmark[] | null) => void
  enabled?: boolean
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ onLandmarks, enabled = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [fps, setFps] = useState(0)
  const [cameraActive, setCameraActive] = useState(false)
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleResults = useCallback((lm: NormalizedLandmark[] | null) => {
    setLandmarks(lm)
    onLandmarks(lm)
    if (lm && !cameraActive) setCameraActive(true)
  }, [onLandmarks, cameraActive])

  const { getFps } = useMediaPipeHands({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    onResults: handleResults,
    enabled,
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

  return (
    <div className="camera-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <HandOverlay landmarks={landmarks} width={640} height={480} />

      <div className="camera-status">
        <span className={`camera-dot ${cameraActive ? 'active' : ''}`} />
        {cameraActive ? `${fps} FPS` : 'Initializing…'}
      </div>
    </div>
  )
}
