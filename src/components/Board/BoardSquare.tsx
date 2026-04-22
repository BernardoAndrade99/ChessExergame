import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { PieceSprite } from './PieceSprite'

interface BoardSquareProps {
  squareName: string  // e.g. 'e4'
  col: number
  row: number
  piece: { type: string; color: 'w' | 'b' } | null
  isLight: boolean
  isSelected: boolean
  isLegalTarget: boolean
  isHovered: boolean
  isDropTarget: boolean
  isLastMove: boolean
  isCheck: boolean
  showRankLabel: boolean
  showFileLabel: boolean
  isGrabbed: boolean
}

export const BoardSquare: React.FC<BoardSquareProps> = ({
  squareName, piece, isLight, isSelected, isLegalTarget,
  isHovered, isDropTarget, isLastMove, isCheck, showRankLabel, showFileLabel, isGrabbed,
}) => {
  const { flashSquare, flashType } = useGameStore()
  const isFlashing = flashSquare === squareName
  const rank = squareName[1]
  const file = squareName[0]

  const classNames = [
    'board-square',
    isLight ? 'light' : 'dark',
    isSelected ? 'selected' : '',
    isDropTarget ? 'drop-target' : '',
    isHovered && !isSelected ? 'hovered' : '',
    isCheck ? 'in-check' : '',
    isLastMove && !isSelected ? 'last-move' : '',
    isFlashing && flashType === 'illegal' ? 'flash-red' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classNames}
      data-square={squareName}
      style={isLastMove && !isSelected && !isCheck && !isDropTarget ? { background: 'rgba(245,158,11,0.22)' } : undefined}
    >
      {showRankLabel && <span className="board-label rank">{rank}</span>}
      {showFileLabel && <span className="board-label file">{file}</span>}

      {piece && (
        <PieceSprite
          type={piece.type}
          color={piece.color}
          isGrabbed={isGrabbed && isSelected}
        />
      )}

      {isLegalTarget && (
        <div className={piece ? 'board-square legal-capture' : 'legal-dot'}
          style={!piece ? {
            position: 'absolute',
            width: '32%',
            height: '32%',
            borderRadius: '50%',
            background: 'rgba(16,185,129,0.5)',
            pointerEvents: 'none',
          } : {
            position: 'absolute',
            inset: 0,
            border: '3px solid rgba(16,185,129,0.6)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
