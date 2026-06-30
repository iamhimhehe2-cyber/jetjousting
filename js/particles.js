// Particle and FX System for Joust Royale
// Handles visual feedback: dirt trails, sparks, blood splatters, wind streaks, and floating numbers.

class Particle {
    constructor(options) {
        this.x = options.x;
        this.y = options.y;
        this.vx = options.vx || 0;
        this.vy = options.vy || 0;
        this.color = options.color || '#fff';
        this.radius = options.radius || 2;
        this.alpha = options.alpha || 1;
        this.decay = options.decay || 0.02;
        this.gravity = options.gravity || 0;
        this.friction = options.friction || 0.98;
        this.life = 1; // 1 to 0
        this.type = options.type || 'spark'; // 'spark', 'dirt', 'blood', 'wind', 'text'
        
        // Text specific
        this.text = options.text || '';
        this.fontSize = options.fontSize || 16;
        this.fontWeight = options.fontWeight || 'bold';
        this.rotation = options.rotation || 0;
        this.rotSpeed = options.rotSpeed || 0;

        // Custom draw behavior if needed
        this.glow = options.glow || false;
    }

    update() {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        
        this.rotation += this.rotSpeed;
        
        this.life -= this.decay;
        this.alpha = Math.max(0, this.life);
        
        return this.life > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;

        if (this.type === 'text') {
            // Draw floating damage numbers
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.font = `${this.fontWeight} ${this.fontSize}px 'Outfit', sans-serif`;
            ctx.fillStyle = this.color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(this.text, 0, 0);
            ctx.fillText(this.text, 0, 0);
        } else if (this.type === 'wind') {
            // Draw speed streaks
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.radius;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - this.vx * 3, this.y - this.vy * 3); // Extends backward
            ctx.stroke();
        } else {
            // Draw standard particle shape (circles/sparks)
            if (this.glow) {
                ctx.shadowBlur = this.radius * 3;
                ctx.shadowColor = this.color;
            }
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    update() {
        this.particles = this.particles.filter(p => p.update());
    }

    draw(ctx) {
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].draw(ctx);
        }
    }

    clear() {
        this.particles = [];
    }

    /**
     * Spawn dirt kicks behind moving horses
     */
    spawnDirt(x, y, speedRatio) {
        const count = Math.ceil(speedRatio * 2);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const force = Math.random() * 1.5;
            this.particles.push(new Particle({
                x: x + (Math.random() - 0.5) * 10,
                y: y + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * force,
                vy: Math.sin(angle) * force,
                color: `hsl(${25 + Math.random() * 15}, 40%, ${25 + Math.random() * 15}%)`, // Earthy brown/grey
                radius: 2 + Math.random() * 4,
                decay: 0.03 + Math.random() * 0.02,
                friction: 0.95,
                type: 'dirt'
            }));
        }
    }

    /**
     * Spawn bright gold sparks upon lance impact
     */
    spawnSparks(x, y, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            this.particles.push(new Particle({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: Math.random() > 0.3 ? '#ffd700' : '#ffffff', // Gold/white sparks
                radius: 1.5 + Math.random() * 2.5,
                decay: 0.02 + Math.random() * 0.03,
                friction: 0.97,
                glow: true,
                type: 'spark'
            }));
        }
    }

    /**
     * Spawn blood splatters (directional hit sprays)
     */
    spawnBlood(x, y, hitDirection, intensity = 1.0) {
        const count = Math.floor(10 + intensity * 20);
        const baseAngle = Math.atan2(hitDirection.y, hitDirection.x);
        
        for (let i = 0; i < count; i++) {
            // Spray particles mostly outward in hit direction, with some dispersion
            const angle = baseAngle + (Math.random() - 0.5) * 1.2;
            const speed = (2 + Math.random() * 8) * intensity;
            
            this.particles.push(new Particle({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: `rgb(${160 + Math.random() * 60}, 10, 10)`, // Deep blood red variants
                radius: 1.5 + Math.random() * 3.5,
                decay: 0.015 + Math.random() * 0.02,
                gravity: 0.15, // Blood falls slightly downward
                friction: 0.98,
                type: 'blood'
            }));
        }
    }

    /**
     * Spawn speed/wind lines relative to camera
     */
    spawnWindStreak(width, height, velX, velY) {
        // Spawn line on the border opposite to the movement direction
        let x, y;
        const pad = 50;

        if (Math.abs(velX) > Math.abs(velY)) {
            // Horizontal dominant movement
            x = velX > 0 ? width + pad : -pad;
            y = Math.random() * height;
        } else {
            // Vertical dominant movement
            x = Math.random() * width;
            y = velY > 0 ? height + pad : -pad;
        }

        // Relative speed lines move backwards
        this.particles.push(new Particle({
            x,
            y,
            vx: -velX * (0.8 + Math.random() * 0.4),
            vy: -velY * (0.8 + Math.random() * 0.4),
            color: 'rgba(255, 255, 255, 0.15)',
            radius: 1 + Math.random() * 1.5,
            decay: 0.015,
            friction: 1.0, // No slowing down for speed lines
            type: 'wind'
        }));
    }

    /**
     * Spawn floating text indicators
     */
    spawnText(x, y, text, isCritical = false) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4; // Float upwards
        const speed = isCritical ? 2.5 : 1.5;
        
        let color = '#ffffff';
        let fontSize = 16;
        let scale = '';

        if (isCritical) {
            color = '#ffd700'; // Critical = gold
            fontSize = 24;
            scale = 'CRITICAL! ';
        } else if (typeof text === 'number' && text > 40) {
            color = '#ff6b6b'; // Heavy hit = bright orange-red
            fontSize = 20;
        } else if (typeof text === 'number') {
            color = '#ffccd5'; // Normal hit
        } else if (text.includes('$')) {
            color = '#a3e635'; // Gold reward = lime green
            fontSize = 18;
        }

        const displayText = typeof text === 'number' ? `${scale}${Math.round(text)}` : text;

        this.particles.push(new Particle({
            x,
            y: y - 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            fontSize,
            fontWeight: isCritical ? '900' : '800',
            rotation: (Math.random() - 0.5) * 0.2,
            rotSpeed: (Math.random() - 0.5) * 0.01,
            decay: isCritical ? 0.012 : 0.02,
            friction: 0.98,
            type: 'text'
        }));
    }
}
