/**
 * useMediaPipePose.ts
 * Phase 1.5 — MediaPipe PoseLandmarker integration.
 *
 * Shares the webcam stream with useMediaPipeHands (same video element).
 * Only extracts the 6 landmarks needed for arm tracking:
 *   11 = left shoulder,  12 = right shoulder
 *   13 = left elbow,     14 = right elbow
 *   15 = left wrist,     16 = right wrist
 */

import { useEffect, useRef } from 'react'
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Landmark indices we care about
export const POSE_LANDMARKS = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
} as const

export interface ArmLandmarks {
  leftShoulder:  NormalizedLandmark
  rightShoulder: NormalizedLandmark
  leftElbow:     NormalizedLandmark
  rightElbow:    NormalizedLandmark
  leftWrist:     NormalizedLandmark
  rightWrist:    NormalizedLandmark
}

interface UseMediaPipePoseOptions {
  videoRef: React.RefObject<HTMLVideoElement>
  onResults: (arms: ArmLandmarks | null) => void
  enabled?: boolean
}

export function useMediaPipePose({
  videoRef,
  onResults,
  enabled = true,
}: UseMediaPipePoseOptions) {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null)
  const animFrameRef = useRef<number>(0)
  const isRunningRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const detectFrame = () => {
      if (!isRunningRef.current) return
      const video = videoRef.current
      const landmarker = poseLandmarkerRef.current

      if (video && landmarker && video.readyState >= 2) {
        const now = performance.now()
        const result = landmarker.detectForVideo(video, now)

        if (result.landmarks && result.landmarks.length > 0) {
          const lm = result.landmarks[0]
          // Ensure all required landmarks exist
          if (lm.length > 16) {
            onResults({
              leftShoulder:  lm[POSE_LANDMARKS.LEFT_SHOULDER],
              rightShoulder: lm[POSE_LANDMARKS.RIGHT_SHOULDER],
              leftElbow:     lm[POSE_LANDMARKS.LEFT_ELBOW],
              rightElbow:    lm[POSE_LANDMARKS.RIGHT_ELBOW],
              leftWrist:     lm[POSE_LANDMARKS.LEFT_WRIST],
              rightWrist:    lm[POSE_LANDMARKS.RIGHT_WRIST],
            })
          } else {
            onResults(null)
          }
        } else {
          onResults(null)
        }
      }

      animFrameRef.current = requestAnimationFrame(detectFrame)
    }

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        if (cancelled) { landmarker.close(); return }

        poseLandmarkerRef.current = landmarker
        isRunningRef.current = true
        animFrameRef.current = requestAnimationFrame(detectFrame)
      } catch (err) {
        console.error('[MediaPipe Pose] init error:', err)
      }
    }

    init()

    return () => {
      cancelled = true
      isRunningRef.current = false
      cancelAnimationFrame(animFrameRef.current)
      poseLandmarkerRef.current?.close()
      poseLandmarkerRef.current = null
    }
  }, [enabled, onResults, videoRef])
}
