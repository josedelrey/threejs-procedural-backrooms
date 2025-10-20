import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { CharacterFSM } from './StateMachine.js';

class BasicCharacterControllerProxy {
    constructor(animations) { this._animations = animations; }
    get animations() { return this._animations; }
}

class BasicCharacterController {
    constructor(params) { this._Init(params); }

    _Init(params) {
        this._params = params;
        this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
        this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
        this._velocity = new THREE.Vector3(0, 0, 0);
        this._position = new THREE.Vector3();

        this._startPosition =
            params.startPosition && params.startPosition.isVector3
                ? params.startPosition.clone()
                : new THREE.Vector3(0, 0, 0);

        // collisions
        this._radius = 5; // was 12; 10 fits your 0.3-scaled rig better
        this._colliders = Array.isArray(params.colliders) ? params.colliders : [];
        this._getHeightAt = typeof params.getHeightAt === 'function' ? params.getHeightAt : (() => 0);

        this._animations = {};
        this._input = new BasicCharacterControllerInput();
        this._stateMachine = new CharacterFSM(new BasicCharacterControllerProxy(this._animations));

        this._LoadModels();
    }

    _LoadModels() {
        const loader = new FBXLoader();
        loader.setPath('./resources/character/');
        loader.load('character_rigged.fbx', (fbx) => {
            fbx.scale.setScalar(0.3);
            fbx.traverse(c => { c.castShadow = true; });
            const rm = [];
            fbx.traverse(o => { if (o.isLight) rm.push(o); });
            rm.forEach(l => l.parent && l.parent.remove(l));

            fbx.traverse(o => {
                if (!o.isMesh) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    if (!m) return;
                    if (m.isMeshPhongMaterial) {
                        m.shininess = 0; m.specular.set(0x000000); m.reflectivity = 0; m.envMap = null; m.needsUpdate = true;
                    }
                });
            });

            this._target = fbx;
            this._target.position.copy(this._startPosition);
            this._position.copy(this._target.position);
            this._params.scene.add(this._target);

            this._mixer = new THREE.AnimationMixer(this._target);

            this._manager = new THREE.LoadingManager();
            this._manager.onLoad = () => { this._stateMachine.SetState('idle'); };

            const _OnLoad = (name, anim) => {
                const clip = anim.animations[0];
                const action = this._mixer.clipAction(clip);
                this._animations[name] = { clip, action };
            };

            const loader2 = new FBXLoader(this._manager);
            loader2.setPath('./resources/character/');
            loader2.load('walk.fbx', a => _OnLoad('walk', a));
            loader2.load('run.fbx', a => _OnLoad('run', a));
            loader2.load('idle.fbx', a => _OnLoad('idle', a));
        });
    }

    setPosition(x, y, z) {
        if (!this._target) this._startPosition.set(x, y, z);
        else { this._target.position.set(x, y, z); this._position.set(x, y, z); }
    }

    _resolve2DCollisions(nextPos) {
        let x = nextPos.x, z = nextPos.z;
        const r = this._radius;

        for (const rect of this._colliders) {
            const exmin = rect.minX - r;
            const exmax = rect.maxX + r;
            const ezmin = rect.minZ - r;
            const ezmax = rect.maxZ + r;

            if (x >= exmin && x <= exmax && z >= ezmin && z <= ezmax) {
                const pushLeft = Math.abs(x - exmin);
                const pushRight = Math.abs(exmax - x);
                const pushDown = Math.abs(z - ezmin);
                const pushUp = Math.abs(ezmax - z);
                const minPush = Math.min(pushLeft, pushRight, pushDown, pushUp);
                if (minPush === pushLeft) x = exmin;
                else if (minPush === pushRight) x = exmax;
                else if (minPush === pushDown) z = ezmin;
                else z = ezmax;
            }
        }
        return new THREE.Vector3(x, nextPos.y, z);
    }

    get Position() { return this._position; }
    get Rotation() { return this._target ? this._target.quaternion : new THREE.Quaternion(); }

    Update(timeInSeconds) {
        if (!this._stateMachine._currentState || !this._target) return;

        this._stateMachine.Update(timeInSeconds, this._input);

        const v = this._velocity;
        const dec = new THREE.Vector3(v.x * this._decceleration.x, v.y * this._decceleration.y, v.z * this._decceleration.z);
        dec.multiplyScalar(timeInSeconds);
        dec.z = Math.sign(dec.z) * Math.min(Math.abs(dec.z), Math.abs(v.z));
        v.add(dec);

        const obj = this._target;
        const _Q = new THREE.Quaternion();
        const _A = new THREE.Vector3();
        const _R = obj.quaternion.clone();

        const acc = this._acceleration.clone();
        if (this._input._keys.shift) acc.multiplyScalar(8.0);

        if (this._input._keys.forward) v.z += acc.z * timeInSeconds;
        if (this._input._keys.backward) v.z -= acc.z * timeInSeconds;
        if (this._input._keys.left) { _A.set(0, 1, 0); _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y); _R.multiply(_Q); }
        if (this._input._keys.right) { _A.set(0, 1, 0); _Q.setFromAxisAngle(_A, -4.0 * Math.PI * timeInSeconds * this._acceleration.y); _R.multiply(_Q); }

        obj.quaternion.copy(_R);

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion).normalize();
        const sideways = new THREE.Vector3(1, 0, 0).applyQuaternion(obj.quaternion).normalize();

        sideways.multiplyScalar(v.x * timeInSeconds);
        forward.multiplyScalar(v.z * timeInSeconds);

        const next = obj.position.clone().add(forward).add(sideways);

        // ground (flat)
        const groundY = this._getHeightAt(next.x, next.z);
        next.y = groundY + (obj.position.y - groundY);

        // collide and commit
        let corrected = this._resolve2DCollisions(next);
        // optional second pass for corner stability
        corrected = this._resolve2DCollisions(corrected);

        obj.position.copy(corrected);
        this._position.copy(obj.position);

        if (this._mixer) this._mixer.update(timeInSeconds);
    }
}

class BasicCharacterControllerInput {
    constructor() { this._Init(); }
    _Init() {
        this._keys = { forward: false, backward: false, left: false, right: false, space: false, shift: false };
        document.addEventListener('keydown', e => this._onKeyDown(e), false);
        document.addEventListener('keyup', e => this._onKeyUp(e), false);
    }
    _onKeyDown(e) {
        switch (e.keyCode) {
            case 87: this._keys.forward = true; break;
            case 65: this._keys.left = true; break;
            case 83: this._keys.backward = true; break;
            case 68: this._keys.right = true; break;
            case 32: this._keys.space = true; break;
            case 16: this._keys.shift = true; break;
        }
    }
    _onKeyUp(e) {
        switch (e.keyCode) {
            case 87: this._keys.forward = false; break;
            case 65: this._keys.left = false; break;
            case 83: this._keys.backward = false; break;
            case 68: this._keys.right = false; break;
            case 32: this._keys.space = false; break;
            case 16: this._keys.shift = false; break;
        }
    }
}

export { BasicCharacterController, BasicCharacterControllerProxy, BasicCharacterControllerInput };
