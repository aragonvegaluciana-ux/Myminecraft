// ============================================================
//  block.js – Tipos de bloques, propiedades y atlas de texturas
// ============================================================

export const BlockType = {
    AIR:     0,
    GRASS:   1,
    DIRT:    2,
    STONE:   3,
    WOOD:    4,
    LEAVES:  5,
    SAND:    6,
    GLASS:   7,
    BRICK:   8,
    SNOW:    9,
    BEDROCK: 10,
};

// Índice de tile en el atlas (grilla 16×16, cada tile 16×16 px)
// Tile ID → col = id % 16, row = floor(id / 16)
export const TILE = {
    GRASS_TOP:   0,
    GRASS_SIDE:  1,
    DIRT:        2,
    STONE:       3,
    WOOD_TOP:    4,
    WOOD_SIDE:   5,
    LEAVES:      6,
    SAND:        7,
    GLASS:       8,
    BRICK:       9,
    SNOW_TOP:    10,
    SNOW_SIDE:   11,
    BEDROCK:     12,
};

// { top, side, bottom } → índice de tile del atlas
export const BlockAtlas = {
    [BlockType.GRASS]:   { top: TILE.GRASS_TOP,  side: TILE.GRASS_SIDE, bottom: TILE.DIRT     },
    [BlockType.DIRT]:    { top: TILE.DIRT,        side: TILE.DIRT,       bottom: TILE.DIRT     },
    [BlockType.STONE]:   { top: TILE.STONE,       side: TILE.STONE,      bottom: TILE.STONE    },
    [BlockType.WOOD]:    { top: TILE.WOOD_TOP,    side: TILE.WOOD_SIDE,  bottom: TILE.WOOD_TOP },
    [BlockType.LEAVES]:  { top: TILE.LEAVES,      side: TILE.LEAVES,     bottom: TILE.LEAVES   },
    [BlockType.SAND]:    { top: TILE.SAND,        side: TILE.SAND,       bottom: TILE.SAND     },
    [BlockType.GLASS]:   { top: TILE.GLASS,       side: TILE.GLASS,      bottom: TILE.GLASS    },
    [BlockType.BRICK]:   { top: TILE.BRICK,       side: TILE.BRICK,      bottom: TILE.BRICK    },
    [BlockType.SNOW]:    { top: TILE.SNOW_TOP,    side: TILE.SNOW_SIDE,  bottom: TILE.DIRT     },
    [BlockType.BEDROCK]: { top: TILE.BEDROCK,     side: TILE.BEDROCK,    bottom: TILE.BEDROCK  },
};

export const BlockProperties = {
    [BlockType.AIR]:     { solid: false, transparent: true,  name: 'Aire',      icon: '🌫️',  color: '#ccc'    },
    [BlockType.GRASS]:   { solid: true,  transparent: false, name: 'Césped',    icon: '🟩',  color: '#5D9B3C' },
    [BlockType.DIRT]:    { solid: true,  transparent: false, name: 'Tierra',    icon: '🟫',  color: '#8B5E3C' },
    [BlockType.STONE]:   { solid: true,  transparent: false, name: 'Piedra',    icon: '⬜',  color: '#808080' },
    [BlockType.WOOD]:    { solid: true,  transparent: false, name: 'Madera',    icon: '🟤',  color: '#9C6B2E' },
    [BlockType.LEAVES]:  { solid: true,  transparent: true,  name: 'Hojas',     icon: '🌿',  color: '#2E7D32' },
    [BlockType.SAND]:    { solid: true,  transparent: false, name: 'Arena',     icon: '🟡',  color: '#D4BC74' },
    [BlockType.GLASS]:   { solid: true,  transparent: true,  name: 'Vidrio',    icon: '💠',  color: '#87CEEB' },
    [BlockType.BRICK]:   { solid: true,  transparent: false, name: 'Ladrillo',  icon: '🧱',  color: '#B04040' },
    [BlockType.SNOW]:    { solid: true,  transparent: false, name: 'Nieve',     icon: '⬜',  color: '#EEF5FF' },
    [BlockType.BEDROCK]: { solid: true,  transparent: false, name: 'Bedrock',   icon: '⬛',  color: '#282828' },
};

// Bloques disponibles en la hotbar (9 slots)
export const HotbarBlocks = [
    BlockType.GRASS,
    BlockType.DIRT,
    BlockType.STONE,
    BlockType.WOOD,
    BlockType.LEAVES,
    BlockType.SAND,
    BlockType.GLASS,
    BlockType.BRICK,
    BlockType.SNOW,
];

// ── Generación procedural del atlas de texturas ───────────────
const ATLAS_COLS = 16;  // tiles por fila
const TILE_PX   = 16;   // píxeles por tile
const ATLAS_PX  = ATLAS_COLS * TILE_PX; // 256×256

function rnd(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function noise(v, range) { return v + (Math.random() * 2 - 1) * range; }

function tileOrigin(id) {
    return { tx: (id % ATLAS_COLS) * TILE_PX, ty: Math.floor(id / ATLAS_COLS) * TILE_PX };
}

function fillTile(ctx, id, fn) {
    const { tx, ty } = tileOrigin(id);
    fn(ctx, tx, ty, TILE_PX);
}

function drawNoisy(ctx, tx, ty, r, g, b, variance = 15) {
    for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) {
            const v = (Math.random() * 2 - 1) * variance;
            ctx.fillStyle = `rgb(${clamp(r+v,0,255)|0},${clamp(g+v,0,255)|0},${clamp(b+v,0,255)|0})`;
            ctx.fillRect(tx + px, ty + py, 1, 1);
        }
    }
}

export function createTextureAtlas(scene) {
    const dynTex = new BABYLON.DynamicTexture(
        'blockAtlas',
        { width: ATLAS_PX, height: ATLAS_PX },
        scene,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE
    );

    const ctx = dynTex.getContext();
    ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);

    // 0 – Grass Top (verde con ruido)
    fillTile(ctx, TILE.GRASS_TOP, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 72, 148, 45, 18);
    });

    // 1 – Grass Side
    fillTile(ctx, TILE.GRASS_SIDE, (ctx, tx, ty) => {
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                const v = (Math.random() * 2 - 1) * 12;
                let r, g, b;
                if (py < 4) { r = 72; g = 148; b = 45; }  // franja verde
                else         { r = 134; g = 96; b = 67; }  // tierra
                ctx.fillStyle = `rgb(${clamp(r+v,0,255)|0},${clamp(g+v,0,255)|0},${clamp(b+v,0,255)|0})`;
                ctx.fillRect(tx + px, ty + py, 1, 1);
            }
        }
    });

    // 2 – Dirt
    fillTile(ctx, TILE.DIRT, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 134, 96, 67, 14);
    });

    // 3 – Stone (gris con grietas)
    fillTile(ctx, TILE.STONE, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 120, 120, 120, 18);
        ctx.fillStyle = '#707070';
        for (let i = 0; i < 4; i++) {
            const px = rnd(1, TILE_PX - 3)|0;
            const py = rnd(1, TILE_PX - 3)|0;
            ctx.fillRect(tx + px, ty + py, rnd(2,5)|0, 1);
        }
    });

    // 4 – Wood Top (anillos concéntricos)
    fillTile(ctx, TILE.WOOD_TOP, (ctx, tx, ty) => {
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                const dx = px - 7.5, dy = py - 7.5;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const ring = (dist % 3.5) < 1.8;
                const v = (Math.random() * 2 - 1) * 10;
                const r = ring ? 120 : 158, g = ring ? 78 : 108, b = ring ? 38 : 58;
                ctx.fillStyle = `rgb(${clamp(r+v,0,255)|0},${clamp(g+v,0,255)|0},${clamp(b+v,0,255)|0})`;
                ctx.fillRect(tx + px, ty + py, 1, 1);
            }
        }
    });

    // 5 – Wood Side (franjas verticales)
    fillTile(ctx, TILE.WOOD_SIDE, (ctx, tx, ty) => {
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                const stripe = (px % 4) < 2;
                const v = (Math.random() * 2 - 1) * 10;
                const r = stripe ? 140 : 168, g = stripe ? 95 : 118, b = stripe ? 50 : 68;
                ctx.fillStyle = `rgb(${clamp(r+v,0,255)|0},${clamp(g+v,0,255)|0},${clamp(b+v,0,255)|0})`;
                ctx.fillRect(tx + px, ty + py, 1, 1);
            }
        }
    });

    // 6 – Leaves (verde oscuro con huecos)
    fillTile(ctx, TILE.LEAVES, (ctx, tx, ty) => {
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                if (Math.random() > 0.18) {
                    const v = (Math.random() * 2 - 1) * 20;
                    ctx.fillStyle = `rgb(${clamp(38+v,0,255)|0},${clamp(105+v,0,255)|0},${clamp(30+v,0,255)|0})`;
                    ctx.fillRect(tx + px, ty + py, 1, 1);
                }
            }
        }
    });

    // 7 – Sand
    fillTile(ctx, TILE.SAND, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 210, 190, 138, 14);
    });

    // 8 – Glass (semitransparente con marco)
    fillTile(ctx, TILE.GLASS, (ctx, tx, ty) => {
        ctx.fillStyle = 'rgba(160,215,255,0.55)';
        ctx.fillRect(tx, ty, TILE_PX, TILE_PX);
        ctx.fillStyle = 'rgba(220,240,255,0.9)';
        ctx.fillRect(tx, ty, TILE_PX, 2);
        ctx.fillRect(tx, ty + TILE_PX - 2, TILE_PX, 2);
        ctx.fillRect(tx, ty, 2, TILE_PX);
        ctx.fillRect(tx + TILE_PX - 2, ty, 2, TILE_PX);
    });

    // 9 – Brick (rojo con líneas de mortero)
    fillTile(ctx, TILE.BRICK, (ctx, tx, ty) => {
        // Fondo ladrillo con ruido
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                const v = (Math.random() * 2 - 1) * 14;
                ctx.fillStyle = `rgb(${clamp(178+v,0,255)|0},${clamp(72+v,0,255)|0},${clamp(55+v,0,255)|0})`;
                ctx.fillRect(tx + px, ty + py, 1, 1);
            }
        }
        // Mortero horizontal
        ctx.fillStyle = '#c0b8b0';
        for (let py = 0; py < TILE_PX; py += 8) ctx.fillRect(tx, ty + py, TILE_PX, 2);
        // Mortero vertical (alternado)
        ctx.fillStyle = '#c0b8b0';
        for (let row = 0; row < 2; row++) {
            const offset = row % 2 === 0 ? 8 : 0;
            for (let px = offset; px < TILE_PX; px += 16) {
                ctx.fillRect(tx + px, ty + row * 8, 2, 6);
            }
        }
    });

    // 10 – Snow Top
    fillTile(ctx, TILE.SNOW_TOP, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 235, 245, 255, 10);
    });

    // 11 – Snow Side (blanco arriba, tierra abajo)
    fillTile(ctx, TILE.SNOW_SIDE, (ctx, tx, ty) => {
        for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
                const v = (Math.random() * 2 - 1) * 10;
                let r, g, b;
                if (py < 4) { r = 235; g = 245; b = 255; }
                else         { r = 134; g = 96;  b = 67;  }
                ctx.fillStyle = `rgb(${clamp(r+v,0,255)|0},${clamp(g+v,0,255)|0},${clamp(b+v,0,255)|0})`;
                ctx.fillRect(tx + px, ty + py, 1, 1);
            }
        }
    });

    // 12 – Bedrock
    fillTile(ctx, TILE.BEDROCK, (ctx, tx, ty) => {
        drawNoisy(ctx, tx, ty, 38, 38, 42, 12);
        ctx.fillStyle = '#1a1a1e';
        for (let i = 0; i < 6; i++) {
            ctx.fillRect(tx + rnd(0, TILE_PX - 4)|0, ty + rnd(0, TILE_PX - 4)|0, rnd(2,5)|0, rnd(2,5)|0);
        }
    });

    dynTex.update(false);
    dynTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    dynTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    // --- CARGA ASÍNCRONA DE PAQUETE DE TEXTURAS (Opcional) ---
    // Si existen archivos PNG individuales en la carpeta "textures/", reemplazan las texturas procedimentales.
    const tileNames = {
        [TILE.GRASS_TOP]: 'grass_top.png',
        [TILE.GRASS_SIDE]: 'grass_side.png',
        [TILE.DIRT]: 'dirt.png',
        [TILE.STONE]: 'stone.png',
        [TILE.WOOD_TOP]: 'wood_top.png',
        [TILE.WOOD_SIDE]: 'wood_side.png',
        [TILE.LEAVES]: 'leaves.png',
        [TILE.SAND]: 'sand.png',
        [TILE.GLASS]: 'glass.png',
        [TILE.BRICK]: 'brick.png',
        [TILE.SNOW_TOP]: 'snow_top.png',
        [TILE.SNOW_SIDE]: 'snow_side.png',
        [TILE.BEDROCK]: 'bedrock.png'
    };

    Object.entries(tileNames).forEach(([tileId, fileName]) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Evitar que la imagen corrompa el lienzo por seguridad
        img.onload = () => {
            try {
                const { tx, ty } = tileOrigin(parseInt(tileId));
                // Dibujar la textura personalizada sobre la textura procedimental
                ctx.clearRect(tx, ty, TILE_PX, TILE_PX);
                ctx.drawImage(img, tx, ty, TILE_PX, TILE_PX);
                dynTex.update(false);
                console.log(`[Textura cargada]: textures/${fileName}`);
            } catch (e) {
                console.error(`[Error actualizando textura] textures/${fileName}:`, e);
            }
        };
        img.onerror = () => {
            // Ignorar errores (404), mantiene el fallback procedimental
        };
        img.src = `textures/${fileName}`;
    });

    return dynTex;
}

// UV en el atlas para un tile dado
// Devuelve { u0, u1, v0, v1 } en coordenadas [0,1]
export function tileUV(tileId) {
    const col = tileId % ATLAS_COLS;
    const row = Math.floor(tileId / ATLAS_COLS);
    return {
        u0: col / ATLAS_COLS,
        u1: (col + 1) / ATLAS_COLS,
        v0: 1.0 - (row + 1) / ATLAS_COLS,
        v1: 1.0 - row / ATLAS_COLS,
    };
}
