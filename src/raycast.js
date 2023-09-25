import * as THREE from "three";

const FilterType = {
    None: null,
    Vertex: "vertex",
    Edge: "edge",
    Face: "face",
    Solid: "solid",
};

class Raycaster {
    constructor(camera, domElement, width, height, group, callback) {
        this.camera = camera;
        this.group = group;
        this.domElement = domElement;
        this.width = width;
        this.height = height;
        this.callback = callback;

        this.raycaster = new THREE.Raycaster();
        this.raycastMode = false;

        this.lastPosition = null;

        this.mouse = new THREE.Vector2();
        this.mouseMoved = false;
        this.filterType = FilterType.None;
    }

    dispose() {
        this.domElement.removeEventListener("mousemove", this.onPointerMove);
        this.domElement.removeEventListener("mouseup", this.mouseKetUp);
        this.domElement.removeEventListener("mousedown", this.onMouseKeyDown);
        this.domElement.removeEventListener("keydown", this.onKeyDown);
        this.raycastMode = false;
    }

    init() {
        this.domElement.addEventListener("mousemove", this.onPointerMove);
        this.domElement.addEventListener("mouseup", this.onMouseKeyUp, false);
        this.domElement.addEventListener("mousedown", this.onMouseKeyDown, false);
        this.domElement.addEventListener("keydown", this.onKeyDown, false);
        this.raycastMode = true;
    }

    /**
     * Retrieve all the valid intersected objects by a ray caster from the mouse.
     * The objects are sorted by their distance from the ray. (The closest first)
     */
    getValidIntersectedObjs() {
        var validObjs = [];
        if (this.mouseMoved) {
            this.raycaster.setFromCamera(this.mouse, this.camera.getCamera());
            const objects = this.raycaster.intersectObjects(this.group, true);

            for (var object of objects) {
                if (
                    object.object.material.visible &&
                    (object.distanceToRay == null ||
                        object.distanceToRay < 0.03)
                ) {
                    const objectGroup = object.object.parent;
                    if (objectGroup == null) continue;

                    const name = objectGroup.metrics().name;
                    if (this.filterType == FilterType.None)
                        validObjs.push(object);
                    else if (name == this.filterType)
                        validObjs.push(object);
                }
            }
        }
        return validObjs;
    }

    /**
     * Handle left mouse button down event
     * @function
     * @param {MouseEvent} e - a DOM MouseEvent
     */
    onMouseKeyDown = (e) => {
        if (this.raycastMode) {
            if (e.button == THREE.MOUSE.LEFT || e.button == THREE.MOUSE.RIGHT) {
                this.lastPosition = this.camera.getPosition().clone();
            }
        }
    };


    /**
     * Handle left mouse button up event
     * @function
     * @param {MouseEvent} e - a DOM MouseEvent
     */
    onMouseKeyUp = (e) => {
        if (this.raycastMode) {
            if (e.button == THREE.MOUSE.LEFT) {
                if (this.lastPosition.equals(this.camera.getPosition())) {
                    this.callback({ mouse: "left" });
                }
            } else if (e.button == THREE.MOUSE.RIGHT) {
                if (this.lastPosition.equals(this.camera.getPosition())) {
                    this.callback({ mouse: "right" });
                }
            }
        }
    };

    /**
     * Handle key down event
     * @function
     * @param {MouseEvent} e - a DOM MouseEvent
     */
    onKeyDown = (e) => {
        if (this.raycastMode) {
            if (e.key == "Backspace") {
                this.callback({ key: "Backspace" });
            } else if (e.key == "Escape") {
                this.callback({ key: "Escape" });
            }
        }
    };

    /**
     * Get the current mouse position
     * @function
     * @param {MouseEvent} e - a DOM MouseEvent
     */
    onPointerMove = (e) => {
        const rect = this.domElement.getBoundingClientRect();
        const offsetX = rect.x + window.scrollX;
        const offsetY = rect.y + window.scrollY;
        this.mouse.x = ((e.pageX - offsetX) / this.width) * 2 - 1;
        this.mouse.y = -((e.pageY - offsetY) / this.height) * 2 + 1;
        this.mouseMoved = true;
    };
}

export { Raycaster };