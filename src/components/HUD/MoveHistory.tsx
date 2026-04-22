import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'

export const MoveHistory: React.FC = () => {
  const { game } = useGameStore()
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [game.moves.length])

  const pairs: Array<{ white?: string; black?: string; num: number }> = []
  game.moves.forEach((m, i) => {
    if (i % 2 === 0) {
      pairs.push({ num: Math.floor(i / 2) + 1, white: m.san })
    } else {
      if (pairs.length > 0) pairs[pairs.length - 1].black = m.san
    }
  })

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="card-title">Move History</div>
      <div className="move-history" ref={listRef}>
        {pairs.length === 0 && (
          <div className="text-muted text-sm" style={{ padding: '8px 0', textAlign: 'center' }}>
            No moves yet
          </div>
        )}
        {pairs.map((p) => (
          <div className="move-row" key={p.num}>
            <span className="move-num">{p.num}.</span>
            <span className={`move-san ${game.moves.length % 2 === 1 && pairs[pairs.length - 1].num === p.num ? 'active' : ''}`}>
              {p.white ?? ''}
            </span>
            <span className={`move-san ${game.moves.length % 2 === 0 && pairs[pairs.length - 1].num === p.num && p.black ? 'active' : ''}`}>
              {p.black ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
