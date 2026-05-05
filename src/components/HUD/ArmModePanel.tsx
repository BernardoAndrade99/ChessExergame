/**
 * ArmModePanel.tsx
 * HUD panel for the gesture-based piece selection mode.
 * Each hand shape highlights the matching piece type on the board;
 * then left/right hand disambiguates which piece to grab.
 */

import React from 'react'
import { useGameStore } from '../../store/gameStore'

export const ArmModePanel: React.FC = () => {
  const {
    armModeEnabled,
    setArmModeEnabled,
    oneHandMode,
    setOneHandMode,
    kingPawnStepMode,
    setKingPawnStepMode,
    handGesturePieceType,
  } = useGameStore()

  const pieceLabels: Record<string, string> = {
    n: '♞ Knights', b: '♝ Bishops', r: '♜ Rooks',
    k: '♚ King', q: '♛ Queen', p: '♟ Pawns',
  }
  const isHighlighting = handGesturePieceType !== null

  const statusText = !armModeEnabled
    ? 'Disabled'
    : isHighlighting
    ? `${pieceLabels[handGesturePieceType!] ?? 'Pieces'} highlighted — ${
      oneHandMode ? 'choose by right-hand direction' : 'choose with left/right hand'
    }`
    : 'Hold a gesture to highlight pieces…'

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

      {armModeEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            King/Pawn Step Mode
          </div>
          <button
            onClick={() => setKingPawnStepMode(!kingPawnStepMode)}
            style={{
              position: 'relative',
              width: 40,
              height: 22,
              borderRadius: 11,
              border: 'none',
              cursor: 'pointer',
              background: kingPawnStepMode
                ? 'linear-gradient(135deg, #10b981, #0ea5e9)'
                : 'rgba(255,255,255,0.12)',
              transition: 'background 0.3s ease',
              padding: 0,
            }}
            aria-label={kingPawnStepMode ? 'Disable king pawn step mode' : 'Enable king pawn step mode'}
          >
            <div style={{
              position: 'absolute',
              top: 3,
              left: kingPawnStepMode ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </button>
        </div>
      )}

      {armModeEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            One Hand Mode
          </div>
          <button
            onClick={() => setOneHandMode(!oneHandMode)}
            style={{
              position: 'relative',
              width: 40,
              height: 22,
              borderRadius: 11,
              border: 'none',
              cursor: 'pointer',
              background: oneHandMode
                ? 'linear-gradient(135deg, #f59e0b, #8b5cf6)'
                : 'rgba(255,255,255,0.12)',
              transition: 'background 0.3s ease',
              padding: 0,
            }}
            aria-label={oneHandMode ? 'Disable one hand mode' : 'Enable one hand mode'}
          >
            <div style={{
              position: 'absolute',
              top: 3,
              left: oneHandMode ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </button>
        </div>
      )}

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
          {[
            { emoji: '🤙', gesture: 'L-shape (thumb + index)', piece: 'Knight' },
            { emoji: '✌️', gesture: 'Peace sign (index + middle)', piece: 'Bishop' },
            { emoji: '☝️', gesture: 'One index up', piece: 'Pawn' },
            { emoji: '✊', gesture: 'Fist', piece: 'Rook' },
            { emoji: '✋', gesture: 'Four fingers together (stop hand)', piece: 'King' },
            { emoji: '🖐', gesture: 'Four fingers spread wide', piece: 'Queen' },
          ].map(({ emoji, gesture, piece }) => (
            <div key={piece} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{emoji}</span>
              <div>
                <strong style={{ color: 'var(--text-secondary)' }}>{piece}</strong> — {gesture}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>{oneHandMode ? '👉' : '🫲'}</span>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>
                {oneHandMode ? 'Right hand direction' : 'Left/right hand'}
              </strong>{' '}
              {oneHandMode ? 'selects between same-piece options' : 'selects left/right piece'}
            </div>
          </div>
          {oneHandMode && (
            <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
              Keep pieces highlighted, point right hand to the piece, then close right hand to confirm selection
            </div>
          )}
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>✊</span>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>
                {oneHandMode ? 'Close right hand' : 'Close left hand'}
              </strong>{' '}
              to confirm drop
            </div>
          </div>
          {kingPawnStepMode && !oneHandMode ? (
            <>
              <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                King: move torso direction for 1-square steps, arms X = castle
              </div>
              <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                Pawn: body-forward for push, left swipe captures right, right swipe captures left
              </div>
              <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                Knight: jump can also be triggered by torso forward/back step
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                King: short side sweep = 1 square, arms X = castle (if legal)
              </div>
              <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                Pawn: if a file has multiple pawns, repeat hold to cycle selection
              </div>
              <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                Knight: aim one L-target square with arm direction, close {oneHandMode ? 'right' : 'left'} hand to move
              </div>
              {oneHandMode && (
                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                  One Hand Mode uses right arm aiming for all pieces.
                </div>
              )}
              {oneHandMode && kingPawnStepMode && (
                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                  One Hand Mode overrides King/Pawn Step Mode while active.
                </div>
              )}
            </>
          )}
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
