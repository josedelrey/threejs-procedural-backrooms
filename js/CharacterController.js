import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { CharacterFSM } from './StateMachine.js';

class BasicCharacterControllerProxy {
    constructor(animations) {
        this._animations = animations;
    }
    get animations() {
        return this._animations;
    }
}

class BasicCharacterController {
    constructor(params) {
        this._Init(params);
    }

    _Init(params) {
        this._params = params;
        this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
        this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
        this._velocity = new THREE.Vector3(0, 0, 0);
        this._position = new THREE.Vector3();

        // NEW: initial spawn position support
        this._startPosition =
            params.startPosition && params.startPosition.isVector3
                ? params.startPosition.clone()
                : new THREE.Vector3(0, 0, 0);

        this._animations = {};
        this._input = new BasicCharacterControllerInput();
        this._stateMachine = new CharacterFSM(
            new BasicCharacterControllerProxy(this._animations)
        );

        this._LoadModels();
    }

    _LoadModels() {
        const loader = new FBXLoader();
        loader.setPath('./resources/character/');
        loader.load('character_rigged.fbx', (fbx) => {
            fbx.scale.setScalar(0.3);
            fbx.traverse((c) => {
                c.castShadow = true;
            });

            // Remove any lights embedded in the FBX
            const toRemove = [];
            fbx.traverse((o) => {
                if (o.isLight) toRemove.push(o);
            });
            for (const l of toRemove) {
                if (l.parent) l.parent.remove(l);
            }

            // Make materials matte
            fbx.traverse((o) => {
                if (!o.isMesh) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => {
                    if (!m) return;
                    if (m.isMeshPhongMaterial) {
                        m.shininess = 0;
                        m.specular.set(0x000000);
                        m.reflectivity = 0;
                        m.envMap = null;
                        m.needsUpdate = true;
                    }
                });
            });

            this._target = fbx;

            // NEW: place the character at the requested spawn
            this._target.position.copy(this._startPosition);
            this._position.copy(this._target.position);

            this._params.scene.add(this._target);

            this._mixer = new THREE.AnimationMixer(this._target);

            this._manager = new THREE.LoadingManager();
            this._manager.onLoad = () => {
                this._stateMachine.SetState('idle');
            };

            const _OnLoad = (animName, anim) => {
                const clip = anim.animations[0];
                const action = this._mixer.clipAction(clip);
                this._animations[animName] = { clip, action };
            };

            const loader2 = new FBXLoader(this._manager);
            loader2.setPath('./resources/character/');
            loader2.load('walk.fbx', (a) => { _OnLoad('walk', a); });
            loader2.load('run.fbx', (a) => { _OnLoad('run', a); });
            loader2.load('idle.fbx', (a) => { _OnLoad('idle', a); });
        });
    }

    // Optional helper: allow teleporting even before the model loaded
    setPosition(x, y, z) {
        if (!this._target) {
            this._startPosition.set(x, y, z);
        } else {
            this._target.position.set(x, y, z);
            this._position.set(x, y, z);
        }
    }

    get Position() {
        return this._position;
    }

    get Rotation() {
        if (!this._target) {
            return new THREE.Quaternion();
        }
        return this._target.quaternion;
    }

    Update(timeInSeconds) {
        if (!this._stateMachine._currentState || !this._target) {
            return;
        }

        this._stateMachine.Update(timeInSeconds, this._input);

        const velocity = this._velocity;
        const frameDecceleration = new THREE.Vector3(
            velocity.x * this._decceleration.x,
            velocity.y * this._decceleration.y,
            velocity.z * this._decceleration.z
        );
        frameDecceleration.multiplyScalar(timeInSeconds);
        frameDecceleration.z =
            Math.sign(frameDecceleration.z) *
            Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z));

        velocity.add(frameDecceleration);

        const controlObject = this._target;
        const _Q = new THREE.Quaternion();
        const _A = new THREE.Vector3();
        const _R = controlObject.quaternion.clone();

        const acc = this._acceleration.clone();
        if (this._input._keys.shift) {
            acc.multiplyScalar(8.0);
        }

        if (this._input._keys.forward) {
            velocity.z += acc.z * timeInSeconds;
        }
        if (this._input._keys.backward) {
            velocity.z -= acc.z * timeInSeconds;
        }
        if (this._input._keys.left) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }
        if (this._input._keys.right) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }

        controlObject.quaternion.copy(_R);

        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(controlObject.quaternion);
        forward.normalize();

        const sideways = new THREE.Vector3(1, 0, 0);
        sideways.applyQuaternion(controlObject.quaternion);
        sideways.normalize();

        sideways.multiplyScalar(velocity.x * timeInSeconds);
        forward.multiplyScalar(velocity.z * timeInSeconds);

        controlObject.position.add(forward);
        controlObject.position.add(sideways);

        this._position.copy(controlObject.position);

        if (this._mixer) {
            this._mixer.update(timeInSeconds);
        }
    }
}

class BasicCharacterControllerInput {
    constructor() {
        this._Init();
    }

    _Init() {
        this._keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            space: false,
            shift: false,
        };
        document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
    }

    _onKeyDown(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = true;
                break;
            case 65: // a
                this._keys.left = true;
                break;
            case 83: // s
                this._keys.backward = true;
                break;
            case 68: // d
                this._keys.right = true;
                break;
            case 32: // SPACE
                this._keys.space = true;
                break;
            case 16: // SHIFT
                this._keys.shift = true;
                break;
        }
    }

    _onKeyUp(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = false;
                break;
            case 65: // a
                this._keys.left = false;
                break;
            case 83: // s
                this._keys.backward = false;
                break;
            case 68: // d
                this._keys.right = false;
                break;
            case 32: // SPACE
                this._keys.space = false;
                break;
            case 16: // SHIFT
                this._keys.shift = false;
                break;
        }
    }
}

export { BasicCharacterController, BasicCharacterControllerProxy, BasicCharacterControllerInput };
