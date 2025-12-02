import { describe, test } from 'vitest';

describe('HTML Import Test', () => {
  test('can import HTML file', async () => {
    const template = await import('../../src/index.html');
    console.log('Template type:', typeof template);
    console.log('Template default type:', typeof template.default);
    console.log('Template default length:', template.default?.length || 0);
    console.log('First 200 chars:', template.default?.substring(0, 200) || 'EMPTY');
  });
});
