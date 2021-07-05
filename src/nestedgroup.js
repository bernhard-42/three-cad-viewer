import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper'
import { BoundingBox } from './bbox.js'


class ObjectGroup extends THREE.Group {
    constructor(opacity, edge_color) {
        super();
        this.opacity = opacity;
        this.edge_color = edge_color;
        this.types = { front: null, back: null, edges: null, vertrices: null };
    }

    addType(mesh, type) {
        this.add(mesh);
        this.types[type] = mesh;
    }

    setTransparent(flag) {
        if (this.types.back) {
            this.types.back.material.opacity = (flag) ? this.opacity : 1.0;
            this.types.front.material.opacity = (flag) ? this.opacity : 1.0;
        }
        for (var child of this.children) {
            child.material.depthWrite = !flag;
            child.material.depthTest = !flag;
            child.material.needsUpdate = true;
        }
    }

    setBlackEdges(flag) {
        if (this.types.edges) {
            const color = flag ? 0x000000 : this.edge_color;
            this.types.edges.material.color = new THREE.Color(color);
            this.types.edges.material.needsUpdate = true;
        }
    }

    setShapeVisible(flag) {
        if (this.types.back) {
            this.types.back.visible = flag;
            this.types.front.visible = flag;
        }
    }

    setEdgesVisible(flag) {
        if (this.types.edges) {
            this.types.edges.visible = flag;
        }
        if (this.types.vertices) {
            this.types.vertices.visible = flag;
        }
    }

    setBackVisible(flag) {
        if (this.types.back) {
            this.types.back.material.visible = flag;
        }
    }

    setClipIntersection(flag) {
        for (var child of this.children) {
            child.material.clipIntersection = flag;
            child.material.clipIntersection = flag;
            child.material.clipIntersection = flag;
        }
    }

    setClipPlanes(planes) {
        if (this.types.back) { this.types.back.material.clippingPlanes = planes; }
        if (this.types.front) { this.types.front.material.clippingPlanes = planes; }
        if (this.types.edges) { this.types.edges.material.clippingPlanes = planes; }
        if (this.types.vertices) { this.types.vertices.material.clippingPlanes = planes; }
        this.updateMaterials(true);
    }

    setPolygonOffset(offset) {
        if (this.types.back) {
            this.types.back.material.polygonOffsetUnits = offset;
        }
    }

    updateMaterials(flag) {
        if (this.types.back) { this.types.back.material.needsUpdate = flag; }
        if (this.types.front) { this.types.front.material.needsUpdate = flag; }
        if (this.types.edges) { this.types.edges.material.needsUpdate = flag; }
        if (this.types.vertices) { this.types.vertices.material.needsUpdate = flag; }
    }
}


class NestedGroup {
    constructor(shapes, width, height, edgeColor, transparent, opacity, normalLen, bb_max) {
        this.shapes = shapes;
        this.width = width;
        this.height = height;
        this.edgeColor = edgeColor;
        this.transparent = transparent;
        this.defaultOpacity = opacity;
        this.normalLen = normalLen;
        this.blackEdges = false;
        this.backVisible = false;
        this.bb_max = bb_max;
        this.delim = '|';
        this.rootGroup = null;
        this.bbox = null;
        this.bsphere = null;
        this.groups = {};

        this.clipPlanes = null;
    }

    _dump(ind) {
        if (ind == undefined) {
            ind = ""
        }
        if (this.parts) {
            for (var part of this.parts) {
                dump(part, ind + "  ");
            }
        }
    }

    _renderEdges(edgeList, lineWidth, color) {
        var positions = new Float32Array(edgeList.flat().flat());

        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(positions);

        const lineMaterial = new LineMaterial({
            color: (color == null) ? this.edgeColor : color,
            linewidth: lineWidth,
            transparent: true,
            depthWrite: !this.transparent,
            depthTest: !this.transparent,
            clipIntersection: false
        });
        lineMaterial.resolution.set(this.width, this.height);

        var edges = new LineSegments2(lineGeometry, lineMaterial);
        edges.renderOrder = 999;

        return edges;
    }

    renderEdges(edgeList, lineWidth, color, name) {
        var group = new ObjectGroup(this.defaultOpacity, (color == null) ? this.edgeColor : color);

        var edges = this._renderEdges(edgeList, lineWidth, color)
        if (name) {
            edges.name = name;
        }
        group.addType(edges, "edges")

        return group;
    }

    renderVertices(vertexList, size, color, name) {
        var group = new ObjectGroup(this.defaultOpacity, (color == null) ? this.edgeColor : color);

        const vertex_color = (color == null) ? this.edgeColor : color;

        const positions = new Float32Array(vertexList.flat().flat());
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: vertex_color,
            sizeAttenuation: false,
            size: size,
            transparent: true,
            clipIntersection: false
        })

        var points = new THREE.Points(geometry, material)
        if (name) {
            points.name = name;
        }
        group.addType(points, "vertices")

        return group;
    }

    renderShape(shape, color, name) {
        var positions = new Float32Array(shape.vertices.flat());
        var normals = new Float32Array(shape.normals.flat());

        var group = new ObjectGroup(this.defaultOpacity, this.edgeColor)

        var shapeGeometry = new THREE.BufferGeometry();
        shapeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        shapeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        shapeGeometry.setIndex(shape.triangles)

        const frontMaterial = new THREE.MeshStandardMaterial({
            color: color,
            polygonOffset: true,
            polygonOffsetFactor: 1.0,
            polygonOffsetUnits: 1.0,
            transparent: true,
            opacity: 1.0,
            depthWrite: !this.transparent,
            depthTest: !this.transparent,
            clipIntersection: false,
            side: THREE.FrontSide,
            visible: true,
        });

        const backMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(this.edgeColor),
            side: THREE.BackSide,
            polygonOffset: true,
            polygonOffsetFactor: 1.0,
            polygonOffsetUnits: 1.0,
            transparent: true,
            opacity: 1.0,
            depthWrite: !this.transparent,
            depthTest: !this.transparent,
            clipIntersection: false,
            visible: this.backVisible
        });

        const front = new THREE.Mesh(shapeGeometry, frontMaterial)
        front.name = name;

        const back = new THREE.Mesh(shapeGeometry, backMaterial)
        back.name = name;

        group.addType(back, "back")
        group.addType(front, "front")

        if (this.normalLen > 0) {
            const normalsHelper = new VertexNormalsHelper(front, this.normalLen, 0xff00ff);
            group.add(normalsHelper);
        }

        // group.add(new THREE.BoxHelper(front, 0x888888))

        var [edgeList, dummy] = shape.edges
        if (edgeList.length > 0) {
            var edges = this._renderEdges(edgeList, 1)
            edges.name = name;
            group.addType(edges, "edges")
        }

        return group
    }

    renderLoop(shapes, path) {
        const _render = (shape) => {
            var mesh;
            switch (shape.type) {
                case "edges":
                    mesh = this.renderEdges(shape.shape, shape.width, shape.color, shape.name);
                    break;
                case "vertices":
                    mesh = this.renderVertices(shape.shape, shape.size, shape.color, shape.name);
                    break;
                default:
                    mesh = this.renderShape(shape.shape, shape.color, shape.name);
            }
            return mesh
        }

        var group = new THREE.Group();
        if (shapes.loc == null) {
            shapes.loc = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]];
        }
        group.position.set(...shapes.loc[0])
        group.quaternion.set(...shapes.loc[1]);

        path = path + this.delim + shapes.name
        this.groups[path.replaceAll(this.delim, "/")] = group
        group.name = path

        for (var shape of shapes.parts) {
            if (shape.parts) {
                group.add(this.renderLoop(shape, path));
            } else {
                const objectGroup = _render(shape);
                this.groups[shape.id] = objectGroup;
                group.add(objectGroup);
            }
        }
        return group;
    }

    render() {
        this.rootGroup = this.renderLoop(this.shapes, "");
        return this.rootGroup
    }

    boundingBox() {
        if (this.bbox == null) {
            var b = new THREE.Box3().setFromObject(this.rootGroup);
            this.bsphere = new THREE.Sphere();
            b.getBoundingSphere(this.bsphere);
            this.bbox = new BoundingBox(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z)
        }
        return this.bbox;
    }

    _traverse(func, flag) {
        for (var path in this.groups) {
            for (var obj of this.groups[path].children) {
                if (obj instanceof ObjectGroup) {
                    obj[func](flag);
                }
            }
        }
    }

    setTransparent(flag) {
        this.transparent = flag;
        this._traverse("setTransparent", flag);
    }

    setBlackEdges(flag) {
        this.blackEdges = flag;
        this._traverse("setBlackEdges", flag);
    }

    setBackVisible(flag) {
        this.backVisible = flag;
        this._traverse("setBackVisible", flag);
    }

    setClipIntersection(flag) {
        this._traverse("setClipIntersection", flag);
    }

    setClipPlanes(planes) {
        this.clipPlanes = planes;
        this._traverse("setClipPlanes", planes);
    }

    setPolygonOffset(offset) {
        this._traverse("setPolygonOffset", offset);
    }

    updateMaterials() {
        this._traverse("updateMaterials", true);
    }
}

export { NestedGroup };