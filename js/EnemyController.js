// EnemyController.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';

class EnemyController {
    constructor(params) {
        this._params = params;

        // movement and collision
        this._turnSpeed = Math.PI * 1.75; // rad/s
        this._radius = typeof params.radius === 'number' ? params.radius : 8;
        this._targetRadius = typeof params.targetRadius === 'number' ? params.targetRadius : 6;
        this._colliders = Array.isArray(params.colliders) ? params.colliders : [];

        // speeds
        this._speedWalk = 22;
        this._speedRun = 40;

        // behavior ranges
        this._aggroRange = typeof params.aggroRange === 'number' ? params.aggroRange : 450;
        this._deaggroRange = this._aggroRange * 1.25;
        this._attackMargin = typeof params.attackMargin === 'number' ? params.attackMargin : 1.0;
        this._attackHysteresis = typeof params.attackHysteresis === 'number' ? params.attackHysteresis : 20;

        // timing to avoid thrash
        this._attackCooldown = typeof params.attackCooldown === 'number' ? params.attackCooldown : 0.8;
        this._minAttackHold = typeof params.minAttackHold === 'number' ? params.minAttackHold : 0.25;
        this._minChaseHold = typeof params.minChaseHold === 'number' ? params.minChaseHold : 0.2;

        // movement mode
        this._useKinematic = true;

        // inertial fields (unused unless you flip the flag)
        this._accel = 30;
        this._maxSpeed = this._speedRun;
        this._velocity = new THREE.Vector3();

        // state
        this._state = 'idle';  // 'idle' | 'chase' | 'attack'
        this._stateHold = 0;   // seconds left to keep current state
        this._time = 0;        // running clock
        this._lastAttackEnd = -Infinity;
        this._attackPlaying = false;

        // start and target
        this._startPosition =
            params.startPosition && params.startPosition.isVector3
                ? params.startPosition.clone()
                : new THREE.Vector3(0, 0, 0);

        this._getTargetPos = typeof params.getTargetPosition === 'function'
            ? params.getTargetPosition
            : () => new THREE.Vector3();

        // animation
        this._mixer = null;
        this._anims = {};
        this._currentAction = null;

        // three object
        this._obj = null;

        this._load();
    }

    _load() {
        const loader = new FBXLoader();
        loader.setPath(this._params.fbxPath || './resources/enemy/');
        const modelFile = this._params.modelFile || 'enemy.fbx';

        loader.load(modelFile, (fbx) => {
            const scale = this._params.scale || 0.3;
            fbx.scale.setScalar(scale);
            fbx.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    mats.forEach((m) => {
                        if (!m) return;
                        if (m.isMeshPhongMaterial) {
                            m.shininess = 0;
                            m.specular?.set?.(0x000000);
                            m.reflectivity = 0;
                            m.envMap = null;
                            m.needsUpdate = true;
                        }
                    });
                }
                if (o.isLight && o.parent) o.parent.remove(o);
            });

            this._obj = fbx;
            this._obj.position.copy(this._startPosition);
            this._obj.rotation.set(0, 0, 0);
            this._params.scene.add(this._obj);

            this._mixer = new THREE.AnimationMixer(this._obj);
            this._mixer.addEventListener('finished', (e) => {
                // when attack finishes, mark it and start cooldown
                if (this._attackPlaying) {
                    this._attackPlaying = false;
                    this._lastAttackEnd = this._time;
                }
            });

            const manager = new THREE.LoadingManager();
            manager.onLoad = () => this._play('idle');

            const onAnim = (name, a) => {
                if (!a || !a.animations || !a.animations.length) return;
                const clip = a.animations[0];
                const action = this._mixer.clipAction(clip);
                if (name === 'attack') {
                    action.setLoop(THREE.LoopOnce, 0);
                    action.clampWhenFinished = true;
                }
                this._anims[name] = { clip, action };
            };

            const animLoader = new FBXLoader(manager);
            animLoader.setPath(this._params.fbxPath || './resources/enemy/');

            const idleFile = this._params.idleFile || 'idle.fbx';
            const walkFile = this._params.walkFile || 'walk.fbx';
            const runFile = this._params.runFile || null;
            const attackFile = this._params.attackFile || null;

            animLoader.load(idleFile, (a) => onAnim('idle', a));
            animLoader.load(walkFile, (a) => onAnim('walk', a));
            if (runFile) animLoader.load(runFile, (a) => onAnim('run', a));
            if (attackFile) animLoader.load(attackFile, (a) => onAnim('attack', a));
        });
    }

    _play(name, fade = 0.12) {
        if (!this._mixer || !this._anims[name]) return;
        const next = this._anims[name].action;
        if (this._currentAction === next) return;
        if (this._currentAction) this._currentAction.fadeOut(fade);
        next.reset().fadeIn(fade).play();
        this._currentAction = next;
    }

    _resolveAABBCollisions(next) {
        let x = next.x, z = next.z;
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
        return new THREE.Vector3(x, next.y, z);
    }

    _separateFromTarget(pos, targetPos) {
        const minDist = this._radius + this._targetRadius;
        const delta = new THREE.Vector3().subVectors(pos, targetPos);
        delta.y = 0;
        const d = delta.length();
        if (d < minDist && d > 1e-6) {
            const n = delta.multiplyScalar(1 / d);
            return new THREE.Vector3().copy(targetPos).addScaledVector(n, minDist);
        }
        return pos;
    }

    _turnTowards(dir, dt) {
        if (!this._obj) return;
        const desiredYaw = Math.atan2(dir.x, dir.z);
        const currentYaw = this._obj.rotation.y;
        let delta = desiredYaw - currentYaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const maxStep = this._turnSpeed * dt;
        const step = THREE.MathUtils.clamp(delta, -maxStep, maxStep);
        this._obj.rotation.y = currentYaw + step;
    }

    _maybeChangeState(dist, canAttack) {
        if (this._stateHold > 0) return; // stick in current state briefly

        if (this._state === 'idle') {
            if (dist <= this._aggroRange) {
                this._state = 'chase';
                this._stateHold = this._minChaseHold;
            }
            return;
        }

        if (this._state === 'chase') {
            if (dist > this._deaggroRange) {
                this._state = 'idle';
                this._stateHold = 0.2;
                this._velocity.set(0, 0, 0);
                return;
            }
            if (canAttack && this._anims.attack) {
                this._state = 'attack';
                this._stateHold = this._minAttackHold;
                this._attackPlaying = true;
                this._play('attack');
                return;
            }
            return;
        }

        if (this._state === 'attack') {
            // do not leave until hold time is over and animation either finished or we have no attack anim
            const finished = !this._attackPlaying;
            if (finished && dist > this._attackExitRange) {
                this._state = 'chase';
                this._stateHold = this._minChaseHold;
            } else if (finished && dist <= this._attackExitRange) {
                // can chain another attack only after cooldown
                if ((this._time - this._lastAttackEnd) >= this._attackCooldown && this._anims.attack) {
                    this._state = 'attack';
                    this._stateHold = this._minAttackHold;
                    this._attackPlaying = true;
                    this._play('attack');
                }
            }
        }
    }

    Update(dt) {
        if (!this._obj) return;
        this._time += dt;
        if (this._stateHold > 0) this._stateHold -= dt;

        const targetPos = this._getTargetPos();

        // ranges with hysteresis
        const contact = this._radius + this._targetRadius;
        const baseAttackRange = contact + this._attackMargin;
        this._attackEnterRange = baseAttackRange;
        this._attackExitRange = baseAttackRange + this._attackHysteresis;

        // distance and direction
        const toTarget = new THREE.Vector3().subVectors(targetPos, this._obj.position);
        toTarget.y = 0;
        let dist = toTarget.length();
        if (dist > 1e-6) toTarget.multiplyScalar(1 / dist);
        else toTarget.set(0, 0, 1);

        // rotate toward target
        this._turnTowards(toTarget, dt);

        // attack gating
        const cooldownReady = (this._time - this._lastAttackEnd) >= this._attackCooldown;
        const canAttack = (dist <= this._attackEnterRange) && cooldownReady;

        // state transitions with holds and hysteresis
        this._maybeChangeState(dist, canAttack);

        // move
        let moveSpeed = 0;
        if (this._state === 'chase') {
            moveSpeed = this._anims.run ? this._speedRun : this._speedWalk;
        } else if (this._state === 'attack') {
            moveSpeed = 0;
        }

        if (this._useKinematic) {
            const forward = new THREE.Vector3(0, 0, 1).applyEuler(this._obj.rotation).normalize();
            const step = forward.multiplyScalar(moveSpeed * dt);
            let next = this._obj.position.clone().add(step);
            next.y = 0;

            // walls then player separation
            next = this._resolveAABBCollisions(next);
            next = this._resolveAABBCollisions(next);
            next = this._separateFromTarget(next, targetPos);

            this._obj.position.copy(next);
        } else {
            if (this._state === 'chase') {
                const forward = new THREE.Vector3(0, 0, 1).applyEuler(this._obj.rotation).normalize();
                const accel = forward.multiplyScalar(this._accel);
                this._velocity.addScaledVector(accel, dt);
                const speed = this._velocity.length();
                const max = this._maxSpeed;
                if (speed > max) this._velocity.multiplyScalar(max / speed);
            } else {
                const damp = Math.exp(-4 * dt);
                this._velocity.multiplyScalar(damp);
            }

            let next = this._obj.position.clone().addScaledVector(this._velocity, dt);
            next.y = 0;
            next = this._resolveAABBCollisions(next);
            next = this._resolveAABBCollisions(next);
            next = this._separateFromTarget(next, targetPos);
            this._obj.position.copy(next);
        }

        // choose animation based on state
        if (this._state === 'idle') {
            this._play('idle');
        } else if (this._state === 'chase') {
            if (this._anims.run) this._play('run');
            else this._play('walk');
        } else if (this._state === 'attack') {
            // if no attack anim, at least do idle hold
            if (!this._anims.attack) this._play('idle');
        }

        if (this._mixer) this._mixer.update(dt);
    }
}

export { EnemyController };
