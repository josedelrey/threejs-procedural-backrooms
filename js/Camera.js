import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

class ThirdPersonCamera {
    constructor(params) {
        this._params = params;
        this._camera = params.camera;

        this._currentPosition = new THREE.Vector3();
        this._currentLookat = new THREE.Vector3();

        // Tweakables: distance behind and vertical aim height
        this._followDistance = 35; // how far behind
        this._followHeight = 8; // camera height above character
        this._aimHeight = 14; // where to aim on the character (chest/head)
    }

    _CalculateIdealOffset() {
        // Offset directly behind the character in its local -Z, no lateral X
        const offsetLocal = new THREE.Vector3(0, this._followHeight, -this._followDistance);
        const offsetWorld = offsetLocal.clone().applyQuaternion(this._params.target.Rotation);
        // Add an aim height so camera rides higher relative to the character
        const targetPos = this._params.target.Position.clone().add(new THREE.Vector3(0, this._aimHeight, 0));
        return targetPos.add(offsetWorld);
    }

    _CalculateIdealLookat() {
        // Aim exactly at the character (center it on screen)
        return this._params.target.Position.clone().add(new THREE.Vector3(0, this._aimHeight, 0));
    }

    Update(timeElapsed) {
        const idealOffset = this._CalculateIdealOffset();
        const idealLookat = this._CalculateIdealLookat();

        // Smoothly move camera; t≈0.001 damping
        const t = 1.0 - Math.pow(0.001, timeElapsed);
        this._currentPosition.lerp(idealOffset, t);
        this._currentLookat.lerp(idealLookat, t);

        this._camera.position.copy(this._currentPosition);
        this._camera.lookAt(this._currentLookat);
    }
}


export { ThirdPersonCamera };
