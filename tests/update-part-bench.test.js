/**
 * Verification & benchmark tests for Viewer.updatePart()
 *
 * Compares updatePart (in-place buffer update) against removePart+addPart
 * (full dispose/recreate) for correctness and timing.
 *
 * Run:  npx vitest run tests/update-part-bench.test.js
 */

import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from './helpers/setup.js';
import { loadExample } from './helpers/snapshot.js';

// ---------------------------------------------------------------------------
// Test-data helpers
// ---------------------------------------------------------------------------

/**
 * Create a solid box part with parameterised height (Z extent).
 * The box spans [offset, offset+1] x [-0.5, 0.5] x [-0.5, height-0.5].
 */
function createBox(name, offset = 2, height = 1) {
  const zMin = -0.5;
  const zMax = zMin + height;
  return {
    version: 3,
    type: 'shapes',
    subtype: 'solid',
    name,
    shape: {
      vertices: [
        // face -X  (4 verts)
        offset, -0.5, zMin, offset, -0.5, zMax, offset, 0.5, zMin, offset, 0.5, zMax,
        // face +X  (4 verts)
        offset + 1, -0.5, zMin, offset + 1, -0.5, zMax, offset + 1, 0.5, zMin, offset + 1, 0.5, zMax,
        // face -Y  (4 verts)
        offset, -0.5, zMin, offset + 1, -0.5, zMin, offset, -0.5, zMax, offset + 1, -0.5, zMax,
        // face +Y  (4 verts)
        offset, 0.5, zMin, offset + 1, 0.5, zMin, offset, 0.5, zMax, offset + 1, 0.5, zMax,
        // face -Z  (4 verts)
        offset, -0.5, zMin, offset + 1, -0.5, zMin, offset, 0.5, zMin, offset + 1, 0.5, zMin,
        // face +Z  (4 verts)
        offset, -0.5, zMax, offset + 1, -0.5, zMax, offset, 0.5, zMax, offset + 1, 0.5, zMax,
      ],
      triangles: [
        1, 2, 0, 1, 3, 2,       // -X
        5, 4, 6, 5, 6, 7,       // +X
        11, 8, 9, 11, 10, 8,    // -Y
        15, 13, 12, 15, 12, 14, // +Y
        19, 16, 17, 19, 18, 16, // -Z
        23, 21, 20, 23, 20, 22, // +Z
      ],
      normals: [
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      ],
      edges: [
        offset, -0.5, zMin, offset, -0.5, zMax,
        offset, -0.5, zMax, offset, 0.5, zMax,
        offset, 0.5, zMin, offset, 0.5, zMax,
        offset, -0.5, zMin, offset, 0.5, zMin,
        offset + 1, -0.5, zMin, offset + 1, -0.5, zMax,
        offset + 1, -0.5, zMax, offset + 1, 0.5, zMax,
        offset + 1, 0.5, zMin, offset + 1, 0.5, zMax,
        offset + 1, -0.5, zMin, offset + 1, 0.5, zMin,
      ],
      obj_vertices: [
        offset, -0.5, zMin, offset, -0.5, zMax,
        offset, 0.5, zMin, offset, 0.5, zMax,
        offset + 1, -0.5, zMin, offset + 1, -0.5, zMax,
        offset + 1, 0.5, zMin, offset + 1, 0.5, zMax,
      ],
      face_types: [0, 0, 0, 0, 0, 0],
      edge_types: [0, 0, 0, 0, 0, 0, 0, 0],
      triangles_per_face: [2, 2, 2, 2, 2, 2],
      segments_per_edge: [1, 1, 1, 1, 1, 1, 1, 1],
    },
    state: [1, 1],
    color: '#ff0000',
    alpha: 1.0,
    texture: null,
    loc: [[0, 0, 0], [0, 0, 0, 1]],
    renderback: false,
    accuracy: null,
    bb: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const N = 5; // number of test parts to add

function addTestParts(viewer, n = N) {
  const paths = [];
  for (let i = 0; i < n; i++) {
    const name = `BenchPart_${i}`;
    const path = viewer.addPart('/Group', createBox(name, 2 + i * 2, 1));
    paths.push(path);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Correctness tests
// ---------------------------------------------------------------------------

describe('Viewer.updatePart – correctness', () => {
  let ctx;

  afterEach(() => {
    if (ctx) {
      cleanup(ctx);
      ctx = null;
    }
  });

  test('throws if viewer not rendered', () => {
    ctx = setupViewer();
    expect(() => ctx.viewer.updatePart('/x', createBox('x'))).toThrow(
      'Viewer.render() must be called',
    );
  });

  test('throws if path does not exist', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    expect(() => ctx.viewer.updatePart('/Group/NoSuch', createBox('NoSuch'))).toThrow(
      'Part not found',
    );
  });

  test('updates vertex positions in place (same vertex count)', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U1', 2, 1));
    const group = ctx.viewer.rendered.nestedGroup.groups[path];
    const geom = group.shapeGeometry;

    // Read original Z values
    const posBefore = new Float32Array(geom.getAttribute('position').array);

    // Update with height=3 (same vertex count, different positions)
    ctx.viewer.updatePart(path, createBox('U1', 2, 3));

    const posAfter = geom.getAttribute('position').array;
    // Positions must have changed
    let changed = false;
    for (let i = 0; i < posBefore.length; i++) {
      if (posBefore[i] !== posAfter[i]) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });

  test('updates edge geometry', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U2', 2, 1));
    const group = ctx.viewer.rendered.nestedGroup.groups[path];

    // Edges should exist
    expect(group.edges).not.toBeNull();

    // Capture edge data before update
    let edgeBefore;
    if (group.edges.type === 'LineSegments2') {
      const attr = group.edges.geometry.getAttribute('instanceStart');
      edgeBefore = attr ? new Float32Array(attr.array) : null;
    } else {
      const attr = group.edges.geometry.getAttribute('position');
      edgeBefore = attr ? new Float32Array(attr.array) : null;
    }

    // Update with different height
    ctx.viewer.updatePart(path, createBox('U2', 2, 5));

    // Capture edge data after update
    let edgeAfter;
    if (group.edges.type === 'LineSegments2') {
      const attr = group.edges.geometry.getAttribute('instanceStart');
      edgeAfter = attr ? new Float32Array(attr.array) : null;
    } else {
      const attr = group.edges.geometry.getAttribute('position');
      edgeAfter = attr ? new Float32Array(attr.array) : null;
    }

    // Edge data should have changed
    if (edgeBefore && edgeAfter) {
      let edgeChanged = false;
      for (let i = 0; i < Math.min(edgeBefore.length, edgeAfter.length); i++) {
        if (edgeBefore[i] !== edgeAfter[i]) { edgeChanged = true; break; }
      }
      expect(edgeChanged).toBe(true);
    }
  });

  test('syncs this.shapes data', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U3', 2, 1));

    const newPart = createBox('U3', 2, 7);
    newPart.color = '#00ff00';
    newPart.alpha = 0.5;
    ctx.viewer.updatePart(path, newPart);

    // Find the entry in this.shapes
    const groupShapes = ctx.viewer.shapes;
    const entry = groupShapes.parts.find((p) => p.name === 'U3');
    expect(entry).toBeDefined();
    expect(entry.shape).toBe(newPart.shape);
    expect(entry.color).toBe('#00ff00');
    expect(entry.alpha).toBe(0.5);
  });

  test('updates bounding box when geometry grows', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U4', 2, 1));
    const bbMaxBefore = ctx.viewer.bb_max;

    // Make the box much taller
    ctx.viewer.updatePart(path, createBox('U4', 2, 20));

    expect(ctx.viewer.bb_max).toBeGreaterThan(bbMaxBefore);
  });

  test('invalidates explode cache', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U5', 2, 1));
    ctx.viewer.updatePart(path, createBox('U5', 2, 3));

    expect(ctx.viewer.expandedNestedGroup).toBeNull();
    expect(ctx.viewer.expandedTree).toBeNull();
  });

  test('multiple sequential updates work', async () => {
    ctx = setupViewer();
    const data = await loadExample('box1');
    ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

    const path = ctx.viewer.addPart('/Group', createBox('U6', 2, 1));

    for (let h = 2; h <= 5; h++) {
      ctx.viewer.updatePart(path, createBox('U6', 2, h));
    }

    // Final geometry should reflect height=5
    const group = ctx.viewer.rendered.nestedGroup.groups[path];
    const pos = group.shapeGeometry.getAttribute('position').array;
    // zMax should be 4.5 (= -0.5 + 5)
    let foundZMax = -Infinity;
    for (let i = 2; i < pos.length; i += 3) {
      if (pos[i] > foundZMax) foundZMax = pos[i];
    }
    expect(foundZMax).toBeCloseTo(4.5, 4);
  });
});

// ---------------------------------------------------------------------------
// Benchmark: updatePart (by step level) vs removePart+addPart
// ---------------------------------------------------------------------------

describe('Viewer.updatePart – benchmark', () => {
  let ctx;

  afterEach(() => {
    if (ctx) {
      cleanup(ctx);
      ctx = null;
    }
  });

  // Run a single part-count scenario, return { label -> ms } for one update pass
  function runScenario(viewer, paths, n) {
    const ITERS = 3;

    const timings = {};

    // Warm up
    for (const p of paths) {
      viewer.updatePart(p, createBox(p.split('/').pop(), parseOffset(p), 2));
    }

    // --- skipBounds batch (what real callers should use) ---
    {
      const t0 = performance.now();
      for (let iter = 0; iter < ITERS; iter++) {
        const h = 1 + (iter % 3);
        for (const p of paths) {
          viewer.updatePart(p, createBox(p.split('/').pop(), parseOffset(p), h), { skipBounds: true });
        }
        viewer.updateBounds();
      }
      timings['updatePart (batched)'] = (performance.now() - t0) / ITERS;
    }

    // --- per-call bounds (no batching) ---
    {
      const t0 = performance.now();
      for (let iter = 0; iter < ITERS; iter++) {
        const h = 1 + (iter % 3);
        for (const p of paths) {
          viewer.updatePart(p, createBox(p.split('/').pop(), parseOffset(p), h));
        }
      }
      timings['updatePart (unbatched)'] = (performance.now() - t0) / ITERS;
    }

    // --- remove+add ---
    {
      const t1 = performance.now();
      for (let iter = 0; iter < ITERS; iter++) {
        const h = 1 + (iter % 3);
        for (const p of paths) {
          const name = p.split('/').pop();
          const offset = parseOffset(p);
          viewer.removePart(p);
          viewer.addPart('/Group', createBox(name, offset, h));
        }
      }
      timings['remove+add'] = (performance.now() - t1) / ITERS;
    }

    return timings;
  }

  test('timing comparison: 10, 30, 50 parts', async () => {
    const partCounts = [10, 30, 50];
    const allResults = {}; // { N -> { label -> ms } }

    for (const n of partCounts) {
      ctx = setupViewer();
      const data = await loadExample('box1');
      ctx.viewer.render(data, ctx.renderOptions, ctx.viewerOptions);

      const paths = addTestParts(ctx.viewer, n);
      allResults[n] = runScenario(ctx.viewer, paths, n);

      cleanup(ctx);
      ctx = null;
    }

    // Collect all method labels (rows)
    const labels = Object.keys(allResults[partCounts[0]]);

    // --- Print comparison table ---
    const colW = 12;
    const labelW = 28;
    const header = partCounts.map((n) => `${n} Parts`.padStart(colW)).join(' │');

    console.log(`\n  updatePart benchmark  (avg ms per pass, 3 iterations)`);
    console.log(`  ┌${'─'.repeat(labelW)}┬${ partCounts.map(() => '─'.repeat(colW)).join('─┬─') }─┐`);
    console.log(`  │ ${'Method'.padEnd(labelW - 1)}│${header} │`);
    console.log(`  ├${'─'.repeat(labelW)}┼${ partCounts.map(() => '─'.repeat(colW)).join('─┼─') }─┤`);

    for (const label of labels) {
      const cols = partCounts.map((n) => {
        const ms = allResults[n][label];
        return `${ms.toFixed(2)} ms`.padStart(colW);
      }).join(' │');
      console.log(`  │ ${label.padEnd(labelW - 1)}│${cols} │`);
    }

    // Speedup row (batched vs remove+add)
    console.log(`  ├${'─'.repeat(labelW)}┼${ partCounts.map(() => '─'.repeat(colW)).join('─┼─') }─┤`);
    const speedupCols = partCounts.map((n) => {
      const ra = allResults[n]['remove+add'];
      const batched = allResults[n]['updatePart (batched)'];
      return `${(ra / batched).toFixed(1)}x`.padStart(colW);
    }).join(' │');
    console.log(`  │ ${'Speedup (batch vs r+a)'.padEnd(labelW - 1)}│${speedupCols} │`);

    console.log(`  └${'─'.repeat(labelW)}┴${ partCounts.map(() => '─'.repeat(colW)).join('─┴─') }─┘`);

    // Reference numbers
    console.log(`\n  Reference (user's benchmark):`);
    console.log(`  ┌${'─'.repeat(labelW)}┬${ partCounts.map(() => '─'.repeat(colW)).join('─┬─') }─┐`);
    console.log(`  │ ${'Method'.padEnd(labelW - 1)}│${ partCounts.map((n) => `${n} Parts`.padStart(colW)).join(' │') } │`);
    console.log(`  ├${'─'.repeat(labelW)}┼${ partCounts.map(() => '─'.repeat(colW)).join('─┼─') }─┤`);
    const refDirect =  { 10: '~1',   30: '~2',    50: '~4' };
    const refRemove =  { 10: '~60',  30: '~690',  50: '~1020' };
    const refDirectCols = partCounts.map((n) => `${refDirect[n]} ms`.padStart(colW)).join(' │');
    const refRemoveCols = partCounts.map((n) => `${refRemove[n]} ms`.padStart(colW)).join(' │');
    console.log(`  │ ${'Direct Buffer'.padEnd(labelW - 1)}│${refDirectCols} │`);
    console.log(`  │ ${'Remove+Add'.padEnd(labelW - 1)}│${refRemoveCols} │`);
    console.log(`  └${'─'.repeat(labelW)}┴${ partCounts.map(() => '─'.repeat(colW)).join('─┴─') }─┘\n`);

    // Sanity checks
    for (const n of partCounts) {
      for (const ms of Object.values(allResults[n])) {
        expect(ms).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the offset from a BenchPart path like "/Group/BenchPart_2" */
function parseOffset(path) {
  const match = path.match(/BenchPart_(\d+)/);
  if (match) return 2 + parseInt(match[1], 10) * 2;
  return 2;
}
