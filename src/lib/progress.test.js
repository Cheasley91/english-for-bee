import { describe, expect, it } from 'vitest';
import { computeLevel } from './progress.js';

describe('computeLevel', () => {
  it('starts at level 1 with 0 XP', () => {
    const info = computeLevel(0);
    expect(info.level).toBeGreaterThanOrEqual(1);
  });

  it('higher XP increases level and returns sensible xp info', () => {
    const base = computeLevel(0);
    const advanced = computeLevel(200);
    expect(advanced.level).toBeGreaterThan(base.level);
    expect(advanced.xpIntoLevel).toBeGreaterThanOrEqual(0);
    expect(advanced.xpToNext).toBeGreaterThan(0);
  });
});
