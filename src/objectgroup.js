import * as THREE from "three";

class ObjectGroup extends THREE.Group {
    /**
     * 
     * @param {*} opacity 
     * @param {*} alpha 
     * @param {*} edge_color 
     * @param {object} shapeInfo A dictionary of shape information with a "topo" field and "geomtype" field.
     * @param {*} renderback 
     */
    constructor(opacity, alpha, edge_color, shapeInfo, subtype, renderback) {
        super();
        this.opacity = opacity;
        this.alpha = alpha == null ? 1.0 : alpha;
        this.edge_color = edge_color;
        this.shapeInfo = shapeInfo;
        this.subtype = subtype;
        this.renderback = renderback;
        this.types = { front: null, back: null, edges: null, vertices: null };
        this.isSelected = false;
        this.originalColor = null;
        this.originalWidth = null;
        this.vertexFocusSize = 8; // Size of the points when highlighted
        this.edgeFocusWidth = 5; // Size of the edges when highlighted    
    }

    addType(mesh, type) {
        this.add(mesh);
        this.types[type] = mesh;
        if (this.types.vertices) {
            this.originalColor = this.types.vertices.material.color.clone();
            this.originalWidth = this.types.vertices.material.size;
        } else if (this.types.edges && !this.types.front) { // ignore edges of faces
            this.originalColor = this.types.edges.material.color.clone();
            this.originalWidth = this.types.edges.material.linewidth;

        } else if (this.types.front) {
            this.originalColor = this.types.front.material.color.clone();
        }
    }

    widen(flag) {
        if (this.types.vertices) {
            this.types.vertices.material.size = flag ? this.vertexFocusSize : (this.isSelected ? this.vertexFocusSize - 2 : this.originalWidth);
        } else if (this.types.edges) {
            this.types.edges.material.linewidth = flag ? this.edgeFocusWidth : (this.isSelected ? this.edgeFocusWidth - 2 : this.originalWidth);
        }
    }

    toggleSelection() {
        const flag = !this.isSelected;
        this.isSelected = flag;
        this.highlight(flag);
        this.widen(false);
    }

    unhighlight(keepSelection) {
        if (!keepSelection || !this.isSelected) {
            this.isSelected = false;
            this.highlight(false);
        }
        this.widen(false);
    }

    highlight(flag) {
        var object = null;
        var hColor = null;
        var oColor = null;

        //console.log(this.name, "flag", flag, "isSelected", this.isSelected, this.originalColor, this.originalWidth);

        if (this.types.front) {
            object = this.types.front;
            hColor = this.isSelected ? new THREE.Color(0x53a0e3) : new THREE.Color(0x89b9e3);
            oColor = this.originalColor;

        } else if (this.types.vertices) {
            object = this.types.vertices;
            hColor = this.isSelected ? new THREE.Color(0x53a0e3) : new THREE.Color(0x89b9e3);
            oColor = this.originalColor;

        } else if (this.types.edges) {
            object = this.types.edges;
            hColor = this.isSelected ? new THREE.Color(0x53a0e3) : new THREE.Color(0x89b9e3);
            oColor = this.originalColor;
        }

        if (object != null) {
            this.widen(flag);
            object.material.color = flag ? hColor : oColor;
            object.material.needsUpdate = true;
        }
    }

    clearHighlights() {
        this.highlight(false);
        this.isSelected = false;
        this.widen(false);
    }

    metrics() {
        if (this.types.front) {
            return { name: "face", value: 0 };
        } else if (this.types.vertices) {
            return { name: "vertex", value: 0 };
        } else if (this.types.edges) {
            return { name: "edge", value: 0 };
        }
    }


    setMetalness(value) {
        for (var child of this.children) {
            if (!child.name.startsWith("clipping")) {
                child.material.metalness = value;
                child.material.needsUpdate = true;
            }
        }
    }

    setRoughness(value) {
        for (var child of this.children) {
            if (!child.name.startsWith("clipping")) {
                child.material.roughness = value;
                child.material.needsUpdate = true;
            }
        }
    }

    setTransparent(flag) {
        if (this.types.back) {
            this.types.back.material.opacity = flag
                ? this.opacity * this.alpha
                : this.alpha;
            this.types.front.material.opacity = flag
                ? this.opacity * this.alpha
                : this.alpha;
        }
        for (var child of this.children) {
            if (!child.name.startsWith("clipping")) {
                // turn depth write off for transparent objects
                child.material.depthWrite = this.alpha < 1.0 ? false : !flag;
                // but keep depth test
                child.material.depthTest = true;
                child.material.needsUpdate = true;
            }
        }
    }

    setBlackEdges(flag) {
        if (this.types.edges) {
            const color = flag ? 0x000000 : this.edge_color;
            this.originalColor = new THREE.Color(color);
            this.types.edges.material.color = new THREE.Color(color);
            this.types.edges.material.needsUpdate = true;
        }
    }

    setEdgeColor(color) {
        if (this.types.edges) {
            this.edge_color = color;
            this.types.edges.material.color = new THREE.Color(color);
            this.types.edges.material.needsUpdate = true;
        }
    }

    setOpacity(opacity) {
        if (this.types.front || this.types.back) {
            this.opacity = opacity;
            this.types.back.material.opacity = this.opacity;
            this.types.front.material.opacity = this.opacity;
            this.types.back.material.needsUpdate = true;
            this.types.front.material.needsUpdate = true;
        }
    }

    setShapeVisible(flag) {
        if (this.types.front) {
            this.types.front.material.visible = flag;
        }
        for (var t of ["clipping-0", "clipping-1", "clipping-2"]) {
            if (this.types[t]) {
                this.types[t].children[0].material.visible = flag;
                this.types[t].children[1].material.visible = flag;
            }
        }
        if (this.types.back && this.renderback) {
            this.types.back.material.visible = flag;
        }
    }

    setEdgesVisible(flag) {
        if (this.types.edges) {
            this.types.edges.material.visible = flag;
        }
        if (this.types.vertices) {
            this.types.vertices.material.visible = flag;
        }
    }

    setBackVisible(flag) {
        if (this.types.back && this.types.front.material.visible) {
            this.types.back.material.visible = this.renderback || flag;
        }
    }

    setClipIntersection(flag) {
        for (var child of this.children) {
            if (!child.name.startsWith("clipping")) {
                child.material.clipIntersection = flag;
                child.material.clipIntersection = flag;
                child.material.clipIntersection = flag;
            }
        }
    }

    setClipPlanes(planes) {
        if (this.types.back) {
            this.types.back.material.clippingPlanes = planes;
        }
        if (this.types.front) {
            this.types.front.material.clippingPlanes = planes;
        }
        if (this.types.edges) {
            this.types.edges.material.clippingPlanes = planes;
        }
        if (this.types.vertices) {
            this.types.vertices.material.clippingPlanes = planes;
        }
        this.updateMaterials(true);
    }

    setPolygonOffset(offset) {
        if (this.types.back) {
            this.types.back.material.polygonOffsetUnits = offset;
        }
    }

    updateMaterials(flag) {
        if (this.types.back) {
            this.types.back.material.needsUpdate = flag;
        }
        if (this.types.front) {
            this.types.front.material.needsUpdate = flag;
        }
        if (this.types.edges) {
            this.types.edges.material.needsUpdate = flag;
        }
        if (this.types.vertices) {
            this.types.vertices.material.needsUpdate = flag;
        }
    }
}

export { ObjectGroup };
