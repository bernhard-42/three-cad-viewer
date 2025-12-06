# Change log

## v4.0.0

**Architecture**

- Major refactoring to decouple components and modernize the codebase
- Introduced centralized `ViewerState` class for state management with subscription support
- Decoupled `Viewer` from `Display` - Display now receives Viewer instance via dependency injection
- Controls architecture rewritten with separate `CADOrbitControls` and `CADTrackballControls` classes
- New `Controls` wrapper class providing unified API with normalized speed factors
- Added `MaterialFactory` for centralized material creation and management
- Improved memory management with consistent `dispose()` methods across all components

**Features**

- Added `holroyd` parameter to control non-tumbling trackball rotation mode
- Exposed `getHolroyd()` and `setHolroyd()` methods on Viewer
- Normalized control speed settings (pan, rotate, zoom) - 1.0 now means consistent default experience across control types
- Added comprehensive unit and integration test suite (1100+ tests, 94% coverage)

**Fixes**

- Fixed trackball panning speed to be more responsive
- Fixed holroyd (non-tumbling) trackball rotation
- Ensured proper disposal of all Three.js objects to prevent memory leaks

## v3.6.3

**Fixes**

- Fix typos in the properties selectTool and explodeTool in toolbar.js preventing the tools being visible

## v3.6.2

**Features**

- Dynamic theme support
  - Grid now scales dynamically based on zoom level
  - Beautified grid with dashes and different colors for better visual clarity
  - Enhanced grid font rendering with improved axis label readability
  - New paramter "gridFontSize" with default 12
- Viewer now automatically reacts to theme changes from the browser or OS
- Add viewer version to ready message for better debugging
- Introduced EventListenerManager for better event disposal
- Allow clicking on canvas to close help dialog
- Settle on FOV 22 and improve perspective camera settings

**Fixes**

- Theme handling
  - Remove wrong theme setting and 'dark' property
  - Set initial theme properly on viewer initialization
  - Ensure body background is theme sensitive
- Remove context menu from help dialog
- Make keymap routine more robust
- Improve heuristics for various viewer operations
- Add overflow hidden to body tag to prevent scrolling issues
- Bump version of three.js to 0.180.0

## v3.6.1

**Features**

- Add polygon renderer for GDS files (will be part of gdsfactoryplus)
- Add a z-scale tool for GDS files
- Add GDS chip design examples (photonic and classic)

**Fixes**

- Change memory management to a new paradigm using a global function deepDispose which works recursively
- Fix setCameraTarget
- Fix keymapping regression where keymaps were not used any more
- Reduce far plane distance to improve transparent rendering

## v3.5.0

**Features**

- The viewer now supports widths of < 815px with shrunken toolbar (using ellipsis). From 815px width the toolbar is fully visible
- The view preset buttons in the toolbar now respect shift and will center the to all visible objects only

For the following features you need a measure backend, e.g. as in [VS Code OCP Viewer](https://github.com/bernhard-42/vscode-ocp-cad-viewer)

- Removed angle measure button, it is integrated in distance measure
- Simplified filter management in measure mode since angle tool vanished
- Changed shift modifier in distance measure mode to distinguish between min and center distance
- Changed the hard coded DEBUG flag in measure mode to a display options parameter measurementDebug

**Fixes**

- Move measurement toggle to display options

## v3.4.3

**Fixes**

- Make measure debug mode asynchronous and fix delay-by-one-step regression

## v3.4.2

**Fixes**

- Ensure that lines and arrows for measurement are initialized once only to remove memory leaks [#29](https://github.com/bernhard-42/three-cad-viewer/issues/29)
- Clean up disableTools, disableContext and dispose
- Ensure tools get properly disabled

## v3.4.1

**Features**

- Clicking on a tree label with shift+meta hides all others without change of location

**Fixes**

- Fix isolate mode when there are only 1-dim objects in the viewer
- Fix parameters whan calling handlepick

## v3.4.0

**Features**

- Add select shapes mode for OCP CAD Viewer

**Fixes**

- Add \_ in vertex enumeration for the expanded mode

## v3.3.5

**Fixes**

- Move disposing of shapes and groups to clear()
- Fix wrong order of parameters in the Viewer.render function
- Add a color indicator to the objects in the navigation tree

## v3.3.4

**Fixes**

- Move packages "cross-spawn" and "html-minifier" to dev dependencies

## v3.3.3

**Fixes**

- Fix center_grid parameter name

## v3.3.2

**Fixes**

- Ensure theme is only set for container and not for document
- Replace scrollIntoView for the navigation tree with own logic to avoid page jumps in Jupyter
- Fix clip setting via API

## v3.3.1

**Fixes**

- Fix top level bounding box

## v3.3.0

**Features**

- Change measure panel to be stable

**Fixes**

- Fix top and bottom skew for up=Z
- Add dispose methods to measure classes
- Fix switching object while measurement is active

## v3.2.3

- Fix toggleTab after dispose is called

## v3.2.2

- Fix updating orientation marker after changes in treeview

## v3.2.1

- Fix removing orientation marker from screenshot

## v3.2.0

**Features**

- Add a function to set the center of the grid interactively
- Restrict help box to viewer size, use scrolling and enable Escape everywhere
- Add setVisible to orientationMarker and hide the marker during screenshots
- Move display out of viewer and setup ui before showing cad objects

**Fixes**

- Fix glass/no tools mode
- Fix double clicking edges leading to crash
- Fix some security alerts
- Add dispose method to fix memory leaks

## v3.1.8

**Features**

- Allow to deselect all selected objects via right click

**Fixes**

- Fix mouse up position comparison
- Change resize button to always zoom to factor 1
- Fix center to point on double click

## v3.1.6

**Features**

- Add KeyMapper to measure click event handler
- Introduce new file format
- Introduce a new lazy tree component
- Highlight back side of faces in measure mode
- Enable radius2 for measuring ellipses
- Open first level on start

**Fixes**

- Ensure STLs are handled properly
- Fix regression around click handling in measure mode
- Remove unused code
- Add measure mode to help
- Support longer names in the tree
- Updated all examples to new data format
- Support image faces for expanded faces
- Fix interworking of explode and measurements
- Hide animation control in measure mode
- Remove double render
- Fix top level bounding box
- Fix label color on second click
- Fix selecting full solids
- Enable animation loop for taking screenshots
- Prevent model toggling when switching between tools
- Disable clipping tab instead of hiding it
- Add a function to show/hide clipping tab

## v2.2.5

**Fixes**

- Handle protocol v3 and ensure protocol v2 and v1 are still rendered

## v2.2.4

**Fixes**

- Do not handle clipping planes in raycaster

## v2.2.3

**Fixes**

- Check a front exists before changing its material

## v2.2.2

**Fixes**

- Add a function to retrieve objectgroup's state
- Ensure all for all deselected objects the stencil planes are invisible

## v2.2.1

**Fixes**

- Fix brightening backcolor via lerp()
- Hide stencil plane together with faces for better clipping

## v2.2.0

**Features**

- Introduce stencil for clipping
- Add reset button to material configurator
- Ensure clipping object color check box gets checked when set per api
- Implement centered grid and numbers on the grid

**Fixes**

- Fix input value of sliders
- Make plane helper material double sided
- Made glass mode the default
- Make background color a bit brigther to distinguish from edge color
- Show image texture on both side
- Wrap color value into THREE.Color class
- Fix toolbar checkboxes not working, fix dropdown hiding

## v2.1.2

**Features**

- Changed to protocol 2
- Introduce measurement mode

## v1.8.7

**Features**

- Key mapping can be changed (viewer.setKeyMap({"shift": "ctrlKey", "ctrl": "shiftKey", "meta": "altKey"}) or as parameter to the viewer

**Fixes**

- Switched to threejs r155 and fixed for the breaking change for light intensity
- "clean" and "build" steps in package,json are Windows friendly (note, docs and release aren't, but you might not need them)

## v1.8.6

**Fixes**

- Fixed root collapse mode

## v1.8.5

**Fixes**

- Ensure center is set as target for preset buttons
- Added Vector3 and Quaternion creator

## v1.8.4

**Fixes**

- Fixed trihedron panning for panned objects

## v1.8.3

**Fixes**

- Ensure notifications for material properties are sent
- Add setters for material properties

## v1.8.2

**Fixes**

- Integrate helvetiker font into code

## v1.8.1

**Fixes**

- Removal of environment maps and new defaults

## v1.8.0

**Features**

- XYZ labels for orientation marker
- Support for metalness and roughness
- Material configurator tab

## v1.7.12

**Fixes**

- Ensure no exceptions are thrown when the view is cleared and resized

## v1.7.11

**Fixes**

- Check properly whether animation is active

## v1.7.10

**Features**

- Add expand root only for treeview
- Add recenterCamera method

**Fixes**

- Ensure center is shown for object far away from center

## v1.7.9

**Features**

- Add example for single edges and vertices
- Enable explode for edges and vertices

## v1.7.8

**Features**

- Add build123d examples

## v1.7.7

**Features**

- Add build123d assembly

**Fixes**

- Fix explode

## v1.7.4

**Fixes**

- Fixed resize cad view problem

## v1.7.3

**Fixes**

- Bump version of three and dev depenedencies

## v1.7.2

- Ensure one element trees are not collapsed

## v1.7.0

**Features**

- Change trihedron orientation in the orientation marker to CAD standard

## v1.6.4

**Features**

- Add support for color alpha channel

## v1.6.3

**Features**

- Introduce mode where Y is camera up

**Fixes**

- Fixed grid menu selection issue

## v1.6.2

**Fixes**

- Fixed bbox.max_dist_from_center

## v1.6.1

**Features**

- Allow resizing after view is created

**Fixes**

- Increase minimum width to 970
- Handle more button in glassMode function
- Check bbox exist before updating it

## v1.6.0

**Features**

- Added treview highlighting
- A new bounding box (AABB) algorithm

**Fixes**

- Ensure bbox update will be triggered when animation starts
- Fix remove bbox on second click in tree
- Disable jupyter cell select on shift mousedown in cad tree
- Flexible "More" menu handling
- No bounding box for isolate mode
- Center isolated objects around bbox center and look at bbox center
- Clearer help text around AABB
- Extend help for picking/hiding/isolating
- Improve center info output
