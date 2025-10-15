import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/**
 * Terrain class
 * Backrooms room with carpet floor, wall panels, tiled ceiling, and a central light panel
 * Lighting:
 *  - Ambient light with warm Backrooms tint
 *  - Point light just below the ceiling at the room center
 */
class Terrain {
    constructor(scene) {
        this._scene = scene;
        this._group = null;
        this._Init();
    }

    _Init() {
        const loader = new THREE.TextureLoader();
        const texBase = 'resources/textures/';

        // Floor
        const carpetColor = loader.load(`${texBase}backrooms-carpet-diffuse.png`);
        const carpetNormal = loader.load(`${texBase}backrooms-carpet-normal.png`);

        // Walls
        const wallColor = loader.load(`${texBase}backrooms-wall-diffuse.png`);
        const wallNormal = loader.load(`${texBase}backrooms-wall-normal.png`);

        // Ceiling light panel
        const ceilLightColor = loader.load(`${texBase}backrooms-ceiling-light-diffuse.png`);
        const ceilLightNormal = loader.load(`${texBase}backrooms-ceiling-light-normal.png`);
        const ceilLightRough = loader.load(`${texBase}backrooms-ceiling-light-roughness.png`);
        const ceilLightEmiss = loader.load(`${texBase}backrooms-ceiling-light-emission.png`);

        // Ceiling tiles
        const ceilTileColor = loader.load(`${texBase}backrooms-ceiling-tile-diffuse.png`);
        const ceilTileNormal = loader.load(`${texBase}backrooms-ceiling-tile-normal.png`);
        const ceilTileRough = loader.load(`${texBase}backrooms-ceiling-tile-roughness.png`);

        // Texture repeat
        const BASE_REPEAT = 20;  // floor
        const WALL_REPEAT = 4;   // walls
        const TILE_REPEAT = 12;  // ceiling tiles
        const LIGHT_REPEAT = 6;   // central light panel

        for (const t of [carpetColor, carpetNormal]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(BASE_REPEAT, BASE_REPEAT);
        }
        for (const t of [wallColor, wallNormal]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(WALL_REPEAT, WALL_REPEAT);
        }
        for (const t of [ceilTileColor, ceilTileNormal, ceilTileRough]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(TILE_REPEAT, TILE_REPEAT);
        }
        for (const t of [ceilLightColor, ceilLightNormal, ceilLightRough, ceilLightEmiss]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(LIGHT_REPEAT, LIGHT_REPEAT);
        }

        // Room sizes
        const ROOM_SIZE = 300;
        const ROOM_HEIGHT = 40;
        const WALL_THICK = 2;
        const PILLAR_SIZE = 20;
        const PILLAR_INSET = 100;
        const CENTER_LIGHT_SIZE = 30;

        const group = new THREE.Group();

        // Materials
        const floorMat = new THREE.MeshStandardMaterial({
            map: carpetColor,
            normalMap: carpetNormal,
            roughness: 1.0,
            metalness: 0.0,
        });

        const wallMat = new THREE.MeshStandardMaterial({
            map: wallColor,
            normalMap: wallNormal,
            roughness: 0.9,
            metalness: 0.0,
        });

        const ceilTileMat = new THREE.MeshStandardMaterial({
            map: ceilTileColor,
            normalMap: ceilTileNormal,
            roughnessMap: ceilTileRough,
            metalness: 0.0,
        });

        const ceilLightMat = new THREE.MeshStandardMaterial({
            map: ceilLightColor,
            normalMap: ceilLightNormal,
            roughnessMap: ceilLightRough,
            emissiveMap: ceilLightEmiss,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.35,     // let the point light do the heavy lifting
            metalness: 0.0,
            side: THREE.DoubleSide,
        });

        const pillarMat = new THREE.MeshStandardMaterial({
            map: wallColor,
            normalMap: wallNormal,
            roughness: 0.8,
            metalness: 0.0,
        });

        // Floor
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
            floorMat
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        group.add(floor);

        // Ceiling tiles
        const ceilingTiles = new THREE.Mesh(
            new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
            ceilTileMat
        );
        ceilingTiles.rotation.x = Math.PI / 2;
        ceilingTiles.position.y = ROOM_HEIGHT;
        group.add(ceilingTiles);

        // Central light panel
        const ceilingLight = new THREE.Mesh(
            new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE),
            ceilLightMat
        );
        ceilingLight.rotation.x = Math.PI / 2;
        ceilingLight.position.set(0, ROOM_HEIGHT - 0.01, 0); // slightly below tiles
        group.add(ceilingLight);

        // Walls
        const wallLongGeo = new THREE.BoxGeometry(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK);
        const wallShortGeo = new THREE.BoxGeometry(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE);

        const wallFront = new THREE.Mesh(wallLongGeo, wallMat);
        wallFront.position.set(0, ROOM_HEIGHT / 2, ROOM_SIZE / 2);

        const wallBack = new THREE.Mesh(wallLongGeo, wallMat);
        wallBack.position.set(0, ROOM_HEIGHT / 2, -ROOM_SIZE / 2);

        const wallLeft = new THREE.Mesh(wallShortGeo, wallMat);
        wallLeft.position.set(-ROOM_SIZE / 2, ROOM_HEIGHT / 2, 0);

        const wallRight = new THREE.Mesh(wallShortGeo, wallMat);
        wallRight.position.set(ROOM_SIZE / 2, ROOM_HEIGHT / 2, 0);

        group.add(wallFront, wallBack, wallLeft, wallRight);

        // Pillars
        const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, ROOM_HEIGHT, PILLAR_SIZE);
        const px = ROOM_SIZE / 2 - PILLAR_INSET;
        const pz = ROOM_SIZE / 2 - PILLAR_INSET;
        for (const [x, y, z] of [
            [+px, ROOM_HEIGHT / 2, +pz],
            [-px, ROOM_HEIGHT / 2, +pz],
            [+px, ROOM_HEIGHT / 2, -pz],
            [-px, ROOM_HEIGHT / 2, -pz],
        ]) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(x, y, z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            group.add(pillar);
        }

        // ==== Lighting ===========================================================
        // Warm ambient wash
        const ambient = new THREE.AmbientLight(0xfcee65, 0.2); // pale yellow-beige
        group.add(ambient);

        // Central bulb light just under the ceiling
        const bulb = new THREE.PointLight(0xfcee65, 1.0, ROOM_SIZE * 1.2, 2.0);
        bulb.position.set(0, ROOM_HEIGHT - 1.5, 0);
        bulb.castShadow = true;
        bulb.shadow.mapSize.set(1024, 1024);
        bulb.shadow.bias = -0.0005;
        group.add(bulb);

        // Optional: small invisible sphere to improve shadow stability (no render)
        // const bulbProxy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        // bulb.add(bulbProxy);

        this._group = group;
        this._scene.add(this._group);
    }

    getMesh() { return this._group; }
    Update(timeElapsed) { }
    getHeightAt(x, z) { return 0; }
}

export { Terrain };
