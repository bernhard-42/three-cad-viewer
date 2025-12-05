/**
 * Unit tests for CAD Tools
 * Target: 80%+ coverage for tools.js, measure.js, select.js, ui.js
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Tools, ToolTypes } from '../../src/cad_tools/tools.js';
import { DistanceMeasurement, PropertiesMeasurement } from '../../src/cad_tools/measure.js';
import { SelectObject } from '../../src/cad_tools/select.js';
import { FilterByDropDownMenu, DistancePanel, PropertiesPanel } from '../../src/cad_tools/ui.js';

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockDisplay() {
  const container = document.createElement('div');

  // Create mock panels
  const distancePanel = document.createElement('div');
  distancePanel.id = 'tcv_distance_measurement_panel';
  distancePanel.style.display = 'none';
  container.appendChild(distancePanel);

  const propertiesPanel = document.createElement('div');
  propertiesPanel.id = 'tcv_properties_measurement_panel';
  const subheader = document.createElement('div');
  subheader.className = 'tcv_measure_subheader';
  propertiesPanel.appendChild(subheader);
  propertiesPanel.style.display = 'none';
  container.appendChild(propertiesPanel);

  // Create filter elements
  const filterSelect = document.createElement('div');
  filterSelect.id = 'tcv_shape_filter';
  container.appendChild(filterSelect);

  const filterDropdown = document.createElement('div');
  filterDropdown.id = 'tcv_filter_dropdown';
  container.appendChild(filterDropdown);

  const filterIcon = document.createElement('div');
  filterIcon.id = 'tcv_filter_icon';
  container.appendChild(filterIcon);

  const filterValue = document.createElement('div');
  filterValue.id = 'tcv_filter_value';
  container.appendChild(filterValue);

  const filterContent = document.createElement('div');
  filterContent.id = 'tcv_filter_content';
  container.appendChild(filterContent);

  // Create filter options
  const options = ['none', 'vertex', 'edge', 'face', 'solid'];
  for (const opt of options) {
    const el = document.createElement('div');
    el.id = `tvc_filter_${opt}`;
    el.innerText = opt.charAt(0).toUpperCase() + opt.slice(1);
    container.appendChild(el);
  }

  document.body.appendChild(container);

  return {
    container,
    _getElement: (id) => document.getElementById(id),
    shapeFilterDropDownMenu: {
      reset: vi.fn(),
      show: vi.fn(),
      setRaycaster: vi.fn(),
    },
    cleanup: () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

function createMockViewer(display) {
  return {
    display,
    state: {
      get: vi.fn((key) => {
        if (key === 'cadWidth') return 800;
        if (key === 'height') return 600;
        return null;
      }),
    },
    camera: {
      getCamera: () => new THREE.PerspectiveCamera(),
      getZoom: () => 1,
    },
    renderer: {
      domElement: document.createElement('canvas'),
      clearDepth: vi.fn(),
      render: vi.fn(),
    },
    checkChanges: vi.fn(),
    bb_radius: 10,
    ortho: true,
  };
}

function createMockObjectGroup(name = 'test|path') {
  const group = new THREE.Group();
  group.name = name;
  group.isSelected = false;
  group.clearHighlights = vi.fn();
  group.children = [{
    geometry: {
      boundingSphere: {
        center: new THREE.Vector3(0, 0, 0),
      },
    },
  }];
  group.localToWorld = (v) => v;

  return {
    obj: group,
    fromSolid: false,
    objs: () => [group],
  };
}

// =============================================================================
// TOOL TYPES TESTS
// =============================================================================

describe('ToolTypes', () => {
  test('exports correct tool type constants', () => {
    expect(ToolTypes.NONE).toBe('None');
    expect(ToolTypes.DISTANCE).toBe('DistanceMeasurement');
    expect(ToolTypes.PROPERTIES).toBe('PropertiesMeasurement');
    expect(ToolTypes.SELECT).toBe('SelectObjects');
  });
});

// =============================================================================
// TOOLS CLASS TESTS
// =============================================================================

describe('Tools', () => {
  let display;
  let viewer;
  let tools;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    tools = new Tools(viewer, false);
  });

  afterEach(() => {
    if (tools) {
      tools.dispose();
    }
    display.cleanup();
  });

  describe('constructor', () => {
    test('creates tools with all measurement types', () => {
      expect(tools.viewer).toBe(viewer);
      expect(tools.distanceMeasurement).toBeInstanceOf(DistanceMeasurement);
      expect(tools.propertiesMeasurement).toBeInstanceOf(PropertiesMeasurement);
      expect(tools.selectObject).toBeInstanceOf(SelectObject);
      expect(tools.enabledTool).toBeNull();
    });
  });

  describe('enable', () => {
    test('enables distance measurement tool', () => {
      tools.enable(ToolTypes.DISTANCE);

      expect(tools.enabledTool).toBe(ToolTypes.DISTANCE);
      expect(tools.distanceMeasurement.contextEnabled).toBe(true);
    });

    test('enables properties measurement tool', () => {
      tools.enable(ToolTypes.PROPERTIES);

      expect(tools.enabledTool).toBe(ToolTypes.PROPERTIES);
      expect(tools.propertiesMeasurement.contextEnabled).toBe(true);
    });

    test('enables select tool', () => {
      tools.enable(ToolTypes.SELECT);

      expect(tools.enabledTool).toBe(ToolTypes.SELECT);
      expect(tools.selectObject.contextEnabled).toBe(true);
    });

    test('throws error for unknown tool type', () => {
      expect(() => tools.enable('UnknownTool')).toThrow('Unknown tool type: UnknownTool');
    });

    test('disables previous tool when enabling new one', () => {
      tools.enable(ToolTypes.DISTANCE);
      expect(tools.distanceMeasurement.contextEnabled).toBe(true);

      tools.enable(ToolTypes.PROPERTIES);
      expect(tools.distanceMeasurement.contextEnabled).toBe(false);
      expect(tools.propertiesMeasurement.contextEnabled).toBe(true);
    });
  });

  describe('disable', () => {
    test('disables currently enabled tool', () => {
      tools.enable(ToolTypes.DISTANCE);
      tools.disable();

      expect(tools.enabledTool).toBeNull();
      expect(tools.distanceMeasurement.contextEnabled).toBe(false);
    });

    test('does nothing when no tool is enabled', () => {
      expect(() => tools.disable()).not.toThrow();
      expect(tools.enabledTool).toBeNull();
    });

    test('resets filter dropdown', () => {
      tools.enable(ToolTypes.DISTANCE);
      tools.disable();

      expect(display.shapeFilterDropDownMenu.reset).toHaveBeenCalled();
    });
  });

  describe('_disable', () => {
    test('throws for unknown tool type when enabled tool is corrupted', () => {
      tools.enabledTool = 'CorruptedToolType';

      expect(() => tools._disable()).toThrow('Unknown tool type: CorruptedToolType');
    });
  });

  describe('handleRemoveLastSelection', () => {
    test('handles distance measurement context', () => {
      tools.enable(ToolTypes.DISTANCE);
      const spy = vi.spyOn(tools.distanceMeasurement, 'removeLastSelectedObj');

      tools.handleRemoveLastSelection();

      expect(spy).toHaveBeenCalledWith(false);
    });

    test('handles properties measurement context', () => {
      tools.enable(ToolTypes.PROPERTIES);
      const spy = vi.spyOn(tools.propertiesMeasurement, 'removeLastSelectedObj');

      tools.handleRemoveLastSelection();

      expect(spy).toHaveBeenCalledWith(false);
    });

    test('handles select context', () => {
      tools.enable(ToolTypes.SELECT);
      const spy = vi.spyOn(tools.selectObject, 'removeLastSelectedObj');

      tools.handleRemoveLastSelection();

      expect(spy).toHaveBeenCalledWith(false);
    });

    test('handles force parameter', () => {
      tools.enable(ToolTypes.DISTANCE);
      const spy = vi.spyOn(tools.distanceMeasurement, 'removeLastSelectedObj');

      tools.handleRemoveLastSelection(true);

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('handleSelectedObj', () => {
    test('handles distance measurement selection', () => {
      tools.enable(ToolTypes.DISTANCE);
      const spy = vi.spyOn(tools.distanceMeasurement, 'handleSelection');
      const mockObj = createMockObjectGroup();

      tools.handleSelectedObj(mockObj, false, false);

      expect(spy).toHaveBeenCalledWith(mockObj, false);
    });

    test('handles properties measurement selection', () => {
      tools.enable(ToolTypes.PROPERTIES);
      const spy = vi.spyOn(tools.propertiesMeasurement, 'handleSelection');
      const mockObj = createMockObjectGroup();

      tools.handleSelectedObj(mockObj, false, false);

      expect(spy).toHaveBeenCalledWith(mockObj);
    });

    test('handles select tool selection', () => {
      tools.enable(ToolTypes.SELECT);
      const spy = vi.spyOn(tools.selectObject, 'handleSelection');
      const mockObj = createMockObjectGroup();

      tools.handleSelectedObj(mockObj, false, false);

      expect(spy).toHaveBeenCalledWith(mockObj);
    });

    test('removes last selected on new object for distance', () => {
      tools.enable(ToolTypes.DISTANCE);
      const removeSpy = vi.spyOn(tools.distanceMeasurement, 'removeLastSelectedObj');
      const mockObj = createMockObjectGroup();

      tools.handleSelectedObj(mockObj, true, false);

      expect(removeSpy).toHaveBeenCalled();
    });
  });

  describe('handleResetSelection', () => {
    test('resets distance measurement selection', () => {
      tools.enable(ToolTypes.DISTANCE);
      const spy = vi.spyOn(tools.distanceMeasurement, 'removeLastSelectedObj');

      tools.handleResetSelection();

      // Called twice for distance (2 points)
      expect(spy).toHaveBeenCalledTimes(2);
    });

    test('resets properties measurement selection', () => {
      tools.enable(ToolTypes.PROPERTIES);
      const spy = vi.spyOn(tools.propertiesMeasurement, 'removeLastSelectedObj');

      tools.handleResetSelection();

      expect(spy).toHaveBeenCalledWith(true);
    });

    test('resets select tool selection', () => {
      tools.enable(ToolTypes.SELECT);
      const spy = vi.spyOn(tools.selectObject, 'removeLastSelectedObj');

      tools.handleResetSelection();

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('handleResponse', () => {
    test('routes distance response', () => {
      const spy = vi.spyOn(tools.distanceMeasurement, 'handleResponse');

      // Provide valid response data
      tools.handleResponse({
        tool_type: ToolTypes.DISTANCE,
        refpoint1: [0, 0, 0],
        refpoint2: [1, 1, 1],
        Distance: 1.732,
      });

      expect(spy).toHaveBeenCalled();
    });

    test('routes properties response', () => {
      const spy = vi.spyOn(tools.propertiesMeasurement, 'handleResponse');

      // Provide valid response data
      tools.handleResponse({
        tool_type: ToolTypes.PROPERTIES,
        refpoint: [0, 0, 0],
        shape_type: 'Edge',
        geom_type: 'Line',
      });

      expect(spy).toHaveBeenCalled();
    });

    test('routes select response', () => {
      // SelectObject doesn't have handleResponse by default but the router still calls it
      tools.selectObject.handleResponse = vi.fn();

      tools.handleResponse({ tool_type: ToolTypes.SELECT, data: {} });

      expect(tools.selectObject.handleResponse).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    test('updates distance measurement when enabled', () => {
      tools.enable(ToolTypes.DISTANCE);
      const spy = vi.spyOn(tools.distanceMeasurement, 'update');

      tools.update();

      expect(spy).toHaveBeenCalled();
    });

    test('updates properties measurement when enabled', () => {
      tools.enable(ToolTypes.PROPERTIES);
      const spy = vi.spyOn(tools.propertiesMeasurement, 'update');

      tools.update();

      expect(spy).toHaveBeenCalled();
    });

    test('updates select tool when enabled', () => {
      tools.enable(ToolTypes.SELECT);
      const spy = vi.spyOn(tools.selectObject, 'update');

      tools.update();

      expect(spy).toHaveBeenCalled();
    });

    test('does nothing when no tool enabled', () => {
      expect(() => tools.update()).not.toThrow();
    });
  });

  describe('dispose', () => {
    test('disposes all tools', () => {
      // Create fresh tools instance for this test
      const freshTools = new Tools(viewer, false);
      const distSpy = vi.spyOn(freshTools.distanceMeasurement, 'dispose');
      const propSpy = vi.spyOn(freshTools.propertiesMeasurement, 'dispose');
      const selSpy = vi.spyOn(freshTools.selectObject, 'dispose');

      freshTools.dispose();

      expect(distSpy).toHaveBeenCalled();
      expect(propSpy).toHaveBeenCalled();
      expect(selSpy).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// SELECT OBJECT TESTS
// =============================================================================

describe('SelectObject', () => {
  let viewer;
  let display;
  let selectObject;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    selectObject = new SelectObject(viewer);
  });

  afterEach(() => {
    selectObject.dispose();
    display.cleanup();
  });

  describe('constructor', () => {
    test('initializes with empty state', () => {
      expect(selectObject.viewer).toBe(viewer);
      expect(selectObject.selectedShapes).toEqual([]);
      expect(selectObject.contextEnabled).toBe(false);
    });
  });

  describe('enableContext', () => {
    test('enables context', () => {
      selectObject.enableContext();
      expect(selectObject.contextEnabled).toBe(true);
    });
  });

  describe('disableContext', () => {
    test('disables context and clears selection', () => {
      const mockObj = createMockObjectGroup();
      selectObject.selectedShapes.push(mockObj);
      selectObject.contextEnabled = true;

      selectObject.disableContext();

      expect(selectObject.contextEnabled).toBe(false);
      expect(selectObject.selectedShapes).toEqual([]);
      expect(mockObj.obj.clearHighlights).toHaveBeenCalled();
    });
  });

  describe('_getMaxObjSelected', () => {
    test('returns null (unlimited)', () => {
      expect(selectObject._getMaxObjSelected()).toBeNull();
    });
  });

  describe('_getIndex', () => {
    test('extracts index from path', () => {
      expect(selectObject._getIndex('root|path|name_123')).toBe('123');
      expect(selectObject._getIndex('simple_0')).toBe('0');
    });
  });

  describe('_includes', () => {
    test('returns true if path is selected', () => {
      const mockObj = createMockObjectGroup('test|path');
      selectObject.selectedShapes.push(mockObj);

      expect(selectObject._includes('test|path')).toBe(true);
      expect(selectObject._includes('other|path')).toBe(false);
    });
  });

  describe('notify', () => {
    test('calls checkChanges with selected indices', () => {
      const mockObj = createMockObjectGroup('root|part_5');
      selectObject.selectedShapes.push(mockObj);

      selectObject.notify();

      expect(viewer.checkChanges).toHaveBeenCalledWith({ selected: ['5'] }, true);
    });
  });

  describe('handleSelection', () => {
    test('adds new selection', () => {
      const mockObj = createMockObjectGroup('test|path_1');

      selectObject.handleSelection(mockObj);

      expect(selectObject.selectedShapes).toContain(mockObj);
      expect(viewer.checkChanges).toHaveBeenCalled();
    });

    test('removes existing selection', () => {
      const mockObj = createMockObjectGroup('test|path_1');
      selectObject.selectedShapes.push(mockObj);

      selectObject.handleSelection(mockObj);

      expect(selectObject.selectedShapes).not.toContain(mockObj);
    });

    test('handles null selection', () => {
      expect(() => selectObject.handleSelection(null)).not.toThrow();
    });
  });

  describe('removeLastSelectedObj', () => {
    test('removes last selection when not forced', () => {
      const mockObj1 = createMockObjectGroup('path_1');
      const mockObj2 = createMockObjectGroup('path_2');
      selectObject.selectedShapes.push(mockObj1, mockObj2);

      selectObject.removeLastSelectedObj(false);

      expect(selectObject.selectedShapes).toEqual([mockObj1]);
    });

    test('removes all selections when forced', () => {
      const mockObj1 = createMockObjectGroup('path_1');
      const mockObj2 = createMockObjectGroup('path_2');
      selectObject.selectedShapes.push(mockObj1, mockObj2);

      selectObject.removeLastSelectedObj(true);

      expect(selectObject.selectedShapes).toEqual([]);
    });
  });

  describe('update', () => {
    test('is callable (no-op)', () => {
      expect(() => selectObject.update()).not.toThrow();
    });
  });

  describe('dispose', () => {
    test('calls disableContext', () => {
      const spy = vi.spyOn(selectObject, 'disableContext');

      selectObject.dispose();

      expect(spy).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// MEASUREMENT TESTS
// =============================================================================

describe('DistanceMeasurement', () => {
  let viewer;
  let display;
  let measurement;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    measurement = new DistanceMeasurement(viewer, false);
  });

  afterEach(() => {
    measurement.dispose();
    display.cleanup();
  });

  describe('constructor', () => {
    test('initializes measurement', () => {
      expect(measurement.viewer).toBe(viewer);
      expect(measurement.selectedShapes).toEqual([]);
      expect(measurement.contextEnabled).toBe(false);
      expect(measurement.point1).toBeNull();
      expect(measurement.point2).toBeNull();
    });
  });

  describe('enableContext', () => {
    test('enables context and sets up event listeners', () => {
      measurement.enableContext();

      expect(measurement.contextEnabled).toBe(true);
      expect(measurement.panelCenter).toBeDefined();
    });
  });

  describe('disableContext', () => {
    test('disables context and cleans up', () => {
      measurement.enableContext();
      const mockObj = createMockObjectGroup();
      measurement.selectedShapes.push(mockObj);

      measurement.disableContext();

      expect(measurement.contextEnabled).toBe(false);
      expect(measurement.selectedShapes).toEqual([]);
      expect(viewer.checkChanges).toHaveBeenCalledWith({ selectedShapeIDs: [] });
    });
  });

  describe('_getMaxObjSelected', () => {
    test('returns 2 for distance measurement', () => {
      expect(measurement._getMaxObjSelected()).toBe(2);
    });
  });

  describe('handleResponse', () => {
    test('stores response data and extracts points', () => {
      const response = {
        refpoint1: [1, 2, 3],
        refpoint2: [4, 5, 6],
        Distance: 5.196,
      };

      measurement.handleResponse(response);

      expect(measurement.responseData).toBeDefined();
      expect(measurement.point1.x).toBe(1);
      expect(measurement.point2.x).toBe(4);
    });
  });

  describe('handleSelection', () => {
    test('adds new selection', () => {
      measurement.enableContext();
      const mockObj = createMockObjectGroup();

      measurement.handleSelection(mockObj, false);

      expect(measurement.selectedShapes).toContain(mockObj);
    });

    test('toggles existing selection', () => {
      measurement.enableContext();
      const mockObj = createMockObjectGroup('same|path');
      measurement.selectedShapes.push(mockObj);

      measurement.handleSelection(mockObj, false);

      expect(measurement.selectedShapes).not.toContain(mockObj);
    });
  });

  describe('removeLastSelectedObj', () => {
    test('removes last when at max', () => {
      const mockObj1 = createMockObjectGroup('path1');
      const mockObj2 = createMockObjectGroup('path2');
      measurement.selectedShapes.push(mockObj1, mockObj2);

      measurement.removeLastSelectedObj(false);

      expect(measurement.selectedShapes.length).toBe(1);
    });

    test('removes when forced', () => {
      const mockObj = createMockObjectGroup();
      measurement.selectedShapes.push(mockObj);

      measurement.removeLastSelectedObj(true);

      expect(measurement.selectedShapes.length).toBe(0);
    });
  });

  describe('update', () => {
    test('updates without throwing', () => {
      measurement.enableContext();

      expect(() => measurement.update()).not.toThrow();
    });
  });

  describe('dispose', () => {
    test('disposes resources', () => {
      // Create fresh measurement for this test
      const freshMeasurement = new DistanceMeasurement(viewer, false);

      freshMeasurement.dispose();

      expect(freshMeasurement.panel).toBeNull();
      expect(freshMeasurement.viewer).toBeNull();
      expect(freshMeasurement.scene).toBeNull();
    });
  });

  describe('disposeArrows', () => {
    test('clears scene', () => {
      // Create fresh measurement for this test
      const freshMeasurement = new DistanceMeasurement(viewer, false);

      freshMeasurement.disposeArrows();

      expect(freshMeasurement.scene.children.length).toBe(0);

      freshMeasurement.dispose();
    });
  });
});

describe('PropertiesMeasurement', () => {
  let viewer;
  let display;
  let measurement;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    measurement = new PropertiesMeasurement(viewer, false);
  });

  afterEach(() => {
    measurement.dispose();
    display.cleanup();
  });

  describe('_getMaxObjSelected', () => {
    test('returns 1 for properties measurement', () => {
      expect(measurement._getMaxObjSelected()).toBe(1);
    });
  });

  describe('handleResponse', () => {
    test('stores response data and extracts point', () => {
      const response = {
        refpoint: [1, 2, 3],
        shape_type: 'Edge',
        geom_type: 'Line',
      };

      measurement.handleResponse(response);

      expect(measurement.responseData).toBeDefined();
      expect(measurement.point1.x).toBe(1);
    });
  });
});

// =============================================================================
// MEASUREMENT - ADDITIONAL TESTS
// =============================================================================

describe('Measurement - Base Class Methods', () => {
  let viewer;
  let display;
  let measurement;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    measurement = new DistanceMeasurement(viewer, false);
  });

  afterEach(() => {
    measurement.dispose();
    display.cleanup();
  });

  describe('_hideMeasurement', () => {
    test('hides panel and clears scene', () => {
      measurement._hideMeasurement();

      expect(measurement.panel.isVisible()).toBe(false);
      expect(measurement.scene.children.length).toBe(0);
    });
  });

  describe('panel drag', () => {
    test('panel drag mousedown sets drag data', () => {
      const mockEvent = {
        clientX: 100,
        clientY: 200,
        stopPropagation: vi.fn(),
      };

      // Trigger the mousedown callback registered in constructor
      measurement.panel.html.dispatchEvent(new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 200,
      }));

      // The drag data should be set (though we can't easily verify internal state)
      expect(measurement.panelDragData).toBeDefined();
    });
  });

  describe('_mouseup', () => {
    test('resets drag click state', () => {
      measurement.panelDragData.clicked = true;

      const mockEvent = { stopPropagation: vi.fn() };
      measurement._mouseup(mockEvent);

      expect(measurement.panelDragData.clicked).toBe(false);
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('_movePanel', () => {
    test('does nothing when panel not visible', () => {
      measurement.panel.show(false);

      expect(() => measurement._movePanel()).not.toThrow();
    });

    test('updates panel position when visible', () => {
      measurement.enableContext();
      measurement.panel.show(true);
      measurement.middlePoint = new THREE.Vector3(0, 0, 0);
      measurement.panelX = null;

      // This requires actual DOM positioning which is limited in test env
      expect(() => measurement._movePanel()).not.toThrow();
    });
  });

  describe('_dragPanel', () => {
    test('does nothing when not clicked', () => {
      measurement.panelDragData.clicked = false;

      const mockEvent = { clientX: 100, clientY: 100 };
      measurement._dragPanel(mockEvent);

      // Should not throw
    });

    test('updates position when dragging', () => {
      measurement.enableContext();
      measurement.panel.show(true);
      measurement.panelDragData.clicked = true;
      measurement.panelDragData.x = 50;
      measurement.panelDragData.y = 50;
      measurement.panelX = 100;
      measurement.panelY = 100;

      const mockEvent = {
        clientX: 60,
        clientY: 60,
        movementX: 10,
        movementY: 10,
      };

      measurement._dragPanel(mockEvent);

      // panelDragData should be updated
      expect(measurement.panelDragData.x).toBe(60);
      expect(measurement.panelDragData.y).toBe(60);
    });
  });

  describe('_adjustArrowsScaleFactor', () => {
    test('scales scene children', () => {
      // Add mock child with update method (must be THREE.Object3D-like)
      const mockChild = new THREE.Object3D();
      mockChild.update = vi.fn();
      measurement.scene.add(mockChild);

      measurement._adjustArrowsScaleFactor(2);

      expect(mockChild.update).toHaveBeenCalledWith(0.5);
    });
  });

  describe('debug mode', () => {
    test('debug mode creates measurement with debug flag', () => {
      const debugMeasurement = new DistanceMeasurement(viewer, true);
      expect(debugMeasurement.debug).toBe(true);
      debugMeasurement.dispose();
    });

    test('debug mode enables context', () => {
      const debugMeasurement = new DistanceMeasurement(viewer, true);
      debugMeasurement.enableContext();
      expect(debugMeasurement.contextEnabled).toBe(true);
      debugMeasurement.dispose();
    });
  });
});

describe('DistanceMeasurement - Line Creation', () => {
  let viewer;
  let display;
  let measurement;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    measurement = new DistanceMeasurement(viewer, false);
  });

  afterEach(() => {
    measurement.dispose();
    display.cleanup();
  });

  describe('_makeLines', () => {
    test('creates lines when scene is empty', () => {
      measurement.enableContext();
      measurement.point1 = new THREE.Vector3(0, 0, 0);
      measurement.point2 = new THREE.Vector3(1, 1, 1);
      measurement.panelCenter = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.coneLength = 0.1;

      measurement._makeLines();

      expect(measurement.scene.children.length).toBe(2);
      expect(measurement.middlePoint).toBeDefined();
    });

    test('skips if lines already exist', () => {
      measurement.enableContext();
      measurement.point1 = new THREE.Vector3(0, 0, 0);
      measurement.point2 = new THREE.Vector3(1, 1, 1);
      measurement.panelCenter = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.coneLength = 0.1;

      measurement._makeLines();
      const childCount = measurement.scene.children.length;

      measurement._makeLines();

      expect(measurement.scene.children.length).toBe(childCount);
    });
  });

  describe('_updateConnectionLine', () => {
    test('updates connection line geometry', () => {
      measurement.enableContext();
      measurement.point1 = new THREE.Vector3(0, 0, 0);
      measurement.point2 = new THREE.Vector3(1, 1, 1);
      measurement.panelCenter = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.coneLength = 0.1;
      measurement._makeLines();

      measurement.middlePoint = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.panelCenter = new THREE.Vector3(1, 1, 1);

      expect(() => measurement._updateConnectionLine()).not.toThrow();
    });
  });

  describe('_getPoints', () => {
    test('extracts points from response data', () => {
      measurement.responseData = {
        refpoint1: [1, 2, 3],
        refpoint2: [4, 5, 6],
      };

      measurement._getPoints();

      expect(measurement.point1.x).toBe(1);
      expect(measurement.point2.x).toBe(4);
    });
  });
});

describe('PropertiesMeasurement - Line Creation', () => {
  let viewer;
  let display;
  let measurement;

  beforeEach(() => {
    display = createMockDisplay();
    viewer = createMockViewer(display);
    measurement = new PropertiesMeasurement(viewer, false);
  });

  afterEach(() => {
    measurement.dispose();
    display.cleanup();
  });

  describe('_makeLines', () => {
    test('creates connecting line when scene is empty', () => {
      measurement.enableContext();
      measurement.point1 = new THREE.Vector3(0, 0, 0);
      measurement.panelCenter = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.coneLength = 0.1;

      measurement._makeLines();

      expect(measurement.scene.children.length).toBe(1);
      expect(measurement.middlePoint).toBe(measurement.point1);
    });
  });

  describe('_updateConnectionLine', () => {
    test('updates connection line geometry', () => {
      measurement.enableContext();
      measurement.point1 = new THREE.Vector3(0, 0, 0);
      measurement.panelCenter = new THREE.Vector3(0.5, 0.5, 0.5);
      measurement.coneLength = 0.1;
      measurement._makeLines();

      measurement.middlePoint = new THREE.Vector3(0, 0, 0);
      measurement.panelCenter = new THREE.Vector3(1, 1, 1);

      expect(() => measurement._updateConnectionLine()).not.toThrow();
    });
  });

  describe('_getPoint', () => {
    test('extracts point from response data', () => {
      measurement.responseData = {
        refpoint: [1, 2, 3],
      };

      measurement._getPoint();

      expect(measurement.point1.x).toBe(1);
    });
  });
});

// =============================================================================
// UI TESTS
// =============================================================================

describe('Panel', () => {
  let display;
  let panel;

  beforeEach(() => {
    display = createMockDisplay();
  });

  afterEach(() => {
    if (panel) {
      panel.dispose();
    }
    display.cleanup();
  });

  describe('DistancePanel', () => {
    beforeEach(() => {
      panel = new DistancePanel(display);
    });

    test('creates panel with display reference', () => {
      expect(panel.display).toBe(display);
      expect(panel.html).toBeDefined();
      expect(panel.finished).toBe(false);
    });

    test('show shows/hides panel', () => {
      panel.show(true);
      expect(panel.html.style.display).toBe('inline-block');

      panel.show(false);
      expect(panel.html.style.display).toBe('none');
    });

    test('isVisible returns visibility state', () => {
      panel.show(false);
      expect(panel.isVisible()).toBe(false);

      panel.show(true);
      expect(panel.isVisible()).toBe(true);
    });

    test('relocate sets position', () => {
      panel.relocate(100, 200);

      expect(panel.html.style.left).toBe('100px');
      expect(panel.html.style.top).toBe('200px');
    });

    test('registerCallback adds event listener', () => {
      const callback = vi.fn();
      panel.registerCallback('click', callback);

      expect(panel.callbacks.length).toBe(1);
    });

    test('createTable creates distance table', () => {
      const properties = {
        Distance: 5.0,
        info: 'center',
        Angle: 45.0,
        info1: 'Plane',
        info2: 'Plane',
      };

      panel.createTable(properties);

      expect(panel.finished).toBe(true);
      const table = panel.html.querySelector('table');
      expect(table).toBeDefined();
    });

    test('createTable skips if already finished', () => {
      // First create a table
      panel.createTable({ Distance: 5 });
      expect(panel.finished).toBe(true);

      // Try to create another table - should be skipped
      const tablesBefore = panel.html.querySelectorAll('table').length;
      panel.createTable({ Distance: 999 });
      const tablesAfter = panel.html.querySelectorAll('table').length;

      // Should not create another table
      expect(tablesAfter).toBe(tablesBefore);
    });

    test('_removeTable removes existing table', () => {
      panel.createTable({ Distance: 1 });
      expect(panel.html.querySelector('table')).not.toBeNull();

      panel._removeTable();

      expect(panel.html.querySelector('table')).toBeNull();
      expect(panel.finished).toBe(false);
    });
  });

  describe('PropertiesPanel', () => {
    beforeEach(() => {
      panel = new PropertiesPanel(display);
    });

    test('creates properties panel', () => {
      expect(panel.display).toBe(display);
    });

    test('createTable creates properties table', () => {
      const properties = {
        shape_type: 'Edge',
        geom_type: 'Line',
        Length: 10.5,
        Start: [0, 0, 0],
        End: [10, 0, 0],
        bb: {
          min: [0, 0, 0],
          center: [5, 0, 0],
          max: [10, 0, 0],
          size: [10, 0, 0],
        },
      };

      panel.createTable(properties);

      expect(panel.finished).toBe(true);
    });

    test('_setSubHeader sets subheader text', () => {
      panel._setSubHeader('Test Header');

      const subheader = panel.html.querySelector('.tcv_measure_subheader');
      expect(subheader.textContent).toBe('Test Header');
    });
  });
});

describe('FilterByDropDownMenu', () => {
  let display;
  let filter;

  beforeEach(() => {
    display = createMockDisplay();
    filter = new FilterByDropDownMenu(display);
  });

  afterEach(() => {
    display.cleanup();
  });

  describe('constructor', () => {
    test('initializes with default state', () => {
      expect(filter.display).toBe(display);
      expect(filter.raycaster).toBeNull();
      expect(filter.options).toEqual(['none', 'vertex', 'edge', 'face', 'solid']);
    });
  });

  describe('setRaycaster', () => {
    test('sets raycaster reference', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };

      filter.setRaycaster(mockRaycaster);

      expect(filter.raycaster).toBe(mockRaycaster);
    });
  });

  describe('_setValue', () => {
    test('sets value when raycaster is set', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);

      filter._setValue('vertex');

      expect(document.getElementById('tcv_filter_value').innerText).toBe('vertex');
    });

    test('does nothing when raycaster is null', () => {
      expect(() => filter._setValue('vertex')).not.toThrow();
    });

    test('handles none value', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);

      filter._setValue('none');

      expect(document.getElementById('tcv_filter_value').innerText).toBe('none');
    });
  });

  describe('_toggleDropdown', () => {
    test('toggles dropdown visibility', () => {
      filter._toggleDropdown(null);

      expect(filter.dropdownElement.classList.contains('tcv_filter_dropdown_active')).toBe(true);

      filter._toggleDropdown(null);

      expect(filter.dropdownElement.classList.contains('tcv_filter_dropdown_active')).toBe(false);
    });

    test('stops propagation when event provided', () => {
      const mockEvent = { stopPropagation: vi.fn() };

      filter._toggleDropdown(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('_closeDropdown', () => {
    test('closes dropdown if open', () => {
      filter.dropdownElement.classList.add('tcv_filter_dropdown_active');

      filter._closeDropdown(null);

      expect(filter.dropdownElement.classList.contains('tcv_filter_dropdown_active')).toBe(false);
    });
  });

  describe('handleSelection', () => {
    test('sets value and toggles dropdown', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);

      const mockEvent = {
        target: { innerText: 'Edge' },
        stopPropagation: vi.fn(),
      };

      filter.handleSelection(mockEvent);

      expect(document.getElementById('tcv_filter_value').innerText).toBe('Edge');
    });
  });

  describe('reset', () => {
    test('resets to None', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);
      filter._setValue('vertex');

      filter.reset();

      expect(document.getElementById('tcv_filter_value').innerText).toBe('None');
    });
  });

  describe('_keybindSelect', () => {
    test('handles keyboard shortcuts', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);

      filter._keybindSelect({ key: 'v' });
      expect(document.getElementById('tcv_filter_value').innerText).toBe('Vertex');

      filter._keybindSelect({ key: 'e' });
      expect(document.getElementById('tcv_filter_value').innerText).toBe('Edge');

      filter._keybindSelect({ key: 'f' });
      expect(document.getElementById('tcv_filter_value').innerText).toBe('Face');

      filter._keybindSelect({ key: 's' });
      expect(document.getElementById('tcv_filter_value').innerText).toBe('Solid');

      filter._keybindSelect({ key: 'n' });
      expect(document.getElementById('tcv_filter_value').innerText).toBe('None');
    });

    test('ignores invalid keys', () => {
      const mockRaycaster = { filters: { topoFilter: [] } };
      filter.setRaycaster(mockRaycaster);
      filter._setValue('vertex');

      filter._keybindSelect({ key: 'x' });

      // Should still be vertex
      expect(document.getElementById('tcv_filter_value').innerText).toBe('vertex');
    });
  });

  describe('show', () => {
    test('shows filter and adds event listeners', () => {
      filter.show(true);

      expect(filter.selectElement.style.display).toBe('block');
    });

    test('hides filter and removes event listeners', () => {
      filter.show(true);
      filter.show(false);

      expect(filter.selectElement.style.display).toBe('none');
    });
  });
});

// =============================================================================
// UI HELPER FUNCTION TESTS (through Panel usage)
// =============================================================================

describe('UI Helper Functions', () => {
  let display;
  let panel;

  beforeEach(() => {
    display = createMockDisplay();
    panel = new DistancePanel(display);
  });

  afterEach(() => {
    panel.dispose();
    display.cleanup();
  });

  test('createVectorRow creates row with 3 values', () => {
    const properties = {
      Start: [1.5, 2.5, 3.5],
    };

    panel.createTable(properties);

    const cells = panel.html.querySelectorAll('.tcv_measure_val');
    // Should have 3 cells for x, y, z
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  test('createValueRow creates single value row', () => {
    const properties = {
      Distance: 10.123,
    };

    panel.createTable(properties);

    const cells = panel.html.querySelectorAll('.tcv_measure_val');
    expect(cells.length).toBeGreaterThan(0);
  });

  test('createValueRow with qualifier', () => {
    const properties = {
      Distance: 10.123,
      info: 'center',
    };

    panel.createTable(properties);

    // The table should be created with the qualifier
    const table = panel.html.querySelector('table');
    expect(table).not.toBeNull();
  });
});
