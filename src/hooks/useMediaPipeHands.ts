import { useEffect, useRef } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

interface UseMediaPipeHandsOptions {
  videoRef: React.RefObject<HTMLVideoElement>
  onResults: (landmarks: NormalizedLandmark[] | null, worldLandmarks?: NormalizedLandmark[]) => void
  enabled?: boolean
}

export function useMediaPipeHands({ videoRef, onResults, enabled = true }: UseMediaPipeHandsOptions) {
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const animFrameRef = useRef<number>(0)
  const isRunningRef = useRef(false)
  const fpsRef = useRef(0)
  const lastFrameTimeRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const videoElement = videoRef.current

    const detectFrame = () => {
      if (!isRunningRef.current) return
      const video = videoRef.current
      const landmarker = handLandmarkerRef.current

      if (video && landmarker && video.readyState >= 2) {
        const now = performance.now()
        const result = landmarker.detectForVideo(video, now)

        // FPS calculation
        if (lastFrameTimeRef.current > 0) {
          fpsRef.current = Math.round(1000 / (now - lastFrameTimeRef.current))
        }
        lastFrameTimeRef.current = now

        if (result.landmarks && result.landmarks.length > 0) {
          onResults(result.landmarks[0], result.worldLandmarks?.[0])
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

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        if (cancelled) { landmarker.close(); return }

        handLandmarkerRef.current = landmarker

        // Start webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        if (videoElement) {
          videoElement.srcObject = stream
          videoElement.play()
        }

        isRunningRef.current = true
        animFrameRef.current = requestAnimationFrame(detectFrame)
      } catch (err) {
        console.error('[MediaPipe] init error:', err)
      }
    }

    init()

    return () => {
      cancelled = true
      isRunningRef.current = false
      cancelAnimationFrame(animFrameRef.current)
      handLandmarkerRef.current?.close()
      handLandmarkerRef.current = null

      if (videoElement?.srcObject) {
        const stream = videoElement.srcObject as MediaStream
        stream.getTracks().forEach(t => t.stop())
        videoElement.srcObject = null
      }
    }
  }, [enabled, onResults, videoRef])

  return { getFps: () => fpsRef.current }
}
