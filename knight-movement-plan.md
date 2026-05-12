# Plan: Rebuild Knight Movement Step by Step

## Overview

Knight move uses a 2-gesture sequence: Jump (body jump → shoulder Y velocity) + Turn (nose X offset).
The system has compound issues making it non-functional. Rebuild incrementally, verify each layer before moving on.

## Steps

### Phase 1 — Diagnose (no logic changes)

1. **Add real-time debug numbers to HUD** — Display live shoulder-Y midpoint, shoulder span, hipVelY, nose offset, and phase state directly on screen (not in gesture log which is hard to read in real-time). Gives observable values to tune thresholds against. _Test: watch numbers while jumping and turning._

### Phase 2 — Fix jump detection

2. **Fix liftoff + landing thresholds** — Based on observed values from Step 1, tune `HIP_LIFTOFF_VEL`, `HIP_LAND_VEL`, `SHOULDER_VIS_CACHE_MIN`. Also verify landing condition (`cachedHipY >= anchor.y`) is correct for MediaPipe Y-axis. Fix direction logic (span delta interpretation). _Test: jump → see "Jump liftoff" + "Jump landed: jump_fwd/back" in gesture log._

### Phase 3 — Fix sequence state machine

3. **Remove dual-registration path** — Currently jump auto-registers to `knightSeq` at landing AND the debounce path in the knight block also tries to register. Remove the auto-register in landing, keep only the single debounce path. Extend `JUMP_LATCH_MS` to 800ms so there's time to turn after landing. _Test: jump then turn → see "Knight 1st gesture: jump_X → previewing [squares]" then "Knight 2nd gesture: turn_Y → move: e2 → f4"._

### Phase 4 — Wire up move + preview squares

4. **Verify move execution** — Confirm `onDropSquare` fires with correct squares, preview squares highlight correctly on board, sequence resets cleanly. _Test full sequence end-to-end: select knight → jump → turn → piece moves._

### Phase 5 — Turn-first + edge cases

5. **Handle turn-first sequences and sequence expiry** — Test turn-first → then jump. Test expired sequence (wait 1.2s → should clear). Test cancel pose mid-sequence. Remove or gate the continuous `[SM]` per-frame gesture log that floods the log and may cause performance issues.

## Relevant Files

- `src/hooks/useGesture.ts` — all knight logic (jump phase machine ~L388, turn classifier ~L432, sequence block ~L560)
- `src/components/HUD/StatusOverlay.tsx` — for debug overlay in Step 1
- `src/store/gameStore.ts` — `knightPreviewSquares`, `gestureLog`

## Key Constants to Tune

- `HIP_LIFTOFF_VEL = 0.008`, `HIP_LAND_VEL = 0.004`, `SHOULDER_VIS_CACHE_MIN = 0.55`
- `JUMP_LATCH_MS = 300` (likely too short — needs ~800ms)
- `KNIGHT_SEQ_MS = 1200`, `KNIGHT_GESTURE_MS = 120`

## Decisions

- Keep physical jump detection (core exergame mechanic)
- Direction: jump fwd/back = Y axis of board, turn left/right = X axis
- Single registration path (debounce only, not auto-register-on-landing)
