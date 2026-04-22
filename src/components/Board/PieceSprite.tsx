import React from 'react'

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

interface PieceSpriteProps {
  type: string  // e.g. 'K', 'Q', 'R', 'B', 'N', 'P'
  color: 'w' | 'b'
  isGrabbed?: boolean
}

export const PieceSprite: React.FC<PieceSpriteProps> = ({ type, color, isGrabbed }) => {
  const symbol = PIECE_UNICODE[`${color}${type.toUpperCase()}`] ?? ''
  return (
    <span
      className={`piece ${isGrabbed ? 'grabbed' : ''}`}
      style={{ color: color === 'w' ? '#ffffff' : '#1a1a2e',
               textShadow: color === 'w'
                 ? '0 1px 3px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.3)'
                 : '0 1px 2px rgba(255,255,255,0.2)' }}
    >
      {symbol}
    </span>
  )
}
