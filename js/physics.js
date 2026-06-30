// 2D Vector Physics Helper Module

export const Vector = {
    create: (x = 0, y = 0) => ({ x, y }),
    copy: (v) => ({ x: v.x, y: v.y }),
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    mult: (v, n) => ({ x: v.x * n, y: v.y * n }),
    div: (v, n) => ({ x: v.x / n, y: v.y / n }),
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
    magSq: (v) => v.x * v.x + v.y * v.y,
    mag: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
        const m = Math.sqrt(v.x * v.x + v.y * v.y);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    },
    dist: (v1, v2) => {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        return Math.sqrt(dx * dx + dy * dy);
    },
    limit: (v, max) => {
        const mSq = v.x * v.x + v.y * v.y;
        if (mSq > max * max) {
            const m = Math.sqrt(mSq);
            return { x: (v.x / m) * max, y: (v.y / m) * max };
        }
        return { x: v.x, y: v.y };
    },
    lerp: (v1, v2, amt) => ({
        x: v1.x + (v2.x - v1.x) * amt,
        y: v1.y + (v2.y - v1.y) * amt
    })
};

/**
 * Updates horse physics with inertia/friction.
 * Controls feel like a heavy warhorse: high momentum, slow steering adjustment.
 */
export function updateHorsePhysics(entity, dt, maxSpeed, accelRate, friction) {
    // Apply acceleration input in the direction the horse wants to move
    if (Vector.magSq(entity.inputDir) > 0) {
        const targetAccel = Vector.mult(Vector.normalize(entity.inputDir), accelRate);
        entity.vel = Vector.add(entity.vel, targetAccel);
    }

    // Apply friction/drag
    entity.vel = Vector.mult(entity.vel, 1 - friction);

    // Limit speed to max
    const currentMax = entity.isBoosting ? maxSpeed * entity.boostMultiplier : maxSpeed;
    entity.vel = Vector.limit(entity.vel, currentMax);

    // Update position
    entity.pos = Vector.add(entity.pos, entity.vel);

    // Smoothly rotate horse facing angle towards movement direction (if moving)
    if (Vector.magSq(entity.vel) > 0.05) {
        const moveAngle = Math.atan2(entity.vel.y, entity.vel.x);
        // Angle wrapping interpolation
        let diff = moveAngle - entity.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        entity.angle += diff * 0.15; // Smooth steer interpolation rate
    }
}

/**
 * Resolves standard circle-to-circle collision between two horses.
 * Separates overlapping entities and performs a simple elastic rebound.
 */
export function resolveHorseCollisions(h1, h2) {
    const dist = Vector.dist(h1.pos, h2.pos);
    const minDist = h1.radius + h2.radius;

    if (dist < minDist) {
        // Compute overlap depth
        const overlap = minDist - dist;
        // Direction vector from h2 to h1
        const dir = dist === 0 ? { x: 1, y: 0 } : Vector.div(Vector.sub(h1.pos, h2.pos), dist);

        // Separate them based on relative mass (heavier horse moves less)
        const totalMass = h1.mass + h2.mass;
        const ratio1 = h2.mass / totalMass;
        const ratio2 = h1.mass / totalMass;

        h1.pos = Vector.add(h1.pos, Vector.mult(dir, overlap * ratio1));
        h2.pos = Vector.sub(h2.pos, Vector.mult(dir, overlap * ratio2));

        // Rebound velocities (elastic bounce)
        const relativeVel = Vector.sub(h1.vel, h2.vel);
        const velAlongNormal = Vector.dot(relativeVel, dir);

        // Only resolve if velocities are moving towards each other
        if (velAlongNormal < 0) {
            const restitution = 0.5; // Bouncy horses!
            const impulseScalar = -(1 + restitution) * velAlongNormal / (1/h1.mass + 1/h2.mass);
            const impulse = Vector.mult(dir, impulseScalar);

            h1.vel = Vector.add(h1.vel, Vector.div(impulse, h1.mass));
            h2.vel = Vector.sub(h2.vel, Vector.div(impulse, h2.mass));
        }
        return true;
    }
    return false;
}

/**
 * Detects if a lance segment (attacker) intersects an enemy circle (defender).
 * The lance is represented as a segment starting near the attacker's center and
 * extending out along attacker's lance angle.
 * 
 * Returns details of the collision: { collided: boolean, impactSpeed: number, point: Vector }
 */
export function checkLanceStrike(attacker, defender) {
    // 1. Define the lance line segment AB
    // The lance starts at attacker center + offset in lance direction (so it starts outside horse body)
    const lanceDir = { x: Math.cos(attacker.lanceAngle), y: Math.sin(attacker.lanceAngle) };
    
    // Lance start point A (just outside the horse's radius)
    const startOffset = attacker.radius * 0.8;
    const startPoint = Vector.add(attacker.pos, Vector.mult(lanceDir, startOffset));
    
    // Lance end point B (extended by lance length)
    const endPoint = Vector.add(startPoint, Vector.mult(lanceDir, attacker.lanceLength));

    // 2. Find the closest point P on segment AB to defender circle center C
    const C = defender.pos;
    const AB = Vector.sub(endPoint, startPoint);
    const AC = Vector.sub(C, startPoint);

    const abLenSq = Vector.magSq(AB);
    if (abLenSq === 0) return { collided: false };

    // Projection fraction t, clamped to [0, 1] to stay on the segment
    let t = Vector.dot(AC, AB) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    // Closest point on the lance segment
    const closestPoint = Vector.add(startPoint, Vector.mult(AB, t));

    // Distance from closest point to defender circle center
    const distToCenter = Vector.dist(C, closestPoint);

    // 3. Collision check
    if (distToCenter < defender.radius) {
        // It's a hit! Now let's calculate relative velocity along the lance axis
        // We only care about velocity moving TOWARDS the defender
        const relativeVel = Vector.sub(attacker.vel, defender.vel);
        
        // Project relative velocity onto the lance direction
        const speedAlongLance = Vector.dot(relativeVel, lanceDir);

        // We also want to include the absolute movement speed of the attacker if it's a direct charge.
        // If the attacker is moving fast, the impact is hard even if the defender is still.
        // Thus, speedAlongLance represents how fast they are closing in on the lance axis.
        
        return {
            collided: true,
            impactSpeed: speedAlongLance,
            point: closestPoint,
            lanceFraction: t // Where on the lance did the collision happen (0 is base, 1 is tip)
        };
    }

    return { collided: false };
}
