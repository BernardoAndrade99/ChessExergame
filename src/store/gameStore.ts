import { create } from 'zustand'
import type { GestureState } from '../lib/gestureClassifier'
import type { CalibrationBounds } from '../lib/coordinateMapper'
import { loadCalibration } from '../lib/coordinateMapper'
import type { ArmPieceType } from '../lib/trajectoryMatcher'

export type GameMode = 'puzzle' | 'freegame'
export type PlayerSide = 'white' | 'black'
export type AppScreen = 'mode-select' | 'side-select' | 'calibration' | 'game'

export interface CursorState {
  x: number        // screen pixel x
  y: number        // screen pixel y
  squareName: string | null  // e.g. "e4"
  visible: boolean
}

export interface GameState {
  fen: string
  pgn: string
  moves: Array<{ san: string; fen: string }>
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  turn: 'w' | 'b'
  selectedSquare: string | null
  legalTargets: string[]
  lastMove: { from: string; to: string } | null
}

export interface StockfishState {
  bestMove: string | null
  evaluation: number
  isThinking: boolean
  isReady: boolean
  depth: number
}

interface ChessMoveStore {
  // Navigation
  appScreen: AppScreen
  gameMode: GameMode
  playerSide: PlayerSide
  setAppScreen: (s: AppScreen) => void
  setGameMode: (m: GameMode) => void
  setPlayerSide: (s: PlayerSide) => void

  // Calibration
  calibration: CalibrationBounds
  isCalibrated: boolean
  setCalibration: (b: CalibrationBounds) => void

  // Cursor / Gesture
  cursor: CursorState
  gestureState: GestureState
  setCursor: (c: Partial<CursorState>) => void
  setGestureState: (s: GestureState) => void

  // Game
  game: GameState
  setGame: (g: Partial<GameState>) => void
  resetGame: () => void

  // Stockfish
  stockfish: StockfishState
  setStockfish: (s: Partial<StockfishState>) => void

  // Flash feedback
  flashSquare: string | null
  flashType: 'legal' | 'illegal' | null
  triggerFlash: (square: string, type: 'legal' | 'illegal') => void

  // Phase 1.5 — Arm tracking mode
  armModeEnabled: boolean
  setArmModeEnabled: (v: boolean) => void
  detectedPieceType: ArmPieceType | null   // null = Queen/King/Pawn (no arm pattern)
  armConfidence: number                    // 0–1
  setArmDetection: (pieceType: ArmPieceType | null, confidence: number) => void
  isRecordingTrajectory: boolean
  setRecordingTrajectory: (v: boolean) => void
  armMismatch: boolean                     // true when grabbed piece ≠ detected arm pattern
  setArmMismatch: (v: boolean) => void
  armDestinationSquare: string | null      // destination computed from left-wrist endpoint
  setArmDestinationSquare: (sq: string | null) => void

  // Phase 2 — Hand gesture piece-type selection
  handGesturePieceType: string | null      // 'n' when L-shape detected, null otherwise
  setHandGesturePieceType: (t: string | null) => void

  // Bishop arm sweep — preview destination while sweeping
  sweepPreviewSquare: string | null
  setSweepPreviewSquare: (sq: string | null) => void
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const initialGame: GameState = {
  fen: INITIAL_FEN,
  pgn: '',
  moves: [],
  isCheck: false,
  isCheckmate: false,
  isStalemate: false,
  isDraw: false,
  turn: 'w',
  selectedSquare: null,
  legalTargets: [],
  lastMove: null,
}

export const useGameStore = create<ChessMoveStore>((set) => ({
  // Navigation
  appScreen: 'mode-select',
  gameMode: 'freegame',
  playerSide: 'white',
  setAppScreen: (appScreen) => set({ appScreen }),
  setGameMode: (gameMode) => set({ gameMode }),
  setPlayerSide: (playerSide) => set({ playerSide }),

  // Calibration
  calibration: loadCalibration(),
  isCalibrated: !!localStorage.getItem('chessmove_calibration_v1'),
  setCalibration: (calibration) => set({ calibration, isCalibrated: true }),

  // Cursor
  cursor: { x: 0, y: 0, squareName: null, visible: false },
  gestureState: 'idle',
  setCursor: (c) => set((s) => ({ cursor: { ...s.cursor, ...c } })),
  setGestureState: (gestureState) => set({ gestureState }),

  // Game
  game: initialGame,
  setGame: (g) => set((s) => ({ game: { ...s.game, ...g } })),
  resetGame: () => set({ game: initialGame }),

  // Stockfish
  stockfish: { bestMove: null, evaluation: 0, isThinking: false, isReady: false, depth: 0 },
  setStockfish: (s) => set((prev) => ({ stockfish: { ...prev.stockfish, ...s } })),

  // Flash feedback
  flashSquare: null,
  flashType: null,
  triggerFlash: (square, type) => {
    set({ flashSquare: square, flashType: type })
    setTimeout(() => set({ flashSquare: null, flashType: null }), 500)
  },

  // Phase 1.5 — Arm tracking mode
  armModeEnabled: false,
  setArmModeEnabled: (armModeEnabled) => set({ armModeEnabled }),
  detectedPieceType: null,
  armConfidence: 0,
  setArmDetection: (detectedPieceType, armConfidence) => set({ detectedPieceType, armConfidence }),
  isRecordingTrajectory: false,
  setRecordingTrajectory: (isRecordingTrajectory) => set({ isRecordingTrajectory }),
  armMismatch: false,
  setArmMismatch: (armMismatch) => set({ armMismatch }),
  armDestinationSquare: null,
  setArmDestinationSquare: (armDestinationSquare) => set({ armDestinationSquare }),

  handGesturePieceType: null,
  setHandGesturePieceType: (handGesturePieceType) => set({ handGesturePieceType }),

  sweepPreviewSquare: null,
  setSweepPreviewSquare: (sweepPreviewSquare) => set({ sweepPreviewSquare }),
}))
