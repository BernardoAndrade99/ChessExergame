import React from 'react'
import { useGameStore } from '../../store/gameStore'

export const StatusOverlay: React.FC<{ onReset: () => void }> = ({ onReset }) => {
  const { game, playerSide } = useGameStore()
  const { isCheckmate, isStalemate, isDraw, turn } = game

  const show = isCheckmate || isStalemate || isDraw
  if (!show) return null

  let emoji = '🏁'
  let title = 'Game Over'
  let sub = ''

  if (isCheckmate) {
    const winner = turn === 'w' ? 'Black' : 'White'
    const isPlayerWin = (playerSide === 'white' && winner === 'White') ||
                        (playerSide === 'black' && winner === 'Black')
    emoji = isPlayerWin ? '👑' : '😔'
    title = isPlayerWin ? 'You Win!' : `${winner} Wins`
    sub = 'Checkmate'
  } else if (isStalemate) {
    emoji = '🤝'
    title = 'Stalemate'
    sub = 'No legal moves — it\'s a draw'
  } else if (isDraw) {
    emoji = '🤝'
    title = 'Draw'
    sub = 'The game is drawn'
  }

  return (
    <div className="status-overlay animate-slide-up">
      <div className="status-card">
        <div className="status-emoji">{emoji}</div>
        <div className="status-title">{title}</div>
        <div className="status-sub">{sub}</div>
        <button className="btn btn-primary" onClick={onReset}>
          Play Again
        </button>
      </div>
    </div>
  )
}
