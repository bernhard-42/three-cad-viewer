import { describe, test, expect } from 'vitest';

describe('Vitest Setup', () => {
  test('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });

  test('happy-dom provides DOM', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello, World!';
    expect(div.textContent).toBe('Hello, World!');
  });
});
