import * as THREE from 'three';

const valid_transforms = ["t", "tx", "ty", "tz", "q", "rx", "ry", "rz"];

function fromAxisAngle(axis, angle) {
    var axis;
    switch (axis) {
        case "x":
            axis = new THREE.Vector3(1, 0, 0);
            break;
        case "y":
            axis = new THREE.Vector3(0, 1, 0);
            break;
        case "z":
            axis = new THREE.Vector3(0, 0, 1);
            break;
    }
    var q = new THREE.Quaternion()
    q.setFromAxisAngle(axis, angle / 180 * Math.PI);
    return q;
}

class Animation {
    constructor(root) {
        this.root = root;
        this.tracks = [];
        this.mixer = null;
        this.clipAction = null;
        this.clock = new THREE.Clock();
    }

    addTrack(selector, group, action, times, values) {

        if (valid_transforms.indexOf(action) === -1) {
            console.error(`Unknown action: "${action}" not in ${valid_transforms}`);
            return;
        }

        if (times.length != values.length) {
            console.error("times and values arrays need have the same lenght");
            return;
        }

        if (action.startsWith("t")) {
            const position = group.position.clone();
            var newValues;
            switch (action) {
                case "t":
                    newValues = values.map((v) => position.add(v));
                    break;
                case "tx":
                    newValues = values.map((v) => position.add(new THREE.Vector3(v, 0, 0)));
                    break;
                case "ty":
                    newValues = values.map((v) => position.add(new THREE.Vector3(0, v, 0)));
                    break;
                case "tz":
                    newValues = values.map((v) => position.add(new THREE.Vector3(0, 0, v)));
                    break
                default:
                    console.error(`action ${action} is not supported`);
                    return;
            }

            this.tracks.push(
                new THREE.NumberKeyframeTrack(
                    selector + ".position",
                    times,
                    newValues,
                )
            );

        } else {
            const actual = group.quaternion.clone();

            var newValues;
            if (action.startsWith("r")) {
                const rotValues = values.map((angle) => fromAxisAngle(action.slice(1, 2), angle));
                newValues = rotValues.map((rot) => actual.multiply(rot).toArray());
            } else if (action == "q") {
                newValues = values.map((q) => (actual.multiply(q)).toArray());
            } else {
                console.error(`action ${action} is not supported`);
                return;
            }

            this.tracks.push(
                new THREE.QuaternionKeyframeTrack(
                    selector + ".quaternion",
                    times,
                    newValues.flat(),
                )
            );
        }
    }

    animate(speed) {
        const clip = new THREE.AnimationClip("track", 4, this.tracks);
        this.mixer = new THREE.AnimationMixer(this.root);
        this.mixer.timeScale = speed;
        // this.mixer.addEventListener('finished', (e) => { console.log("finished", e) });
        // this.mixer.addEventListener('loop', (e) => { console.log("loop", e) });
        this.clipAction = this.mixer.clipAction(clip);
        return this.clipAction;
    }

    update() {
        if (this.mixer) {
            this.mixer.update(this.clock.getDelta());
        }
    }
}

export { Animation }