// Entities module for Joust Royale
// Handles Player state, AI profiles, and procedural top-down rendering.

import { Vector, updateHorsePhysics } from './physics.js';
import { audio } from './audio.js';

class Knight {
    constructor(x, y, options = {}) {
        this.pos = Vector.create(x, y);
        this.vel = Vector.create(0, 0);
        this.acc = Vector.create(0, 0);
        this.inputDir = Vector.create(0, 0);
        
        // Base Stats
        this.name = options.name || "Knight";
        this.maxHealth = options.maxHealth || 100;
        this.health = this.maxHealth;
        this.radius = options.radius || 24; // Collision radius of the horse
        this.mass = options.mass || 1.0;
        
        // Movement Stats
        this.baseMaxSpeed = options.maxSpeed || 4.5;
        this.maxSpeed = this.baseMaxSpeed;
        this.accelRate = options.accelRate || 0.18;
        this.friction = options.friction || 0.04;
        
        // Lance/Combat Stats
        this.lanceAngle = 0;
        this.lanceLength = options.lanceLength || 65;
        this.lanceWidth = options.lanceWidth || 5;
        this.lanceColor = options.lanceColor || '#d4af37';
        this.baseDamage = options.baseDamage || 25;
        
        // Visual Rotation Angles
        this.angle = 0; // Direction horse is facing
        this.gallopTimer = Math.random() * 100;
        this.isDead = false;
        
        // Color Palette
        this.horseColor = options.horseColor || '#8B4513';
        this.armorColor = options.armorColor || '#c0c0c0';
        this.plumeColor = options.plumeColor || '#ff0000';
        this.shieldColor = options.shieldColor || '#0000ff';
        this.shieldDesign = options.shieldDesign || 'cross';

        // Hit Invincibility frames (brief cooldown to avoid multi-hitting in a single frame)
        this.invincibilityFrames = 0;
    }

    takeDamage(amount) {
        if (this.invincibilityFrames > 0 || this.isDead) return 0;
        this.health = Math.max(0, this.health - amount);
        this.invincibilityFrames = 15; // ~0.25 seconds invincibility
        
        if (this.health <= 0) {
            this.isDead = true;
        }
        return amount;
    }

    update(dt) {
        if (this.isDead) return;

        if (this.invincibilityFrames > 0) {
            this.invincibilityFrames--;
        }

        // Gallop animation rate tied to speed
        const speed = Vector.mag(this.vel);
        this.gallopTimer += speed * 0.15;
    }

    draw(ctx) {
        if (this.isDead) return;

        const speed = Vector.mag(this.vel);

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);

        // --- 1. DRAW SHADOW (offset slightly) ---
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 8;

        // --- 2. DRAW GALLOPING LEGS ---
        // Simple procedural sway of four leg indicators
        const legSpread = 12;
        const gallopSway = Math.sin(this.gallopTimer) * 8 * Math.min(1, speed / 2);
        
        ctx.fillStyle = '#1a110a'; // Hoof color
        
        // Front-left & Front-right
        ctx.fillRect(12, -legSpread + gallopSway, 6, 4);
        ctx.fillRect(12, legSpread - gallopSway, 6, 4);
        // Back-left & Back-right
        ctx.fillRect(-16, -legSpread - gallopSway, 6, 4);
        ctx.fillRect(-16, legSpread + gallopSway, 6, 4);

        // Remove shadow for body to overlay cleanly
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // --- 3. DRAW HORSE BODY (oval) ---
        ctx.fillStyle = this.horseColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // Horse Head
        ctx.beginPath();
        ctx.ellipse(18, 0, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Horse Ears
        ctx.beginPath();
        ctx.moveTo(14, -3); ctx.lineTo(16, -6); ctx.lineTo(18, -3);
        ctx.moveTo(14, 3); ctx.lineTo(16, 6); ctx.lineTo(18, 3);
        ctx.fill();

        // --- 4. DRAW SADDLE & REINS ---
        ctx.fillStyle = '#5c3a21'; // Leather saddle
        ctx.fillRect(-6, -9, 12, 18);

        // --- 5. DRAW KNIGHT (Centered circle) ---
        ctx.fillStyle = this.armorColor;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();

        // Helmet crest/highlight
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(2, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Helmet Plume (colored tail extending behind)
        ctx.fillStyle = this.plumeColor;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-15, -4, -18, -2);
        ctx.quadraticCurveTo(-10, 0, -18, 2);
        ctx.closePath();
        ctx.fill();

        // --- 6. DRAW SHIELD (on left side) ---
        ctx.save();
        ctx.translate(-2, -10); // Offset left (top side in 2D rot)
        ctx.rotate(-Math.PI / 8);
        
        ctx.fillStyle = this.shieldColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw design on shield
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (this.shieldDesign === 'cross') {
            ctx.moveTo(0, -3); ctx.lineTo(0, 3);
            ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        } else if (this.shieldDesign === 'stripe') {
            ctx.moveTo(-6, -2); ctx.lineTo(6, 2);
        } else {
            // Circle center
            ctx.arc(0, 0, 2, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();

        // --- 7. DRAW LANCE (aimed independently) ---
        // The lance is held on the right shoulder (bottom side in 2D rotation)
        ctx.restore(); // Exit horse local coordinate frame so lance handles free rotation

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.lanceAngle);

        // Offset lance starting point to the right side of horse body
        const shoulderOffsetY = 9; 
        
        // Lance Shaft
        ctx.strokeStyle = '#8B5A2B'; // Wood lance shaft
        ctx.lineWidth = this.lanceWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(5, shoulderOffsetY);
        ctx.lineTo(this.lanceLength - 12, shoulderOffsetY);
        ctx.stroke();

        // Lance Grip Guard
        ctx.fillStyle = this.lanceColor;
        ctx.beginPath();
        ctx.arc(10, shoulderOffsetY, 7, 0, Math.PI * 2);
        ctx.fill();

        // Lance Metal Tip
        ctx.strokeStyle = '#e0e0e0'; // Steel tip
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.lanceLength - 12, shoulderOffsetY - this.lanceWidth/2);
        ctx.lineTo(this.lanceLength, shoulderOffsetY); // Point
        ctx.lineTo(this.lanceLength - 12, shoulderOffsetY + this.lanceWidth/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

export class Player extends Knight {
    constructor(x, y) {
        super(x, y, {
            name: "Player Knight",
            maxHealth: 100,
            maxSpeed: 4.8,
            accelRate: 0.22,
            friction: 0.05,
            mass: 1.2,
            horseColor: '#e5e7eb', // White steed
            armorColor: '#ffd700', // Gold trim armor
            plumeColor: '#ef4444', // Red crest
            shieldColor: '#3b82f6', // Royal blue shield
            shieldDesign: 'cross',
            lanceLength: 70,
            lanceWidth: 6,
            lanceColor: '#ffd700',
            baseDamage: 30
        });

        // Boost Stats
        this.boostStamina = 100;
        this.maxBoostStamina = 100;
        this.isBoosting = false;
        this.boostMultiplier = 1.85;
        this.boostCostRate = 1.2; // Stamina drained per frame
        this.boostRegenRate = 0.4; // Stamina regened per frame
        this.boostCooldown = false;
        this.boostTimer = 0;
        this.hoofbeatTimer = 0;
    }

    upgrade(type, level) {
        // Upgrade coefficients
        switch (type) {
            case 'speed':
                this.baseMaxSpeed = 4.8 + level * 0.6;
                this.accelRate = 0.22 + level * 0.03;
                break;
            case 'armor':
                this.mass = 1.2 + level * 0.25;
                this.maxHealth = 100 + level * 15;
                this.health = Math.min(this.maxHealth, this.health + 15); // Heal on upgrade
                break;
            case 'lance':
                this.lanceLength = 70 + level * 10;
                this.lanceWidth = 6 + level * 0.5;
                break;
            case 'sharpness':
                this.baseDamage = 30 + level * 10;
                break;
            case 'boost':
                this.maxBoostStamina = 100 + level * 20;
                this.boostRegenRate = 0.4 + level * 0.08;
                break;
        }
    }

    update(dt, keys, mousePos) {
        if (this.isDead) return;

        super.update(dt);

        // 1. Process Steering Input
        this.inputDir = Vector.create(0, 0);
        if (keys['w'] || keys['ArrowUp']) this.inputDir.y = -1;
        if (keys['s'] || keys['ArrowDown']) this.inputDir.y = 1;
        if (keys['a'] || keys['ArrowLeft']) this.inputDir.x = -1;
        if (keys['d'] || keys['ArrowRight']) this.inputDir.x = 1;

        // Normalize input vector so diagonal moving isn't faster
        if (Vector.magSq(this.inputDir) > 0) {
            this.inputDir = Vector.normalize(this.inputDir);
        }

        // 2. Handle Lance Aiming (Towards Mouse)
        const dx = mousePos.x - this.pos.x;
        const dy = mousePos.y - this.pos.y;
        this.lanceAngle = Math.atan2(dy, dx);

        // 3. Handle Boost/Charge Mechanics
        const wantBoost = keys[' '] || keys['mouse0'];
        if (wantBoost && this.boostStamina > 10 && !this.boostCooldown) {
            if (!this.isBoosting) {
                audio.playBoost();
                this.isBoosting = true;
            }
            this.boostStamina = Math.max(0, this.boostStamina - this.boostCostRate);
            if (this.boostStamina <= 0) {
                this.boostCooldown = true;
                this.isBoosting = false;
            }
        } else {
            this.isBoosting = false;
            // Recharge stamina
            this.boostStamina = Math.min(this.maxBoostStamina, this.boostStamina + this.boostRegenRate);
            if (this.boostCooldown && this.boostStamina > 30) {
                this.boostCooldown = false; // Cooldown cleared once charged to 30%
            }
        }

        // Update Position & Speed
        const speedLimit = this.baseMaxSpeed;
        const currentAccel = this.isBoosting ? this.accelRate * 2.5 : this.accelRate;
        updateHorsePhysics(this, dt, speedLimit, currentAccel, this.friction);

        // 4. Procedural Galloping Sound based on velocity
        const speed = Vector.mag(this.vel);
        if (speed > 0.5) {
            this.hoofbeatTimer += speed * 0.05;
            if (this.hoofbeatTimer >= 1.0) {
                // Alternating steps
                audio.playHoofbeat(Math.min(0.8, speed / this.maxSpeed));
                this.hoofbeatTimer = 0;
            }
        } else {
            this.hoofbeatTimer = 0.9; // Prime for next step
        }
    }
}

export class Enemy extends Knight {
    /**
     * @param {string} type 'standard', 'charger', 'heavy', 'flanker'
     */
    constructor(x, y, type = 'standard', level = 1) {
        // Setup stats based on enemy profile & scale with wave level
        const stats = Enemy.getProfile(type, level);
        super(x, y, stats);

        this.type = type;
        this.aiCooldown = Math.random() * 20; // Stagger AI recalculation
        this.chargeTimer = 0;
        this.chargeCooldown = 120 + Math.random() * 100; // Frames between charges
        this.flankOffset = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2; // Direction of flank circle
    }

    static getProfile(type, level) {
        const lvlMod = 1 + (level - 1) * 0.12; // 12% stat scaling per level
        
        switch (type) {
            case 'charger':
                return {
                    name: "Crimson Charger",
                    maxHealth: Math.round(75 * lvlMod),
                    maxSpeed: 5.4 * lvlMod,
                    accelRate: 0.25 * lvlMod,
                    friction: 0.04,
                    mass: 0.9,
                    horseColor: '#7f1d1d', // Crimson
                    armorColor: '#374151', // Dark crest
                    plumeColor: '#facc15', // Yellow
                    shieldColor: '#b91c1c',
                    shieldDesign: 'stripe',
                    lanceLength: 70 + (level * 2),
                    lanceWidth: 5,
                    lanceColor: '#dc2626',
                    baseDamage: Math.round(25 * lvlMod)
                };
            case 'heavy':
                return {
                    name: "Steel Bastion",
                    maxHealth: Math.round(180 * lvlMod),
                    maxSpeed: 3.2 * lvlMod,
                    accelRate: 0.12 * lvlMod,
                    friction: 0.06,
                    mass: 2.2 * lvlMod,
                    horseColor: '#1e293b', // Midnight black
                    armorColor: '#94a3b8', // Plate silver
                    plumeColor: '#475569', // Slate
                    shieldColor: '#0f172a',
                    shieldDesign: 'cross',
                    lanceLength: 85 + (level * 2),
                    lanceWidth: 8,
                    lanceColor: '#64748b',
                    baseDamage: Math.round(40 * lvlMod)
                };
            case 'flanker':
                return {
                    name: "Phantom Flanker",
                    maxHealth: Math.round(90 * lvlMod),
                    maxSpeed: 4.6 * lvlMod,
                    accelRate: 0.20 * lvlMod,
                    friction: 0.04,
                    mass: 1.1,
                    horseColor: '#3b0764', // Deep purple
                    armorColor: '#e2e8f0', // Shiny silver
                    plumeColor: '#a855f7', // Purple
                    shieldColor: '#581c87',
                    shieldDesign: 'circle',
                    lanceLength: 60 + (level * 2),
                    lanceWidth: 4,
                    lanceColor: '#c084fc',
                    baseDamage: Math.round(22 * lvlMod)
                };
            case 'standard':
            default:
                return {
                    name: "Vanguard Joust",
                    maxHealth: Math.round(100 * lvlMod),
                    maxSpeed: 4.2 * lvlMod,
                    accelRate: 0.16 * lvlMod,
                    friction: 0.04,
                    mass: 1.3,
                    horseColor: '#5c3d2e', // Bay brown
                    armorColor: '#d1d5db', // Dull silver
                    plumeColor: '#2563eb', // Blue
                    shieldColor: '#1e3a8a',
                    shieldDesign: 'cross',
                    lanceLength: 62 + (level * 2),
                    lanceWidth: 5,
                    lanceColor: '#4b5563',
                    baseDamage: Math.round(20 * lvlMod)
                };
        }
    }

    update(dt, player) {
        if (this.isDead) return;

        super.update(dt);

        this.aiCooldown--;
        this.chargeCooldown--;

        if (this.aiCooldown <= 0) {
            this.aiCooldown = 10 + Math.random() * 15; // Re-evaluate steering
            this.calculateAIBehavior(player);
        }

        // Handle active charge behavior
        if (this.isBoosting) {
            this.chargeTimer--;
            if (this.chargeTimer <= 0) {
                this.isBoosting = false;
                this.maxSpeed = this.baseMaxSpeed;
            }
        }

        // Apply movement physics
        updateHorsePhysics(this, dt, this.maxSpeed, this.accelRate, this.friction);
    }

    calculateAIBehavior(player) {
        const toPlayer = Vector.sub(player.pos, this.pos);
        const dist = Vector.mag(toPlayer);

        // 1. AIM LANCE DIRECTLY AT PLAYER
        // AI will aim lance at player's horse center
        const angleToPlayer = Math.atan2(toPlayer.y, toPlayer.x);
        this.lanceAngle = angleToPlayer;

        // 2. STEER LOGIC
        if (this.type === 'charger') {
            // Charger behavior: Direct charge! If close and cooldown off, boost speed
            if (dist < 280 && this.chargeCooldown <= 0 && !this.isBoosting) {
                this.isBoosting = true;
                this.chargeTimer = 45; // Charge for 45 frames (~0.75 seconds)
                this.chargeCooldown = 200 + Math.random() * 100;
                this.maxSpeed = this.baseMaxSpeed * 1.9; // High speed
                this.inputDir = Vector.normalize(toPlayer); // Direct path lock
                audio.playBoost();
            } else if (!this.isBoosting) {
                // Approach normally
                this.inputDir = Vector.normalize(toPlayer);
            }
        } 
        else if (this.type === 'flanker') {
            // Flanker behavior: Tries to approach player in a curving spiral,
            // avoiding hitting the head-on lance of the player.
            if (dist > 180) {
                // Steer at an offset angle to flank
                const flankAngle = angleToPlayer + this.flankOffset * 0.7;
                this.inputDir = Vector.create(Math.cos(flankAngle), Math.sin(flankAngle));
            } else {
                // Close in for the kill!
                this.inputDir = Vector.normalize(toPlayer);
            }
        }
        else if (this.type === 'heavy') {
            // Heavy: Slow, steady approach. Tries to block and bulldoze.
            // Occasionally backs off slightly if lance is not aligned.
            this.inputDir = Vector.normalize(toPlayer);
        }
        else {
            // Standard AI: Direct pursuit
            this.inputDir = Vector.normalize(toPlayer);
        }

        // If player is dead, AI just drifts/patrols
        if (player.isDead) {
            this.inputDir = Vector.create(Math.cos(this.angle), Math.sin(this.angle));
        }
    }
}
