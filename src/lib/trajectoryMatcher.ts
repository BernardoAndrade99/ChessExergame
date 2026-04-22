/**
 * trajectoryMatcher.ts
 * Phase 1.5 — Classifies arm wrist trajectories into piece-type movements.
 *
 * Supported patterns:
 *   Knight  → L-shaped path (two straight segments at ~90°, any of 8 orientations)
 *   Bishop  → Diagonal path (dominant angle 30–60° or 120–150° from horizontal)
 *   Rook    → Orthogonal path (horizontal ±15° or vertical ±15°)
 *   null    → No confident match (Queen / King / Pawn use pointing cursor)
 */

export type ArmPieceType = 'n' | 'b' | 'r'  // knight, bishop, rook

export interface Vec2 {
  x: number
  y: number
}

export interface MatchResult {
  pieceType: ArmPieceType | null
  confidence: number   // 0–1
  label: string        // human-readable
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function vec2Sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y } }
function vec2Len(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y) }
function vec2Norm(v: Vec2): Vec2 {
  const l = vec2Len(v)
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l }
}
function vec2Dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y }
function angleDeg(v: Vec2): number {
  // Angle from positive-X axis in degrees [0, 180)
  return (Math.atan2(Math.abs(v.y), v.x) * 180) / Math.PI
}

// ─── Normalize path to unit bounding box ─────────────────────────────────────

export function normalizePath(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 1e-9)
  return points.map(p => ({ x: (p.x - minX) / span, y: (p.y - minY) / span }))
}

// ─── Smooth path (3-point moving average) ────────────────────────────────────

function smoothPath(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p
    return {
      x: (points[i - 1].x + p.x + points[i + 1].x) / 3,
      y: (points[i - 1].y + p.y + points[i + 1].y) / 3,
    }
  })
}

// ─── Compute total path length ────────────────────────────────────────────────

function pathLength(points: Vec2[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += vec2Len(vec2Sub(points[i], points[i - 1]))
  }
  return len
}

// ─── Find point of maximum curvature (split for Knight L) ────────────────────

function maxCurvatureIndex(points: Vec2[]): number {
  let maxK = -Infinity
  let idx = Math.floor(points.length / 2)
  const win = 3
  for (let i = win; i < points.length - win; i++) {
    const a = vec2Sub(points[i], points[i - win])
    const b = vec2Sub(points[i + win], points[i])
    const na = vec2Norm(a)
    const nb = vec2Norm(b)
    const curvature = 1 - vec2Dot(na, nb)  // 0 = straight, 2 = 180° turn
    if (curvature > maxK) { maxK = curvature; idx = i }
  }
  return idx
}

// ─── KNIGHT — L-shaped trajectory ────────────────────────────────────────────

/**
 * Detects an L-shaped wrist trajectory.
 * Splits path at max-curvature point, checks:
 *   1. Each segment is sufficiently straight (low internal curvature)
 *   2. The angle between segments is 70–110° (close to 90°)
 *   3. Both segments have non-trivial length
 */
function matchKnight(normalized: Vec2[]): number {
  if (normalized.length < 6) return 0
  const splitIdx = maxCurvatureIndex(normalized)
  const seg1 = normalized.slice(0, splitIdx + 1)
  const seg2 = normalized.slice(splitIdx)
  if (seg1.length < 3 || seg2.length < 3) return 0

  const dir1 = vec2Norm(vec2Sub(seg1[seg1.length - 1], seg1[0]))
  const dir2 = vec2Norm(vec2Sub(seg2[seg2.length - 1], seg2[0]))
  const dot = Math.abs(vec2Dot(dir1, dir2))  // 0 = perpendicular, 1 = parallel
  // dot near 0 means ~90° between segments
  const angleDiff = Math.acos(Math.min(1, dot)) * 180 / Math.PI

  // Check segment length balance (neither too short)
  const l1 = pathLength(seg1)
  const l2 = pathLength(seg2)
  const totalL = l1 + l2
  const balance = Math.min(l1, l2) / Math.max(l1, l2)  // 1 = perfect balance

  if (angleDiff < 55 || angleDiff > 125) return 0  // not L-shaped

  // Confidence: peaks at 90° angle + balanced segments
  const angleScore = 1 - Math.abs(angleDiff - 90) / 35   // max at 90°
  const balanceScore = balance                              // max at 1.0
  const lengthScore = Math.min(1, totalL / 0.5)           // reward longer paths

  return Math.max(0, angleScore * 0.5 + balanceScore * 0.3 + lengthScore * 0.2)
}

// ─── BISHOP — Diagonal trajectory ────────────────────────────────────────────

/**
 * Detects a diagonal wrist trajectory.
 * The overall direction vector must be at 30–60° or 120–150° from horizontal.
 * Path must also be relatively straight (low deviation from start→end line).
 */
function matchBishop(normalized: Vec2[]): number {
  if (normalized.length < 4) return 0
  const overall = vec2Sub(normalized[normalized.length - 1], normalized[0])
  if (vec2Len(overall) < 0.15) return 0  // too short

  const angle = angleDeg(overall)  // [0, 180)
  // Good diagonal bands: 30–60° and 120–150°
  const inDiag1 = angle >= 28 && angle <= 62
  const inDiag2 = angle >= 118 && angle <= 152
  if (!inDiag1 && !inDiag2) return 0

  // Straightness: average perpendicular deviation from start→end line
  const lineDir = vec2Norm(overall)
  const perp = { x: -lineDir.y, y: lineDir.x }
  let totalDev = 0
  const origin = normalized[0]
  for (const p of normalized) {
    const d = vec2Sub(p, origin)
    totalDev += Math.abs(vec2Dot(d, perp))
  }
  const avgDev = totalDev / normalized.length
  const straightness = Math.max(0, 1 - avgDev * 4)  // penalise wiggly paths

  // Angle score: distance from ideal 45° (or 135°)
  const nearest45 = inDiag1 ? 45 : 135
  const angleScore = 1 - Math.abs(angle - nearest45) / 20

  return Math.max(0, angleScore * 0.6 + straightness * 0.4)
}

// ─── ROOK — Orthogonal trajectory ────────────────────────────────────────────

/**
 * Detects a horizontal or vertical wrist trajectory.
 * Overall direction must be within ±18° of horizontal (0°) or vertical (90°).
 */
function matchRook(normalized: Vec2[]): number {
  if (normalized.length < 4) return 0
  const overall = vec2Sub(normalized[normalized.length - 1], normalized[0])
  if (vec2Len(overall) < 0.15) return 0  // too short

  const angle = angleDeg(overall)  // [0, 180)
  const isHoriz = angle <= 20 || angle >= 160
  const isVert  = angle >= 70 && angle <= 110
  if (!isHoriz && !isVert) return 0

  // Straightness check
  const lineDir = vec2Norm(overall)
  const perp = { x: -lineDir.y, y: lineDir.x }
  let totalDev = 0
  const origin = normalized[0]
  for (const p of normalized) {
    const d = vec2Sub(p, origin)
    totalDev += Math.abs(vec2Dot(d, perp))
  }
  const avgDev = totalDev / normalized.length
  const straightness = Math.max(0, 1 - avgDev * 4)

  // Angle score: distance from ideal 0° or 90°
  const idealAngle = isHoriz ? (angle > 90 ? 180 : 0) : 90
  const dist = Math.min(Math.abs(angle - idealAngle), 180 - Math.abs(angle - idealAngle))
  const angleScore = 1 - dist / 20

  return Math.max(0, angleScore * 0.6 + straightness * 0.4)
}

// ─── Public API ───────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5

export function matchPieceType(rawPoints: Vec2[]): MatchResult {
  if (rawPoints.length < 5) {
    return { pieceType: null, confidence: 0, label: 'Too few points' }
  }

  const smoothed = smoothPath(rawPoints)
  const normalized = normalizePath(smoothed)

  const knightScore  = matchKnight(normalized)
  const bishopScore  = matchBishop(normalized)
  const rookScore    = matchRook(normalized)

  const scores: Array<{ type: ArmPieceType; score: number; label: string }> = [
    { type: 'n', score: knightScore,  label: 'Knight (L-shape)'    },
    { type: 'b', score: bishopScore,  label: 'Bishop (diagonal)'   },
    { type: 'r', score: rookScore,    label: 'Rook (orthogonal)'   },
  ]

  // Sort descending
  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]

  if (best.score < CONFIDENCE_THRESHOLD) {
    return { pieceType: null, confidence: best.score, label: 'No match' }
  }

  return { pieceType: best.type, confidence: best.score, label: best.label }
}
