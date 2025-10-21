// HUD.js
export class HUD {
    constructor() {
        this._root = document.createElement('div');
        this._root.id = 'hud';
        this._root.innerHTML = `
      <div class="panel">
        <div class="label">HP</div>
        <div class="bar"><div class="fill"></div></div>
        <div class="text">100 / 100</div>
      </div>
    `;
        document.body.appendChild(this._root);

        const css = document.createElement('style');
        css.textContent = `
      /* Minimal PS1 style HUD */
      #hud {
        position: fixed;
        top: 22px;
        left: 22px;
        z-index: 9999;
        pointer-events: none;
        font-family: 'VT323', monospace;
        color: #f0f0f0;
        letter-spacing: 1px;
        user-select: none;
      }

      #hud .panel {
        background: rgba(15, 15, 15, 0.75);
        border: 2px solid #f0f0f0;
        padding: 12px 14px;
        border-radius: 3px;
        image-rendering: pixelated;
      }

      #hud .label {
        font-size: 16px;
        color: #f0f0f0;
        margin-bottom: 6px;
      }

      #hud .bar {
        width: 200px;
        height: 6px;
        border: 1px solid #f0f0f0;
        background: #0a0a0a;
        overflow: hidden;
      }

      #hud .fill {
        height: 100%;
        width: 100%;
        background: #f0f0f0;
        transition: width 0.15s linear;
      }

      #hud .text {
        margin-top: 6px;
        font-size: 15px;
        color: #e0e0e0;
        opacity: 0.9;
      }

      /* Subtle flicker */
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.92; }
      }
      #hud .panel { animation: pulse 2.5s infinite; }
    `;
        document.head.appendChild(css);

        // Pixel font
        const font = document.createElement('link');
        font.rel = 'stylesheet';
        font.href = 'https://fonts.googleapis.com/css2?family=VT323&display=swap';
        document.head.appendChild(font);

        this._fill = this._root.querySelector('.fill');
        this._text = this._root.querySelector('.text');
        this._max = 100;
        this._cur = 100;
    }

    setMax(n) {
        this._max = Math.max(1, n | 0);
        this.set(this._cur);
    }

    set(n) {
        this._cur = Math.max(0, Math.min(this._max, n));
        const pct = (this._cur / this._max) * 100;
        this._fill.style.width = `${pct}%`;
        this._text.textContent = `${this._cur} / ${this._max}`;
    }

    damage(n) { this.set(this._cur - n); }
    heal(n) { this.set(this._cur + n); }
}
