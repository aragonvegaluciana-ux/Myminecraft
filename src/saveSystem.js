// ============================================================
//  saveSystem.js – Guardado/carga en localStorage
// ============================================================

const KEY_WORLD  = 'myminecraft_world_v1';
const KEY_PLAYER = 'myminecraft_player_v1';

export class SaveSystem {
    constructor(world, player) {
        this.world  = world;
        this.player = player;
        this._autoTimer = 0;
        this._autoInterval = 60; // segundos
    }

    /** Guarda el mundo y la posición del jugador */
    save() {
        try {
            const worldData  = this.world.serialize();
            const playerData = JSON.stringify({
                x: this.player.center.x,
                y: this.player.center.y,
                z: this.player.center.z,
            });
            localStorage.setItem(KEY_WORLD,  worldData);
            localStorage.setItem(KEY_PLAYER, playerData);
            return true;
        } catch (e) {
            console.warn('Error al guardar:', e);
            return false;
        }
    }

    /** Carga el mundo y la posición del jugador */
    load() {
        try {
            const worldData  = localStorage.getItem(KEY_WORLD);
            const playerData = localStorage.getItem(KEY_PLAYER);

            if (worldData)  this.world.deserialize(worldData);
            if (playerData) {
                const p = JSON.parse(playerData);
                this.player.center.set(p.x, p.y, p.z);
                this.player.velocity.setAll(0);
            }
            return !!(worldData || playerData);
        } catch (e) {
            console.warn('Error al cargar:', e);
            return false;
        }
    }

    /** Comprueba si existe una partida guardada */
    hasSave() {
        return !!localStorage.getItem(KEY_WORLD);
    }

    /** Borra la partida guardada */
    deleteSave() {
        localStorage.removeItem(KEY_WORLD);
        localStorage.removeItem(KEY_PLAYER);
    }

    /** Llamar en el game loop; guarda automáticamente cada N segundos */
    update(dt) {
        this._autoTimer += dt;
        if (this._autoTimer >= this._autoInterval) {
            this._autoTimer = 0;
            this.save();
        }
    }
}
