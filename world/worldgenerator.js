
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

const DIRECTIONS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

// Creates an irregular Z4 peak, tile by tile.
function createPeak(width, height, mountain, random) {
    const mask = new Uint8Array(width * height);

    const startX = mountain.x - Math.floor(mountain.peakWidth / 2);
    const startY = mountain.y - Math.floor(mountain.peakHeight / 2);

    for (let py = 0; py < mountain.peakHeight; py++) {
        for (let px = 0; px < mountain.peakWidth; px++) {
            const x = startX + px;
            const y = startY + py;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            // Every tile gets its own random decision.
            if (random() < 0.82) {
                mask[y * width + x] = 1;
            }
        }
    }

    // Always preserve the center of the peak.
    mask[mountain.y * width + mountain.x] = 1;

    return mask;
}

// Finds the distance of every tile from the previous elevation layer.
// Distance is measured in 8 directions, including diagonals.
function calculateDistances(mask, width, height, maxDistance) {
    const size = width * height;
    const distances = new Int16Array(size);
    distances.fill(-1);

    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;

    for (let i = 0; i < size; i++) {
        if (mask[i]) {
            distances[i] = 0;
            queue[tail++] = i;
        }
    }

    while (head < tail) {
        const index = queue[head++];
        const distance = distances[index];

        if (distance >= maxDistance) continue;

        const x = index % width;
        const y = Math.floor(index / width);

        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                continue;
            }

            const nextIndex = ny * width + nx;

            if (distances[nextIndex] !== -1) continue;

            distances[nextIndex] = distance + 1;
            queue[tail++] = nextIndex;
        }
    }

    return distances;
}

// Expands one elevation layer around the previous one.
function expandLayer(previousMask, width, height, minWidth, maxWidth, random) {
    const size = width * height;
    const nextMask = new Uint8Array(size);

    const distances = calculateDistances(
        previousMask,
        width,
        height,
        maxWidth
    );

    // Process tiles from nearest to farthest.
    for (let distance = 1; distance <= maxWidth; distance++) {
        for (let index = 0; index < size; index++) {
            if (distances[index] !== distance) continue;

            const x = index % width;
            const y = Math.floor(index / width);

            // Each tile independently chooses its maximum reach.
            const localReach = randomInt(random, minWidth, maxWidth);

            if (distance > localReach) continue;

            // A new tile must connect to the previous layer
            // or to a tile already accepted in this new layer.
            let connected = false;

            for (const [dx, dy] of DIRECTIONS) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    continue;
                }

                const neighbor = ny * width + nx;

                if (previousMask[neighbor] || nextMask[neighbor]) {
                    connected = true;
                    break;
                }
            }

            if (!connected) continue;

            // Individual random decision for this tile.
            const probability = 0.88 - (distance - 1) * 0.07;

            if (random() < probability) {
                nextMask[index] = 1;
            }
        }
    }

    return nextMask;
}

export function generateWorld(config, overrides = {}) {
    const width = config.map.width;
    const height = config.map.height;

    const seed = overrides.seed ?? config.map.seed;
    const random = createRandom(seed);

    const elevation = new Uint8Array(width * height);
    const mountains = [];

    const count =
        overrides.mountainCount ?? config.mountains.count;

    const minimumDistance =
        overrides.minimumDistance ??
        config.mountains.minimumDistance;

    const peakMin = config.mountains.peakSize.min;
    const peakMax =
        overrides.peakMax ?? config.mountains.peakSize.max;

    const bands = config.elevation.bands;

    // 1. Place mountain peaks.
    let attempts = 0;
    const maxAttempts = count * 500;

    while (mountains.length < count && attempts < maxAttempts) {
        attempts++;

        const peakWidth = randomInt(random, peakMin, peakMax);
        const peakHeight = randomInt(random, peakMin, peakMax);

        const margin = Math.ceil(peakMax / 2) + 2;

        const x = randomInt(random, margin, width - margin - 1);
        const y = randomInt(random, margin, height - margin - 1);

        const tooClose = mountains.some(mountain => {
            return Math.hypot(mountain.x - x, mountain.y - y)
                < minimumDistance;
        });

        if (tooClose) continue;

        mountains.push({
            x,
            y,
            peakWidth,
            peakHeight
        });
    }

    // 2. Generate Z4, Z3, Z2 and Z1 separately for each mountain.
    mountains.forEach(mountain => {
        let currentMask = createPeak(width, height, mountain, random);

        // Z4 - mountain peak.
        for (let i = 0; i < elevation.length; i++) {
            if (currentMask[i]) elevation[i] = Math.max(elevation[i], 4);
        }

        const layers = [
            { level: 3, range: bands.z3 },
            { level: 2, range: bands.z2 },
            { level: 1, range: bands.z1 }
        ];

        for (const layer of layers) {
            const nextMask = expandLayer(
                currentMask,
                width,
                height,
                layer.range.min,
                layer.range.max,
                random
            );

            for (let i = 0; i < elevation.length; i++) {
                if (nextMask[i]) {
                    elevation[i] = Math.max(elevation[i], layer.level);
                }
            }

            currentMask = nextMask;
        }
    });

    return {
        width,
        height,
        elevation,
        mountains,
        seed
    };
}
