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

        this.spawn = null;      // THREE.Vector3
        this._rooms = [];       // [{i,j,cx,cz}]
        this._colliders = [];   // [{minX,maxX,minZ,maxZ}]

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

        // Dimensions
        const ROOM_SIZE = 300;
        const ROOM_HEIGHT = 40;
        const WALL_THICK = 2;
        const PILLAR_SIZE = 20;
        const PILLAR_INSET = 100;
        const CENTER_LIGHT_SIZE = 30;

        const DOOR_WIDTH = 80;
        const DOOR_HEIGHT = 25;

        const group = new THREE.Group();

        // Lights
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

        // Shared geos
        const GEO_FLOOR = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_CEILING = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_LIGHT = new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE);

        // Collider utils
        const addRectCollider = (minX, maxX, minZ, maxZ) => {
            this._colliders.push({ minX, maxX, minZ, maxZ });
        };

        // Wall helper with explicit X (width) and Z (depth) sizes
        const createWallXZ = (sizeX, height, sizeZ, mat, center, registerCollider = true) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, height, sizeZ), mat);
            mesh.position.copy(center);
            if (registerCollider) {
                const cx = center.x, cz = center.z;
                addRectCollider(cx - sizeX * 0.5, cx + sizeX * 0.5, cz - sizeZ * 0.5, cz + sizeZ * 0.5);
            }
            return mesh;
        };

        const freeze = (mesh) => {
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
        };

        // Door builder
        const addWallWithDoor = (parent, isHorizontal, roomCenterXZ, mat) => {
            const half = ROOM_SIZE / 2;
            const yCenter = ROOM_HEIGHT / 2;
            const segThickness = WALL_THICK;

            if (isHorizontal) {
                // along X, thin Z
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const leftC = new THREE.Vector3(roomCenterXZ.x - (half - sideLen / 2), yCenter, roomCenterXZ.z);
                const rightC = new THREE.Vector3(roomCenterXZ.x + (half - sideLen / 2), yCenter, roomCenterXZ.z);

                const left = createWallXZ(sideLen, ROOM_HEIGHT, segThickness, mat, leftC, true);
                const right = createWallXZ(sideLen, ROOM_HEIGHT, segThickness, mat, rightC, true);
                parent.add(left); freeze(left);
                parent.add(right); freeze(right);

                // lintel (no collider)
                const lintelH = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintelC = new THREE.Vector3(roomCenterXZ.x, DOOR_HEIGHT + lintelH / 2, roomCenterXZ.z);
                const lintel = createWallXZ(DOOR_WIDTH, lintelH, segThickness, mat, lintelC, false);
                parent.add(lintel); freeze(lintel);
            } else {
                // along Z, thin X
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const leftC = new THREE.Vector3(roomCenterXZ.x, yCenter, roomCenterXZ.z - (half - sideLen / 2));
                const rightC = new THREE.Vector3(roomCenterXZ.x, yCenter, roomCenterXZ.z + (half - sideLen / 2));

                const left = createWallXZ(segThickness, ROOM_HEIGHT, sideLen, mat, leftC, true);
                const right = createWallXZ(segThickness, ROOM_HEIGHT, sideLen, mat, rightC, true);
                parent.add(left); freeze(left);
                parent.add(right); freeze(right);

                const lintelH = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintelC = new THREE.Vector3(roomCenterXZ.x, DOOR_HEIGHT + lintelH / 2, roomCenterXZ.z);
                const lintel = createWallXZ(segThickness, lintelH, DOOR_WIDTH, mat, lintelC, false);
                parent.add(lintel); freeze(lintel);
            }
        };

        // ---------- Maze generation ----------
        const targetRooms = this._nRooms;
        let rows = Math.floor(Math.sqrt(targetRooms));
        if (rows < 1) rows = 1;
        let cols = Math.ceil(targetRooms / rows);

        const DIRS = {
            N: { di: 0, dj: 1, opposite: 'S' },
            S: { di: 0, dj: -1, opposite: 'N' },
            E: { di: 1, dj: 0, opposite: 'W' },
            W: { di: -1, dj: 0, opposite: 'E' },
        };
        const dirKeys = ['N', 'S', 'E', 'W'];

        const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
        const idx = (i, j) => j * cols + i;
        const inBounds = (i, j) => i >= 0 && i < cols && j >= 0 && j < rows;

        const gridOpen = Array.from({ length: cols * rows }, () => ({ N: false, S: false, E: false, W: false }));
        const visited = Array.from({ length: cols * rows }, () => false);
        const visitOrder = [];

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

        const builtCells = visitOrder.slice(0, targetRooms);

        // center cluster
        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (const c of builtCells) { if (c.i < minI) minI = c.i; if (c.i > maxI) maxI = c.i; if (c.j < minJ) minJ = c.j; if (c.j > maxJ) maxJ = c.j; }
        const midI = (minI + maxI) / 2, midJ = (minJ + maxJ) / 2;
        for (const c of builtCells) {
            c.cx = (c.i - midI) * ROOM_SIZE;
            c.cz = (c.j - midJ) * ROOM_SIZE;
        }

        // spawn + rooms
        this._rooms = builtCells.map(r => ({ i: r.i, j: r.j, cx: r.cx, cz: r.cz }));
        this.spawn = this._rooms.length ? new THREE.Vector3(this._rooms[0].cx, 0, this._rooms[0].cz)
            : new THREE.Vector3(0, 0, 0);

        // shells
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

        const key = (i, j) => `${i},${j}`;
        const builtSet = new Set(builtCells.map(c => key(c.i, c.j)));
        const openings = new Map();
        for (const c of builtCells) openings.set(key(c.i, c.j), { N: false, S: false, E: false, W: false });
        for (const c of builtCells) {
            const o = gridOpen[idx(c.i, c.j)];
            for (const d of dirKeys) {
                const ni = c.i + DIRS[d].di, nj = c.j + DIRS[d].dj;
                if (!o[d]) continue;
                if (!builtSet.has(key(ni, nj))) continue;
                openings.get(key(c.i, c.j))[d] = true;
            }
        }

        for (const c of builtCells) buildRoomShell(group, c.cx, c.cz);

        // pillars + colliders
        const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, ROOM_HEIGHT, PILLAR_SIZE);
        const pillarsPerRoom = 4;
        const instancedPillars = new THREE.InstancedMesh(pillarGeo, pillarMat, builtCells.length * pillarsPerRoom);
        instancedPillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        let pIdx = 0;
        const m4 = new THREE.Matrix4();
        for (const c of builtCells) {
            const px = c.cx + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nx = c.cx - (ROOM_SIZE / 2 - PILLAR_INSET);
            const pz = c.cz + (ROOM_SIZE / 2 - PILLAR_INSET);
            const nz = c.cz - (ROOM_SIZE / 2 - PILLAR_INSET);
            const y = ROOM_HEIGHT / 2;
            for (const [x, z] of [[px, pz], [nx, pz], [px, nz], [nx, nz]]) {
                m4.makeTranslation(x, y, z);
                instancedPillars.setMatrixAt(pIdx++, m4);
                // pillar collider square
                const half = PILLAR_SIZE * 0.5;
                addRectCollider(x - half, x + half, z - half, z + half);
            }
        }
        instancedPillars.instanceMatrix.needsUpdate = true;
        group.add(instancedPillars);

        const hasNeighbor = (i, j) => builtSet.has(key(i, j));

        // walls with door openings
        for (const c of builtCells) {
            const o = openings.get(key(c.i, c.j));

            // North edge — spans along X at z + half
            {
                const wallZ = c.cz + ROOM_SIZE / 2;
                if (o.N) {
                    addWallWithDoor(group, true, new THREE.Vector3(c.cx, 0, wallZ), wallMat);
                } else {
                    const center = new THREE.Vector3(c.cx, ROOM_HEIGHT / 2, wallZ);
                    const north = createWallXZ(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat, center, true);
                    group.add(north); freeze(north);
                }
            }

            // West edge — spans along Z at x - half
            {
                const wallX = c.cx - ROOM_SIZE / 2;
                const open = hasNeighbor(c.i - 1, c.j) ? o.W : false;
                if (open) {
                    addWallWithDoor(group, false, new THREE.Vector3(wallX, 0, c.cz), wallMat);
                } else {
                    const center = new THREE.Vector3(wallX, ROOM_HEIGHT / 2, c.cz);
                    const west = createWallXZ(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE, wallMat, center, true);
                    group.add(west); freeze(west);
                }
            }
        }

        // close outer South and East boundaries
        for (const c of builtCells) {
            if (!hasNeighbor(c.i, c.j - 1)) {
                const wallZ = c.cz - ROOM_SIZE / 2;
                const center = new THREE.Vector3(c.cx, ROOM_HEIGHT / 2, wallZ);
                const south = createWallXZ(ROOM_SIZE, ROOM_HEIGHT, WALL_THICK, wallMat, center, true);
                group.add(south); freeze(south);
            }
            if (!hasNeighbor(c.i + 1, c.j)) {
                const wallX = c.cx + ROOM_SIZE / 2;
                const center = new THREE.Vector3(wallX, ROOM_HEIGHT / 2, c.cz);
                const east = createWallXZ(WALL_THICK, ROOM_HEIGHT, ROOM_SIZE, wallMat, center, true);
                group.add(east); freeze(east);
            }
        }

        this._group = group;
        this._scene.add(this._group);
    }

    getMesh() { return this._group; }
    getFirstRoomCenter() { return this.spawn ? this.spawn.clone() : new THREE.Vector3(0, 0, 0); }
    getRoomCenters() { return this._rooms.map(r => ({ cx: r.cx, cz: r.cz })); }
    getColliders() { return this._colliders; }

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
