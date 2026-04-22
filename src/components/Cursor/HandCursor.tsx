import React from 'react'
import { useGameStore } from '../../store/gameStore'

export const HandCursor: React.FC = () => {
  const { cursor, gestureState } = useGameStore()

  if (!cursor.visible) return null

  const isGrabbing = gestureState === 'grabbing'

  return (
    <div
      className="hand-cursor"
      style={{ left: cursor.x, top: cursor.y }}
      aria-hidden
    >
      {isGrabbing ? '✊' : '👆'}
    </div>
  )
}
