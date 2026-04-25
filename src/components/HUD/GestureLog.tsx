import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'

const EMOJI: Record<string, string> = {
  gesture:  '🤚',
  flick:    '👉',
  select:   '✅',
  knight1:  '🐴',
  knight2:  '🎯',
  move:     '♟️',
  cancel:   '❌',
  sweep:    '↔️',
  cooldown: '⏳',
  timeout:  '⌛',
}

function entryIcon(text: string): string {
  const t = text.toLowerCase()
  if (t.startsWith('cancel'))                      return EMOJI.cancel
  if (t.startsWith('gesture:'))                    return EMOJI.gesture
  if (t.startsWith('flick'))                       return EMOJI.flick
  if (t.startsWith('select'))                      return EMOJI.select
  if (t.includes('knight 1st') || t.includes('first gesture')) return EMOJI.knight1
  if (t.includes('knight 2nd') || t.includes('second gesture')) return EMOJI.knight2
  if (t.startsWith('move:') || t.startsWith('sweep commit')) return EMOJI.move
  if (t.includes('cooldown'))                      return EMOJI.cooldown
  if (t.includes('timeout') || t.includes('expired')) return EMOJI.timeout
  if (t.startsWith('sweep'))                       return EMOJI.sweep
  return '•'
}

export const GestureLog: React.FC = () => {
  const gestureLog = useGameStore(s => s.gestureLog)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to top (newest entry is first) on each new log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [gestureLog.length])

  return (
    <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="card-title">Gesture Log</div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 4,
        maxHeight: 280,
        paddingRight: 2,
      }}>
        {gestureLog.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textAlign: 'center', marginTop: 12 }}>
            No gestures yet
          </div>
        )}
        {gestureLog.map(entry => (
          <div key={entry.id} style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
            fontSize: '0.72rem',
            lineHeight: 1.4,
            padding: '4px 6px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
          }}>
            <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{entryIcon(entry.text)}</span>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{entry.time}</span>
              <span style={{ color: 'var(--text-primary)' }}>{entry.text}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
