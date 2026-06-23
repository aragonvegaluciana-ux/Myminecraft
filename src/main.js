// ============================================================
//  main.js – Punto de entrada: engine, escena, game loop
// ============================================================

import { World }       from './world.js';
import { Player }      from './player.js';
import { GravitySystem } from './gravity.js';
import { Inventory }   from './inventory.js';
import { UI }          from './ui.js';
import { SaveSystem }  from './saveSystem.js';
import { createTextureAtlas } from './block.js';
import { MobManager }  from './mob.js';

// ── Bootstrap ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        disableWebGL2Support: false,
    });

    // Mostrar advertencia si no hay WebGL2
    if (!engine.webGLVersion || engine.webGLVersion < 2) {
        console.warn('WebGL2 no disponible, usando WebGL1.');
    }

    const game = new Game(canvas, engine);

    engine.runRenderLoop(() => game.loop());

    window.addEventListener('resize', () => engine.resize());
    window.addEventListener('beforeunload', () => game.saveSystem?.save());
});

// ── Clase principal del juego ─────────────────────────────────
class Game {
    constructor(canvas, engine) {
        this.canvas  = canvas;
        this.engine  = engine;
        this.locked  = false;   // pointer lock
        this.paused  = false;

        // ── Escena Babylon.js ─────────────────────────────────
        this.scene = new BABYLON.Scene(engine);
        this.scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.98, 1); // cielo azul claro
        this.scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        this.scene.fogMode    = BABYLON.Scene.FOGMODE_LINEAR;
        this.scene.fogStart   = 48;
        this.scene.fogEnd     = 72;
        this.scene.fogColor   = new BABYLON.Color3(0.53, 0.81, 0.98);

        // ── Cámara manual (sin inputs de Babylon) ─────────────
        this.camera = new BABYLON.UniversalCamera(
            'playerCam',
            new BABYLON.Vector3(8.5, 10.5, 8.5),
            this.scene
        );
        this.camera.minZ    = 0.08;
        this.camera.maxZ    = 256;
        this.camera.fov     = 1.1; // ~63°
        this.camera.inputs.clear();

        // Rotación de cámara (pitch / yaw acumulados)
        this._pitch = 0;
        this._yaw   = 0;
        this._sensitivity = 0.0018;

        // ── Iluminación ───────────────────────────────────────
        this.sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-1, -2, -1), this.scene);
        this.sun.intensity  = 1.0;
        this.sun.diffuse    = new BABYLON.Color3(1, 0.97, 0.88);
        this.sun.specular   = new BABYLON.Color3(0.1, 0.1, 0.1);

        this.ambLight = new BABYLON.HemisphericLight('ambLight', new BABYLON.Vector3(0,1,0), this.scene);
        this.ambLight.intensity = 0.35;
        this.ambLight.groundColor = new BABYLON.Color3(0.15, 0.12, 0.1);

        // ── Material del mundo ────────────────────────────────
        const atlas = createTextureAtlas(this.scene);

        this.chunkMaterial = new BABYLON.StandardMaterial('chunkMat', this.scene);
        this.chunkMaterial.diffuseTexture  = atlas;
        this.chunkMaterial.ambientColor    = new BABYLON.Color3(1,1,1);
        this.chunkMaterial.specularColor   = new BABYLON.Color3(0,0,0);
        this.chunkMaterial.backFaceCulling = true;

        // ── Sistemas del juego ────────────────────────────────
        this.gravity   = new GravitySystem();
        this.inventory = new Inventory();
        this.world     = new World(this.scene, this.chunkMaterial);
        this.player    = new Player(this.scene, this.camera, this.world, this.gravity, this.inventory);
        this.ui        = new UI(this.inventory);
        this.player.ui = this.ui;
        this.mobManager = new MobManager(this.scene, this.world, this.gravity);
        this.saveSystem = new SaveSystem(this.world, this.player);

        // ── Ciclo día/noche ───────────────────────────────────
        this._dayTime    = 0.25; // 0=medianoche, 0.25=amanecer, 0.5=mediodía
        this._daySpeed   = 1 / 120; // ciclo de 120 segundos

        // ── Elementos Celestes y Nubes ────────────────────────
        this._createSkyElements();

        // ── Highlight de bloque seleccionado ──────────────────
        this._blockHighlight = this._createBlockHighlight();

        // ── Timers ────────────────────────────────────────────
        this._prevTime = performance.now();

        // ── Setup de inputs ───────────────────────────────────
        this._setupPointerLock();
        this._setupMouseMove();
        this._setupKeys();
        this._setupMouseButtons();
        this._setupMouseWheel();
        this._setupMenuButtons();

        // ── Carga inicial del mundo ───────────────────────────
        this._initWorld();
    }

    // ── Inicialización ─────────────────────────────────────────
    async _initWorld() {
        const ui = this.ui;
        ui.setLoadProgress(10);

        // Cargar partida guardada si existe
        if (this.saveSystem.hasSave()) {
            ui.setLoadProgress(30);
            this.saveSystem.load();
            this.mobManager.clear();
            ui.notify('Partida cargada ✓', 'success');
        }

        // Pre-generar chunks iniciales alrededor del spawn
        ui.setLoadProgress(40);
        for (let r = 0; r < 3; r++) {
            this.world.update(this.player.center);
            ui.setLoadProgress(40 + r * 15);
            await new Promise(res => setTimeout(res, 0)); // yield al browser
        }

        ui.setLoadProgress(100);
        setTimeout(() => ui.hideLoading(), 500);

        // Actualizar gravedad inicial en HUD
        ui.updateGravity('⬇ Gravedad Normal', '');
    }

    // ── Pointer Lock ──────────────────────────────────────────
    _setupPointerLock() {
        this.canvas.addEventListener('click', () => {
            if (!this.locked && !this.paused) {
                this.canvas.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === this.canvas;
            const overlay = document.getElementById('ui-overlay');
            if (overlay) overlay.style.display = this.locked ? 'block' : 'block';
        });
    }

    // ── Mouse move → rotación de cámara ──────────────────────
    _setupMouseMove() {
        document.addEventListener('mousemove', (e) => {
            if (!this.locked || this.paused) return;
            this._yaw   += e.movementX * this._sensitivity;
            this._pitch += e.movementY * this._sensitivity;
            // Limitar pitch para no girar 360° vertical
            this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
            this._applyCameraRotation();
        });
    }

    _applyCameraRotation() {
        if (this._gravShifting) return;
        const up  = this.gravity.upVector;
        // Vector "norte" de referencia (perpendicular a up)
        let ref;
        const dot = Math.abs(BABYLON.Vector3.Dot(up, BABYLON.Vector3.Forward()));
        if (dot < 0.9) {
            ref = BABYLON.Vector3.Forward().subtract(up.scale(BABYLON.Vector3.Dot(BABYLON.Vector3.Forward(), up)));
        } else {
            ref = BABYLON.Vector3.Right().subtract(up.scale(BABYLON.Vector3.Dot(BABYLON.Vector3.Right(), up)));
        }
        ref.normalize();

        // Yaw alrededor de up
        const yawQ  = BABYLON.Quaternion.RotationAxis(up, this._yaw);
        const yawMat = new BABYLON.Matrix();
        yawQ.toRotationMatrix(yawMat);
        const fwd   = BABYLON.Vector3.TransformNormal(ref, yawMat).normalize();

        // Pitch alrededor del eje derecho
        const rightAxis = BABYLON.Vector3.Cross(fwd, up).normalize();
        const pitchQ    = BABYLON.Quaternion.RotationAxis(rightAxis, this._pitch);
        const pitchMat  = new BABYLON.Matrix();
        pitchQ.toRotationMatrix(pitchMat);
        const finalFwd  = BABYLON.Vector3.TransformNormal(fwd, pitchMat).normalize();

        this.camera.setTarget(this.camera.position.add(finalFwd));
        this.camera.upVector = up.clone();
    }

    // ── Teclado ───────────────────────────────────────────────
    _setupKeys() {
        window.addEventListener('keydown', (e) => {
            // Teclas 1–9 → slot hotbar
            if (e.code >= 'Digit1' && e.code <= 'Digit9') {
                const slot = parseInt(e.code.replace('Digit', '')) - 1;
                this.inventory.selectSlot(slot);
                return;
            }

            switch (e.code) {
                case 'KeyG':
                    if (!this.paused) this._changeGravity();
                    break;
                case 'F5':
                    e.preventDefault();
                    if (this.saveSystem.save()) this.ui.notify('💾 Mundo guardado', 'success');
                    else                        this.ui.notify('Error al guardar', 'error');
                    break;
                case 'Escape':
                    this._togglePause();
                    break;
                case 'KeyH':
                    // Alternar ayuda de controles
                    const help = document.getElementById('controls-help');
                    if (help) help.classList.toggle('hidden');
                    break;
            }
        });
    }

    _changeGravity() {
        const entry = this.gravity.cycle();
        this.ui.updateGravity(entry.label, entry.cls);
        this.ui.notify(`🌀 ${entry.label}`, 'warning');

        // Record starting and ending camera vectors for smooth transition
        this._dirStart = this.camera.getTarget().subtract(this.camera.position).normalize();
        const upEnd = this.gravity._target.negate();
        let refEnd;
        const dotEnd = Math.abs(BABYLON.Vector3.Dot(upEnd, BABYLON.Vector3.Forward()));
        if (dotEnd < 0.9) {
            refEnd = BABYLON.Vector3.Forward().subtract(upEnd.scale(BABYLON.Vector3.Dot(BABYLON.Vector3.Forward(), upEnd)));
        } else {
            refEnd = BABYLON.Vector3.Right().subtract(upEnd.scale(BABYLON.Vector3.Dot(BABYLON.Vector3.Right(), upEnd)));
        }
        refEnd.normalize();
        this._dirEnd = refEnd;
        this._gravShifting = true;

        // Ajustar yaw al cambiar gravedad para evitar desorientación
        this._yaw = 0;
        this._pitch = 0;

        // Resetear velocidad vertical
        const gd = this.gravity.direction;
        this.player.velocity.set(0, 0, 0);

        // Flash visual
        this.canvas.classList.add('gravity-change-flash');
        setTimeout(() => this.canvas.classList.remove('gravity-change-flash'), 500);
    }

    // ── Botones del ratón ────────────────────────────────────
    _setupMouseButtons() {
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.locked || this.paused) return;
            if (e.button === 0) {
                // Primero comprobar si golpeamos un mob
                const cameraPos = this.camera.position;
                const cameraDir = this.player._cameraForward();
                const hitMob = this.mobManager.checkRaycastHit(cameraPos, cameraDir, 4.5);
                if (hitMob) {
                    hitMob.takeDamage(10, cameraDir);
                } else {
                    this.player.breakBlock();
                }
            }
            if (e.button === 2) this.player.placeBlock();
        });
        // Prevenir menú contextual en canvas
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ── Rueda del ratón ──────────────────────────────────────
    _setupMouseWheel() {
        window.addEventListener('wheel', (e) => {
            if (!this.locked || this.paused) return;
            this.inventory.scroll(e.deltaY > 0 ? 1 : -1);
        }, { passive: true });
    }

    // ── Botones del menú ─────────────────────────────────────
    _setupMenuButtons() {
        document.getElementById('resume-btn')?.addEventListener('click', () => this._togglePause());
        document.getElementById('save-btn')?.addEventListener('click', () => {
            if (this.saveSystem.save()) this.ui.notify('💾 Mundo guardado', 'success');
        });
        document.getElementById('load-btn')?.addEventListener('click', () => {
            if (this.saveSystem.load()) {
                this.ui.notify('📂 Mundo cargado', 'success');
                this._togglePause();
            } else {
                this.ui.notify('No hay partida guardada', 'error');
            }
        });
    }

    _togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.ui.showPause();
            document.exitPointerLock();
        } else {
            this.ui.hidePause();
        }
    }

    // ── Highlight del bloque apuntado ─────────────────────────
    _createBlockHighlight() {
        const box = BABYLON.MeshBuilder.CreateBox('highlight', { size: 1.005 }, this.scene);
        const mat = new BABYLON.StandardMaterial('hlMat', this.scene);
        mat.emissiveColor   = new BABYLON.Color3(1, 1, 1);
        mat.wireframe       = true;
        mat.disableLighting = true;
        box.material        = mat;
        box.isPickable      = false;
        box.setEnabled(false);
        return box;
    }

    _updateBlockHighlight() {
        const hp = this.player.hitBlockPos;
        if (hp) {
            this._blockHighlight.setEnabled(true);
            this._blockHighlight.position.set(hp.x + 0.5, hp.y + 0.5, hp.z + 0.5);
        } else {
            this._blockHighlight.setEnabled(false);
        }
    }

    _createSkyElements() {
        // --- Sol ---
        this.sunMesh = BABYLON.MeshBuilder.CreatePlane("sunMesh", { size: 15 }, this.scene);
        this.sunMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        this.sunMesh.isPickable = false;
        
        const sunMat = new BABYLON.StandardMaterial("sunMat", this.scene);
        sunMat.emissiveColor = new BABYLON.Color3(1, 0.95, 0.7);
        sunMat.disableLighting = true;
        this.sunMesh.material = sunMat;

        // --- Luna ---
        this.moonMesh = BABYLON.MeshBuilder.CreatePlane("moonMesh", { size: 12 }, this.scene);
        this.moonMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        this.moonMesh.isPickable = false;

        const moonMat = new BABYLON.StandardMaterial("moonMat", this.scene);
        moonMat.emissiveColor = new BABYLON.Color3(0.85, 0.85, 1.0);
        moonMat.disableLighting = true;
        this.moonMesh.material = moonMat;

        // --- Estrellas ---
        this.starMaterial = new BABYLON.StandardMaterial("starMat", this.scene);
        this.starMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
        this.starMaterial.disableLighting = true;
        this.starMaterial.alpha = 0;
        
        const starMeshes = [];
        for (let i = 0; i < 150; i++) {
            const star = BABYLON.MeshBuilder.CreateBox("star", { size: 0.3 + Math.random() * 0.3 }, this.scene);
            
            // Distribuir en una esfera alrededor del origen
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 130 + Math.random() * 10;
            
            star.position.x = radius * Math.sin(phi) * Math.cos(theta);
            star.position.y = radius * Math.cos(phi);
            star.position.z = radius * Math.sin(phi) * Math.sin(theta);
            star.isPickable = false;
            starMeshes.push(star);
        }
        
        // Fusionar todas las estrellas en una sola malla para optimizar llamadas de dibujo
        this.starField = BABYLON.Mesh.MergeMeshes(starMeshes, true, true, undefined, false, true);
        this.starField.material = this.starMaterial;
        this.starField.isPickable = false;

        // --- Nubes Voxel ---
        this.clouds = [];
        this.cloudMaterial = new BABYLON.StandardMaterial("cloudMat", this.scene);
        this.cloudMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        this.cloudMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        this.cloudMaterial.alpha = 0.7;
        this.cloudMaterial.backFaceCulling = false;
        
        for (let i = 0; i < 15; i++) {
            const w = 15 + Math.random() * 20;
            const h = 1.5 + Math.random() * 1.5;
            const d = 15 + Math.random() * 20;
            
            const cloud = BABYLON.MeshBuilder.CreateBox(`cloud-${i}`, { width: w, height: h, depth: d }, this.scene);
            cloud.material = this.cloudMaterial;
            cloud.isPickable = false;
            
            cloud.position.x = -150 + Math.random() * 300;
            cloud.position.y = 45 + Math.random() * 10;
            cloud.position.z = -150 + Math.random() * 300;
            
            cloud.userData = {
                speed: 1.0 + Math.random() * 2.0,
                width: w,
                depth: d
            };
            this.clouds.push(cloud);
        }

        // --- Efecto de Brillo (Glow) para Sol/Luna ---
        try {
            this.glowLayer = new BABYLON.GlowLayer("glow", this.scene);
            this.glowLayer.intensity = 0.45;
            this.glowLayer.addIncludedOnlyMesh(this.sunMesh);
            this.glowLayer.addIncludedOnlyMesh(this.moonMesh);
        } catch (e) {
            console.warn("GlowLayer no soportado:", e);
        }
    }

    // ── Ciclo día/noche ───────────────────────────────────────
    _updateDayNight(dt) {
        this._dayTime = (this._dayTime + this._daySpeed * dt) % 1;
        const t = this._dayTime;

        // t=0 medianoche, t=0.25 amanecer, t=0.5 mediodía, t=0.75 atardecer
        const angle = t * Math.PI * 2;
        const sunY  = -Math.sin(angle);     // +1 mediodía, -1 medianoche
        const sunX  = -Math.cos(angle);

        const isDay = sunY > 0;
        const dayFactor = Math.max(0, sunY);  // 0 en noche, 1 en mediodía

        // Intensidad del sol y ambiente
        this.sun.intensity      = 0.2 + dayFactor * 1.0;
        this.ambLight.intensity = 0.15 + dayFactor * 0.35;

        // Color del cielo (lerp día/noche)
        const nightColor = new BABYLON.Color3(0.02, 0.02, 0.08);
        const dayColor   = new BABYLON.Color3(0.53, 0.81, 0.98);
        const skyColor   = BABYLON.Color3.Lerp(nightColor, dayColor, dayFactor);

        this.scene.clearColor.set(skyColor.r, skyColor.g, skyColor.b, 1);
        this.scene.fogColor.set(skyColor.r * 0.95, skyColor.g * 0.95, skyColor.b * 0.95);

        // ── ACTUALIZAR POSICIÓN DE SOL, LUNA Y ESTRELLAS ──
        const camPos = this.camera.position;
        
        // Dirección de la órbita (Y es positivo de día, negativo de noche)
        const orbitDir = new BABYLON.Vector3(sunX * 0.6, sunY, -0.5).normalize();

        // Posicionar el Sol y la Luna (el cuerpo activo siempre arriba, el inactivo abajo)
        const distance = 120;
        this.sunMesh.position.copyFrom(camPos.add(orbitDir.scale(distance)));
        this.moonMesh.position.copyFrom(camPos.subtract(orbitDir.scale(distance)));

        // Actualizar dirección y color de la luz para que siempre apunte hacia abajo (Y < 0)
        if (isDay) {
            this.sun.direction.copyFrom(orbitDir.scale(-1));
            const dawn = Math.sin(angle);
            const warmth = Math.max(0, 1 - Math.abs(dawn) * 0.5);
            this.sun.diffuse.set(1, 0.88 + warmth * 0.1, 0.7 + warmth * 0.18);
        } else {
            this.sun.direction.copyFrom(orbitDir);
            this.sun.diffuse.set(0.4, 0.4, 0.6); // Luz azulina nocturna tenue
        }

        // Las estrellas siguen la cámara y rotan lentamente en el eje X
        this.starField.position.copyFrom(camPos);
        this.starField.rotation.x = angle;

        // Opacidad de las estrellas (solo se ven de noche)
        this.starMaterial.alpha = Math.max(0, (1 - dayFactor) - 0.25);

        // ── ACTUALIZAR NUBES ──
        const px = this.player.center ? this.player.center.x : camPos.x;
        const pz = this.player.center ? this.player.center.z : camPos.z;

        // Opacidad y color de las nubes según el factor de día
        this.cloudMaterial.alpha = 0.15 + dayFactor * 0.55;
        const cloudColor = BABYLON.Color3.Lerp(new BABYLON.Color3(0.08, 0.08, 0.15), new BABYLON.Color3(1.0, 1.0, 1.0), dayFactor);
        this.cloudMaterial.diffuseColor = cloudColor;
        this.cloudMaterial.emissiveColor = cloudColor.scale(0.3);

        this.clouds.forEach(cloud => {
            cloud.position.z += cloud.userData.speed * dt;
            
            // Reposicionamiento de nubes relativo al jugador
            const dx = cloud.position.x - px;
            const dz = cloud.position.z - pz;
            
            if (dz > 200) {
                cloud.position.z = pz - 200;
                cloud.position.x = px - 150 + Math.random() * 300;
            } else if (dz < -200) {
                cloud.position.z = pz + 200;
            }
            
            if (dx > 200) {
                cloud.position.x = px - 200;
            } else if (dx < -200) {
                cloud.position.x = px + 200;
            }
        });
    }

    // ── Game Loop ─────────────────────────────────────────────
    loop() {
        const now = performance.now();
        const dt  = Math.min((now - this._prevTime) / 1000, 0.05); // max 50ms
        this._prevTime = now;

        if (this.paused) {
            this.scene.render();
            return;
        }

        // Actualizar sistemas
        this.gravity.update(dt);
        this.player.update(dt);
        this.world.update(this.player.center);
        this.mobManager.update(dt, this.player);
        this.saveSystem.update(dt);
        this.ui.update(dt, this.player);

        // Actualizar cámara según gravedad (transición suave del up vector y target)
        if (this._gravShifting) {
            const t = Math.min(this.gravity._tt / this.gravity._td, 1);
            const dir = BABYLON.Vector3.Lerp(this._dirStart, this._dirEnd, t).normalize();
            this.camera.setTarget(this.camera.position.add(dir));
            this.camera.upVector = this.gravity.upVector;
            if (t >= 1) this._gravShifting = false;
        } else {
            this._applyCameraRotation();
        }

        this._updateDayNight(dt);
        this._updateBlockHighlight();

        // Renderizar
        this.scene.render();
    }
}
