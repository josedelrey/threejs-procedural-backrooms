import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

// Minimap.js
export class Minimap {
  /**
   * @param {object} opts
   * opts.terrain: Terrain
   * opts.getPlayer: () => THREE.Object3D | null
   * opts.getEnemies: () => THREE.Object3D[]
   * opts.size: minimap size in pixels
   * opts.theme: color configuration
   */
  constructor(opts) {
    this.terrain = opts.terrain;
    this.getPlayer = opts.getPlayer;
    this.getEnemies = opts.getEnemies || (() => []);
    this.size = opts.size ?? 220;

    this.theme = Object.assign({
      bg: 'rgba(0,0,0,0.6)',
      grid: '#2e2e2e',
      room: '#5a5a36',
      roomOutline: '#cfcaa0',
      player: '#ffffff',
      playerDir: '#ffffff',
      enemy: '#ff5a5a',
      portal: '#7fd0ff',
      bounds: '#777'
    }, opts.theme || {});

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.id = 'minimap';
    Object.assign(this.canvas.style, {
      position: 'fixed',
      right: '22px',
      bottom: '22px',
      width: this.size + 'px',
      height: this.size + 'px',
      zIndex: 9999,
      border: '2px solid #ddd',
      background: this.theme.bg,
      borderRadius: '6px',
      imageRendering: 'pixelated',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // world to minimap bounds
    const b = this.terrain.getBounds();
    this.minX = b.minX; this.maxX = b.maxX;
    this.minZ = b.minZ; this.maxZ = b.maxZ;

    // padding
    const pad = 40;
    this.minX -= pad; this.maxX += pad;
    this.minZ -= pad; this.maxZ += pad;

    this.sx = this.size / (this.maxX - this.minX);
    this.sz = this.size / (this.maxZ - this.minZ);
    this.scale = Math.min(this.sx, this.sz);

    // center offset
    const worldW = (this.maxX - this.minX);
    const worldH = (this.maxZ - this.minZ);
    this.offsetX = (this.size - worldW * this.scale) * 0.5;
    this.offsetY = (this.size - worldH * this.scale) * 0.5;

    // room data
    this.rooms = this.terrain.getRoomsFull();
    this.roomSize = this.terrain.getRoomSize();

    this._buildStaticLayer();
    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    // for handling canvas scaling with DPI if needed
  }

  worldToMini(x, z) {
    const xx = this.offsetX + (x - this.minX) * this.scale;
    const yy = this.offsetY + (z - this.minZ) * this.scale;
    return { x: xx, y: yy };
  }

  _buildStaticLayer() {
    const c = this.ctx;
    c.clearRect(0, 0, this.size, this.size);

    // grid lines
    const stepWorld = this.roomSize / 3;
    c.save();
    c.strokeStyle = this.theme.grid;
    c.lineWidth = 1;
    c.globalAlpha = 0.4;

    const startX = Math.ceil(this.minX / stepWorld) * stepWorld;
    const endX = Math.floor(this.maxX / stepWorld) * stepWorld;
    for (let x = startX; x <= endX; x += stepWorld) {
      const a = this.worldToMini(x, this.minZ);
      const b = this.worldToMini(x, this.maxZ);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    const startZ = Math.ceil(this.minZ / stepWorld) * stepWorld;
    const endZ = Math.floor(this.maxZ / stepWorld) * stepWorld;
    for (let z = startZ; z <= endZ; z += stepWorld) {
      const a = this.worldToMini(this.minX, z);
      const b = this.worldToMini(this.maxX, z);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    c.restore();

    // draw rooms
    c.save();
    for (const r of this.rooms) {
      const half = this.roomSize * 0.5;
      const topLeft = this.worldToMini(r.cx - half, r.cz - half);
      const w = this.roomSize * this.scale;
      const h = this.roomSize * this.scale;
      c.fillStyle = this.theme.room;
      c.strokeStyle = this.theme.roomOutline;
      c.globalAlpha = 0.6;
      c.fillRect(topLeft.x, topLeft.y, w, h);
      c.globalAlpha = 0.9;
      c.lineWidth = 1.5;
      c.strokeRect(topLeft.x, topLeft.y, w, h);
    }
    c.restore();
  }

  _drawPlayer(obj) {
    const c = this.ctx;
    const p = this.worldToMini(obj.position.x, obj.position.z);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) return;
    fwd.normalize();

    const angleWorld = Math.atan2(fwd.x, fwd.z);
    const angleCanvas = Math.PI - angleWorld + (this.playerHeadingOffset || 0);

    const size = 9;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(angleCanvas);
    c.beginPath();
    c.moveTo(0, -size);
    c.lineTo(size * 0.6, size * 0.8);
    c.lineTo(-size * 0.6, size * 0.8);
    c.closePath();
    c.fillStyle = this.theme.player;
    c.fill();
    c.restore();
  }

  _drawEnemies(objs) {
    const c = this.ctx;
    c.save();
    c.fillStyle = this.theme.enemy;
    for (const e of objs) {
      if (!e) continue;
      const p = this.worldToMini(e.position.x, e.position.z);
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  _drawPortal(pos) {
    if (!pos) return;
    const c = this.ctx;
    const p = this.worldToMini(pos.x, pos.z);
    c.save();
    c.strokeStyle = this.theme.portal;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y, 7, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    c.fillStyle = this.theme.portal;
    c.fill();
    c.restore();
  }

  update() {
    // redraw static + dynamic layers
    this._buildStaticLayer();

    const playerObj = this.getPlayer ? this.getPlayer() : null;
    if (playerObj) this._drawPlayer(playerObj);

    const enemies = this.getEnemies ? this.getEnemies() : [];
    this._drawEnemies(enemies);

    const portalPos = this.terrain.getPortalPosition();
    this._drawPortal(portalPos);
  }

  dispose() {
    this.canvas?.remove();
  }
}
