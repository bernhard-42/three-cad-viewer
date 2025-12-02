import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import { setupViewer, cleanup, createContainer } from '../helpers/setup.js';

describe('Viewer - Basic Integration', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('can create Viewer instance', () => {
    testContext = setupViewer();
    const { viewer, display } = testContext;

    expect(viewer).toBeDefined();
    expect(display).toBeDefined();
    expect(viewer.display).toBe(display);
  });

  test('Viewer has required properties', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    // Check core properties exist
    expect(viewer.renderer).toBeDefined();
    expect(viewer.cadTools).toBeDefined();
    expect(viewer.animation).toBeDefined();
  });

  test('Display has required DOM elements', () => {
    testContext = setupViewer();
    const { display, container } = testContext;

    expect(display.container).toBe(container);
    expect(display.cadView).toBeDefined();
    expect(display.cadTool).toBeDefined();
  });

  test('Feature flags are enabled', () => {
    testContext = setupViewer();
    const { displayOptions, renderOptions, viewerOptions } = testContext;

    // Verify display option feature flags are TRUE for testing
    expect(displayOptions.selectTool).toBe(true);
    expect(displayOptions.explodeTool).toBe(true);
    expect(displayOptions.zscaleTool).toBe(true);
    expect(displayOptions.zebraTool).toBe(true);
    expect(displayOptions.measurementDebug).toBe(true);
    expect(displayOptions.newTreeBehavior).toBe(true);

    // Verify viewer options exist for render()
    expect(viewerOptions.axes).toBe(true);
    expect(viewerOptions.axes0).toBe(true);
    expect(viewerOptions.grid).toEqual([true, true, true]);
    expect(viewerOptions.ortho).toBe(true);

    // Verify render options exist
    expect(renderOptions.ambientIntensity).toBeDefined();
    expect(renderOptions.defaultOpacity).toBeDefined();
  });
});
