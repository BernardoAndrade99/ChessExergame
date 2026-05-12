import React from 'react'
import { Chess } from 'chess.js'

const PIECE_GLYPH: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

interface MiniBoardProps {
  fen: string
  /** Pass a pixel size, or omit to fill 100% of the parent */
  size?: number
}

export const MiniBoard: React.FC<MiniBoardProps> = ({ fen, size }) => {
  let board: ReturnType<InstanceType<typeof Chess>['board']>
  try {
    board = new Chess(fen).board()
  } catch {
    board = new Chess().board()
  }

  const dim = size != null ? size : undefined
  const style: React.CSSProperties = dim
    ? { width: dim, height: dim }
    : { width: '100%', height: '100%' }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {board.map((row, ri) =>
        row.map((piece, ci) => {
          const isLight = (ri + ci) % 2 === 0
          const key = piece ? `${piece.color}${piece.type}` : ''
          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                background: isLight ? '#c8a97e' : '#8b6343',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(8px, 1.5vw, 18px)',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              {piece ? PIECE_GLYPH[key] ?? '' : ''}
            </div>
          )
        })
      )}
    </div>
  )
}
