/**
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 * @author Paul Elliott / http://vizworkshop.com
 */

// Hack of OrbitControls.js to use SpinControls.js for rotation.

// This set of controls performs orbiting, dollying (zooming), and panning.
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

function transformTo(outParentToTarget, parent, target) {
  outParentToTarget.copy(parent);
  outParentToTarget.invert();
  outParentToTarget.multiply(target);
}

CameraSpinControls = function (camera, domElement) {
  this.domElement = domElement !== undefined ? domElement : document;

  // Set to false to disable this control
  this.enabled = true;

  this.object = camera;
  // "target" sets the location of focus, where the object orbits around
  this.targetObj = new THREE.Object3D();
  this.target = this.targetObj.position;

  if (camera.position.length() < EPS) {
    camera.position.set(0, 0, 1);
  }

  this.targetObj.lookAt(camera.position);

  this.startTrackballScreenCenter = true;
  this.trackballToObject = new THREE.Matrix4();

  this.targetObj.updateWorldMatrix(true, false);
  this.object.updateWorldMatrix(true, false);
  transformTo(
    this.trackballToObject,
    this.targetObj.matrixWorld,
    this.object.matrixWorld
  );

  // How far you can dolly in and out ( PerspectiveCamera only )
  // Will cause jumps if target is moved closer or further than limits
  this.minDistance = 0;
  this.maxDistance = Infinity;

  // How far you can zoom in and out ( OrthographicCamera only )
  this.minZoom = 0;
  this.maxZoom = Infinity;

  // Set to true to enable damping (inertia)
  // If damping is enabled, you must call controls.update() in your animation loop
  this.enableDamping = false;
  this.dampingFactor = 0.25;

  // This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
  // Set to false to disable zooming
  this.enableZoom = true;
  this.zoomSpeed = 1.0;

  // Use setEnableRotate(isEnabled) function
  this.enableRotate = true;

  // Set to false to disable panning
  this.enablePan = true;
  this.panSpeed = 1.0;
  this.screenSpacePanning = true; // if true, pan in screen-space
  this.keyPanSpeed = 7.0; // pixels moved per arrow key push

  // Set to false to disable use of the keys
  this.enableKeys = true;

  // The four arrow keys
  this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

  // Mouse buttons
  this.mouseButtons = {
    LEFT: THREE.MOUSE.LEFT,
    MIDDLE: THREE.MOUSE.MIDDLE,
    RIGHT: THREE.MOUSE.RIGHT
  };

  // for reset
  this.target0 = this.target.clone();
  this.position0 = this.object.position.clone();
  this.zoom0 = this.object.zoom;

  var scope = this;

  //
  // public methods
  //

  this.setEnableRotate = function (isEnabled) {
    scope.enableRotate = isEnabled;
    scope.spinControl.enabled = isEnabled;
  };

  this.saveState = function () {
    scope.target0.copy(scope.target);
    scope.position0.copy(scope.object.position);
    scope.zoom0 = scope.object.zoom;
  };

  this.reset = function () {
    scope.target.copy(scope.target0);
    scope.object.position.copy(scope.position0);
    scope.object.zoom = scope.zoom0;

    scope.object.updateProjectionMatrix();
    scope.dispatchEvent(changeEvent);

    scope.update();

    state = STATE.NONE;
  };

  this.movedTarget = (function () {
    var v = new THREE.Vector3();

    return function movedTarget() {
      scope.targetObj.updateWorldMatrix(true, false);
      scope.object.updateWorldMatrix(true, false);
      transformTo(
        scope.trackballToObject,
        scope.targetObj.matrixWorld,
        scope.object.matrixWorld
      );

      // restrict radius to be between desired limits
      v.setFromMatrixPosition(scope.trackballToObject);
      v.multiplyScalar(scale);
      v.clampLength(scope.minDistance, scope.maxDistance);
      scope.trackballToObject.setPosition(v);
      scope.object.matrix.copy(scope.targetObj.matrixWorld);
      scope.object.matrix.multiply(scope.trackballToObject);

      this.adjustTrackballRadius();
    };
  })();

  this.setTargetPosition = function (positionVector) {
    scope.target.copy(positionVector);
    this.movedTarget();
  };

  // this method is exposed, but perhaps it would be better if we can make it private...
  this.update = (function () {
    var lastPosition = new THREE.Vector3();
    var lastQuaternion = new THREE.Quaternion();
    var v = new THREE.Vector3();

    return function update() {
      scope.spinControl.update();

      // move target to panned location
      scope.target.add(panOffset);
      scope.targetObj.updateWorldMatrix(true, false);

      v.setFromMatrixPosition(scope.trackballToObject);
      v.multiplyScalar(scale);
      // restrict radius to be between desired limits
      v.clampLength(scope.minDistance, scope.maxDistance);
      scope.trackballToObject.setPosition(v);
      scope.object.matrix.copy(scope.targetObj.matrixWorld);
      scope.object.matrix.multiply(scope.trackballToObject);

      this.adjustTrackballRadius();

      scope.object.matrix.decompose(
        scope.object.position,
        scope.object.quaternion,
        scope.object.scale
      );

      if (scope.enableDamping === true) {
        panOffset.multiplyScalar(1 - scope.dampingFactor);
      } else {
        panOffset.set(0, 0, 0);
      }

      scale = 1;

      // rotation angle update condition is:
      // min(camera displacement, camera rotation in radians)^2 > EPS
      // using small-angle approximation cos(x/2) = 1 - x^2 / 8
      if (
        zoomChanged ||
        lastPosition.distanceToSquared(scope.object.position) > EPS ||
        8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > EPS
      ) {
        scope.dispatchEvent(changeEvent);

        lastPosition.copy(scope.object.position);
        lastQuaternion.copy(scope.object.quaternion);
        zoomChanged = false;

        // Don't let camera movement cause mouse to move over sphere across frames
        scope.spinControl.resetInputAfterCameraMovement();

        return true;
      }

      return false;
    };
  })();

  this.onWindowResize = function () {
    scope.spinControl.onWindowResize();
    scope.adjustTrackballRadius();
  };

  this.adjustTrackballRadius = (function () {
    var TRACKBALL_PERCENT_OF_SCREEN = 0.9;
    var v = new THREE.Vector3();
    var cameraToTrackball = new THREE.Matrix4();

    return function adjustTrackballRadius() {
      if (scope.object.isPerspectiveCamera) {
        var limitingFov = Math.min(
          scope.object.fov,
          scope.object.fov * scope.object.aspect
        );
        var distanceToScreenSize = Math.sin(
          ((limitingFov / 2) * Math.PI) / 180.0
        );

        transformTo(
          cameraToTrackball,
          scope.object.matrix,
          scope.targetObj.matrixWorld
        );
        v.setFromMatrixPosition(cameraToTrackball);
        scope.spinControl.trackballRadius =
          TRACKBALL_PERCENT_OF_SCREEN * v.length() * distanceToScreenSize;
      } else {
        // assume orthographic camera

        var limitingDimension =
          Math.min(
            scope.object.right - scope.object.left,
            scope.object.top - scope.object.bottom
          ) / scope.object.zoom;
        scope.spinControl.trackballRadius =
          (TRACKBALL_PERCENT_OF_SCREEN / 2) * limitingDimension;
      }
    };
  })();

  this.dispose = function () {
    scope.domElement.removeEventListener("contextmenu", onContextMenu, false);
    scope.domElement.removeEventListener("mousedown", onMouseDown, false);
    scope.domElement.removeEventListener("wheel", onMouseWheel, false);

    scope.domElement.removeEventListener("touchstart", onTouchStart, false);
    scope.domElement.removeEventListener("touchend", onTouchEnd, false);
    scope.domElement.removeEventListener("touchmove", onTouchMove, false);

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    window.removeEventListener("keydown", onKeyDown, false);
  };

  //
  // internals
  //

  var scope = this;

  var changeEvent = { type: "change" };
  var startEvent = { type: "start" };
  var endEvent = { type: "end" };

  var STATE = { NONE: 0, ROTATE: 1, DOLLY: 2, PAN: 3, TOUCH_DOLLY_PAN: 4 };
  scope.STATE = STATE; // to compare against startEvent.state

  var state = STATE.NONE;

  var EPS = 0.000001;

  var scale = 1;
  var panOffset = new THREE.Vector3();
  var zoomChanged = false;

  var panStart = new THREE.Vector2();
  var panEnd = new THREE.Vector2();
  var panDelta = new THREE.Vector2();

  var dollyStart = new THREE.Vector2();
  var dollyEnd = new THREE.Vector2();
  var dollyDelta = new THREE.Vector2();

  var rollToCamera = new THREE.Quaternion();

  function getZoomScale() {
    return Math.pow(0.95, scope.zoomSpeed);
  }

  var panLeft = (function () {
    var v = new THREE.Vector3();

    return function panLeft(distance, objectMatrix) {
      v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
      v.multiplyScalar(-distance);

      panOffset.add(v);
    };
  })();

  var panUp = (function () {
    var v = new THREE.Vector3();

    return function panUp(distance, objectMatrix) {
      if (scope.screenSpacePanning === true) {
        v.setFromMatrixColumn(objectMatrix, 1);
      } else {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.crossVectors(scope.object.up, v);
      }

      v.multiplyScalar(distance);

      panOffset.add(v);
    };
  })();

  // deltaX and deltaY are in pixels; right and down are positive
  var pan = (function () {
    var offset = new THREE.Vector3();

    return function pan(deltaX, deltaY) {
      var element =
        scope.domElement === document
          ? scope.domElement.body
          : scope.domElement;

      if (scope.object.isPerspectiveCamera) {
        // perspective
        var position = scope.object.position;
        offset.copy(position).sub(scope.target);
        var targetDistance = offset.length();

        // half of the fov is center to top of screen
        targetDistance *= Math.tan(((scope.object.fov / 2) * Math.PI) / 180.0);

        // we use only clientHeight here so aspect ratio does not distort speed
        panLeft(
          (2 * deltaX * targetDistance) / element.clientHeight,
          scope.object.matrix
        );
        panUp(
          (2 * deltaY * targetDistance) / element.clientHeight,
          scope.object.matrix
        );
      } else if (scope.object.isOrthographicCamera) {
        // orthographic
        panLeft(
          (deltaX * (scope.object.right - scope.object.left)) /
            scope.object.zoom /
            element.clientWidth,
          scope.object.matrix
        );
        panUp(
          (deltaY * (scope.object.top - scope.object.bottom)) /
            scope.object.zoom /
            element.clientHeight,
          scope.object.matrix
        );
      } else {
        // camera neither orthographic nor perspective
        console.warn(
          "WARNING: CameraSpinControls.js encountered an unknown camera type - pan disabled."
        );
        scope.enablePan = false;
      }
    };
  })();

  function dollyIn(dollyScale) {
    if (scope.object.isPerspectiveCamera) {
      scale /= dollyScale;
    } else if (scope.object.isOrthographicCamera) {
      scope.object.zoom = Math.max(
        scope.minZoom,
        Math.min(scope.maxZoom, scope.object.zoom * dollyScale)
      );
      scope.object.updateProjectionMatrix();
      zoomChanged = true;
    } else {
      console.warn(
        "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."
      );
      scope.enableZoom = false;
    }
  }

  function dollyOut(dollyScale) {
    if (scope.object.isPerspectiveCamera) {
      scale *= dollyScale;
    } else if (scope.object.isOrthographicCamera) {
      scope.object.zoom = Math.max(
        scope.minZoom,
        Math.min(scope.maxZoom, scope.object.zoom / dollyScale)
      );
      scope.object.updateProjectionMatrix();
      zoomChanged = true;
    } else {
      console.warn(
        "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."
      );
      scope.enableZoom = false;
    }
  }

  //
  // event callbacks - update the object state
  //

  function handleMouseDownDolly(event) {
    dollyStart.set(event.clientX, event.clientY);
  }

  function handleMouseDownPan(event) {
    panStart.set(event.clientX, event.clientY);
  }

  function handleMouseMoveDolly(event) {
    dollyEnd.set(event.clientX, event.clientY);

    dollyDelta.subVectors(dollyEnd, dollyStart);

    if (dollyDelta.y > 0) {
      dollyIn(getZoomScale());
    } else if (dollyDelta.y < 0) {
      dollyOut(getZoomScale());
    }

    dollyStart.copy(dollyEnd);

    scope.update();
  }

  function handleMouseMovePan(event) {
    panEnd.set(event.clientX, event.clientY);

    panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);

    pan(panDelta.x, panDelta.y);

    panStart.copy(panEnd);

    scope.update();
  }

  function handleMouseWheel(event) {
    if (event.deltaY < 0) {
      dollyOut(getZoomScale());
    } else if (event.deltaY > 0) {
      dollyIn(getZoomScale());
    }

    scope.update();
  }

  function handleKeyDown(event) {
    var needsUpdate = false;

    switch (event.keyCode) {
      case scope.keys.UP:
        pan(0, scope.keyPanSpeed);
        needsUpdate = true;
        break;

      case scope.keys.BOTTOM:
        pan(0, -scope.keyPanSpeed);
        needsUpdate = true;
        break;

      case scope.keys.LEFT:
        pan(scope.keyPanSpeed, 0);
        needsUpdate = true;
        break;

      case scope.keys.RIGHT:
        pan(-scope.keyPanSpeed, 0);
        needsUpdate = true;
        break;
    }

    if (needsUpdate) {
      // prevent the browser from scrolling on cursor keys
      event.preventDefault();

      scope.update();
    }
  }

  function moveTargetToFingersCenter(event) {
    // Move trackball to fingers centroid
    var x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
    var y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);

    var fingerCenter = scope.spinControl.getPointerInNdc(x, y);

    scope.target.setFromMatrixPosition(scope.trackballToObject);
    var startDistance = scope.target.length();

    scope.target.set(fingerCenter.x, fingerCenter.y, 0.5);

    // For unproject, need to update camera.matrixWorldInverse if camera moved before renderer.render
    scope.object.matrixWorldInverse.copy(scope.object.matrixWorld).invert();

    scope.target.unproject(scope.object); // target in world space now
    scope.target.sub(scope.object.position).normalize(); // Subtract to put around origin
    scope.target.setLength(startDistance);
    scope.target.add(scope.object.position);
    scope.movedTarget();
  }

  function handleTouchStartDollyPanRoll(event) {
    if (scope.enableRotate) {
      var dx = event.touches[0].pageX - event.touches[1].pageX;
      var dy = event.touches[0].pageY - event.touches[1].pageY;
      var theta = Math.atan2(dy, dx);

      // Rotation about z axis, inverted
      rollToCamera.set(0, 0, -Math.sin(theta / 2), Math.cos(theta / 2));

      rollToCamera.premultiply(scope.object.quaternion);
    }

    if (scope.enableZoom) {
      moveTargetToFingersCenter(event);

      var dx = event.touches[0].pageX - event.touches[1].pageX;
      var dy = event.touches[0].pageY - event.touches[1].pageY;

      var distance = Math.sqrt(dx * dx + dy * dy);

      dollyStart.set(0, distance);
    }

    if (scope.enablePan) {
      var x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
      var y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);

      panStart.set(x, y);
    }
  }

  function handleTouchMoveDollyPanRoll(event) {
    event.stopImmediatePropagation(); //Prevent other controls from working.

    if (scope.enableRotate) {
      var dx = event.touches[0].pageX - event.touches[1].pageX;
      var dy = event.touches[0].pageY - event.touches[1].pageY;
      var theta = Math.atan2(dy, dx);

      // Rotation about z axis
      scope.object.quaternion.set(
        0,
        0,
        Math.sin(theta / 2),
        Math.cos(theta / 2)
      );

      scope.object.quaternion.premultiply(rollToCamera);
    }

    if (scope.enableZoom) {
      moveTargetToFingersCenter(event);

      var dx = event.touches[0].pageX - event.touches[1].pageX;
      var dy = event.touches[0].pageY - event.touches[1].pageY;

      var distance = Math.sqrt(dx * dx + dy * dy);

      dollyEnd.set(0, distance);

      dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, scope.zoomSpeed));

      dollyIn(dollyDelta.y);

      dollyStart.copy(dollyEnd);
    }

    if (scope.enablePan) {
      var x = 0.5 * (event.touches[0].pageX + event.touches[1].pageX);
      var y = 0.5 * (event.touches[0].pageY + event.touches[1].pageY);

      panEnd.set(x, y);

      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);

      pan(panDelta.x, panDelta.y);

      panStart.copy(panEnd);
    }

    scope.update();
  }

  //
  // event handlers - FSM: listen for events and reset state
  //

  function onMouseDown(event) {
    if (scope.enabled === false) return;

    // Prevent the browser from scrolling.

    event.preventDefault();

    // Manually set the focus since calling preventDefault above
    // prevents the browser from setting it automatically.

    scope.domElement.focus ? scope.domElement.focus() : window.focus();

    switch (event.button) {
      case scope.mouseButtons.LEFT:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (scope.enablePan === false) return;

          handleMouseDownPan(event);

          state = STATE.PAN;
        } else {
          if (scope.enableRotate === false) return;

          state = STATE.ROTATE;
        }

        break;

      case scope.mouseButtons.MIDDLE:
        if (scope.enableZoom === false) return;

        handleMouseDownDolly(event);

        state = STATE.DOLLY;

        break;

      case scope.mouseButtons.RIGHT:
        if (scope.enablePan === false) return;

        handleMouseDownPan(event);

        state = STATE.PAN;

        break;
    }

    if (state !== STATE.NONE) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);

      startEvent.state = state;
      scope.dispatchEvent(startEvent);
    }
  }

  function onMouseMove(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    switch (state) {
      case STATE.ROTATE:
        if (scope.enableRotate === false) return;

        break;

      case STATE.DOLLY:
        if (scope.enableZoom === false) return;

        handleMouseMoveDolly(event);

        break;

      case STATE.PAN:
        if (scope.enablePan === false) return;

        handleMouseMovePan(event);

        break;
    }
  }

  function onMouseUp(event) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    if (scope.enabled === false) return;

    state = STATE.NONE;

    endEvent.state = state;
    scope.dispatchEvent(endEvent);
  }

  function onMouseWheel(event) {
    if (
      scope.enabled === false ||
      scope.enableZoom === false ||
      (state !== STATE.NONE && state !== STATE.ROTATE)
    )
      return;

    event.preventDefault();
    event.stopPropagation();

    startEvent.state = STATE.DOLLY;
    scope.dispatchEvent(startEvent);

    handleMouseWheel(event);

    endEvent.state = STATE.DOLLY;
    scope.dispatchEvent(endEvent);
  }

  function onKeyDown(event) {
    if (
      scope.enabled === false ||
      scope.enableKeys === false ||
      scope.enablePan === false
    )
      return;

    handleKeyDown(event);
  }

  function onTouchStart(event) {
    if (scope.enabled === false) return;

    event.preventDefault();

    if (event.touches.length === 1) {
      // 1 finger touch: rotate
      if (scope.enableRotate === false) return;

      state = STATE.ROTATE;

      if (scope.startTrackballScreenCenter) {
        scope.target.setFromMatrixPosition(scope.trackballToObject);
        var startDistance = scope.target.length();
        scope.target.set(0, 0, -startDistance);
        scope.target.applyQuaternion(scope.object.quaternion);
        scope.target.add(scope.object.position);
        scope.setTargetPosition(scope.target);
      }
    } else if (event.touches.length >= 2) {
      // 2+ finger touch: dolly-pan

      if (
        scope.enableZoom === false &&
        scope.enablePan === false &&
        scope.enableRotate === false
      )
        return;

      handleTouchStartDollyPanRoll(event);

      state = STATE.TOUCH_DOLLY_PAN;

      scope.spinControl.cancelSpin();
      scope.spinControl.enabled = false;
    } else {
      state = STATE.NONE;
    }

    if (state !== STATE.NONE) {
      scope.dispatchEvent(startEvent);
    }
  }

  function onTouchMove(event) {
    if (scope.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.touches.length >= 2) {
      // dolly-pan
      if (scope.enableZoom === false && scope.enablePan === false) return;

      handleTouchMoveDollyPanRoll(event);
    } else {
      state = STATE.NONE;
    }
    // 1 finger touch events are consumed by underlying SpinControls
  }

  function onTouchEnd(event) {
    if (scope.enabled === false) return;

    if (event.touches.length === 0) {
      state = STATE.NONE;
      endEvent.state = state;
      scope.dispatchEvent(endEvent);
    } else if (event.touches.length === 1) {
      if (scope.startTrackballScreenCenter) {
        // Set pivot point back to center if going from 2+ fingers to 1
        scope.target.setFromMatrixPosition(scope.trackballToObject);
        var startDistance = scope.target.length();
        scope.target.set(0, 0, -startDistance);
        scope.target.applyQuaternion(scope.object.quaternion);
        scope.target.add(scope.object.position);
        scope.setTargetPosition(scope.target);
      }

      state = STATE.ROTATE;
      scope.spinControl.enabled = true;
      scope.spinControl.handleTouchStart(event);
    } else if (event.touches.length >= 2) {
      handleTouchStartDollyPanRoll(event);
    }
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  scope.domElement.addEventListener("contextmenu", onContextMenu, false);

  scope.domElement.addEventListener("mousedown", onMouseDown, false);
  scope.domElement.addEventListener("wheel", onMouseWheel, false);

  scope.domElement.addEventListener("touchstart", onTouchStart, true);

  window.addEventListener("keydown", onKeyDown, false);

  scope.spinControl = new SpinControls(
    this.targetObj,
    1,
    camera,
    this.domElement
  );
  scope.spinControl.rotateSensitivity *= -1; // Negated it to pull camera around sphere as if sphere is fixed.

  scope.domElement.addEventListener("touchend", onTouchEnd, true);
  scope.domElement.addEventListener("touchmove", onTouchMove, false);

  scope.spinControl.addEventListener("change", function (event) {
    scope.dispatchEvent(changeEvent);
  });

  // Starts touch control off right
  this.adjustTrackballRadius();

  // force an update at start
  this.update();
};

CameraSpinControls.prototype = Object.create(THREE.EventDispatcher.prototype);
CameraSpinControls.prototype.constructor = CameraSpinControls;
