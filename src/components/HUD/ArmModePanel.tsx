/**
 * ArmModePanel.tsx
 * HUD panel for the gesture-based piece selection mode.
 * When enabled: hold an "L" shape (thumb + index) to highlight knights,
 * then flick toward one to select it.
 */

import React from 'react'
import { useGameStore } from '../../store/gameStore'

export const ArmModePanel: React.FC = () => {
  const { armModeEnabled, setArmModeEnabled, handGesturePieceType } = useGameStore()

  const isHighlighting = handGesturePieceType === 'n'

  const statusText = !armModeEnabled
    ? 'Disabled'
    : isHighlighting
    ? '♞ Knights highlighted — flick to select'
    : 'Hold L-shape to select a knight…'

  const statusColor = !armModeEnabled
    ? 'var(--text-muted)'
    : isHighlighting
    ? '#8b5cf6'
    : 'var(--text-secondary)'

  return (
    <div className="card" style={{ gap: 10 }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-title" style={{ margin: 0 }}>🤌 Gesture Mode</div>
        <button
          onClick={() => setArmModeEnabled(!armModeEnabled)}
          style={{
            position: 'relative',
            width: 40,
            height: 22,
            borderRadius: 11,
            border: 'none',
            cursor: 'pointer',
            background: armModeEnabled
              ? 'linear-gradient(135deg, #8b5cf6, #0ea5e9)'
              : 'rgba(255,255,255,0.12)',
            transition: 'background 0.3s ease',
            padding: 0,
          }}
          aria-label={armModeEnabled ? 'Disable gesture mode' : 'Enable gesture mode'}
        >
          <div style={{
            position: 'absolute',
            top: 3,
            left: armModeEnabled ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }} />
        </button>
      </div>

      {/* Status line */}
      <div style={{
        fontSize: '0.72rem',
        color: statusColor,
        fontFamily: 'Outfit, sans-serif',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
          boxShadow: armModeEnabled ? `0 0 6px ${statusColor}` : 'none',
        }} />
        {statusText}
      </div>

      {/* Instructions */}
      {armModeEnabled ? (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 8,
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
        }}>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>🤙</span>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Hold "L"</strong> — thumb out + index up<br />
              <span style={{ color: '#8b5cf6' }}>Both knights glow purple</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>👉</span>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Flick toward a knight</strong><br />
              <span>That knight gets selected</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Enable to use hand gestures<br />
          instead of the pinch cursor.<br />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>
            Pinch cursor is disabled in this mode.
          </span>
        </div>
      )}
    </div>
  )
}
