import React from 'react'
import { Chess } from 'chess.js'
import { useGameStore } from '../../store/gameStore'

export const KnightDebugHud: React.FC = () => {
  const { armModeEnabled, game, knightDebug } = useGameStore()
  if (!armModeEnabled || !game.selectedSquare) return null

  const chess = new Chess(game.fen)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const piece = chess.get(game.selectedSquare as any)
  if (piece?.type !== 'n') return null

  return (
    <div className="card">
      <div className="card-title">Knight Debug</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <div>Phase: <strong>{knightDebug.phase}</strong></div>
        <div>Shoulder Y: <strong>{knightDebug.shoulderMidY.toFixed(3)}</strong></div>
        <div>Shoulder span: <strong>{knightDebug.shoulderSpan.toFixed(3)}</strong></div>
        <div>Vertical vel/s: <strong>{knightDebug.hipVelY.toFixed(3)}</strong></div>
        <div>Nose offset: <strong>{knightDebug.noseOffset.toFixed(3)}</strong></div>
      </div>
    </div>
  )
}

