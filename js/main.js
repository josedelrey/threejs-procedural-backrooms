// Main.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { BasicCharacterController } from './CharacterController.js';
import { ThirdPersonCamera } from './Camera.js';
import { Terrain } from './Terrain.js';
import { EnemyController } from './EnemyController.js';
import { HUD } from './HUD.js';

class ThirdPersonCameraDemo {
    constructor() { this._Initialize(); }

    _Initialize() {
        this._threejs = new THREE.WebGLRenderer({ antialias: true });
        this._threejs.outputEncoding = THREE.sRGBEncoding;
        this._threejs.shadowMap.enabled = true;
        this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
        this._threejs.setPixelRatio(window.devicePixelRatio);
        this._threejs.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this._threejs.domElement);

        window.addEventListener('resize', () => this._OnWindowResize(), false);

        const fov = 60, aspect = 1920 / 1080, near = 1.0, far = 2000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this._scene = new THREE.Scene();

        const sky = new THREE.CubeTextureLoader().load([
            './resources/sky/vz_sinister_right.png',
            './resources/sky/vz_sinister_left.png',
            './resources/sky/vz_sinister_up.png',
            './resources/sky/vz_sinister_down.png',
            './resources/sky/vz_sinister_front.png',
            './resources/sky/vz_sinister_back.png',
        ]);
        sky.encoding = THREE.sRGBEncoding;
        this._scene.background = sky;

        // HUD
        this._hud = new HUD();
        this._hud.setMax(100);
        this._hud.set(100);

        // Terrain and spawn
        this._terrain = new Terrain(this._scene);
        this._spawn = this._terrain.getFirstRoomCenter();

        // Camera start
        this._camera.position.set(this._spawn.x, this._spawn.y + 20, this._spawn.z + 50);
        this._camera.lookAt(this._spawn);

        this._mixers = [];
        this._previousRAF = null;
        this._rafHandle = 0;

        // game state
        this._portalSpawned = false;
        this._gameWon = false;
        this._gameLost = false;

        this._LoadPlayer();
        this._SpawnEnemy();

        // Quick test keys
        this._onKey = (e) => {
            if (this._gameWon || this._gameLost) return;
            if (e.code === 'KeyH') this._controls && this._controls.damage(7);
            if (e.code === 'KeyJ') this._controls && this._controls.heal(7);
            if (e.code === 'KeyP') {
                const pos = this._controls?._target?.position ?? this._spawn;
                if (pos) {
                    this._terrain.spawnPortalAtFurthest(pos, { radius: 30, tube: 6, y: 0 });
                    this._portalSpawned = true;
                }
            }
        };
        document.addEventListener('keydown', this._onKey);

        this._createWinOverlay();
        this._createLoseOverlay();

        this._RAF();
    }

    _createWinOverlay() {
        const css = document.createElement('style');
        css.textContent = `
      #win-overlay, #lose-overlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        z-index: 99999;
      }
      #win-overlay { background: rgba(0,0,0,0.82); }
      #lose-overlay { background: rgba(0,0,0,0.9); }
      .overlay-title {
        color: #f5f5f5;
        font-family: system-ui, Arial, sans-serif;
        font-size: 64px;
        letter-spacing: 6px;
        text-shadow: 0 2px 12px rgba(255,255,255,0.25);
        margin-bottom: 12px;
      }
      .overlay-subtitle {
        color: #ddd;
        font-family: system-ui, Arial, sans-serif;
        font-size: 18px;
        letter-spacing: 2px;
        opacity: 0.9;
      }
      .overlay-btn {
        margin-top: 24px;
        padding: 10px 16px;
        border: 1px solid #aaa;
        color: #eee;
        background: rgba(255,255,255,0.06);
        cursor: pointer;
        font-family: system-ui, Arial, sans-serif;
        font-size: 14px;
      }
      .overlay-btn:hover {
        background: rgba(255,255,255,0.12);
      }
      #lose-overlay .overlay-title { color: #ff4d4d; text-shadow: 0 2px 18px rgba(255,0,0,0.35); }
      #lose-overlay .overlay-subtitle { color: #f0cccc; }
    `;
        document.head.appendChild(css);

        const win = document.createElement('div');
        win.id = 'win-overlay';
        win.innerHTML = `
      <div class="overlay-title">YOU WON</div>
      <div class="overlay-subtitle">You escaped the backrooms</div>
      <button class="overlay-btn">Restart</button>
    `;
        document.body.appendChild(win);
        win.querySelector('.overlay-btn').addEventListener('click', () => location.reload());
        this._winOverlay = win;
    }

    _createLoseOverlay() {
        const lose = document.createElement('div');
        lose.id = 'lose-overlay';
        lose.innerHTML = `
      <div class="overlay-title">YOU DIED</div>
      <div class="overlay-subtitle">Press restart to try again</div>
      <button class="overlay-btn">Restart</button>
    `;
        document.body.appendChild(lose);
        lose.querySelector('.overlay-btn').addEventListener('click', () => location.reload());
        this._loseOverlay = lose;
    }

    _showWinOverlay() {
        if (this._winOverlay) this._winOverlay.style.display = 'flex';
    }

    _showLoseOverlay() {
        if (this._loseOverlay) this._loseOverlay.style.display = 'flex';
    }

    _stopLoopAndInput() {
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = 0;
        }
        document.removeEventListener('keydown', this._onKey);
    }

    _winGame() {
        if (this._gameWon || this._gameLost) return;
        this._gameWon = true;
        this._stopLoopAndInput();
        this._showWinOverlay();
    }

    _loseGame() {
        if (this._gameLost || this._gameWon) return;
        this._gameLost = true;
        this._stopLoopAndInput();
        this._showLoseOverlay();
    }

    _LoadPlayer() {
        const params = {
            camera: this._camera,
            scene: this._scene,
            startPosition: this._spawn.clone(),
            colliders: this._terrain.getColliders(),
            getHeightAt: (x, z) => this._terrain.getHeightAt(x, z),
            onHpChange: (hp, max) => {
                this._hud.setMax(max);
                this._hud.set(hp);
                if (!this._gameWon && !this._gameLost && hp <= 0) {
                    this._loseGame();
                }
            },
        };
        this._controls = new BasicCharacterController(params);

        this._thirdPersonCamera = new ThirdPersonCamera({
            camera: this._camera,
            target: this._controls,
        });
    }

    _SpawnEnemy() {
        const enemyPos = this._terrain.getRoomCenterAtSteps(3);
        enemyPos.y = 0;

        this._enemy = new EnemyController({
            scene: this._scene,
            startPosition: enemyPos,
            colliders: this._terrain.getColliders(),
            radius: 8,
            targetRadius: 5,
            aggroRange: 450,
            attackMargin: 1.0,
            speedWalk: 22,
            speedRun: 40,
            getTargetPosition: () => this._controls?._target?.position.clone() ?? this._camera.position.clone(),
            onHitPlayer: (dmg) => this._controls && this._controls.damage(dmg),

            attackDamage: 8,
            attackCooldown: 0.5,
            minAttackHold: 0.2,
            attackHysteresis: 10,

            fbxPath: './resources/enemy/',
            modelFile: 'enemy.fbx',
            idleFile: 'idle.fbx',
            walkFile: 'walk.fbx',
            runFile: 'run.fbx',
            attackFile: 'attack.fbx',
            scale: 0.13,
            hpMax: 60,
        });
    }

    _OnWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._threejs.setSize(window.innerWidth, window.innerHeight);
    }

    _RAF() {
        this._rafHandle = requestAnimationFrame((t) => {
            if (this._previousRAF === null) this._previousRAF = t;

            // Render one last frame even when ending
            this._threejs.render(this._scene, this._camera);

            if (!this._gameWon && !this._gameLost) {
                this._Step(t - this._previousRAF);
                this._previousRAF = t;
                this._RAF();
            }
        });
    }

    _Step(timeElapsed) {
        const dt = timeElapsed * 0.001;

        if (this._mixers) this._mixers.forEach(m => m.update(dt));
        if (this._controls) this._controls.Update(dt);
        if (this._terrain) this._terrain.Update(dt);
        if (this._enemy) this._enemy.Update(dt);

        // Spawn the portal once the player model exists
        if (!this._portalSpawned && this._controls && this._controls._target) {
            const pos = this._controls._target.position;
            this._terrain.spawnPortalAtFurthest(pos, { radius: 30, tube: 6, y: 0 });
            this._portalSpawned = true;
        }

        // Win condition near portal
        const portal = this._terrain._portal; // or this._terrain.getPortalObject()
        if (!this._gameWon && !this._gameLost && portal && this._controls && this._controls._target) {
            const playerPos = this._controls._target.position;
            const center = portal.position;
            const dx = playerPos.x - center.x;
            const dz = playerPos.z - center.z;
            const dist2 = dx * dx + dz * dz;

            const triggerRadius = 28;
            if (dist2 <= triggerRadius * triggerRadius) {
                this._winGame();
                return;
            }
        }

        this._thirdPersonCamera.Update(dt);
    }
}

let _APP = null;
window.addEventListener('DOMContentLoaded', () => { _APP = new ThirdPersonCameraDemo(); });
