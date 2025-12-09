/**
 * Scene capture helper for snapshot testing
 * Captures scene state for characterization testing
 */

import * as THREE from 'three';

/**
 * Capture the current scene state from a viewer instance
 * Returns a serializable object suitable for snapshot comparison
 *
 * @param {Viewer} viewer - The viewer instance
 * @returns {Object} Scene state snapshot
 */
export function captureSceneState(viewer) {
  const isReady = viewer.ready;

  const snapshot = {
    // Renderer state
    renderer: {
      type: viewer.renderer?.constructor.name,
      pixelRatio: viewer.renderer?.getPixelRatio?.(),
      size: viewer.renderer?.getSize?.(new THREE.Vector2()),
      clearColor: viewer.renderer?.getClearColor?.(new THREE.Color()),
    },

    // Camera state (throws if not rendered)
    camera: isReady ? captureCamera(viewer.camera) : null,

    // Scene structure (throws if not rendered)
    scene: isReady ? captureSceneTree(viewer.scene) : null,

    // CAD objects from nestedGroup (for testing state propagation)
    cadObjects: isReady ? captureNestedGroupMaterials(viewer.nestedGroup) : null,

    // Animation state
    animation: {
      isAnimating: viewer.animation?.isAnimating || false,
      frameCount: viewer.animation?.frameCount || 0,
    },

    // Display state
    display: {
      theme: viewer.display?.theme,
      tools: viewer.display?.tools !== null,
      cadWidth: viewer.display?.cadWidth,
      height: viewer.display?.height,
      treeWidth: viewer.display?.treeWidth,
      axes: viewer.getAxes(),
      grid: viewer.getGrids() ? [...viewer.getGrids()] : null,
    },
  };

  return snapshot;
}

/**
 * Capture materials directly from nestedGroup (CAD objects only)
 * This captures materials from all nested ObjectGroups for testing state propagation
 *
 * @param {NestedGroup} nestedGroup - The nested group containing CAD objects
 * @returns {Object} Materials from nested groups
 */
function captureNestedGroupMaterials(nestedGroup) {
  const allMeshMaterials = [];
  const allEdgeMaterials = [];
  const visibilityState = [];

  nestedGroup.rootGroup.traverse((obj) => {
    const type = obj.constructor.name;

    // Capture visibility state for all objects with names
    if (obj.name && obj.name.length > 0 && !obj.name.startsWith('clipping')) {
      visibilityState.push({
        name: obj.name,
        type: type,
        visible: obj.visible,
        materialVisible: obj.material?.visible,
      });
    }

    // Capture mesh materials (front and back)
    // Exclude clipping planes, caps, and other system geometry
    if (type.includes('Mesh') && !type.includes('Sprite') && !type.includes('Plane') && obj.material) {
      // Skip clipping planes
      if (obj.name.startsWith('clipping')) {
        return;
      }

      const mat = obj.material;
      if (mat.metalness !== undefined && mat.roughness !== undefined) {
        allMeshMaterials.push({
          objectType: type,
          objectName: obj.name,
          type: mat.constructor.name,
          color: mat.color?.getHex?.(),
          opacity: mat.opacity,
          transparent: mat.transparent,
          metalness: mat.metalness,
          roughness: mat.roughness,
          emissive: mat.emissive?.getHex?.(),
          side: mat.side,
        });
      }
    }

    // Capture edge materials
    if (type.includes('Line') && obj.material) {
      const mat = obj.material;
      allEdgeMaterials.push({
        objectType: type,
        objectName: obj.name,
        type: mat.constructor.name,
        color: mat.color?.getHex?.(),
        opacity: mat.opacity,
        linewidth: mat.linewidth,
      });
    }
  });

  return {
    meshMaterials: allMeshMaterials,
    edgeMaterials: allEdgeMaterials,
    visibilityState: visibilityState,
  };
}

/**
 * Capture camera state
 * @param {Camera} cameraWrapper - The Camera wrapper object (not THREE.Camera)
 */
function captureCamera(cameraWrapper) {
  if (!cameraWrapper) return null;

  // Get actual THREE.Camera from wrapper
  const threeCamera = cameraWrapper.getCamera();
  const position = cameraWrapper.getPosition();
  const rotation = cameraWrapper.getRotation();
  const zoom = cameraWrapper.getZoom();

  return {
    type: threeCamera.constructor.name,
    ortho: cameraWrapper.ortho,
    position: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rotation: {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
    },
    target: {
      x: cameraWrapper.target.x,
      y: cameraWrapper.target.y,
      z: cameraWrapper.target.z,
    },
    zoom: zoom,
    near: threeCamera.near,
    far: threeCamera.far,
  };
}

/**
 * Capture scene tree structure with material and light properties
 */
function captureSceneTree(scene) {
  if (!scene) return null;

  const counts = {
    meshes: 0,
    lines: 0,
    points: 0,
    lights: 0,
    groups: 0,
    helpers: 0,
    other: 0,
  };

  const materials = new Set();
  const geometries = new Set();

  // Capture sample material properties (from first mesh with material)
  let sampleMaterial = null;

  // Capture sample edge material (from first line with material)
  let sampleEdgeMaterial = null;

  // Capture ALL mesh materials (for nested group testing)
  const allMeshMaterials = [];

  // Capture ALL edge materials (for nested group testing)
  const allEdgeMaterials = [];

  // Capture all lights with their properties
  const lights = [];

  scene.traverse((obj) => {
    // Count object types
    const type = obj.constructor.name;
    if (type.includes('Mesh')) counts.meshes++;
    else if (type.includes('Line')) counts.lines++;
    else if (type.includes('Points')) counts.points++;
    else if (type.includes('Light')) counts.lights++;
    else if (type.includes('Group')) counts.groups++;
    else if (type.includes('Helper')) counts.helpers++;
    else if (type !== 'Scene') counts.other++;

    // Track material types
    if (obj.material) {
      materials.add(obj.material.constructor.name);

      // Capture first MeshStandardMaterial as sample (has metalness/roughness)
      if (!sampleMaterial && type.includes('Mesh') && obj.material.metalness !== undefined) {
        const mat = obj.material;
        sampleMaterial = {
          type: mat.constructor.name,
          color: mat.color?.getHex?.(),
          opacity: mat.opacity,
          transparent: mat.transparent,
          metalness: mat.metalness,
          roughness: mat.roughness,
          emissive: mat.emissive?.getHex?.(),
          side: mat.side,
        };
      }

      // Capture ALL mesh materials (for nested group testing)
      // Exclude helpers, sprites, and system objects - only include CAD meshes
      if (type.includes('Mesh') && !type.includes('Sprite')) {
        const mat = obj.material;
        // Only include materials that are PBR materials (have metalness/roughness)
        if (mat.metalness !== undefined && mat.roughness !== undefined) {
          allMeshMaterials.push({
            type: mat.constructor.name,
            color: mat.color?.getHex?.(),
            opacity: mat.opacity,
            transparent: mat.transparent,
            metalness: mat.metalness,
            roughness: mat.roughness,
            emissive: mat.emissive?.getHex?.(),
            side: mat.side,
          });
        }
      }

      // Capture first line material as sample (for black edges testing)
      if (!sampleEdgeMaterial && type.includes('Line')) {
        const mat = obj.material;
        sampleEdgeMaterial = {
          type: mat.constructor.name,
          color: mat.color?.getHex?.(),
          opacity: mat.opacity,
          linewidth: mat.linewidth,
        };
      }

      // Capture ALL edge materials (for nested group testing)
      // Exclude grid lines and helper lines - only include CAD edges
      if (type.includes('Line') && !obj.name.includes('grid') && !obj.name.includes('axis')) {
        const mat = obj.material;
        allEdgeMaterials.push({
          type: mat.constructor.name,
          color: mat.color?.getHex?.(),
          opacity: mat.opacity,
          linewidth: mat.linewidth,
        });
      }
    }

    // Track geometry types
    if (obj.geometry) {
      geometries.add(obj.geometry.constructor.name);
    }

    // Capture light properties
    if (obj.isLight) {
      lights.push({
        type: type,
        intensity: obj.intensity,
        color: obj.color?.getHex?.(),
        position: obj.position ? {
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
        } : null,
      });
    }
  });

  return {
    counts,
    materials: Array.from(materials).sort(),
    geometries: Array.from(geometries).sort(),
    totalChildren: scene.children.length,
    sampleMaterial,
    sampleEdgeMaterial,
    allMeshMaterials,
    allEdgeMaterials,
    lights,
  };
}

/**
 * Capture CAD object state from viewer
 * Returns structured data about loaded CAD shapes
 */
export function captureCADState(viewer) {
  if (!viewer.cadObjects || viewer.cadObjects.length === 0) {
    return { shapes: [] };
  }

  const shapes = viewer.cadObjects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    type: obj.type,
    visible: obj.visible,

    // Geometry stats
    geometry: obj.geometry ? {
      type: obj.geometry.constructor.name,
      vertexCount: obj.geometry.attributes?.position?.count,
      hasNormals: !!obj.geometry.attributes?.normal,
      hasColors: !!obj.geometry.attributes?.color,
      hasUVs: !!obj.geometry.attributes?.uv,
    } : null,

    // Material info
    material: obj.material ? {
      type: obj.material.constructor.name,
      opacity: obj.material.opacity,
      transparent: obj.material.transparent,
      color: obj.material.color?.getHex?.(),
    } : null,

    // Transform
    position: {
      x: obj.position?.x,
      y: obj.position?.y,
      z: obj.position?.z,
    },
    rotation: {
      x: obj.rotation?.x,
      y: obj.rotation?.y,
      z: obj.rotation?.z,
    },
    scale: {
      x: obj.scale?.x,
      y: obj.scale?.y,
      z: obj.scale?.z,
    },
  }));

  return { shapes };
}

/**
 * Load example data from file
 * Returns parsed example data
 *
 * Example files define global variables like: var box1 = {...};
 * We need to execute the code and extract the variable
 */
export async function loadExample(exampleName) {
  // In browser/happy-dom, we can use fetch or dynamic script loading
  // For simplicity, we'll use dynamic import with ?raw suffix if available
  // Otherwise, we need to read and eval the file

  try {
    // Try to load as raw text using Vite's ?raw suffix
    const examplePath = `../../examples/${exampleName}.js?raw`;
    const module = await import(examplePath);
    const code = module.default;

    // Execute the code in a sandboxed context
    // The variable name matches the filename (with hyphens converted to underscores)
    const varName = exampleName.replace(/-/g, '_');

    // Create a function that executes the code and returns the variable
    const fn = new Function(code + `\nreturn ${varName};`);
    const data = fn();

    return data;
  } catch (error) {
    console.error(`Failed to load example ${exampleName}:`, error);
    throw error;
  }
}

/**
 * Create a minimal snapshot for quick comparison
 * Useful for smoke tests
 */
export function captureMinimalSnapshot(viewer) {
  return {
    hasRenderer: !!viewer.renderer,
    hasScene: !!viewer.scene,
    hasCamera: !!viewer.camera,
    sceneChildCount: viewer.scene?.children.length || 0,
    cadObjectCount: viewer.cadObjects?.length || 0,
  };
}

/**
 * Capture complete rendering data for detailed comparison
 * Includes full geometry, materials, and transforms
 *
 * @param {Viewer} viewer - The viewer instance
 * @returns {Object} Complete rendering snapshot
 */
export function captureCompleteRendering(viewer) {
  const objects = [];

  viewer.scene.traverse((obj) => {
    // Skip scene root
    if (obj === viewer.scene) return;

    const objData = {
      name: obj.name,
      type: obj.constructor.name,
      visible: obj.visible,
    };

    // Check if this is a Sprite (which has extra buffer capacity in THREE.js)
    const isSprite = obj.constructor.name === 'Sprite';

    // Capture transform
    if (obj.position) {
      objData.position = {
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
      };
    }
    if (obj.rotation) {
      objData.rotation = {
        x: obj.rotation.x,
        y: obj.rotation.y,
        z: obj.rotation.z,
      };
    }
    if (obj.scale) {
      objData.scale = {
        x: obj.scale.x,
        y: obj.scale.y,
        z: obj.scale.z,
      };
    }

    // Capture geometry data
    if (obj.geometry) {
      const geo = obj.geometry;
      objData.geometry = {
        type: geo.constructor.name,
        id: geo.id,
      };

      // Capture attributes
      if (geo.attributes) {
        objData.geometry.attributes = {};

        // Position attribute (always present)
        if (geo.attributes.position) {
          const pos = geo.attributes.position;
          const posArray = Array.from(pos.array);
          objData.geometry.attributes.position = {
            itemSize: pos.itemSize,
            count: pos.count,
            // Sprites have extra buffer capacity in THREE.js - slice to used portion only
            array: isSprite ? posArray.slice(0, pos.count * pos.itemSize) : posArray,
          };
        }

        // Normal attribute
        if (geo.attributes.normal) {
          const normal = geo.attributes.normal;
          const normalArray = Array.from(normal.array);
          objData.geometry.attributes.normal = {
            itemSize: normal.itemSize,
            count: normal.count,
            // Sprites have extra buffer capacity - slice to used portion only
            array: isSprite ? normalArray.slice(0, normal.count * normal.itemSize) : normalArray,
          };
        }

        // Color attribute
        if (geo.attributes.color) {
          const color = geo.attributes.color;
          const colorArray = Array.from(color.array);
          objData.geometry.attributes.color = {
            itemSize: color.itemSize,
            count: color.count,
            // Sprites have extra buffer capacity - slice to used portion only
            array: isSprite ? colorArray.slice(0, color.count * color.itemSize) : colorArray,
          };
        }

        // UV attribute
        if (geo.attributes.uv) {
          const uv = geo.attributes.uv;
          const uvArray = Array.from(uv.array);
          objData.geometry.attributes.uv = {
            itemSize: uv.itemSize,
            count: uv.count,
            // Sprites have extra buffer capacity - slice to used portion only
            array: isSprite ? uvArray.slice(0, uv.count * uv.itemSize) : uvArray,
          };
        }
      }

      // Capture index (for indexed geometry)
      if (geo.index) {
        objData.geometry.index = {
          count: geo.index.count,
          array: Array.from(geo.index.array),
        };
      }

      // Capture bounding box/sphere if computed
      if (geo.boundingBox) {
        objData.geometry.boundingBox = {
          min: {
            x: geo.boundingBox.min.x,
            y: geo.boundingBox.min.y,
            z: geo.boundingBox.min.z,
          },
          max: {
            x: geo.boundingBox.max.x,
            y: geo.boundingBox.max.y,
            z: geo.boundingBox.max.z,
          },
        };
      }
    }

    // Capture material data
    if (obj.material) {
      const mat = obj.material;
      objData.material = {
        type: mat.constructor.name,
        id: mat.id,
      };

      // Common material properties
      if (mat.color !== undefined) {
        objData.material.color = mat.color.getHex();
      }
      if (mat.opacity !== undefined) {
        objData.material.opacity = mat.opacity;
      }
      if (mat.transparent !== undefined) {
        objData.material.transparent = mat.transparent;
      }

      // PBR material properties
      if (mat.metalness !== undefined) {
        objData.material.metalness = mat.metalness;
      }
      if (mat.roughness !== undefined) {
        objData.material.roughness = mat.roughness;
      }

      // Line material properties
      if (mat.linewidth !== undefined) {
        objData.material.linewidth = mat.linewidth;
      }

      // Point material properties
      if (mat.size !== undefined) {
        objData.material.size = mat.size;
      }
    }

    // Capture light properties
    if (obj.isLight) {
      objData.light = {
        intensity: obj.intensity,
      };
      if (obj.color) {
        objData.light.color = obj.color.getHex();
      }
    }

    objects.push(objData);
  });

  return {
    objects,
    objectCount: objects.length,
  };
}
