// ============================================================
//  ui.js – Actualización del HUD, hotbar y notificaciones
// ============================================================

import { BlockProperties, HotbarBlocks } from './block.js';

export class UI {
    constructor(inventory) {
        this.inventory = inventory;

        // Elementos del DOM
        this._gravEl    = document.getElementById('gravity-indicator');
        this._coordsEl  = document.getElementById('coords-display');
        this._fpsEl     = document.getElementById('fps-counter');
        this._notifEl   = document.getElementById('notification');
        this._hotbarEl  = document.getElementById('hotbar');
        this._loadProg  = document.querySelector('.loading-progress');

        this._notifTimer    = 0;
        this._notifTimeout  = null;
        this._fpsAccum      = 0;
        this._fpsFrames     = 0;
        this._fps           = 60;

        this._setupHealthBar();
        this._buildHotbar();
    }

    _setupHealthBar() {
        this._healthEl = document.getElementById('health-bar');
        if (!this._healthEl) {
            this._healthEl = document.createElement('div');
            this._healthEl.id = 'health-bar';
            const overlay = document.getElementById('ui-overlay');
            const hotbar = document.getElementById('hotbar');
            if (overlay && hotbar) {
                overlay.insertBefore(this._healthEl, hotbar);
            } else if (overlay) {
                overlay.appendChild(this._healthEl);
            }
        }
    }

    // ── Hotbar ────────────────────────────────────────────────
    _buildHotbar() {
        if (!this._hotbarEl) return;
        this._hotbarEl.innerHTML = '';

        HotbarBlocks.forEach((blockType, i) => {
            const props = BlockProperties[blockType];
            const slot  = document.createElement('div');
            slot.className = 'hotbar-slot' + (i === 0 ? ' active' : '');
            slot.id = `slot-${i}`;
            slot.innerHTML = `
                <span class="slot-num">${i + 1}</span>
                <span class="slot-icon">${props.icon}</span>
                <span class="slot-name">${props.name}</span>
            `;
            this._hotbarEl.appendChild(slot);
        });
    }

    updateHotbar() {
        const sel = this.inventory.selectedSlot;
        document.querySelectorAll('.hotbar-slot').forEach((el, i) => {
            el.classList.toggle('active', i === sel);
        });
    }

    // ── HUD ───────────────────────────────────────────────────
    updateCoords(pos) {
        if (!this._coordsEl) return;
        this._coordsEl.textContent =
            `X ${pos.x.toFixed(1)}  Y ${pos.y.toFixed(1)}  Z ${pos.z.toFixed(1)}`;
    }

    updateFPS(dt) {
        if (!this._fpsEl) return;
        this._fpsAccum  += dt;
        this._fpsFrames += 1;
        if (this._fpsAccum >= 0.5) {
            this._fps      = Math.round(this._fpsFrames / this._fpsAccum);
            this._fpsAccum = 0; this._fpsFrames = 0;
            this._fpsEl.textContent = `FPS ${this._fps}`;
        }
    }

    updateGravity(label, cls) {
        if (!this._gravEl) return;
        this._gravEl.textContent = label;
        this._gravEl.className   = 'hud-item ' + (cls ?? '');
    }

    // ── Notificaciones ────────────────────────────────────────
    /** @param {string} msg  @param {'success'|'warning'|'error'} type */
    notify(msg, type = 'success') {
        if (!this._notifEl) return;
        clearTimeout(this._notifTimeout);
        this._notifEl.textContent = msg;
        this._notifEl.className   = `show ${type}`;
        this._notifTimeout = setTimeout(() => {
            if (this._notifEl) this._notifEl.className = '';
        }, 3000);
    }

    // ── Loading screen ─────────────────────────────────────── 
    setLoadProgress(pct) {
        if (this._loadProg) this._loadProg.style.width = `${pct}%`;
    }

    hideLoading() {
        const el = document.getElementById('loading-screen');
        if (el) el.classList.add('hidden');
    }

    // ── Pausa ─────────────────────────────────────────────────
    showPause()  { document.getElementById('pause-menu')?.classList.remove('hidden'); }
    hidePause()  { document.getElementById('pause-menu')?.classList.add('hidden');    }
    isPaused()   { return !document.getElementById('pause-menu')?.classList.contains('hidden'); }

    // ── Update frame ──────────────────────────────────────────
    update(dt, player) {
        this.updateFPS(dt);
        this.updateCoords(player.center);
        this.updateHotbar();
        this.updateHealth(player);
    }

    updateHealth(player) {
        if (!this._healthEl) return;
        const totalHearts = 10;
        const hpPerHeart = 10;
        const hp = player.health;
        let html = '';
        for (let i = 0; i < totalHearts; i++) {
            const threshold = (i + 1) * hpPerHeart;
            if (hp >= threshold) {
                html += '<span class="heart full">❤️</span>';
            } else if (hp >= threshold - hpPerHeart / 2) {
                html += '<span class="heart half">💔</span>';
            } else {
                html += '<span class="heart empty">🖤</span>';
            }
        }
        this._healthEl.innerHTML = html;
    }

    flashDamage() {
        let flash = document.getElementById('damage-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'damage-flash';
            document.body.appendChild(flash);
        }
        flash.classList.remove('active');
        void flash.offsetWidth; // trigger reflow
        flash.classList.add('active');
        setTimeout(() => {
            if (flash) flash.classList.remove('active');
        }, 1500 / 5); // 300ms
    }
}
