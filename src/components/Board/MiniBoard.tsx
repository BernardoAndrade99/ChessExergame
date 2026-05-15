import React from 'react'
import { Chess } from 'chess.js'

interface MiniBoardProps {
  fen: string
  /** Pass a pixel size to fix dimensions, or omit to fill 100% of the parent */
  size?: number
  /** Optionally flip the board (black at bottom) */
  flipped?: boolean
  /** Algebraic square names to highlight, e.g. ['e2'] */
  highlightSquares?: string[]
}

/**
 * Read-only board that renders SVG pieces from /ChessPiecesSvg/.
 * Drop-in replacement for the old Unicode glyph version.
 */
export const MiniBoard: React.FC<MiniBoardProps> = ({ fen, size, flipped = false, highlightSquares }) => {
  let board: ReturnType<InstanceType<typeof Chess>['board']>
  try {
    board = new Chess(fen).board()
  } catch {
    board = new Chess().board()
  }

  const containerStyle: React.CSSProperties = size != null
    ? { width: size, height: size }
    : { width: '100%', height: '100%' }

  const rows = flipped ? [...board].reverse() : board
  const cols = flipped
    ? (row: typeof board[0]) => [...row].reverse()
    : (row: typeof board[0]) => row

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
        userSelect: 'none',
        ...containerStyle,
      }}
    >
      {rows.map((row, ri) =>
        cols(row).map((piece, ci) => {
          const isLight      = (ri + ci) % 2 === 0
          const pieceKey     = piece ? `${piece.color}${piece.type.toUpperCase()}` : null
          const fileLetter   = flipped ? 'abcdefgh'[7 - ci] : 'abcdefgh'[ci]
          const rankNumber   = flipped ? ri + 1 : 8 - ri
          const isHighlighted = highlightSquares?.includes(`${fileLetter}${rankNumber}`) ?? false
          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                background: isHighlighted
                  ? (isLight ? 'rgba(245,158,11,0.42)' : 'rgba(245,158,11,0.52)')
                  : isLight ? 'var(--sq-light)' : 'var(--sq-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: isHighlighted ? 'inset 0 0 0 2px #f59e0b' : undefined,
              }}
            >
              {pieceKey && (
                <img
                  src={`/ChessPiecesSvg/${pieceKey}.svg`}
                  alt={pieceKey}
                  draggable={false}
                  style={{
                    width: '82%',
                    height: '82%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
                  }}
                />
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
