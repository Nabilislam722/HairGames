import React, { useRef, useCallback, useEffect, useState } from 'react';

const MAX_KNOB_OFFSET = 40; // px the knob can travel from center before clamping

export default function TouchControls({ onMove }) {
  const baseRef = useRef(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const activePointerId = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setVisible(!mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const updateFromEvent = useCallback(
    (clientX, clientY) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MAX_KNOB_OFFSET) {
        dx = (dx / dist) * MAX_KNOB_OFFSET;
        dy = (dy / dist) * MAX_KNOB_OFFSET;
      }
      setKnobPos({ x: dx, y: dy });
      onMove(dx / MAX_KNOB_OFFSET, dy / MAX_KNOB_OFFSET);
    },
    [onMove]
  );

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      activePointerId.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromEvent(e.clientX, e.clientY);
    },
    [updateFromEvent]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (activePointerId.current !== e.pointerId) return;
      e.preventDefault();
      updateFromEvent(e.clientX, e.clientY);
    },
    [updateFromEvent]
  );

  const endDrag = useCallback(
    (e) => {
      if (activePointerId.current !== e.pointerId) return;
      activePointerId.current = null;
      setKnobPos({ x: 0, y: 0 });
      onMove(0, 0);
    },
    [onMove]
  );

  if (!visible) return null;

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute w-[110px] h-[110px] rounded-full bg-black/40 border-4 border-white/40 select-none z-20"
      style={{
        touchAction: 'none',
        left: 'calc(1.5rem + env(safe-area-inset-left))',
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full bg-yellow-400 border-4 border-white shadow-[2px_2px_0_rgba(0,0,0,0.5)] pointer-events-none"
        style={{
          transform: `translate(-50%, -50%) translate(${knobPos.x}px, ${knobPos.y}px)`,
        }}
      />
    </div>
  );
}