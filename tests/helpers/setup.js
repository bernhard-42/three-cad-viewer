import { Display } from '../../src/display.js';
import { Viewer } from '../../src/viewer.js';

/**
 * Create a minimal DOM container for testing
 */
export function createContainer(id = 'test-container') {
  const container = document.createElement('div');
  container.id = id;
  container.style.width = '800px';
  container.style.height = '600px';
  document.body.appendChild(container);
  return container;
}

/**
 * Clean up container after tests
 */
export function cleanupContainer(container) {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

/**
 * Display/Viewer constructor options
 * (Following pattern from index.html line 185-210)
 * All feature flags set to TRUE for maximum code coverage
 */
export function getDisplayOptions() {
  return {
    cadWidth: 800,
    height: 600,
    treeWidth: 250,
    theme: 'light',
    pinning: false,
    glass: false,
    tools: true,
    keymap: { shift: 'shiftKey', ctrl: 'ctrlKey', meta: 'metaKey' },
    newTreeBehavior: true,
    // Feature flags - ALL TRUE for testing all code paths
    measureTools: true,
    selectTool: true,
    explodeTool: true,      // Enable for testing
    zscaleTool: true,       // Enable for testing
    zebraTool: true,        // Enable for testing (used by Display)
    measurementDebug: true, // Enable to mock Python backend
  };
}

/**
 * Render options (for viewer.render())
 * (Following pattern from index.html line 212-220)
 */
export function getRenderOptions() {
  return {
    ambientIntensity: 1.0,
    directIntensity: 1.1,
    metalness: 0.3,
    roughness: 0.65,
    edgeColor: 0x707070,
    defaultOpacity: 0.5,
    normalLen: 0,
  };
}

/**
 * Viewer options (for viewer.render())
 * (Following pattern from index.html line 222-252)
 */
export function getViewerOptions() {
  return {
    ortho: true,
    up: 'Z',           // Camera up direction: 'Y', 'Z', or 'L' (legacy)
    ticks: 5,
    transparent: false,
    blackEdges: false,
    axes: true,        // Enable for testing
    axes0: true,       // Enable for testing
    grid: [true, true, true],  // Enable for testing
    timeit: false,
    clipIntersection: false,
    clipPlaneHelpers: false,
    rotateSpeed: 1.0,
    zoomSpeed: 0.5,
    panSpeed: 0.5,
    collapse: 0,
  };
}

/**
 * Create a Display instance for testing
 * Quick & dirty - doesn't perfectly mock everything
 */
export function setupDisplay(displayOptions = {}) {
  const container = createContainer();
  const opts = { ...getDisplayOptions(), ...displayOptions };
  const display = new Display(container, opts);
  return { display, container, displayOptions: opts };
}

/**
 * Create a Viewer instance for testing
 * Quick & dirty - minimal setup (WebGL mocked globally)
 * Returns viewer with render/viewer options for later use
 */
export function setupViewer(displayOptions = {}, renderOptions = {}, viewerOptions = {}) {
  const { display, container, displayOptions: displayOpts } = setupDisplay(displayOptions);

  // Minimal notification callback
  const notifyCallback = () => {};

  const viewer = new Viewer(display, displayOpts, notifyCallback);

  // Prepare render and viewer options (for use with viewer.render())
  const renderOpts = { ...getRenderOptions(), ...renderOptions };
  const viewerOpts = { ...getViewerOptions(), ...viewerOptions };

  return {
    viewer,
    display,
    container,
    displayOptions: displayOpts,
    renderOptions: renderOpts,
    viewerOptions: viewerOpts,
  };
}

/**
 * Cleanup both Viewer and Display
 */
export function cleanup({ viewer, display, container }) {
  // Dispose viewer resources if needed
  if (viewer && viewer.renderer) {
    viewer.renderer.dispose();
  }

  cleanupContainer(container);
}
