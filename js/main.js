// Jet Jousting: Main entry point, state manager, and game loop.
import { Vector, resolveHorseCollisions, checkLanceStrike } from './physics.js';
import { audio } from './audio.js';
import { ParticleSystem } from './particles.js';
import { Player, Enemy } from './entities.js';
import { UIManager } from './ui.js';
import { NetworkManager } from './network.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.fxCanvas = document.getElementById('fx-canvas');
        this.fxCtx = this.fxCanvas.getContext('2d');

        // Game Configuration
        this.arena = {
            width: 2400,
            height: 2400,
            color: '#1c221a',
            gridSize: 100
        };

        // Game State
        this.state = 'menu'; // 'menu', 'playing', 'waveclear', 'gameover'
        this.wave = 1;
        this.gold = 0;
        
        // Upgrades Inventory
        this.upgrades = {
            speed: 0,
            armor: 0,
            lance: 0,
            sharpness: 0,
            boost: 0
        };

        // Entities & FX
        this.player = null;
        this.enemies = [];
        this.particles = new ParticleSystem();
        
        // Viewport camera
        this.camera = Vector.create(0, 0);

        // Input state
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };

        // Hit-stop freeze frame timer
        this.hitStopDuration = 0;

        // Combat Stats
        this.stats = {
            maxSpeed: 0,
            maxDmgDealt: 0,
            wavesSurvived: 0
        };

        // Initialize UI Manager
        this.ui = new UIManager({
            onStartGame: () => this.startGame(),
            onNextWave: () => this.startNextWave(),
            onResetGame: () => this.resetGame(),
            onOpenStable: () => this.updateStableUI(),
            onBuyUpgrade: (type) => this.buyUpgrade(type)
        });

        // Online multiplayer
        this.net = new NetworkManager();
        this.onlineMode = false;
        this.remotePlayer = null;      // The opponent's rendered entity
        this.localReady = false;
        this.remoteReadyFlag = false;

        this.initInputListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Start animating
        this.lastTime = 0;
        requestAnimationFrame((t) => this.loop(t));

        // Wire online lobby UI
        this.initOnlineUI();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.fxCanvas.width = window.innerWidth;
        this.fxCanvas.height = window.innerHeight;
    }

    initInputListeners() {
        // Keyboard listeners
        window.addEventListener('keydown', (e) => {
            // Prevent default browser actions (focused button clicks and page scroll) for gaming keys
            if (e.key === ' ' || e.key.startsWith('Arrow')) {
                e.preventDefault();
            }

            this.keys[e.key.toLowerCase()] = true;
            
            // Audio context activation on first interaction
            if (e.key === ' ' || e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') {
                audio.init();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Mouse aiming listeners
        window.addEventListener('mousemove', (e) => {
            this.mousePos.clientX = e.clientX;
            this.mousePos.clientY = e.clientY;
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left Click
                this.keys['mouse0'] = true;
                audio.init();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.keys['mouse0'] = false;
            }
        });
    }

    startGame(isOnline = false) {
        this.state = 'playing';
        this.onlineMode = isOnline;
        this.wave = 1;
        this.gold = 0;
        this.stats.maxSpeed = 0;
        this.stats.maxDmgDealt = 0;
        this.stats.wavesSurvived = 0;

        // Reset upgrades
        this.upgrades = { speed: 0, armor: 0, lance: 0, sharpness: 0, boost: 0 };

        // Create player in center
        this.player = new Player(this.arena.width / 2, this.arena.height / 2);

        if (isOnline) {
            // In online mode, turning is much harder
            this.player.turnRate = 0.05;

            // Remote player spawns on opposite side of arena
            const isHost = this.net.isHost;
            if (!isHost) {
                // Guest spawns offset to avoid immediate collision
                this.player.pos = Vector.create(this.arena.width / 2 - 300, this.arena.height / 2);
            } else {
                this.player.pos = Vector.create(this.arena.width / 2 + 300, this.arena.height / 2);
            }

            // Remote player entity (no AI, driven by network)
            this.remotePlayer = new RemotePlayer(this.player.pos.x, this.player.pos.y);
            this.enemies = []; // No AI enemies in online mode
        } else {
            this.player.turnRate = 0.15; // Normal singleplayer turning
            this.remotePlayer = null;
            // Spawn wave 1
            this.spawnWave(1);
        }

        this.ui.showOverlay('game');
        this.particles.clear();
        audio.playWhinny();
    }

    startNextWave() {
        this.state = 'playing';
        this.wave++;
        
        // Re-center player position to keep things tidy
        this.player.pos = Vector.create(this.arena.width / 2, this.arena.height / 2);
        this.player.vel = Vector.create(0, 0);
        this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.maxHealth * 0.25); // Heal 25% on wave clear

        this.spawnWave(this.wave);
        this.ui.showOverlay('game');
        
        this.particles.clear();
        audio.playWhinny();
    }

    resetGame() {
        this.startGame();
    }

    spawnWave(waveNum) {
        this.enemies = [];
        
        // Determine quantity & composition
        let numStandard = 1 + waveNum;
        let numChargers = waveNum >= 2 ? Math.min(3, waveNum - 1) : 0;
        let numHeavies = waveNum >= 3 ? Math.min(2, waveNum - 2) : 0;
        let numFlankers = waveNum >= 4 ? Math.min(3, waveNum - 3) : 0;

        const spawnRadius = 800; // Spawn in a circle away from the player

        const spawnEntity = (type) => {
            // Find a spot away from player
            const angle = Math.random() * Math.PI * 2;
            const x = this.player.pos.x + Math.cos(angle) * (spawnRadius + Math.random() * 200);
            const y = this.player.pos.y + Math.sin(angle) * (spawnRadius + Math.random() * 200);

            // Clamp spawn coordinates to arena borders
            const pad = 100;
            const clampedX = Math.max(pad, Math.min(this.arena.width - pad, x));
            const clampedY = Math.max(pad, Math.min(this.arena.height - pad, y));

            this.enemies.push(new Enemy(clampedX, clampedY, type, waveNum));
        };

        for (let i = 0; i < numStandard; i++) spawnEntity('standard');
        for (let i = 0; i < numChargers; i++) spawnEntity('charger');
        for (let i = 0; i < numHeavies; i++) spawnEntity('heavy');
        for (let i = 0; i < numFlankers; i++) spawnEntity('flanker');
    }

    updateStableUI() {
        this.ui.updateStableShop(this.gold, this.upgrades);
    }

    buyUpgrade(type) {
        const config = this.ui.upgradeConfig[type];
        const curLvl = this.upgrades[type];
        
        if (curLvl >= config.maxLvl) return;

        const cost = Math.round(config.baseCost * Math.pow(config.costMult, curLvl));
        if (this.gold >= cost) {
            this.gold -= cost;
            this.upgrades[type]++;
            
            // Apply upgrade directly to player model if player exists
            if (this.player) {
                this.player.upgrade(type, this.upgrades[type]);
            }
            
            audio.playClash(30); // Metallic ring confirm sound
            this.updateStableUI();
        }
    }

    // MAIN GAME LOOP
    loop(timestamp) {
        let dt = timestamp - this.lastTime;
        if (dt > 100) dt = 16.66; // Clamp spikes (e.g. background tab)
        this.lastTime = timestamp;

        if (this.state === 'playing') {
            // Implement Hit-Stop frame freeze
            if (this.hitStopDuration > 0) {
                this.hitStopDuration--;
                // Still render everything so the freeze looks static
                this.render();
            } else {
                this.update(dt);
                this.render();
            }
        } else {
            // Menu background render
            this.renderMenuBackground();
        }

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // Convert screen mouse coordinates into world coordinates (adding camera scroll offsets)
        const mouseX = this.mousePos.clientX !== undefined ? this.mousePos.clientX : window.innerWidth / 2;
        const mouseY = this.mousePos.clientY !== undefined ? this.mousePos.clientY : window.innerHeight / 2;

        const worldMousePos = Vector.create(
            mouseX + this.camera.x,
            mouseY + this.camera.y
        );

        // Update player
        this.player.update(dt, this.keys, worldMousePos);
        this.keepInArena(this.player);

        // Update enemies (singleplayer only)
        if (!this.onlineMode) {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                enemy.update(dt, this.player);
                this.keepInArena(enemy);

                if (enemy.isDead) {
                    const bounty = Math.round(45 + Math.random() * 25 + this.wave * 10);
                    this.gold += bounty;
                    this.particles.spawnText(enemy.pos.x, enemy.pos.y, `+$${bounty}`);
                    audio.playVictory();
                    this.enemies.splice(i, 1);
                }
            }
        }

        // Online: send local state, update remote player
        if (this.onlineMode && this.net.connected) {
            this.net.sendState({
                pos: { x: this.player.pos.x, y: this.player.pos.y },
                vel: { x: this.player.vel.x, y: this.player.vel.y },
                angle: this.player.angle,
                lanceAngle: this.player.lanceAngle,
                health: this.player.health,
                boostStamina: this.player.boostStamina,
                isBoosting: this.player.isBoosting
            });
        }

        // Update particles
        this.particles.update();

        // Spawn ambient speed streaks if player is moving super fast
        const playerSpeed = Vector.mag(this.player.vel);
        const speedRatio = playerSpeed / this.player.baseMaxSpeed;
        audio.updateWind(speedRatio);

        if (speedRatio > 0.6 && Math.random() < 0.15) {
            this.particles.spawnWindStreak(window.innerWidth, window.innerHeight, this.player.vel.x, this.player.vel.y);
        }

        // Track max speed stats
        if (playerSpeed > this.stats.maxSpeed) {
            this.stats.maxSpeed = playerSpeed;
        }

        // Spawn dust kicks from horse hooves
        if (playerSpeed > 0.5 && Math.random() < 0.25) {
            // Find hoof positions (offset slightly behind player facing direction)
            const angleOffset = this.player.angle + Math.PI;
            const spawnX = this.player.pos.x + Math.cos(angleOffset) * this.player.radius * 0.7;
            const spawnY = this.player.pos.y + Math.sin(angleOffset) * this.player.radius * 0.7;
            this.particles.spawnDirt(spawnX, spawnY, speedRatio);
        }

        // Do the same for moving enemies
        this.enemies.forEach(e => {
            const eSpeed = Vector.mag(e.vel);
            if (eSpeed > 0.5 && Math.random() < 0.18) {
                const angleOffset = e.angle + Math.PI;
                const spawnX = e.pos.x + Math.cos(angleOffset) * e.radius * 0.7;
                const spawnY = e.pos.y + Math.sin(angleOffset) * e.radius * 0.7;
                this.particles.spawnDirt(spawnX, spawnY, eSpeed / e.baseMaxSpeed);
            }
        });

        // Resolve Collisions
        this.checkCollisions();

        // Camera follow (smooth lerping)
        const targetCamX = this.player.pos.x - window.innerWidth / 2;
        const targetCamY = this.player.pos.y - window.innerHeight / 2;
        this.camera.x = this.camera.x + (targetCamX - this.camera.x) * 0.1;
        this.camera.y = this.camera.y + (targetCamY - this.camera.y) * 0.1;

        // Clamp camera to arena boundaries
        this.camera.x = Math.max(0, Math.min(this.arena.width - window.innerWidth, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.arena.height - window.innerHeight, this.camera.y));

        // Update UI HUD
        this.ui.updateHUD(this.player, this.wave, this.enemies.length, this.gold);
        this.ui.updateEffects();

        // Check Win/Loss conditions
        if (this.player.isDead) {
            this.state = 'gameover';
            audio.playDefeat();
            this.ui.showGameOver(this.stats.wavesSurvived, this.stats.maxSpeed, this.stats.maxDmgDealt);
        } else if (!this.onlineMode && this.enemies.length === 0) {
            this.state = 'waveclear';
            this.stats.wavesSurvived++;
            const waveLoot = 100 + this.wave * 50;
            this.gold += waveLoot;
            audio.playVictory();
            this.ui.showWaveClear(this.wave, waveLoot);
        } else if (this.onlineMode && this.remotePlayer && this.remotePlayer.isDead) {
            this.state = 'gameover'; // Reuse screen — winner sees "defeated" from opponent's POV
            this.ui.showVictory();
        }
    }

    keepInArena(entity) {
        const borderBuffer = entity.radius;
        if (entity.pos.x < borderBuffer) {
            entity.pos.x = borderBuffer;
            entity.vel.x *= -0.4; // Soft rebound
        }
        if (entity.pos.x > this.arena.width - borderBuffer) {
            entity.pos.x = this.arena.width - borderBuffer;
            entity.vel.x *= -0.4;
        }
        if (entity.pos.y < borderBuffer) {
            entity.pos.y = borderBuffer;
            entity.vel.y *= -0.4;
        }
        if (entity.pos.y > this.arena.height - borderBuffer) {
            entity.pos.y = this.arena.height - borderBuffer;
            entity.vel.y *= -0.4;
        }
    }

    checkCollisions() {
        if (this.onlineMode) {
            // Online: only check player lance vs remote player
            if (this.remotePlayer && !this.remotePlayer.isDead) {
                const strike = checkLanceStrike(this.player, this.remotePlayer);
                if (strike.collided && strike.impactSpeed > 0.5) {
                    const multiplier = Math.max(0.5, strike.impactSpeed / 1.5);
                    const damage = this.player.baseDamage * multiplier;
                    const isCrit = multiplier > 3.0;

                    // Tell the remote side they took damage
                    this.net.sendHit(damage);

                    // Also mark locally for visual feedback
                    this.remotePlayer.flashHit();

                    const knockbackDir = Vector.normalize(this.player.vel);
                    this.particles.spawnSparks(strike.point.x, strike.point.y, Math.ceil(damage / 2));
                    this.particles.spawnBlood(strike.point.x, strike.point.y, knockbackDir, multiplier / 3);
                    this.particles.spawnText(strike.point.x, strike.point.y, damage, isCrit);
                    audio.playClash(damage);

                    const intensity = Math.min(20, damage / 4);
                    this.ui.triggerShake(intensity, 12);
                }
            }

            // Horse bumping in online (no damage, just push)
            if (this.remotePlayer) {
                resolveHorseCollisions(this.player, this.remotePlayer);
            }
            return;
        }

        // Singleplayer collisions:
        for (let i = 0; i < this.enemies.length; i++) {
            resolveHorseCollisions(this.player, this.enemies[i]);
            for (let j = i + 1; j < this.enemies.length; j++) {
                resolveHorseCollisions(this.enemies[i], this.enemies[j]);
            }
        }

        // 2. Resolve Player Lance Strike on Enemies
        this.enemies.forEach(enemy => {
            if (enemy.isDead) return;

            const strike = checkLanceStrike(this.player, enemy);
            if (strike.collided) {
                // Rel velocity dot product dictates speed factor.
                // We reference a standard velocity factor (e.g. 5.0) where 1x base damage is dealt.
                const speedFactor = strike.impactSpeed;
                
                // Only deal damage if closing in speed is positive (moving towards defender)
                if (speedFactor > 0.5) {
                    // Speed-based damage: scales linearly/exponentially with speed factor!
                    // If player is boosting at top speed, damage gets multiplier
                    const multiplier = Math.max(0.5, speedFactor / 1.5);
                    const damage = this.player.baseDamage * multiplier;
                    const isCrit = multiplier > 3.0;

                    // Apply damage
                    const actualDmg = enemy.takeDamage(damage);
                    
                    if (actualDmg > 0) {
                        // Track statistics
                        if (actualDmg > this.stats.maxDmgDealt) {
                            this.stats.maxDmgDealt = actualDmg;
                        }

                        // Play Clash sound
                        audio.playClash(actualDmg);
                        
                        // Push enemy backwards based on collision impact force
                        const knockbackDir = Vector.normalize(this.player.vel);
                        const knockbackForce = Math.max(3, speedFactor * 1.5) / enemy.mass;
                        enemy.vel = Vector.add(enemy.vel, Vector.mult(knockbackDir, knockbackForce));

                        // Spawn VFX
                        this.particles.spawnSparks(strike.point.x, strike.point.y, Math.ceil(actualDmg / 2));
                        this.particles.spawnBlood(strike.point.x, strike.point.y, knockbackDir, multiplier / 3);
                        this.particles.spawnText(strike.point.x, strike.point.y, actualDmg, isCrit);

                        // Trigger heavy impact shake and hit-stop freeze frames
                        const intensity = Math.min(20, actualDmg / 4);
                        const freezeFrames = Math.min(12, Math.floor(actualDmg / 8));
                        
                        this.ui.triggerShake(intensity, Math.max(10, freezeFrames * 2));
                        this.hitStopDuration = freezeFrames;
                    }
                }
            }
        });

        // 3. Resolve Enemy Lance Strikes on Player
        this.enemies.forEach(enemy => {
            if (enemy.isDead || this.player.isDead) return;

            const strike = checkLanceStrike(enemy, this.player);
            if (strike.collided) {
                const speedFactor = strike.impactSpeed;
                
                if (speedFactor > 0.5) {
                    // Speed-based damage received by player, reduced by player armor upgrade
                    const armorReduction = 1 + this.upgrades.armor * 0.3; // 30% reduction per level
                    const multiplier = Math.max(0.5, speedFactor / 1.5);
                    const damage = (enemy.baseDamage * multiplier) / armorReduction;

                    const actualDmg = this.player.takeDamage(damage);
                    if (actualDmg > 0) {
                        audio.playClash(actualDmg);
                        audio.playGrunt();

                        // Knock player back
                        const knockbackDir = Vector.normalize(enemy.vel);
                        const knockbackForce = Math.max(3, speedFactor * 1.2) / this.player.mass;
                        this.player.vel = Vector.add(this.player.vel, Vector.mult(knockbackDir, knockbackForce));

                        // Spawn VFX
                        this.particles.spawnSparks(strike.point.x, strike.point.y, Math.ceil(actualDmg / 2));
                        this.particles.spawnBlood(strike.point.x, strike.point.y, knockbackDir, multiplier / 3);
                        this.particles.spawnText(strike.point.x, strike.point.y, actualDmg, false);

                        // Trigger screen shake
                        const intensity = Math.min(18, actualDmg / 3);
                        this.ui.triggerShake(intensity, 12);
                    }
                }
            }
        });
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = this.arena.color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply camera translate offsets
        this.ctx.save();
        
        // Add screen shake translations directly to context
        const shakeX = this.ui.shakeOffset.x;
        const shakeY = this.ui.shakeOffset.y;
        this.ctx.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);

        // 1. Draw Arena Grid / Floor
        this.renderArenaFloor();

        // 2. Draw active entities
        this.player.draw(this.ctx);
        if (this.onlineMode && this.remotePlayer) {
            this.remotePlayer.draw(this.ctx);
        } else {
            this.enemies.forEach(enemy => enemy.draw(this.ctx));
        }

        // 3. Draw particles
        this.particles.draw(this.ctx);

        this.ctx.restore();

        // Draw offscreen enemy indicators
        this.drawOffscreenIndicators();

        // 4. Draw speed lines overlay on fxCanvas
        this.renderSpeedLines();
    }

    drawOffscreenIndicators() {
        const margin = 45;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        const minX = margin;
        const maxX = window.innerWidth - margin;
        const minY = margin;
        const maxY = window.innerHeight - margin;

        this.enemies.forEach(enemy => {
            if (enemy.isDead) return;

            // Check if enemy is out of view
            const ex = enemy.pos.x - this.camera.x;
            const ey = enemy.pos.y - this.camera.y;

            const padding = enemy.radius;
            const inView = (ex >= -padding && ex <= window.innerWidth + padding && 
                            ey >= -padding && ey <= window.innerHeight + padding);

            if (!inView) {
                // Calculate angle from player to offscreen enemy
                const dx = enemy.pos.x - this.player.pos.x;
                const dy = enemy.pos.y - this.player.pos.y;
                const angle = Math.atan2(dy, dx);

                const cosVal = Math.cos(angle);
                const sinVal = Math.sin(angle);

                // Find ray-box intersection with screen edges
                let tx = Infinity;
                if (cosVal > 0) {
                    tx = (maxX - cx) / cosVal;
                } else if (cosVal < 0) {
                    tx = (minX - cx) / cosVal;
                }

                let ty = Infinity;
                if (sinVal > 0) {
                    ty = (maxY - cy) / sinVal;
                } else if (sinVal < 0) {
                    ty = (minY - cy) / sinVal;
                }

                const t = Math.min(tx, ty);
                const arrowX = cx + cosVal * t;
                const arrowY = cy + sinVal * t;

                // Draw indicator arrow
                this.ctx.save();
                this.ctx.translate(arrowX, arrowY);
                this.ctx.rotate(angle);

                // Scale up and pulse if enemy is boosting
                let scale = 1.0;
                if (enemy.isBoosting) {
                    scale = 1.25 + Math.sin(Date.now() * 0.01) * 0.15;
                }
                this.ctx.scale(scale, scale);

                // Set color matching enemy type
                let color = '#3b82f6'; // Standard (blue)
                if (enemy.type === 'charger') color = '#ef4444'; // Charger (red)
                else if (enemy.type === 'heavy') color = '#94a3b8'; // Heavy (silver-grey)
                else if (enemy.type === 'flanker') color = '#a855f7'; // Flanker (purple)

                this.ctx.fillStyle = color;
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 2.5;

                // Draw triangular pointer pointing right
                this.ctx.beginPath();
                this.ctx.moveTo(10, 0);
                this.ctx.lineTo(-8, -8);
                this.ctx.lineTo(-4, 0);
                this.ctx.lineTo(-8, 8);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();

                // Draw center highlight
                this.ctx.fillStyle = '#ffffff';
                this.ctx.beginPath();
                this.ctx.arc(-2, 0, 2, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.restore();

                // Draw distance text in screen space
                const dist = Math.round(Vector.dist(this.player.pos, enemy.pos));
                this.ctx.save();
                this.ctx.translate(arrowX, arrowY);
                
                // Offset text back along the direction ray
                const textX = -cosVal * 25;
                const textY = -sinVal * 25;

                this.ctx.font = "bold 11px 'Outfit', sans-serif";
                this.ctx.fillStyle = '#ffffff';
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 3;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                const distStr = `${Math.round(dist / 10)}m`;
                this.ctx.strokeText(distStr, textX, textY);
                this.ctx.fillText(distStr, textX, textY);
                this.ctx.restore();
            }
        });
    }

    renderArenaFloor() {
        const ctx = this.ctx;
        
        // Grass base green color
        ctx.fillStyle = '#1c221a';
        ctx.fillRect(0, 0, this.arena.width, this.arena.height);

        // Draw grid lines (subtle earth lanes)
        ctx.strokeStyle = '#181d17';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= this.arena.width; x += this.arena.gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.arena.height);
        }
        for (let y = 0; y <= this.arena.height; y += this.arena.gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.arena.width, y);
        }
        ctx.stroke();

        // Draw Arena Boundaries (Heavy Stone/Wood fencing design)
        ctx.strokeStyle = '#ffd700'; // Gold boundary lines
        ctx.lineWidth = 10;
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
        ctx.strokeRect(0, 0, this.arena.width, this.arena.height);
        ctx.shadowBlur = 0; // Reset shadow

        // Arena outer banners/shields on borders
        ctx.fillStyle = '#b8860b';
        ctx.font = "bold 20px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        
        ctx.fillText("JET JOUSTING CHAMPIONSHIPS", this.arena.width / 2, 40);
        ctx.fillText("JET JOUSTING CHAMPIONSHIPS", this.arena.width / 2, this.arena.height - 25);
    }

    renderSpeedLines() {
        this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
        
        // Draw wind streaks that live on screen space overlaying player motion
        const speed = Vector.mag(this.player.vel);
        const ratio = speed / this.player.baseMaxSpeed;

        if (ratio > 0.75) {
            // Draw a subtle vignetted dark overlay to compress field of view
            const grad = this.fxCtx.createRadialGradient(
                this.fxCanvas.width / 2, this.fxCanvas.height / 2, this.fxCanvas.height / 3,
                this.fxCanvas.width / 2, this.fxCanvas.height / 2, this.fxCanvas.width / 1.5
            );
            grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
            
            this.fxCtx.fillStyle = grad;
            this.fxCtx.fillRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
        }
    }

    renderMenuBackground() {
        // Slow scrolling ambient pattern for menu
        this.ctx.fillStyle = '#0f1115';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw a few gold circles or dust dots floating around in menu
        this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        const centerSize = 250;
        this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, centerSize, 0, Math.PI * 2);
        this.ctx.stroke();
    }
}

// ─── Remote Player: driven by network data ────────────────────────────────
class RemotePlayer {
    constructor(x, y) {
        this.pos = Vector.create(x, y);
        this.vel = Vector.create(0, 0);
        this.angle = 0;
        this.lanceAngle = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.boostStamina = 100;
        this.maxBoostStamina = 100;
        this.isBoosting = false;
        this.radius = 24;
        this.mass = 1.2;
        this.lanceLength = 70;
        this.lanceWidth = 6;
        this.isDead = false;
        this.hitFlashTimer = 0;
        this.gallopTimer = 0;
    }

    applyState(data) {
        // Smooth interpolation of remote position
        this.pos.x += (data.pos.x - this.pos.x) * 0.35;
        this.pos.y += (data.pos.y - this.pos.y) * 0.35;
        this.vel = data.vel;
        this.angle = data.angle;
        this.lanceAngle = data.lanceAngle;
        this.health = data.health;
        this.maxHealth = this.maxHealth || 100;
        this.boostStamina = data.boostStamina;
        this.isBoosting = data.isBoosting;
        const speed = Math.sqrt(data.vel.x * data.vel.x + data.vel.y * data.vel.y);
        this.gallopTimer += speed * 0.15;

        if (data.health <= 0) this.isDead = true;
    }

    flashHit() {
        this.hitFlashTimer = 10;
    }

    draw(ctx) {
        if (this.isDead) return;

        const speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
        const isFlashing = this.hitFlashTimer > 0;
        if (this.hitFlashTimer > 0) this.hitFlashTimer--;

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);

        if (isFlashing) {
            ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        }

        ctx.rotate(this.angle);

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 8;

        // Galloping legs
        const legSpread = 12;
        const gallopSway = Math.sin(this.gallopTimer) * 8 * Math.min(1, speed / 2);
        ctx.fillStyle = '#1a110a';
        ctx.fillRect(12, -legSpread + gallopSway, 6, 4);
        ctx.fillRect(12, legSpread - gallopSway, 6, 4);
        ctx.fillRect(-16, -legSpread - gallopSway, 6, 4);
        ctx.fillRect(-16, legSpread + gallopSway, 6, 4);

        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

        // Red enemy horse (opponent color scheme)
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(18, 0, 8, 5, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(-6, -9, 12, 18);

        // Red armor
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill();

        // Dark plume
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-15, -4, -18, -2);
        ctx.quadraticCurveTo(-10, 0, -18, 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Draw lance separately (free rotation)
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.lanceAngle);
        const sy = 9;
        ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = this.lanceWidth; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(5, sy); ctx.lineTo(this.lanceLength - 12, sy); ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(10, sy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e0e0e0'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.lanceLength - 12, sy - this.lanceWidth / 2);
        ctx.lineTo(this.lanceLength, sy);
        ctx.lineTo(this.lanceLength - 12, sy + this.lanceWidth / 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();

        // Health bar above remote player
        const barW = 50;
        const barH = 6;
        const barX = this.pos.x - barW / 2;
        const barY = this.pos.y - 42;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        const pct = Math.max(0, this.health / this.maxHealth);
        ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#facc15' : '#ef4444';
        ctx.fillRect(barX, barY, barW * pct, barH);

        // "OPPONENT" label
        ctx.font = "bold 10px 'Outfit', sans-serif";
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('OPPONENT', this.pos.x, barY - 2);
    }
}

// ─── Online lobby UI wiring ────────────────────────────────────────────────

Game.prototype.initOnlineUI = function() {
    const $ = id => document.getElementById(id);

    const setStatus = (text, type = 'connecting') => {
        const s = $('online-status');
        const dot = $('online-status-icon');
        const txt = $('online-status-text');
        s.classList.remove('hidden');
        dot.className = 'status-dot ' + type;
        txt.innerText = text;
    };

    const showError = (msg) => {
        const el = $('online-error');
        el.classList.remove('hidden');
        el.innerText = '⚠ ' + msg;
    };

    const hideError = () => $('online-error').classList.add('hidden');

    // Open the online lobby from main menu
    $('btn-online').addEventListener('click', () => {
        this.ui.showOverlay('online');
        hideError();
        $('online-status').classList.add('hidden');
        $('online-ready-section').classList.add('hidden');
        $('room-code-display').classList.add('hidden');
    });

    $('btn-online-back').addEventListener('click', () => {
        this.net.disconnect();
        this.ui.showOverlay('main');
    });

    // HOST: Create room
    $('btn-host').addEventListener('click', async () => {
        hideError();
        $('btn-host').disabled = true;
        setStatus('Creating room...', 'connecting');
        try {
            const code = await this.net.createRoom();
            $('room-code-text').innerText = code;
            $('room-code-display').classList.remove('hidden');
            setStatus('Waiting for opponent...', 'connecting');

            this.net.onConnected = () => {
                setStatus('Opponent connected!', 'connected');
                $('online-ready-section').classList.remove('hidden');
            };
        } catch (e) {
            showError(e);
            $('btn-host').disabled = false;
        }
    });

    // Copy room code
    $('btn-copy-code').addEventListener('click', () => {
        const code = $('room-code-text').innerText;
        navigator.clipboard.writeText(code).catch(() => {});
        $('btn-copy-code').innerText = 'COPIED!';
        setTimeout(() => { $('btn-copy-code').innerText = 'COPY'; }, 1500);
    });

    // GUEST: Join room
    $('btn-join').addEventListener('click', async () => {
        hideError();
        const code = $('room-code-input').value.trim().toUpperCase();
        if (code.length !== 6) { showError('Code must be 6 characters'); return; }
        $('btn-join').disabled = true;
        setStatus('Connecting to room...', 'connecting');
        try {
            await this.net.joinRoom(code);
            this.net.onConnected = () => {
                setStatus('Connected to host!', 'connected');
                $('online-ready-section').classList.remove('hidden');
            };
        } catch (e) {
            showError(e);
            $('btn-join').disabled = false;
        }
    });

    // READY UP
    $('btn-online-ready').addEventListener('click', () => {
        this.localReady = true;
        $('btn-online-ready').disabled = true;
        $('btn-online-ready').innerText = 'WAITING FOR OPPONENT...';
        this.net.sendReady();
        if (this.net.remoteReady) this._startOnlineGame();
    });

    this.net.onRemoteReady = () => {
        this.remoteReadyFlag = true;
        if (this.localReady) this._startOnlineGame();
    };

    this.net.onRemoteState = (data) => {
        if (this.remotePlayer) {
            this.remotePlayer.applyState(data);
        }
    };

    this.net.onRemoteHit = (damage) => {
        if (!this.player || this.player.isDead) return;
        const armorReduction = 1 + (this.upgrades.armor || 0) * 0.3;
        const actualDmg = this.player.takeDamage(damage / armorReduction);
        if (actualDmg > 0) {
            audio.playClash(actualDmg);
            audio.playGrunt();
            this.particles.spawnText(this.player.pos.x, this.player.pos.y - 30, actualDmg, false);
            this.ui.triggerShake(Math.min(18, actualDmg / 3), 10);
        }
    };

    this.net.onDisconnected = () => {
        if (this.state === 'playing' && this.onlineMode) {
            this.state = 'gameover';
            this.ui.showOnlineDisconnected();
        }
    };

    this.net.onError = (msg) => {
        showError(msg);
    };
};

Game.prototype._startOnlineGame = function() {
    this.startGame(true);
};

// Start Game system on window load
window.addEventListener('load', () => {
    new Game();
});
