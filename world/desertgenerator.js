const DEFAULTS = {
    borderMinDepth: 20,
    borderMaxDepth: 40,
    borderVariation: 20,
    waterRadius: 50,
    minimumPatchSize: 50,
    patchMinRadiusX: 6,
    patchMaxRadiusX: 14,
    patchMinRadiusY: 4,
    patchMaxRadiusY: 10,
    maxInnerPatches: 16
};

const NEIGHBORS_8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],    [1, 1]
];

function randomInt(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function collectWaterTiles(size, rivers) {
    const water = new Uint8Array(size);

    for (let i = 0; i < Math.min(size, rivers?.riverTiles?.length || 0); i++) {
        if (rivers.riverTiles[i]) water[i] = 1;
    }

    for (const lake of rivers?.lakes || []) {
        for (const tile of lake.tiles || []) {
            if (tile >= 0 && tile < size) water[tile] = 1;
        }
    }

    return water;
}

// Multi-source breadth-first search. Eight-way distance gives a much more
// circular water exclusion radius than a four-way Manhattan distance.
function buildWaterDistance(width, height, water, maxDistance) {
    const size = width * height;
    const distance = new Uint8Array(size);
    distance.fill(255);

    const queue = new Int32Array(size);
    let read = 0;
    let write = 0;

    for (let i = 0; i < size; i++) {
        if (!water[i]) continue;
        distance[i] = 0;
        queue[write++] = i;
    }

    while (read < write) {
        const tile = queue[read++];
        const currentDistance = distance[tile];
        if (currentDistance >= maxDistance) continue;

        const x = tile % width;
        const y = Math.floor(tile / width);
        const nextDistance = currentDistance + 1;

        for (const [dx, dy] of NEIGHBORS_8) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const next = ny * width + nx;
            if (distance[next] <= nextDistance) continue;

            distance[next] = nextDistance;
            queue[write++] = next;
        }
    }

    return distance;
}

function createBorderWaves(random, variation) {
    return Array.from({ length: 4 }, () => ({
        phaseA: random() * Math.PI * 2,
        phaseB: random() * Math.PI * 2,
        amplitudeA: variation * 0.7,
        amplitudeB: variation * 0.3,
        // More frequent bends than the first pass: several waves along
        // each map edge, with a smaller, faster secondary ripple.
        frequencyA: 3.5 + random() * 2.5,
        frequencyB: 8 + random() * 5
    }));
}

function getBorderDepth(position, length, wave, minDepth, maxDepth) {
    const t = length <= 1 ? 0 : position / (length - 1);
    const middle = (minDepth + maxDepth) / 2;
    const depth = middle
        + Math.sin(t * Math.PI * 2 * wave.frequencyA + wave.phaseA) * wave.amplitudeA
        + Math.sin(t * Math.PI * 2 * wave.frequencyB + wave.phaseB) * wave.amplitudeB;

    // The edge may fluctuate strongly, but its actual inland reach is
    // always constrained to the agreed 20–40 tile band.
    return Math.max(minDepth, Math.min(maxDepth, depth));
}

function generateBorderDesert(width, height, elevation, water, random, options) {
    const { borderMinDepth, borderMaxDepth, borderVariation } = options;
    const waves = createBorderWaves(random, borderVariation);
    const desert = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = y * width + x;
            if (elevation[tile] !== 0 || water[tile]) continue;

            const insideBorder =
                x <= getBorderDepth(y, height, waves[0], borderMinDepth, borderMaxDepth) ||
                width - 1 - x <= getBorderDepth(y, height, waves[1], borderMinDepth, borderMaxDepth) ||
                y <= getBorderDepth(x, width, waves[2], borderMinDepth, borderMaxDepth) ||
                height - 1 - y <= getBorderDepth(x, width, waves[3], borderMinDepth, borderMaxDepth);

            if (insideBorder) desert[tile] = 1;
        }
    }

    return desert;
}

function generateDryZ1Patches(width, height, elevation, waterDistance, random, options) {
    const {
        waterRadius,
        minimumPatchSize,
        patchMinRadiusX,
        patchMaxRadiusX,
        patchMinRadiusY,
        patchMaxRadiusY,
        maxInnerPatches
    } = options;

    const size = width * height;
    const candidates = [];

    for (let tile = 0; tile < size; tile++) {
        if (elevation[tile] === 1 && waterDistance[tile] > waterRadius) {
            candidates.push(tile);
        }
    }

    const desert = new Uint8Array(size);
    if (candidates.length < minimumPatchSize) return desert;

    // Place separate, bounded ellipses instead of converting entire connected
    // dry regions. Each patch stays recognizably oval even on a large Z1 shelf.
    const desiredCount = Math.min(
        maxInnerPatches,
        Math.max(1, Math.floor(candidates.length / 700))
    );

    let created = 0;
    const attempts = desiredCount * 20;

    for (let attempt = 0; attempt < attempts && created < desiredCount; attempt++) {
        const center = candidates[randomInt(random, 0, candidates.length - 1)];
        const cx = center % width;
        const cy = Math.floor(center / width);
        const radiusX = randomInt(random, patchMinRadiusX, patchMaxRadiusX);
        const radiusY = randomInt(random, patchMinRadiusY, patchMaxRadiusY);
        const angle = random() * Math.PI;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const patchTiles = [];

        const reach = Math.ceil(Math.max(radiusX, radiusY));
        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || y < 0 || x >= width || y >= height) continue;

                const tile = y * width + x;
                if (elevation[tile] !== 1 || waterDistance[tile] <= waterRadius || desert[tile]) continue;

                const rx = dx * cos + dy * sin;
                const ry = -dx * sin + dy * cos;
                if ((rx * rx) / (radiusX * radiusX) + (ry * ry) / (radiusY * radiusY) <= 1) {
                    patchTiles.push(tile);
                }
            }
        }

        if (patchTiles.length < minimumPatchSize) continue;

        for (const tile of patchTiles) desert[tile] = 1;
        created++;
    }

    return desert;
}

export function generateDesert({
    width,
    height,
    elevation,
    rivers,
    random,
    options = {}
}) {
    const settings = { ...DEFAULTS, ...options };
    const size = width * height;
    const water = collectWaterTiles(size, rivers);
    const waterDistance = buildWaterDistance(
        width, height, water, settings.waterRadius
    );

    const desertTiles = generateBorderDesert(
        width, height, elevation, water, random, settings
    );
    const innerPatches = generateDryZ1Patches(
        width, height, elevation, waterDistance, random, settings
    );

    let borderTileCount = 0;
    let innerTileCount = 0;

    for (let i = 0; i < size; i++) {
        if (desertTiles[i]) borderTileCount++;
        if (innerPatches[i]) {
            desertTiles[i] = 1;
            innerTileCount++;
        }
    }

    return {
        desertTiles,
        stats: {
            borderTileCount,
            innerTileCount,
            totalDesertTiles: borderTileCount + innerTileCount,
            borderMinDepth: settings.borderMinDepth,
            borderMaxDepth: settings.borderMaxDepth,
            borderVariation: settings.borderVariation,
            waterRadius: settings.waterRadius,
            innerPatchCount: innerTileCount > 0 ? 1 : 0,
            minimumPatchSize: settings.minimumPatchSize
        }
    };
}
