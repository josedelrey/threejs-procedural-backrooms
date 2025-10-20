import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/**
 * BackroomsMaze - perfect maze carved with randomized DFS.
 */
class Terrain {
    constructor(scene, params = {}) {
        this._scene = scene;
        this._group = null;
        this._nRooms = Number.isInteger(params.nRooms) && params.nRooms > 0 ? params.nRooms : 12;
        this._sun = null;
        this._ceilLightMat = null;

        // new: spawn and room list
        this.spawn = null;     // THREE.Vector3 once computed
        this._rooms = [];      // [{i, j, cx, cz}, ...]

        this._Init();
    }

    _Init() {
        const loader = new THREE.TextureLoader();
        const texBase = 'resources/textures/';

        // Textures
        const carpetColor = loader.load(`${texBase}backrooms-carpet-diffuse.png`);
        const carpetNormal = loader.load(`${texBase}backrooms-carpet-normal.png`);
        const wallColor = loader.load(`${texBase}backrooms-wall-diffuse.png`);
        const ceilLightCol = loader.load(`${texBase}backrooms-ceiling-light-diffuse.png`);
        const ceilTileColor = loader.load(`${texBase}backrooms-ceiling-tile-diffuse.png`);

        for (const t of [carpetColor, carpetNormal, wallColor, ceilLightCol, ceilTileColor]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.generateMipmaps = true;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
        }

        // Repeats
        const BASE_REPEAT = 20;
        const WALL_REPEAT = 4;
        const TILE_REPEAT = 12;
        const LIGHT_REPEAT = 6;

        carpetColor.repeat.set(BASE_REPEAT, BASE_REPEAT);
        carpetNormal.repeat.set(BASE_REPEAT, BASE_REPEAT);
        wallColor.repeat.set(WALL_REPEAT, WALL_REPEAT);
        ceilTileColor.repeat.set(TILE_REPEAT, TILE_REPEAT);
        ceilLightCol.repeat.set(LIGHT_REPEAT, LIGHT_REPEAT);

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

        // Lighting
        const hemi = new THREE.HemisphereLight(0xf6f3cc, 0x2b2b1e, 0.7);
        group.add(hemi);

        const sun = new THREE.DirectionalLight(0xfff6d0, 0.35);
        sun.position.set(1, 2, 1).multiplyScalar(500);
        sun.castShadow = false;
        group.add(sun);
        this._sun = sun;

        // Materials
        const floorMat = new THREE.MeshStandardMaterial({
            map: carpetColor,
            normalMap: carpetNormal,
            normalScale: new THREE.Vector2(1.25, 1.25),
            roughness: 0.95,
            metalness: 0.0,
        });

        const wallMat = new THREE.MeshLambertMaterial({ map: wallColor });
        const ceilTileMat = new THREE.MeshLambertMaterial({ map: ceilTileColor });
        const ceilLightMat = new THREE.MeshBasicMaterial({ map: ceilLightCol, side: THREE.DoubleSide });
        this._ceilLightMat = ceilLightMat;

        const pillarMat = new THREE.MeshLambertMaterial({ map: wallColor });

        // Shared geometries
        const GEO_FLOOR = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_CEILING = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_LIGHT = new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE);

        // Helpers
        const makeFullWall = (length, height, thickness, mat) =>
            new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), mat);

        const freeze = (mesh) => {
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
        };

        const addWallWithDoor = (parent, isHorizontal, roomCenter, mat) => {
            const half = ROOM_SIZE / 2;
            const yCenter = ROOM_HEIGHT / 2;
            const segThickness = WALL_THICK;

            if (isHorizontal) {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const left = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                left.position.set(roomCenter.x - (half - sideLen / 2), yCenter, roomCenter.z);
                parent.add(left); freeze(left);

                const right = makeFullWall(sideLen, ROOM_HEIGHT, segThickness, mat);
                right.position.set(roomCenter.x + (half - sideLen / 2), yCenter, roomCenter.z);
                parent.add(right); freeze(right);

                const lintelHeight = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintel = makeFullWall(DOOR_WIDTH, lintelHeight, segThickness, mat);
                lintel.position.set(roomCenter.x, DOOR_HEIGHT + lintelHeight / 2, roomCenter.z);
                parent.add(lintel); freeze(lintel);
            } else {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const left = makeFullWall(segThickness, ROOM_HEIGHT, sideLen, mat);
                left.position.set(roomCenter.x, yCenter, roomCenter.z - (half - sideLen / 2));
                parent.add(left); freeze(left);

                const right = makeFullWall(segThickness, ROOM_HEIGHT, sideLen, mat);
                right.position.set(roomCenter.x, yCenter, roomCenter.z + (half - sideLen / 2));
                parent.add(right); freeze(right);

                const lintelHeight = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintel = makeFullWall(segThickness, lintelHeight, DOOR_WIDTH, mat);
                lintel.position.set(roomCenter.x, DOOR_HEIGHT + lintelHeight / 2, roomCenter.z);
                parent.add(lintel); freeze(lintel);
            }
        };

        // Maze generation with randomized DFS

        // Choose a compact grid that fits at least n rooms
        const targetRooms = this._nRooms;
        let rows = Math.floor(Math.sqrt(targetRooms));
        if (rows < 1) rows = 1;
        let cols = Math.ceil(targetRooms / rows);

        // Direction helpers
        const DIRS = {
            N: { di: 0, dj: 1, opposite: 'S' },
            S: { di: 0, dj: -1, opposite: 'N' },
            E: { di: 1, dj: 0, opposite: 'W' },
            W: { di: -1, dj: 0, opposite: 'E' },
        };
        const dirKeys = ['N', 'S', 'E', 'W'];

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        const idx = (i, j) => j * cols + i;
        const inBounds = (i, j) => i >= 0 && i < cols && j >= 0 && j < rows;

        // Openings for every cell in the full grid
        const gridOpen = Array.from({ length: cols * rows }, () => ({ N: false, S: false, E: false, W: false }));
        const visited = Array.from({ length: cols * rows }, () => false);
        const visitOrder = [];

        // DFS stack
        const startI = 0, startJ = 0;
        const stack = [{ i: startI, j: startJ }];
        visited[idx(startI, startJ)] = true;
        visitOrder.push({ i: startI, j: startJ });

        while (stack.length) {
            const top = stack[stack.length - 1];
            const options = shuffle(dirKeys.slice());
            let advanced = false;

            for (const d of options) {
                const ni = top.i + DIRS[d].di;
                const nj = top.j + DIRS[d].dj;
                if (!inBounds(ni, nj)) continue;
                const nIndex = idx(ni, nj);
                if (visited[nIndex]) continue;

                // Carve passage both ways
                gridOpen[idx(top.i, top.j)][d] = true;
                gridOpen[nIndex][DIRS[d].opposite] = true;

                visited[nIndex] = true;
                stack.push({ i: ni, j: nj });
                visitOrder.push({ i: ni, j: nj });
                advanced = true;
                break;
            }
            if (!advanced) stack.pop();
        }

        // Take only the first targetRooms cells to build
        const builtCells = visitOrder.slice(0, targetRooms);

        // Center cluster
        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (const c of builtCells) {
            if (c.i < minI) minI = c.i;
            if (c.i > maxI) maxI = c.i;
            if (c.j < minJ) minJ = c.j;
            if (c.j > maxJ) maxJ = c.j;
        }
        const midI = (minI + maxI) / 2;
        const midJ = (minJ + maxJ) / 2;
        for (const c of builtCells) {
            c.cx = (c.i - midI) * ROOM_SIZE;
            c.cz = (c.j - midJ) * ROOM_SIZE;
        }

        // new: remember rooms and compute spawn from the first room
        this._rooms = builtCells.map(r => ({ i: r.i, j: r.j, cx: r.cx, cz: r.cz }));
        if (this._rooms.length > 0) {
            const first = this._rooms[0];
            const spawnY = 0; // eye height above floor
            this.spawn = new THREE.Vector3(first.cx, spawnY, first.cz);
        } else {
            this.spawn = new THREE.Vector3(0, 5, 0);
        }

        // Build shells for each room
        const buildRoomShell = (parent, cx, cz) => {
            const floor = new THREE.Mesh(GEO_FLOOR, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(cx, 0, cz);
            parent.add(floor); freeze(floor);

            const ceilingTiles = new THREE.Mesh(GEO_CEILING, ceilTileMat);
            ceilingTiles.rotation.x = Math.PI / 2;
            ceilingTiles.position.set(cx, ROOM_HEIGHT, cz);
            parent.add(ceilingTiles); freeze(ceilingTiles);

            const ceilingLight = new THREE.Mesh(GEO_LIGHT, ceilLightMat);
            ceilingLight.rotation.x = Math.PI / 2;
            ceilingLight.position.set(cx, ROOM_HEIGHT - 0.01, cz);
            parent.add(ceilingLight); freeze(ceilingLight);
        };

        // Opening map restricted to built cells only
        const key = (i, j) => `${i},${j}`;
        const builtSet = new Set(builtCells.map(c => key(c.i, c.j)));
        const openings = new Map();
        for (const c of builtCells) {
            openings.set(key(c.i, c.j), { N: false, S: false, E: false, W: false });
        }
        for (const c of builtCells) {
            const o = gridOpen[idx(c.i, c.j)];
            for (const d of dirKeys) {
                const ni = c.i + DIRS[d].di;
                const nj = c.j + DIRS[d].dj;
                if (!o[d]) continue;
                if (!builtSet.has(key(ni, nj))) continue;
                openings.get(key(c.i, c.j))[d] = true;
            }
        }

        // Build shells first
        for (const c of builtCells) buildRoomShell(group, c.cx, c.cz);

        // Instanced pillars
        const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, ROOM_HEIGHT, PILLAR_SIZE);
        const pillarsPerRoom = 4;
        const instancedPillars = new THREE.InstancedMesh(
            pillarGeo, pillarMat, builtCells.length * pillarsPerRoom
        );
        instancedPillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        let pillarInstanceIndex = 0;
        const m4 = new THREE.Matrix4();
        for (const c of builtCells) {
            const px = c.cx + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nx = c.cx - (ROOM_SIZE / 2 - PILLAR_INSET);
            const pz = c.cz + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nz = c.cz - (ROOM_SIZE / 2 - PILLAR_INSET);
            const y = ROOM_HEIGHT / 2;
            for (const [x, z] of [[px, pz], [nx, pz], [px, nz], [nx, nz]]) {
                m4.makeTranslation(x, y, z);
                instancedPillars.setMatrixAt(pillarInstanceIndex++, m4);
            }
        }
        instancedPillars.instanceMatrix.needsUpdate = true;
        group.add(instancedPillars);

        // Neighbor lookup
        const hasNeighbor = (i, j) => builtSet.has(key(i, j));

        // Walls with door openings
        for (const c of builtCells) {
            const o = openings.get(key(c.i, c.j));

            // North wall
            {
                const wallZ = c.cz + ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                if (o.N) {
                    addWallWithDoor(group, true, center, wallMat);
                } else {
                    const northWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                    northWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                    group.add(northWall); freeze(northWall);
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
                    group.add(westWall); freeze(westWall);
                }
            }
        }

        // Close outer South and East boundaries
        for (const c of builtCells) {
            if (!hasNeighbor(c.i, c.j - 1)) {
                const wallZ = c.cz - ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, 0, wallZ);
                const southWall = makeFullWall(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat);
                southWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                group.add(southWall); freeze(southWall);
            }
            if (!hasNeighbor(c.i + 1, c.j)) {
                const wallX = c.cx + ROOM_SIZE / 2;
                const center = new THREE.Vector3(wallX, 0, c.cz);
                const eastWall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE), wallMat);
                eastWall.position.set(center.x, ROOM_HEIGHT / 2, center.z);
                group.add(eastWall); freeze(eastWall);
            }
        }

        this._group = group;
        this._scene.add(this._group);
    }

    getMesh() { return this._group; }

    // New helpers
    getFirstRoomCenter() {
        // Returns a clone so callers can modify it safely
        return this.spawn ? this.spawn.clone() : new THREE.Vector3(0, 5, 0);
    }

    getRoomCenters() {
        // Returns shallow copies [{cx, cz}, ...]
        return this._rooms.map(r => ({ cx: r.cx, cz: r.cz }));
    }

    // Tiny fluorescent flicker
    Update(t) {
        if (this._ceilLightMat) {
            const f = 0.92 + 0.04 * Math.sin(t * 3.2) + 0.02 * Math.sin(t * 17.0) + 0.01 * Math.sin(t * 27.7);
            this._ceilLightMat.color.setScalar(Math.max(0.8, Math.min(1.1, f)));
        }
        if (this._sun) {
            this._sun.intensity = 0.33 + 0.02 * Math.sin(t * 0.35);
        }
    }

    getHeightAt(x, z) { return 0; }
}

export { Terrain };
