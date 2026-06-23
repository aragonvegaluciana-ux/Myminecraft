// ============================================================
//  world.js – Gestor del mundo: chunks, generación y queries
// ============================================================

import { Chunk, CHUNK_SIZE } from './chunk.js';
import { BlockType }         from './block.js';

export class World {
    /**
     * @param {BABYLON.Scene}    scene
     * @param {BABYLON.Material} chunkMaterial
     */
    constructor(scene, chunkMaterial) {
        this.scene         = scene;
        this.material      = chunkMaterial;
        this._chunks       = new Map();   // key → Chunk
        this.renderRadius  = 4;           // radio en chunks (horizontal)
        this.WORLD_HEIGHT_CHUNKS = 4;     // chunks verticales (0–3 → Y 0–63)
    }

    // ── Coordenadas ───────────────────────────────────────────
    _key(cx, cy, cz) { return `${cx},${cy},${cz}`; }

    _worldToLocal(wx, wy, wz) {
        const cs = CHUNK_SIZE;
        const cx = Math.floor(wx / cs), lx = ((wx % cs) + cs) % cs;
        const cy = Math.floor(wy / cs), ly = ((wy % cs) + cs) % cs;
        const cz = Math.floor(wz / cs), lz = ((wz % cs) + cs) % cs;
        return { cx, cy, cz, lx, ly, lz };
    }

    // ── Acceso a chunks ───────────────────────────────────────
    getChunk(cx, cy, cz) { return this._chunks.get(this._key(cx, cy, cz)); }

    _createChunk(cx, cy, cz) {
        const chunk = new Chunk(cx, cy, cz);
        this._generateChunk(chunk);
        this._chunks.set(this._key(cx, cy, cz), chunk);
        return chunk;
    }

    getOrCreateChunk(cx, cy, cz) {
        return this.getChunk(cx, cy, cz) ?? this._createChunk(cx, cy, cz);
    }

    // ── Generación procedural (terreno plano) ─────────────────
    _generateChunk(chunk) {
        const baseY = chunk.cy * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                    const worldY = baseY + ly;
                    let type = BlockType.AIR;

                    if      (worldY === 0)              type = BlockType.BEDROCK;
                    else if (worldY >= 1 && worldY < 5) type = BlockType.STONE;
                    else if (worldY >= 5 && worldY < 8) type = BlockType.DIRT;
                    else if (worldY === 8)              type = BlockType.GRASS;
                    else if (worldY > 8 && worldY <= 14) {
                        const wx = chunk.cx * CHUNK_SIZE + lx;
                        const wz = chunk.cz * CHUNK_SIZE + lz;
                        // Comprobar si hay un centro de árbol cerca
                        for (let dx = -2; dx <= 2; dx++) {
                            for (let dz = -2; dz <= 2; dz++) {
                                const tx = wx - dx;
                                const tz = wz - dz;
                                // Colocación determinista de árboles
                                const h = Math.sin(tx * 12.9898 + tz * 78.233) * 43758.5453123;
                                const noise = h - Math.floor(h);
                                // 1.5% de probabilidad, fuera del área de inicio del jugador
                                if (noise < 0.015 && (Math.abs(tx - 8) >= 4 || Math.abs(tz - 8) >= 4)) {
                                    if (dx === 0 && dz === 0 && worldY <= 12) {
                                        type = BlockType.WOOD;
                                    } else if (worldY === 11 || worldY === 12) {
                                        const adx = Math.abs(dx), adz = Math.abs(dz);
                                        if (adx <= 2 && adz <= 2 && !(adx === 2 && adz === 2)) {
                                            if (type !== BlockType.WOOD) type = BlockType.LEAVES;
                                        }
                                    } else if (worldY === 13 || worldY === 14) {
                                        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
                                            if (type !== BlockType.WOOD) type = BlockType.LEAVES;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (type !== BlockType.AIR) chunk.setBlock(lx, ly, lz, type);
                }
            }
        }
        chunk.dirty = true;
    }

    // ── API de bloques ────────────────────────────────────────
    /** @returns {number|undefined} BlockType o undefined si no existe chunk */
    getBlock(wx, wy, wz) {
        const { cx, cy, cz, lx, ly, lz } = this._worldToLocal(
            Math.floor(wx), Math.floor(wy), Math.floor(wz)
        );
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return BlockType.AIR;
        const b = chunk.getBlock(lx, ly, lz);
        return b === -1 ? BlockType.AIR : b;
    }

    /** Pone un bloque en coordenadas mundo y marca chunks vecinos como dirty */
    setBlock(wx, wy, wz, type) {
        const { cx, cy, cz, lx, ly, lz } = this._worldToLocal(
            Math.floor(wx), Math.floor(wy), Math.floor(wz)
        );
        const chunk = this.getOrCreateChunk(cx, cy, cz);
        chunk.setBlock(lx, ly, lz, type);

        // Si el bloque está en el borde del chunk, marcar vecino como dirty
        if (lx === 0)             this._markDirty(cx-1, cy, cz);
        if (lx === CHUNK_SIZE-1)  this._markDirty(cx+1, cy, cz);
        if (ly === 0)             this._markDirty(cx, cy-1, cz);
        if (ly === CHUNK_SIZE-1)  this._markDirty(cx, cy+1, cz);
        if (lz === 0)             this._markDirty(cx, cy, cz-1);
        if (lz === CHUNK_SIZE-1)  this._markDirty(cx, cy, cz+1);
    }

    _markDirty(cx, cy, cz) {
        const c = this.getChunk(cx, cy, cz);
        if (c) c.dirty = true;
    }

    // ── Update del mundo (cargar/descargar/rebuild) ───────────
    /** @param {BABYLON.Vector3} playerPos – posición CENTRO del jugador */
    update(playerPos) {
        const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
        const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
        const rd  = this.renderRadius;

        // Cargar chunks cercanos (solo el cilindro horizontal)
        for (let dx = -rd; dx <= rd; dx++) {
            for (let dz = -rd; dz <= rd; dz++) {
                if (dx*dx + dz*dz > rd*rd) continue;
                for (let cy = 0; cy < this.WORLD_HEIGHT_CHUNKS; cy++) {
                    this.getOrCreateChunk(pcx + dx, cy, pcz + dz);
                }
            }
        }

        // Reconstruir meshes sucios (máx N por frame para no congelar)
        let rebuilds = 0;
        for (const chunk of this._chunks.values()) {
            if (chunk.dirty && rebuilds < 4) {
                chunk.buildMesh(this.scene, this.material, this);
                rebuilds++;
            }
        }

        // Descargar chunks muy lejanos
        for (const [key, chunk] of this._chunks) {
            const ddx = chunk.cx - pcx, ddz = chunk.cz - pcz;
            if (ddx*ddx + ddz*ddz > (rd + 3) * (rd + 3)) {
                chunk.dispose();
                this._chunks.delete(key);
            }
        }
    }

    // ── Serialización ─────────────────────────────────────────
    serialize() {
        const data = {};
        for (const [key, chunk] of this._chunks) {
            // Solo guardar chunks con cambios respecto a la generación base
            // (guardamos todos para simplicidad; optimizable)
            const arr = Array.from(chunk.blocks);
            if (arr.some(b => b !== 0)) data[key] = arr;
        }
        return JSON.stringify(data);
    }

    deserialize(json) {
        const data = JSON.parse(json);
        for (const [key, blocks] of Object.entries(data)) {
            const [cx, cy, cz] = key.split(',').map(Number);
            let chunk = this.getChunk(cx, cy, cz);
            if (!chunk) {
                chunk = new Chunk(cx, cy, cz);
                this._chunks.set(this._key(cx, cy, cz), chunk);
            }
            chunk.blocks = new Uint8Array(blocks);
            chunk.dirty  = true;
        }
    }
}
