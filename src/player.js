// ============================================================
//  player.js – Física del jugador con soporte de antigravedad
// ============================================================

import { BlockType, BlockProperties } from './block.js';

// Half-extents del AABB del jugador
const HX = 0.38;  // mitad ancho
const HY = 0.9;   // mitad alto (altura total 1.8)
const HZ = 0.38;  // mitad profundidad

const MOVE_SPEED    = 5.5;   // m/s horizontal
const JUMP_SPEED    = 9.0;   // m/s impulso de salto
const REACH         = 5.5;   // bloques máximo de alcance
const RAY_STEP      = 0.05;  // paso del ray march
const BREAK_DELAY   = 0.25;  // segundos entre rompidas
const PLACE_DELAY   = 0.3;   // segundos entre colocaciones
const MAX_SPEED_V   = 40;    // velocidad vertical máxima

export class Player {
    /**
     * @param {BABYLON.Scene}   scene
     * @param {BABYLON.Camera}  camera
     * @param {World}           world
     * @param {GravitySystem}   gravity
     * @param {Inventory}       inventory
     */
    constructor(scene, camera, world, gravity, inventory) {
        this.scene     = scene;
        this.camera    = camera;
        this.world     = world;
        this.gravity   = gravity;
        this.inventory = inventory;

        // Posición CENTRO del AABB en coordenadas mundo
        // Arranca encima del bloque de césped Y=8 → techo Y=9, centro Y=9+0.9=9.9
        this.center   = new BABYLON.Vector3(8.5, 9.9, 8.5);
        this.velocity = new BABYLON.Vector3(0, 0, 0);

        this.onGround  = false;
        this._canJump  = false; // small debounce

        // Ray cast hit
        this.hitBlockPos  = null; // Vector3 (coords enteras)
        this.placePos     = null; // Vector3 donde colocar

        // Cooldowns
        this._breakTimer  = 0;
        this._placeTimer  = 0;
        this._jumpTimer   = 0;

        // Health system
        this.health = 100;
        this.maxHealth = 100;
        this.damageCooldown = 0;
        this.regenTimer = 0;

        // Input state
        this.keys = {};
        this._setupInput();
    }

    _setupInput() {
        window.addEventListener('keydown', e => { this.keys[e.code] = true;  });
        window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
    }

    // ── AABB helpers ──────────────────────────────────────────
    get minX() { return this.center.x - HX; }
    get maxX() { return this.center.x + HX; }
    get minY() { return this.center.y - HY; }
    get maxY() { return this.center.y + HY; }
    get minZ() { return this.center.z - HZ; }
    get maxZ() { return this.center.z + HZ; }

    // ── Mundo ─────────────────────────────────────────────────
    _isSolid(wx, wy, wz) {
        const b = this.world.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
        const p = BlockProperties[b];
        return p ? p.solid : false;
    }

    // ── Movimiento y colisiones ───────────────────────────────
    update(dt) {
        // Cooldowns
        this._breakTimer = Math.max(0, this._breakTimer - dt);
        this._placeTimer = Math.max(0, this._placeTimer - dt);
        this._jumpTimer  = Math.max(0, this._jumpTimer  - dt);
        this.damageCooldown = Math.max(0, this.damageCooldown - dt);
        this.regenTimer = Math.max(0, this.regenTimer - dt);

        // Regeneración pasiva
        if (this.regenTimer <= 0 && this.health < this.maxHealth) {
            this.health = Math.min(this.maxHealth, this.health + 8 * dt); // 8 HP por segundo
        }

        const gravDir = this.gravity.direction;  // vector normalizado

        // ── Ejes de movimiento ────────────────────────────────
        // Proyectar forward de la cámara en el plano ⊥ a gravDir
        const camFwd = this._cameraForward();
        const upVec  = this.gravity.upVector;

        let fwd   = camFwd.subtract(gravDir.scale(BABYLON.Vector3.Dot(camFwd, gravDir)));
        if (fwd.lengthSquared() > 0.0001) fwd.normalize(); else fwd.set(0,0,1);

        const right = BABYLON.Vector3.Cross(fwd, upVec);
        if (right.lengthSquared() > 0.0001) right.normalize();

        // ── Input ─────────────────────────────────────────────
        let move = BABYLON.Vector3.Zero();
        if (this.keys['KeyW'] || this.keys['ArrowUp'])    move.addInPlace(fwd);
        if (this.keys['KeyS'] || this.keys['ArrowDown'])  move.subtractInPlace(fwd);
        if (this.keys['KeyD'] || this.keys['ArrowRight']) move.addInPlace(right);
        if (this.keys['KeyA'] || this.keys['ArrowLeft'])  move.subtractInPlace(right);

        if (move.lengthSquared() > 0.0001) move.normalize().scaleInPlace(MOVE_SPEED);

        // Aplicar velocidad lateral (preservar componente gravitacional)
        const gravVelComp = BABYLON.Vector3.Dot(this.velocity, gravDir);
        const gravVelVec  = gravDir.scale(gravVelComp);
        this.velocity     = gravVelVec.add(move);

        // ── Salto ─────────────────────────────────────────────
        if (this.keys['Space'] && this.onGround && this._jumpTimer <= 0) {
            // Impulso en dirección contraria a la gravedad
            const jumpVec = upVec.scale(JUMP_SPEED);
            this.velocity.addInPlace(jumpVec);
            this.onGround  = false;
            this._jumpTimer = 0.25; // debounce
        }

        // ── Gravedad ──────────────────────────────────────────
        const gravAccel = this.gravity.acceleration;
        this.velocity.addInPlace(gravAccel.scale(dt));

        // Limitar velocidad en el eje gravitatorio
        const speedOnGrav = BABYLON.Vector3.Dot(this.velocity, gravDir);
        if (Math.abs(speedOnGrav) > MAX_SPEED_V) {
            const excess = speedOnGrav - Math.sign(speedOnGrav) * MAX_SPEED_V;
            this.velocity.subtractInPlace(gravDir.scale(excess));
        }

        // ── Mover y resolver colisiones eje por eje ───────────
        this.onGround = false;
        this._moveAxis('x', dt, gravDir);
        this._moveAxis('y', dt, gravDir);
        this._moveAxis('z', dt, gravDir);

        // ── Cámara ────────────────────────────────────────────
        // Eye height: 0.7 × altura total desde la base del AABB
        const eyeOffset = upVec.scale(HY * 0.75);
        this.camera.position = this.center.add(eyeOffset);

        // Ray cast para pick de bloques
        this._updateRayCast();
    }

    _moveAxis(axis, dt, gravDir) {
        // Mover en el eje
        this.center[axis] += this.velocity[axis] * dt;

        // Resolver colisiones AABB vs mundo
        const minBX = Math.floor(this.minX), maxBX = Math.floor(this.maxX);
        const minBY = Math.floor(this.minY), maxBY = Math.floor(this.maxY);
        const minBZ = Math.floor(this.minZ), maxBZ = Math.floor(this.maxZ);

        for (let bx = minBX; bx <= maxBX; bx++) {
            for (let by = minBY; by <= maxBY; by++) {
                for (let bz = minBZ; bz <= maxBZ; bz++) {
                    if (!this._isSolid(bx, by, bz)) continue;

                    // Solapamiento en este eje
                    let overlap = 0;
                    if (axis === 'x') {
                        const ovMin = this.maxX - bx;
                        const ovMax = (bx + 1) - this.minX;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    } else if (axis === 'y') {
                        const ovMin = this.maxY - by;
                        const ovMax = (by + 1) - this.minY;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    } else {
                        const ovMin = this.maxZ - bz;
                        const ovMax = (bz + 1) - this.minZ;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    }

                    // Empujar al jugador fuera del bloque
                    this.center[axis] += overlap;

                    // Cancelar velocidad en ese eje
                    if (Math.sign(overlap) !== Math.sign(this.velocity[axis]) || overlap === 0) {
                        // Detectar si tocamos el "suelo" (colisión en dirección de gravedad)
                        const gComp = gravDir[axis];
                        if (Math.abs(gComp) > 0.5) {
                            // ¿El empuje fue en dirección contraria a la gravedad?
                            if (Math.sign(overlap) !== Math.sign(gComp)) {
                                this.onGround = true;
                            }
                        }
                        this.velocity[axis] = 0;
                    }
                }
            }
        }
    }

    _cameraForward() {
        // Obtener forward real de la cámara (en Babylon.js positive Z es hacia adelante)
        const m    = this.camera.getWorldMatrix();
        const fwd  = new BABYLON.Vector3(m.m[8], m.m[9], m.m[10]);
        return fwd.normalize();
    }

    _updateRayCast() {
        const origin = this.camera.position;
        const dir    = this._cameraForward();

        let prev = null;
        this.hitBlockPos = null;
        this.placePos    = null;

        for (let t = 0.1; t <= REACH; t += RAY_STEP) {
            const pt  = origin.add(dir.scale(t));
            const bx  = Math.floor(pt.x);
            const by  = Math.floor(pt.y);
            const bz  = Math.floor(pt.z);
            const blk = this.world.getBlock(bx, by, bz);
            const p   = BlockProperties[blk];

            if (p && p.solid) {
                this.hitBlockPos = new BABYLON.Vector3(bx, by, bz);
                if (prev) {
                    this.placePos = new BABYLON.Vector3(
                        Math.floor(prev.x),
                        Math.floor(prev.y),
                        Math.floor(prev.z)
                    );
                }
                return;
            }
            prev = pt.clone();
        }
    }

    // ── Interacción con bloques ───────────────────────────────
    breakBlock() {
        if (!this.hitBlockPos || this._breakTimer > 0) return;
        const bx = this.hitBlockPos.x, by = this.hitBlockPos.y, bz = this.hitBlockPos.z;
        if (this.world.getBlock(bx, by, bz) === BlockType.BEDROCK) {
            if (this.ui) this.ui.notify('❌ Bedrock indestructible', 'error');
            return;
        }
        this.world.setBlock(bx, by, bz, BlockType.AIR);
        this._breakTimer = BREAK_DELAY;
    }

    placeBlock() {
        if (!this.placePos || this._placeTimer > 0) return;

        const px = this.placePos.x, py = this.placePos.y, pz = this.placePos.z;

        // No colocar dentro del jugador
        if (px + 1 > this.minX && px < this.maxX &&
            py + 1 > this.minY && py < this.maxY &&
            pz + 1 > this.minZ && pz < this.maxZ) return;

        this.world.setBlock(px, py, pz, this.inventory.getSelectedBlock());
        this._placeTimer = PLACE_DELAY;
    }

    takeDamage(amount, sourceDir) {
        if (this.damageCooldown > 0 || this.health <= 0) return;

        this.health = Math.max(0, this.health - amount);
        this.damageCooldown = 0.8; // invulnerabilidad de 0.8s
        this.regenTimer = 5.0; // resetear regeneración por 5s

        // Aplicar knockback (fuerza opuesta al atacante)
        const kbForce = 9.0;
        const upVec = this.gravity.upVector;
        this.velocity.copyFrom(sourceDir.scale(-kbForce).add(upVec.scale(3.5)));
        this.onGround = false;

        // Efectos en la UI
        if (this.ui) {
            this.ui.notify('💥 ¡Recibiste daño!', 'error');
            if (this.ui.flashDamage) this.ui.flashDamage();
        }

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        if (this.ui) {
            this.ui.notify('💀 ¡Has muerto!', 'error');
        }
        // Respawn en posición segura
        setTimeout(() => {
            this.center.set(8.5, 9.9, 8.5);
            this.velocity.setAll(0);
            this.health = this.maxHealth;
            if (this.ui) this.ui.notify('✨ Respawned', 'success');
        }, 1500);
    }
}
