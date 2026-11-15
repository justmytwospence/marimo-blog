'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { emitOutputStatus } from './presentation-events.js';

type FigureFrameProps = {
  children?: ReactNode;
  caption?: string;
  state?: 'idle' | 'loading' | 'ready' | 'error';
  fallback?: ReactNode;
  className?: string;
};

// Keep hosts mounted and measurable while CSS hides them in non-ready states.
// Only the fallback occupies normal flow until rendering has completed.
export const FigureFrame = forwardRef<HTMLElement, FigureFrameProps>(function FigureFrame({ children, caption, state = 'ready', fallback, className }, ref) {
  const figure = useRef<HTMLElement>(null);
  useImperativeHandle(ref, () => figure.current!, []);
  useEffect(() => {
    if (figure.current && (state === 'ready' || state === 'error')) emitOutputStatus(figure.current, { state });
  }, [state]);
  return <figure ref={figure} className={`mb-output mb-figure${className ? ` ${className}` : ''}`} data-state={state}>
    <div className="mb-figure-viewport" aria-busy={state === 'loading'}>
      {children}
      {state !== 'ready' && fallback && <div className="mb-figure-fallback">{fallback}</div>}
    </div>
    {caption && <figcaption className="mb-caption">{caption}</figcaption>}
  </figure>;
});
