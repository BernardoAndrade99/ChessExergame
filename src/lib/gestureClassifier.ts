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
  isLShape: boolean
  isPeaceSign: boolean
  isFist: boolean
  isFourFingers: boolean
  isOpenPalm: boolean
  isOneIndex: boolean
  indexTip: { x: number; y: number; z: number }
  palmCenter: { x: number; y: number }
}

const PINCH_THRESHOLD = 0.065

function euclidean2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function classifyGesture(landmarks: NormalizedLandmark[]): GestureResult {
  if (!landmarks || landmarks.length < 21) {
    return {
      isPinching: false,
      pinchDistance: 1,
      fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      isLShape: false,
      isPeaceSign: false,
      isFist: false,
      isFourFingers: false,
      isOpenPalm: false,
      isOneIndex: false,
      indexTip: { x: 0.5, y: 0.5, z: 0 },
      palmCenter: { x: 0.5, y: 0.5 },
    }
  }

  const thumbTip  = landmarks[THUMB_TIP]
  const indexTip  = landmarks[INDEX_TIP]
  const thumbMcp  = landmarks[THUMB_MCP]
  const wrist     = landmarks[WRIST]

  const pinchDistance = euclidean2D(thumbTip, indexTip)
  const isPinching = pinchDistance < PINCH_THRESHOLD

  const fingerStates: FingerStates = {
    thumb:  landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x,
    index:  landmarks[INDEX_TIP].y  < landmarks[INDEX_PIP].y,
    middle: landmarks[MIDDLE_TIP].y < landmarks[MIDDLE_PIP].y,
    ring:   landmarks[RING_TIP].y   < landmarks[RING_PIP].y,
    pinky:  landmarks[PINKY_TIP].y  < landmarks[PINKY_PIP].y,
  }

  const palmCenter = {
    x: (wrist.x + landmarks[9].x) / 2,
    y: (wrist.y + landmarks[9].y) / 2,
  }

  const thumbExtended = Math.abs(thumbTip.x - thumbMcp.x) > 0.04

  // Finger spread: index-tip to pinky-tip distance, normalized by hand size (wrist→middle MCP).
  // Together ≈ 0.4–0.55, spread wide ≈ 0.75–1.0+; threshold 0.65 gives a clear gap.
  const handSize   = euclidean2D(landmarks[WRIST], landmarks[9])
  const spreadDist = euclidean2D(landmarks[INDEX_TIP], landmarks[PINKY_TIP])
  const isFingersSpread = handSize > 0.01 && (spreadDist / handSize) >= 0.65

  const allFourFingers = fingerStates.index && fingerStates.middle && fingerStates.ring && fingerStates.pinky

  const isLShape      = thumbExtended && fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky
  const isPeaceSign   = !thumbExtended && fingerStates.index && fingerStates.middle && !fingerStates.ring && !fingerStates.pinky
  const isOneIndex    = !thumbExtended && fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky
  const isFist        = !thumbExtended && !fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky
  // King:  four fingers extended, held together ("stop" hand)
  const isFourFingers = allFourFingers && !isFingersSpread
  // Queen: four fingers extended, spread wide
  const isOpenPalm    = allFourFingers && isFingersSpread

  return {
    isPinching,
    pinchDistance,
    fingerStates,
    isLShape,
    isPeaceSign,
    isFist,
    isFourFingers,
    isOpenPalm,
    isOneIndex,
    indexTip: { x: indexTip.x, y: indexTip.y, z: indexTip.z },
    palmCenter,
  }
}

export function countExtendedFingers(fs: FingerStates): number {
  return [fs.thumb, fs.index, fs.middle, fs.ring, fs.pinky].filter(Boolean).length
}

export function fingerPattern(fs: FingerStates): string {
  return [fs.thumb, fs.index, fs.middle, fs.ring, fs.pinky].map(b => (b ? '1' : '0')).join('')
}
