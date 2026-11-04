
function createRandom(seed) {
    let state = seed >>> 0;

    return function () {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomInt(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function getBandWidth(random, band) {
    return randomInt(random, band.min, band.max);
}

export function generateWorld(config, overrides = {}) {
    const width = config.map.width;
    const height = config.map.height;
    const random = createRandom(overrides.seed ?? config.map.seed);

    const elevation = new Uint8Array(width * height);
    const mountains = [];

    const count = overrides.mountainCount ?? config.mountains.count;
    const minimumDistance =
        overrides.minimumDistance ?? config.mountains.minimumDistance;

    const peakMin = config.mountains.peakSize.min;
    const peakMax = overrides.peakMax ?? config.mountains.peakSize.max;

    const bands = config.elevation.bands;

    // Create mountain centers.
    let attempts = 0;
    const maxAttempts = count * 500;

    while (mountains.length < count && attempts < maxAttempts) {
        attempts++;

        const mountainWidth = randomInt(random, peakMin, peakMax);
        const mountainHeight = randomInt(random, peakMin, peakMax);

        const margin = 25;

        const x = randomInt(
            random,
            margin,
            width - margin
        );

        const y = randomInt(
            random,
            margin,
            height - margin
        );

        // Minimum distance applies to mountain centers.
        const tooClose = mountains.some(mountain => {
            const dx = mountain.x - x;
            const dy = mountain.y - y;

            return Math.sqrt(dx * dx + dy * dy) < minimumDistance;
        });

        if (tooClose) continue;

        mountains.push({
            x,
            y,
            width: mountainWidth,
            height: mountainHeight,

            // Width of the surrounding elevation bands.
            z2Width: getBandWidth(random, bands.z3),
            z1Width: getBandWidth(random, bands.z2),
            z0Width: getBandWidth(random, bands.z1)
        });
    }

    // Paint mountain shapes into the elevation grid.
    mountains.forEach(mountain => {
        const rx = mountain.width / 2;
        const ry = mountain.height / 2;

        const outerRadius =
            Math.max(rx, ry) +
            mountain.z2Width +
            mountain.z1Width +
            mountain.z0Width + 2;

        const minX = Math.max(0, Math.floor(mountain.x - outerRadius));
        const maxX = Math.min(width - 1, Math.ceil(mountain.x + outerRadius));

        const minY = Math.max(0, Math.floor(mountain.y - outerRadius));
        const maxY = Math.min(height - 1, Math.ceil(mountain.y + outerRadius));

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {

                const dx = (x - mountain.x) / rx;
                const dy = (y - mountain.y) / ry;

                const normalizedDistance = Math.sqrt(dx * dx + dy * dy);

                // Convert the ellipse boundary to an approximate
                // distance in tiles.
                const edgeDistance =
                    (normalizedDistance - 1) * Math.min(rx, ry);

                // Small deterministic irregularity.
                const noise =
                    Math.sin(x * 12.9898 + y * 78.233) * 0.35;

                const distance = edgeDistance + noise;

                let level = 0;

                if (distance <= 0) {
                    level = 3;
                } else if (distance <= mountain.z2Width) {
                    level = 2;
                } else if (
                    distance <= mountain.z2Width + mountain.z1Width
                ) {
                    level = 1;
                }

                const index = y * width + x;

                // Overlapping mountains keep the highest elevation.
                elevation[index] = Math.max(elevation[index], level);
            }
        }
    });

    return {
        width,
        height,
        elevation,
        mountains,
        seed: overrides.seed ?? config.map.seed
    };
}
