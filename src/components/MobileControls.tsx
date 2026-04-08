'use client';

import { useRef, useEffect, useCallback } from 'react';
import { VirtualInput } from '@/game/engine/InputManager';

interface Props {
  heroX: number;
  heroY: number;
  onVirtualInput: (v: Partial<VirtualInput>) => void;
  onPause: () => void;
}

// Joystick geometry (CSS pixels, relative to the component overlay)
const OUTER_R = 52; // base circle radius
const INNER_R = 24; // knob radius
const KNOB_MAX = 34; // max knob travel from centre

export default function MobileControls({ heroX, heroY, onVirtualInput, onPause }: Props) {
  // Refs for direct DOM manipulation (no re-renders on move)
  const leftBaseRef  = useRef<HTMLDivElement>(null);
  const rightBaseRef = useRef<HTMLDivElement>(null);
  const leftKnobRef  = useRef<HTMLDivElement>(null);
  const rightKnobRef = useRef<HTMLDivElement>(null);

  // Live joystick state (not React state — updated imperatively)
  const leftStick  = useRef({ dx: 0, dy: 0, active: false, pointerId: -1 });
  const rightStick = useRef({ dx: 0, dy: 0, active: false, pointerId: -1 });

  // Keep hero position accessible in pointer handlers without stale closure
  const heroPos = useRef({ x: heroX, y: heroY });
  useEffect(() => { heroPos.current = { x: heroX, y: heroY }; }, [heroX, heroY]);

  // When the right joystick is held still but the hero moves, update aim
  useEffect(() => {
    if (!rightStick.current.active) return;
    const { dx, dy } = rightStick.current;
    onVirtualInput({
      mouseX:    heroPos.current.x + dx * 600,
      mouseY:    heroPos.current.y + dy * 600,
      mouseDown: true,
    });
  }, [heroX, heroY, onVirtualInput]);

  // ── Left joystick (movement) ──────────────────────────────────────────────

  const setLeftKnob = (dx: number, dy: number) => {
    if (leftKnobRef.current) {
      leftKnobRef.current.style.transform = `translate(${dx * KNOB_MAX}px, ${dy * KNOB_MAX}px)`;
    }
  };

  const pushLeftInput = useCallback((dx: number, dy: number) => {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx  = dx / len;
    const ny  = dy / len;
    const DEAD = 0.25;
    onVirtualInput({
      up:    ny < -DEAD,
      down:  ny >  DEAD,
      left:  nx < -DEAD,
      right: nx >  DEAD,
    });
  }, [onVirtualInput]);

  const clearLeftInput = useCallback(() => {
    onVirtualInput({ up: false, down: false, left: false, right: false });
  }, [onVirtualInput]);

  const onLeftPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    leftStick.current = { dx: 0, dy: 0, active: true, pointerId: e.pointerId };
    setLeftKnob(0, 0);
    if (leftBaseRef.current) leftBaseRef.current.style.opacity = '0.85';
  }, []);

  const onLeftPointerMove = useCallback((e: React.PointerEvent) => {
    if (!leftStick.current.active) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const rawDx = e.clientX - (rect.left + rect.width  / 2);
    const rawDy = e.clientY - (rect.top  + rect.height / 2);
    const len   = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
    const clamp = Math.min(len, OUTER_R);
    const dx    = (rawDx / len) * clamp / OUTER_R; // -1..1
    const dy    = (rawDy / len) * clamp / OUTER_R;
    leftStick.current.dx = dx;
    leftStick.current.dy = dy;
    setLeftKnob(dx, dy);
    pushLeftInput(dx, dy);
  }, [pushLeftInput]);

  const onLeftPointerUp = useCallback(() => {
    leftStick.current = { dx: 0, dy: 0, active: false, pointerId: -1 };
    setLeftKnob(0, 0);
    if (leftBaseRef.current) leftBaseRef.current.style.opacity = '0.5';
    clearLeftInput();
  }, [clearLeftInput]);

  // ── Right joystick (aim + fire) ───────────────────────────────────────────

  const setRightKnob = (dx: number, dy: number) => {
    if (rightKnobRef.current) {
      rightKnobRef.current.style.transform = `translate(${dx * KNOB_MAX}px, ${dy * KNOB_MAX}px)`;
    }
  };

  const onRightPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rightStick.current = { dx: 0, dy: 0, active: true, pointerId: e.pointerId };
    setRightKnob(0, 0);
    if (rightBaseRef.current) rightBaseRef.current.style.opacity = '0.85';
    onVirtualInput({
      mouseX:    heroPos.current.x,
      mouseY:    heroPos.current.y,
      mouseDown: true,
    });
  }, [onVirtualInput]);

  const onRightPointerMove = useCallback((e: React.PointerEvent) => {
    if (!rightStick.current.active) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const rawDx = e.clientX - (rect.left + rect.width  / 2);
    const rawDy = e.clientY - (rect.top  + rect.height / 2);
    const len   = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
    const clamp = Math.min(len, OUTER_R);
    const dx    = (rawDx / len) * clamp / OUTER_R;
    const dy    = (rawDy / len) * clamp / OUTER_R;
    rightStick.current.dx = dx;
    rightStick.current.dy = dy;
    setRightKnob(dx, dy);
    onVirtualInput({
      mouseX:    heroPos.current.x + dx * 600,
      mouseY:    heroPos.current.y + dy * 600,
      mouseDown: true,
    });
  }, [onVirtualInput]);

  const onRightPointerUp = useCallback(() => {
    rightStick.current = { dx: 0, dy: 0, active: false, pointerId: -1 };
    setRightKnob(0, 0);
    if (rightBaseRef.current) rightBaseRef.current.style.opacity = '0.5';
    onVirtualInput({ mouseDown: false });
  }, [onVirtualInput]);

  // ── Dash button ───────────────────────────────────────────────────────────

  const onDashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    onVirtualInput({ dash: true });
  }, [onVirtualInput]);

  // ── Shared style helpers ──────────────────────────────────────────────────

  const baseStyle: React.CSSProperties = {
    width:           OUTER_R * 2,
    height:          OUTER_R * 2,
    borderRadius:    '50%',
    border:          '2px solid rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    opacity:         0.5,
    touchAction:     'none',
    userSelect:      'none',
    cursor:          'pointer',
    transition:      'opacity 0.1s',
  };

  const knobStyle: React.CSSProperties = {
    width:           INNER_R * 2,
    height:          INNER_R * 2,
    borderRadius:    '50%',
    pointerEvents:   'none',
    willChange:      'transform',
    transition:      'transform 0.04s linear',
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
      {/* Pause button — top centre */}
      <button
        className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto
                   w-10 h-10 rounded-full flex items-center justify-center
                   text-white/60 text-xl font-bold leading-none"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.2)', touchAction: 'none' }}
        onPointerDown={e => { e.preventDefault(); onPause(); }}
      >
        ⏸
      </button>

      {/* Left joystick (movement) */}
      <div
        ref={leftBaseRef}
        className="absolute pointer-events-auto"
        style={{ ...baseStyle, bottom: 28, left: 28 }}
        onPointerDown={onLeftPointerDown}
        onPointerMove={onLeftPointerMove}
        onPointerUp={onLeftPointerUp}
        onPointerCancel={onLeftPointerUp}
      >
        <div
          ref={leftKnobRef}
          style={{ ...knobStyle, backgroundColor: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)' }}
        />
      </div>

      {/* Dash button — bottom centre */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto
                   flex flex-col items-center gap-1"
        style={{ bottom: 40 }}
      >
        <span className="text-white/40 text-xs font-mono" style={{ fontSize: 9 }}>DASH</span>
        <div
          className="flex items-center justify-center rounded-full text-lg"
          style={{
            width: 46, height: 46,
            backgroundColor: 'rgba(139,92,246,0.25)',
            border: '2px solid rgba(139,92,246,0.5)',
            touchAction: 'none',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onPointerDown={onDashPointerDown}
        >
          ⚡
        </div>
      </div>

      {/* Right joystick (aim + fire) */}
      <div
        ref={rightBaseRef}
        className="absolute pointer-events-auto"
        style={{ ...baseStyle, bottom: 28, right: 28, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)' }}
        onPointerDown={onRightPointerDown}
        onPointerMove={onRightPointerMove}
        onPointerUp={onRightPointerUp}
        onPointerCancel={onRightPointerUp}
      >
        <div
          ref={rightKnobRef}
          style={{ ...knobStyle, backgroundColor: 'rgba(239,68,68,0.5)', border: '1px solid rgba(239,68,68,0.7)' }}
        />
      </div>
    </div>
  );
}
