import { it as nodeIt } from 'node:test';
import { fn, spyOn } from 'jest-mock';

export { after as afterAll, before as beforeAll, beforeEach, describe } from 'node:test';
export { expect } from 'expect';
export const vi = { fn, spyOn };
export const it = nodeIt;

export function each<const Args extends readonly unknown[]>(rows: readonly Args[]) {
  return (name: string, test: (...args: [...Args]) => Promise<void> | void) => {
    for (const [index, row] of rows.entries()) {
      nodeIt(`${name} [${index + 1}]`, () => test(...row));
    }
  };
}

export function cases<T>(rows: readonly T[]) {
  return (name: string, test: (value: T) => Promise<void> | void) => {
    for (const [index, row] of rows.entries()) {
      nodeIt(`${name} [${index + 1}]`, () => test(row));
    }
  };
}
