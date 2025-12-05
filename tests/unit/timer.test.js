/**
 * Tests for Timer class
 * Target: 100% coverage
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timer } from '../../src/timer.js';

describe('Timer', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    test('creates timer with timeit=true logs start message', () => {
      const timer = new Timer('test', true);

      expect(timer.prefix).toBe('test');
      expect(timer.timeit).toBe(true);
      expect(timer.start).toBeDefined();
      expect(timer.last).toBe(timer.start);
      expect(consoleSpy).toHaveBeenCalledWith('three-cad-viewer: test:timer start');
    });

    test('creates timer with timeit=false does not log', () => {
      const timer = new Timer('silent', false);

      expect(timer.prefix).toBe('silent');
      expect(timer.timeit).toBe(false);
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('split', () => {
    test('logs split time when timeit=true', async () => {
      const timer = new Timer('test', true);
      consoleSpy.mockClear();

      // Small delay to get measurable time
      await new Promise(resolve => setTimeout(resolve, 5));

      timer.split('checkpoint');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('three-cad-viewer: test:checkpoint:timer split');
      expect(consoleSpy.mock.calls[0][0]).toContain('ms');
    });

    test('does not log when timeit=false', () => {
      const timer = new Timer('silent', false);

      timer.split('checkpoint');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test('updates last time after split', async () => {
      const timer = new Timer('test', true);
      const initialLast = timer.last;

      await new Promise(resolve => setTimeout(resolve, 5));
      timer.split('checkpoint');

      expect(timer.last).toBeGreaterThan(initialLast);
    });
  });

  describe('stop', () => {
    test('logs total time when timeit=true', async () => {
      const timer = new Timer('test', true);
      consoleSpy.mockClear();

      await new Promise(resolve => setTimeout(resolve, 5));

      timer.stop();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('three-cad-viewer: test:timer stop');
      expect(consoleSpy.mock.calls[0][0]).toContain('ms');
    });

    test('does not log when timeit=false', () => {
      const timer = new Timer('silent', false);

      timer.stop();

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    test('full timer workflow with splits', async () => {
      const timer = new Timer('workflow', true);
      consoleSpy.mockClear();

      await new Promise(resolve => setTimeout(resolve, 2));
      timer.split('step1');

      await new Promise(resolve => setTimeout(resolve, 2));
      timer.split('step2');

      await new Promise(resolve => setTimeout(resolve, 2));
      timer.stop();

      // Should have 3 log calls: split1, split2, stop
      expect(consoleSpy).toHaveBeenCalledTimes(3);
    });
  });
});
