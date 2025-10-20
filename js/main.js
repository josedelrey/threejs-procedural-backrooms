// Main file
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { BasicCharacterController } from './CharacterController.js';
import { ThirdPersonCamera } from './Camera.js';
import { Terrain } from './Terrain.js';
import { EnemyController } from './EnemyController.js';

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

        // terrain + spawn
        this._terrain = new Terrain(this._scene);
        this._spawn = this._terrain.getFirstRoomCenter();

        // camera start
        this._camera.position.set(this._spawn.x, this._spawn.y + 20, this._spawn.z + 50);
        this._camera.lookAt(this._spawn);

        this._mixers = [];
        this._previousRAF = null;

        this._LoadPlayer();
        this._SpawnEnemy();   // <— here

        this._RAF();
    }

    _LoadPlayer() {
        const params = {
            camera: this._camera,
            scene: this._scene,
            startPosition: this._spawn.clone(),
            colliders: this._terrain.getColliders(),
            getHeightAt: (x, z) => this._terrain.getHeightAt(x, z),
        };
        this._controls = new BasicCharacterController(params);

        this._thirdPersonCamera = new ThirdPersonCamera({
            camera: this._camera,
            target: this._controls,
        });
    }

    _SpawnEnemy() {
        const enemyPos = this._terrain.getRoomCenterAtSteps(3); // exactly 3 rooms away
        enemyPos.y = 0;

        this._enemy = new EnemyController({
            scene: this._scene,
            startPosition: enemyPos,
            colliders: this._terrain.getColliders(),
            radius: 8,
            targetRadius: 5,        // match your player collider
            aggroRange: 450,
            attackMargin: 1.0,
            getTargetPosition: () => this._controls?._target?.position.clone() ?? this._camera.position.clone(),
            fbxPath: './resources/enemy/',
            modelFile: 'enemy.fbx',
            idleFile: 'idle.fbx',
            walkFile: 'walk.fbx',
            runFile: 'run.fbx',     // optional
            attackFile: 'attack.fbx', // optional
            scale: 0.13
        });
    }


    _OnWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._threejs.setSize(window.innerWidth, window.innerHeight);
    }

    _RAF() {
        requestAnimationFrame((t) => {
            if (this._previousRAF === null) this._previousRAF = t;
            this._RAF();
            this._threejs.render(this._scene, this._camera);
            this._Step(t - this._previousRAF);
            this._previousRAF = t;
        });
    }

    _Step(timeElapsed) {
        const dt = timeElapsed * 0.001;

        if (this._mixers) this._mixers.forEach(m => m.update(dt));
        if (this._controls) this._controls.Update(dt);
        if (this._terrain) this._terrain.Update(dt);

        // enemy tick
        if (this._enemy) this._enemy.Update(dt);

        this._thirdPersonCamera.Update(dt);
    }
}

let _APP = null;
window.addEventListener('DOMContentLoaded', () => { _APP = new ThirdPersonCameraDemo(); });
