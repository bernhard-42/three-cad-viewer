import * as THREE from "three";
import { disposeGeometry } from "./utils";

class Group extends THREE.Group {
  constructor() {
    super();
  }

  dispose() {
    for (var i in this.children) {
      if (this.children[i]) {
        this.children[i].dispose();
      }
      if (this.children[i] instanceof THREE.GridHelper) {
        disposeGeometry(this.children[i].geometry);
        this.children[i].dispose();
        this.children[i] = null;
      }
    }
    this.parent = null;
  }
}
export { Group };
