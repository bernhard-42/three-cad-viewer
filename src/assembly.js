import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper'
class ObjectGroup extends THREE.Group {
    constructor(opacity, edge_color) {
        super();
        this.opacity = opacity;
        this.edge_color = edge_color;
    }

    setTransparent(flag) {
        for (var i in this.children) {
            const side = this.children[i];
            // only change opacity for the first two mesh objects
            side.material.opacity = (flag & (i < 2)) ? this.opacity : 1.0;
            // but change dpethTest for all objects
            side.material.depthWrite = !flag;
            side.material.depthTest = !flag;
            side.material.needsUpdate = true;
        }
    }

    setBlackEdges(flag) {
        if (this.children.length > 2) {
            const edges = this.children[2];
            const color = flag ? 0x000000 : this.edge_color;
            edges.material.color = new THREE.Color(color);
            edges.material.needsUpdate = true;
        }
    }

    setShapeVisible(flag) {
        this.children[0].visible = flag;
        this.children[1].visible = flag;
    }

    setEdgesVisible(flag) {
        this.children[2].visible = flag;
    }
}

class Assembly {
    constructor(shapes, width, height, edge_color, transparent, transparent_opacity, normalLen) {
        this.shapes = shapes;
        this.width = width;
        this.height = height;
        this.edge_color = edge_color;
        this.transparent = transparent;
        this.transparent_opacity = transparent_opacity;
        this.normalLen = normalLen;
        this.blackEdges = false;
        this.delim = '\\';
        this.groups = {};
    }

    renderEdges(edge_list, lineWidth) {
        var positions = new Float32Array(edge_list.flat().flat());

        const lineGeometry = new LineSegmentsGeometry();
        lineGeometry.setPositions(positions);

        const lineMaterial = new LineMaterial({
            color: this.edge_color,
            linewidth: lineWidth,
            transparent: true,
            depthWrite: !this.transparent,
            depthTest: !this.transparent
        });
        lineMaterial.resolution.set(this.width, this.height);

        var edges = new LineSegments2(lineGeometry, lineMaterial);
        edges.renderOrder = 999;
        return edges
    }

    renderVertices(vertices) {
        return {};
    }

    renderShape(shape, color, name) {
        var positions = new Float32Array(shape.vertices.flat());
        var normals = new Float32Array(shape.normals.flat());

        var group = new ObjectGroup(this.transparent_opacity, this.edge_color)

        var shapeGeometry = new THREE.BufferGeometry();
        shapeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        shapeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        shapeGeometry.setIndex(shape.triangles)

        const shapeMaterial = new THREE.MeshStandardMaterial({
            color: color,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            transparent: true,
            opacity: this.transparent ? this.transparent_opacity : 1,
            depthWrite: !this.transparent,
            depthTest: !this.transparent,
        });

        const frontMaterial = shapeMaterial.clone()
        frontMaterial.side = THREE.FrontSide;

        const backMaterial = shapeMaterial.clone()
        backMaterial.side = THREE.BackSide;

        const front = new THREE.Mesh(shapeGeometry, frontMaterial)
        front.name = name;
        const back = new THREE.Mesh(shapeGeometry, backMaterial)
        back.name = name;
        group.add(back)
        group.add(front)
        if (this.normalLen > 0) {
            group.add(new VertexNormalsHelper(front, this.normalLen));
        }

        // group.add(new THREE.BoxHelper(front, 0x888888))

        var [edgeList, normalsList] = shape.edges
        if (edgeList.length > 0) {
            var wireframe = this.renderEdges(edgeList, 1)
            wireframe.name = name;
            group.add(wireframe)
        }

        if (normalsList.length > 0) {
            var wireframe = this.renderEdges(normalsList, 1)
            group.add(wireframe)
        }

        return group
    }

    renderLoop(shapes, path) {
        var group = new THREE.Group();
        if (shapes.loc !== null) {
            group.position.set(...shapes.loc[0])
            group.quaternion.set(...shapes.loc[1]);
        }

        path = path + this.delim + shapes.name
        this.groups[path] = group
        group.name = path

        for (var shape of shapes.parts) {
            if (shape.parts) {
                group.add(this.renderLoop(shape, path));
            } else {
                var mesh;
                switch (shape.type) {
                    case "edges":
                        mesh = this.renderEdges(shape);
                        break;
                    case "vertices":
                        mesh = this.renderVertices(shape);
                        break;
                    default:
                        mesh = this.renderShape(shape.shape, shape.color, shape.name);
                }
                group.add(mesh);
            }
        }
        return group;
    }

    render() {
        return this.renderLoop(this.shapes, "");
    }

    setTransparent(flag) {
        this.transparent = flag;
        for (var path in this.groups) {
            for (var obj of this.groups[path].children) {
                if (obj instanceof ObjectGroup) {
                    obj.setTransparent(flag);
                }
            }
        }
    }

    setBlackEdges(flag) {
        this.blackEdges = flag;
        for (var path in this.groups) {
            for (var obj of this.groups[path].children) {
                if (obj instanceof ObjectGroup) {
                    obj.setBlackEdges(flag);
                }
            }
        }
    }
}

export { Assembly };