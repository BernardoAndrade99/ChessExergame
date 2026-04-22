import React from 'react'
import { useGameStore } from '../../store/gameStore'

export const EvalBar: React.FC = () => {
  const { stockfish, game } = useGameStore()
  const { evaluation, isThinking } = stockfish

  // Clamp evaluation to ±10 pawns, map to 0–100% fill (50% = equal)
  const clamped = Math.max(-1000, Math.min(1000, evaluation))
  const pct = 50 + (clamped / 1000) * 50

  // White fill goes from bottom; positive eval = more white
  const whitePct = Math.round(pct)
  const label = Math.abs(evaluation) >= 9999
    ? (evaluation > 0 ? 'M' : '-M')
    : (Math.abs(evaluation) / 100).toFixed(1)

  return (
    <div className="card">
      <div className="card-title">Evaluation</div>
      <div className="eval-bar-container">
        <div className="eval-bar-track">
          <div
            className="eval-bar-fill"
            style={{ height: `${whitePct}%` }}
          />
          {isThinking && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, transparent, rgba(245,158,11,0.15))',
              animation: 'blink 0.8s infinite',
            }} />
          )}
        </div>
        <div className="eval-bar-label" style={{ color: evaluation >= 0 ? '#f1f5f9' : '#64748b' }}>
          {isThinking ? '…' : `${evaluation >= 0 ? '+' : ''}${label}`}
        </div>
        <div className="eval-bar-label" style={{ fontSize: '0.65rem' }}>
          {game.turn === 'w' ? '⬜ White to move' : '⬛ Black to move'}
        </div>
      </div>
    </div>
  )
}
