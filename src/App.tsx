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
import { MoveHistory } from './components/HUD/MoveHistory'
import { StatusOverlay } from './components/HUD/StatusOverlay'
import { ArmModePanel } from './components/HUD/ArmModePanel'
import { CalibrationWizard } from './components/Calibration/CalibrationWizard'
import { getNextPuzzle, getPuzzlesBySide, getRandomPuzzle, DIFFICULTY_COLOR } from './lib/puzzles'
import type { Puzzle } from './lib/puzzles'

// ─── Mode Select Screen ───────────────────────────────────────────────────────
const ModeSelectScreen: React.FC = () => {
  const { setGameMode, setAppScreen } = useGameStore()
  return (
    <div className="fullscreen-screen">
      <div className="screen-content animate-slide-up">
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>♟️</div>
        <h1 className="screen-title">ChessMove</h1>
        <p className="screen-sub">Embodied chess training — play with your hands</p>
        <div className="option-grid">
          <div className="option-card" onClick={() => { setGameMode('freegame'); setAppScreen('side-select') }}>
            <span className="option-icon">⚔️</span>
            <span className="option-label">Free Game</span>
            <span className="option-desc">Play against Stockfish</span>
          </div>
          <div className="option-card" onClick={() => { setGameMode('puzzle'); setAppScreen('side-select') }}>
            <span className="option-icon">🧩</span>
            <span className="option-label">Puzzle Mode</span>
            <span className="option-desc">Solve tactical positions</span>
          </div>
        </div>
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
        <button className="btn btn-ghost" onClick={() => setAppScreen('mode-select')}>← Back</button>
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
  const poseLandmarksRef = useRef<ArmLandmarks | null>(null)
  const handlePoseLandmarks = useCallback((arms: ArmLandmarks | null) => {
    poseLandmarksRef.current = arms
  }, [])
  const prevBestMoveRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const puzzleSide = playerSide === 'white' ? 'w' : 'b'
  const sidePuzzles = getPuzzlesBySide(puzzleSide)

  // ── Puzzle state ──
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(() => getRandomPuzzle(undefined, puzzleSide))
  const [puzzleSolvedCount, setPuzzleSolvedCount] = useState(0)
  const [puzzleSolved, setPuzzleSolved] = useState(false)
  const [puzzleFailed, setPuzzleFailed] = useState(false)
  const [puzzleHint, setPuzzleHint] = useState<string | null>(null)
  const puzzleMoveIndexRef = useRef(0)

  const loadPuzzle = useCallback((puzzle: Puzzle) => {
    setPuzzleSolved(false)
    setPuzzleFailed(false)
    setPuzzleHint(null)
    puzzleMoveIndexRef.current = 0
    loadFen(puzzle.fen)
    setCurrentPuzzle(puzzle)
  }, [loadFen])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (gameMode === 'freegame') {
      resetChess()
    } else {
      loadFen(currentPuzzle.fen)
    }
  }, [gameMode, resetChess, loadFen, currentPuzzle.fen])

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
    const next = getNextPuzzle(currentPuzzle.id, puzzleSide)
    setPuzzleSolvedCount(c => c + 1)
    loadPuzzle(next)
  }, [currentPuzzle, loadPuzzle, puzzleSide])

  const handleSkipPuzzle = useCallback(() => {
    const next = getNextPuzzle(currentPuzzle.id, puzzleSide)
    loadPuzzle(next)
  }, [currentPuzzle, loadPuzzle, puzzleSide])

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
  const { registerHandlers } = useGesture(landmarks, poseLandmarksRef, boardRef as React.RefObject<HTMLElement>)

  const handleSelect = useCallback((sq: string): boolean => {
    return selectSquare(sq, gameMode === 'puzzle')
  }, [selectSquare, gameMode])

  const handleDrop = useCallback((from: string, to: string) => {
    if (gameMode === 'puzzle') {
      // --- Puzzle move validation ---
      const expectedUci = currentPuzzle.solution[puzzleMoveIndexRef.current]
      const expectedFrom = expectedUci?.slice(0, 2)
      const expectedTo = expectedUci?.slice(2, 4)
      const isCorrect = from === expectedFrom && to === expectedTo

      if (isCorrect) {
        const result = makeMove(from, to)
        if (result.success) {
          puzzleMoveIndexRef.current += 1
          setPuzzleFailed(false)
          setPuzzleHint(null)
          if (puzzleMoveIndexRef.current >= currentPuzzle.solution.length) {
            setPuzzleSolved(true)
          }
        }
      } else {
        // Wrong move — flash and reject
        triggerFlash(to, 'illegal')
        setPuzzleFailed(true)
        setPuzzleHint(null)
      }
    } else {
      // --- Free game ---
      const result = makeMove(from, to)
      if (result.success) {
        setStockfish({ bestMove: null })
      } else {
        triggerFlash(to, 'illegal')
      }
    }
  }, [gameMode, currentPuzzle, makeMove, triggerFlash, setStockfish])

  useEffect(() => {
    registerHandlers(handleSelect, handleDrop)
  }, [registerHandlers, handleSelect, handleDrop])

  const handleReset = useCallback(() => {
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
            onClick={() => setAppScreen('mode-select')}>
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
              onLandmarks={setLandmarks}
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
                🤙 <strong>Hold L</strong> to highlight knights<br />
                👉 <strong>Flick</strong> toward one to select it<br />
                ↩️ <strong>Pinch cursor disabled</strong> in this mode<br />
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

  if (appScreen === 'mode-select') return <ModeSelectScreen />
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
