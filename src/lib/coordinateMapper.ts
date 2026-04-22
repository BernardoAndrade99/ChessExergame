export interface CalibrationBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

// Full range by default — calibrate for a tighter personal zone
const DEFAULT_BOUNDS: CalibrationBounds = { xMin: 0.0, xMax: 1.0, yMin: 0.05, yMax: 0.95 }

// Load calibration from localStorage
export function loadCalibration(): CalibrationBounds {
  try {
    const raw = localStorage.getItem('chessmove_calibration_v1')
    if (raw) return JSON.parse(raw) as CalibrationBounds
  } catch { /* ignore */ }
  return DEFAULT_BOUNDS
}

export function saveCalibration(bounds: CalibrationBounds) {
  localStorage.setItem('chessmove_calibration_v1', JSON.stringify(bounds))
}

export function clearCalibration() {
  localStorage.removeItem('chessmove_calibration_v1')
}

export function hasCalibration(): boolean {
  return !!localStorage.getItem('chessmove_calibration_v1')
}

/**
 * Maps a MediaPipe normalized coord (already mirror-corrected) through
 * the calibration bounding box to a [0, 1] range.
 */
export function remapCalibrated(raw: number, min: number, max: number): number {
  const clamped = Math.min(Math.max(raw, min), max)
  return (clamped - min) / (max - min)
}

/**
 * Convert normalized MediaPipe coordinates to a board square index (0–63).
 *
 * MediaPipe landmark coords are in [0,1] with (0,0) at top-left.
 * We mirror x, apply calibration remap, then compute col/row.
 *
 * @param rawX  MediaPipe x (not yet mirrored)
 * @param rawY  MediaPipe y
 * @param bounds Calibration bounding box
 * @param flipped Whether board is flipped (Black's perspective)
 * @returns { col, row, squareIndex, squareName }
 */
export function coordsToSquare(
  rawX: number,
  rawY: number,
  bounds: CalibrationBounds,
  flipped = false
): { col: number; row: number; squareIndex: number; squareName: string } {
  // Mirror x (acts like a mirror image)
  const mx = 1.0 - rawX

  // Remap through calibration
  const x = remapCalibrated(mx, bounds.xMin, bounds.xMax)
  const y = remapCalibrated(rawY, bounds.yMin, bounds.yMax)

  // Map to grid
  let col = Math.min(7, Math.max(0, Math.floor(x * 8)))
  let row = Math.min(7, Math.max(0, Math.floor(y * 8)))

  if (flipped) {
    col = 7 - col
    row = 7 - row
  }

  const squareIndex = row * 8 + col
  const squareName = `${'abcdefgh'[col]}${8 - row}`

  return { col, row, squareIndex, squareName }
}

/**
 * Convert normalized coords to pixel position on screen element.
 */
export function coordsToPixel(
  rawX: number,
  rawY: number,
  containerWidth: number,
  containerHeight: number
): { px: number; py: number } {
  const mx = 1.0 - rawX
  return {
    px: mx * containerWidth,
    py: rawY * containerHeight,
  }
}
