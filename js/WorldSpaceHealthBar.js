// WorldSpaceHealthBar.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

/** World-space HP bar projected to screen */
export class WorldSpaceHealthBar {
    constructor(renderer, camera, trackedObject, opts = {}) {
        this._r = renderer;
        this._cam = camera;
        this._obj = trackedObject;
        this._offset = opts.offset || new THREE.Vector3(0, 30, 0); // vertical offset above object
        this._max = opts.max || 100;
        this._cur = this._max;

        // DOM HUD element
        this._root = document.createElement('div');
        this._root.className = 'ws-hp';
        this._root.innerHTML = `<div class="ws-fill"></div>`;
        document.body.appendChild(this._root);

        // Minimal styling
        const css = document.createElement('style');
        css.textContent = `
      .ws-hp { position: fixed; width: 80px; height: 8px; border-radius: 4px;
               background: rgba(0,0,0,0.55); overflow: hidden; transform: translate(-50%, -50%); z-index: 9998; }
      .ws-hp .ws-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #f66, #fb3); }
    `;
        document.head.appendChild(css);

        this._fill = this._root.querySelector('.ws-fill');
        this._v = new THREE.Vector3();
    }

    // HP API
    setMax(n) { this._max = Math.max(1, n | 0); this.set(this._cur); }
    set(n) {
        this._cur = Math.max(0, Math.min(this._max, n));
        this._fill.style.width = `${(this._cur / this._max) * 100}%`;
        this._root.style.display = this._cur > 0 ? 'block' : 'none';
    }

    // Position bar over the tracked object
    update() {
        if (!this._obj) return;
        this._v.copy(this._obj.position).add(this._offset).project(this._cam);

        const w = this._r.domElement.clientWidth;
        const h = this._r.domElement.clientHeight;
        const x = (this._v.x * 0.5 + 0.5) * w;
        const y = (-this._v.y * 0.5 + 0.5) * h;

        if (this._v.z > 1 || this._v.z < -1) {
            this._root.style.display = 'none';
            return;
        }

        this._root.style.display = 'block';
        this._root.style.left = `${x}px`;
        this._root.style.top = `${y}px`;
    }

    // Cleanup
    dispose() {
        this._root.remove();
        this._obj = null;
    }
}
