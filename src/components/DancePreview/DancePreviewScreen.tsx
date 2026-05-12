import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../../store/gameStore'
import { MiniBoard } from '../Board/MiniBoard'

// ─── Gesture GIF mapping ──────────────────────────────────────────────────────
// One file per piece type. Place files in public/gestures/.
// Currently using .svg placeholders — replace with your recorded .gif files
// and update the paths below (e.g. '/gestures/pawn.gif').
const GESTURE_GIF: Record<string, string> = {
  p: '/gestures/pawn.svg',
  n: '/gestures/knight.svg',
  b: '/gestures/bishop.svg',
  r: '/gestures/rook.svg',
  q: '/gestures/queen.svg',
  k: '/gestures/king.svg',
}

const PIECE_LABEL: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MoveFrame {
  fen: string           // position AFTER this move
  moveLabel: string     // e.g. "e4", "Nf3"
  piece: string         // piece symbol: p/n/b/r/q/k
  moveIndex: number     // 1-based ply number
  total: number
}

// ─── Build frames from puzzle ─────────────────────────────────────────────────
function buildFrames(startFen: string, uciMoves: string[]): MoveFrame[] {
  const chess = new Chess(startFen)
  const frames: MoveFrame[] = []
  for (let i = 0; i < uciMoves.length; i++) {
    const uci = uciMoves[i]
    const from = uci.slice(0, 2) as import('chess.js').Square
    const to   = uci.slice(2, 4) as import('chess.js').Square
    const promo = uci[4] as import('chess.js').PieceSymbol | undefined
    const piece = chess.get(from)
    const result = chess.move({ from, to, promotion: promo ?? 'q' })
    if (!result) break
    frames.push({
      fen: chess.fen(),
      moveLabel: result.san,
      piece: piece?.type ?? 'p',
      moveIndex: i + 1,
      total: uciMoves.length,
    })
  }
  return frames
}

// Auto-advance interval (ms) — time each move frame is shown
const FRAME_MS = 1800

// ─── Component ────────────────────────────────────────────────────────────────
export const DancePreviewScreen: React.FC = () => {
  const { pendingPuzzle, isCalibrated, setAppScreen } = useGameStore()

  const frames: MoveFrame[] = React.useMemo(() => {
    if (!pendingPuzzle) return []
    return buildFrames(pendingPuzzle.fen, pendingPuzzle.solution)
  }, [pendingPuzzle])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentFrame = frames[currentIndex] ?? null
  const startFen = pendingPuzzle?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const advanceTo = useCallback((index: number) => {
    if (index >= frames.length) {
      setFinished(true)
      setPlaying(false)
    } else {
      setCurrentIndex(index)
    }
  }, [frames.length])

  // Auto-advance when playing
  useEffect(() => {
    if (!playing) return
    stopTimer()
    timerRef.current = setTimeout(() => {
      advanceTo(currentIndex + 1)
    }, FRAME_MS)
    return stopTimer
  }, [playing, currentIndex, advanceTo, stopTimer])

  const handlePlay = () => {
    setCurrentIndex(0)
    setFinished(false)
    setPlaying(true)
  }

  const handlePrev = () => { setPlaying(false); stopTimer(); advanceTo(Math.max(0, currentIndex - 1)) }
  const handleNext = () => { setPlaying(false); stopTimer(); advanceTo(currentIndex + 1) }

  const handleReady = () => {
    setAppScreen(isCalibrated ? 'side-select' : 'side-select')
  }

  if (!pendingPuzzle) {
    // Shouldn't happen, but bail gracefully
    return null
  }

  const boardFen = finished ? (frames[frames.length - 1]?.fen ?? startFen)
    : (currentIndex === 0 && !playing ? startFen : (currentFrame?.fen ?? startFen))

  return (
    <div className="dance-preview-page">
      {/* Header */}
      <div className="dp-header">
        <button className="btn btn-ghost dp-back" onClick={() => setAppScreen('sequences')}>← Back</button>
        <h2 className="dp-title">{pendingPuzzle.title}</h2>
        <span />
      </div>

      {/* Main content */}
      <div className="dp-body">
        {/* Left — mini board */}
        <div className="dp-board-wrap">
          <MiniBoard fen={boardFen} />
          {/* Move progress dots */}
          <div className="dp-dots">
            {frames.map((_, i) => (
              <span
                key={i}
                className={`dp-dot${i < currentIndex || finished ? ' done' : ''}${i === currentIndex && !finished ? ' active' : ''}`}
                onClick={() => { setPlaying(false); stopTimer(); setCurrentIndex(i); setFinished(false) }}
              />
            ))}
          </div>
        </div>

        {/* Right — gesture GIF + controls */}
        <div className="dp-gesture-wrap">
          {finished ? (
            <div className="dp-finished">
              <span className="dp-finished-icon">✓</span>
              <p>Full sequence previewed!</p>
            </div>
          ) : currentFrame ? (
            <>
              <div className="dp-ply-badge">
                Move {currentFrame.moveIndex} / {currentFrame.total}
                &nbsp;—&nbsp;
                <strong>{currentFrame.moveLabel}</strong>
              </div>
              <img
                key={currentFrame.piece}
                className="dp-gif"
                src={GESTURE_GIF[currentFrame.piece]}
                alt={`${PIECE_LABEL[currentFrame.piece]} gesture`}
              />
              <div className="dp-gesture-label">
                {PIECE_LABEL[currentFrame.piece]} gesture
              </div>
            </>
          ) : (
            <div className="dp-waiting">
              <p>Press <strong>Play</strong> to watch the dance</p>
            </div>
          )}

          {/* Controls */}
          <div className="dp-controls">
            <button className="btn btn-ghost dp-step" onClick={handlePrev} disabled={currentIndex === 0 && !playing}>‹ Prev</button>
            {playing ? (
              <button className="btn btn-secondary dp-play" onClick={() => { setPlaying(false); stopTimer() }}>⏸ Pause</button>
            ) : (
              <button className="btn btn-primary dp-play" onClick={handlePlay}>▶ Play</button>
            )}
            <button className="btn btn-ghost dp-step" onClick={handleNext} disabled={finished}>Next ›</button>
          </div>

          {/* Ready CTA */}
          <button className="btn btn-primary dp-ready" onClick={handleReady}>
            I'm Ready — Let's Dance!
          </button>
        </div>
      </div>
    </div>
  )
}
