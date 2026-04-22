/**
 * ArmModePanel.tsx
 * Phase 1.5 — HUD panel for the arm tracking mode toggle.
 * Shows: on/off toggle, current arm detection state, piece-type reference guide.
 */

import React from 'react'
import { useGameStore } from '../../store/gameStore'

const PIECE_COLORS: Record<string, string> = {
  n: '#f59e0b',
  b: '#8b5cf6',
  r: '#0ea5e9',
}

const PIECE_INFO: Array<{ type: string; icon: string; name: string; hint: string }> = [
  { type: 'n', icon: '♞', name: 'Knight', hint: 'Left arm: L-shape' },
  { type: 'b', icon: '♝', name: 'Bishop', hint: 'Left arm: diagonal' },
  { type: 'r', icon: '♜', name: 'Rook',   hint: 'Left arm: straight' },
]

export const ArmModePanel: React.FC = () => {
  const {
    armModeEnabled,
    setArmModeEnabled,
    detectedPieceType,
    armConfidence,
    isRecordingTrajectory,
    armMismatch,
  } = useGameStore()

  const statusText = isRecordingTrajectory
    ? '⏺ Recording…'
    : detectedPieceType
    ? `${detectedPieceType === 'n' ? '♞ Knight' : detectedPieceType === 'b' ? '♝ Bishop' : '♜ Rook'} detected`
    : armModeEnabled
    ? 'Waiting for move…'
    : 'Disabled'

  const statusColor = isRecordingTrajectory
    ? '#ef4444'
    : detectedPieceType
    ? PIECE_COLORS[detectedPieceType]
    : 'var(--text-muted)'

  return (
    <div className="card" style={{ gap: 10 }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-title" style={{ margin: 0 }}>🏋️ Arm Mode</div>
        {/* Toggle switch */}
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
          aria-label={armModeEnabled ? 'Disable arm mode' : 'Enable arm mode'}
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

      {/* Confidence bar */}
      {armModeEnabled && detectedPieceType && !isRecordingTrajectory && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Confidence</span>
            <span style={{
              fontSize: '0.65rem',
              color: armConfidence >= 0.75 ? '#10b981' : armConfidence >= 0.5 ? '#f59e0b' : '#ef4444',
              fontWeight: 700,
            }}>
              {Math.round(armConfidence * 100)}%
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{
              height: '100%',
              width: `${armConfidence * 100}%`,
              borderRadius: 2,
              background: armConfidence >= 0.75 ? '#10b981' : armConfidence >= 0.5 ? '#f59e0b' : '#ef4444',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Mismatch warning */}
      {armMismatch && (
        <div style={{
          padding: '6px 8px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          fontSize: '0.68rem',
          color: '#ef4444',
          fontWeight: 600,
        }}>
          ⚠️ Arm pattern doesn't match this piece!
        </div>
      )}

      {/* Piece reference guide */}
      {armModeEnabled && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Arm Patterns
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {PIECE_INFO.map(({ type, icon, name, hint }) => {
              const isActive = detectedPieceType === type
              const color = PIECE_COLORS[type]
              return (
                <div key={type} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: isActive ? `${color}18` : 'transparent',
                  border: `1px solid ${isActive ? color + '44' : 'transparent'}`,
                  transition: 'all 0.2s ease',
                }}>
                  <span style={{ fontSize: '1rem', color, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: isActive ? color : 'var(--text-primary)' }}>
                      {name}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{hint}</div>
                  </div>
                  {isActive && (
                    <div style={{ marginLeft: 'auto', fontSize: '0.6rem', color, fontWeight: 700 }}>✓</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!armModeEnabled && (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Right hand</strong> → pinch piece to select<br />
        <strong style={{ color: 'var(--text-secondary)' }}>Left arm</strong> → swing to encode move:
        <div style={{ marginTop: 4, paddingLeft: 6 }}>
          ♞ L-shape = Knight destination<br />
          ♝ Diagonal = Bishop destination<br />
          ♜ Straight = Rook destination
        </div>
        <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>
          Where your left wrist ends up = where the piece lands.
        </div>
      </div>
        </div>
      )}
    </div>
  )
}
