import { describe, expect, it } from 'vitest';
import { minRailShift, nextRailShift } from '../src/client/sticky-rail.js';

describe('sticky contents rail', () => {
  it('never shifts a rail that fits', () => {
    expect(minRailShift(900, 112, 600, 16)).toBe(0);
  });

  it('lets a tall rail rise until its bottom edge shows', () => {
    expect(minRailShift(900, 112, 1500, 16)).toBe(-728);
  });

  it('rises while scrolling down and settles at its bottom edge', () => {
    expect(nextRailShift(0, 300, -728)).toBe(-300);
    expect(nextRailShift(-600, 300, -728)).toBe(-728);
  });

  it('falls back while scrolling up and settles at its top edge', () => {
    expect(nextRailShift(-728, -200, -728)).toBe(-528);
    expect(nextRailShift(-100, -200, -728)).toBe(0);
  });
});
