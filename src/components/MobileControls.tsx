'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Pause, Zap, Crosshair } from 'lucide-react';
import { VirtualInput } from '@/game/engine/InputManager';

interface Props {
  heroX: number;
  heroY: number;
  visible: boolean;
  onVirtualInput: (v: Partial<VirtualInput>) => void;
  onPause: () => void;
}

const OUTER_R   = 52;  // joystick base radius (CSS px)
const INNER_R   = 22;  // knob radius
const KNOB_MAX  = 36;  // max knob travel from centre
const MOVE_DEAD = 0.20; // left stick: dead zone fraction
const AIM_DEAD  = 0.15; // right stick: inner dead zone — no aim, no fire
const FIRE_DEAD = 0.38; // right stick: aim-but-no-fire threshold

export default function MobileControls({ heroX, heroY, visible, onVirtualInput, onPause }: Props) {
  const leftBaseRef  = useRef<HTMLDivElement>(null);
  const rightBaseRef = useRef<HTMLDivElement>(null);
  const leftKnobRef  = useRef<HTMLDivElement>(null);
  const rightKnobRef = useRef<HTMLDivElement>(null);

  const leftActive  = useRef(false);
  const rightActive = useRef(false);
  const rightDx     = useRef(0);
  const rightDy     = useRef(0);
  const rightFiring = useRef(false);

  const heroPos = useRef({ x: heroX, y: heroY });
  useEffect(() => { heroPos.current = { x: heroX, y: heroY }; }, [heroX, heroY]);

  // Keep aim fresh while right stick is held and hero moves
  useEffect(() => {
    if (!rightFiring.current) return;
    onVirtualInput({
      mouseX:    heroPos.current.x + rightDx.current * 600,
      mouseY:    heroPos.current.y + rightDy.current * 600,
      mouseDown: true,
    });
  }, [heroX, heroY, onVirtualInput]);

  // ── Knob position helpers ──────────────────────────────────────────────────

  const setKnob = (ref: React.RefObject<HTMLDivElement | null>, dx: number, dy: number) => {
    if (ref.current) {
      ref.current.style.transform = `translate(${dx * KNOB_MAX}px, ${dy * KNOB_MAX}px)`;
    }
  };

  const setBaseOpacity = (ref: React.RefObject<HTMLDivElement | null>, active: boolean) => {
    if (ref.current) ref.current.style.opacity = active ? '0.85' : '0.45';
  };

  // ── Left joystick (movement) ───────────────────────────────────────────────

  const pushMove = useCallback((dx: number, dy: number) => {
    onVirtualInput({
      up:    dy < -MOVE_DEAD,
      down:  dy >  MOVE_DEAD,
      left:  dx < -MOVE_DEAD,
      right: dx >  MOVE_DEAD,
    });
  }, [onVirtualInput]);

  const onLeftDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    leftActive.current = true;
    setBaseOpacity(leftBaseRef, true);
    setKnob(leftKnobRef, 0, 0);
  }, []);

  const onLeftMove = useCallback((e: React.PointerEvent) => {
    if (!leftActive.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const rawDx = e.clientX - (rect.left + rect.width  / 2);
    const rawDy = e.clientY - (rect.top  + rect.height / 2);
    const len   = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
    const clamp = Math.min(len, OUTER_R);
    const dx    = (rawDx / len) * clamp / OUTER_R;
    const dy    = (rawDy / len) * clamp / OUTER_R;
    setKnob(leftKnobRef, dx, dy);
    pushMove(dx, dy);
  }, [pushMove]);

  const onLeftUp = useCallback(() => {
    leftActive.current = false;
    setBaseOpacity(leftBaseRef, false);
    setKnob(leftKnobRef, 0, 0);
    onVirtualInput({ up: false, down: false, left: false, right: false });
  }, [onVirtualInput]);

  // ── Right joystick (aim + fire) ────────────────────────────────────────────

  const onRightDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rightActive.current = true;
    rightFiring.current = false;
    setBaseOpacity(rightBaseRef, true);
    setKnob(rightKnobRef, 0, 0);
    // Don't fire or aim yet — wait for drag to exceed dead zones
  }, []);

  const onRightMove = useCallback((e: React.PointerEvent) => {
    if (!rightActive.current) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const rawDx = e.clientX - (rect.left + rect.width  / 2);
    const rawDy = e.clientY - (rect.top  + rect.height / 2);
    const len   = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
    const mag   = Math.min(len, OUTER_R) / OUTER_R; // 0..1
    const nx    = rawDx / len;  // normalised direction
    const ny    = rawDy / len;
    const clampedMag = Math.min(len, OUTER_R);
    const dx    = (rawDx / len) * clampedMag / OUTER_R;
    const dy    = (rawDy / len) * clampedMag / OUTER_R;

    setKnob(rightKnobRef, dx, dy);

    if (mag < AIM_DEAD) {
      // Pure dead zone — release fire if we were firing
      if (rightFiring.current) {
        rightFiring.current = false;
        onVirtualInput({ mouseDown: false });
      }
      return;
    }

    // Update stored direction for the hero-move-while-held effect
    rightDx.current = nx;
    rightDy.current = ny;

    const shouldFire = mag >= FIRE_DEAD;
    rightFiring.current = shouldFire;

    onVirtualInput({
      mouseX:    heroPos.current.x + nx * 600,
      mouseY:    heroPos.current.y + ny * 600,
      mouseDown: shouldFire,
    });
  }, [onVirtualInput]);

  const onRightUp = useCallback(() => {
    rightActive.current = false;
    rightFiring.current = false;
    rightDx.current     = 0;
    rightDy.current     = 0;
    setBaseOpacity(rightBaseRef, false);
    setKnob(rightKnobRef, 0, 0);
    onVirtualInput({ mouseDown: false });
  }, [onVirtualInput]);

  // ── Dash button ────────────────────────────────────────────────────────────

  const onDashDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    onVirtualInput({ dash: true });
  }, [onVirtualInput]);

  // ── Shared styles ──────────────────────────────────────────────────────────

  const baseStyle: React.CSSProperties = {
    width:           OUTER_R * 2,
    height:          OUTER_R * 2,
    borderRadius:    '50%',
    border:          '2px solid rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    opacity:         0.45,
    touchAction:     'none',
    userSelect:      'none',
    cursor:          'pointer',
  };

  const knobStyle: React.CSSProperties = {
    width:         INNER_R * 2,
    height:        INNER_R * 2,
    borderRadius:  '50%',
    pointerEvents: 'none',
  };

  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>

      {/* Pause — top centre */}
      <button
        className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto
                   w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.2)',
          touchAction: 'none',
          color: 'rgba(255,255,255,0.6)',
        }}
        onPointerDown={e => { e.preventDefault(); onPause(); }}
      >
        <Pause size={16} />
      </button>

      {/* Left joystick (movement) */}
      <div
        ref={leftBaseRef}
        className="absolute pointer-events-auto"
        style={{ ...baseStyle, bottom: 28, left: 28 }}
        onPointerDown={onLeftDown}
        onPointerMove={onLeftMove}
        onPointerUp={onLeftUp}
        onPointerCancel={onLeftUp}
      >
        <div
          ref={leftKnobRef}
          style={{
            ...knobStyle,
            backgroundColor: 'rgba(255,255,255,0.4)',
            border: '1.5px solid rgba(255,255,255,0.55)',
          }}
        />
      </div>

      {/* Dash button — bottom centre */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-1"
        style={{ bottom: 40 }}
      >
        <span className="text-white/40 font-mono" style={{ fontSize: 9 }}>DASH</span>
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 46, height: 46,
            backgroundColor: 'rgba(139,92,246,0.2)',
            border: '2px solid rgba(139,92,246,0.5)',
            touchAction: 'none',
            cursor: 'pointer',
            userSelect: 'none',
            color: 'rgba(167,139,250,0.9)',
          }}
          onPointerDown={onDashDown}
        >
          <Zap size={20} fill="currentColor" />
        </div>
      </div>

      {/* Right joystick (aim + fire) */}
      <div
        ref={rightBaseRef}
        className="absolute pointer-events-auto"
        style={{
          ...baseStyle,
          bottom: 28, right: 28,
          borderColor: 'rgba(239,68,68,0.35)',
          backgroundColor: 'rgba(239,68,68,0.07)',
        }}
        onPointerDown={onRightDown}
        onPointerMove={onRightMove}
        onPointerUp={onRightUp}
        onPointerCancel={onRightUp}
      >
        {/* Centre crosshair icon (hint) */}
        <div style={{ position: 'absolute', color: 'rgba(239,68,68,0.3)', pointerEvents: 'none' }}>
          <Crosshair size={18} />
        </div>
        <div
          ref={rightKnobRef}
          style={{
            ...knobStyle,
            backgroundColor: 'rgba(239,68,68,0.45)',
            border: '1.5px solid rgba(239,68,68,0.65)',
          }}
        />
      </div>
    </div>
  );
}
