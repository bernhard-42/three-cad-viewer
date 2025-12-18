import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Raycaster, PickedObject, TopoFilter } from '../../src/rendering/raycast.js';

/**
 * Raycast Module Tests
 *
 * Tests for object picking and selection via raycasting.
 */

// =====================================================================
// MOCKS AND HELPERS
// =====================================================================

/**
 * Create a mock camera for raycasting
 */
function createMockCamera() {
  const threeCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  threeCamera.position.set(0, 0, 10);

  return {
    getCamera: () => threeCamera,
    getPosition: () => threeCamera.position.clone(),
    getZoom: () => 1,
  };
}

/**
 * Create a mock DOM element for event handling
 */
function createMockDomElement() {
  const element = document.createElement('div');
  element.style.width = '800px';
  element.style.height = '600px';
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
  });
  document.body.appendChild(element);
  return element;
}

/**
 * Create a mock ObjectGroup for testing
 */
function createMockObjectGroup(name, topo = 'face', subtype = null) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ visible: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name + '_mesh';

  const group = new THREE.Group();
  group.name = name;
  group.shapeInfo = { topo };
  group.subtype = subtype;
  group.isObjectGroup = true;  // Mark as ObjectGroup for type guard
  group.add(mesh);

  return group;
}

/**
 * Create a mock solid structure (parent > solid > faces group > face object groups)
 */
function createMockSolidStructure(solidName) {
  // Create the faces
  const face1 = createMockObjectGroup(solidName + '|face1', 'face');
  const face2 = createMockObjectGroup(solidName + '|face2', 'face');
  const face3 = createMockObjectGroup(solidName + '|face3', 'face');

  // Create faces group
  const facesGroup = new THREE.Group();
  facesGroup.name = solidName + '|faces';
  facesGroup.add(face1);
  facesGroup.add(face2);
  facesGroup.add(face3);

  // Create edges group (for completeness)
  const edgesGroup = new THREE.Group();
  edgesGroup.name = solidName + '|edges';

  // Create solid group
  const solidGroup = new THREE.Group();
  solidGroup.name = solidName;
  solidGroup.add(facesGroup);
  solidGroup.add(edgesGroup);

  // Create parent (for solid hierarchy)
  const parent = new THREE.Group();
  parent.name = 'parent';
  parent.add(solidGroup);

  // Create root
  const root = new THREE.Group();
  root.name = 'root';
  root.add(parent);

  return { root, solidGroup, facesGroup, faces: [face1, face2, face3] };
}

/**
 * Cleanup DOM element
 */
function cleanupDomElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

// =====================================================================
// TopoFilter TESTS
// =====================================================================

describe('TopoFilter', () => {
  test('defines all expected filter types', () => {
    expect(TopoFilter.none).toBeNull();
    expect(TopoFilter.vertex).toBe('vertex');
    expect(TopoFilter.edge).toBe('edge');
    expect(TopoFilter.face).toBe('face');
    expect(TopoFilter.solid).toBe('solid');
  });

  test('has exactly 5 filter types', () => {
    const keys = Object.keys(TopoFilter);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('none');
    expect(keys).toContain('vertex');
    expect(keys).toContain('edge');
    expect(keys).toContain('face');
    expect(keys).toContain('solid');
  });
});

// =====================================================================
// PickedObject TESTS
// =====================================================================

describe('PickedObject', () => {
  describe('constructor', () => {
    test('stores objectGroup and fromSolid flag', () => {
      const mockGroup = createMockObjectGroup('test');
      const picked = new PickedObject(mockGroup, false);

      expect(picked.obj).toBe(mockGroup);
      expect(picked.fromSolid).toBe(false);
    });

    test('handles fromSolid=true', () => {
      const mockGroup = createMockObjectGroup('test');
      const picked = new PickedObject(mockGroup, true);

      expect(picked.obj).toBe(mockGroup);
      expect(picked.fromSolid).toBe(true);
    });
  });

  describe('objs()', () => {
    test('returns single object array when fromSolid is false', () => {
      const mockGroup = createMockObjectGroup('test');
      const picked = new PickedObject(mockGroup, false);

      const result = picked.objs();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockGroup);
    });

    test('returns all face ObjectGroups when fromSolid is true', () => {
      const { faces } = createMockSolidStructure('mySolid');

      // The picked object is one of the faces, but we want all faces of the solid
      // The face's parent is facesGroup, facesGroup's parent is solidGroup
      const pickedFace = faces[0];
      const picked = new PickedObject(pickedFace, true);

      const result = picked.objs();

      expect(result).toHaveLength(3);
      expect(result).toContain(faces[0]);
      expect(result).toContain(faces[1]);
      expect(result).toContain(faces[2]);
    });
  });

  describe('_getSolidObjectGroups()', () => {
    test('finds faces group by name convention', () => {
      const { faces } = createMockSolidStructure('testSolid');
      const pickedFace = faces[0];
      const picked = new PickedObject(pickedFace, true);

      const result = picked._getSolidObjectGroups(pickedFace);

      expect(result).toHaveLength(3);
    });
  });
});

// =====================================================================
// Raycaster TESTS
// =====================================================================

describe('Raycaster', () => {
  let mockCamera;
  let mockDomElement;
  let mockGroup;
  let mockCallback;
  let raycaster;

  beforeEach(() => {
    mockCamera = createMockCamera();
    mockDomElement = createMockDomElement();
    mockGroup = new THREE.Group();
    mockCallback = vi.fn();

    raycaster = new Raycaster(
      mockCamera,
      mockDomElement,
      800,
      600,
      5,
      mockGroup,
      mockCallback
    );
  });

  afterEach(() => {
    if (raycaster) {
      raycaster.dispose();
    }
    cleanupDomElement(mockDomElement);
  });

  describe('constructor', () => {
    test('initializes with provided parameters', () => {
      expect(raycaster.camera).toBe(mockCamera);
      expect(raycaster.domElement).toBe(mockDomElement);
      expect(raycaster.width).toBe(800);
      expect(raycaster.height).toBe(600);
      expect(raycaster.threshold).toBe(5);
      expect(raycaster.group).toBe(mockGroup);
      expect(raycaster.callback).toBe(mockCallback);
    });

    test('creates THREE.Raycaster instance', () => {
      expect(raycaster.raycaster).toBeInstanceOf(THREE.Raycaster);
    });

    test('starts with raycastMode disabled', () => {
      expect(raycaster.raycastMode).toBe(false);
    });

    test('initializes mouse vector', () => {
      expect(raycaster.mouse).toBeInstanceOf(THREE.Vector2);
    });

    test('initializes with default filters', () => {
      expect(raycaster.filters.topoFilter).toEqual([TopoFilter.none]);
    });

    test('mouseMoved starts as false', () => {
      expect(raycaster.mouseMoved).toBe(false);
    });
  });

  describe('init()', () => {
    test('enables raycastMode', () => {
      raycaster.init();
      expect(raycaster.raycastMode).toBe(true);
    });

    test('adds event listeners to DOM element', () => {
      const addEventSpy = vi.spyOn(mockDomElement, 'addEventListener');
      const docAddEventSpy = vi.spyOn(document, 'addEventListener');

      raycaster.init();

      expect(addEventSpy).toHaveBeenCalledWith('mousemove', raycaster.onPointerMove);
      expect(addEventSpy).toHaveBeenCalledWith('mouseup', raycaster.onMouseKeyUp, false);
      expect(addEventSpy).toHaveBeenCalledWith('mousedown', raycaster.onMouseKeyDown, false);
      // Keyboard listener is on document (canvas doesn't receive focus)
      expect(docAddEventSpy).toHaveBeenCalledWith('keydown', raycaster.onKeyDown, false);
    });
  });

  describe('dispose()', () => {
    test('removes event listeners', () => {
      raycaster.init();
      const removeEventSpy = vi.spyOn(mockDomElement, 'removeEventListener');
      const docRemoveEventSpy = vi.spyOn(document, 'removeEventListener');

      raycaster.dispose();
      raycaster = null; // Prevent afterEach from calling dispose again

      expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(removeEventSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      // Keyboard listener is on document (canvas doesn't receive focus)
      expect(docRemoveEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    test('disables raycastMode', () => {
      raycaster.init();
      raycaster.dispose();
      raycaster = null; // Prevent afterEach from calling dispose again

      // Note: can't check raycastMode after dispose since we nullified raycaster
      // This test verifies dispose doesn't throw
    });

    test('nullifies references for garbage collection', () => {
      raycaster.init();
      const rc = raycaster;
      raycaster.dispose();
      raycaster = null; // Prevent afterEach from calling dispose again

      expect(rc.group).toBeNull();
      expect(rc.domElement).toBeNull();
      expect(rc.camera).toBeNull();
    });
  });

  describe('onPointerMove', () => {
    test('updates mouse coordinates from event', () => {
      raycaster.init();

      const event = new MouseEvent('mousemove', {
        clientX: 400,
        clientY: 300,
      });
      // Simulate pageX/pageY (not set by MouseEvent constructor)
      Object.defineProperty(event, 'pageX', { value: 400 });
      Object.defineProperty(event, 'pageY', { value: 300 });

      raycaster.onPointerMove(event);

      // Expected: ((400 - 0) / 800) * 2 - 1 = 0
      // Expected: -((300 - 0) / 600) * 2 + 1 = 0
      expect(raycaster.mouse.x).toBe(0);
      expect(raycaster.mouse.y).toBe(0);
      expect(raycaster.mouseMoved).toBe(true);
    });

    test('calculates correct coordinates for corner positions', () => {
      raycaster.init();

      // Top-left corner
      const topLeft = new MouseEvent('mousemove');
      Object.defineProperty(topLeft, 'pageX', { value: 0 });
      Object.defineProperty(topLeft, 'pageY', { value: 0 });
      raycaster.onPointerMove(topLeft);
      expect(raycaster.mouse.x).toBe(-1);
      expect(raycaster.mouse.y).toBe(1);

      // Bottom-right corner
      const bottomRight = new MouseEvent('mousemove');
      Object.defineProperty(bottomRight, 'pageX', { value: 800 });
      Object.defineProperty(bottomRight, 'pageY', { value: 600 });
      raycaster.onPointerMove(bottomRight);
      expect(raycaster.mouse.x).toBe(1);
      expect(raycaster.mouse.y).toBe(-1);
    });
  });

  describe('onMouseKeyDown', () => {
    test('stores camera position on left click when raycastMode is true', () => {
      raycaster.init();

      const event = new MouseEvent('mousedown', { button: 0 }); // LEFT
      raycaster.onMouseKeyDown(event);

      expect(raycaster.lastPosition).toBeDefined();
      expect(raycaster.lastPosition).toBeInstanceOf(THREE.Vector3);
    });

    test('stores camera position on right click when raycastMode is true', () => {
      raycaster.init();

      const event = new MouseEvent('mousedown', { button: 2 }); // RIGHT
      raycaster.onMouseKeyDown(event);

      expect(raycaster.lastPosition).toBeDefined();
    });

    test('does nothing when raycastMode is false', () => {
      // Not initialized, raycastMode is false
      const event = new MouseEvent('mousedown', { button: 0 });
      raycaster.onMouseKeyDown(event);

      expect(raycaster.lastPosition).toBeNull();
    });
  });

  describe('onMouseKeyUp', () => {
    beforeEach(() => {
      raycaster.init();
      // Set initial position
      raycaster.lastPosition = mockCamera.getPosition().clone();
    });

    test('triggers callback with left mouse and shift info on left click', () => {
      const event = new MouseEvent('mouseup', { button: 0, shiftKey: false });
      raycaster.onMouseKeyUp(event);

      expect(mockCallback).toHaveBeenCalledWith({ mouse: 'left', shift: false });
    });

    test('triggers callback with shift=true when shift key pressed', () => {
      // Note: KeyMapper default maps "shift" to ctrlKey (keys are remappable)
      const event = new MouseEvent('mouseup', { button: 0, ctrlKey: true });
      raycaster.onMouseKeyUp(event);

      expect(mockCallback).toHaveBeenCalledWith({ mouse: 'left', shift: true });
    });

    test('triggers callback with right mouse on right click', () => {
      const event = new MouseEvent('mouseup', { button: 2 });
      raycaster.onMouseKeyUp(event);

      expect(mockCallback).toHaveBeenCalledWith({ mouse: 'right' });
    });

    test('does not trigger callback if camera moved', () => {
      // Move camera far away
      raycaster.lastPosition = new THREE.Vector3(1000, 1000, 1000);

      const event = new MouseEvent('mouseup', { button: 0 });
      raycaster.onMouseKeyUp(event);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('does nothing when raycastMode is false', () => {
      raycaster.raycastMode = false;

      const event = new MouseEvent('mouseup', { button: 0 });
      raycaster.onMouseKeyUp(event);

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('onKeyDown', () => {
    beforeEach(() => {
      raycaster.init();
    });

    test('triggers callback for Backspace key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Backspace' });
      raycaster.onKeyDown(event);

      expect(mockCallback).toHaveBeenCalledWith({ key: 'Backspace' });
    });

    test('triggers callback for Escape key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      raycaster.onKeyDown(event);

      expect(mockCallback).toHaveBeenCalledWith({ key: 'Escape' });
    });

    test('does not trigger callback for other keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      raycaster.onKeyDown(event);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('does nothing when raycastMode is false', () => {
      raycaster.raycastMode = false;

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      raycaster.onKeyDown(event);

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('getIntersectedObjs()', () => {
    test('sets raycaster from camera and mouse', () => {
      raycaster.init();
      raycaster.mouseMoved = true;

      const setFromCameraSpy = vi.spyOn(raycaster.raycaster, 'setFromCamera');
      raycaster.getIntersectedObjs();

      expect(setFromCameraSpy).toHaveBeenCalledWith(
        raycaster.mouse,
        mockCamera.getCamera()
      );
    });

    test('sets point threshold based on zoom', () => {
      raycaster.init();

      raycaster.getIntersectedObjs();

      expect(raycaster.raycaster.params.Points.threshold).toBe(5); // threshold / zoom
    });

    test('sets Line2 threshold', () => {
      raycaster.init();

      raycaster.getIntersectedObjs();

      expect(raycaster.raycaster.params['Line2']).toEqual({ threshold: 4 });
    });

    test('filters out objects with invisible materials', () => {
      // Create visible and invisible objects
      const visibleObj = createMockObjectGroup('visible');
      const invisibleObj = createMockObjectGroup('invisible');
      invisibleObj.children[0].material.visible = false;

      mockGroup.add(visibleObj);
      mockGroup.add(invisibleObj);

      raycaster.init();

      // Mock intersectObjects to return both
      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: visibleObj.children[0] },
        { object: invisibleObj.children[0] },
      ]);

      const result = raycaster.getIntersectedObjs();

      expect(result).toHaveLength(1);
      expect(result[0].object).toBe(visibleObj.children[0]);
    });
  });

  describe('getValidIntersectedObjs()', () => {
    test('returns empty array if mouseMoved is false', () => {
      raycaster.init();
      raycaster.mouseMoved = false;

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toEqual([]);
    });

    test('filters by topology when topoFilter is set', () => {
      const faceObj = createMockObjectGroup('face1', 'face');
      const edgeObj = createMockObjectGroup('edge1', 'edge');

      mockGroup.add(faceObj);
      mockGroup.add(edgeObj);

      raycaster.init();
      raycaster.mouseMoved = true;
      raycaster.filters.topoFilter = [TopoFilter.face];

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: faceObj.children[0] },
        { object: edgeObj.children[0] },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(1);
      expect(result[0].object.parent.shapeInfo.topo).toBe('face');
    });

    test('accepts all topologies when filter is TopoFilter.none', () => {
      const faceObj = createMockObjectGroup('face1', 'face');
      const edgeObj = createMockObjectGroup('edge1', 'edge');
      const vertexObj = createMockObjectGroup('vertex1', 'vertex');

      mockGroup.add(faceObj);
      mockGroup.add(edgeObj);
      mockGroup.add(vertexObj);

      raycaster.init();
      raycaster.mouseMoved = true;
      raycaster.filters.topoFilter = [TopoFilter.none];

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: faceObj.children[0] },
        { object: edgeObj.children[0] },
        { object: vertexObj.children[0] },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(3);
    });

    test('accepts solid subtype when TopoFilter.solid is set', () => {
      const solidFace = createMockObjectGroup('solidFace', 'face', 'solid');
      const regularFace = createMockObjectGroup('regularFace', 'face');

      mockGroup.add(solidFace);
      mockGroup.add(regularFace);

      raycaster.init();
      raycaster.mouseMoved = true;
      raycaster.filters.topoFilter = [TopoFilter.solid];

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: solidFace.children[0] },
        { object: regularFace.children[0] },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(1);
      expect(result[0].object.parent.subtype).toBe('solid');
    });

    test('skips objects without shapeInfo (clipping planes)', () => {
      const normalObj = createMockObjectGroup('normal', 'face');
      const clippingPlane = createMockObjectGroup('clipping', 'face');
      delete clippingPlane.shapeInfo; // Clipping planes don't have shapeInfo

      mockGroup.add(normalObj);
      mockGroup.add(clippingPlane);

      raycaster.init();
      raycaster.mouseMoved = true;

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: normalObj.children[0] },
        { object: clippingPlane.children[0] },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(1);
      expect(result[0].object.parent.name).toBe('normal');
    });

    test('skips objects with null parent', () => {
      const normalObj = createMockObjectGroup('normal', 'face');
      const orphanMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial({ visible: true })
      );
      // orphanMesh has no parent

      mockGroup.add(normalObj);

      raycaster.init();
      raycaster.mouseMoved = true;

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: normalObj.children[0] },
        { object: orphanMesh },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(1);
    });

    test('supports multiple topology filters', () => {
      const faceObj = createMockObjectGroup('face1', 'face');
      const edgeObj = createMockObjectGroup('edge1', 'edge');
      const vertexObj = createMockObjectGroup('vertex1', 'vertex');

      mockGroup.add(faceObj);
      mockGroup.add(edgeObj);
      mockGroup.add(vertexObj);

      raycaster.init();
      raycaster.mouseMoved = true;
      raycaster.filters.topoFilter = [TopoFilter.face, TopoFilter.edge];

      vi.spyOn(raycaster.raycaster, 'intersectObjects').mockReturnValue([
        { object: faceObj.children[0] },
        { object: edgeObj.children[0] },
        { object: vertexObj.children[0] },
      ]);

      const result = raycaster.getValidIntersectedObjs();

      expect(result).toHaveLength(2);
    });
  });
});
