/**
 * Unit tests for Slider class
 * Target: 90%+ coverage
 */

import { describe, test, expect, afterEach, vi } from 'vitest';
import { Slider } from '../../src/ui/slider.js';

// Helper to create slider DOM elements
function createSliderDOM(index) {
  const container = document.createElement('div');

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = `tcv_sld_value_${index}`;
  container.appendChild(slider);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = `tcv_inp_value_${index}`;
  container.appendChild(input);

  document.body.appendChild(container);
  return container;
}

function cleanupContainer(container) {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

/**
 * Create a mock event with the slider element as target
 */
function createSliderEvent(slider, value) {
  slider.slider.value = String(value);
  return { target: slider.slider };
}

/**
 * Create a mock event with the input element as target
 */
function createInputEvent(slider, value) {
  slider.input.value = String(value);
  return { target: slider.input };
}

describe('Slider - Constructor', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('creates plane-type slider', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, { handler });

    expect(slider.type).toBe('plane');
    expect(slider.index).toBe(1);
    expect(slider.handler).toBe(handler);
    expect(slider.percentage).toBe(false);

    slider.dispose();
  });

  test('creates non-plane slider', () => {
    container = createSliderDOM('ambientlight');
    const handler = vi.fn();

    const slider = new Slider('ambientlight', 0, 100, container, { handler });

    expect(slider.type).toBe('ambientlight');
    expect(slider.index).toBeUndefined();

    slider.dispose();
  });

  test('sets percentage option', () => {
    container = createSliderDOM('opacity');
    const handler = vi.fn();

    const slider = new Slider('opacity', 0, 100, container, {
      handler,
      percentage: true,
    });

    expect(slider.percentage).toBe(true);

    slider.dispose();
  });

  test('sets notifyCallback option', () => {
    container = createSliderDOM('plane2');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('plane2', 0, 100, container, {
      handler,
      notifyCallback,
    });

    expect(slider.notifyCallback).toBe(notifyCallback);

    slider.dispose();
  });

  test('sets isReadyCheck option', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();
    const isReadyCheck = vi.fn().mockReturnValue(true);

    const slider = new Slider('test', 0, 100, container, {
      handler,
      isReadyCheck,
    });

    expect(slider.isReadyCheck).toBe(isReadyCheck);

    slider.dispose();
  });

  test('sets onSetSlider option', () => {
    container = createSliderDOM('plane3');
    const handler = vi.fn();
    const onSetSlider = vi.fn();

    const slider = new Slider('plane3', -10, 10, container, {
      handler,
      onSetSlider,
    });

    expect(slider.onSetSlider).toBe(onSetSlider);

    slider.dispose();
  });

  test('throws error if slider element not found', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    expect(() => {
      new Slider('missing', 0, 100, container, { handler: vi.fn() });
    }).toThrow('Slider elements not found for index "missing" in container');
  });

  test('sets min, max and initial value', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', -50, 50, container, { handler });

    expect(slider.slider.min).toBe('-50');
    expect(slider.slider.max).toBe('50');
    expect(slider.input.value).toBe('50');

    slider.dispose();
  });
});

describe('Slider - sliderChange', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('updates input and calls handler for plane slider', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, {
      handler,
      notifyCallback,
    });

    // Simulate slider change
    slider.sliderChange(createSliderEvent(slider, 50));

    expect(slider.input.value).toBe('50');
    expect(handler).toHaveBeenCalledWith(1, '50');
    expect(notifyCallback).toHaveBeenCalledWith({ clip_slider_0: 50 }, true);

    slider.dispose();
  });

  test('updates input and calls handler for non-plane slider', () => {
    container = createSliderDOM('ambientlight');
    const handler = vi.fn();

    const slider = new Slider('ambientlight', 0, 100, container, { handler });

    slider.sliderChange(createSliderEvent(slider, 75));

    expect(slider.input.value).toBe('75');
    expect(handler).toHaveBeenCalledWith(75);

    slider.dispose();
  });

  test('applies percentage conversion', () => {
    container = createSliderDOM('opacity');
    const handler = vi.fn();

    const slider = new Slider('opacity', 0, 100, container, {
      handler,
      percentage: true,
    });

    slider.sliderChange(createSliderEvent(slider, 50));

    expect(handler).toHaveBeenCalledWith(0.5);

    slider.dispose();
  });

  test('checks isReadyCheck before calling handler', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();
    const isReadyCheck = vi.fn().mockReturnValue(false);

    const slider = new Slider('test', 0, 100, container, {
      handler,
      isReadyCheck,
    });

    slider.sliderChange(createSliderEvent(slider, 50));

    expect(isReadyCheck).toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();

    slider.dispose();
  });

  test('calls handler when isReadyCheck returns true', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();
    const isReadyCheck = vi.fn().mockReturnValue(true);

    const slider = new Slider('test', 0, 100, container, {
      handler,
      isReadyCheck,
    });

    slider.sliderChange(createSliderEvent(slider, 50));

    expect(handler).toHaveBeenCalledWith(50);

    slider.dispose();
  });

  test('rounds value to 3 decimal places', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.sliderChange(createSliderEvent(slider, 33.33333));

    expect(slider.input.value).toBe('33.333');

    slider.dispose();
  });
});

describe('Slider - inputChange', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('updates slider and calls handler', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.inputChange(createInputEvent(slider, 75));

    expect(slider.slider.value).toBe('75');
    expect(slider.input.value).toBe('75');
    expect(handler).toHaveBeenCalledWith(75);

    slider.dispose();
  });

  test('clamps value to max', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.inputChange(createInputEvent(slider, 150));

    expect(slider.slider.value).toBe('100');
    expect(slider.input.value).toBe('100');

    slider.dispose();
  });

  test('clamps value to min', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.inputChange(createInputEvent(slider, -50));

    expect(slider.slider.value).toBe('0');
    expect(slider.input.value).toBe('0');

    slider.dispose();
  });

  test('notifies for plane slider', () => {
    container = createSliderDOM('plane2');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('plane2', 0, 100, container, {
      handler,
      notifyCallback,
    });

    slider.inputChange(createInputEvent(slider, 60));

    expect(notifyCallback).toHaveBeenCalledWith({ clip_slider_1: 60 }, true);

    slider.dispose();
  });
});

describe('Slider - setLimits', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('sets symmetric range around zero', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, { handler });

    slider.setLimits(50);

    expect(slider.slider.min).toBe('-50');
    expect(slider.slider.max).toBe('50');
    // Note: setLimits only sets min/max/step, not the value

    slider.dispose();
  });

  test('calculates appropriate step size for small limits', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, { handler });

    slider.setLimits(0.5); // 2 * 0.5 = 1, log10(1) = 0, step = 10^-3 = 0.001

    expect(slider.slider.step).toBe('0.001');

    slider.dispose();
  });

  test('calculates appropriate step size for large limits', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, { handler });

    slider.setLimits(500); // 2 * 500 = 1000, log10(1000) = 3, step = 10^0 = 1

    expect(slider.slider.step).toBe('1');

    slider.dispose();
  });
});

describe('Slider - getValue', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('returns current value as float', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });
    slider.input.value = '42.5';

    expect(slider.getValue()).toBe(42.5);

    slider.dispose();
  });
});

describe('Slider - setValue', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('sets value and calls handler', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.setValue(60);

    expect(slider.slider.value).toBe('60');
    expect(slider.input.value).toBe('60');
    expect(handler).toHaveBeenCalledWith(60);

    slider.dispose();
  });

  test('clamps value to range', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.setValue(200);

    expect(slider.input.value).toBe('100');

    slider.dispose();
  });

  test('notifies with notify=true (default)', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, {
      handler,
      notifyCallback,
    });

    slider.setValue(50);

    expect(notifyCallback).toHaveBeenCalledWith({ clip_slider_0: 50 }, true);

    slider.dispose();
  });

  test('respects notify=false', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, {
      handler,
      notifyCallback,
    });

    slider.setValue(50, false);

    expect(notifyCallback).toHaveBeenCalledWith({ clip_slider_0: 50 }, false);

    slider.dispose();
  });
});

describe('Slider - setValueFromState', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('updates UI without calling handler', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });
    handler.mockClear(); // Clear constructor calls

    slider.setValueFromState(75);

    expect(slider.slider.value).toBe('75');
    expect(slider.input.value).toBe('75');
    expect(handler).not.toHaveBeenCalled();

    slider.dispose();
  });

  test('clamps value to range', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 10, 90, container, { handler });

    slider.setValueFromState(5);
    expect(slider.input.value).toBe('10');

    slider.setValueFromState(100);
    expect(slider.input.value).toBe('90');

    slider.dispose();
  });
});

describe('Slider - _notify', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('does not notify for non-plane type', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();
    const notifyCallback = vi.fn();

    const slider = new Slider('test', 0, 100, container, {
      handler,
      notifyCallback,
    });

    slider._notify(50);

    expect(notifyCallback).not.toHaveBeenCalled();

    slider.dispose();
  });

  test('does not notify without callback', () => {
    container = createSliderDOM('plane1');
    const handler = vi.fn();

    const slider = new Slider('plane1', 0, 100, container, { handler });

    // Should not throw
    expect(() => slider._notify(50)).not.toThrow();

    slider.dispose();
  });
});

describe('Slider - dispose', () => {
  let container;

  afterEach(() => {
    cleanupContainer(container);
  });

  test('removes event listeners', () => {
    container = createSliderDOM('test');
    const handler = vi.fn();

    const slider = new Slider('test', 0, 100, container, { handler });

    slider.dispose();

    expect(slider.slider.oninput).toBeNull();
  });
});
