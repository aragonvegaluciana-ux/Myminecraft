// ============================================================
//  chunk.js – Datos del chunk y construcción del mesh 3D
// ============================================================

import { BlockType, BlockProperties, BlockAtlas, tileUV } from './block.js';

export const CHUNK_SIZE = 16;

// ── Definición de las 6 caras de un cubo ─────────────────────
// Vértices en orden correcto para normales hacia afuera en Babylon.js
// (orientación CCW cuando se mira desde el exterior)
const FACE_DEFS = [
    // +Y (arriba / top)
    {
        dir: [0,1,0], normal: [0,1,0], faceKey: 'top',
        verts: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
    },
    // -Y (abajo / bottom)
    {
        dir: [0,-1,0], normal: [0,-1,0], faceKey: 'bottom',
        verts: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
    },
    // +Z (sur / south)
    {
        dir: [0,0,1], normal: [0,0,1], faceKey: 'side',
        verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    },
    // -Z (norte / north)
    {
        dir: [0,0,-1], normal: [0,0,-1], faceKey: 'side',
        verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
    },
    // +X (este / east)
    {
        dir: [1,0,0], normal: [1,0,0], faceKey: 'side',
        verts: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
    },
    // -X (oeste / west)
    {
        dir: [-1,0,0], normal: [-1,0,0], faceKey: 'side',
        verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    },
];

export class Chunk {
    /**
     * @param {number} cx  coordenada X de chunk en el mundo
     * @param {number} cy  coordenada Y de chunk
     * @param {number} cz  coordenada Z de chunk
     */
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        /** Datos de bloques: Uint8Array de 16³ = 4096 entradas */
        this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        /** Mesh Babylon.js, null si no se ha construido aún */
        this.mesh   = null;
        /** true si los datos cambiaron y hay que reconstruir el mesh */
        this.dirty  = true;
    }

    // ── Acceso a bloques ──────────────────────────────────────
    _idx(x, y, z) { return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE; }

    inBounds(x, y, z) {
        return x >= 0 && x < CHUNK_SIZE &&
               y >= 0 && y < CHUNK_SIZE &&
               z >= 0 && z < CHUNK_SIZE;
    }

    getBlock(x, y, z) {
        if (!this.inBounds(x, y, z)) return -1; // fuera del chunk
        return this.blocks[this._idx(x, y, z)];
    }

    setBlock(x, y, z, type) {
        if (!this.inBounds(x, y, z)) return;
        this.blocks[this._idx(x, y, z)] = type;
        this.dirty = true;
    }

    // ── Construcción del mesh ─────────────────────────────────
    /**
     * Construye (o reconstruye) el mesh Babylon.js del chunk.
     * @param {BABYLON.Scene}    scene
     * @param {BABYLON.Material} material  – material con atlas de texturas
     * @param {World}            world     – referencia al mundo para vecinos
     */
    buildMesh(scene, material, world) {
        // Liberar mesh anterior si existe
        if (this.mesh) {
            this.mesh.dispose();
            this.mesh = null;
        }

        const positions = [];
        const normals   = [];
        const uvs       = [];
        const indices   = [];
        let vc = 0; // vertex count

        const ox = this.cx * CHUNK_SIZE; // world offset
        const oy = this.cy * CHUNK_SIZE;
        const oz = this.cz * CHUNK_SIZE;

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const blockType = this.blocks[this._idx(lx, ly, lz)];
                    if (blockType === BlockType.AIR) continue;

                    const atlas = BlockAtlas[blockType];
                    if (!atlas) continue;

                    for (const face of FACE_DEFS) {
                        // ── Comprobar vecino ─────────────────────────────
                        const nx = lx + face.dir[0];
                        const ny = ly + face.dir[1];
                        const nz = lz + face.dir[2];

                        let neighborType;
                        if (this.inBounds(nx, ny, nz)) {
                            neighborType = this.blocks[this._idx(nx, ny, nz)];
                        } else {
                            // Consultar chunk vecino a través del world
                            neighborType = world.getBlock(ox + nx, oy + ny, oz + nz);
                        }

                        // Ocultar cara si el vecino es sólido y opaco
                        if (neighborType !== undefined && neighborType !== null && neighborType !== -1) {
                            const nProps = BlockProperties[neighborType];
                            if (nProps && nProps.solid && !nProps.transparent) continue;
                        }

                        // ── UV del atlas ─────────────────────────────────
                        const tileId = atlas[face.faceKey];
                        const { u0, u1, v0, v1 } = tileUV(tileId);

                        // ── Añadir 4 vértices ────────────────────────────
                        for (const [vx, vy, vz] of face.verts) {
                            positions.push(ox + lx + vx, oy + ly + vy, oz + lz + vz);
                            normals.push(...face.normal);
                        }

                        // UVs en orden V0→V1→V2→V3
                        uvs.push(
                            u0, v0,
                            u0, v1,
                            u1, v1,
                            u1, v0
                        );

                        // 2 triángulos: 0-1-2 y 0-2-3
                        indices.push(vc, vc+1, vc+2, vc, vc+2, vc+3);
                        vc += 4;
                    }
                }
            }
        }

        if (vc === 0) {
            this.dirty = false;
            return; // chunk vacío
        }

        // ── Crear mesh Babylon.js ─────────────────────────────
        const mesh      = new BABYLON.Mesh(`chunk_${this.cx}_${this.cy}_${this.cz}`, scene);
        const vtxData   = new BABYLON.VertexData();
        vtxData.positions = new Float32Array(positions);
        vtxData.normals   = new Float32Array(normals);
        vtxData.uvs       = new Float32Array(uvs);
        vtxData.indices   = new Int32Array(indices);
        vtxData.applyToMesh(mesh, false);

        mesh.material   = material;
        mesh.isPickable = false; // el picking se hace con ray march manual
        mesh.freezeWorldMatrix();

        this.mesh  = mesh;
        this.dirty = false;
    }

    dispose() {
        if (this.mesh) { this.mesh.dispose(); this.mesh = null; }
    }
}
