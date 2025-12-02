import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample } from '../helpers/snapshot.js';
import { consoleSpy } from '../setup.js';

describe('Console Monitoring', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * These tests verify expected console behavior and catch regressions
   * where new warnings/errors appear
   */

  test('viewer initialization logs debug messages', () => {
    testContext = setupViewer();

    // Verify expected debug messages
    expect(consoleSpy.debug).toHaveBeenCalledWith(
      'three-cad-viewer: WebGL Renderer created'
    );

    // No errors should occur during initialization
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  test('rendering box1 example produces no errors', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Rendering should complete without errors
    expect(consoleSpy.error).not.toHaveBeenCalled();

    // Expected debug messages
    expect(consoleSpy.debug).toHaveBeenCalledWith(
      'three-cad-viewer: Change listener registered'
    );
  });

  test('verify no unexpected warnings in example loading', async () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    // Load several examples and verify no warnings
    const examples = ['box1', 'vertices', 'edges'];

    for (const exampleName of examples) {
      consoleSpy.warn.mockClear();
      const data = await loadExample(exampleName);

      // Loading examples should not produce warnings
      expect(consoleSpy.warn).not.toHaveBeenCalled();

      expect(data).toBeDefined();
      expect(data.version).toBeDefined();
    }
  });

  test('console spy captures all levels', () => {
    // Verify our spy setup works
    console.debug('test debug');
    console.log('test log');
    console.info('test info');
    console.warn('test warn');
    console.error('test error');

    expect(consoleSpy.debug).toHaveBeenCalledWith('test debug');
    expect(consoleSpy.log).toHaveBeenCalledWith('test log');
    expect(consoleSpy.info).toHaveBeenCalledWith('test info');
    expect(consoleSpy.warn).toHaveBeenCalledWith('test warn');
    expect(consoleSpy.error).toHaveBeenCalledWith('test error');

    // Clear intentional test calls so afterEach doesn't report them
    consoleSpy.error.mockClear();
    consoleSpy.warn.mockClear();
  });

  test('detect regression if new errors appear', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Clear any initialization calls
    consoleSpy.error.mockClear();
    consoleSpy.warn.mockClear();

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // This test will FAIL if new errors/warnings are introduced
    // Acting as a regression detector
    const errorCalls = consoleSpy.error.mock.calls;
    const warnCalls = consoleSpy.warn.mock.calls;

    if (errorCalls.length > 0) {
      console.log('\n❌ Unexpected errors detected:');
      errorCalls.forEach((call, i) => {
        console.log(`  ${i + 1}.`, ...call);
      });
    }

    if (warnCalls.length > 0) {
      console.log('\n⚠️  Unexpected warnings detected:');
      warnCalls.forEach((call, i) => {
        console.log(`  ${i + 1}.`, ...call);
      });
    }

    // Expect zero errors and warnings during normal rendering
    expect(errorCalls.length).toBe(0);
    expect(warnCalls.length).toBe(0);
  });
});
