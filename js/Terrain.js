import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/**
 * BackroomsMaze - 3 rooms in a line with proper shared walls and door openings
 * Rules:
 *  - A cell builds only its North and West walls. South and East are built by neighbors.
 *  - If two adjacent cells connect, we create a doorway cutout (three segments).
 *  - No duplicated wall meshes, so no z-fighting glitches.
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

        // Textures
        const carpetColor = loader.load(`${texBase}backrooms-carpet-diffuse.png`);
        const carpetNormal = loader.load(`${texBase}backrooms-carpet-normal.png`);

        const wallColor = loader.load(`${texBase}backrooms-wall-diffuse.png`);
        const wallNormal = loader.load(`${texBase}backrooms-wall-normal.png`);

        const ceilLightColor = loader.load(`${texBase}backrooms-ceiling-light-diffuse.png`);
        const ceilLightNormal = loader.load(`${texBase}backrooms-ceiling-light-normal.png`);
        const ceilLightRough = loader.load(`${texBase}backrooms-ceiling-light-roughness.png`);
        const ceilLightEmiss = loader.load(`${texBase}backrooms-ceiling-light-emission.png`);

        const ceilTileColor = loader.load(`${texBase}backrooms-ceiling-tile-diffuse.png`);
        const ceilTileNormal = loader.load(`${texBase}backrooms-ceiling-tile-normal.png`);
        const ceilTileRough = loader.load(`${texBase}backrooms-ceiling-tile-roughness.png`);

        // Texture repeats
        const BASE_REPEAT = 20;
        const WALL_REPEAT = 4;
        const TILE_REPEAT = 12;
        const LIGHT_REPEAT = 6;

        for (const t of [carpetColor, carpetNormal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(BASE_REPEAT, BASE_REPEAT); }
        for (const t of [wallColor, wallNormal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(WALL_REPEAT, WALL_REPEAT); }
        for (const t of [ceilTileColor, ceilTileNormal, ceilTileRough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(TILE_REPEAT, TILE_REPEAT); }
        for (const t of [ceilLightColor, ceilLightNormal, ceilLightRough, ceilLightEmiss]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(LIGHT_REPEAT, LIGHT_REPEAT); }

        // Room constants
        const ROOM_SIZE = 300;
        const ROOM_HEIGHT = 40;
        const WALL_THICK = 2;
        const PILLAR_SIZE = 20;
        const PILLAR_INSET = 100;
        const CENTER_LIGHT_SIZE = 30;

        // Door constants
        const DOOR_WIDTH = 80;
        const DOOR_HEIGHT = 25;
        const DOOR_LINTEL = ROOM_HEIGHT - DOOR_HEIGHT; // lintel height from floor to bottom of lintel

        const group = new THREE.Group();

        // Materials
        const floorMat = new THREE.MeshStandardMaterial({
            map: carpetColor, normalMap: carpetNormal, roughness: 1.0, metalness: 0.0
        });
        const wallMat = new THREE.MeshStandardMaterial({
            map: wallColor, normalMap: wallNormal, roughness: 0.9, metalness: 0.0
        });
        const ceilTileMat = new THREE.MeshStandardMaterial({
            map: ceilTileColor, normalMap: ceilTileNormal, roughnessMap: ceilTileRough, metalness: 0.0
        });
        const ceilLightMat = new THREE.MeshStandardMaterial({
            map: ceilLightColor, normalMap: ceilLightNormal, roughnessMap: ceilLightRough,
            emissiveMap: ceilLightEmiss, emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.35, metalness: 0.0, side: THREE.DoubleSide
        });
        const pillarMat = new THREE.MeshStandardMaterial({
            map: wallColor, normalMap: wallNormal, roughness: 0.8, metalness: 0.0
        });

        // Helper to build a full wall slab (no door)
        const makeFullWall = (length, height, thickness, mat) => {
            return new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), mat);
        };

        // Helper to build a wall with a centered doorway
        // We build: left segment, right segment, top lintel
        const addWallWithDoor = (parent, isHorizontal, roomCenter, mat) => {
            const half = ROOM_SIZE / 2;
            const halfDoor = DOOR_WIDTH / 2;

            const segThickness = WALL_THICK;
            const yCenter = ROOM_HEIGHT / 2;

            // Horizontal wall along X, facing North or South
            if (isHorizontal) {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                // Left jamb segment
                const left = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                left.position.set(roomCenter.x - (half - sideLen / 2), yCenter, roomCenter.z);
                left.rotation.y = 0; // along X, thickness in Z
                parent.add(left);

                // Right jamb segment
                const right = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                right.position.set(roomCenter.x + (half - sideLen / 2), yCenter, roomCenter.z);
                parent.add(right);

                // Lintel segment above door
                const lintelHeight = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintel = makeFullWall(DOOR_WIDTH, lintelHeight, segThickness, mat);
                lintel.position.set(roomCenter.x, DOOR_HEIGHT + lintelHeight / 2, roomCenter.z);
                parent.add(lintel);
            } else {
                // Vertical wall along Z, facing East or West
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const left = makeFullWall(segThickness, ROOM_HEIGHT, sideLen, mat);
                left.position.set(roomCenter.x, yCenter, roomCenter.z - (half - sideLen / 2));
                left.rotation.y = 0;
                parent.add(left);

                const right = makeFullWall(segThickness, ROOM_HEIGHT, sideLen, mat);
                right.position.set(roomCenter.x, yCenter, roomCenter.z + (half - sideLen / 2));
                parent.add(right);

                const lintelHeight = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintel = makeFullWall(segThickness, lintelHeight, DOOR_WIDTH, mat);
                lintel.position.set(roomCenter.x, DOOR_HEIGHT + lintelHeight / 2, roomCenter.z);
                parent.add(lintel);
            }
        };

        // Build one room contents except boundary walls
        const buildRoomShell = (parent, cx, cz) => {
            // Floor
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(cx, 0, cz);
            floor.receiveShadow = true;
            parent.add(floor);

            // Ceiling tiles
            const ceilingTiles = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilTileMat);
            ceilingTiles.rotation.x = Math.PI / 2;
            ceilingTiles.position.set(cx, ROOM_HEIGHT, cz);
            parent.add(ceilingTiles);

            // Central light panel
            const ceilingLight = new THREE.Mesh(new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE), ceilLightMat);
            ceilingLight.rotation.x = Math.PI / 2;
            ceilingLight.position.set(cx, ROOM_HEIGHT - 0.01, cz);
            parent.add(ceilingLight);

            // Pillars
            const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, ROOM_HEIGHT, PILLAR_SIZE);
            const px = cx + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nx = cx - (ROOM_SIZE / 2 - PILLAR_INSET);
            const pz = cz + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nz = cz - (ROOM_SIZE / 2 - PILLAR_INSET);

            for (const [x, y, z] of [
                [px, ROOM_HEIGHT / 2, pz],
                [nx, ROOM_HEIGHT / 2, pz],
                [px, ROOM_HEIGHT / 2, nz],
                [nx, ROOM_HEIGHT / 2, nz],
            ]) {
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.set(x, y, z);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                parent.add(pillar);
            }

            // Ambient and a central bulb per room
            const ambient = new THREE.AmbientLight(0xfcee65, 0.2);
            ambient.position.set(cx, ROOM_HEIGHT, cz);
            parent.add(ambient);

            const bulb = new THREE.PointLight(0xfcee65, 1.0, ROOM_SIZE * 1.2, 2.0);
            bulb.position.set(cx, ROOM_HEIGHT - 1.5, cz);
            bulb.castShadow = true;
            bulb.shadow.mapSize.set(1024, 1024);
            bulb.shadow.bias = -0.0005;
            parent.add(bulb);
        };

        // Grid for 3 rooms in a line: indices 0,1,2 on X
        const N = 3;
        const cells = [];
        for (let i = 0; i < N; i++) {
            const cx = (i - Math.floor(N / 2)) * ROOM_SIZE; // center them around origin
            const cz = 0;
            cells.push({ i, j: 0, cx, cz });
        }

        // Connectivity for a simple corridor:
        // room 0 connected to room 1, room 1 connected to room 2
        // We store openings as booleans on E, W, N, S
        const openings = new Map(); // key "i,j" -> {N,S,E,W}
        const key = (i, j) => `${i},${j}`;

        for (const c of cells) openings.set(key(c.i, c.j), { N: false, S: false, E: false, W: false });
        for (let i = 0; i < N; i++) {
            if (i < N - 1) {
                openings.get(key(i, 0)).E = true;       // open east from room i to i+1
                openings.get(key(i + 1, 0)).W = true;   // open west from room i+1 to i
            }
        }

        // Build shells first
        for (const c of cells) buildRoomShell(group, c.cx, c.cz);

        // Build boundary walls per cell using the owner rule
        // Each cell builds North and West walls
        for (const c of cells) {
            const o = openings.get(key(c.i, c.j));

            // North wall - centered at z = cz + ROOM_SIZE/2, along X
            {
                const wallZ = c.cz + ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                const hasNeighborNorth = false; // 1×N line, no neighbor on N
                const open = false; // do not open outer boundary
                if (open) {
                    addWallWithDoor(group, true, center, wallMat);
                } else {
                    const northWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                    northWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(northWall);
                }
            }

            // West wall - centered at x = cx - ROOM_SIZE/2, along Z
            {
                const wallX = c.cx - ROOM_SIZE / 2;
                const center = new THREE.Vector3(wallX, 0, c.cz);
                // If there is a neighbor to the West, this cell should still own West.
                const hasNeighborWest = cells.some(k => k.i === c.i - 1 && k.j === c.j);
                const open = hasNeighborWest ? o.W : false; // open only if neighbor exists
                if (open) {
                    addWallWithDoor(group, false, center, wallMat);
                } else {
                    const westWall = makeFullWall(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE, wallMat);
                    westWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(westWall);
                }
            }
        }

        // Now add the South and East walls for the outer boundary only
        // They belong to boundary cells by our owner rule, but we must close the maze edges
        // South: only build once for any cell that has no neighbor South and did not already own it
        // East: only build once for any cell that has no neighbor East and did not already own it
        for (const c of cells) {
            const o = openings.get(key(c.i, c.j));

            // South boundary - only on last row, which we always are
            {
                const wallZ = c.cz - ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                // South is outer boundary in this layout
                const southWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                southWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                group.add(southWall);
            }

            // East boundary - only if no neighbor to the East
            {
                const hasNeighborEast = cells.some(k => k.i === c.i + 1 && k.j === c.j);
                if (!hasNeighborEast) {
                    const wallX = c.cx + ROOM_SIZE / 2;
                    const center = new THREE.Vector3(wallX, 0, c.cz);
                    // Outer boundary must be closed, even if o.E was true in some other layout
                    const eastWall = makeFullWall(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE, wallMat);
                    eastWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(eastWall);
                } else {
                    // If there is a neighbor East, and we want an opening, the owner is the left cell for the shared North and West rule.
                    // Our rule already handled that by having the left cell not build East at all.
                    // We still need the doorway on the shared boundary. The doorway is created by the left cell's East opening handled via its neighbor's West build.
                    // In our implementation, West walls are built by each cell as owner. We opened West above if openings said so.
                    // Nothing to do here.
                }
            }
        }

        this._group = group;
        this._scene.add(this._group);
    }

    getMesh() { return this._group; }
    Update(timeElapsed) { }
    getHeightAt(x, z) { return 0; }
}

export { Terrain };
