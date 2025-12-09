import { describe, test } from 'vitest';
import { createContainer, getDisplayOptions } from '../helpers/setup.js';
import { Display } from '../../src/ui/display.js';

describe('Display DEBUG', () => {
  test('can create container', () => {
    const container = createContainer();
    console.log('1. Container created:', container.id);
    console.log('2. In body:', document.body.contains(container));
  });

  test('can import Display class', () => {
    console.log('3. Display class:', typeof Display);
  });

  test('can create Display', () => {
    const container = createContainer();
    const options = getDisplayOptions();

    console.log('4. Before Display constructor');
    console.log('5. Container innerHTML length:', container.innerHTML.length);

    const display = new Display(container, options);

    console.log('6. After Display constructor');
    console.log('7. Container innerHTML length:', container.innerHTML.length);
    console.log('8. First 300 chars:', container.innerHTML.substring(0, 300));
  });
});
