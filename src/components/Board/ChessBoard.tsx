import React, { useRef } from 'react'
import { Chess } from 'chess.js'
import { BoardSquare } from './BoardSquare'
import { useGameStore } from '../../store/gameStore'

export const ChessBoard: React.FC = () => {
  const { game, cursor, gestureState, playerSide, handGesturePieceType, sweepPreviewSquare } = useGameStore()
  const boardRef = useRef<HTMLDivElement>(null)

  const flipped = playerSide === 'black'

  // Parse the current FEN to get piece positions
  const chess = new Chess(game.fen)
  const board = chess.board() // 8x8 array [row][col], row 0 = rank 8

  // Highlight all current-player pieces of the gestured type
  const pieceHighlights = new Set<string>()
  if (handGesturePieceType) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c]
        if (p && p.type === handGesturePieceType && p.color === game.turn) {
          pieceHighlights.add(`${'abcdefgh'[c]}${8 - r}`)
        }
      }
    }
  }

  const squares: React.ReactNode[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const displayRow = flipped ? 7 - row : row
      const displayCol = flipped ? 7 - col : col

      const file = 'abcdefgh'[displayCol]
      const rank = 8 - displayRow
      const squareName = `${file}${rank}`

      const piece = board[displayRow][displayCol]
      const isLight = (row + col) % 2 === 0
      const isSelected = game.selectedSquare === squareName
      const isLegalTarget = game.legalTargets.includes(squareName)
      const isHovered = cursor.squareName === squareName
      const isDropTarget = gestureState === 'grabbing' && isHovered && !isSelected
      const isLastMove = !!(game.lastMove &&
        (game.lastMove.from === squareName || game.lastMove.to === squareName))
      const isCheck = game.isCheck && piece?.type === 'k' &&
        piece?.color === game.turn
      const isKnightHighlight = pieceHighlights.has(squareName)

      squares.push(
        <BoardSquare
          key={squareName}
          squareName={squareName}
          col={displayCol}
          row={displayRow}
          piece={piece ? { type: piece.type.toUpperCase(), color: piece.color } : null}
          isLight={isLight}
          isSelected={isSelected}
          isLegalTarget={isLegalTarget}
          isHovered={isHovered}
          isDropTarget={isDropTarget}
          isLastMove={isLastMove}
          isCheck={isCheck}
          showRankLabel={col === 0}
          showFileLabel={row === 7}
          isGrabbed={gestureState === 'grabbing'}
          isKnightHighlight={isKnightHighlight}
          isSweepPreview={sweepPreviewSquare === squareName}
        />
      )
    }
  }

  return (
    <div className="board-wrapper" ref={boardRef} data-board>
      <div className="board-grid">
        {squares}
      </div>
    </div>
  )
}
