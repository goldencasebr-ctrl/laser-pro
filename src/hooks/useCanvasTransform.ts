import { useState, useRef } from 'react';
import type { MouseEvent, WheelEvent } from 'react';

export function useCanvasTransform() {
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setOffsetX(prev => prev + dx);
    setOffsetY(prev => prev + dy);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(5, Math.max(0.1, prev * delta)));
  };

  const reset = () => {
    setOffsetX(0);
    setOffsetY(0);
    setZoom(1);
    setRotation(0);
  };

  return {
    offsetX,
    offsetY,
    zoom,
    setZoom,
    rotation,
    setRotation,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    reset,
  };
}
