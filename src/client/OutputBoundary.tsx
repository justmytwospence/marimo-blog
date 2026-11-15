'use client';

import { Component, type ReactNode } from 'react';

export class OutputBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <aside className="mb-notice" role="alert">{this.props.fallback || 'Interactive output unavailable.'}</aside> : this.props.children; }
}
