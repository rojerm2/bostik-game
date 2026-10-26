import { describe, expect, it } from 'vitest';
import { neutral, DEFAULT_SETTINGS } from '../../src/types';

describe('common input contract', () => {
  it('creates independent neutral actions and a forgiving tracking timeout', () => {
    const a = neutral(); a.duck = true;
    expect(neutral()).toEqual({ lane: 0, jump: false, duck: false });
    expect(DEFAULT_SETTINGS.lossTimeout).toBe(500);
  });
});
