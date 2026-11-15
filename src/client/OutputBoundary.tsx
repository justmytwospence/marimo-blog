'use client';

import { Component, createRef, type ReactNode } from 'react';
import { emitOutputStatus } from './presentation-events.js';

export class OutputBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private fallback = createRef<HTMLElement>();
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    if (this.fallback.current) emitOutputStatus(this.fallback.current, { state: 'error' });
  }
  render() { return this.state.failed ? <aside ref={this.fallback} className="mb-notice" role="alert">{this.props.fallback || 'Interactive output unavailable.'}</aside> : this.props.children; }
}
