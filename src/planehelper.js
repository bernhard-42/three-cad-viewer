import * as THREE from 'three';

class PlaneHelper extends THREE.Line {

    constructor(plane, center, size = 1, hex = 0xffff00) {

        const color = hex;

        const positions = [
            -1, -1, 1,
            -1, 1, 1,
            1, 1, 1,
            1, -1, 1,
            -1, -1, 1,
        ];

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeBoundingSphere();

        super(geometry, new THREE.LineBasicMaterial({ color: color, toneMapped: false }));

        this.type = 'PlaneHelper';

        this.plane = plane;
        this.size = size;
        this.center = center;

        const positions2 = [
            1, 1, 1,
            -1, 1, 1,
            -1, -1, 1,
            1, 1, 1,
            -1, -1, 1,
            1, -1, 1
        ];
        console.log(center)
        const geometry2 = new THREE.BufferGeometry();
        geometry2.setAttribute('position', new THREE.Float32BufferAttribute(positions2, 3));
        geometry2.computeBoundingSphere();

        this.planeMesh = new THREE.Mesh(geometry2, new THREE.MeshBasicMaterial({ color: color, opacity: 0.05, transparent: true, depthWrite: false, toneMapped: false }));
        this.add(this.planeMesh);

    }

    updateMatrixWorld(force) {

        let scale = - this.plane.constant;

        if (Math.abs(scale) < 1e-8) scale = 1e-8; // sign does not matter

        this.scale.set(0.5 * this.size, 0.5 * this.size, scale);

        // this.children[0].material.side = (scale < 0) ? THREE.BackSide : THREE.FrontSide; // renderer flips side when determinant < 0; flipping not wanted here
        this.children[0].material.side = THREE.DoubleSide;
        this.lookAt(this.plane.normal);

        super.updateMatrixWorld(force);

    }

}

export { PlaneHelper };