/**
 * Deep comparison of two values with floating-point tolerance
 *
 * @param {*} actual - The actual value
 * @param {*} expected - The expected value
 * @param {number} tolerance - Tolerance for floating-point comparison (default: 1e-6)
 * @returns {boolean} - True if values are approximately equal
 */
export function almostEqual(actual, expected, tolerance = 1e-6) {
  // Handle null/undefined
  if (actual === null && expected === null) return true;
  if (actual === undefined && expected === undefined) return true;
  if (actual === null || expected === null) return false;
  if (actual === undefined || expected === undefined) return false;

  // Get types
  const actualType = typeof actual;
  const expectedType = typeof expected;

  // Types must match
  if (actualType !== expectedType) return false;

  // Handle numbers with tolerance
  if (actualType === 'number') {
    // Handle special cases
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    if (Number.isNaN(actual) || Number.isNaN(expected)) return false;
    if (!Number.isFinite(actual) && !Number.isFinite(expected)) {
      return actual === expected; // Both Infinity or -Infinity
    }
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;

    // Normal comparison with tolerance
    return Math.abs(actual - expected) <= tolerance;
  }

  // Handle primitives (string, boolean)
  if (actualType === 'string' || actualType === 'boolean') {
    return actual === expected;
  }

  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;

    for (let i = 0; i < actual.length; i++) {
      if (!almostEqual(actual[i], expected[i], tolerance)) {
        return false;
      }
    }
    return true;
  }

  // Handle typed arrays (Float32Array, Uint32Array, etc.)
  if (ArrayBuffer.isView(actual) && ArrayBuffer.isView(expected)) {
    if (actual.constructor.name !== expected.constructor.name) return false;
    if (actual.length !== expected.length) return false;

    for (let i = 0; i < actual.length; i++) {
      if (!almostEqual(actual[i], expected[i], tolerance)) {
        return false;
      }
    }
    return true;
  }

  // Handle objects
  if (actualType === 'object') {
    // Check constructors match
    if (actual.constructor.name !== expected.constructor.name) return false;

    // Get keys
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    // Check key count
    if (actualKeys.length !== expectedKeys.length) return false;

    // Check all keys match
    for (let i = 0; i < actualKeys.length; i++) {
      if (actualKeys[i] !== expectedKeys[i]) return false;
    }

    // Check all values match
    for (const key of actualKeys) {
      if (!almostEqual(actual[key], expected[key], tolerance)) {
        return false;
      }
    }
    return true;
  }

  // Fallback to strict equality
  return actual === expected;
}

/**
 * Generate a detailed diff report for debugging
 *
 * @param {*} actual - The actual value
 * @param {*} expected - The expected value
 * @param {number} tolerance - Tolerance for floating-point comparison
 * @param {string} path - Current path in object (for recursion)
 * @returns {string[]} - Array of difference descriptions
 */
export function almostEqualDiff(actual, expected, tolerance = 1e-6, path = 'root') {
  const diffs = [];

  // Handle null/undefined
  if (actual === null && expected === null) return diffs;
  if (actual === undefined && expected === undefined) return diffs;
  if (actual === null) {
    diffs.push(`${path}: expected null, got ${typeof expected}`);
    return diffs;
  }
  if (expected === null) {
    diffs.push(`${path}: expected ${typeof actual}, got null`);
    return diffs;
  }
  if (actual === undefined) {
    diffs.push(`${path}: expected undefined, got ${typeof expected}`);
    return diffs;
  }
  if (expected === undefined) {
    diffs.push(`${path}: expected ${typeof actual}, got undefined`);
    return diffs;
  }

  // Get types
  const actualType = typeof actual;
  const expectedType = typeof expected;

  // Types must match
  if (actualType !== expectedType) {
    diffs.push(`${path}: type mismatch (expected ${expectedType}, got ${actualType})`);
    return diffs;
  }

  // Handle numbers with tolerance
  if (actualType === 'number') {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return diffs;
    if (Number.isNaN(actual)) {
      diffs.push(`${path}: expected ${expected}, got NaN`);
      return diffs;
    }
    if (Number.isNaN(expected)) {
      diffs.push(`${path}: expected NaN, got ${actual}`);
      return diffs;
    }

    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
      diffs.push(`${path}: ${actual} !== ${expected} (diff: ${diff.toExponential(2)}, tolerance: ${tolerance})`);
    }
    return diffs;
  }

  // Handle primitives
  if (actualType === 'string' || actualType === 'boolean') {
    if (actual !== expected) {
      diffs.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return diffs;
  }

  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      diffs.push(`${path}: array length mismatch (expected ${expected.length}, got ${actual.length})`);
      return diffs;
    }

    for (let i = 0; i < actual.length; i++) {
      const subDiffs = almostEqualDiff(actual[i], expected[i], tolerance, `${path}[${i}]`);
      diffs.push(...subDiffs);
    }
    return diffs;
  }

  // Handle typed arrays
  if (ArrayBuffer.isView(actual) && ArrayBuffer.isView(expected)) {
    if (actual.constructor.name !== expected.constructor.name) {
      diffs.push(`${path}: typed array type mismatch (expected ${expected.constructor.name}, got ${actual.constructor.name})`);
      return diffs;
    }
    if (actual.length !== expected.length) {
      diffs.push(`${path}: typed array length mismatch (expected ${expected.length}, got ${actual.length})`);
      return diffs;
    }

    for (let i = 0; i < actual.length; i++) {
      const subDiffs = almostEqualDiff(actual[i], expected[i], tolerance, `${path}[${i}]`);
      diffs.push(...subDiffs);

      // Limit output for large arrays
      if (diffs.length > 10) {
        diffs.push(`${path}: ... (${actual.length - i - 1} more elements not checked)`);
        break;
      }
    }
    return diffs;
  }

  // Handle objects
  if (actualType === 'object') {
    // Check constructors
    if (actual.constructor.name !== expected.constructor.name) {
      diffs.push(`${path}: constructor mismatch (expected ${expected.constructor.name}, got ${actual.constructor.name})`);
      return diffs;
    }

    // Get keys
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    // Check for missing/extra keys
    const missingKeys = expectedKeys.filter(k => !actualKeys.includes(k));
    const extraKeys = actualKeys.filter(k => !expectedKeys.includes(k));

    if (missingKeys.length > 0) {
      diffs.push(`${path}: missing keys: ${missingKeys.join(', ')}`);
    }
    if (extraKeys.length > 0) {
      diffs.push(`${path}: extra keys: ${extraKeys.join(', ')}`);
    }

    // Check common keys
    const commonKeys = actualKeys.filter(k => expectedKeys.includes(k));
    for (const key of commonKeys) {
      const subDiffs = almostEqualDiff(actual[key], expected[key], tolerance, `${path}.${key}`);
      diffs.push(...subDiffs);
    }
    return diffs;
  }

  // Fallback
  if (actual !== expected) {
    diffs.push(`${path}: ${actual} !== ${expected}`);
  }
  return diffs;
}

/**
 * Vitest custom matcher for almost equal comparison
 * Usage: expect(actual).toAlmostEqual(expected)
 */
export function toAlmostEqual(actual, expected, tolerance = 1e-6) {
  const equal = almostEqual(actual, expected, tolerance);

  if (equal) {
    return {
      pass: true,
      message: () => `Expected values not to be almost equal (tolerance: ${tolerance})`,
    };
  } else {
    const diffs = almostEqualDiff(actual, expected, tolerance);
    const diffReport = diffs.slice(0, 20).join('\n  ');
    const truncated = diffs.length > 20 ? `\n  ... (${diffs.length - 20} more differences)` : '';

    return {
      pass: false,
      message: () => `Expected values to be almost equal (tolerance: ${tolerance}):\n  ${diffReport}${truncated}`,
    };
  }
}
