// ============================================================
//  mob.js – Sistema de Mobs (Ovejas y Zombis) con física y IA
// ============================================================

import { BlockProperties } from './block.js';

// Dimensiones aproximadas de los mobs
const MOB_WIDTH = 0.4;
const MOB_HEIGHT = 0.8; // Altura del AABB del mob (mitad es 0.4)

export class Mob {
    constructor(type, scene, world, gravity, startPos) {
        this.type = type; // 'zombie' o 'sheep'
        this.scene = scene;
        this.world = world;
        this.gravity = gravity;

        this.position = startPos.clone();
        this.velocity = new BABYLON.Vector3(0, 0, 0);
        this.health = type === 'zombie' ? 30 : 15;
        this.maxHealth = this.health;
        this.speed = type === 'zombie' ? 3.0 : 1.5;
        this.onGround = false;

        // Timers e IA
        this.wanderTimer = 0;
        this.wanderDir = new BABYLON.Vector3(0, 0, 0);
        this.damageCooldown = 0;
        this.hitFlashTimer = 0;

        // Crear modelo visual (malla de cubos articulados)
        this.mesh = this._createVisualModel();
    }

    _createVisualModel() {
        const root = new BABYLON.TransformNode(`mob_${this.type}_root`, this.scene);
        root.position.copyFrom(this.position);

        // Materiales
        const mat = new BABYLON.StandardMaterial(`mob_${this.type}_mat`, this.scene);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.ambientColor = new BABYLON.Color3(1, 1, 1);

        if (this.type === 'zombie') {
            // Cuerpo verde, pantalones azules, camisa cian
            mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2); // Verde zombi
        } else {
            // Lana blanca
            mat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95);
        }

        this.material = mat;

        // Crear una estructura básica: Cuerpo principal y cabeza
        const body = BABYLON.MeshBuilder.CreateBox('body', {
            width: MOB_WIDTH * 2,
            height: MOB_HEIGHT * 1.2,
            depth: MOB_WIDTH * 2
        }, this.scene);
        body.parent = root;
        body.position.y = MOB_HEIGHT;
        body.material = mat;

        // Cabeza
        const head = BABYLON.MeshBuilder.CreateBox('head', {
            width: MOB_WIDTH * 1.2,
            height: MOB_WIDTH * 1.2,
            depth: MOB_WIDTH * 1.2
        }, this.scene);
        head.parent = root;
        head.position.y = MOB_HEIGHT * 1.8;
        head.material = mat;

        if (this.type === 'zombie') {
            const headMat = new BABYLON.StandardMaterial('zombie_head_mat', this.scene);
            const zTex = new BABYLON.DynamicTexture('zTex', {width: 64, height: 64}, this.scene);
            const zCtx = zTex.getContext();
            zCtx.fillStyle = '#196619'; zCtx.fillRect(0,0,64,64); // fondo
            zCtx.fillStyle = '#000000'; zCtx.fillRect(8, 24, 16, 12); zCtx.fillRect(40, 24, 16, 12); // ojos
            zTex.update(true);
            zTex.anisotropicFilteringLevel = 1;
            zTex.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
            headMat.diffuseTexture = zTex;
            headMat.specularColor = new BABYLON.Color3(0,0,0);
            head.material = headMat;
            this.headMesh = head;
        } else {
            // Cara para la oveja
            const face = BABYLON.MeshBuilder.CreateBox('face', {
                width: MOB_WIDTH * 0.8,
                height: MOB_WIDTH * 0.8,
                depth: MOB_WIDTH * 0.8
            }, this.scene);
            face.parent = head;
            face.position.z = MOB_WIDTH * 0.5;
            face.position.y = -MOB_WIDTH * 0.2;
            const faceMat = new BABYLON.StandardMaterial('sheep_face_mat', this.scene);
            const sTex = new BABYLON.DynamicTexture('sTex', {width: 64, height: 64}, this.scene);
            const sCtx = sTex.getContext();
            sCtx.fillStyle = '#e6b3b3'; sCtx.fillRect(0,0,64,64); // fondo rosado
            sCtx.fillStyle = '#000000'; sCtx.fillRect(10, 20, 10, 10); sCtx.fillRect(44, 20, 10, 10); // ojos
            sCtx.fillStyle = '#cc6666'; sCtx.fillRect(24, 40, 16, 12); // nariz/boca
            sTex.update(true);
            sTex.anisotropicFilteringLevel = 1;
            sTex.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
            faceMat.diffuseTexture = sTex;
            faceMat.specularColor = new BABYLON.Color3(0,0,0);
            face.material = faceMat;
        }

        // Extremidades (Patas/Brazos)
        this.legs = [];
        const legW = MOB_WIDTH * 0.4;
        const legH = MOB_HEIGHT * 0.8;

        for (let i = 0; i < 4; i++) {
            const leg = BABYLON.MeshBuilder.CreateBox(`leg_${i}`, {
                width: legW,
                height: legH,
                depth: legW
            }, this.scene);
            leg.parent = root;
            leg.material = mat;
            // Posicionar patas en las 4 esquinas inferiores
            const dx = (i % 2 === 0 ? 1 : -1) * (MOB_WIDTH * 0.5);
            const dz = (i < 2 ? 1 : -1) * (MOB_WIDTH * 0.5);
            leg.position.set(dx, legH / 2, dz);
            this.legs.push(leg);
        }

        // Si es zombie, los dos primeros legs son brazos levantados
        if (this.type === 'zombie') {
            // Posicionar los brazos a los costados y hacia adelante
            this.legs[0].position.set(MOB_WIDTH * 1.1, MOB_HEIGHT * 1.3, MOB_WIDTH);
            this.legs[0].rotation.x = -Math.PI / 2; // Apunta adelante
            this.legs[1].position.set(-MOB_WIDTH * 1.1, MOB_HEIGHT * 1.3, MOB_WIDTH);
            this.legs[1].rotation.x = -Math.PI / 2; // Apunta adelante
        }

        return root;
    }

    _isSolid(wx, wy, wz) {
        const b = this.world.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
        const p = BlockProperties[b];
        return p ? p.solid : false;
    }

    takeDamage(amount, sourceDir) {
        if (this.damageCooldown > 0) return;
        this.health -= amount;
        this.damageCooldown = 0.2;
        this.hitFlashTimer = 0.2;

        // Knockback (retroceso) alejado del golpe
        const kb = sourceDir.scale(8.0);
        const upVec = this.gravity.upVector;
        // Lanzar un poco hacia arriba y empujar hacia atrás
        this.velocity.addInPlace(kb).addInPlace(upVec.scale(4.0));
        this.onGround = false;

        // Efecto visual instantáneo
        this._setFlashColor(new BABYLON.Color3(1.0, 0.1, 0.1));
    }

    _setFlashColor(color) {
        // Poner color emissivo rojo a todas las partes
        this.mesh.getChildMeshes().forEach(m => {
            if (m.material) {
                m.material.emissiveColor = color;
            }
        });
    }

    _resetFlashColor() {
        this.mesh.getChildMeshes().forEach(m => {
            if (m.material) {
                m.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            }
        });
    }

    update(dt, player) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) {
                this._resetFlashColor();
            }
        }

        const gravDir = this.gravity.direction;
        const upVec = this.gravity.upVector;

        // --- INTELIGENCIA ARTIFICIAL (IA) ---
        let move = BABYLON.Vector3.Zero();
        const distToPlayer = BABYLON.Vector3.Distance(this.position, player.center);

        if (this.type === 'zombie' && distToPlayer < 18) {
            // Perseguir jugador
            const diff = player.center.subtract(this.position);
            // Proyectar diferencia en plano perpendicular a gravedad
            const lateralDiff = diff.subtract(gravDir.scale(BABYLON.Vector3.Dot(diff, gravDir)));
            if (lateralDiff.lengthSquared() > 0.01) {
                move = lateralDiff.normalize().scale(this.speed);
                // Mirar al jugador
                const angle = Math.atan2(lateralDiff.x, lateralDiff.z);
                this.mesh.rotation.y = angle;
            }
            
            // Atacar al jugador si está muy cerca
            if (distToPlayer < 1.4 && player.takeDamage) {
                player.takeDamage(20, this.position.subtract(player.center).normalize());
            }
        } else {
            // Vagabundeo aleatorio (Wander)
            this.wanderTimer -= dt;
            if (this.wanderTimer <= 0) {
                this.wanderTimer = 2.0 + Math.random() * 4.0;
                if (Math.random() < 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    this.wanderDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
                } else {
                    this.wanderDir.setAll(0); // Quedarse quieto
                }
            }

            if (this.wanderDir.lengthSquared() > 0.001) {
                // Mover en la dirección de vagabundeo proyectada en plano de gravedad
                const lateralFwd = this.wanderDir.subtract(gravDir.scale(BABYLON.Vector3.Dot(this.wanderDir, gravDir)));
                if (lateralFwd.lengthSquared() > 0.001) {
                    move = lateralFwd.normalize().scale(this.speed);
                    const angle = Math.atan2(lateralFwd.x, lateralFwd.z);
                    this.mesh.rotation.y = angle;
                }
            }
        }

        // Conservar velocidad vertical
        const gravVelComp = BABYLON.Vector3.Dot(this.velocity, gravDir);
        this.velocity = gravDir.scale(gravVelComp).add(move);

        // Aceleración de gravedad
        this.velocity.addInPlace(this.gravity.acceleration.scale(dt));

        // Resolver movimiento y colisiones eje por eje
        const prevOnGround = this.onGround;
        this.onGround = false;
        this._moveAxis('x', dt, gravDir);
        this._moveAxis('y', dt, gravDir);
        this._moveAxis('z', dt, gravDir);

        // Salto automático si choca horizontalmente mientras quiere avanzar
        if (move.lengthSquared() > 0.1 && prevOnGround && !this.onGround) {
            // Si chocó en horizontal y no está en el aire por salto, intentar saltar
            this.velocity.addInPlace(upVec.scale(6.5));
            this.onGround = false;
        }

        // Sincronizar posición del modelo 3D
        this.mesh.position.copyFrom(this.position);

        // --- ANIMACIÓN DE CAMINAR ---
        if (move.lengthSquared() > 0.05 && this.onGround) {
            const time = performance.now() * 0.008 * this.speed;
            const amp = 0.6;
            if (this.type === 'sheep') {
                // 4 patas balanceándose
                this.legs[0].rotation.x = Math.sin(time) * amp;
                this.legs[1].rotation.x = -Math.sin(time) * amp;
                this.legs[2].rotation.x = -Math.sin(time) * amp;
                this.legs[3].rotation.x = Math.sin(time) * amp;
            } else {
                // Zombi: 2 patas balanceándose (piernas 2 y 3)
                this.legs[2].rotation.x = Math.sin(time) * amp;
                this.legs[3].rotation.x = -Math.sin(time) * amp;
            }
        } else {
            // Reset rotación de extremidades
            const startIdx = this.type === 'zombie' ? 2 : 0;
            for (let i = startIdx; i < 4; i++) {
                this.legs[i].rotation.x = 0;
            }
        }
    }

    _moveAxis(axis, dt, gravDir) {
        this.position[axis] += this.velocity[axis] * dt;

        // Dimensiones del AABB del Mob
        const minX = this.position.x - MOB_WIDTH;
        const maxX = this.position.x + MOB_WIDTH;
        const minY = this.position.y - MOB_HEIGHT * 0.5;
        const maxY = this.position.y + MOB_HEIGHT * 1.5;
        const minZ = this.position.z - MOB_WIDTH;
        const maxZ = this.position.z + MOB_WIDTH;

        const minBX = Math.floor(minX), maxBX = Math.floor(maxX);
        const minBY = Math.floor(minY), maxBY = Math.floor(maxY);
        const minBZ = Math.floor(minZ), maxBZ = Math.floor(maxZ);

        for (let bx = minBX; bx <= maxBX; bx++) {
            for (let by = minBY; by <= maxBY; by++) {
                for (let bz = minBZ; bz <= maxBZ; bz++) {
                    if (!this._isSolid(bx, by, bz)) continue;

                    let overlap = 0;
                    if (axis === 'x') {
                        const ovMin = maxX - bx;
                        const ovMax = (bx + 1) - minX;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    } else if (axis === 'y') {
                        const ovMin = maxY - by;
                        const ovMax = (by + 1) - minY;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    } else {
                        const ovMin = maxZ - bz;
                        const ovMax = (bz + 1) - minZ;
                        if (ovMin <= 0 || ovMax <= 0) continue;
                        overlap = ovMin < ovMax ? -ovMin : ovMax;
                    }

                    this.position[axis] += overlap;

                    if (Math.sign(overlap) !== Math.sign(this.velocity[axis]) || overlap === 0) {
                        const gComp = gravDir[axis];
                        if (Math.abs(gComp) > 0.5) {
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

    dispose() {
        if (this.mesh) {
            this.mesh.dispose(false, true);
        }
        if (this.material) {
            this.material.dispose();
        }
    }
}

export class MobManager {
    constructor(scene, world, gravity) {
        this.scene = scene;
        this.world = world;
        this.gravity = gravity;
        this.mobs = [];
        this.spawnTimer = 0;
    }

    update(dt, player) {
        // Actualizar mobs existentes
        for (let i = this.mobs.length - 1; i >= 0; i--) {
            const mob = this.mobs[i];
            mob.update(dt, player);

            // Eliminar si cae demasiado bajo o muere
            if (mob.health <= 0 || mob.position.y < -30 || mob.position.y > 100) {
                mob.dispose();
                this.mobs.splice(i, 1);
                continue;
            }
        }

        // Spawneo de mobs periódico
        this.spawnTimer += dt;
        if (this.spawnTimer >= 4.0) {
            this.spawnTimer = 0;
            if (this.mobs.length < 10) {
                this.spawnNear(player.center);
            }
        }
    }

    spawnNear(center) {
        // Encontrar una posición aleatoria en un radio
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 15;
        const sx = Math.floor(center.x + Math.sin(angle) * dist);
        const sz = Math.floor(center.z + Math.cos(angle) * dist);

        // Buscar una superficie de bloques de césped
        for (let sy = 30; sy > 0; sy--) {
            const block = this.world.getBlock(sx, sy, sz);
            const above = this.world.getBlock(sx, sy + 1, sz);
            const above2 = this.world.getBlock(sx, sy + 2, sz);

            if (block !== 0 && BlockProperties[block]?.solid && above === 0 && above2 === 0) {
                const type = Math.random() < 0.4 ? 'zombie' : 'sheep';
                const startPos = new BABYLON.Vector3(sx + 0.5, sy + 1.5, sz + 0.5);
                const mob = new Mob(type, this.scene, this.world, this.gravity, startPos);
                this.mobs.push(mob);
                console.log(`[Spawned] Mob ${type} en ${startPos.toString()}`);
                break;
            }
        }
    }

    checkRaycastHit(origin, dir, reach) {
        // Intersección de rayo con cajas de colisión (AABBs) simplificadas de los mobs
        let closestMob = null;
        let closestDist = reach;

        for (const mob of this.mobs) {
            const center = mob.position;
            // Definir AABB del mob
            const minX = center.x - MOB_WIDTH;
            const maxX = center.x + MOB_WIDTH;
            const minY = center.y - MOB_HEIGHT * 0.5;
            const maxY = center.y + MOB_HEIGHT * 1.5;
            const minZ = center.z - MOB_WIDTH;
            const maxZ = center.z + MOB_WIDTH;

            // Intersección Rayo-AABB
            let tmin = -Infinity;
            let tmax = Infinity;

            const bounds = [
                { min: minX, max: maxX, o: origin.x, d: dir.x },
                { min: minY, max: maxY, o: origin.y, d: dir.y },
                { min: minZ, max: maxZ, o: origin.z, d: dir.z },
            ];

            let intersects = true;
            for (const b of bounds) {
                if (Math.abs(b.d) < 0.000001) {
                    if (b.o < b.min || b.o > b.max) {
                        intersects = false;
                        break;
                    }
                } else {
                    let t1 = (b.min - b.o) / b.d;
                    let t2 = (b.max - b.o) / b.d;
                    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                    tmin = Math.max(tmin, t1);
                    tmax = Math.min(tmax, t2);
                    if (tmin > tmax) {
                        intersects = false;
                        break;
                    }
                }
            }

            if (intersects && tmin >= 0 && tmin < closestDist) {
                closestDist = tmin;
                closestMob = mob;
            }
        }

        return closestMob;
    }

    clear() {
        this.mobs.forEach(mob => mob.dispose());
        this.mobs = [];
    }
}
