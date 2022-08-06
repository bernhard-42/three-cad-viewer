v1.6.4
------

**Features:**
- Add support for color alpha channel

v1.6.3
------

**Features:**
- Introduce mode where Y is camera up

Fixes:
- Fixed grid menu selection issue

v1.6.2
------

**Fixes:**
- Fixed bbox.max_dist_from_center

v1.6.1
------

**Features:**
- Allow resizing after view is created

**Fixes:**
- Increase minimum width to 970
- Handle more button in glassMode function
- Check bbox exist before updating it

v1.6.0
------

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

