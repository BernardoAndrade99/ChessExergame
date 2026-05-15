import React, { useState } from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../../store/gameStore'
import { MiniBoard } from '../Board/MiniBoard'

// ─── Gesture GIF resolution ───────────────────────────────────────────────────
const PIECE_FALLBACK: Record<string, string> = {
  p: '/gestures/pawnGesture.gif',
  n: '/gestures/knightGesture.gif',
  b: '/gestures/bishopGesture.gif',
  r: '/gestures/rookGesture.gif',
  q: '/gestures/queenGesture.gif',
  k: '/gestures/kingGesture.gif',
}

const PIECE_LABEL: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

function fileIdx(sq: string) { return sq.charCodeAt(0) - 97 }   // 'a'=0 … 'h'=7
function rankIdx(sq: string) { return parseInt(sq[1]) - 1 }      // '1'=0 … '8'=7

/**
 * Returns an ordered array of /gestures/ paths for this move.
 * Knight → [gesture1, gesture2]  (two-step).
 * All others → single-element array.
 */
function resolveGestures(piece: string, from: string, to: string): string[] {
  const df = fileIdx(to) - fileIdx(from)
  const dr = rankIdx(to) - rankIdx(from)

  switch (piece) {
    case 'n': {
      const jump  = dr > 0 ? '/gestures/fwdJump.gif'   : '/gestures/bwdJump.gif'
      const turn  = df > 0 ? '/gestures/RightTurn.gif' : '/gestures/LeftTurn.gif'
      // Mostly forward/backward (|dr|=2): jump first, then turn
      // Mostly sideways        (|df|=2): turn first, then jump
      return Math.abs(dr) === 2 ? [jump, turn] : [turn, jump]
    }
    case 'p':
      return ['/gestures/stepForward.gif']
    case 'r': {
      if (dr === 0) return [df > 0 ? '/gestures/LRsweep.gif' : PIECE_FALLBACK.r]
      return [dr > 0 ? '/gestures/DUsweep.gif' : '/gestures/UDsweep.gif']
    }
    case 'b': {
      const isSlash = (df > 0 && dr > 0) || (df < 0 && dr < 0)
      return [isSlash ? '/gestures/LD-URsweep.gif' : '/gestures/RD-ULsweeo.gif']
    }
    default:
      return [PIECE_FALLBACK[piece] ?? PIECE_FALLBACK.p]
  }
}

/** Description of the hand shape needed to SELECT a piece. */
function selectionGestureText(piece: string, square: string): string {
  switch (piece) {
    case 'n': return `Make an "L" shape with your hand to select the Knight on ${square}`
    case 'b': return `Hold up a "V" with your fingers to select the Bishop on ${square}`
    case 'k': return `Make a clenched fist to select the King on ${square}`
    case 'q': return `Spread your hand wide open to select the Queen on ${square}`
    case 'p': return `Hold up one finger to select the Pawn on ${square}`
    case 'r': return `Point at the Rook on ${square} to select it`
    default:  return `Select the piece on ${square}`
  }
}

/** Human-readable label for the movement gesture. */
function gestureLabel(piece: string, from: string, to: string): string {
  const df = fileIdx(to) - fileIdx(from)
  const dr = rankIdx(to) - rankIdx(from)
  switch (piece) {
    case 'n': {
      const jumpName = dr > 0 ? 'Forward Jump' : 'Backward Jump'
      const turnName = df > 0 ? 'Right Turn'   : 'Left Turn'
      return Math.abs(dr) === 2 ? `${jumpName} + ${turnName}` : `${turnName} + ${jumpName}`
    }
    case 'r':
      if (dr === 0) return df > 0 ? 'Sweep Right' : 'Sweep Left'
      return dr > 0 ? 'Sweep Up' : 'Sweep Down'
    case 'b': {
      const isSlash = (df > 0 && dr > 0) || (df < 0 && dr < 0)
      return isSlash ? 'Diagonal Sweep ↗' : 'Diagonal Sweep ↖'
    }
    case 'p': {
      const steps = Math.abs(dr)
      return steps === 2 ? 'Step Forward twice' : 'Step Forward once'
    }
    default: return `${PIECE_LABEL[piece] ?? 'Piece'} Move`
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MovePhase = 'select' | 'move'

interface MoveFrame {
  preFen: string        // board BEFORE this move — shown during selection phase
  fen: string           // board AFTER this move  — shown during move phase
  moveLabel: string     // e.g. "e4", "Nf3"
  piece: string         // piece symbol: p/n/b/r/q/k
  from: string          // source square e.g. "e2"
  to: string            // destination square e.g. "e4"
  moveIndex: number     // 1-based ply (odd = white/user, even = black/opponent)
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
    const preFen = chess.fen()
    const result = chess.move({ from, to, promotion: promo ?? 'q' })
    if (!result) break
    frames.push({
      preFen,
      fen: chess.fen(),
      moveLabel: result.san,
      piece: piece?.type ?? 'p',
      from,
      to,
      moveIndex: i + 1,
      total: uciMoves.length,
    })
  }
  return frames
}

// ─── Component ────────────────────────────────────────────────────────────────
export const DancePreviewScreen: React.FC = () => {
  const { pendingPuzzle, isCalibrated, setAppScreen, setPlayerSide } = useGameStore()

  const frames: MoveFrame[] = React.useMemo(() => {
    if (!pendingPuzzle) return []
    return buildFrames(pendingPuzzle.fen, pendingPuzzle.solution)
  }, [pendingPuzzle])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<MovePhase>('select')
  const [finished, setFinished] = useState(false)
  const [engaged, setEngaged] = useState(false)  // true once user starts stepping

  const currentFrame = frames[currentIndex] ?? null
  const startFen = pendingPuzzle?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  const handleStart = () => {
    setCurrentIndex(0)
    setPhase('select')
    setFinished(false)
    setEngaged(true)
  }

  const handleNext = () => {
    if (finished) return
    setEngaged(true)
    const isOpp = currentFrame ? currentFrame.moveIndex % 2 === 0 : false
    if (!isOpp && phase === 'select') {
      // user move: show selection phase first, then movement phase
      setPhase('move')
    } else {
      // opponent move (skip to next directly) or user move phase 2 → advance
      const next = currentIndex + 1
      if (next >= frames.length) { setFinished(true) }
      else { setCurrentIndex(next); setPhase('select') }
    }
  }

  const handlePrev = () => {
    setEngaged(true); setFinished(false)
    if (phase === 'move') {
      // if this is a user move, step back to select phase; for opponent just go to prev move
      const isOpp = currentFrame ? currentFrame.moveIndex % 2 === 0 : false
      if (!isOpp) { setPhase('select'); return }
    }
    if (currentIndex > 0) {
      const prevFrame = frames[currentIndex - 1]
      const prevIsOpp = prevFrame ? prevFrame.moveIndex % 2 === 0 : false
      setCurrentIndex(currentIndex - 1)
      // opponent moves have no select phase, go straight to move
      setPhase(prevIsOpp ? 'move' : 'select')
    }
  }

  const handleReady = () => {
    if (pendingPuzzle) {
      setPlayerSide(pendingPuzzle.sideToMove === 'w' ? 'white' : 'black')
    }
    setAppScreen(isCalibrated ? 'game' : 'calibration')
  }

  if (!pendingPuzzle) return null

  // ── Board state ──
  const boardFen = finished
    ? (frames[frames.length - 1]?.fen ?? startFen)
    : phase === 'select'
      ? (currentFrame?.preFen ?? startFen)
      : (currentFrame?.fen ?? startFen)

  const highlightArr = (engaged && !finished && currentFrame)
    ? [phase === 'select' ? currentFrame.from : currentFrame.to]
    : []

  // ── Gesture panel content ──
  const isUserMove  = currentFrame ? currentFrame.moveIndex % 2 === 1 : true
  const gestureName = currentFrame ? gestureLabel(currentFrame.piece, currentFrame.from, currentFrame.to) : ''
  const gestureHeading = currentFrame
    ? isUserMove
      ? phase === 'select'
        ? `Select ${PIECE_LABEL[currentFrame.piece]}`
        : gestureName
      : `${currentFrame.from} → ${currentFrame.to}`
    : ''
  const gestureDetail = currentFrame
    ? isUserMove
      ? phase === 'select'
        ? selectionGestureText(currentFrame.piece, currentFrame.from)
        : `Move your ${PIECE_LABEL[currentFrame.piece]} from ${currentFrame.from} to ${currentFrame.to}`
      : `Opponent's ${PIECE_LABEL[currentFrame.piece]} moves ${currentFrame.from} → ${currentFrame.to}`
    : ''

  const gifs = currentFrame
    ? isUserMove
      ? phase === 'select'
        ? [PIECE_FALLBACK[currentFrame.piece] ?? PIECE_FALLBACK.p]
        : resolveGestures(currentFrame.piece, currentFrame.from, currentFrame.to)
      : ['/gestures/idle.gif']
    : []

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
          <MiniBoard fen={boardFen} highlightSquares={highlightArr} />
          {/* Move progress dots */}
          <div className="dp-dots">
            {frames.map((_, i) => (
              <span
                key={i}
                className={`dp-dot${i < currentIndex || finished ? ' done' : ''}${i === currentIndex && !finished ? ' active' : ''}`}
                onClick={() => {
                  stopTimer(); setPlaying(false)
                  setCurrentIndex(i); setPhase('select'); setFinished(false); setEngaged(true)
                }}
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
          ) : currentFrame && engaged ? (
            <>
              <div className="dp-ply-badge">
                Move {currentFrame.moveIndex} / {currentFrame.total}
                &nbsp;—&nbsp;
                <strong>{currentFrame.moveLabel}</strong>
                {isUserMove && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: '2px 7px',
                    borderRadius: 10,
                    background: phase === 'select' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                    color: phase === 'select' ? 'var(--accent-gold)' : 'var(--accent-emerald)',
                    border: `1px solid ${phase === 'select' ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.35)'}`,
                  }}>
                    {phase === 'select' ? 'SELECTION' : 'MOVE'}
                  </span>
                )}
              </div>
              {/* One GIF for most pieces, two side-by-side for knight */}
              {gifs.length === 2 ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <img key={`${currentIndex}-0`} className="dp-gif" style={{ width: 'min(13vh,120px)', height: 'min(13vh,120px)' }}
                    src={gifs[0]} alt="gesture step 1" />
                  <span style={{ color: 'var(--accent-gold)', fontSize: '1.4rem', flexShrink: 0 }}>→</span>
                  <img key={`${currentIndex}-1`} className="dp-gif" style={{ width: 'min(13vh,120px)', height: 'min(13vh,120px)' }}
                    src={gifs[1]} alt="gesture step 2" />
                </div>
              ) : (
                <img key={currentIndex} className="dp-gif" src={gifs[0]} alt={gestureName} />
              )}
              <div className="dp-gesture-label">{gestureHeading}</div>
              <div style={{
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                maxWidth: '90%',
                lineHeight: 1.45,
              }}>
                {gestureDetail}
              </div>
            </>
          ) : (
            <div className="dp-waiting">
              <p>Press <strong>Start</strong> to begin the preview</p>
            </div>
          )}

          {/* Controls */}
          <div className="dp-controls">
            <button
              className="btn btn-ghost dp-step"
              onClick={handlePrev}
              disabled={!engaged || (currentIndex === 0 && phase === 'select')}
            >‹ Prev</button>
            {!engaged ? (
              <button className="btn btn-primary dp-play" onClick={handleStart}>▶ Start</button>
            ) : (
              <button className="btn btn-primary dp-play" onClick={handleNext} disabled={finished}>Next ›</button>
            )}
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
