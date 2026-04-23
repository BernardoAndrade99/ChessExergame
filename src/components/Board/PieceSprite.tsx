import React from 'react'

interface PieceSpriteProps {
  type: string  // e.g. 'K', 'Q', 'R', 'B', 'N', 'P'
  color: 'w' | 'b'
  isGrabbed?: boolean
}

export const PieceSprite: React.FC<PieceSpriteProps> = ({ type, color, isGrabbed }) => {
  const pieceKey = `${color}${type.toUpperCase()}`
  const src = `/ChessPiecesSvg/${pieceKey}.svg`

  return (
    <img
      className={`piece ${isGrabbed ? 'grabbed' : ''}`}
      src={src}
      alt={pieceKey}
      draggable={false}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}
