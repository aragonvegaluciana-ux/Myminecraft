// ============================================================
//  inventory.js – Hotbar con 9 slots de bloques
// ============================================================

import { HotbarBlocks, BlockProperties } from './block.js';

export class Inventory {
    constructor() {
        this.slots        = [...HotbarBlocks];   // 9 tipos de bloque
        this.selectedSlot = 0;                   // índice activo (0–8)
    }

    /** Selecciona slot por índice 0–8 */
    selectSlot(index) {
        if (index < 0 || index >= this.slots.length) return;
        this.selectedSlot = index;
    }

    /** Devuelve el BlockType del slot activo */
    getSelectedBlock() {
        return this.slots[this.selectedSlot];
    }

    /** Devuelve el nombre del bloque activo */
    getSelectedName() {
        const b = this.getSelectedBlock();
        return BlockProperties[b]?.name ?? 'Desconocido';
    }

    /** Desplazamiento con rueda del ratón: delta = +1 / -1 */
    scroll(delta) {
        const len = this.slots.length;
        this.selectedSlot = ((this.selectedSlot + delta) % len + len) % len;
    }
}
