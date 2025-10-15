import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/**
 * BackroomsMaze - N rooms connected by a self avoiding path with spacing.
 * Rules:
 *  - A cell builds only its North and West walls. South and East are boundaries only.
 *  - If two adjacent cells connect, create a doorway with jambs and lintel.
 *  - No duplicated wall meshes.
 * Path:
 *  - Start at (0,0). First move chooses among {E, N, S}.
 *  - Each next move chooses among the three directions that are not the opposite of the previous step.
 *  - Additional constraint: the new room must not be adjacent to any already placed room
 *    except the parent room. That prevents accidental contact and cycles around doors.
 */
class Terrain {
    constructor(scene, params = {}) {
        this._scene = scene;
        this._group = null;
        this._nRooms = Number.isInteger(params.nRooms) && params.nRooms > 0 ? params.nRooms : 12;
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

        const group = new THREE.Group();

        // One global ambient to avoid brightness stacking
        const globalAmbient = new THREE.AmbientLight(0xfcee65, 0.15);
        group.add(globalAmbient);

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
            emissiveIntensity: 0.2, metalness: 0.0, side: THREE.DoubleSide
        });
        const pillarMat = new THREE.MeshStandardMaterial({
            map: wallColor, normalMap: wallNormal, roughness: 0.8, metalness: 0.0
        });

        // Geometry helpers
        const makeFullWall = (length, height, thickness, mat) =>
            new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), mat);

        const addWallWithDoor = (parent, isHorizontal, roomCenter, mat) => {
            const half = ROOM_SIZE / 2;
            const yCenter = ROOM_HEIGHT / 2;
            const segThickness = WALL_THICK;

            if (isHorizontal) {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const left = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                left.position.set(roomCenter.x - (half - sideLen / 2), yCenter, roomCenter.z);
                parent.add(left);

                const right = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                right.position.set(roomCenter.x + (half - sideLen / 2), yCenter, roomCenter.z);
                parent.add(right);

                const lintelHeight = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintel = makeFullWall(DOOR_WIDTH, lintelHeight, segThickness, mat);
                lintel.position.set(roomCenter.x, DOOR_HEIGHT + lintelHeight / 2, roomCenter.z);
                parent.add(lintel);
            } else {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const left = makeFullWall(segThickness, ROOM_HEIGHT, sideLen, mat);
                left.position.set(roomCenter.x, yCenter, roomCenter.z - (half - sideLen / 2));
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

        // Build one room shell
        const buildRoomShell = (parent, cx, cz) => {
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(cx, 0, cz);
            floor.receiveShadow = true;
            parent.add(floor);

            const ceilingTiles = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilTileMat);
            ceilingTiles.rotation.x = Math.PI / 2;
            ceilingTiles.position.set(cx, ROOM_HEIGHT, cz);
            parent.add(ceilingTiles);

            const ceilingLight = new THREE.Mesh(new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE), ceilLightMat);
            ceilingLight.rotation.x = Math.PI / 2;
            ceilingLight.position.set(cx, ROOM_HEIGHT - 0.01, cz);
            parent.add(ceilingLight);

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

            // Per room bulb only, softened to avoid stacking
            const bulb = new THREE.PointLight(0xfcee65, 0.6, ROOM_SIZE * 0.85, 2.0);
            bulb.position.set(cx, ROOM_HEIGHT - 1.5, cz);
            bulb.castShadow = true;
            bulb.shadow.mapSize.set(1024, 1024);
            bulb.shadow.bias = -0.0005;
            parent.add(bulb);
        };

        // Path generation
        const DIRS = {
            E: { di: 1, dj: 0, opposite: 'W' },
            N: { di: 0, dj: 1, opposite: 'S' },
            S: { di: 0, dj: -1, opposite: 'N' },
            W: { di: -1, dj: 0, opposite: 'E' },
        };

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        const targetLen = this._nRooms;
        const path = [];
        const used = new Set();
        const keyIJ = (i, j) => `${i},${j}`;

        // Quick neighbor key
        const kE = (i, j) => keyIJ(i + 1, j);
        const kW = (i, j) => keyIJ(i - 1, j);
        const kN = (i, j) => keyIJ(i, j + 1);
        const kS = (i, j) => keyIJ(i, j - 1);

        // Check that (ni, nj) does not touch any used cell except the parent (pi, pj)
        const isPlacementSafe = (ni, nj, pi, pj) => {
            const parentKey = pi === null ? null : keyIJ(pi, pj);
            const neighbors = [kE(ni, nj), kW(ni, nj), kN(ni, nj), kS(ni, nj)];
            for (const nb of neighbors) {
                if (used.has(nb) && nb !== parentKey) return false;
            }
            return true;
        };

        // Start at origin
        path.push({ i: 0, j: 0 });
        used.add(keyIJ(0, 0));

        // Decision stack for DFS
        const stack = [];
        stack.push({ i: 0, j: 0, prevDir: null, options: shuffle(['E', 'N', 'S'].slice()) });

        while (path.length < targetLen) {
            if (stack.length === 0) {
                console.warn('Failed to build full path. Built', path.length, 'rooms.');
                break;
            }
            const top = stack[stack.length - 1];

            let advanced = false;
            while (top.options.length > 0) {
                const d = top.options.pop();

                // Candidate neighbor
                const ni = top.i + DIRS[d].di;
                const nj = top.j + DIRS[d].dj;
                const k = keyIJ(ni, nj);

                // Reject if already used
                if (used.has(k)) continue;

                // Enforce spacing: do not allow touching any other used cell except the parent
                const parentI = top.i;
                const parentJ = top.j;
                if (!isPlacementSafe(ni, nj, parentI, parentJ)) continue;

                // Accept this step
                path.push({ i: ni, j: nj });
                used.add(k);

                // Next options: all four except the opposite of d -> three directions
                const nextOptions = ['E', 'N', 'S', 'W'].filter(dd => dd !== DIRS[d].opposite);
                stack.push({ i: ni, j: nj, prevDir: d, options: shuffle(nextOptions) });
                advanced = true;
                break;
            }

            if (!advanced) {
                // Backtrack
                stack.pop();
                if (path.length > 1) {
                    const last = path.pop();
                    used.delete(keyIJ(last.i, last.j));
                }
            }
        }

        // Map path to cells
        const cells = path.map(({ i, j }) => ({ i, j }));

        // Center cluster around origin
        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (const c of cells) {
            if (c.i < minI) minI = c.i;
            if (c.i > maxI) maxI = c.i;
            if (c.j < minJ) minJ = c.j;
            if (c.j > maxJ) maxJ = c.j;
        }
        const midI = (minI + maxI) / 2;
        const midJ = (minJ + maxJ) / 2;

        for (const c of cells) {
            c.cx = (c.i - midI) * ROOM_SIZE;
            c.cz = (c.j - midJ) * ROOM_SIZE;
        }

        // Openings by cell
        const openings = new Map();
        const getKey = (i, j) => `${i},${j}`;
        for (const c of cells) openings.set(getKey(c.i, c.j), { N: false, S: false, E: false, W: false });

        // Mark openings between consecutive rooms
        for (let idx = 0; idx < cells.length - 1; idx++) {
            const a = cells[idx];
            const b = cells[idx + 1];
            const di = b.i - a.i;
            const dj = b.j - a.j;

            if (di === 1 && dj === 0) {
                openings.get(getKey(b.i, b.j)).W = true;
                openings.get(getKey(a.i, a.j)).E = true;
            } else if (di === 0 && dj === 1) {
                openings.get(getKey(a.i, a.j)).N = true;
                openings.get(getKey(b.i, b.j)).S = true;
            } else if (di === 0 && dj === -1) {
                openings.get(getKey(b.i, b.j)).N = true;
                openings.get(getKey(a.i, a.j)).S = true;
            } else {
                console.warn('Non adjacent step in path', a, b);
            }
        }

        // Build shells
        for (const c of cells) buildRoomShell(group, c.cx, c.cz);

        // Neighbor lookup
        const cellSet = new Set(cells.map(c => getKey(c.i, c.j)));
        const hasNeighbor = (i, j) => cellSet.has(getKey(i, j));

        // Owner rule walls, with door openings
        for (const c of cells) {
            const o = openings.get(getKey(c.i, c.j));

            // North wall
            {
                const wallZ = c.cz + ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                if (o.N) {
                    addWallWithDoor(group, true, center, wallMat);
                } else {
                    const northWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                    northWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(northWall);
                }
            }

            // West wall
            {
                const wallX = c.cx - ROOM_SIZE / 2;
                const center = new THREE.Vector3(wallX, 0, c.cz);
                const open = hasNeighbor(c.i - 1, c.j) ? o.W : false;
                if (open) {
                    addWallWithDoor(group, false, center, wallMat);
                } else {
                    const westWall = makeFullWall(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE, wallMat);
                    westWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(westWall);
                }
            }
        }

        // Close outer South and East boundaries
        for (const c of cells) {
            if (!hasNeighbor(c.i, c.j - 1)) {
                const wallZ = c.cz - ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                const southWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                southWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                group.add(southWall);
            }
            if (!hasNeighbor(c.i + 1, c.j)) {
                const wallX = c.cx + ROOM_SIZE / 2;
                const center = new THREE.Vector3(wallX, 0, c.cz);
                const eastWall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE), wallMat);
                eastWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                group.add(eastWall);
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
