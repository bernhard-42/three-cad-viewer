## v1.8.3

**Fixes:**

- Ensure notifications for material properties are sent
- Add setters for material properties

## v1.8.2

**Fixes:**

- Integrate helvetiker font into code

## v1.8.1

**Fixes:**

- Removal of environment maps and new defaults

## v1.8.0

**Features:**

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

**Features:**

- Add support for color alpha channel

## v1.6.3

**Features:**

- Introduce mode where Y is camera up

**Fixes:**

- Fixed grid menu selection issue

## v1.6.2

**Fixes:**

- Fixed bbox.max_dist_from_center

## v1.6.1

**Features:**

- Allow resizing after view is created

**Fixes:**

- Increase minimum width to 970
- Handle more button in glassMode function
- Check bbox exist before updating it

## v1.6.0

**Features:**

- Added treview highlighting
- A new bounding box (AABB) algorithm

**Fixes:**

- Ensure bbox update will be triggered when animation starts
- Fix remove bbox on second click in tree
- Disable jupyter cell select on shift mousedown in cad tree
- Flexible "More" menu handling
- No bounding box for isolate mode
- Center isolated objects around bbox center and look at bbox center
- Clearer help text around AABB
- Extend help for picking/hiding/isolating
- Improve center info output
