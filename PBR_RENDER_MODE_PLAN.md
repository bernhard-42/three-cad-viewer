# Plan: Per-Object PBR Materials & Studio Mode

> **Post-implementation note (2026-03-15):** `studioOptions` has been moved from
> shape data (`Shapes.studioOptions`) to viewer-level configuration (`ViewerOptions`).
> Studio settings (environment, background, shadows, AO, tone mapping) describe the
> physical studio, not the objects, and belong alongside other viewer options. References
> to `studioOptions` on shapes throughout this design doc reflect the original plan;
> the implementation uses `studioEnvironment`, `studioBackground`, etc. in `viewerOptions`.

**Branch**: `studio` (all implementation work happens here, merged to `master` when complete)

## Vision

The viewer remains a fully functional CAD viewer with all existing features unchanged.
A new **Studio** tab provides a "how will it look in reality" environment where per-object
material appearances are applied, lighting is upgraded, and environment-based reflections
bring physical materials to life.

---

## Architecture Overview

```
                       ┌──────────────┐
                       │  Shapes Data │
                       │  (input)     │
                       └──────┬───────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
  existing fields       new: material          new: materials,
  color, alpha,         (string tag on         textures,
  renderback, ...       leaf nodes)            studioOptions
                                               (root level)
       │                      │                      │
       ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│                         Viewer                            │
│                                                           │
│  Tabs: Tree | Clip | Zebra | Material | Studio            │
│         ─── inspection ───   ── appearance ──             │
│                                                           │
│  ┌─────────────────┐              ┌────────────────────┐ │
│  │ CAD Mode        │  tab switch  │ Studio Mode        │ │
│  │ (tree/clip/     │ ◄──────────► │ (studio tab)       │ │
│  │  zebra/material)│              │                    │ │
│  └────────┬────────┘              └─────────┬──────────┘ │
│           │                                 │            │
│           ▼                                 ▼            │
│  MeshStandardMaterial            MeshPhysicalMaterial     │
│  global metal/rough              per-object materials     │
│  camera-follow light             environment map + IBL    │
│  no tone mapping                 pure IBL (no scene lights)│
│  no environment                  PBR Neutral tone mapping │
│  clipping works                  no clipping              │
│  edges always shown              edges togglable          │
└──────────────────────────────────────────────────────────┘
```

---

## Part 1: Data Format Changes

### 1.1 New `material` Field on Leaf Nodes

Add an optional `material` string field on any leaf node (alongside `color`,
`alpha`, etc.). This is a **tag** that references a material definition in the
root-level `materials` table or a built-in preset. When present AND the viewer
is in Studio mode, this overrides the global material settings for that object.

TypeScript type: `material?: string`

This matches build123d's existing `shape.material` string attribute (described
as "tag for external tools"), so no changes to build123d are needed. The string
set on the Python side flows through ocp-tessellate into the JSON data format
and is read by three-cad-viewer.

**Material resolution order** when `material` is set:

1. Look up in root-level `materials` table → user-defined material library
2. Look up in built-in presets → `"stainless-steel"`, `"glass-clear"`, etc.
3. No match → warning, fall back to global metalness/roughness

```js
{
  name: "Body",
  id: "/Car/Body",
  type: "shapes",
  color: "#cc0000",          // CAD mode color (always used in CAD mode)
  alpha: 1.0,
  material: "car-paint",     // NEW: tag → resolved via materials table / presets
  shape: { /* ... */ },
}
```

All material definitions live in the root-level `materials` table (see 1.4) or
in the built-in preset library (see 1.6). Leaf nodes carry only a string tag,
never inline material definitions. This keeps the data format clean and
avoids duplicating material definitions across multiple leaf nodes.

### 1.2 MaterialAppearance Interface (Internal)

**Note:** `MaterialAppearance` is an **internal type** used by `MATERIAL_PRESETS` and
the builtin-preset code path in `createStudioMaterial()`. It is NOT accepted as a value
in the `materials` dict input. The `materials` dict accepts only `string` (builtin
reference) or `MaterialXMaterial` (materialx-db format). See Section 1.8.

All fields are optional. Only provided fields override defaults. In Studio mode
the viewer always uses MeshPhysicalMaterial (see Part 2.5). Properties left
unset default to their "off" values (transmission=0, clearcoat=0, etc.) which
the shader skips at near-zero cost.

Texture fields reference either:
- A key into the root-level `textures` table (e.g. `"wood_basecolor"`)
- A relative URL resolved against the HTML page (e.g. `"textures/wood.jpg"`)
- An absolute URL or data URI (e.g. `"data:image/png;base64,..."`)

The viewer tries the root-level `textures` table first; if no match, treats the
string as a URL.

```
MaterialAppearance {
  name?:            string          // Display name

  // Color
  baseColor?:       [r, g, b, a]   // sRGB RGBA, 0-1. Converted to linear by material factory. Overrides leaf color/alpha.
  baseColorTexture?:string          // Texture reference (see above)

  // Metallic-Roughness PBR
  metallic?:        number          // 0-1, default 0.0
  roughness?:       number          // 0-1, default 0.5

  // Textures (Standard)
  normalTexture?:          string
  occlusionTexture?:       string
  metallicRoughnessTexture?: string

  // Emissive
  emissive?:               [r, g, b]   // Linear RGB
  emissiveTexture?:        string
  emissiveStrength?:       number       // default 1.0

  // Alpha
  alphaMode?:   "OPAQUE" | "MASK" | "BLEND"
  alphaCutoff?: number                  // default 0.5

  // --- Below: require MeshPhysicalMaterial ---

  // Transmission (glass, water)
  transmission?:           number       // 0-1
  transmissionTexture?:    string

  // Clearcoat (car paint, varnish)
  clearcoat?:              number       // 0-1
  clearcoatRoughness?:     number
  clearcoatTexture?:       string
  clearcoatRoughnessTexture?: string
  clearcoatNormalTexture?: string

  // Volume (subsurface: jade, wax, skin)
  thickness?:              number
  thicknessTexture?:       string
  attenuationDistance?:    number
  attenuationColor?:       [r, g, b]

  // IOR
  ior?:                    number       // default 1.5

  // Specular
  specularIntensity?:      number       // 0-1 (maps to MeshPhysicalMaterial.specularIntensity)
  specularColor?:          [r, g, b]
  specularIntensityTexture?: string
  specularColorTexture?:   string

  // Sheen (fabric, velvet)
  sheen?:                  number       // 0-1, intensity of sheen layer (required to enable sheen)
  sheenColor?:             [r, g, b]
  sheenRoughness?:         number
  sheenColorTexture?:      string
  sheenRoughnessTexture?:  string

  // Anisotropy (brushed metal)
  anisotropy?:             number       // 0-1 (maps to MeshPhysicalMaterial.anisotropy)
  anisotropyRotation?:     number       // radians
  anisotropyTexture?:      string

  // Misc
  unlit?:                  boolean      // Use MeshBasicMaterial
  doubleSided?:            boolean      // THREE.DoubleSide
}
```

### 1.3 New Root-Level `textures` Table

A shared lookup table for texture data, defined on the root `Shapes` node. This
follows the same pattern as GDS `instances` -- a centralized data store referenced
by leaf nodes.

```js
{
  version: 3,
  name: "Assembly",
  id: "/Assembly",
  bb: { /* ... */ },

  // NEW: shared texture data (referenced by MaterialAppearance texture fields)
  textures: {
    "wood_basecolor": {
      data: "<base64-encoded image>",
      format: "png",                      // or "jpg", "webp"
    },
    "wood_normal": {
      data: "<base64-encoded image>",
      format: "png",
    },
    "metal_roughness": {
      url: "https://example.com/textures/metal_rough.jpg",
    },
  },

  parts: [ /* ... */ ],
}
```

Each entry in `textures` is either:
- **Embedded**: `{ data: string, format: string }` -- base64-encoded image data
  (same structure as the existing `texture` field on leaf nodes)
- **URL reference**: `{ url: string }` -- loaded on demand from the given URL

**Benefits:**
- Deduplication: multiple objects can reference the same texture key
- Embedding: ideal for Jupyter notebooks where textures arrive as base64
- Flexibility: mix embedded and URL-based textures

**Texture resolution order** when a MaterialAppearance texture field contains a
string value (simplified; see Part 4.2 for the complete order including `builtin:`
prefix):

1. Look up in root-level `textures` table → if found, use that entry
2. If starts with `data:` → treat as data URI, load directly
3. Otherwise → treat as URL, resolve relative to the HTML page

**Note (materialx-db):** Materials using the `MaterialXMaterial` format (Section 1.8)
carry their own textures as inline data URIs in the material's `textures` dict. They
do NOT reference the root-level `textures` table. The root-level table remains available
for builtin preset materials that reference shared textures.

### 1.4 New Root-Level `materials` Table

A user-defined material library on the root `Shapes` node. Same pattern as
`textures` and GDS `instances` -- a centralized dictionary referenced by leaf
nodes via their `material` field.

**TypeScript type:** `Record<string, string | MaterialXMaterial>`

Values in the `materials` dict can be:
- `string` starting with `"builtin:"` -- resolves to a builtin preset from `MATERIAL_PRESETS`
- `MaterialXMaterial` object (detected by `params` key) -- materialx-db format (see Section 1.8)

```js
{
  version: 3,
  name: "Car",
  id: "/Car",
  bb: { /* ... */ },

  materials: {
    // Builtin preset references
    "tire":       "builtin:rubber-black",
    "trim":       "builtin:brushed-aluminum",
    // materialx-db entries (from Python's materialx-db library)
    "car-paint":  { params: { color: [0.8, 0, 0], metalness: 0.5, roughness: 0.2,
                              clearcoat: 1.0, clearcoatRoughness: 0.03 } },
    "windshield": { params: { transmission: 1.0, roughness: 0.0, ior: 1.52,
                              thickness: 5.0, color: [1, 1, 1] } },
  },

  parts: [
    { name: "Body",  material: "car-paint",  shape: {/*...*/} },
    { name: "Glass", material: "windshield", shape: {/*...*/} },
    { name: "Strip", material: "trim",       shape: {/*...*/} },
    { name: "Wheel", material: "tire",       shape: {/*...*/} },
  ],
}
```

This separates the **what** (material definition) from the **where** (which
object uses it). Multiple objects can reference the same material key, and
the library can be reused across projects.

**Material resolution order** (same as 1.1):

1. Look up `material` tag in root-level `materials` table:
   - `string` with `"builtin:"` prefix → resolve in `MATERIAL_PRESETS`
   - `MaterialXMaterial` object → use directly with `createStudioMaterialFromMaterialX()`
2. Look up directly in built-in presets by tag name
3. No match → warning, fall back to global metalness/roughness

**Why `materials` instead of path-based mapping:**

Object paths (`/Car/Chassis/Body`) are structural -- they change when the model
hierarchy changes (e.g., inserting a sub-assembly). Material tags are semantic
-- they describe what the object *is*, not where it *sits*. On the Python side,
the user tags each object with a material name once, and the tag travels with
the object regardless of hierarchy changes:

```python
# Python side (build123d)
from materialx_db import MaterialXDB
db = MaterialXDB()

materials = {
    "car-paint":  db.get_threejs("gpuopen:Car_Paint", color_override=[0.8, 0, 0]),
    "windshield": db.get_threejs("gpuopen:Glass"),
    "tire":       "builtin:rubber-black",
}

body.material = "car-paint"       # build123d .material attribute (already exists)
glass.material = "windshield"     # survives any restructuring

show(assembly, materials=materials)
```

### 1.5 New `studioOptions` on Root Node

Optional root-level configuration for the rendering environment. Only used when
the Studio tab is active.

```js
{
  version: 3,
  name: "Assembly",
  id: "/Assembly",
  bb: { /* ... */ },
  textures: { /* ... */ },

  // NEW: rendering environment configuration
  studioOptions: {
    // Environment map
    environment?: "studio",              // Preset slug (e.g. "studio_small_03") or custom HDR URL; "studio" = RoomEnvironment; "none" = no env
    envIntensity?: 0.5,                  // environment map intensity (0-1)

    // Background
    background?: "gradient",             // "grey" | "white" | "gradient" | "environment" | "transparent"
    showFloor?: false,                   // show grid floor below objects

    // Tone mapping
    toneMapping?: "neutral",             // "neutral" | "AgX" | "ACES" | "none"
    toneMappingExposure?: 1.0,

    // Edges
    showEdges?: false,                   // default: hide edges in Studio mode

    // Resolution
    use4kEnvMaps?: false,                // use 4K Poly Haven presets instead of 2K
  },

  parts: [ /* ... */ ],
}
```

**`studioOptions` → ViewerState mapping:** The `StudioOptions` interface uses
a flat format (no nested `StudioEnvironmentOptions`). The `StudioOptions`
TypeScript interface in `types.ts` has been updated to match this flat format.

| studioOptions field | ViewerState key | Default |
|---|---|---|
| `environment` | `studioEnvironment` (string: "studio" / preset slug / custom URL / "none") | `"studio"` |
| `envIntensity` | `studioEnvIntensity` | `0.5` |
| `background` | `studioBackground` (StudioBackground enum) | `"gradient"` |
| `showFloor` | `studioShowFloor` | `false` |
| `toneMapping` | `studioToneMapping` | `"neutral"` |
| `toneMappingExposure` | `studioExposure` | `1.0` |
| `showEdges` | `studioShowEdges` | `false` |

### 1.6 Built-in Material Presets

The viewer ships with a dictionary of named material definitions. These serve as
a base library that the user-defined `materials` table (1.4) extends. Both are
referenced the same way via the leaf node's `material` string field:

```js
// Reference a built-in preset directly
{ name: "Bolt", material: "stainless-steel", shape: {/*...*/} }

// Reference a user-defined material from root-level materials table
{ name: "Body", material: "car-paint", shape: {/*...*/} }

// Override a built-in preset via the root materials table:
// In root materials: { "custom-steel": { preset: "stainless-steel", roughness: 0.8 } }
{ name: "Bolt", material: "custom-steel", shape: {/*...*/} }
```

User-defined `materials` entries take priority over built-in presets with the
same name, allowing users to override any built-in preset.

#### Material Preset Library

Presets are pure parameter sets (no textures, no file size cost). Grouped by
category, 31 presets covering common engineering and product materials.

**Metals -- Polished**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `chrome` | [0.95, 0.95, 0.95, 1] | 1.0 | 0.05 | | Mirror-finish chrome plating |
| `polished-steel` | [0.8, 0.8, 0.82, 1] | 1.0 | 0.1 | | Polished stainless steel |
| `polished-aluminum` | [0.91, 0.92, 0.93, 1] | 1.0 | 0.1 | | Polished aluminum |
| `gold` | [1.0, 0.84, 0.0, 1] | 1.0 | 0.1 | | Gold / gold plating |
| `copper` | [0.95, 0.64, 0.54, 1] | 1.0 | 0.15 | | Polished copper |
| `brass` | [0.89, 0.79, 0.45, 1] | 1.0 | 0.15 | | Polished brass |

**Metals -- Matte/Brushed**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `stainless-steel` | [0.8, 0.8, 0.82, 1] | 1.0 | 0.4 | | Brushed stainless steel |
| `brushed-aluminum` | [0.91, 0.92, 0.93, 1] | 1.0 | 0.35 | anisotropy: 0.5 | Brushed aluminum |
| `cast-iron` | [0.42, 0.42, 0.43, 1] | 0.9 | 0.7 | | Cast iron |
| `titanium` | [0.62, 0.58, 0.55, 1] | 1.0 | 0.45 | | Titanium alloy |
| `galvanized` | [0.75, 0.75, 0.78, 1] | 0.8 | 0.5 | | Galvanized steel |

**Plastics**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `plastic-glossy` | [0.8, 0.8, 0.8, 1] | 0.0 | 0.15 | | Glossy injection-molded plastic |
| `plastic-matte` | [0.8, 0.8, 0.8, 1] | 0.0 | 0.6 | | Matte/textured plastic |
| `abs-black` | [0.05, 0.05, 0.05, 1] | 0.0 | 0.4 | | Black ABS |
| `nylon` | [0.9, 0.87, 0.82, 1] | 0.0 | 0.55 | | Natural nylon / PA |
| `acrylic-clear` | [1.0, 1.0, 1.0, 1] | 0.0 | 0.0 | transmission: 0.95, ior: 1.49 | Clear acrylic / PMMA |

**Glass & Transparent**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `glass-clear` | [1.0, 1.0, 1.0, 1] | 0.0 | 0.0 | transmission: 1.0, ior: 1.52, thickness: 2.0 | Clear glass |
| `glass-tinted` | [0.6, 0.8, 0.9, 1] | 0.0 | 0.0 | transmission: 0.9, ior: 1.52, thickness: 3.0 | Tinted glass |
| `glass-frosted` | [1.0, 1.0, 1.0, 1] | 0.0 | 0.3 | transmission: 0.85, ior: 1.52, thickness: 2.0 | Frosted/etched glass |

**Rubber & Elastomers**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `rubber-black` | [0.08, 0.08, 0.08, 1] | 0.0 | 0.9 | | Black rubber / EPDM |
| `rubber-gray` | [0.35, 0.35, 0.35, 1] | 0.0 | 0.85 | | Gray silicone rubber |
| `rubber-red` | [0.7, 0.1, 0.1, 1] | 0.0 | 0.8 | | Colored rubber gasket |

**Painted Surfaces**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `paint-matte` | [0.8, 0.8, 0.8, 1] | 0.0 | 0.7 | | Matte paint / powder coat |
| `paint-glossy` | [0.8, 0.8, 0.8, 1] | 0.0 | 0.15 | | Glossy paint |
| `paint-metallic` | [0.8, 0.8, 0.8, 1] | 0.5 | 0.25 | | Metallic automotive paint |
| `car-paint` | [0.8, 0.0, 0.0, 1] | 0.5 | 0.2 | clearcoat: 1.0, clearcoatRoughness: 0.03 | Clearcoated car paint |

**Natural / Other**

| Name | baseColor | metallic | roughness | Other | Use Case |
|------|-----------|----------|-----------|-------|----------|
| `wood-light` | [0.76, 0.60, 0.42, 1] | 0.0 | 0.6 | | Light wood (maple, birch) |
| `wood-dark` | [0.35, 0.22, 0.12, 1] | 0.0 | 0.55 | | Dark wood (walnut) |
| `ceramic-white` | [0.95, 0.95, 0.93, 1] | 0.0 | 0.1 | | Glazed ceramic |
| `carbon-fiber` | [0.05, 0.05, 0.05, 1] | 0.3 | 0.35 | anisotropy: 0.3 | Carbon fiber composite |
| `concrete` | [0.65, 0.63, 0.60, 1] | 0.0 | 0.85 | | Concrete / cement |

Note: All `baseColor` values in the preset tables are **sRGB** (not linear).
The material factory converts them to linear via `Color.setRGB(..., SRGBColorSpace)`.
Presets use neutral `baseColor` where appropriate (plastics, paints). The
leaf node's `color` field provides the actual color. When the resolved material
has no `baseColor` set, the leaf's `color` (CSS hex) is used directly as the
base color (CSS hex values are already sRGB). The material factory handles the
sRGB-to-linear conversion transparently for both preset baseColor values and
leaf color fallbacks.

The preset tables in this document are illustrative; the canonical values are
in `material-presets.ts`.

```js
// Red glossy plastic -- color from leaf, material behavior from preset
{ color: "#cc0000", material: "plastic-glossy" }

// Car paint with custom color -- override in root materials table:
// materials: { "blue-car-paint": { preset: "car-paint", baseColor: [0, 0, 0.8, 1] } }
{ color: "#cc0000", material: "blue-car-paint" }
```

### 1.7 Built-in Texture Presets

The viewer ships with a small set of procedurally generated tileable textures,
mainly **normal maps** for surface finishes. These are generated at startup via
Canvas2D (no external files, ~1-2 KB of generation code each, generates 256x256
textures).

Texture presets can be referenced in MaterialAppearance texture fields using a
`builtin:` prefix:

```js
// In root-level materials table:
materials: {
  "brushed-steel": {
    preset: "stainless-steel",
    normalTexture: "builtin:brushed",     // built-in brushed-metal normal map
  },
}
```

**Resolution order** (updated from 1.3):
1. Starts with `builtin:` → use built-in procedural texture
2. Look up in root-level `textures` table → use that entry
3. Starts with `data:` → data URI
4. Otherwise → URL relative to HTML page

#### Procedurally Generated Textures (bundled, zero file size)

Generated via Canvas2D at first use, cached as `THREE.CanvasTexture`, tileable.
Uses a deterministic PRNG for reproducible output.

| Name | Type | Description | Generation |
|------|------|-------------|------------|
| `builtin:brushed` | Normal map | Directional brushed-metal lines | Horizontal noise streaks |
| `builtin:knurled` | Normal map | Diamond knurl pattern | Repeating diamond grid |
| `builtin:sandblasted` | Normal map | Fine random grain | Perlin/simplex noise |
| `builtin:hammered` | Normal map | Hammered/peened surface | Random crater bumps |
| `builtin:checker` | Base color | Black/white checkerboard | Grid pattern (debug/UV test) |
| `builtin:wood-dark` | **Base color (sRGB)** | Dark walnut wood grain | Concentric growth rings with noise perturbation |
| `builtin:leather` | Normal map | Pebbled leather grain | Voronoi-cell dome shapes |
| `builtin:fabric-weave` | Normal map | Twill weave pattern | 2/1 twill repeat |

8 builtin textures covering common surface finishes and material types.
`wood-dark` is the first color-type builtin (all others are normal maps or
patterns), demonstrating that procedural textures can provide base color as
well as surface detail.

Example combinations:
- `brushed` + `brushed-aluminum` preset → realistic brushed aluminum
- `knurled` + `stainless-steel` preset → knurled grip surface
- `sandblasted` + any metal preset → matte blasted finish
- `hammered` + `copper` preset → hammered copper bowl
- `wood-dark` + `wood-dark` preset → walnut wood with grain texture
- `leather` + any low-roughness dielectric → pebbled leather surface
- `fabric-weave` + sheen-enabled material → woven fabric

#### Downloadable Texture Pack (v2 roadmap)

A downloadable texture pack with photographic-quality textures (carbon fiber,
wood grain, leather, diamond plate, concrete) is planned for v2. It will use a
`pack:` prefix resolved against a configurable CDN URL. For v1, users provide
their own textures via the root `textures` table (embedded or URL).

### 1.8 Summary of Format Changes

| Change | Location | Required? | Backward Compatible? |
|--------|----------|-----------|---------------------|
| `material` | Leaf nodes | Optional | Yes -- ignored by older viewers |
| `materials` | Root node | Optional | Yes -- ignored by older viewers |
| `textures` | Root node | Optional | Yes -- ignored by older viewers |
| `studioOptions` | Root node | Optional | Yes -- ignored by older viewers |
| Material presets | Built-in | N/A | `material: "stainless-steel"` -- ignored by older viewers |
| Texture presets | Built-in | N/A | `"builtin:brushed"` -- ignored by older viewers |
| `uvs` | Shape interface (leaf shapes) | Optional | Yes -- ignored by older viewers |

Existing fields (`color`, `alpha`, `renderback`, `texture`) are unchanged and
continue to work exactly as before. No version bump needed (both v2 and v3 work).

### 1.9 Python-Side Data Contract

The viewer consumes a JSON tree produced by ocp-tessellate (Python). For the
material system to work end-to-end, ocp-tessellate must emit the following
fields. The transport layers (WebSocket for VS Code, traitlets for Jupyter)
pass JSON through transparently and need no changes.

**Changes needed in ocp-tessellate:**

1. **Leaf nodes**: Read `shape.material` from build123d objects (this string
   attribute already exists, described as "tag for external tools"). Emit it
   as the `material` field on the corresponding leaf node in the output tree.

2. **Root node**: Accept user-provided `materials`, `textures`, and
   `studioOptions` dicts from the `show()` function and attach them to the
   root node of the output tree.

**Changes needed in ocp-vscode / jupyter-cadquery:**

Accept `materials=`, `textures=`, and `studio_options=` keyword arguments in
`show()` / `show_object()` and pass them to ocp-tessellate. Both already
accept `**kwargs`, so this is a minimal change.

**Naming convention**: Python uses `snake_case` (`studio_options`), JavaScript
uses `camelCase` (`studioOptions`). The viewer's `ViewerState` already handles
this conversion for existing attributes. ocp-tessellate emits `camelCase` keys
in the JSON output (consistent with the existing data format).

**No changes needed in:**
- build123d (`.material` attribute already exists)
- VS Code extension (WebSocket passes JSON transparently)
- cad-viewer-widget (traitlets pass shapes tree as-is)

**CadQuery note:** CadQuery shapes do not have a built-in `.material` attribute,
but Python's dynamic nature allows users to simply assign one:
`shape.material = "chrome"`. ocp-tessellate picks it up via
`getattr(obj, 'material', None)`, so no CadQuery code changes are needed.

**End-to-end example:**

```python
# Python side (build123d)
from build123d import *

body = Box(100, 50, 20)
body.material = "car-paint"          # existing build123d attribute

glass = Box(80, 40, 2)
glass.material = "windshield"

from materialx_db import MaterialXDB
db = MaterialXDB()

materials = {
    "car-paint":  db.get_threejs("gpuopen:Car_Paint", color_override=[0.8, 0, 0]),
    "windshield": db.get_threejs("gpuopen:Glass"),
}

show(body, glass, materials=materials)
# → ocp-tessellate emits material tags on leaves + materials dict on root
# → transport layer delivers JSON to three-cad-viewer
# → viewer resolves material tags in Studio mode
```

### 1.10 materialx-db Integration (MaterialXMaterial Format)

In addition to builtin presets (string tags resolving to `MATERIAL_PRESETS`), the
`materials` table accepts **materialx-db format** entries produced by the
[materialx-db](https://pypi.org/project/materialx-db/) Python library. This library
catalogs 3,200+ PBR materials from ambientCG, GPUOpen, PolyHaven, and PhysicallyBased,
exporting them as self-contained JSON with Three.js `MeshPhysicalMaterial`-compatible
params and base64-encoded textures.

The `materials` table accepts two value types:

| Format | Type | Detection | Example |
|--------|------|-----------|---------|
| Builtin preset reference | `string` | Starts with `"builtin:"` | `"builtin:car-paint"` |
| materialx-db entry | `MaterialXMaterial` | Has `params` key | `{ params: {...}, textures: {...} }` |

**MaterialXMaterial interface:**

```typescript
interface MaterialXMaterial {
  params: Record<string, unknown>;          // MeshPhysicalMaterial props (linear RGB colors)
  textures?: Record<string, string>;        // Texture data URIs keyed by path refs in params
  colorOverride?: [number, number, number]; // Optional linear RGB, replaces params.color
  id?: string;                              // Source database material ID
  name?: string;                            // Display name
  source?: string;                          // Source database (e.g., "gpuopen")
  category?: string;                        // Material category (e.g., "metal")
}
```

Detection is by presence of the `params` key (type guard: `isMaterialXMaterial()`).

**Key differences from MaterialAppearance (builtin presets):**
- Colors are in **linear RGB** (not sRGB) — use `new THREE.Color(r, g, b)` directly, no conversion
- Texture references are strings like `"textures/basecolor.png"` in `params`, keyed into
  the material's own `textures` dict (inline data URIs), NOT the root-level `Shapes.textures` table
- Property names are **Three.js MeshPhysicalMaterial property names** (e.g., `color`, `map`,
  `normalMap`, `roughnessMap`) rather than MaterialAppearance field names (e.g., `baseColor`,
  `baseColorTexture`, `normalTexture`)
- `colorOverride` replaces `params.color` and removes `params.map` (base color texture),
  allowing the user to set a custom tint while keeping the material's other properties

**Python usage:**

```python
from materialx_db import MaterialXDB
db = MaterialXDB()
materials = {
    "oak":   db.get_threejs("ambientcg:Wood049"),
    "steel": "builtin:stainless-steel",
    "body":  db.get_threejs("gpuopen:Car_Paint", color_override=[0.8, 0, 0]),
}
show(assembly, materials=materials)
```

---

## Part 2: Viewer Changes

### 2.1 Tab Reordering

The tab bar is reordered to group inspection tools before appearance tools:

```
Before:  Tree | Clip | Material | Zebra
After:   Tree | Clip | Zebra | Material | Studio
```

**Rationale**: Tree, Clip, and Zebra are all inspection/analysis tools. Material
and Studio are both about visual appearance, so they sit side-by-side at the end.
This also places Studio as the rightmost tab, a natural "final step" in the
workflow.

**Implementation:**
- Reorder the `<input>` elements in `index.html`
- Update `ActiveTab` type: `"tree" | "clip" | "zebra" | "material" | "studio"`
- Update `switchToTab()` in `display.ts` for the new order
- This is a minor breaking change for anyone relying on tab position, but the
  `setActiveTab("material")` API uses names, not positions, so it's safe.

### 2.2 New "Studio" Tab

**Tab label**: "Studio"

**Controls on the Studio tab:**

| Control | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| Environment | Dropdown | "Built-in (procedural)" | 38 options in 8 `<optgroup>` categories (see Part 3) + "None" | Choose environment map for IBL |
| Env Intensity | Slider | 0.5 | 0-1.0 (slider 0-200) | Scale environment reflections and illumination |
| Background | Dropdown | "Gradient" | "Grey" / "White" / "Gradient" / "Environment" / "Transparent" | Scene background mode |
| Show Floor | Checkbox | off | on/off | Show grid floor below objects |
| Tone Mapping | Dropdown | "PBR Neutral" | "PBR Neutral" / "ACES Filmic" / "AgX" / "Linear (none)" | Tone mapping algorithm |
| Exposure | Slider | 1.0 | 0-1.0 (slider 0-200) | Tone mapping exposure |
| Show Edges | Checkbox | off | on/off | Show/hide CAD edges in Studio mode |

The environment dropdown is organized into 8 `<optgroup>` categories:
- Studio: Top/overhead (4), Side/directional (7), Soft/diffuse (6), Product-viz (6)
- Outdoor: Overhead sun (4), Side sun (4), Low sun (4), Overcast (2)
- Plus "Built-in (procedural)" at the top and "None" at the bottom

Reset is a small **"R" button** in the top-right corner of the Studio panel
(same pattern as the Material tab reset button).

The tab also shows a brief info text when no objects have `material` tags:
> "Tip: Assign material presets to objects for realistic rendering.
> Environment lighting and tone mapping are active."

### 2.3 Mode Switching: What Changes When Entering/Leaving Studio Tab

**Entering Studio mode (selecting Studio tab):**

1. **Clipping**: Save the current clipping state (which planes are active,
   helper visibility, plane positions). This always captures the latest state
   of the UI and ViewerState — if the user worked in the Clip tab before
   switching to Studio, the backup reflects those latest settings. Then
   disable all clipping planes and hide clipping helpers.

2. **Materials**: For each leaf with a `material` tag, resolve the tag (materials
   table → built-in presets), then swap its MeshStandardMaterial for a
   MeshPhysicalMaterial built from the resolved MaterialAppearance. For leaves
   without `material`, swap to a MeshPhysicalMaterial using the global
   metalness/roughness values (so all objects benefit from the environment map
   reflections). **Back-face meshes**: Objects with `renderback: true` also swap
   their back-face material to MeshPhysicalMaterial; back meshes used for
   clipping caps are irrelevant (clipping is disabled in Studio mode).
   **Visibility**: Copy the `material.visible` flag from the CAD material to the
   Studio material so tree-view hide/show state is preserved across the swap.
   **Selection**: Update `originalColor` on ObjectGroup to reference the Studio
   material's color (so highlight/unhighlight uses the correct color reference
   in Studio mode).

3. **Textures**: Load any textures referenced by the resolved materials (from the
   root-level `textures` table or from URLs). Cached after first load.

4. **Environment map**: Load and apply the selected environment map to
   `scene.environment`. Generate PMREM cube map.

5. **Lighting**: Switch to pure image-based lighting (IBL). Disable the
   camera-following directional light (intensity = 0) and ambient light
   (intensity = 0). The environment map provides all illumination. No
   scene lights are created for Studio mode.

6. **Renderer**: Enable tone mapping (NeutralToneMapping by default) and set exposure.
   (`outputColorSpace` is already SRGBColorSpace since Three.js r152.)

7. **Edges**: Hide edges by default (or show if the user toggled the checkbox).

8. **Background**: Apply the selected background mode (grey, white, gradient,
   blurred environment, or transparent). Default is "gradient".

8a. **Floor**: If `studioShowFloor` is true, configure and show the studio
    floor (grid) at the bottom of the scene bounding box.

**Leaving Studio mode (switching to any other tab):**

1. **Clipping**: Restore saved clipping state (re-enable planes and helpers as
   they were before entering Studio mode).

2. **Materials**: Restore original CAD materials (MeshStandardMaterial with
   global metalness/roughness from Material tab). Copy `material.visible` flag
   back from Studio material to CAD material. Restore `originalColor` to
   reference the CAD material's color. Back-face meshes are also restored.

3. **Environment**: Remove `scene.environment` (set to null).

4. **Lighting**: Restore camera-following directional light and ambient light
   to their Material-tab slider values (both were zeroed during Studio mode).

5. **Renderer**: Disable tone mapping (set to NoToneMapping).

6. **Edges**: Restore edge visibility to its state before Studio mode.

7. **Background**: Restore transparent/white background.

8. **Floor**: Hide the studio floor.

**Key principle**: All changes are reversible. Toggling between tabs is
non-destructive. Animation continues to work in Studio mode -- it operates on
Object3D transforms (position, quaternion, scale), which are independent from
mesh.material assignments, so mid-animation mode switches are safe.

**Mode transition invariant**: Mode transitions always pass through CAD-material
state. The tab switcher MUST leave the old mode (restoring CAD materials) before
entering the new mode. This ensures Zebra and Studio never interact directly --
both see CAD materials as their "original". Example: Studio → Zebra means
`leaveStudioMode()` (restores CAD materials) then `setZebra(true)` (saves CAD
materials as original). This is enforced by the `switchToTab()` sequencing in
`display.ts`.

### 2.3a Loading Indicator

On first Studio tab activation, the viewer must load environment maps, resolve
textures, and build MeshPhysicalMaterials. This can take noticeable time
(200ms–2s depending on HDR source and texture count).

**UX during first load -- atomic switch:**
- Show a loading spinner or "Loading Studio mode..." text in the Studio panel
- Disable Studio tab controls until loading is complete
- The 3D viewport keeps showing **CAD mode** (no partial changes) while loading
- ALL Studio rendering changes (materials, lighting, environment, tone mapping,
  edges) are applied **atomically** after loading completes -- this avoids a
  jarring hybrid state where CAD materials are shown under Studio lighting
- On subsequent tab switches, materials are cached -- no loading indicator needed

**Stale-request guard:** A boolean `isStudioActive` flag is set on Studio enter
and cleared on leave. When a loading callback fires, it checks the flag; if
false, the result is cached but NOT applied to the scene (the user has already
left Studio). This prevents async loads from corrupting the scene state when
the user switches tabs during loading. For v1 with synchronous downloads, this
is sufficient. Upgrade to a generation counter if async HDR loading introduces
race conditions.

**In-flight promise tracking:** Track pending load promises to avoid duplicate
parallel loads when the user rapidly leaves and re-enters Studio mode.

### 2.3b Error Handling for Asset Loading

**Environment map load failure** (CDN down, CORS error, network timeout):
- Fall back to the bundled RoomEnvironment (always available, zero network)
- Show a brief warning in the Studio panel: "Could not load [preset name], using default environment"
- Log details to console

**Texture load failure** (404 URL, corrupt base64, missing `builtin:` name):
- Leave that texture slot null on the MeshPhysicalMaterial (Three.js handles
  null textures gracefully -- uses the scalar parameter instead)
- Do not block other materials from loading
- Log a console warning with the texture key/URL and the referencing material name

**Material resolution failure** (unknown `material` tag, not in table, not a preset):
- Fall back to global metalness/roughness (Material tab values)
- Log a console warning: "Unknown material tag '[name]' on object '[path]'"
- Empty `material: ""` is treated as no tag (equivalent to `undefined`); no warning

**Malformed MaterialAppearance values:**
- Clamp numeric fields to valid ranges (metallic, roughness: 0-1; ior: 1-2.33; etc.)
- Ignore unknown keys (no error, allows forward compatibility)
- Log warning for wrong types (e.g., metallic: "high" instead of a number)

**GDS format runtime guard:** If the shapes tree contains leaf nodes with
`type: "polygon"`, the data is GDS (2D chip layout). Studio mode entry is
blocked (log a warning, stay on the current tab). This prevents nonsensical
MeshPhysicalMaterial assignment on flat 2D polygon geometry. The `studioTool`
option defaults to `false` for GDS as the primary guard (auto-detected from
`type: "polygon"` in the shapes tree); this runtime check is a safety net for
programmatic `setActiveTab("studio")` calls.

### 2.4 Material Storage Strategy

**Scene graph traversal**: Each ObjectGroup's children are ordered:
`[Mesh (front), Mesh (back), LineSegments2 (edges), Group (clip-0), Group (clip-1), Group (clip-2)]`.
Material swaps MUST only target the Mesh children (indices 0 and 1) — edges and
clipping stencil groups are not affected. The top-level scene also contains
non-CAD children (lights, grid, axes, clipping helpers) that must be skipped.
Only `scene.children[0]` (the root Group) contains CAD ObjectGroups.

To enable fast switching, the viewer caches both sets of materials:

```
ObjectGroup {
  cadMaterials:    Map<Mesh, MeshStandardMaterial>   // original CAD materials (front + back face meshes)
  studioMaterials: Map<Mesh, MeshPhysicalMaterial>   // built from resolved material tag (always Physical)
}
```

**Material instance sharing (important for performance):** When multiple meshes
resolve to the same MaterialAppearance (same preset + same overrides + same leaf
color), they **share a single MeshPhysicalMaterial instance**. The `studioMaterials`
map then maps many meshes to the same material object. This is critical for draw
call batching: Three.js can batch meshes that share the same material, reducing
GPU state switches. The sharing key is `"${materialTag}:${leafColor}:${leafAlpha}"`
-- a simple string concatenation that covers the common case without a hashing
implementation.

Example: 50 bolts with `material: "stainless-steel"` and the same leaf `color` →
one shared MeshPhysicalMaterial, not 50 clones.

When entering Studio mode, swap `mesh.material = studioMaterials.get(mesh)`.
When leaving, swap back to `mesh.material = cadMaterials.get(mesh)`.

Materials are built lazily: `studioMaterials` is populated the first time the
Studio tab is activated after loading shapes data. Same pattern as the existing
lazy `toggleGroup()` in `viewer.ts`, which only builds the expanded NestedGroup
on first request.

**Fallback material cache invalidation:** Objects without a `material` tag use
the Material tab's global metalness/roughness as their Studio-mode fallback.
When re-entering Studio mode, these cached fallback materials must reflect the
current Material tab values. Rather than recreating materials, update them
in-place on each Studio entry: `material.metalness = currentMetalness;
material.roughness = currentRoughness;`. This is a simple property update with
no shader recompilation, since all fallback materials share the same shader
configuration (only scalar values differ).

### 2.5 MaterialFactory Changes

The existing `MaterialFactory` is extended (not replaced):

```
MaterialFactory {
  // Existing methods (unchanged -- CAD mode, all use options objects)
  createFrontFaceMaterial({color, alpha, visible})     → MeshStandardMaterial
  createBackFaceStandardMaterial({color, alpha})       → MeshStandardMaterial
  createBackFaceBasicMaterial({color, alpha})          → MeshBasicMaterial
  createBasicFaceMaterial({color, alpha, visible})     → MeshBasicMaterial
  createEdgeMaterial({lineWidth, color, ...})          → LineMaterial
  createSimpleEdgeMaterial({color})                    → LineBasicMaterial
  createVertexMaterial({size, color, visible})         → PointsMaterial
  createTextureMaterial({texture, visible})            → MeshBasicMaterial

  // NEW method (Studio mode, same options-object pattern)
  createStudioMaterial({materialDef, fallbackColor, fallbackAlpha, textureCache})
      → MeshPhysicalMaterial
}
```

**MaterialAppearance → Three.js property name mapping** (non-obvious renames):

| MaterialAppearance | Three.js MeshPhysicalMaterial | Notes |
|---|---|---|
| `baseColorTexture` | `map` | glTF convention → Three.js |
| `normalTexture` | `normalMap` | glTF convention → Three.js |
| `occlusionTexture` | `aoMap` | Requires UV2 (CAD data usually lacks this) |
| `metallicRoughnessTexture` | `metalnessMap` + `roughnessMap` | Single texture → two properties (B=metalness, G=roughness) |
| `emissiveStrength` | `emissiveIntensity` | Name difference |
| `metallic` | `metalness` | Name difference |
| `sheen` | `sheenRoughness` (enable) + `sheen` (intensity) | `sheen > 0` enables sheen layer |
| `baseColor` | `color` + `opacity` | RGBA split into color (RGB) + opacity (A) |

The `createStudioMaterial` method:
1. Takes a resolved MaterialAppearance (already looked up from materials table / presets)
2. If `baseColor` is set (sRGB values), converts to linear for the GPU:
   ```typescript
   // baseColor: [0.8, 0, 0, 1]  (sRGB values from preset or user)
   // Conversion:
   //   const color = new THREE.Color().setRGB(0.8, 0, 0, THREE.SRGBColorSpace);
   //   material.color = color;  // Three.js stores linear internally
   //   material.opacity = 1.0;
   ```
   If `baseColor` is NOT set, the leaf's `color` (CSS hex) + `alpha` is used:
   ```typescript
   // color: "#cc0000", alpha: 0.8
   //   new THREE.Color("#cc0000")  → Three.js parses as sRGB, stores as linear
   //   material.color = color; material.opacity = 0.8;
   ```
   In both cases, Three.js handles the sRGB-to-linear conversion internally.
   There is no manual `pow(c, 2.2)` step.
3. Resolves remaining missing fields from defaults
4. **Always creates MeshPhysicalMaterial** -- no Standard/Physical auto-detection
5. Resolves texture references via the texture cache (root-level `textures` table
   + URL loader)
6. Returns the fully configured material

**Why always MeshPhysicalMaterial in Studio mode:**

MeshPhysicalMaterial is a superset of MeshStandardMaterial. When advanced
features are off (transmission=0, clearcoat=0, sheen=0, etc.), the shader
compiles to essentially the same cost as MeshStandardMaterial.

Using a single material type in Studio mode means:
- Any property can be toggled at runtime (e.g., `material.transmission = 0.5`)
  without recreating the material — single material type keeps things simple
  without recreating it. Instant feedback, no flicker.
- No `_needsPhysical()` detection logic needed.
- Simpler code: one material creation path, one update path.
- All objects get the same material type, so environment map reflections
  are consistent across the scene.

**Performance notes:**
- First render in Studio mode may stall briefly for shader compilation when many
  distinct material configurations exist (each unique parameter combination =
  separate shader program). Material instance sharing (Section 2.4) minimizes this.
- **Weak GPU detection** (v2 roadmap): Deferred. If Studio mode is slow, the
  user switches back to CAD mode manually.

### 2.6 Lighting Changes

**Studio mode uses pure image-based lighting (IBL).** No scene lights are
created for Studio mode. The environment map provides all illumination:

| Light Source | Intensity | Purpose |
|-------------|-----------|---------|
| scene.environment | 0.5 (adjustable via Env Intensity slider) | All illumination: diffuse + specular IBL |
| DirectionalLight (camera-follow) | **0** (disabled) | -- |
| AmbientLight | **0** (disabled) | -- |

When entering Studio mode, existing CAD lights are disabled:
- **DirectionalLight** (camera-follow): intensity set to **0**
- **AmbientLight**: intensity set to **0**

No additional scene lights (key, rim, hemisphere) are created. This matches
the Three.js car paint reference example approach and produces more physically
accurate results, especially for metallic and clearcoat materials where
explicit scene lights create unrealistic specular hotspots.

**Trade-off**: With pure IBL, the "none" environment option produces no
illumination at all (objects appear black). This is intentional -- it signals
to the user that an environment map is required for Studio mode to work.

When leaving Studio mode, CAD lights are restored to their Material-tab
slider values.

### 2.7 Renderer Changes

| Setting | CAD Mode (current) | Studio Mode |
|---------|-------------------|-------------|
| face materials | MeshStandardMaterial | **MeshPhysicalMaterial (always)** |
| toneMapping | NoToneMapping | **NeutralToneMapping** (configurable: Neutral/ACES/AgX/none) |
| toneMappingExposure | 1.0 | 1.0 (adjustable via slider, range 0-1.0) |
| outputColorSpace | SRGBColorSpace | SRGBColorSpace (no change) |
| scene.environment | null | PMREM cubemap (from HDR or procedural) |
| scene.background | null (transparent) | **Background mode dependent** (see Section 2.11) |
| scene.environmentRotation | identity | **Rotated for Z-up** (PI/2 on X-axis) |
| scene.environmentIntensity | N/A | 0.5 (adjustable via slider) |
| scene.backgroundIntensity | N/A | 1.0 |
| scene.backgroundBlurriness | N/A | 0 |
| clipping planes | active | disabled |
| edges | visible | hidden (togglable) |

### 2.8 State Changes

New keys added to `ViewerState`:

```typescript
// Studio mode settings
studioEnvironment: "studio",          // string: "studio" | preset slug | custom HDR URL | "none"
studioEnvIntensity: 0.5,             // 0-1.0 (slider maps 0-200 to 0-1.0)
studioShowFloor: false,              // grid floor visibility
studioBackground: "gradient",        // "grey" | "white" | "gradient" | "environment" | "transparent"
studioToneMapping: "neutral",        // "neutral" | "AgX" | "ACES" | "none"
studioExposure: 1.0,                 // 0-1.0 (slider maps 0-200 to 0-1.0)
studioShowEdges: false,              // edge visibility in Studio mode
```

These are independent of the Material tab settings. Each mode has its own state.

**Saved/restored on mode switch** (not in ViewerState, transient):
- Clipping plane states (which are enabled, helper visibility)
- Edge visibility state from CAD mode

### 2.9 API Changes

New public methods on the Viewer class:

```typescript
// Environment
setStudioEnvironment(value: string): void
getStudioEnvironment(): string
setStudioEnvIntensity(value: number): void
getStudioEnvIntensity(): number

// Background & Floor
setStudioBackground(value: StudioBackground): void
getStudioBackground(): StudioBackground
setStudioShowFloor(value: boolean): void
getStudioShowFloor(): boolean

// Tone mapping
setStudioToneMapping(value: string): void
setStudioExposure(value: number): void

// Edges in Studio mode
setStudioShowEdges(value: boolean): void
getStudioShowEdges(): boolean

// Mode query
get isStudioActive(): boolean                    // true when Studio tab is active
```

Existing API is unchanged. `setMetalness()`, `setRoughness()`, `setAmbientLight()`,
`setDirectLight()` continue to control CAD mode only.

### 2.10 Studio Floor

The Studio floor provides visual grounding for objects, similar to product
photography studios. It is a grid plane positioned at the bottom of the scene
bounding box.

**Class**: `StudioFloor` in `src/rendering/studio-floor.ts`

**Floor types** (extensible via `StudioFloorType`):
- `"grid"` (v1): Grid lines using `THREE.GridHelper`, rotated to XY plane (Z-up)

**Configuration**:
- Floor size = 4x scene extent (extends well beyond objects)
- Division count = `max(40, floorSize / (sceneSize * 0.05))` (~5% scene size per cell)
- Positioned at `bbox.min.z` (bottom of scene bounding box)
- Material: transparent `LineBasicMaterial`, no depth write

**Background-adaptive contrast**:
The grid adapts its appearance based on the current `studioBackground`:
- Light backgrounds (white, gradient): dark lines (`#000000`, opacity 0.12)
- Dark backgrounds (grey, environment, transparent): white lines (`#ffffff`, opacity 0.15)

Updated automatically when `studioBackground` changes via `updateForBackground()`.

**State**: `studioShowFloor: boolean` (default: `false`)
**API**: `setStudioShowFloor(value: boolean)` / `getStudioShowFloor(): boolean`

**Lifecycle**:
- Created once at viewer init (alongside `EnvironmentManager`)
- `group` added to scene in `viewer.render()`
- `configure()` called on each `enterStudioMode()` with current bbox
- `show()` / `hide()` toggled by state subscription
- `dispose()` called in `viewer.dispose()`

**Future extensions**: `"checker"` (checkerboard plane mesh), `"textured"` (user-provided floor texture).

### 2.11 Background Mode System

Replaces the boolean `studioShowBackground` with a 5-mode enum:

```typescript
type StudioBackground = "grey" | "white" | "gradient" | "environment" | "transparent";
```

| Mode | Implementation | Use Case |
|------|---------------|----------|
| `"grey"` | Solid `THREE.Color(0.18, 0.18, 0.18)` as `scene.background` | Neutral backdrop for both light and dark objects; good for glass/transmission |
| `"white"` | Solid `THREE.Color(1, 1, 1)` as `scene.background` | Clean product-shot / e-commerce style |
| `"gradient"` | Canvas2D radial gradient texture (512x512, light center -> darker edges) as `scene.background` | Professional vignette look (default) |
| `"environment"` | Render-to-texture via fixed-FOV (50°) virtual camera for both ortho and perspective | Consistent "distant" backdrop; avoids narrow main-camera FOV making env appear too close |
| `"transparent"` | `scene.background = null` | Canvas alpha for compositing / transparent screenshots |

**Default**: `"gradient"`

**Gradient texture**: Lazily created and cached as a module-level singleton
(`_gradientTexture`). Uses `CanvasTexture` with `SRGBColorSpace`. The
gradient is a radial vignette: `#f0f0f0` center fading to `#c8c8c8` edges.

**Interaction with floor**: When the background mode changes, the floor's
contrast is updated via `StudioFloor.updateForBackground()` to maintain
visibility on both light and dark backgrounds.

**Implementation in `EnvironmentManager.apply()`**: The `apply()` method
accepts `backgroundMode: StudioBackground` and `ortho: boolean` parameters.
A switch statement applies the appropriate `scene.background` value for each mode.

**Ortho camera workaround for "environment" mode**: Three.js cannot render
PMREM/cubemap textures as `scene.background` with orthographic cameras (the
skybox renders as a tiny rectangle — a known Three.js limitation). The
`EnvironmentManager` works around this by rendering the env map to a
`WebGLRenderTarget` using a virtual perspective camera that matches the ortho
camera's orientation, then setting the resulting 2D texture as
`scene.background`. This works for both the visual background (2D textures
render as fullscreen quads regardless of camera projection) and the
transmission pass (glass refraction correctly sees the background). The
render target is updated each frame via `updateOrthoEnvBackground()` called
from the viewer's `update()` loop. When switching from ortho to perspective,
the viewer re-applies the environment to use the direct PMREM path instead.

**Note**: The ortho subscriber in `viewer.ts` uses `change.new` (not
`camera.ortho`) because the state is set before `camera.switchCamera()` —
at subscriber fire time, the camera hasn't switched yet.

**Cleanup in `EnvironmentManager.remove()`**: Resets `scene.background`,
`scene.backgroundIntensity`, `scene.backgroundBlurriness`, and
`scene.environmentRotation` to defaults. Tears down env background state.

### 2.11a Environment Background Rendering

The "environment" background mode renders the PMREM environment map to a 2D
render target via a fixed-FOV (50°) virtual perspective camera, then uses
that texture as `scene.background`. This approach is used for **both** ortho
and perspective cameras:

- **Ortho cameras**: Three.js cannot render PMREM backgrounds natively (tiny rectangle bug)
- **Perspective cameras**: The main camera's narrow 22° FOV would make the env
  appear too close / zoomed in

The virtual camera copies only position and quaternion from the active camera,
giving a consistent "distant" environment look regardless of camera type or zoom.

`needsEnvBackgroundUpdate` flag controls per-frame rendering. `updateEnvBackground()`
is called before the main render pass when active.

### 2.11b 4K Environment Map Toggle

Users can switch between 2K (default) and 4K Poly Haven HDR presets at runtime
via the `studio4kEnvMaps` state key or the "Use 4K Env Maps" checkbox in the
Studio UI.

- Preset URLs are built dynamically from slug names + resolution tier
- `EnvironmentManager.setUse4kEnvMaps()` rebuilds URLs, evicts affected cache
  entries, and reloads the current environment
- "Loading..." indicator shown during download
- Checkbox disabled for non-preset environments (custom URLs, procedural "studio")
- Available as `StudioOptions.use4kEnvMaps` in the data format and
  `StudioModeOptions.studio4kEnvMaps` in initialization options

### 2.12 sRGB Color Pipeline

**Decision**: All `baseColor` values in `MaterialAppearance` are specified in
**sRGB** color space (0-1 per channel), not linear.

**Conversion**: The material factory converts sRGB to linear using:
```typescript
const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
```
Three.js internally performs the sRGB-to-linear conversion. No manual
`pow(c, 2.2)` is needed.

**Rationale**:
1. **Users think in sRGB**: Hex color values (#cc0000) are sRGB. RGB values
   on color pickers are sRGB. When a user writes `baseColor: [0.8, 0, 0, 1]`,
   they mean "red that looks like 80% brightness", which is sRGB.
2. **Python sends sRGB**: Color values from build123d and CadQuery are sRGB.
   Requiring users to manually gamma-correct would be error-prone.
3. **Consistency**: The leaf node's `color` field (CSS hex) is already sRGB.
   Having `baseColor` also be sRGB avoids a confusing mixed-space interface.

**Impact on presets**: All 31 material preset `baseColor` values in
`material-presets.ts` are sRGB. Example: Chrome is `[0.98, 0.98, 0.98]`
(sRGB), not `[0.95, 0.95, 0.95]` (the old linear value). The approximate
relationship is `sRGB = linear^(1/2.2)`.

**Impact on data format**: Any external code providing `baseColor` values
(Python `materials` dict, JSON data) provides sRGB values. This is a
semantic change from the original design doc which specified linear values.

---

## Part 3: Environment Map Strategy

### 3.1 Tiered Approach

**Tier 1 -- Built-in "studio" (zero-cost, bundled with package):**
- Use Three.js `RoomEnvironment` (procedural, ~2 KB code, no external files)
- Label: "Built-in (procedural)" in the dropdown
- Generates a 256x256 PMREM cubemap via PMREMGenerator
- Good enough for basic PBR -- metallic surfaces get reflections, glass gets
  refraction, clearcoat becomes visible
- Ships with the npm package, always available

**Tier 2 -- Poly Haven HDR library (36 presets, loaded on demand):**
- 36 HDR environments from Poly Haven (CC0 license, permissive CORS) at **2K** resolution
- Organized into 8 categories in the UI dropdown via `<optgroup>`:
  - Studio Top/overhead: `studio_small_03`, `studio_small_05`, `studio_small_07`, `cyclorama_hard_light`
  - Studio Side/directional: `studio_small_04`, `studio_small_02`, `studio_small_06`, `photo_studio_loft_hall`, `studio_country_hall`, `brown_photostudio_02`, `brown_photostudio_06`
  - Studio Soft/diffuse: `studio_small_08`, `studio_small_09`, `photo_studio_01`, `provence_studio`, `photo_studio_broadway_hall`, `white_studio_05`
  - Studio Product-viz: `white_studio_01`, `white_studio_03`, `pav_studio_01`, `monochrome_studio_01`, `ferndale_studio_01`, `wooden_studio_01`
  - Outdoor Overhead sun: `noon_grass`, `wide_street_01`, `kloofendal_48d_partly_cloudy_puresky`, `rural_asphalt_road`
  - Outdoor Side sun: `meadow_2`, `autumn_park`, `autumn_field_puresky`, `spiaggia_di_mondello`
  - Outdoor Low sun: `spruit_sunrise`, `lilienstein`, `venice_sunset`, `kloppenheim_06`
  - Outdoor Overcast: `overcast_soil_puresky`, `canary_wharf`
- Each preset is ~1 MB at 2K resolution, downloaded on demand from Poly Haven CDN
- NOT bundled in the npm package (keeps package size small)
- Host applications can override URLs via constructor options
- `StudioEnvironment` type is `string` to accommodate any preset slug or custom URL

**Tier 3 -- User-provided HDR URL (via API and data format):**
- Any string that is not a known preset slug is treated as a URL
- Same HDRLoader loading path as Tier 2 presets

**Z-up environment rotation:** HDR equirectangular maps assume Y-up convention.
Since the viewer uses Z-up, the environment is rotated on load:
`scene.environmentRotation.set(Math.PI / 2, 0, 0)`. This rotation is applied
in `EnvironmentManager.apply()` and reset in `remove()`.

**Breaking change:** The old preset names "neutral" and "outdoor" (from the
original 2-preset design) are no longer valid `StudioEnvironment` values. Users
must use specific Poly Haven slugs (e.g., `"studio_small_03"`) or `"studio"`
for the procedural environment. Setting `studioEnvironment` to "neutral" or
"outdoor" will attempt to load them as custom URLs and fail, falling back to
the built-in "studio" environment.

### 3.2 Environment Map Loading Flow

```
1. User selects Studio tab (or programmatic setActiveTab("studio"))
2. Check studioEnvironment setting
3. If "studio":
   a. If cached → use cached PMREM texture
   b. Else → new RoomEnvironment() → PMREMGenerator.fromScene() → cache
4. If known preset slug (one of 36 Poly Haven presets):
   a. If cached[preset] → use cached
   b. Else → HDRLoader.load(presetUrl) → PMREMGenerator.fromEquirectangular() → cache
5. If custom URL (not a known preset slug):
   a. If cached[url] → use cached
   b. Else → HDRLoader.load(url) → PMREMGenerator.fromEquirectangular() → cache
6. Apply: scene.environment = pmremTexture
7. Apply background mode (see Section 2.11)
8. Apply Z-up environment rotation: scene.environmentRotation.set(PI/2, 0, 0)
```

### 3.3 Size and Performance Budget

| Approach | Added Bundle Size | Load Time | GPU Memory | Quality |
|----------|------------------|-----------|------------|---------|
| Studio (RoomEnvironment) | ~2 KB | 70ms | ~4 MB | Medium |
| Poly Haven preset (2K HDR) | ~1 MB download each | 300-500ms | ~16 MB | High |
| Poly Haven preset (4K HDR) | ~8 MB download each | 1-3s | ~16 MB (same PMREM) | Higher (sharper reflections) |
| User custom HDR | user-provided | varies | ~16-48 MB | Depends on source |

### 3.4 Disposal and Memory

When leaving Studio mode or switching environments:
- Dispose previous PMREM texture
- Dispose loaded HDR source texture
- Set `scene.environment = null`
- Keep a weak cache for the current session to allow fast re-entry

---

## Part 4: Texture Handling for Appearance

### 4.1 Root-Level Textures Table

The root `Shapes` node carries an optional `textures` object that maps string
keys to texture data. This is a shared lookup table -- the same pattern as GDS
`instances`.

```js
textures: {
  "wood_color": { data: "<base64>", format: "jpg" },     // embedded
  "wood_normal": { data: "<base64>", format: "png" },    // embedded
  "chrome_rough": { url: "textures/chrome_rough.jpg" },  // URL reference
}
```

Each entry is one of:

| Format | Fields | Description |
|--------|--------|-------------|
| Embedded | `{ data: string, format: string }` | Base64-encoded image data. Same structure as the existing leaf-level `texture` field. |
| URL | `{ url: string }` | Loaded on demand. Relative URLs resolve against the HTML page. |

### 4.2 Texture Resolution in MaterialAppearance Fields

When a MaterialAppearance texture field (e.g. `baseColorTexture`) contains a
string, it is resolved in this order:

```
1. Starts with "builtin:" ?
   → Use built-in procedural texture (e.g. "builtin:brushed")
2. Look up string in root-level textures table
   → found? Use that entry (embedded data or URL)
3. Starts with "data:" ?
   → Treat as data URI, load directly
4. Otherwise
   → Treat as URL, resolve relative to the HTML page
```

Note: `pack:` prefix (downloadable texture pack) is planned for v2.

Examples (shown as entries in the root-level `materials` table):

```js
materials: {
  // Built-in procedural texture (zero cost, always available)
  "brushed-steel": { preset: "stainless-steel", normalTexture: "builtin:brushed" },

  // By key (resolved from root-level textures table)
  "wood-custom": { baseColorTexture: "wood_color", roughness: 0.6 },

  // By URL (resolved relative to HTML page)
  "wood-url": { baseColorTexture: "textures/wood_color.jpg", roughness: 0.6 },

  // By data URI (embedded inline)
  "wood-inline": { baseColorTexture: "data:image/png;base64,...", roughness: 0.6 },
}
```

### 4.3 Texture Loading and Caching

Textures are loaded lazily when Studio mode is first activated:

1. Collect all unique texture references from all resolved MaterialAppearance objects
2. Resolve each reference via the resolution order above
3. Load via `THREE.TextureLoader` (jpg/png/webp) or from base64 data URI
4. Set correct `colorSpace`:
   - `SRGBColorSpace` for: baseColorTexture, emissiveTexture, sheenColorTexture,
     specularColorTexture
   - `LinearSRGBColorSpace` (default) for: normalTexture, metallicRoughnessTexture,
     occlusionTexture, all roughness maps, transmission maps, thickness maps
   - **Assumption**: All input textures from the client are in sRGB color space.
     No color space conversion is needed on ingestion. Three.js handles the
     sRGB → linear conversion internally when `colorSpace = SRGBColorSpace`.
5. Cache loaded `THREE.Texture` objects by key/URL (same texture reused across objects)
6. Dispose all textures when viewer is disposed or shapes data is replaced

### 4.4 Texture Data Flow

```
Input Data                    Viewer                         Three.js
──────────                    ──────                         ────────
root.textures["wood"]  ──►  TextureCache  ──►  THREE.Texture  ──►  material.map
  { data, format }          (by key/URL)       (colorSpace set)

MaterialAppearance.baseColorTexture = "wood"
                        └──► resolve("wood")
                             └──► TextureCache.get("wood")
                                  └──► cached THREE.Texture
```

---

## Part 4a: UV Support and Auto-UV Generation

### 4a.1 Problem

CAD tessellation produces triangle meshes with positions and normals, but
almost never UV coordinates. Without UVs, textures from the root-level
`textures` table and builtin procedural textures (Part 1.7, Part 4) cannot
be mapped onto surfaces. This makes the entire texture system unusable for
the majority of CAD data.

### 4a.2 UV Passthrough

A new optional `uvs` field on the `Shape` interface allows CAD exporters
to provide UV coordinates when available:

```typescript
interface Shape {
  // ... existing fields ...
  uvs?: number[] | Float32Array;    // 2 values per vertex (u, v)
}
```

When present, the UV array is set as the geometry's `"uv"` `BufferAttribute`
in `nestedgroup.ts` during geometry construction.

**Render pipeline propagation**: The face-splitting pipeline in `render-shape.ts`
(which splits multi-face-type shapes into separate shapes per face type) now
propagates the `uvs` array alongside vertex positions and normals. Each split
shape receives the UV subset corresponding to its faces.

### 4a.3 Auto-UV Generation

When a material references textures but the geometry has no UVs, box-projected
UV coordinates are generated automatically:

```
enterStudioMode():
  for each ObjectGroup:
    if material has texture fields AND geometry has no "uv" attribute:
      generate box-projected UVs from geometry
```

**Box projection algorithm** (`generateBoxProjectedUVs()` in `nestedgroup.ts`):

1. Compute the geometry's bounding box
2. For each face (triangle):
   a. Compute face normal from vertex positions
   b. Determine dominant axis (X, Y, or Z) from the normal
   c. Project vertices onto the two non-dominant axes
   d. Normalize to [0, 1] range based on bounding box extents
3. Set as `BufferAttribute("uv", 2)` on the geometry

This produces seamless UVs for planar and near-planar faces (common in CAD)
and acceptable UVs for curved surfaces (slight stretching at tangent
transitions, but acceptable for normal maps and procedural textures).

**Texture detection** (`materialHasTexture()` in `nestedgroup.ts`):
Checks all 15 texture fields in `MaterialAppearance` (baseColorTexture,
normalTexture, metallicRoughnessTexture, etc.) via a `TEXTURE_FIELDS`
constant. Returns `true` if any field is set.

### 4a.4 Data Flow

```
Input Shape.uvs (if provided)
  -> render-shape.ts: propagated through face splitting
  -> nestedgroup.ts: set as geometry BufferAttribute("uv")

OR (if no UVs and material has textures):
  -> nestedgroup.ts enterStudioMode(): generateBoxProjectedUVs()
  -> set as geometry BufferAttribute("uv")

Result:
  -> Three.js MeshPhysicalMaterial texture sampling uses UVs
```

### 4a.5 Limitations

- Box projection produces seams at axis transitions on curved surfaces.
  For high-quality results, the CAD exporter should provide proper UVs.
- Auto-UVs are world-space-aligned (based on bounding box). Rotating the
  object will not rotate the texture pattern -- this is acceptable for
  procedural normal maps but may be undesirable for directional patterns.
- `occlusionTexture` (aoMap) typically requires a second UV set (UV2).
  Auto-UV generation only sets UV1. AO maps may not work correctly with
  auto-generated UVs.

---

## Part 5: Tab Coexistence

### 5.1 Behavior Matrix

| Tab Active | Material Source | Lights | Environment | Tone Mapping | Clipping | Edges |
|-----------|----------------|--------|-------------|--------------|----------|-------|
| Tree | Global | Camera-follow + ambient | None | None | Available | Visible |
| Clip | Global + backface | Camera-follow + ambient | None | None | **Active** | Visible |
| Zebra | Zebra shader | Camera-follow + ambient | None | None | Available | Visible |
| Material | Global (adjustable) | Camera-follow + ambient (adjustable) | None | None | Available | Visible |
| **Studio** | **MeshPhysicalMaterial, per-object (fallback: global)** | **Pure IBL (no scene lights)** | **Yes** | **PBR Neutral** | **Disabled** | **Togglable (default: hidden)** |

### 5.2 Material Tab Stays Useful

The Material tab remains the primary control for:
- Models without any `material` tags (the majority of CAD models today)
- Quick metalness/roughness adjustments for visual inspection
- Light intensity tuning for the CAD viewing experience
- Edge color control

Even in Studio mode, the Material tab's metalness/roughness values serve as
the **fallback** for objects without a `material` tag. So:
- User adjusts metalness in Material tab → affects objects without material tags
- Switch to Studio tab → objects with material tags use their resolved values,
  objects without use the Material tab values + environment

### 5.3 Reset Behavior

- **Material tab "Reset" button**: resets metalness, roughness, light intensities
  to their initial values. Does NOT affect Studio tab settings.
- **Studio tab "R" button** (top-right, same style as Material tab): restores
  environment="studio", envIntensity=0.5, toneMapping="neutral", exposure=1.0,
  showEdges=false, showFloor=false, background="gradient".

---

## Part 6: Implementation Phases

### Phase 1: Data Format & Types

**Goal**: Define all new TypeScript interfaces. No viewer behavior changes.

> **Note**: Phases 3 and 4 can run in parallel after Phase 2 — they modify
> disjoint files (Phase 3: environment.ts + viewer.ts; Phase 4: texture-cache.ts
> + material-presets.ts + material-factory.ts + nestedgroup.ts). Join point is
> Phase 5.

**Files to change:**
- `src/core/types.ts`:
  - Add `MaterialAppearance` interface
  - Add `TextureEntry` interface (for root-level textures table entries)
  - Add `StudioOptions` interface
  - Add `material?: string` to `Shapes` (for leaf nodes, alongside `color`, `alpha`)
  - Add `materials?: Record<string, MaterialAppearance>` to `Shapes` (read from root)
  - Add `textures?: Record<string, TextureEntry>` to `Shapes` (read from root)
  - Add `studioOptions?: StudioOptions` to `Shapes` (read from root)
  - Note: `Shapes` is a single recursive type used for both root and leaf nodes.
    All fields go on the same interface; leaf-only vs root-only is by convention.
  - Add `"studio"` to `ActiveTab` union type
  - Add `"studio"` to `ActionShortcutName` union type
  - Add `studioTool?: boolean` to `DisplayOptions` (default: `true`)
    Same pattern as `zebraTool` -- when `false`, the Studio tab is hidden
    (makes no sense for GDS chip layouts).
    **GDS auto-detection**: In `viewer.render()`, after parsing the shapes tree,
    if any leaf node has `type: "polygon"`, auto-override `studioTool` to `false`
    (same location and pattern as the existing GDS auto-detection for other options)
- `src/core/viewer-state.ts`:
  - Add `studioTool: true` to defaults only (alongside `zebraTool: true`)
  - Add default keyboard shortcut: `studio: "s"` (lowercase; uppercase "S" is already taken by `select`)
  - Note: studio-mode state keys, `ViewerStateShape`, `STATE_KEYS`, and
    `CombinedOptions` updates are consolidated into **Phase 2** (where the
    Studio tab UI is wired to state)
- `src/index.ts`: Re-export new public types (`MaterialAppearance`, `TextureEntry`,
  `StudioOptions`) so npm package consumers can import them
- `DATA_FORMAT.md`: Document new fields (material, materials, textures, studioOptions)
- **Pre-existing fix**: Correct JSDoc defaults in `types.ts` `RenderOptions`
  (ambientIntensity=0.5→1, directIntensity=0.6→1.1, metalness=0.7→0.3,
  roughness=0.7→0.65) to match actual defaults in `viewer-state.ts`

**Deliverable**: Types defined, existing code compiles unchanged, docs updated.

### Phase 2: Tab Reorder + Studio Tab UI Shell

**Goal**: Reorder tabs and add Studio tab with controls (no rendering changes yet).

**Files to change:**
- `src/ui/index.html`:
  - Reorder tabs: Tree, Clip, Zebra, Material, Studio
  - Add Studio tab button
  - Add Studio panel HTML (dropdowns, sliders, checkboxes)
- `src/ui/display.ts`:
  - Hide Studio tab when `!options.studioTool` (same as `zebraTool` pattern: `tabStudio.style.display = "none"`)
  - Update `selectTab()` to accept `"studio"` in the tab name validation
  - Update `switchToTab()` for new tab order and Studio tab
  - Wire Studio tab controls to viewer state
  - Handle Studio tab selection/deselection events
  - Note: `display.ts` has its own `DisplayOptions` interface (line 55) that
    shadows the one in `types.ts` -- both must be updated with `studioTool`
- `src/core/viewer.ts`:
  - Register keyboard shortcut handler for "s" → Studio tab
  - Wire state subscriptions for new studio state keys
- `src/core/viewer-state.ts`:
  - Add studio-mode state keys with defaults
  - Add notification mapping for studio state keys
  - Ensure `ViewerStateShape`, `STATE_KEYS`, and `CombinedOptions` include all
    new studio keys (if not already done in Phase 1)
- `css/ui.css`: Style the Studio panel (same file where zebra panel styles live)

**Tests:**
- Tab reordering: verify tab order in DOM
- `studioTool: false`: verify Studio tab hidden
- Studio state keys: verify defaults and state changes

**Deliverable**: Tabs appear in correct order. Studio tab shows controls.
Controls change state values. No rendering effect yet.

### Phase 3: Environment Map Support

**Goal**: Load and apply environment maps when Studio tab is active.

**Files to change:**
- New file `src/rendering/environment.ts`:
  - `EnvironmentManager` class
  - Manages RoomEnvironment generation, HDR loading, PMREM generation, caching
  - Methods: `loadStudio()`, `loadHDR(url)`, `apply(scene)`, `remove(scene)`,
    `dispose()`
- `src/core/viewer.ts`:
  - Create EnvironmentManager at init
  - On Studio tab enter: call `envManager.apply()`
  - On Studio tab leave: call `envManager.remove()`
  - Add `setStudioEnvironment()`, `setStudioEnvIntensity()` methods
  - Wire to state subscriptions

**Tests:**
- RoomEnvironment load/apply/remove cycle
- HDR preset load + PMREM generation
- In-flight promise tracking: rapid enter/leave doesn't double-load

**Deliverable**: Selecting Studio tab loads environment. Reflections visible
on existing MeshStandardMaterial (CAD materials) with CAD lighting — not final
quality, but proves environment loading/caching works. Toggling back removes it.

### Phase 3a: Asset Caching (v2 roadmap)

**Deferred to v2.** IndexedDB-based cross-session caching is not needed for v1:
RoomEnvironment is procedural (no network), and browser HTTP cache handles HDR
preset downloads. An in-memory `Map` cache for the current session is sufficient.
Phase 3a can be added in v2 when the texture pack system ships.

### Phase 4: Texture Cache + MaterialFactory Extension

**Goal**: Build PBR materials from resolved `material` tags.

**Files to change:**
- New file `src/rendering/texture-cache.ts`:
  - `TextureCache` class
  - Resolves texture references (builtin: → table lookup → data URI → URL)
  - Loads and caches `THREE.Texture` objects
  - Sets correct colorSpace per texture type
  - Builtin procedural textures (Canvas2D-generated) live in a **separate
    persistent sub-cache** that survives `clear()` (see Part 11a.2)
  - Dispose method for cleanup (disposes user textures; builtin cache only
    disposed via `disposeFull()` called from `viewer.dispose()`)
- New file `src/rendering/material-presets.ts`:
  - Built-in preset dictionary (31 presets as typed `Record<string, MaterialAppearance>`)
  - Export preset name list (e.g., `MATERIAL_PRESET_NAMES: string[]`) for
    programmatic use; re-export from `src/index.ts` so npm consumers can import
  - Needed here for material tag resolution in `createStudioMaterial()`
  - ~~Phase 7 (Material Editor) adds editor-specific metadata~~ (DROPPED — materialx-db replaces this)
- `src/rendering/material-factory.ts`:
  - Add `createStudioMaterial()` method (always creates MeshPhysicalMaterial)
  - Accept `TextureCache` for texture resolution
- `src/scene/nestedgroup.ts`:
  - Parse `textures` table from root Shapes node
  - Pass to TextureCache
  - Parse `material` tag from leaf nodes, store in ShapeEntry
  - Resolve material tags via materials table and built-in presets
  - Handle empty `material: ""` as equivalent to no tag (skip warning)

**Deliverable**: Factory can create PBR materials from resolved material specs.
Textures load from the table or URLs. Presets resolve. Not yet wired to Studio
tab switching.

### Phase 5: Studio Mode Material Swap + Lighting

**Goal**: Full Studio mode works end-to-end.

**Files to change:**
- `src/utils/utils.ts`:
  - Update `MaterialLike` interface and `disposeMaterial()` to cover
    MeshPhysicalMaterial texture maps (transmissionMap, clearcoatMap,
    sheenColorMap, anisotropyMap, etc.) -- see Part 11a.3
- `src/scene/clipping.ts`:
  - Add `saveState(): ClippingState` method -- captures which planes are active,
    helper visibility, and plane positions
  - Add `restoreState(state: ClippingState)` method -- restores saved state
  - These methods are needed because no save/restore mechanism currently exists
    in the Clipping class
- `src/scene/objectgroup.ts`:
  - Add `studioMaterials` cache alongside existing materials
  - Add `enterStudioMode(textureCache)` method: builds materials from resolved
    MaterialAppearance (lazily, first time only), swaps them onto meshes.
    Copy `material.visible` flag from CAD→Studio material. Update
    `originalColor` to reference Studio material color for correct
    highlight/unhighlight. Also swap back-face materials for `renderback: true`
    objects.
  - Add `leaveStudioMode()` method: restores CAD materials. Copy
    `material.visible` flag from Studio→CAD material. Restore `originalColor`
    to CAD material color. Restore back-face materials.
  - Add `setStudioShowEdges(visible)` method
- `src/scene/nestedgroup.ts`:
  - Propagate `enterStudioMode()` / `leaveStudioMode()` to all ObjectGroups
  - Manage TextureCache lifecycle
- `src/ui/display.ts`:
  - Update `switchToTab()`: when the **previous** tab was Studio, call
    `leaveStudioMode()` as the **first** action (before the target tab's
    `_updateVisibility()` runs). This ensures clipping state is restored
    before the Clip tab re-enables its controls.
- `src/core/viewer.ts`:
  - On Studio tab enter:
    1. Save clipping state via `clipping.saveState()` (always saves the
       latest state); disable all clipping planes and helpers
    2. Set `isStudioActive = true`
    3. Call `nestedGroup.enterStudioMode()`
    4. Load environment map (guarded by `isStudioActive` flag)
    5. Apply ALL rendering changes atomically after loading completes:
       disable camera-follow light and ambient light (intensity = 0);
       enable tone mapping; apply background mode; configure floor;
       hide edges (unless studioShowEdges is true)
    6. Update in-place any fallback material metalness/roughness from
       current Material tab values (cache invalidation for untagged objects)
  - On Studio tab leave:
    1. Call `nestedGroup.leaveStudioMode()`
    2. Remove environment map
    3. Restore camera-follow + ambient light intensities
    4. Disable tone mapping
    5. Restore clipping state via `clipping.restoreState(savedState)`
    6. Restore edge visibility
    7. Set `isStudioActive = false` (invalidates in-flight async loads)

**Also assigned to this phase:**
- Part 11a (Disposal): implement `viewer.dispose()` and `viewer.clear()` Studio
  resource cleanup (disposal ordering per Part 11a.1), Studio event listener
  disposal in `Display.dispose()`, shared texture safety (Part 11a.4)
- Part 2.3b (Error handling): implement error handling for environment maps
  (Phase 3 partial), textures, materials, and malformed values
- Part 2.3a (Loading indicator): implement loading spinner / "Loading Studio
  mode..." text in `display.ts` and `viewer.ts`, disable Studio tab controls
  until loading completes (pulled forward from Phase 6 to avoid poor first-load
  UX during Phase 5 testing)

**Tests:**
- `tests/unit/clipping-save-restore.test.js`: clipping `saveState()` /
  `restoreState()` round-trip (plane states, helper visibility, plane positions)

**Deliverable**: Full Studio mode works. Switching between CAD and Studio is
smooth and non-destructive. Per-object materials, environment, lighting, tone
mapping, edge toggle all functional. Loading indicator shows on first activation.
Disposal is complete.

### Phase 6: Polish, API & Example

**Goal**: Production-ready feature with documentation and example.

Phase 6 is split into sub-phases:

#### Phase 6a (committed in 520d534)
Studio mode material swap, 3-point lighting, tone mapping, basic environment
support. Delivered end-to-end Studio mode with ACES tone mapping and 3-point
lighting.

#### Phase 6b (committed in f14de11, ccc55ed, 9981cf8, 98ac87f, 4996fa1, 15d40d4)
Refinements based on real-world testing:

**New capabilities added:**
1. **sRGB color pipeline**: `baseColor` values in MaterialAppearance changed from linear to sRGB. Material factory converts via `Color.setRGB(..., SRGBColorSpace)`. All 31 preset baseColor values recalculated.
2. **UV support + auto-UV generation**: New `uvs` field on Shape interface. Box-projected UV auto-generation for CAD meshes lacking UVs (critical for texture support).
3. **Studio floor**: Grid floor at scene bounding box bottom, toggleable via `studioShowFloor`.
4. **Background mode system**: 5-mode `StudioBackground` enum replaces boolean `studioShowBackground`.
5. **Expanded HDR library**: 36 Poly Haven presets at 2K (was 2 at 1K).
6. **Pure IBL lighting**: Removed 3-point lighting in favor of environment-only illumination.
7. **PBR Neutral tone mapping**: New default (was ACES). Better color accuracy for CAD.
8. **3 new procedural textures**: wood-dark (base color), leather (normal), fabric-weave (normal).
9. **Lazy-load example infrastructure**: `"lazy:"` prefix convention in index.html for large examples.

**Bug fixes:**
- Studio materials default to opaque (no longer inherit CAD transparency)
- Transmission materials force `transparent: false` (Three.js requirement)
- Explicit depth write / polygon offset for Studio materials
- Solid parts no longer force `renderback: true` in face-split path
- Face-split shapes now preserve `material` tag
- `EnvironmentManager.remove()` now resets environmentRotation, backgroundIntensity, backgroundBlurriness

**Files changed:**
- `src/core/types.ts`: StudioBackground type, StudioEnvironment widened, baseColor sRGB, uvs field
- `src/core/viewer-state.ts`: New defaults, studioShowFloor + studioBackground state keys
- `src/core/viewer.ts`: Pure IBL, floor lifecycle, background modes, PBR Neutral
- `src/rendering/environment.ts`: 36 presets, 5 background modes, Z-up rotation, gradient texture
- `src/rendering/material-factory.ts`: sRGB conversion, transparency/depth fixes
- `src/rendering/material-presets.ts`: All baseColor values recalculated to sRGB
- `src/rendering/texture-cache.ts`: 3 new procedural textures
- `src/rendering/studio-floor.ts`: New file -- StudioFloor class
- `src/scene/nestedgroup.ts`: UV passthrough, auto-UV generation
- `src/scene/render-shape.ts`: UV propagation, renderback fix, material tag propagation
- `src/ui/display.ts`: New UI controls, slider range changes
- `src/ui/index.html`: 38-option env dropdown, background dropdown, floor checkbox, tone mapping labels
- `index.html`: Studio example, lazy-load infrastructure
- `examples/studio_mode.js`: UV spheres with 5 material types (updated in Phase 6c to use builtin preset references)

#### Lazy-Load Example Convention (index.html only)

The development `index.html` supports lazy-loading large examples via a
`"lazy:"` prefix convention in the examples array:

```js
const examples = ["studio_mode", "lazy:toycar"];
```

When a `"lazy:name"` example is selected, `lazyLoadExample(name)` injects a
`<script src="./examples/name.js">` tag on demand. This avoids loading
multi-hundred-MB example files at page load.

This is a development tool (index.html only), not part of the npm package API.
Large example files (e.g., `examples/toycar.js`) are listed in `.gitignore`.

**Deliverable**: Feature complete with refined lighting, expanded environment
library, proper color pipeline, UV support, and polished UI. API stable.
Example works end-to-end.

#### Phase 6c (committed in 833f37d, ddd9868)
Environment map background fix, z-fighting fix, UI polish.

**Environment map background for ortho cameras:**
Three.js cannot render PMREM/cubemap textures as `scene.background` with
orthographic cameras (renders as a tiny rectangle). Implemented a render-to-texture
workaround: renders the env map to a `WebGLRenderTarget` using a virtual perspective
camera, then sets the 2D texture as the main scene's background. This works for both
the visual background and transmission (glass refraction). The ortho state subscriber
uses `change.new` instead of `camera.ortho` to avoid a race condition where the camera
hasn't switched yet at subscriber fire time.

**Z-fighting fix for large models:**
The perspective camera's near plane was hardcoded to `0.1` regardless of scene size.
For large models like the toycar (bounding radius ~1130), this produced a far/near
ratio of 1,130,000:1, causing black z-fighting artifacts. Fixed by scaling the near
plane as `max(0.1, 0.01 * boundingRadius)`, keeping the far/near ratio at 10,000:1.
`updateFarPlane()` now also updates near.

**Studio mode example cleanup:**
Converted `examples/studio_mode.js` from legacy `MaterialAppearance` format to
`"builtin:"` preset references. Updated sphere names and material tags to match
(chrome, glass-clear, brushed-aluminum, rubber-black, car-paint).

**UI changes:**
- Renamed "Blurred Environment" background option to "Environment"
- Removed orphaned `_savedOrtho` field from `viewer.ts`

**Files changed:**
- `src/rendering/environment.ts`: Env background render-to-texture (both ortho+perspective via fixed-FOV virtual camera), `ortho` param on `apply()`, 4K toggle (`setUse4kEnvMaps()`, `isPreset()`, dynamic URL building)
- `src/core/viewer.ts`: Pass ortho to `apply()`, ortho subscriber, `updateEnvBackground()` in render loop, `studio4kEnvMaps` subscriber + `setStudio4kEnvMaps()` API
- `src/camera/camera.ts`: Adaptive near plane (`NEAR_FACTOR = 0.01`)
- `src/ui/index.html`: "Environment" label
- `examples/studio_mode.js`: Builtin preset references

#### Phase 6d: Directional Shadows with Screen-Space Blur

**Goal**: Soft directional shadows driven by HDR light detection, with user-adjustable
intensity and softness.

**Architecture:**

A two-pass screen-space shadow pipeline renders floor and object shadows separately
to half-resolution render targets, each blurred via KawaseBlurPass. A custom
ShadowMaskEffect composites them using depth-based masking to prevent floor shadow
from bleeding through objects.

1. **Light detection** (`light-detection.ts`): Analyzes the environment map to find
   the dominant light direction. Places a single DirectionalLight (intensity 0.01 —
   shadow map only, no visible illumination change).
2. **Shadow map**: PCFShadowMap at 4096×4096, bias=-0.001. Frustum sized to scene
   bounding box. Generated once per frame (reused by both mask passes).
3. **Object shadow mask**: Floor hidden, all meshes `receiveShadow=true`,
   `ShadowMaterial` override (opaque, `NoBlending`). Captures inter-object + self shadows.
4. **Floor shadow mask**: Objects hidden, floor visible. No depth discontinuities →
   clean blur without glow halos at object boundaries.
5. **KawaseBlurPass**: Fixed `HUGE` kernel (10 iterations), continuous `scale` uniform
   for smooth softness control (no discrete jumps). Shared pass blurs each mask separately.
6. **ShadowMaskEffect** (`EffectAttribute.DEPTH`): Reads the main render's depth buffer.
   `step(0.9999, depth)` distinguishes floor (depth ≈ 1.0, floor hidden in main render)
   from objects. Floor shadow only applied where no geometry rendered.
7. **Background-protect support**: At transparent FBO pixels (solid bg mode), shadow
   output as alpha `vec4(0,0,0,shadowAmount)` — NormalBlending darkens the pre-cleared canvas.

**ShadowMaterial opaque rendering**: `transparent: false`, `blending: NoBlending`.
Prevents alpha-blending bug where back-face shadow (alpha=1) persists through
front lit surface (alpha=0), causing the entire shadow footprint to appear on all objects.

**Shadow techniques evaluated and rejected:**
- PCSS (BasicShadowMap): noise/stairstepping on floor and objects
- VSM: symmetric blur on objects, light bleeding artifacts
- PCFSoftShadowMap: ignores radius parameter (Three.js limitation)
- BasicShadowMap + screen blur: stairstepping on floor at 4096
- Single mask pass (floor+objects): depth-discontinuity glow halos when blurred
- Objects as depth occluders in floor pass: reintroduced glow halos
- Dual-channel presence mask with smoothstep threshold: bright gaps around objects

**State keys**: `studioShadowIntensity` (0–1, default 0.5), `studioShadowSoftness` (0–1, default 0.5)

**UI**: Shadow Intensity slider (0–100), Shadow Softness slider (0–100), AO Intensity slider (0–30)

**Files changed:**
- `src/rendering/studio-composer.ts`: ShadowMaskEffect with depth-based compositing,
  two-pass mask rendering, KawaseBlurPass with continuous scale, bg-protect shadow alpha
- `src/rendering/light-detection.ts`: HDR analysis → dominant light direction
- `src/rendering/studio-floor.ts`: ShadowMaterial ground plane
- `src/core/viewer.ts`: Shadow light lifecycle, PCFShadowMap setup, state subscribers
- `src/core/viewer-state.ts`: Shadow/softness defaults
- `src/core/types.ts`: Shadow state key types
- `src/ui/display.ts`: Shadow sliders, AO intensity slider rescaled (0–30)
- `src/ui/index.html`: Shadow/softness/AO slider HTML

### Phase 7: Material Editor (Simplified — IMPLEMENTED)

**Status: IMPLEMENTED** as a lightweight PBR parameter tweaker, replacing the
original full material editor design (Part 10). The simplified version focuses
on interactive parameter tuning rather than full material assignment.

**What was implemented:**
- Overlay panel (not inline in Studio tab) with draggable titlebar
- "E" toolbar button to toggle, ESC or "X" to close
- Hint dialog when no object is selected
- Per-object material cloning with triplanar mapping preservation
- Slider UI for 14 PBR parameters (metalness, roughness, clearcoat, transmission,
  IOR, thickness, attenuation distance, sheen, specular, anisotropy, emissive)
- Red label highlighting for changed values (aids copying to Python)
- Reset to original material, auto-reopen on selection change
- Proper cleanup (AbortController for drag listeners, clone disposal on exit)

**What was NOT implemented** (from original Part 10 design):
- Preset picker / dropdown
- Color picker
- Texture assignment UI
- Export to materials dict
- Undo/redo

Material assignment remains on the Python side via `materialx-db`; the editor
is a prototyping aid for tuning numeric PBR parameters visually.

---

## Part 7: Data Flow Summary

### Complete Input Example

```js
{
  version: 3,
  name: "Car Assembly",
  id: "/Car",
  bb: { /* ... */ },

  // User-defined material library (tag-based, survives restructuring)
  materials: {
    "car-paint":   { params: { color: [0.8, 0, 0], metalness: 0.5, roughness: 0.2,
                               clearcoat: 1.0, clearcoatRoughness: 0.03 } },
    "windshield":  { params: { transmission: 1.0, roughness: 0.0, ior: 1.52,
                               thickness: 5.0, color: [1, 1, 1] } },
    "dashboard":   { params: { roughness: 0.7, map: "textures/basecolor.png",
                               normalMap: "textures/normal.png" },
                     textures: { "textures/basecolor.png": "data:image/png;base64,...",
                                 "textures/normal.png": "data:image/png;base64,..." } },
    "trim":        "builtin:brushed-aluminum",
  },

  // Rendering environment hints
  studioOptions: {
    environment: "studio",
    toneMapping: "neutral",
    showEdges: false,
  },

  parts: [
    {
      name: "Body",
      id: "/Car/Body",
      type: "shapes",
      color: "#cc0000",             // CAD mode color
      alpha: 1.0,
      material: "car-paint",         // → materials table → preset + override
      shape: { /* ... */ },
    },
    {
      name: "Windshield",
      id: "/Car/Windshield",
      type: "shapes",
      color: "#aaddff",
      alpha: 0.3,
      material: "windshield",       // → materials table → glass
      shape: { /* ... */ },
    },
    {
      name: "Dashboard",
      id: "/Car/Dashboard",
      type: "shapes",
      color: "#8b4513",
      alpha: 1.0,
      material: "dashboard",        // → materials table → textured wood
      shape: { /* ... */ },
    },
    {
      name: "Trim",
      id: "/Car/Trim",
      type: "shapes",
      color: "#888888",
      alpha: 1.0,
      material: "trim",             // → materials table → brushed aluminum
      shape: { /* ... */ },
    },
    {
      name: "Tire",
      id: "/Car/Tire",
      type: "shapes",
      color: "#333333",
      alpha: 1.0,
      material: "rubber-black",     // → no materials entry → built-in preset
      shape: { /* ... */ },
    },
    {
      name: "Bracket",
      id: "/Car/Bracket",
      type: "shapes",
      color: "#999999",
      alpha: 1.0,
      // No material tag → uses global metalness/roughness in Studio mode
      shape: { /* ... */ },
    },
  ],
}
```

### Processing Flow

```
viewer.render(shapes)
  │
  ├─ Parse materials table from root → store as material library
  ├─ Parse textures table from root → store in TextureCache
  ├─ Parse studioOptions from root → store in viewer state
  ├─ Parse material tag from each leaf → store in ShapeEntry
  ├─ Build CAD materials as today (MeshStandardMaterial)
  │
  └─ On Studio tab activation:
       ├─ Save clipping state → disable all clipping
       ├─ Load environment map (Studio / HDR URL)
       ├─ For each leaf with material tag:
       │    └─ Resolve: materials table → built-in presets
       │    └─ Resolve textures from TextureCache
       │    └─ Build MeshPhysicalMaterial from resolved MaterialAppearance
       ├─ Swap materials on meshes
       ├─ Switch to pure IBL (disable camera-follow + ambient, env provides all light)
       ├─ Enable tone mapping (NeutralToneMapping)
       ├─ Apply background mode (grey/white/gradient/environment/transparent)
       ├─ Configure + show floor (if studioShowFloor)
       ├─ Hide edges (unless toggled on)
       └─ Re-render
```

---

## Part 8: Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Tab order | Tree, Clip, Zebra, Material, Studio | Inspection tools first, appearance tools together at the end |
| Bundled HDR | RoomEnvironment in package; 36 Poly Haven presets at 2K as downloadable URLs | Keeps package small; extensive preset library covers studio + outdoor scenarios |
| Texture URLs | Default relative to HTML page; root-level `textures` table for embedded/shared textures | Flexible: works for both file serving and Jupyter embedding |
| Edges in Studio | Toggle on Studio tab, default hidden | Clean render look by default, but CAD users can show edges |
| Clipping in Studio | Disabled (saved/restored on tab switch) | Clipping is a CAD inspection tool, not a rendering concern |
| Animation | Works in Studio mode (affects transforms, not materials) | No special handling needed |
| Performance warnings | Deferred; add if needed after real-world testing | Premature optimization |
| Material presets | 31 built-in presets (metals, plastics, glass, rubber, paint, natural) | Zero cost, covers common CAD materials |
| Texture presets | 8 procedural (bundled, incl. 1 base-color texture); downloadable pack in v2 | Procedural = zero file size; wood-dark demonstrates color textures; pack deferred to v2 |
| Materials table | Root-level `materials` dict, tag-based (not path-based) | Tags survive hierarchy changes; library is reusable |
| Leaf field name | `material` (string tag), not `appearance` | Matches build123d's existing `.material` attribute; no inline MaterialAppearance on leaves |
| Material editor | ~~Visual editor in Studio tab~~ **DROPPED** — materialx-db provides Python-side material selection from 3,200+ PBR materials | materialx-db catalog is more powerful than a built-in editor |
| Asset caching | In-memory Map for v1; IndexedDB cross-session caching in v2 | Browser HTTP cache sufficient for HDR presets in v1 |
| Keyboard shortcut | `studio: "s"` (lowercase) | Uppercase "S" is taken by `select` |
| Three.js minimum | r180 (0.180.0) | Required for: HDRLoader (replaced RGBELoader in r180), GTAOPass API, OutputPass, anisotropy, linear color. Current: 0.180.0 |
| Lighting model | Pure IBL (environment map only, no scene lights) | Physically accurate; avoids unrealistic specular hotspots from directional lights on metallic/clearcoat materials |
| Default tone mapping | PBR Neutral (NeutralToneMapping) | Preserves color accuracy better than ACES for CAD/product-viz; ACES has a warm color shift |
| Background system | 5-mode enum (grey/white/gradient/environment/transparent) replaces boolean | More flexible; gradient provides a professional default; environment mode shows blurred HDR; transparent for compositing |
| baseColor color space | sRGB (converted to linear by material factory) | Users think in sRGB; hex colors are sRGB; Python sends sRGB; no manual gamma conversion needed |
| HDR resolution | 2K default, 4K toggle | Good quality-to-size tradeoff at 2K (~1 MB each); 4K available via checkbox for sharper reflections (~8 MB each); runtime switchable |
| UV handling | Auto-generate box-projected UVs when material uses textures but geometry lacks UVs | CAD meshes almost never have UVs; without auto-UV, texture system is unusable for most CAD data |
| Studio floor | Optional grid floor at bbox bottom, adaptive contrast | Visual grounding; common in product-viz tools; adaptive contrast ensures visibility on all background modes |
| Env background rendering | Render-to-texture via fixed-FOV (50°) virtual camera for both ortho and perspective | Ortho: Three.js can't render PMREM natively; Perspective: main camera's 22° FOV makes env too close. Unified approach gives consistent "distant" background |
| Near plane scaling | `near = max(0.1, 0.01 * boundingRadius)`, far/near ratio capped at 10,000:1 | Fixed near=0.1 caused z-fighting on large models (toycar: 1,130,000:1 ratio); adaptive scaling fixes it for all scene sizes |
| Environment background label | "Environment" (was "Blurred Environment") | Simpler; background is no longer blurred (intensity=1.0, blurriness=0) |

---

## Part 9: SSAO — IMPLEMENTED

> **Status: IMPLEMENTED** (Phase 6d). The original plan called for GTAOPass via
> Three.js's EffectComposer. The actual implementation uses **N8AOPostPass** via
> the pmndrs **postprocessing** library's EffectComposer, which also handles tone
> mapping, shadow compositing, and SMAA anti-aliasing.

### 9.1 What Changed vs. the Original Plan

| Planned | Implemented | Reason |
|---------|------------|--------|
| GTAOPass (Three.js) | N8AOPostPass (n8ao) | Higher quality, built-in half-res + depth-aware upsampling |
| Three.js EffectComposer | pmndrs EffectComposer | Needed for ToneMappingEffect, ShadowMaskEffect, SMAA |
| OutputPass for tone mapping | ToneMappingEffect in EffectPass | Shared EffectPass with shadow + SMAA effects |
| SSAO checkbox + 2 sliders | AO Intensity slider only (0–30) | Simplified UI; AO always on when intensity > 0 |
| `studioSSAO`, `studioSSAOIntensity`, `studioSSAORadius` | `studioAOIntensity` (0–3.0) | Single control; N8AO handles radius automatically |

### 9.2 Current Architecture (StudioComposer)

```
Studio mode rendering (StudioComposer.render()):
  EffectComposer (pmndrs, HalfFloat FBO)
    ├─ RenderPass(scene, camera)           // scene render
    ├─ N8AOPostPass(scene, camera, w, h)   // ambient occlusion (half-res)
    └─ EffectPass(camera, ...)             // single shader combining:
        ├─ ShadowMaskEffect                // depth-masked shadow composite
        ├─ ToneMappingEffect               // Neutral/AgX/ACES
        └─ SMAAEffect                      // anti-aliasing
```

The composer is created on `enterStudioMode()` and disposed on `leaveStudioMode()`.
CAD mode is completely unaffected — it uses direct `renderer.render()`.

### 9.3 N8AO Configuration

```typescript
n8aoPass.configuration.aoRadius = 2.0;
n8aoPass.configuration.distanceFalloff = 0.5;
n8aoPass.configuration.intensity = 1.5;  // controlled by studioAOIntensity
n8aoPass.configuration.halfRes = true;
n8aoPass.configuration.depthAwareUpsampling = true;
n8aoPass.configuration.gammaCorrection = false;  // tone mapping handles this
n8aoPass.setQualityMode("Medium");
```

### 9.4 UI

| Control | Type | Default | Range | State key |
|---------|------|---------|-------|-----------|
| AO Intensity | Slider | 5 (= 0.5) | 0–30 (÷10 → 0–3.0) | `studioAOIntensity` |

AO is disabled when intensity = 0. No separate checkbox needed.
- Memory: one additional render target (~8 MB at 1080p canvas)

### 9.7a Resize Handling

When the canvas is resized while EffectComposer is active, both the composer and
GTAOPass must be updated:

```typescript
// In resizeCadView() -- add after renderer.setSize():
if (this.composer) {
  this.composer.setSize(newWidth, newHeight);
}
if (this.gtaoPass) {
  this.gtaoPass.setSize(newWidth, newHeight);
}
```

Without this, SSAO would render at the old resolution and stretch/distort.

### 9.8 Implementation Phase

SSAO is a self-contained addition after the core Studio mode is working (after
Phase 5). It could be Phase 6a, before or alongside the polish phase:

**Files to change:**
- `src/core/viewer.ts`: Conditional EffectComposer creation, render loop switch,
  resize handling in `resizeCadView()`
- `src/core/viewer-state.ts`: SSAO state keys
- `src/ui/index.html`: SSAO controls in Studio panel (advanced/collapsible section)
- `src/ui/display.ts`: Wire SSAO controls

**New dependencies** (all already in `three/examples/jsm/`):
- `EffectComposer`
- `RenderPass`
- `GTAOPass`
- `OutputPass`

---

## Part 10: Material Editor (Simplified Implementation)

**Status: PARTIALLY IMPLEMENTED.** A simplified material editor was implemented
in Phase 7 as a PBR parameter tweaker. The full preset/texture/export workflow
described in the original design below was not implemented — material assignment
remains on the Python side via `materialx-db`.

See Phase 7 above for what was implemented. The original design is preserved
below for historical reference.

<details>
<summary>Original design (historical, not implemented)</summary>

### 10.1 Purpose

New users may not be able to construct materials JSON from the client side.
The material editor lets them visually assign materials, textures, and colors to
individual objects in the viewer, see the result in real time, and **export** the
resulting material definitions for use in their data format.

The editor is the authoring tool that closes the loop:
```
Presets + Textures  →  Material Editor (visual)  →  Export materials dict  →  Data format
```

### 10.2 Workflow

1. User switches to the **Studio** tab
2. User clicks an object in the 3D viewport (raycast selection, already exists)
3. The **material editor panel** opens, showing the selected object's current
   material
4. User picks a preset, adjusts parameters, assigns textures
5. The object updates in real time
6. User repeats for other objects
7. User clicks **Export** → gets the materials dict for all edited objects

### 10.3 UI Layout

The material editor lives inside the Studio tab panel. It appears below the
environment/tone mapping controls when an object is selected.

```
┌─ Studio Tab ──────────────────────────┐
│                                       │
│  Environment: [Studio ▼]              │
│  Env Intensity: ──●──────── 1.0       │
│  Show Background: [ ]                 │
│  Tone Mapping: [ACES ▼]              │
│  Exposure: ──────●──────── 1.0       │
│  Show Edges: [ ]                      │
│  SSAO: [ ]                            │
│                                       │
│  ─── Material Editor ───────────────  │
│                                       │
│  Selected: Windshield                 │
│                                       │
│  Preset: [glass-clear ▼]  [●sphere]  │
│                                       │
│  Base Color: [■ #ffffff] Alpha: 1.0   │
│  Metallic:   ──────────●── 0.0       │
│  Roughness:  ●───────────── 0.0       │
│  Transmission: ────────●── 1.0       │
│  IOR:        ──────●──────── 1.52    │
│  Thickness:  ───●──────────── 2.0    │
│                                       │
│  Normal Texture: [none ▼]             │
│  Base Texture:   [none ▼]             │
│                                       │
│  [Reset]                              │
│                                       │
│  ─── Export ────────────────────────  │
│  [Export All Appearances]             │
│  [Copy to Clipboard]                  │
│                                       │
└───────────────────────────────────────┘
```

### 10.3a Material Preview Sphere

A small (128x128 px) WebGL preview sphere is rendered next to the preset
dropdown. It shows the current material applied to a sphere with the active
environment map, updating in real time as the user adjusts parameters.

**Implementation**: Use the **main renderer** with a `WebGLRenderTarget` (128x128)
to render the preview sphere. This avoids creating a second WebGL context (which
would count against browser limits of 8-16 contexts per page, a concern in
Jupyter with multiple widgets). The approach: render sphere to render target,
read pixels to a canvas for display. Same environment/PMREM texture used by the
main scene. Re-renders on any material parameter change. Check the orientation
marker implementation for a reference pattern of rendering to a sub-viewport.

**Benefits**:
- Instant visual feedback without needing to look at the 3D viewport
- When browsing presets, the preview shows the material before applying it
- Low cost: single sphere, shared environment texture, 128x128 resolution
- No extra WebGL context (safe in multi-widget Jupyter pages)

### 10.4 Editor Controls

**Object selection:**
- Click an object in the viewport → highlights it, shows its name in the editor
- The tree view (Tree tab) selection also works: if user selects an object in
  the tree, the editor loads its material when switching to Studio tab
- Only leaf nodes (with `shape`) are selectable for material editing

**Preset selector:**
- Dropdown listing all built-in presets grouped by category:
  Metals, Plastics, Glass, Rubber, Paint, Natural
- Selecting a preset fills in all parameter fields
- Fields can then be individually overridden

**Parameter controls:**
The editor shows a subset of MaterialAppearance fields. Controls are shown/hidden
dynamically based on relevance:

| Control | Type | Always Visible | Shown When |
|---------|------|---------------|------------|
| Preset | Dropdown | Yes | Always |
| Base Color | Color picker + alpha | Yes | Always |
| Metallic | Slider 0-1 | Yes | Always |
| Roughness | Slider 0-1 | Yes | Always |
| Transmission | Slider 0-1 | No | Preset uses it or user expands "Advanced" |
| IOR | Slider 1.0-2.5 | No | transmission > 0 |
| Thickness | Slider 0-20 | No | transmission > 0 |
| Clearcoat | Slider 0-1 | No | Preset uses it or "Advanced" |
| Clearcoat Roughness | Slider 0-1 | No | clearcoat > 0 |
| Sheen Color | Color picker | No | "Advanced" |
| Sheen Roughness | Slider 0-1 | No | sheenColor set |
| Anisotropy | Slider 0-1 | No | "Advanced" |
| Emissive | Color picker | No | "Advanced" |
| Double Sided | Checkbox | No | "Advanced" |

An **"Advanced"** toggle expands/collapses the less common parameters.

**Texture selectors:**
- Dropdown for each texture slot: Normal, Base Color, Metallic-Roughness
- Options: "None", then built-in textures (`builtin:brushed`, etc.),
  then entries from the root `textures` table
- Selecting a texture applies it immediately

**Live editing:** All parameter changes are applied immediately to the selected
object -- no "Apply" button needed. The material updates in real time as sliders
move, presets are selected, or textures are chosen.

**Action buttons:**
- **Reset**: reverts the selected object to its original material (from data
  format) or to no material (global fallback)
- **Export Materials**: generates the materials dictionary for all objects that
  have been edited in the current session
- **Copy to Clipboard**: copies the export to clipboard

### 10.5 Export Format

The export produces a **materials library** (not a path-based mapping). The user
gives each material a meaningful name, pastes the library into their Python code,
and tags their objects. This approach survives model restructuring because tags
live on the objects, not on paths.

**Export output (Python format for direct copy-paste):**

```python
# ---- Material library (paste into your code, reuse across projects) ----
materials = {
    "body_paint": {
        "preset": "car-paint",
        "baseColor": [0.8, 0.0, 0.0, 1.0],
    },
    "windshield_glass": {
        "transmission": 1.0,
        "roughness": 0.0,
        "ior": 1.52,
        "thickness": 5.0,
    },
    "trim_brushed": {
        "preset": "brushed-aluminum",
        "normalTexture": "builtin:brushed",
    },
}

# ---- Tag your objects (one-time, survives restructuring) ----
# body.material = "body_paint"           # build123d .material attribute
# windshield.material = "windshield_glass"
# trim_piece.material = "trim_brushed"

show(assembly, materials=materials)
```

**Naming**: Material names are auto-generated from the object name (e.g.,
"Body" → "body_material", "Windshield" → "windshield_material"). The user can
overwrite the auto-generated name in the export panel if desired. No prompt
interrupts the editing flow.

**Export options:**
- **Python format** (default): Python dict syntax for direct paste into
  build123d / CadQuery code
- **JSON format**: for programmatic use or other host languages
- **Compact**: only include fields that differ from the preset defaults
- **Full**: include all MaterialAppearance fields (for documentation/debugging)
- **Copy to clipboard**: one-click copy

### 10.6 Object Highlighting

When the material editor is active and an object is selected:
- The selected object gets a subtle highlight via temporarily increasing its
  emissive value (simple, no extra passes needed)
- Other objects are slightly dimmed (reduce opacity by 20%) to focus attention
- Clicking empty space or pressing Escape deselects

V1 uses the emissive-boost approach for simplicity. A post-process OutlinePass
could be added later if EffectComposer is already active (e.g., when SSAO is on).

### 10.7 Editor State

The editor tracks edits per object in a transient map (not persisted in
ViewerState, lives only for the current session):

```typescript
// In-memory only, lost on page reload
editorOverrides: Map<string, MaterialAppearance>  // keyed by object id

// Example:
editorOverrides.get("/Car/Body") → { preset: "car-paint", baseColor: [0.8, 0, 0, 1] }
```

When entering Studio mode, the material for each object is resolved as:
1. Editor override (if user edited this object) → highest priority
2. Data format `material` tag (if provided in input) → middle priority
3. Global fallback (Material tab metalness/roughness) → lowest priority

### 10.7a Undo/Redo

Deferred. The material editor and Studio tab settings do NOT have undo/redo
in the initial implementation. Per-object "Reset" reverts to the original
material. A global undo system may be added in a future version if needed.

### 10.8 API

```typescript
// Programmatic material assignment (same as editor does visually)
setObjectMaterial(objectId: string, material: string): void
getObjectMaterial(objectId: string): string | null
clearObjectMaterial(objectId: string): void

// Export
exportMaterials(): Record<string, MaterialAppearance>
exportMaterialsJSON(): string
```

### 10.9 Implementation Phase

The material editor is built on top of the working Studio mode (after Phase 5)
and the presets. It is a self-contained UI addition:

**Phase 7: Material Editor** (after Phase 6 polish, or in parallel)

**Files to change:**
- `src/ui/index.html`: Editor panel HTML inside Studio tab
- `src/ui/display.ts`: Editor controls, preset dropdown population, event
  wiring, show/hide based on selection
- `src/core/viewer.ts`:
  - `setObjectMaterial()` / `getObjectMaterial()` / `clearObjectMaterial()`
  - `exportMaterials()` / `exportMaterialsJSON()`
  - Hook raycast selection to editor panel (when Studio tab active)
- `src/scene/objectgroup.ts`: Apply editor overrides in `enterStudioMode()`
- `src/scene/nestedgroup.ts`: Lookup object by id for material swap
- `src/rendering/material-presets.ts`: Extend with editor metadata (categories,
  display names). File created in Phase 4.
- New file `src/rendering/material-preview.ts`: Preview sphere renderer
  (main renderer + 128x128 WebGLRenderTarget, sphere mesh, shared PMREM texture)
- CSS: Editor panel styling, collapsible advanced section, preview sphere canvas

**New dependencies**: None (color picker can be a simple `<input type="color">`)

</details>

---

## Part 11: Cross-Session Caching of Downloadable Assets (v2 roadmap)

> **Deferred to v2.** With only RoomEnvironment (procedural, no network) and
> browser HTTP cache for HDR presets, IndexedDB caching is not needed for v1.
> An in-memory `Map` cache for the current session is sufficient. The full design
> below is retained for v2 implementation when the texture pack system ships.

### 11.1 Problem

Downloadable assets (HDR environment presets, texture packs) are 500 KB - 5 MB
each. Without caching, they are re-downloaded every time the page reloads. This
is wasteful and causes noticeable load delays on each session.

### 11.2 Strategy: IndexedDB + HTTP Cache

The viewer uses a two-layer cache: HTTP cache (automatic, server-dependent) and
IndexedDB (explicit, library-controlled). No Service Worker is required, which
is critical for Jupyter notebook compatibility.

```
Asset request
  │
  ├─ Layer 1: In-memory cache (current session)
  │   → Map<string, THREE.Texture | ArrayBuffer>
  │   → Instant, no I/O
  │
  ├─ Layer 2: IndexedDB (cross-session, persistent)
  │   → Stores Blob + metadata per asset URL/key
  │   → ~1-5 ms read, survives page reload
  │
  └─ Layer 3: Network fetch (first-time only)
      → HTTP cache may serve 304 Not Modified
      → Full download if not cached
      → Result stored in IndexedDB for next session
```

### 11.3 What Gets Cached

| Asset Type | Key | Size | Lifetime |
|-----------|-----|------|----------|
| RoomEnvironment PMREM | `env:studio` | ~1 MB (serialized cubemap) | Until viewer version changes |
| HDR preset "Neutral" | `env:neutral` | ~500 KB | Indefinite |
| HDR preset "Outdoor" | `env:outdoor` | ~500 KB | Indefinite |
| Custom HDR | `env:<url>` | 500 KB - 5 MB | LRU eviction after 30 days |
| Texture pack image | `tex:<name>` | 100-200 KB each | Indefinite |
| User-provided textures | `tex:<url>` | varies | LRU eviction after 30 days |

### 11.4 Implementation

Use IndexedDB directly with a thin wrapper (no external dependency). The API
surface is small: `get`, `put`, `delete`, `clear`.

The `AssetCache` is a **module-level singleton** (one per page, not per viewer
instance). Multiple viewer instances on the same page share the cache
automatically, avoiding redundant IndexedDB connections and ensuring cache hits
across viewers. This is important in Jupyter where multiple widgets can be on
the same page.

```typescript
// src/rendering/asset-cache.ts

// Module-level singleton
let instance: AssetCache | null = null;
export function getAssetCache(): AssetCache {
  if (!instance) instance = new AssetCache();
  return instance;
}

class AssetCache {
  private dbName = "three-cad-viewer";
  private storeName = "assets";
  private memoryCache = new Map<string, Blob>();

  /** Get asset from memory → IndexedDB → null */
  async get(key: string): Promise<Blob | null>

  /** Store asset in memory + IndexedDB */
  async put(key: string, blob: Blob, metadata?: { version?: string }): Promise<void>

  /** Delete a specific asset */
  async delete(key: string): Promise<void>

  /** Evict entries older than maxAge (default 30 days) */
  async evictStale(maxAgeMs?: number): Promise<number>

  /** Total cache size in bytes */
  async size(): Promise<number>

  /** Clear all cached assets */
  async clear(): Promise<void>
}
```

Each stored entry:
```typescript
interface CachedAsset {
  key: string;           // e.g. "env:neutral"
  blob: Blob;            // the binary data
  timestamp: number;     // Date.now() when cached
  version?: string;      // viewer version (for invalidation on upgrades)
  size: number;          // blob size in bytes
}
```

### 11.5 Cache Lifecycle

```
Viewer init:
  → Open IndexedDB "three-cad-viewer" / "assets"
  → Run evictStale() to clean entries older than 30 days
  → (async, non-blocking)

Asset load (environment or texture):
  1. Check memoryCache → hit? Return immediately
  2. Check IndexedDB → hit? Load blob, decode to texture, store in memoryCache
  3. Miss → fetch from network → store in IndexedDB + memoryCache

Viewer dispose:
  → Release memoryCache (GC handles it)
  → IndexedDB persists for next session
```

### 11.6 Version Invalidation

When the viewer is upgraded, cached assets may be stale (e.g., RoomEnvironment
generates a different PMREM with a new Three.js version). Each cache entry
stores the viewer version. On init, entries with a mismatched version are evicted.

### 11.7 Storage Budget

Target: keep total cached assets under **50 MB** per origin.

| Asset | Count | Size Each | Total |
|-------|-------|-----------|-------|
| Environment presets | 3 | ~1 MB | ~3 MB |
| Custom HDRs | 2-3 | ~2 MB | ~6 MB |
| Texture pack | ~11 images | ~200 KB | ~2 MB |
| Custom textures | varies | varies | ~5 MB |
| **Total** | | | **~16 MB typical** |

Well within browser limits (Chrome: 60% of disk, Firefox: 50%, Safari: 1 GB).

### 11.8 Browser Considerations

| Browser | IndexedDB Limit | Persistence | Notes |
|---------|----------------|-------------|-------|
| Chrome | 60% of disk | Best-effort, survives restart | Evicts under storage pressure (LRU) |
| Firefox | 50% of disk | Best-effort, survives restart | Same as Chrome |
| Safari | 1 GB | **7-day eviction if no user interaction** | Re-downloads after 7 days of inactivity |

**Safari 7-day limit**: The viewer handles this gracefully -- if the cache is
empty, it re-downloads. The user sees a brief load delay every ~7 days on Safari
but no errors. This is acceptable given Safari's market share in the CAD/Jupyter
user base.

### 11.9 Jupyter Notebook Notes

- IndexedDB works in Jupyter notebook contexts (JupyterLab, VS Code Jupyter)
  without restrictions
- No Service Worker setup required (Jupyter doesn't support SW registration
  from embedded widgets)
- The `three-cad-viewer` widget shares the origin's IndexedDB storage with other
  widgets on the same Jupyter server -- the `dbName` namespace avoids conflicts
- HTTP cache is unreliable in Jupyter (server sets `Cache-Control: no-cache`),
  making IndexedDB the primary persistence layer

### 11.10 Implementation Phase

Caching is a cross-cutting concern. It should be implemented alongside or
immediately after environment map support (Phase 3):

**Files to change:**
- New file `src/rendering/asset-cache.ts`: `AssetCache` class
- `src/rendering/environment.ts`: Use `AssetCache` for HDR loading
- `src/rendering/texture-cache.ts`: Use `AssetCache` for texture pack loading
- `src/core/viewer.ts`: Initialize `AssetCache` at viewer creation, dispose on
  cleanup

**No external dependencies.** IndexedDB API is used directly with a ~100-line
wrapper class. No need for `localforage` or similar libraries -- the API surface
(get/put/delete by key) is simple enough.

---

## Part 11a: Disposal and Lifecycle

Studio mode introduces GPU resources that live outside the scene graph (cached
materials, textures, render targets). These must be explicitly disposed.

### 11a.1 `viewer.dispose()` (viewer destroyed)

Must dispose ALL Studio resources. **Ordering**: First call `clear()` (which
sets activeTab="tree", triggering `leaveStudioMode()` and `deepDispose(scene)`),
then **explicitly** dispose Studio side-stores that are no longer referenced by
meshes:

1. **studioMaterials** (per ObjectGroup): Iterate the `studioMaterials` map and
   dispose each MeshPhysicalMaterial. Must happen **after** `clear()` completes,
   because `clear()` → `leaveStudioMode()` swaps CAD materials back, then
   `deepDispose(scene)` disposes only the CAD materials on meshes. The
   studioMaterials (now off-mesh) would be orphaned without this explicit step.
   **Double-dispose protection**: Skip materials that are already disposed
   (check `material.dispose` existence or track via a disposed flag).
2. **TextureCache**: Sole owner of all textures. `disposeMaterial()` sets texture
   references to null (without calling `texture.dispose()`).
   `textureCache.dispose()` disposes all textures at once. No reference counting.
3. **PMREMGenerator**: Call `pmremGenerator.dispose()`.
4. **EnvironmentManager**: Dispose cached PMREM cubemap textures.
5. **Material preview sphere**: Dispose the render target, sphere scene, and
   sphere geometry/material. (Uses main renderer with WebGLRenderTarget, no
   extra WebGL context to dispose.)
6. **Studio event listeners**: Dispose Studio tab sliders, dropdowns, and
   checkbox event listeners in `Display.dispose()` (same pattern as existing
   clip/material/zebra slider disposal).
7. **StudioFloor**: Call `_studioFloor.dispose()` to clean up the grid
   geometry, materials, and group.

Note: EffectComposer disposal is deferred to v2 (SSAO).

### 11a.2 `viewer.clear()` (shape data reloaded)

Dispose shape-specific resources, keep infrastructure alive:

- **Dispose**: studioMaterials, TextureCache (textures may change with new data)
- **Keep**: EnvironmentManager (environment is independent of shape data),
  EffectComposer (render targets don't depend on shape data), PMREMGenerator,
  **builtin procedural textures** (these are shape-data-independent, generated
  from Canvas2D code; stored in a separate persistent cache within TextureCache
  that survives `clear()` and is only disposed on `viewer.dispose()`)

### 11a.3 Update `disposeMaterial()` for MeshPhysicalMaterial

The existing `disposeMaterial()` in `utils.ts` only handles texture maps from
MeshStandardMaterial. MeshPhysicalMaterial adds these additional texture maps
that must also be disposed:

- `transmissionMap`, `clearcoatMap`, `clearcoatRoughnessMap`, `clearcoatNormalMap`
- `thicknessMap`, `specularIntensityMap`, `specularColorMap`
- `sheenColorMap`, `sheenRoughnessMap`, `anisotropyMap`

**Fix**: Update the `MaterialLike` interface in `utils.ts` to include these maps,
or use a generic approach that iterates all properties and disposes any
`THREE.Texture` instance. This is part of **Phase 5** (listed in its file changes).

### 11a.4 Shared Texture Safety (Sole Owner Approach)

The TextureCache is the **sole owner** of all loaded textures. When disposing a
material, `disposeMaterial()` sets texture map properties to `null` (e.g.,
`material.map = null; material.normalMap = null;`) but does NOT call
`texture.dispose()`. Only `textureCache.dispose()` disposes the actual GPU
texture resources. This eliminates the need for reference counting.

On `viewer.clear()`: TextureCache is disposed (all textures freed). On
`viewer.dispose()`: same, but happens inside the full teardown sequence.

---

## Part 12: Non-Goals (Explicitly Out of Scope)

- ~~Shadow mapping~~ — Implemented in Phase 6d (two-pass blur + depth masking)
- Post-processing effects beyond SSAO (bloom, DOF, SSR) -- could be added later
- Real-time global illumination (full light bouncing between objects)
- Skin/hair/cloth simulation
- glTF/glB file import (separate feature, can leverage this infrastructure later)

---

## Part 13: Testing Strategy

The existing test suite uses Vitest with unit tests (`tests/unit/`), integration
tests (`tests/integration/`), and snapshot-based approval tests. Studio mode
testing follows the same patterns.

### 13.1 Unit Tests

New test files per phase:

- `tests/unit/material-resolution.test.js` (Phase 1/4):
  - Material tag → materials table → built-in preset → fallback
  - Preset merging (flat: `{ preset: "car-paint", baseColor: [...] }`)
  - Unknown tag → warning + fallback
  - Malformed values → clamping
- `tests/unit/texture-resolution.test.js` (Phase 4):
  - `builtin:` → textures table → `data:` → URL
  - Missing texture → null (no crash)
- `tests/unit/color-conversion.test.js` (Phase 4):
  - CSS hex → linear RGBA conversion
  - Edge cases: "#000000", "#ffffff", 3-digit hex, invalid hex
- `tests/unit/material-factory-studio.test.js` (Phase 4):
  - `createStudioMaterial()` produces MeshPhysicalMaterial
  - All MaterialAppearance properties map correctly
  - Fallback to leaf color when no baseColor
- `tests/unit/material-presets.test.js` (Phase 4):
  - All 31 presets produce valid MeshPhysicalMaterial
  - No preset has out-of-range values

- `tests/unit/studio-tab.test.js` (Phase 2):
  - Tab reordering: Tree, Clip, Zebra, Material, Studio
  - `studioTool: false` → Studio tab hidden
  - Studio state keys have correct defaults
- `tests/unit/environment.test.js` (Phase 3):
  - RoomEnvironment load/apply/remove cycle
  - HDR preset load + PMREM generation
  - In-flight promise deduplication

### 13.2 Integration Tests

- `tests/integration/studio-mode.test.js` (Phase 5):
  - Enter Studio → materials swapped to MeshPhysicalMaterial
  - Leave Studio → materials restored to MeshStandardMaterial exactly
  - Round-trip: enter, modify settings, leave, re-enter → settings preserved
  - Clipping save/restore on mode switch
  - Edge visibility save/restore
- `tests/integration/studio-disposal.test.js` (Phase 5):
  - `viewer.dispose()` while in Studio mode → no GPU leaks (use existing gpu-tracker)
  - `viewer.dispose()` while in CAD mode with studioMaterials cached → disposed correctly
  - `viewer.clear()` (shape reload) → studioMaterials disposed, environment kept
- `tests/integration/studio-resize.test.js` (Phase 6a, v2):
  - Resize with EffectComposer active → composer + GTAOPass resized

### 13.3 Snapshot/Approval Tests

- `tests/integration/studio-approval.test.js` (Phase 6):
  - Studio mode with car-paint preset → snapshot
  - Studio mode with glass (transmission) → snapshot
  - Studio mode with no materials (global fallback) → snapshot
  - Compare CAD mode → Studio mode → back to CAD mode → snapshot matches original

### 13.4 Manual Test Checklist

Per phase deliverable, verify visually:
- [ ] Environment reflections visible on metallic objects
- [ ] Tone mapping effect visible (ACES vs Linear comparison)
- [ ] Edge toggle works in Studio mode
- [ ] SSAO visible in crevices/joints (v2)
- [ ] ~~Material editor: click object → sliders update → real-time preview~~ (DROPPED)
- [ ] ~~Material preview sphere matches viewport~~ (DROPPED)
- [ ] ~~Export produces valid Python dict~~ (DROPPED)
- [ ] materialx-db MaterialXMaterial entries render correctly in Studio mode
- [ ] colorOverride replaces base color and removes base color texture
- [ ] Builtin preset references ("builtin:chrome") resolve correctly
- [ ] Loading indicator shows on first Studio activation
- [ ] Error fallback works (simulate failed HDR load)
