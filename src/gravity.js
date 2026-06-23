// ============================================================
//  gravity.js – Sistema de antigravedad (6 direcciones)
// ============================================================

export class GravitySystem {
    constructor() {
        // Todas las direcciones posibles de gravedad (vectores normalizados)
        this._dirs = [
            { vec: new BABYLON.Vector3(0, -1,  0), label: '⬇ Gravedad Normal',     cls: ''         },
            { vec: new BABYLON.Vector3(0,  1,  0), label: '⬆ Gravedad Invertida',   cls: 'inverted' },
            { vec: new BABYLON.Vector3(-1,  0,  0), label: '◀ Gravedad Izquierda',  cls: 'sideways' },
            { vec: new BABYLON.Vector3( 1,  0,  0), label: '▶ Gravedad Derecha',    cls: 'sideways' },
            { vec: new BABYLON.Vector3(0,  0, -1), label: '▲ Gravedad Adelante',    cls: 'sideways' },
            { vec: new BABYLON.Vector3(0,  0,  1), label: '▼ Gravedad Atrás',       cls: 'sideways' },
        ];

        this._index     = 0;             // dirección activa
        this.strength   = 22;            // m/s²
        this.direction  = this._dirs[0].vec.clone();  // dirección interpolada actual
        this._target    = this._dirs[0].vec.clone();  // dirección objetivo
        this._transitioning = false;
        this._tTime     = 0;
        this._tDuration = 0.6;           // segundos de transición suave
        this._prevDir   = this._dirs[0].vec.clone();
    }

    /** Cicla al siguiente estado de gravedad. Devuelve { label, cls }. */
    cycle() {
        this._index = (this._index + 1) % this._dirs.length;
        const entry = this._dirs[this._index];
        this._prevDir       = this.direction.clone();
        this._target        = entry.vec.clone();
        this._transitioning = true;
        this._tTime         = 0;
        return entry;
    }

    /** @param {number} dt - delta time en segundos */
    update(dt) {
        if (!this._transitioning) return;
        this._tTime += dt;
        const t = Math.min(this._tTime / this._tDuration, 1);
        const ease = t * t * (3 - 2 * t); // suavizado smoothstep
        this.direction = BABYLON.Vector3.Lerp(this._prevDir, this._target, ease);
        if (t >= 1) {
            this.direction  = this._target.clone();
            this._transitioning = false;
        }
    }

    /** Aceleración gravitatoria en m/s² */
    get acceleration() { return this.direction.scale(this.strength); }

    /** Vector "arriba" para el jugador (opuesto a la gravedad) */
    get upVector() { return this.direction.negate(); }

    /** ¿Está en transición actualmente? */
    get isTransitioning() { return this._transitioning; }

    /** Devuelve el eje y signo de la gravedad actual: { axis:'x'|'y'|'z', sign:+1|-1 } */
    get gravAxis() {
        const d = this.direction;
        const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
        if (ax > ay && ax > az) return { axis: 'x', sign: d.x > 0 ? 1 : -1 };
        if (az > ax && az > ay) return { axis: 'z', sign: d.z > 0 ? 1 : -1 };
        return { axis: 'y', sign: d.y > 0 ? 1 : -1 };
    }
}
