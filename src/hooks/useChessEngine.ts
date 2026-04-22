import { useRef, useCallback } from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { useGameStore } from '../store/gameStore'

type PromotionPiece = Exclude<PieceSymbol, 'k' | 'p'>

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value)

const isPromotionPiece = (value: string): value is PromotionPiece =>
  value === 'q' || value === 'r' || value === 'b' || value === 'n'

export function useChessEngine() {
  const chessRef = useRef(new Chess())
  const { setGame, playerSide } = useGameStore()

  const updateStoreFromChess = useCallback(() => {
    const chess = chessRef.current
    setGame({
      fen: chess.fen(),
      pgn: chess.pgn(),
      turn: chess.turn(),
      isCheck: chess.inCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      moves: chess.history({ verbose: true }).map((m, i) => ({
        san: m.san,
        fen: i < chess.history().length ? chess.fen() : chess.fen(), // simplified
      })),
    })
  }, [setGame])

  // Load a FEN position (for puzzle mode)
  const loadFen = useCallback((fen: string) => {
    const chess = chessRef.current
    chess.load(fen)
    setGame({ selectedSquare: null, legalTargets: [], lastMove: null })
    updateStoreFromChess()
  }, [updateStoreFromChess, setGame])

  // Get legal moves for a square
  const getLegalMoves = useCallback((square: string): string[] => {
    if (!isSquare(square)) return []
    const chess = chessRef.current
    const moves = chess.moves({ square, verbose: true })
    return moves.map(m => m.to)
  }, [])

  // Select a square — puzzleMode skips playerSide check so either color can be moved
  const selectSquare = useCallback((square: string, puzzleMode = false) => {
    if (!isSquare(square)) return false
    const chess = chessRef.current
    const piece = chess.get(square)

    // Must be a piece whose turn it is
    if (!piece) return false
    const isCurrentTurn = (piece.color === 'w' && chess.turn() === 'w') ||
                          (piece.color === 'b' && chess.turn() === 'b')
    if (!isCurrentTurn) return false

    // In free game, only allow selecting own side's pieces
    if (!puzzleMode) {
      const isPlayerPiece = (playerSide === 'white' && piece.color === 'w') ||
                            (playerSide === 'black' && piece.color === 'b')
      if (!isPlayerPiece) return false
    }

    const legalTargets = getLegalMoves(square)
    setGame({ selectedSquare: square, legalTargets })
    return true
  }, [getLegalMoves, setGame, playerSide])

  // Attempt to make a move — returns fresh { fen, turn } so callers never use stale state
  const makeMove = useCallback((from: string, to: string): { success: boolean; fen: string; turn: 'w' | 'b' } => {
    const chess = chessRef.current
    if (!isSquare(from) || !isSquare(to)) return { success: false, fen: chess.fen(), turn: chess.turn() }
    try {
      const result = chess.move({ from, to, promotion: 'q' })
      if (result) {
        setGame({ selectedSquare: null, legalTargets: [], lastMove: { from, to } })
        updateStoreFromChess()
        return { success: true, fen: chess.fen(), turn: chess.turn() }
      }
    } catch { /* illegal move */ }
    return { success: false, fen: chess.fen(), turn: chess.turn() }
  }, [setGame, updateStoreFromChess])

  // Reset game
  const resetGame = useCallback(() => {
    chessRef.current = new Chess()
    setGame({
      fen: chessRef.current.fen(),
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
    })
  }, [setGame])

  // Make a move from UCI notation (for Stockfish) — returns fresh { fen, turn }
  const makeMoveFromUci = useCallback((uciMove: string): { success: boolean; fen: string; turn: 'w' | 'b' } => {
    const chess = chessRef.current
    if (!uciMove || uciMove.length < 4) return { success: false, fen: chess.fen(), turn: chess.turn() }
    const from = uciMove.slice(0, 2)
    const to = uciMove.slice(2, 4)
    if (!isSquare(from) || !isSquare(to)) return { success: false, fen: chess.fen(), turn: chess.turn() }
    const promotionChar = uciMove.length === 5 ? uciMove[4].toLowerCase() : 'q'
    const promotion: PromotionPiece = isPromotionPiece(promotionChar) ? promotionChar : 'q'
    try {
      const result = chess.move({ from, to, promotion })
      if (result) {
        setGame({ selectedSquare: null, legalTargets: [], lastMove: { from, to } })
        updateStoreFromChess()
        return { success: true, fen: chess.fen(), turn: chess.turn() }
      }
    } catch { /* illegal */ }
    return { success: false, fen: chess.fen(), turn: chess.turn() }
  }, [setGame, updateStoreFromChess])

  return { loadFen, selectSquare, makeMove, makeMoveFromUci, resetGame, getLegalMoves }
}
