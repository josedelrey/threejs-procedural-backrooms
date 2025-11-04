// EnemyController.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';

class EnemyController {
    constructor(params) {
        this._params = params;

        // Movement and collision
        this._turnSpeed = Math.PI * 1.75;
        this._radius = typeof params.radius === 'number' ? params.radius : 8;
        this._targetRadius = typeof params.targetRadius === 'number' ? params.targetRadius : 6;
        this._colliders = Array.isArray(params.colliders) ? params.colliders : [];

        // Speeds
        this._speedWalk = typeof params.speedWalk === 'number' ? params.speedWalk : 22;
        this._speedRun = typeof params.speedRun === 'number' ? params.speedRun : 40;

        // Behavior ranges
        this._aggroRange = typeof params.aggroRange === 'number' ? params.aggroRange : 450;
        this._deaggroRange = this._aggroRange * 1.25;
        this._attackMargin = typeof params.attackMargin === 'number' ? params.attackMargin : 1.0;
        this._attackHysteresis = typeof params.attackHysteresis === 'number' ? params.attackHysteresis : 20;

        // Timers for state stability
        this._attackCooldown = typeof params.attackCooldown === 'number' ? params.attackCooldown : 0.8;
        this._minAttackHold = typeof params.minAttackHold === 'number' ? params.minAttackHold : 0.25;
        this._minChaseHold = typeof params.minChaseHold === 'number' ? params.minChaseHold : 0.2;

        // Player hit callback
        this.onHitPlayer = typeof params.onHitPlayer === 'function' ? params.onHitPlayer : null;
        this._attackDamage = typeof params.attackDamage === 'number' ? params.attackDamage : 10;

        // Movement mode
        this._useKinematic = true;

        // Kinematic params
        this._accel = 30;
        this._maxSpeed = this._speedRun;
        this._velocity = new THREE.Vector3();

        // State
        this._state = 'idle';
        this._stateHold = 0;
        this._time = 0;

        // Attack timers
        this._attackPlaying = false;
        this._attackStartTime = -Infinity;
        this._attackDuration = 0.6;  // may be overwritten by clip
        this._lastAttackEnd = -Infinity;

        // Health
        this._hpMax = typeof params.hpMax === 'number' ? params.hpMax : 60;
        this._hp = this._hpMax;

        // Hurt and invuln
        this._hurtActive = false;
        this._hurtEndTime = -Infinity;
        this._hurtDuration = typeof params.hurtDuration === 'number' ? params.hurtDuration : 0.5;
        this._invulnDuration = typeof params.invulnDuration === 'number' ? params.invulnDuration : 0.0;
        this._invulnEndTime = -Infinity;
        this._hurtKnockback = typeof params.hurtKnockback === 'number' ? params.hurtKnockback : 0.0;

        // Start and target
        this._startPosition =
            params.startPosition && params.startPosition.isVector3
                ? params.startPosition.clone()
                : new THREE.Vector3(0, 0, 0);

        this._getTargetPos = typeof params.getTargetPosition === 'function'
            ? params.getTargetPosition
            : () => new THREE.Vector3();

        // Animation
        this._mixer = null;
        this._anims = {};
        this._currentAction = null;

        // Scene object
        this._obj = null;

        this._load();
    }

    get object3D() { return this._obj; }

    // HP API
    damage(n, hitDir = null) {
        const now = this._time;
        if (now < this._invulnEndTime) return; // invulnerability

        const amount = Math.max(0, n | 0);
        if (amount <= 0) return;

        this._hp = Math.max(0, this._hp - amount);

        // Stop attack and start cooldown
        this._attackPlaying = false;
        this._lastAttackEnd = this._time;

        // Enter hurt
        this._triggerHurt();

        // Knockback
        if (this._hurtKnockback > 0 && this._obj) {
            let dir = new THREE.Vector3();
            if (hitDir && hitDir.isVector3) {
                dir.copy(hitDir).normalize();
            } else {
                const toEnemy = new THREE.Vector3().subVectors(this._obj.position, this._getTargetPos());
                toEnemy.y = 0;
                if (toEnemy.lengthSq() > 1e-6) dir.copy(toEnemy).normalize();
            }
            if (dir.lengthSq() > 0) {
                const next = this._obj.position.clone().addScaledVector(dir, this._hurtKnockback);
                const resolved = this._resolveAABBCollisions(next);
                this._obj.position.copy(resolved);
            }
        }
    }

    heal(n) {
        this._hp = Math.min(this._hpMax, this._hp + Math.max(0, n | 0));
    }

    setMaxHp(n) {
        this._hpMax = Math.max(1, n | 0);
        this._hp = Math.min(this._hp, this._hpMax);
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

            const manager = new THREE.LoadingManager();
            manager.onLoad = () => {
                if (this._anims.attack?.clip?.duration) {
                    this._attackDuration = this._anims.attack.clip.duration;
                }
                if (this._anims.hurt?.clip?.duration) {
                    this._hurtDuration = this._anims.hurt.clip.duration;
                }
                this._play('idle');
            };

            const onAnim = (name, a) => {
                if (!a || !a.animations || !a.animations.length) return;
                const clip = a.animations[0];
                const action = this._mixer.clipAction(clip);
                if (name === 'attack') {
                    action.setLoop(THREE.LoopOnce, 0);
                    action.clampWhenFinished = true;
                    this._attackDuration = clip.duration || this._attackDuration;
                }
                if (name === 'hurt') {
                    action.setLoop(THREE.LoopOnce, 0);
                    action.clampWhenFinished = true;
                    this._hurtDuration = clip.duration || this._hurtDuration;
                }
                this._anims[name] = { clip, action };
            };

            const animLoader = new FBXLoader(manager);
            animLoader.setPath(this._params.fbxPath || './resources/enemy/');

            const idleFile = this._params.idleFile || 'idle.fbx';
            const walkFile = this._params.walkFile || 'walk.fbx';
            const runFile = this._params.runFile || null;
            const attackFile = this._params.attackFile || null;
            const hurtFile = this._params.hurtFile || 'hurt.fbx'; // optional

            animLoader.load(idleFile, (a) => onAnim('idle', a));
            animLoader.load(walkFile, (a) => onAnim('walk', a));
            if (runFile) animLoader.load(runFile, (a) => onAnim('run', a));
            if (attackFile) animLoader.load(attackFile, (a) => onAnim('attack', a));
            // Load hurt and ignore failure
            animLoader.load(hurtFile, (a) => onAnim('hurt', a), undefined, () => { });
        });
    }

    // Allow restart of same action
    _play(name, fade = 0.12, force = false) {
        if (!this._mixer || !this._anims[name]) return;
        const next = this._anims[name].action;

        if (this._currentAction === next && !force) return;

        if (force && this._currentAction === next) {
            next.enabled = true;
            next.paused = false;
            next.time = 0;
            next.reset().play();
            return;
        }

        if (this._currentAction) this._currentAction.fadeOut(fade);
        next.reset().fadeIn(fade).play();
        this._currentAction = next;
    }

    _triggerHurt() {
        const a = this._anims.hurt?.action;
        if (!a) {
            // No clip. Still gate behavior briefly
            this._hurtActive = true;
            this._hurtEndTime = this._time + this._hurtDuration;
            this._invulnEndTime = this._time + this._invulnDuration;
            return;
        }

        // Timers
        this._hurtActive = true;
        this._hurtEndTime = this._time + this._hurtDuration;
        this._invulnEndTime = this._time + this._invulnDuration;

        // Crossfade to hurt and restart
        try {
            if (this._currentAction && this._currentAction !== a) {
                this._currentAction.crossFadeTo(a, 0.06, false);
            }
        } catch { }
        a.enabled = true;
        a.paused = false;
        a.time = 0;
        this._play('hurt', 0.06, true);
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

    _beginAttack() {
        this._state = 'attack';
        this._stateHold = this._minAttackHold;
        this._attackPlaying = true;
        this._attackStartTime = this._time;
        // Force restart so the same clip can replay
        this._play('attack', 0.06, true);
        if (this.onHitPlayer) this.onHitPlayer(this._attackDamage);
    }

    _maybeChangeState(dist, canAttack) {
        // No transitions during hurt
        if (this._hurtActive) return;

        if (this._stateHold > 0) return;

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
                this._beginAttack();
                return;
            }
            return;
        }

        if (this._state === 'attack') {
            const finished = (this._time - this._attackStartTime) >= this._attackDuration;
            if (finished && this._attackPlaying) {
                this._attackPlaying = false;
                this._lastAttackEnd = this._time;
            }

            if (finished) {
                if (dist > this._attackExitRange) {
                    this._state = 'chase';
                    this._stateHold = this._minChaseHold;
                } else {
                    const cooldownReady = (this._time - this._lastAttackEnd) >= this._attackCooldown;
                    if (cooldownReady && this._anims.attack) {
                        this._beginAttack();
                    } else if (dist > this._deaggroRange) {
                        this._state = 'chase';
                        this._stateHold = this._minChaseHold;
                    }
                }
            }
        }
    }

    Update(dt) {
        if (!this._obj) return;
        this._time += dt;
        if (this._stateHold > 0) this._stateHold -= dt;

        // Hurt timers
        if (this._hurtActive && this._time >= this._hurtEndTime) {
            this._hurtActive = false;
            // After hurt, return to idle
            if (this._anims.idle?.action) this._play('idle', 0.06, true);
        }

        const targetPos = this._getTargetPos();

        const contact = this._radius + this._targetRadius;
        const baseAttackRange = contact + this._attackMargin;
        this._attackEnterRange = baseAttackRange;
        this._attackExitRange = baseAttackRange + this._attackHysteresis;

        const toTarget = new THREE.Vector3().subVectors(targetPos, this._obj.position);
        toTarget.y = 0;
        let dist = toTarget.length();
        if (dist > 1e-6) toTarget.multiplyScalar(1 / dist);
        else toTarget.set(0, 0, 1);

        this._turnTowards(toTarget, dt);

        const cooldownReady = (this._time - this._lastAttackEnd) >= this._attackCooldown;
        const canAttack = (dist <= this._attackEnterRange) && cooldownReady;

        this._maybeChangeState(dist, canAttack);

        // Movement
        let moveSpeed = 0;
        if (this._hurtActive) {
            moveSpeed = 0;
        } else if (this._state === 'chase') {
            moveSpeed = this._anims.run ? this._speedRun : this._speedWalk;
        } else if (this._state === 'attack') {
            moveSpeed = 0;
        }

        if (this._useKinematic) {
            const forward = new THREE.Vector3(0, 0, 1).applyEuler(this._obj.rotation).normalize();
            const step = forward.multiplyScalar(moveSpeed * dt);
            let next = this._obj.position.clone().add(step);
            next.y = 0;

            next = this._resolveAABBCollisions(next);
            next = this._resolveAABBCollisions(next);
            next = this._separateFromTarget(next, targetPos);

            this._obj.position.copy(next);
        } else {
            if (this._state === 'chase' && !this._hurtActive) {
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

        // Animation selection
        if (this._hurtActive) {
            if (this._anims.hurt && this._currentAction !== this._anims.hurt.action) {
                this._play('hurt', 0.06, true);
            }
        } else if (this._state === 'idle') {
            this._play('idle');
        } else if (this._state === 'chase') {
            if (this._anims.run) this._play('run'); else this._play('walk');
        } else if (this._state === 'attack') {
            if (!this._anims.attack) this._play('idle');
        }

        if (this._mixer) this._mixer.update(dt);
    }
}

export { EnemyController };
