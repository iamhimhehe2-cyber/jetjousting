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
        // Use entity.turnRate — lower = harder to turn (online mode uses ~0.05)
        entity.angle += diff * (entity.turnRate || 0.15);
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
    const lanceDir = { x: Math.cos(attacker.lanceAngle), y: Math.sin(attacker.lanceAngle) };
    const lanceNormal = { x: -lanceDir.y, y: lanceDir.x };

    // Match the rendered tip: the lance is held 9px below its rotation axis.
    const shoulderOffset = 9;
    const tipPoint = Vector.add(
        Vector.add(attacker.pos, Vector.mult(lanceDir, attacker.lanceLength)),
        Vector.mult(lanceNormal, shoulderOffset)
    );
    const hitRadius = defender.radius + Math.max(2, (attacker.lanceWidth || 0) / 2);
    const distToTip = Vector.dist(defender.pos, tipPoint);

    // A lance can strike a target once per continuous contact. It re-arms only
    // after the tip leaves the target, preventing overlap from causing repeat hits.
    if (distToTip >= hitRadius) {
        if (attacker.lanceContactTargets) attacker.lanceContactTargets.delete(defender);
        return { collided: false };
    }

    if (!attacker.lanceContactTargets) attacker.lanceContactTargets = new WeakSet();
    if (attacker.lanceContactTargets.has(defender)) {
        return { collided: false };
    }
    attacker.lanceContactTargets.add(defender);

    const relativeVel = Vector.sub(attacker.vel, defender.vel);
    const speedAlongLance = Vector.dot(relativeVel, lanceDir);

    // Determine whether the tip contacted the defender's shield side.
    const impactVec = Vector.sub(tipPoint, defender.pos);
    const impactAngle = Math.atan2(impactVec.y, impactVec.x);
    let relAngle = impactAngle - defender.angle;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;
    while (relAngle > Math.PI) relAngle -= Math.PI * 2;
    const shieldHit = relAngle < 0.2 && relAngle > -Math.PI * 0.8;

    return {
        collided: true,
        impactSpeed: speedAlongLance,
        point: tipPoint,
        lanceFraction: 1,
        shieldHit
    };
}
