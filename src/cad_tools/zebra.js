/**
 * Zebra Analysis Tool for Three.js CAD Viewer
 * Visualizes surface continuity using alternating stripes
 */

export class ZebraTool {
  constructor() {
    this.originalMaterials = new Map();
    this.zebraMaterials = new Map();

    // Default settings
    this.settings = {
      stripeCount: 15,
      stripeDirection: 0, // angle in degrees
      colorScheme: "blackwhite", // 'blackwhite', 'colorful', 'grayscale'
      opacity: 1.0, // 0.0 = fully transparent (see original), 1.0 = fully opaque (only zebra)
      mappingMode: "normal", // 'reflection' (Onshape-like) or 'normal' (Fusion360/Shapr3D-like)
    };

    this.zebraTexture = null;
    this.createZebraTexture();
  }

  /**
   * Create the zebra stripe texture
   */
  createZebraTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 4096; // Increased from 1024 for higher resolution
    const ctx = canvas.getContext("2d");

    const stripeHeight = canvas.height / this.settings.stripeCount;

    for (let i = 0; i < this.settings.stripeCount; i++) {
      let color1, color2;

      switch (this.settings.colorScheme) {
        case "blackwhite":
          color1 = "#000000";
          color2 = "#ffffff";
          break;
        case "colorful":
          // Rainbow colors
          const hue = (i / this.settings.stripeCount) * 360;
          color1 = `hsl(${hue}, 100%, 50%)`;
          color2 = `hsl(${(hue + 180) % 360}, 100%, 50%)`;
          break;
        case "grayscale":
          // Simple alternating grayscale with wide contrast range
          // Light gray: 210 (0xD2, ~82%)
          // Dark gray: 70 (0x46, ~27%)
          color1 = "#D2D2D2"; // Always light
          color2 = "#464646"; // Always dark
          break;
      }

      ctx.fillStyle = i % 2 === 0 ? color1 : color2;
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
    }

    if (this.zebraTexture) {
      this.zebraTexture.dispose();
    }

    this.zebraTexture = new THREE.CanvasTexture(canvas);
    this.zebraTexture.wrapS = THREE.RepeatWrapping;
    this.zebraTexture.wrapT = THREE.RepeatWrapping;
    // Using default linear filtering for smooth stripes
    // High resolution (4096) prevents visible blurring even at close zoom
    this.zebraTexture.needsUpdate = true;

    // Update all existing zebra materials with the new texture
    this.zebraMaterials.forEach((material) => {
      material.uniforms.zebraTexture.value = this.zebraTexture;
      material.uniforms.zebraTexture.value.needsUpdate = true;
      material.uniformsNeedUpdate = true;
      material.needsUpdate = true;
    });
  }

  /**
   * Create zebra shader material
   */
  createZebraMaterial() {
    const angle = (this.settings.stripeDirection * Math.PI) / 180;
    // Fixed: Use cos/sin for proper screen-space orientation
    // 0° = vertical stripes, 90° = horizontal stripes
    const direction = new THREE.Vector3(
      Math.cos(angle),
      Math.sin(angle),
      0,
    ).normalize();

    return new THREE.ShaderMaterial({
      uniforms: {
        zebraTexture: { value: this.zebraTexture },
        direction: { value: direction },
        opacity: { value: this.settings.opacity },
        baseColor: { value: new THREE.Color(0.7, 0.7, 0.7) }, // Will be overridden per mesh
        mappingMode: {
          value: this.settings.mappingMode === "reflection" ? 0 : 1,
        }, // 0 = reflection, 1 = normal
      },
      vertexShader: `
                varying vec3 vViewNormal;
                varying vec3 vViewPosition;
                varying vec4 vScreenPosition;

                void main() {
                    // Transform normal to view space
                    vViewNormal = normalize(normalMatrix * normal);

                    // Transform position to view space
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = mvPosition.xyz;

                    gl_Position = projectionMatrix * mvPosition;

                    // Store screen position for normal mode
                    vScreenPosition = gl_Position;
                }
            `,
      fragmentShader: `
                uniform sampler2D zebraTexture;
                uniform vec3 direction;
                uniform float opacity;
                uniform vec3 baseColor;
                uniform int mappingMode; // 0 = reflection, 1 = normal

                varying vec3 vViewNormal;
                varying vec3 vViewPosition;
                varying vec4 vScreenPosition;

                void main() {
                    // Normalize view-space normal
                    vec3 normal = normalize(vViewNormal);

                    float v;

                    if (mappingMode == 0) {
                        // Reflection mode (Onshape-like): circular/elliptical stripes
                        // View direction in view space (points toward camera)
                        vec3 viewDir = normalize(-vViewPosition);

                        // Calculate reflection in view space
                        vec3 mappingVector = reflect(-viewDir, normal);

                        // Use the reflection vector with screen-space direction
                        v = dot(mappingVector, direction) * 3.0 * 0.5 + 0.5;
                    } else {
                        // Normal mode (Fusion360/Shapr3D-like): zoom-independent view-based stripes
                        // Use view direction normalized by distance (zoom-independent)

                        // Normalize view position by distance to make it zoom-independent
                        float dist = length(vViewPosition);
                        vec2 viewDir2D = vViewPosition.xy / dist;

                        // Rotate by stripe direction
                        float cosA = direction.x / length(direction.xy);
                        float sinA = direction.y / length(direction.xy);
                        float rotatedPos = viewDir2D.x * cosA + viewDir2D.y * sinA;

                        // Scale for stripe frequency (zoom-independent)
                        float positionValue = rotatedPos * 2.0;

                        // Add normal influence to follow curvature
                        float normalValue = dot(normal, direction) * 0.5;

                        // Combine: position creates base stripes, normal makes them follow curvature
                        v = (positionValue + normalValue) * 3.0 * 0.5 + 0.5;
                    }

                    // Sample the zebra texture (texture varies in V/Y direction)
                    vec4 zebraColor = texture2D(zebraTexture, vec2(0.5, v));

                    // Blend zebra stripes with original material color based on opacity
                    vec3 finalColor = mix(baseColor, zebraColor.rgb, opacity);

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Apply zebra material to a mesh
   */
  applyToMesh(mesh, visible) {
    if (!mesh.isMesh) return;

    // Skip objects marked to be excluded
    if (mesh.userData.excludeFromZebra) return;

    // Store original material
    if (!this.originalMaterials.has(mesh.uuid)) {
      this.originalMaterials.set(mesh.uuid, mesh.material);
    }

    // Create or reuse zebra material
    if (!this.zebraMaterials.has(mesh.uuid)) {
      const zebraMaterial = this.createZebraMaterial();

      // Extract color from original material
      const originalMaterial = mesh.material;
      let baseColor = new THREE.Color(0.7, 0.7, 0.7); // Default gray

      if (originalMaterial.color) {
        baseColor = originalMaterial.color.clone();
      } else if (originalMaterial.map) {
        // If there's a texture but no color, use white as base
        baseColor = new THREE.Color(1, 1, 1);
      }

      // Set the base color uniform
      zebraMaterial.uniforms.baseColor = { value: baseColor };

      this.zebraMaterials.set(mesh.uuid, zebraMaterial);
    }

    mesh.material = this.zebraMaterials.get(mesh.uuid);
    mesh.material.visible = visible;
  }

  /**
   * Restore original material to a mesh
   */
  restoreMesh(mesh, visible) {
    if (!mesh.isMesh) return;

    const originalMaterial = this.originalMaterials.get(mesh.uuid);
    if (originalMaterial) {
      mesh.material = originalMaterial;
      mesh.material.visible = visible;
    }
  }

  /**
   * Update stripe count
   */
  setStripeCount(count) {
    this.settings.stripeCount = Math.max(2, Math.min(50, count));
    this.createZebraTexture();
  }

  /**
   * Update stripe direction (in degrees, 0-90° is sufficient)
   */
  setStripeDirection(angle) {
    this.settings.stripeDirection = angle;
    const radians = (angle * Math.PI) / 180;
    // Fixed: Use cos/sin for proper screen-space orientation
    const direction = new THREE.Vector3(
      Math.cos(radians),
      Math.sin(radians),
      0,
    ).normalize();

    this.zebraMaterials.forEach((material) => {
      material.uniforms.direction.value = direction;
    });
  }

  /**
   * Update color scheme
   */
  setColorScheme(scheme) {
    if (["blackwhite", "colorful", "grayscale"].includes(scheme)) {
      this.settings.colorScheme = scheme;
      this.createZebraTexture();
    }
  }

  /**
   * Update stripe opacity (0.0 = show original material, 1.0 = full zebra)
   */
  setStripeOpacity(opacity) {
    this.settings.opacity = Math.max(0, Math.min(1, opacity));
    this.zebraMaterials.forEach((material) => {
      material.uniforms.opacity.value = this.settings.opacity;
    });
  }

  /**
   * Update mapping mode ('reflection' = Onshape-like, 'normal' = Fusion360/Shapr3D-like)
   */
  setMappingMode(mode) {
    if (["reflection", "normal"].includes(mode)) {
      this.settings.mappingMode = mode;
      const modeValue = mode === "reflection" ? 0 : 1;
      this.zebraMaterials.forEach((material) => {
        material.uniforms.mappingMode.value = modeValue;
        material.uniformsNeedUpdate = true;
        material.needsUpdate = true;
      });
    }
  }

  /**
   * Update camera position for shaders (call in render loop)
   */
  update(camera) {
    // No longer needed - view space calculations handle this automatically
    // This method is kept for API compatibility
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.zebraTexture) {
      this.zebraTexture.dispose();
    }

    this.zebraMaterials.forEach((material) => {
      material.dispose();
    });

    this.originalMaterials.clear();
    this.zebraMaterials.clear();
  }
}
