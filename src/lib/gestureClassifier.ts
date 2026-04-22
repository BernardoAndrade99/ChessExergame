import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Landmark indices (MediaPipe Hands)
const WRIST = 0
const THUMB_TIP = 4
const INDEX_TIP = 8
const INDEX_PIP = 6
const MIDDLE_TIP = 12
const MIDDLE_PIP = 10
const RING_TIP = 16
const RING_PIP = 14
const PINKY_TIP = 20
const PINKY_PIP = 18
const THUMB_IP = 3
const THUMB_MCP = 2

export type GestureState = 'idle' | 'hovering' | 'grabbing' | 'dropping'

export interface FingerStates {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
}

export interface GestureResult {
  isPinching: boolean
  pinchDistance: number
  fingerStates: FingerStates
  indexTip: { x: number; y: number; z: number }
  palmCenter: { x: number; y: number }
}

const PINCH_THRESHOLD = 0.055

function euclidean2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Classify a set of hand landmarks into gesture data.
 * Rule-based: finger extended if tip_y < PIP_y (in MediaPipe coords, smaller y = higher).
 */
export function classifyGesture(landmarks: NormalizedLandmark[]): GestureResult {
  if (!landmarks || landmarks.length < 21) {
    return {
      isPinching: false,
      pinchDistance: 1,
      fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      indexTip: { x: 0.5, y: 0.5, z: 0 },
      palmCenter: { x: 0.5, y: 0.5 },
    }
  }

  const thumbTip  = landmarks[THUMB_TIP]
  const indexTip  = landmarks[INDEX_TIP]
  const thumbMcp  = landmarks[THUMB_MCP]
  const wrist     = landmarks[WRIST]

  // Pinch detection
  const pinchDistance = euclidean2D(thumbTip, indexTip)
  const isPinching = pinchDistance < PINCH_THRESHOLD

  // Finger extension rules
  const fingerStates: FingerStates = {
    // Thumb: compare x-axis (thumb extends sideways)
    thumb:  landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x,
    index:  landmarks[INDEX_TIP].y  < landmarks[INDEX_PIP].y,
    middle: landmarks[MIDDLE_TIP].y < landmarks[MIDDLE_PIP].y,
    ring:   landmarks[RING_TIP].y   < landmarks[RING_PIP].y,
    pinky:  landmarks[PINKY_TIP].y  < landmarks[PINKY_PIP].y,
  }

  // Palm center: midpoint of wrist and middle MCP
  const palmCenter = {
    x: (wrist.x + landmarks[9].x) / 2,
    y: (wrist.y + landmarks[9].y) / 2,
  }

  // Correct thumb for right vs left hand (simplified: check thumb relative to index MCP)
  // If thumb tip is to the right of thumb MCP, it's extended (for right hand mirrored)
  const thumbExtended = Math.abs(thumbTip.x - thumbMcp.x) > 0.04
  fingerStates.thumb = thumbExtended

  return {
    isPinching,
    pinchDistance,
    fingerStates,
    indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z },
    palmCenter,
  }
}

/**
 * Count how many fingers are extended
 */
export function countExtendedFingers(fs: FingerStates): number {
  return [fs.thumb, fs.index, fs.middle, fs.ring, fs.pinky].filter(Boolean).length
}

/**
 * Encode finger state as a 5-bit string (thumb, index, middle, ring, pinky)
 */
export function fingerPattern(fs: FingerStates): string {
  return [fs.thumb, fs.index, fs.middle, fs.ring, fs.pinky]
    .map(b => (b ? '1' : '0'))
    .join('')
}
