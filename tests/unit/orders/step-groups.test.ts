import { describe, it, expect } from 'vitest';
import { firstGroup, groupOf, nextGroup } from '../../../src/modules/orders/step-groups.js';

const step = (position: number, parallel = false) => ({ position, parallel });
// 1 | 2+3 | 4 | 5+6+7
const STEPS = [step(1), step(2), step(3, true), step(4), step(5), step(6, true), step(7, true)];

describe('grupy kroków równoległych', () => {
  it.each([
    [1, [1]],
    [2, [2, 3]],
    [3, [2, 3]],
    [4, [4]],
    [6, [5, 6, 7]],
  ])('step %i belongs to group %o', (position, group) => {
    expect(groupOf(STEPS, position)).toEqual(group);
  });

  it.each([
    [1, [2, 3]],
    [3, [4]],
    [4, [5, 6, 7]],
    [7, []],
  ])('after the group of step %i comes %o', (position, next) => {
    expect(nextGroup(STEPS, position)).toEqual(next);
  });

  it('the first group starts with step 1 and its parallel steps', () => {
    expect(firstGroup([step(1), step(2, true), step(3)])).toEqual([1, 2]);
    expect(firstGroup([])).toEqual([]);
  });

  it('without parallel steps every step is its own group (old behaviour)', () => {
    const plain = [step(1), step(2), step(3)];
    expect(groupOf(plain, 2)).toEqual([2]);
    expect(nextGroup(plain, 2)).toEqual([3]);
  });

  it('an unknown step has no group', () => {
    expect(groupOf(STEPS, 99)).toEqual([]);
  });
});
