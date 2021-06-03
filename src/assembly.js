import * as THREE from 'three';
import { example } from './example';

class Assembly {
    constructor(data, edge_color, transparent) {
        this.shapes = data.shapes;
        this.mapping = data.mapping;
        this.tree = data.tree;
        this.bb = data.bb;
        this.edge_color = edge_color;
        this.transparent = transparent;
    }

    render_edges(edge_list) {
        var line_material = new THREE.LineBasicMaterial({ color: this.edge_color, linewidth: 4 });
        var line_geometry = new THREE.BufferGeometry();
        var positions = new Float32Array(edge_list.flat().flat());
        line_geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        return new THREE.LineSegments(line_geometry, line_material);
    }

    render_vertices(vertices) {
        return {};
    }

    render_shape(shape, color) {
        var positions = new Float32Array(shape.vertices.flat());
        var normals = new Float32Array(shape.normals.flat());

        var shape_geometry = new THREE.BufferGeometry();
        shape_geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        shape_geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        shape_geometry.setIndex(shape.triangles)
        var group = new THREE.Group()

        const shape_material = new THREE.MeshStandardMaterial({
            color: color,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            transparent: true,
            opacity: this.transparent ? 0.4 : 1,
            depthWrite: !this.transparent,
            depthTest: !this.transparent,
        });

        const front_material = shape_material.clone()
        front_material.side = THREE.FrontSide;

        const back_material = shape_material.clone()
        back_material.side = THREE.BackSide;

        const front = new THREE.Mesh(shape_geometry, front_material)
        const back = new THREE.Mesh(shape_geometry, back_material)
        group.add(back)
        group.add(front)

        var [edge_list, normals_list] = shape.edges
        if (edge_list.length > 0) {
            var wireframe = this.render_edges(edge_list)
            group.add(wireframe)
        }

        if (normals_list.length > 0) {
            var wireframe = this.render_edges(normals_list)
            group.add(wireframe)
        }

        return group
    }

    _render(shapes) {
        var group = new THREE.Group();
        if (shapes.loc !== null) {
            group.position.set(...shapes.loc[0])
            group.quaternion.set(...shapes.loc[1]);
        }

        for (var shape of shapes.parts) {
            if (shape.parts) {
                group.add(this._render(shape));
            } else {
                var mesh;
                switch (shape.type) {
                    case "edges":
                        mesh = this.render_edges(shape);
                        break;
                    case "vertices":
                        mesh = this.render_vertices(shape);
                        break;
                    default:
                        mesh = this.render_shape(shape.shape, shape.color);
                }
                group.add(mesh);
            }
        }
        return group;
    }

    render() {
        return this._render(this.shapes);
    }
}

export { Assembly };