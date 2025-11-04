import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

class ThirdPersonCamera {
    constructor(params) {
        this._params = params;
        this._camera = params.camera;

        this._currentPosition = new THREE.Vector3();
        this._currentLookat = new THREE.Vector3();

        // Camera configuration
        this._followDistance = 35;
        this._followHeight = 8;
        this._aimHeight = 14;
    }

    _CalculateIdealOffset() {
        // Compute desired camera position behind the target
        const offsetLocal = new THREE.Vector3(0, this._followHeight, -this._followDistance);
        const offsetWorld = offsetLocal.clone().applyQuaternion(this._params.target.Rotation);
        const targetPos = this._params.target.Position.clone().add(new THREE.Vector3(0, this._aimHeight, 0));
        return targetPos.add(offsetWorld);
    }

    _CalculateIdealLookat() {
        // Compute point the camera should focus on
        return this._params.target.Position.clone().add(new THREE.Vector3(0, this._aimHeight, 0));
    }

    Update(timeElapsed) {
        const idealOffset = this._CalculateIdealOffset();
        const idealLookat = this._CalculateIdealLookat();

        // Smooth interpolation between current and target positions
        const t = 1.0 - Math.pow(0.001, timeElapsed);
        this._currentPosition.lerp(idealOffset, t);
        this._currentLookat.lerp(idealLookat, t);

        this._camera.position.copy(this._currentPosition);
        this._camera.lookAt(this._currentLookat);
    }
}

export { ThirdPersonCamera };
