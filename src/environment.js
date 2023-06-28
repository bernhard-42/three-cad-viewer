/**
 * https://github.com/google/model-viewer/blob/master/packages/model-viewer/src/three-components/EnvironmentScene.ts
 */

import {
	BackSide,
	BoxGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PointLight,
	Scene,
} from 'three';

class Environment extends Scene {

	constructor(size) {

		super();

		const geometry = new BoxGeometry();
		geometry.deleteAttribute('uv');

		const roomMaterial = new MeshStandardMaterial({ side: BackSide });

		const mainLight = new PointLight(0xffffff, 5.0, 28, 2);
		mainLight.position.set(0, size, 0);
		this.add(mainLight);

		const room = new Mesh(geometry, roomMaterial);
		room.scale.set(size * 2, size * 2, size * 2);
		this.add(room);
	}

	dispose() {

		const resources = new Set();

		this.traverse((object) => {

			if (object.isMesh) {

				resources.add(object.geometry);
				resources.add(object.material);

			}

		});

		for (const resource of resources) {

			resource.dispose();

		}

	}

}

function createAreaLightMaterial(intensity) {

	const material = new MeshBasicMaterial();
	material.color.setScalar(intensity);
	return material;

}

export { RoomEnvironment };
