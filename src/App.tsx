import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { ArmLandmarks } from './hooks/useMediaPipePose'
import { useGameStore } from './store/gameStore'
import { useChessEngine } from './hooks/useChessEngine'
import { useStockfish } from './hooks/useStockfish'
import { useGesture } from './hooks/useGesture'
import { ChessBoard } from './components/Board/ChessBoard'
import { CameraFeed } from './components/Vision/CameraFeed'
import { HandCursor } from './components/Cursor/HandCursor'
import { GestureLog } from './components/HUD/GestureLog'
import { KnightDebugHud } from './components/HUD/KnightDebugHud'
import { MoveHistory } from './components/HUD/MoveHistory'
import { StatusOverlay } from './components/HUD/StatusOverlay'
import { ArmModePanel } from './components/HUD/ArmModePanel'
import { CalibrationWizard } from './components/Calibration/CalibrationWizard'
import { getPuzzlesBySide, DIFFICULTY_COLOR, KNIGHT_BISHOP_TEST_PUZZLE } from './lib/puzzles'
import { SEQUENCES, DIFFICULTY_LABEL, DIFFICULTY_COLOR as SEQ_DIFF_COLOR, seqDuration } from './lib/sequences'
import type { Sequence } from './lib/sequences'
import { MiniBoard } from './components/Board/MiniBoard'
import { DancePreviewScreen } from './components/DancePreview/DancePreviewScreen'
import { LandmarkStudioScreen } from './components/LandmarkStudio/LandmarkStudioScreen'
import type { Puzzle } from './lib/puzzles'

// ─── Sequences Screen ────────────────────────────────────────────────────────
const SequencesScreen: React.FC = () => {
  const { setGameMode, setAppScreen, setPendingPuzzle, setPlayerSide } = useGameStore()
  const [filter, setFilter] = React.useState<'all' | Sequence['difficulty']>('all')
  const [favorites, setFavorites] = React.useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('chessmove_favorites')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  const filtered = filter === 'all'
    ? SEQUENCES
    : SEQUENCES.filter(s => s.difficulty === filter)

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('chessmove_favorites', JSON.stringify([...next]))
      return next
    })
  }

  const handleSelect = (seq: Sequence) => {
    const isBlack = seq.title.toLowerCase().includes('defense')
    const side = isBlack ? 'b' : 'w'
    const puzzle: import('./lib/puzzles').Puzzle = {
      id: seq.id,
      title: seq.title,
      description: `Practice the ${seq.title} opening — play all ${seq.moves.length} moves in order.`,
      fen: seq.startFen,
      solution: seq.moves,
      theme: 'Opening',
      difficulty: seq.difficulty === 'beginner' ? 'easy' : seq.difficulty === 'intermediate' ? 'medium' : 'hard',
      sideToMove: side,
    }
    
    setPlayerSide(isBlack ? 'black' : 'white')
    setPendingPuzzle(puzzle)
    setGameMode('puzzle')
    setAppScreen('dance-preview')
  }

  const FILTERS: Array<{ key: 'all' | Sequence['difficulty']; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'beginner', label: 'Beginner' },
    { key: 'intermediate', label: 'Intermediate' },
    { key: 'advanced', label: 'Advanced' },
  ]

  return (
    <div className="seq-page">
      {/* Header */}
      <div className="seq-topbar">
        <div className="seq-pawn">♟</div>
      </div>

      {/* Hero */}
      <div className="seq-hero">
        <h1 className="seq-title">
          Choose Your <span className="seq-title-accent">Sequence</span>
        </h1>
        <p className="seq-subtitle">Learn openings through movement. Memorize. Move. Master.</p>
      </div>

      {/* Filters */}
      <div className="seq-filter-row">
        <div className="seq-tabs">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`seq-tab${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="seq-grid-wrap">
        <div className="seq-grid">
          {filtered.map(seq => (
            <div key={seq.id} className="seq-card" onClick={() => handleSelect(seq)}>
              {/* Thumbnail */}
              <div className="seq-card-thumb">
                <MiniBoard fen={seq.fen} />
                <button
                  className="seq-star"
                  onClick={e => { e.stopPropagation(); toggleFavorite(seq.id) }}
                  aria-label="Favourite"
                >
                  {favorites.has(seq.id) ? '★' : '☆'}
                </button>
              </div>
              {/* Info */}
              <div className="seq-card-body">
                <div className="seq-card-title">{seq.title}</div>
                <div className="seq-card-meta">
                  <span>{seq.moves.length} moves</span>
                  <span className="seq-dot">•</span>
                  <span style={{ color: SEQ_DIFF_COLOR[seq.difficulty] }}>
                    {DIFFICULTY_LABEL[seq.difficulty]}
                  </span>
                </div>
                <div className="seq-card-dance">
                  <span className="seq-dance-icon">🕺</span>
                  Dance: {seqDuration(seq.moves)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="seq-bottom-bar">
        <span>★ Favorite sequences to track your progress</span>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.75rem', padding: '4px 12px', marginLeft: 'auto', opacity: 0.6 }}
          onClick={() => setAppScreen('landmark-studio')}
        >
          📷 Landmark Studio
        </button>
      </div>
    </div>
  )
}

// ─── Side Select Screen ───────────────────────────────────────────────────────
const SideSelectScreen: React.FC = () => {
  const { setPlayerSide, setAppScreen, isCalibrated, gameMode } = useGameStore()
  const proceed = (side: 'white' | 'black') => {
    setPlayerSide(side)
    setAppScreen(isCalibrated ? 'game' : 'calibration')
  }
  return (
    <div className="fullscreen-screen">
      <div className="screen-content animate-slide-up">
        <h1 className="screen-title" style={{ fontSize: '1.8rem' }}>Choose Your Side</h1>
        <p className="screen-sub">
          {gameMode === 'puzzle' ? 'Train from your chosen side perspective' : 'Which color do you want to play?'}
        </p>
        <div className="option-grid">
          <div className="option-card" onClick={() => proceed('white')}>
            <span className="option-icon" style={{ fontSize: '3rem' }}>♔</span>
            <span className="option-label">White</span>
            <span className="option-desc">Move first</span>
          </div>
          <div className="option-card" onClick={() => proceed('black')}>
            <span className="option-icon" style={{ fontSize: '3rem' }}>♚</span>
            <span className="option-label">Black</span>
            <span className="option-desc">Respond to opponent</span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => setAppScreen('sequences')}>← Back</button>
      </div>
    </div>
  )
}

// ─── Puzzle Panel ─────────────────────────────────────────────────────────────
interface PuzzlePanelProps {
  puzzle: Puzzle
  solvedCount: number
  isSolved: boolean
  isFailed: boolean
  onNext: () => void
  onSkip: () => void
  onHint: () => void
  hint: string | null
}
const PuzzlePanel: React.FC<PuzzlePanelProps> = ({ puzzle, solvedCount, isSolved, isFailed, onNext, onSkip, onHint, hint }) => (
  <div className="card" style={{ flex: 1 }}>
    <div className="card-title">🧩 Puzzle {solvedCount + 1}</div>
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
        {puzzle.title}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
        {puzzle.description}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12,
          background: 'rgba(139,92,246,0.15)', color: 'var(--accent-violet)', border: '1px solid rgba(139,92,246,0.3)' }}>
          {puzzle.theme}
        </span>
        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12,
          background: `${DIFFICULTY_COLOR[puzzle.difficulty]}22`,
          color: DIFFICULTY_COLOR[puzzle.difficulty],
          border: `1px solid ${DIFFICULTY_COLOR[puzzle.difficulty]}44` }}>
          {puzzle.difficulty}
        </span>
        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12,
          background: 'rgba(14,165,233,0.15)', color: 'var(--accent-sapphire)', border: '1px solid rgba(14,165,233,0.3)' }}>
          {puzzle.sideToMove === 'w' ? 'White to move' : 'Black to move'}
        </span>
      </div>
    </div>

    {isSolved && (
      <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.1)',
        border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, marginBottom: 6 }}>✅ Correct!</div>
        <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.82rem' }} onClick={onNext}>
          Next Puzzle →
        </button>
      </div>
    )}
    {isFailed && (
      <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ color: 'var(--accent-ruby)', fontWeight: 700, marginBottom: 4 }}>❌ Wrong move</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Try again!</div>
      </div>
    )}
    {hint && (
      <div style={{ padding: '8px 10px', background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, marginBottom: 10,
        fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
        💡 {hint}
      </div>
    )}
    {!isSolved && (
      <div style={{ display: 'grid', gap: 6 }}>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.78rem' }} onClick={onHint}>
          💡 Hint
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', fontSize: '0.78rem' }} onClick={onSkip}>
          ⏭ Skip Puzzle
        </button>
      </div>
    )}
  </div>
)

// ─── Main Game Screen ─────────────────────────────────────────────────────────
const GameScreen: React.FC = () => {
  const {
    game,
    gestureState,
    gameMode,
    playerSide,
    setAppScreen,
    stockfish,
    triggerFlash,
    setStockfish,
    armModeEnabled,
  } = useGameStore()
  const { selectSquare, makeMove, makeMoveFromUci, resetGame: resetChess, loadFen } = useChessEngine()
  const { getBestMove, newGame } = useStockfish()
  const boardRef = useRef<HTMLDivElement>(null)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const userLeftHandRef  = useRef<NormalizedLandmark[] | null>(null)  // user's physical left  hand
  const userRightHandRef = useRef<NormalizedLandmark[] | null>(null)  // user's physical right hand
  const handleLandmarks = useCallback((
    lm: NormalizedLandmark[] | null,
    userLeft: NormalizedLandmark[] | null,
    userRight: NormalizedLandmark[] | null
  ) => {
    setLandmarks(lm)
    userLeftHandRef.current  = userLeft
    userRightHandRef.current = userRight
  }, [])
  const poseLandmarksRef = useRef<ArmLandmarks | null>(null)
  const handlePoseLandmarks = useCallback((arms: ArmLandmarks | null) => {
    poseLandmarksRef.current = arms
  }, [])
  const prevBestMoveRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const puzzleSide = playerSide === 'white' ? 'w' : 'b'
  const sidePuzzles = getPuzzlesBySide(puzzleSide)

  // ── Puzzle state ──
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(() => {
    const { pendingPuzzle, setPendingPuzzle } = useGameStore.getState()
    if (pendingPuzzle) {
      setPendingPuzzle(null)
      return pendingPuzzle
    }
    return KNIGHT_BISHOP_TEST_PUZZLE
  })
  const [puzzleSolvedCount, setPuzzleSolvedCount] = useState(0)
  const [puzzleSolved, setPuzzleSolved] = useState(false)
  const [puzzleFailed, setPuzzleFailed] = useState(false)
  const [puzzleHint, setPuzzleHint] = useState<string | null>(null)
  const puzzleMoveIndexRef = useRef(0)
  const opponentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadPuzzle = useCallback((puzzle: Puzzle) => {
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)
    setPuzzleSolved(false)
    setPuzzleFailed(false)
    setPuzzleHint(null)
    puzzleMoveIndexRef.current = 0
    loadFen(puzzle.fen)
    setCurrentPuzzle(puzzle)
    // If player is Black, auto-play White's first move after a delay
    if (playerSide === 'black') {
      setTimeout(() => autoPlayOpponentRef.current(0), 1000)
    }
  }, [loadFen, playerSide])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (gameMode === 'freegame') {
      resetChess()
    } else {
      loadFen(currentPuzzle.fen)
      // If player is Black, White must play first — schedule it after a short delay
      if (playerSide === 'black') {
        setTimeout(() => autoPlayOpponentRef.current(0), 1000)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePuzzleHint = useCallback(() => {
    const nextMove = currentPuzzle.solution[puzzleMoveIndexRef.current]
    if (!nextMove) return
    const from = nextMove.slice(0, 2)
    const to = nextMove.slice(2, 4)
    const files = 'abcdefgh'
    const fromFile = files.indexOf(from[0]) + 1
    const toFile = files.indexOf(to[0]) + 1
    setPuzzleHint(`Move from ${from.toUpperCase()} to ${to.toUpperCase()} (col ${fromFile}→${toFile})`)
  }, [currentPuzzle])

  const handleNextPuzzle = useCallback(() => {
    // TODO: restore normal puzzle progression; hardcoded to test position for now
    setPuzzleSolvedCount(c => c + 1)
    loadPuzzle(KNIGHT_BISHOP_TEST_PUZZLE)
  }, [loadPuzzle])

  const handleSkipPuzzle = useCallback(() => {
    // TODO: restore normal puzzle progression; hardcoded to test position for now
    loadPuzzle(KNIGHT_BISHOP_TEST_PUZZLE)
  }, [loadPuzzle])

  // ── Stockfish auto-reply ──
  useEffect(() => {
    if (gameMode !== 'freegame' || !stockfish.isReady || stockfish.isThinking) return
    if (game.isCheckmate || game.isStalemate || game.isDraw) return
    if (stockfish.bestMove) return
    const isStockfishTurn =
      (playerSide === 'white' && game.turn === 'b') ||
      (playerSide === 'black' && game.turn === 'w')
    if (!isStockfishTurn) return

    prevBestMoveRef.current = null
    getBestMove(game.fen, 1200)
  }, [
    gameMode,
    stockfish.isReady,
    stockfish.isThinking,
    stockfish.bestMove,
    game.isCheckmate,
    game.isStalemate,
    game.isDraw,
    playerSide,
    game.turn,
    game.fen,
    getBestMove,
  ])

  useEffect(() => {
    const bm = stockfish.bestMove
    if (!bm || bm === prevBestMoveRef.current || gameMode !== 'freegame') return
    const isStockfishTurn =
      (playerSide === 'white' && game.turn === 'b') ||
      (playerSide === 'black' && game.turn === 'w')
    if (!isStockfishTurn) return

    prevBestMoveRef.current = bm
    setTimeout(() => {
      const result = makeMoveFromUci(bm)
      if (!result.success) {
        prevBestMoveRef.current = null
      }
      setStockfish({ bestMove: null })
    }, 250)
  }, [stockfish.bestMove, gameMode, playerSide, game.turn, makeMoveFromUci, setStockfish])

  // ── Gesture handlers ──
  const { registerHandlers } = useGesture(landmarks, poseLandmarksRef, boardRef as React.RefObject<HTMLElement>, userLeftHandRef, userRightHandRef)

  const handleSelect = useCallback((sq: string): boolean => {
    if (gameMode === 'puzzle') {
      const expectedUci = currentPuzzle.solution[puzzleMoveIndexRef.current]
      const expectedFrom = expectedUci?.slice(0, 2)
      if (sq !== expectedFrom) {
        setPuzzleHint(`Wrong piece! ❌`)
        triggerFlash(sq, 'illegal')
        return false // blocks selection
      }
    }
    return selectSquare(sq)
  }, [selectSquare, gameMode, currentPuzzle, triggerFlash])

  const handleDrop = useCallback((from: string, to: string): boolean => {
    if (gameMode === 'puzzle') {
      // --- Puzzle move validation ---
      const expectedUci = currentPuzzle.solution[puzzleMoveIndexRef.current]
      const expectedFrom = expectedUci?.slice(0, 2)
      const expectedTo = expectedUci?.slice(2, 4)
      const isCorrect = from === expectedFrom && to === expectedTo

      if (!isCorrect) {
        // Silently reject the move to allow the user to continue sweeping
        // and find the right square without being spammed by "Wrong move" errors,
        // since the sweep auto-drop triggers continuously to probe the target.
        return false // blocks move
      }

      const result = makeMove(from, to)
      if (result.success) {
        puzzleMoveIndexRef.current += 1
        setPuzzleFailed(false)
        setPuzzleHint(null)
        if (puzzleMoveIndexRef.current >= currentPuzzle.solution.length) {
          setPuzzleSolved(true)
        } else {
          autoPlayOpponentRef.current(puzzleMoveIndexRef.current)
        }
        return true
      }
      return false
    } else {
      // --- Free game ---
      const result = makeMove(from, to)
      if (result.success) {
        setStockfish({ bestMove: null })
        return true
      } else {
        triggerFlash(to, 'illegal')
        return false
      }
    }
  }, [gameMode, currentPuzzle, makeMove, triggerFlash, setStockfish])

  // ── Opponent auto-play for sequence training ──────────────────────────────
  // Uses a ref so the recursive setTimeout captures the latest closure values
  // without needing to be listed as a useCallback dependency.
  const autoPlayOpponentRef = useRef<(idx: number) => void>(() => {})
  autoPlayOpponentRef.current = (idx: number) => {
    if (gameMode !== 'puzzle') return
    const solution = currentPuzzle.solution
    if (idx >= solution.length) return
    // Opponent's indices: if player is White → odd indices; if Black → even indices
    const isOppMove = playerSide === 'white' ? idx % 2 === 1 : idx % 2 === 0
    if (!isOppMove) return
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)
    opponentTimerRef.current = setTimeout(() => {
      const uci = solution[idx]
      const result = makeMoveFromUci(uci)
      if (result.success) {
        const nextIdx = idx + 1
        puzzleMoveIndexRef.current = nextIdx
        if (nextIdx >= solution.length) {
          setPuzzleSolved(true)
        } else {
          autoPlayOpponentRef.current(nextIdx)  // chain consecutive opponent moves
        }
      }
    }, 700)
  }

  useEffect(() => {
    registerHandlers(handleSelect, handleDrop)
  }, [registerHandlers, handleSelect, handleDrop])

  const handleReset = useCallback(() => {
    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)
    resetChess()
    newGame()
    prevBestMoveRef.current = null
    if (gameMode === 'puzzle') {
      loadPuzzle(currentPuzzle)
    }
  }, [resetChess, newGame, gameMode, currentPuzzle, loadPuzzle])

  return (
    <div className="app-layout" ref={boardRef}>
      {/* Header */}
      <header className="app-header">
        <span className="app-logo">♟ ChessMove</span>
        <span className={`mode-badge ${gameMode}`}>
          {gameMode === 'puzzle' ? '🧩 Puzzle' : '⚔️ Free Game'}
        </span>
        <span className="text-muted text-sm" style={{ marginLeft: 8 }}>
          Playing as {playerSide === 'white' ? '⬜ White' : '⬛ Black'}
        </span>
        {/* Arm mode mismatch warning in header */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            onClick={() => setAppScreen('calibration')}>
            🎯 Recalibrate
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            onClick={handleReset}>
            ↺ {gameMode === 'puzzle' ? 'Retry' : 'New Game'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            onClick={() => setAppScreen('sequences')}>
            ← Menu
          </button>
        </div>
      </header>

      {/* Left sidebar */}
      <aside className="app-sidebar">
        <div className="card">
          <div className="card-title">Camera</div>
          {/* Camera with arm tracking classifer overlay */}
          <div style={{ position: 'relative' }}>
            <CameraFeed
              onLandmarks={handleLandmarks}
              onPoseLandmarks={handlePoseLandmarks}
              enabled
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 8, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <div className={`state-dot ${gestureState}`}
              style={{ width: 8, height: 8, borderRadius: '50%',
                background: gestureState === 'grabbing' ? 'var(--accent-gold)'
                  : gestureState === 'hovering' ? 'var(--accent-sapphire)'
                  : 'var(--text-muted)' }} />
            {gestureState.charAt(0).toUpperCase() + gestureState.slice(1)}
          </div>
        </div>
        <KnightDebugHud />
        <GestureLog />
      </aside>

        {/* Center — board */}
        <main className="app-center">
          <div style={{ position: 'relative' }}>
            <ChessBoard />
            <StatusOverlay onReset={handleReset} />
          </div>
        </main>

      {/* Right sidebar */}
      <aside className="app-sidebar right">
        {gameMode === 'puzzle' ? (
          <PuzzlePanel
            puzzle={currentPuzzle}
            solvedCount={puzzleSolvedCount}
            isSolved={puzzleSolved}
            isFailed={puzzleFailed}
            onNext={handleNextPuzzle}
            onSkip={handleSkipPuzzle}
            onHint={handlePuzzleHint}
            hint={puzzleHint}
          />
        ) : (
          <MoveHistory />
        )}
        {/* Phase 1.5 arm mode panel */}
        <ArmModePanel />
          <div className="card">
          <div className="card-title">Controls</div>
          <div className="text-sm text-muted" style={{ lineHeight: 2 }}>
            {armModeEnabled ? (
              <>
                🤌 <strong>Show piece gesture</strong> (L=♞, V=♝, ✊=♜, 4=♚, 🖐=♛, ☝=♟)<br />
                👉 <strong>Point right hand</strong> to pick the exact piece (fist only for non-pawns)<br />
                🎯 <strong>Sweep arm over target square</strong> to move automatically<br />
                ♟️ <strong>Pawn</strong>: step forward to advance; diagonal captures via sweep (auto)<br />
                🐴 <strong>Knight</strong>: jump front/back + turn shoulders left/right (auto)<br />
                ✖️ <strong>Arms X while king grabbed</strong> to castle (when legal)<br />
              </>
            ) : (
              <>
                👆 <strong>Point</strong> to navigate<br />
                ✊ <strong>Pinch</strong> to grab a piece<br />
                ✋ <strong>Release</strong> to drop<br />
                ↩️ <strong>Release on origin</strong> to cancel selection<br />
              </>
            )}
          </div>
        </div>
        {gameMode === 'freegame' && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Puzzles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sidePuzzles.slice(0, 4).map(p => (
                <button key={p.id} className="btn btn-ghost"
                  style={{ fontSize: '0.72rem', padding: '4px 8px', textAlign: 'left', justifyContent: 'flex-start' }}
                  onClick={() => {
                    useGameStore.getState().setGameMode('puzzle')
                    setCurrentPuzzle(p)
                    loadPuzzle(p)
                  }}>
                  🧩 {p.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Gesture mode renderless hook results go through useGesture directly */}

      <HandCursor />
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const { appScreen, setAppScreen } = useGameStore()
  const [calLandmarks, setCalLandmarks] = useState<NormalizedLandmark[] | null>(null)

  if (appScreen === 'sequences') return <SequencesScreen />
  if (appScreen === 'dance-preview') return <DancePreviewScreen />
  if (appScreen === 'landmark-studio') return <LandmarkStudioScreen />
  if (appScreen === 'side-select') return <SideSelectScreen />
  if (appScreen === 'calibration') {
    return (
      <>
        <CameraFeed onLandmarks={setCalLandmarks} enabled showControls={false} />
        <CalibrationWizard
          landmarks={calLandmarks}
          onComplete={() => setAppScreen('game')}
          onSkip={() => setAppScreen('game')}
        />
      </>
    )
  }
  return <GameScreen />
}
