import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/** Terrain: DFS maze generation and portal system */
class Terrain {
    constructor(scene, params = {}) {
        this._scene = scene;
        this._group = null;
        this._nRooms = Number.isInteger(params.nRooms) && params.nRooms > 0 ? params.nRooms : 12;

        this.spawn = null;      // THREE.Vector3 spawn point
        this._rooms = [];       // {i,j,cx,cz} room list
        this._colliders = [];   // {minX,maxX,minZ,maxZ} AABB list

        // Room graph
        this._roomIndexByKey = new Map();
        this._graph = new Map();
        this._spawnIndex = 0;

        // Portal
        this._portal = null;
        this._portalLight = null;
        this._portalMat = null;
        this._portalTime = 0;

        // Lighting
        this._ambient = null;                 // Type 1: AmbientLight
        this._roomLights = [];                // Type 2: per room SpotLight
        this._accentLights = [];              // Type 3: PointLight accents
        this._shadowBudget = Number.isInteger(params.shadowBudget) ? Math.max(2, params.shadowBudget) : 8;
        this._lightingFollowObj = null;

        this._ceilLightMat = null;

        this._Init();
    }

    _Init() {
        const loader = new THREE.TextureLoader();
        const texBase = 'resources/textures/';

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

        const BASE_REPEAT = 20;
        const WALL_REPEAT = 4;
        const TILE_REPEAT = 12;
        const LIGHT_REPEAT = 6;

        carpetColor.repeat.set(BASE_REPEAT, BASE_REPEAT);
        carpetNormal.repeat.set(BASE_REPEAT, BASE_REPEAT);
        wallColor.repeat.set(WALL_REPEAT, WALL_REPEAT);
        ceilTileColor.repeat.set(TILE_REPEAT, TILE_REPEAT);
        ceilLightCol.repeat.set(LIGHT_REPEAT, LIGHT_REPEAT);

        const ROOM_SIZE = 300;
        this._roomSize = ROOM_SIZE;
        const ROOM_HEIGHT = 40;
        const WALL_THICK = 2;
        const PILLAR_SIZE = 20;
        const PILLAR_INSET = 100;
        const CENTER_LIGHT_SIZE = 30;

        const DOOR_WIDTH = 80;
        const DOOR_HEIGHT = 25;

        const group = new THREE.Group();

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

        const GEO_FLOOR = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_CEILING = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const GEO_LIGHT = new THREE.PlaneGeometry(CENTER_LIGHT_SIZE, CENTER_LIGHT_SIZE);

        const addRectCollider = (minX, maxX, minZ, maxZ) => {
            this._colliders.push({ minX, maxX, minZ, maxZ });
        };

        const createWallXZ = (sizeX, height, sizeZ, mat, center, registerCollider = true) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, height, sizeZ), mat);
            mesh.position.copy(center);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
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

        const addWallWithDoor = (parent, isHorizontal, roomCenterXZ, mat) => {
            const half = ROOM_SIZE / 2;
            const yCenter = ROOM_HEIGHT / 2;
            const segThickness = WALL_THICK;

            if (isHorizontal) {
                const totalLen = ROOM_SIZE;
                const sideLen = (totalLen - DOOR_WIDTH) / 2;

                const leftC = new THREE.Vector3(roomCenterXZ.x - (half - sideLen / 2), yCenter, roomCenterXZ.z);
                const rightC = new THREE.Vector3(roomCenterXZ.x + (half - sideLen / 2), yCenter, roomCenterXZ.z);

                const left = createWallXZ(sideLen, ROOM_HEIGHT, segThickness, mat, leftC, true);
                const right = createWallXZ(sideLen, ROOM_HEIGHT, segThickness, mat, rightC, true);
                parent.add(left); freeze(left);
                parent.add(right); freeze(right);

                const lintelH = ROOM_HEIGHT - DOOR_HEIGHT;
                const lintelC = new THREE.Vector3(roomCenterXZ.x, DOOR_HEIGHT + lintelH / 2, roomCenterXZ.z);
                const lintel = createWallXZ(DOOR_WIDTH, lintelH, segThickness, mat, lintelC, false);
                parent.add(lintel); freeze(lintel);
            } else {
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

        // Maze generation
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

        // Center the cluster
        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (const c of builtCells) { if (c.i < minI) minI = c.i; if (c.i > maxI) maxI = c.i; if (c.j < minJ) minJ = c.j; if (c.j > maxJ) maxJ = c.j; }
        const midI = (minI + maxI) / 2, midJ = (minJ + maxJ) / 2;
        for (const c of builtCells) {
            c.cx = (c.i - midI) * ROOM_SIZE;
            c.cz = (c.j - midJ) * ROOM_SIZE;
        }

        // Spawn and room list
        this._rooms = builtCells.map(r => ({ i: r.i, j: r.j, cx: r.cx, cz: r.cz }));
        this.spawn = this._rooms.length ? new THREE.Vector3(this._rooms[0].cx, 0, this._rooms[0].cz)
            : new THREE.Vector3(0, 0, 0);

        // Room shells
        const buildRoomShell = (parent, cx, cz) => {
            const floor = new THREE.Mesh(GEO_FLOOR, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(cx, 0, cz);
            floor.receiveShadow = true;
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

        // Pillars and colliders
        const pillarGeo = new THREE.BoxGeometry(PILLAR_SIZE, ROOM_HEIGHT, PILLAR_SIZE);
        const pillarsPerRoom = 4;
        const instancedPillars = new THREE.InstancedMesh(pillarGeo, pillarMat, builtCells.length * pillarsPerRoom);
        instancedPillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedPillars.castShadow = true;
        instancedPillars.receiveShadow = true;
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
                const half = PILLAR_SIZE * 0.5;
                addRectCollider(x - half, x + half, z - half, z + half);
            }
        }
        instancedPillars.instanceMatrix.needsUpdate = true;
        group.add(instancedPillars);

        const hasNeighbor = (i, j) => builtSet.has(key(i, j));

        // Walls with or without doors
        for (const c of builtCells) {
            const o = openings.get(key(c.i, c.j));

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

        // Close south and east boundaries
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

        // Index and graph
        this._roomIndexByKey.clear();
        for (let idxR = 0; idxR < this._rooms.length; idxR++) {
            const r = this._rooms[idxR];
            this._roomIndexByKey.set(`${r.i},${r.j}`, idxR);
        }
        this._graph.clear();
        for (let idxR = 0; idxR < this._rooms.length; idxR++) {
            const r = this._rooms[idxR];
            const o = openings.get(`${r.i},${r.j}`);
            const neighbors = [];
            if (o.N) { const k = `${r.i},${r.j + 1}`; if (this._roomIndexByKey.has(k)) neighbors.push(this._roomIndexByKey.get(k)); }
            if (o.S) { const k = `${r.i},${r.j - 1}`; if (this._roomIndexByKey.has(k)) neighbors.push(this._roomIndexByKey.get(k)); }
            if (o.E) { const k = `${r.i + 1},${r.j}`; if (this._roomIndexByKey.has(k)) neighbors.push(this._roomIndexByKey.get(k)); }
            if (o.W) { const k = `${r.i - 1},${r.j}`; if (this._roomIndexByKey.has(k)) neighbors.push(this._roomIndexByKey.get(k)); }
            this._graph.set(idxR, neighbors);
        }
        this._spawnIndex = this._roomIndexByKey.get(`${this._rooms[0].i},${this._rooms[0].j}`) ?? 0;

        // Lights
        this._ambient = new THREE.AmbientLight(0xf2efcf, 0.12); // Type 1
        group.add(this._ambient);

        // Per room ceiling SpotLight. Shadows off by default
        for (const r of this._rooms) {
            const spot = new THREE.SpotLight(0xfff6d0, 0.9, 420, Math.PI / 3.2, 0.5, 1.2); // Type 2
            spot.position.set(r.cx, ROOM_HEIGHT - 4, r.cz);
            spot.target.position.set(r.cx, 0, r.cz);
            spot.castShadow = false;
            spot.shadow.mapSize.set(1024, 1024);
            spot.shadow.camera.near = 1;
            spot.shadow.camera.far = 460;
            spot.shadow.bias = -0.00012;
            group.add(spot);
            group.add(spot.target);
            this._roomLights.push(spot);
        }

        // PointLight accents at room centers
        for (const r of this._rooms) {
            const pl = new THREE.PointLight(0xffeaa0, 0.32, 360, 2.0);
            pl.position.set(r.cx, ROOM_HEIGHT * 0.5, r.cz);
            pl.castShadow = false;
            group.add(pl);
            this._accentLights.push(pl);
        }


        this._group = group;
        this._scene.add(this._group);

        this._roomBounds = (() => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const r of this._rooms) {
            minX = Math.min(minX, r.cx - this._roomSize * 0.5);
            maxX = Math.max(maxX, r.cx + this._roomSize * 0.5);
            minZ = Math.min(minZ, r.cz - this._roomSize * 0.5);
            maxZ = Math.max(maxZ, r.cz + this._roomSize * 0.5);
        }
        return {minX, maxX, minZ, maxZ};
        })();

        // Enable initial shadow allocation near spawn
        this._enableShadowsNear(new THREE.Vector3(this.spawn.x, 0, this.spawn.z));
    }

    getMesh() { return this._group; }
    getFirstRoomCenter() { return this.spawn ? this.spawn.clone() : new THREE.Vector3(0, 0, 0); }
    getRoomCenters() { return this._rooms.map(r => ({ cx: r.cx, cz: r.cz })); }
    getColliders() { return this._colliders; }
    getRoomSize() { return this._roomSize ?? 300; }
    getRoomsFull() { return this._rooms.map(r => ({...r})); } // i, j, cx, cz
    getBounds() { return {...this._roomBounds}; }
    getPortalPosition() { return this._portal ? this._portal.position.clone() : null; }

    enableShadows(renderer) {
        if (!renderer) return;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    followLighting(obj3D) {
        this._lightingFollowObj = obj3D || null;
    }

    _bfsDistancesFrom(startIndex) {
        const dist = new Array(this._rooms.length).fill(Infinity);
        const q = [];
        dist[startIndex] = 0;
        q.push(startIndex);
        while (q.length) {
            const u = q.shift();
            const nd = dist[u] + 1;
            const nbrs = this._graph.get(u) || [];
            for (const v of nbrs) {
                if (dist[v] === Infinity) {
                    dist[v] = nd;
                    q.push(v);
                }
            }
        }
        return dist;
    }

    _nearestRoomIndexTo(x, z) {
        if (!this._rooms.length) return 0;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < this._rooms.length; i++) {
            const dx = x - this._rooms[i].cx;
            const dz = z - this._rooms[i].cz;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD) { bestD = d2; best = i; }
        }
        return best;
    }

    _enableShadowsNear(worldPos) {
        if (!this._roomLights.length) return;

        for (const s of this._roomLights) s.castShadow = false;

        const pairs = [];
        for (let i = 0; i < this._rooms.length; i++) {
            const r = this._rooms[i];
            const dx = worldPos.x - r.cx;
            const dz = worldPos.z - r.cz;
            const d2 = dx * dx + dz * dz;
            pairs.push([d2, i]);
        }
        pairs.sort((a, b) => a[0] - b[0]);

        const count = Math.min(this._shadowBudget, this._roomLights.length);
        for (let k = 0; k < count; k++) {
            const idxRoom = pairs[k][1];
            const s = this._roomLights[idxRoom];
            s.castShadow = true;
        }
    }

    getFurthestRoomCenterFromPosition(pos) {
        if (!pos || !pos.isVector3 || !this._rooms.length) return this.getFirstRoomCenter();
        const startIdx = this._nearestRoomIndexTo(pos.x, pos.z);
        const dist = this._bfsDistancesFrom(startIdx);
        let farIdx = 0;
        let farDist = -1;
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] > farDist) { farDist = dist[i]; farIdx = i; }
        }
        const r = this._rooms[farIdx];
        return new THREE.Vector3(r.cx, 0, r.cz);
    }

    // opts: { radius, tube, color1, color2, speed, turns, thickness, y }
    spawnPortalAtFurthest(fromWorldPos, opts = {}) {
        const radius = opts.radius ?? 28;
        const tube = opts.tube ?? 5;
        const y = opts.y ?? 0;
        const color1 = new THREE.Color(opts.color1 ?? 0xffffff);
        const color2 = new THREE.Color(opts.color2 ?? 0x88aaff);
        const speed = opts.speed ?? 1.6;
        const turns = opts.turns ?? 8.0;
        const thickness = opts.thickness ?? 0.35;

        if (this._portal) {
            this._group.remove(this._portal);
            this._portal.geometry?.dispose?.();
            this._portal = null;
        }
        if (this._portalMat) {
            this._portalMat.dispose?.();
            this._portalMat = null;
        }
        if (this._portalLight) {
            this._group.remove(this._portalLight);
            this._portalLight = null;
        }

        const target = this.getFurthestRoomCenterFromPosition(fromWorldPos);

        const geo = new THREE.TorusGeometry(radius, tube, 16, 48);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor1: { value: color1 },
                uColor2: { value: color2 },
                uSpeed: { value: speed },
                uTurns: { value: turns },
                uThickness: { value: thickness }
            },
            vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3  uColor1;
        uniform vec3  uColor2;
        uniform float uSpeed;
        uniform float uTurns;
        uniform float uThickness;

        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) + 1e-4;
          float a = atan(p.y, p.x);

          float s = sin(uTurns * a + 6.0 * log(r) - uSpeed * uTime);
          float band = smoothstep(uThickness, uThickness - 0.15, abs(s));

          float edge = 1.0 - smoothstep(0.46, 0.5, r);

          vec3 col = mix(uColor1, uColor2, band);
          gl_FragColor = vec4(col, edge * 0.95);
        }`,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const ring = new THREE.Mesh(geo, mat);
        ring.position.set(target.x, y + 10, target.z);
        ring.rotation.x = Math.PI / 2;

        const light = new THREE.PointLight(color2, 0.9, 500, 2.0);
        light.position.set(target.x, y + 18, target.z);

        this._group.add(ring);
        this._group.add(light);

        this._portal = ring;
        this._portalLight = light;
        this._portalMat = mat;
        this._portalTime = 0;

        return ring;
    }

    getRoomCenterAtSteps(steps = 3) {
        if (!this._rooms.length) return new THREE.Vector3(0, 0, 0);

        const dist = this._bfsDistancesFrom(this._spawnIndex ?? 0);

        const exact = [];
        const greater = [];
        let farthestIdx = 0;
        let farthestDist = -1;

        for (let i = 0; i < dist.length; i++) {
            const d = dist[i];
            if (d === steps) exact.push(i);
            else if (d > steps) greater.push(i);
            if (d > farthestDist) { farthestDist = d; farthestIdx = i; }
        }

        let pickIndex = null;
        if (exact.length) {
            pickIndex = exact[(Math.random() * exact.length) | 0];
        } else if (greater.length) {
            pickIndex = greater[(Math.random() * greater.length) | 0];
        } else {
            pickIndex = farthestIdx;
        }

        const r = this._rooms[pickIndex];
        return new THREE.Vector3(r.cx, 0, r.cz);
    }

    getRandomFarRoomCenter(minSteps = 3) {
        if (!this._rooms.length) return new THREE.Vector3(0, 0, 0);
        const dist = this._bfsDistancesFrom(this._spawnIndex ?? 0);

        const cand = [];
        let farthestIdx = 0;
        let farthestDist = -1;
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] >= minSteps) cand.push(i);
            if (dist[i] > farthestDist) { farthestDist = dist[i]; farthestIdx = i; }
        }
        const pickIndex = cand.length ? cand[(Math.random() * cand.length) | 0] : farthestIdx;
        const r = this._rooms[pickIndex];
        return new THREE.Vector3(r.cx, 0, r.cz);
    }

    Update(t) {
        if (this._ceilLightMat) {
            const f = 0.92 + 0.04 * Math.sin(t * 3.2) + 0.02 * Math.sin(t * 17.0) + 0.01 * Math.sin(t * 27.7);
            this._ceilLightMat.color.setScalar(Math.max(0.8, Math.min(1.1, f)));
        }

        if (this._portal) {
            this._portalTime += t;
            this._portal.rotation.z += 0.6 * t;
            if (this._portalMat) {
                this._portalMat.uniforms.uTime.value = this._portalTime;
            }
            if (this._portalLight) {
                this._portalLight.intensity = 0.5 + 0.2 * Math.sin(this._portalTime * 2.6);
            }
        }

        if (this._lightingFollowObj) {
            this._enableShadowsNear(this._lightingFollowObj.position);
        }
    }

    getHeightAt(x, z) { return 0; }
}

export { Terrain };
