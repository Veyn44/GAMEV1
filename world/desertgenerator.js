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

function smoothNoiseProfile(random, length, minDepth, maxDepth, variation) {
    const values = new Float32Array(length);
    const span = maxDepth - minDepth;
    const detailAmplitude = Math.min(4, variation * 0.2);

    // Randomly spaced control points prevent the border from repeating a
    // regular wave pattern. Smooth interpolation keeps the coastline organic.
    const anchors = [{ position: 0, depth: randomInt(random, minDepth, maxDepth) }];
    let position = 0;
    while (position < length - 1) {
        position = Math.min(length - 1, position + randomInt(random, 7, 16));
        anchors.push({ position, depth: randomInt(random, minDepth, maxDepth) });
    }

    let segment = 0;
    for (let i = 0; i < length; i++) {
        while (segment < anchors.length - 2 && i > anchors[segment + 1].position) {
            segment++;
        }

        const a = anchors[segment];
        const b = anchors[segment + 1];
        const rawT = b.position === a.position ? 0 : (i - a.position) / (b.position - a.position);
        const t = rawT * rawT * (3 - 2 * rawT);
        const broadDepth = a.depth + (b.depth - a.depth) * t;

        // A second, finer irregular layer breaks up long smooth stretches.
        const detail = (random() * 2 - 1) * detailAmplitude;
        values[i] = Math.max(minDepth, Math.min(maxDepth, broadDepth + detail));
    }

    return values;
}

function createBorderWaves(random, length, minDepth, maxDepth, variation) {
    return Array.from({ length: 4 }, () =>
        smoothNoiseProfile(random, length, minDepth, maxDepth, variation)
    );
}

function getBorderDepth(position, profile) {
    return profile[Math.max(0, Math.min(profile.length - 1, position))];
}

function generateBorderDesert(width, height, elevation, water, random, options) {
    const { borderMinDepth, borderMaxDepth, borderVariation } = options;
    const waves = [
        createBorderWaves(random, height, borderMinDepth, borderMaxDepth, borderVariation)[0],
        createBorderWaves(random, height, borderMinDepth, borderMaxDepth, borderVariation)[0],
        createBorderWaves(random, width, borderMinDepth, borderMaxDepth, borderVariation)[0],
        createBorderWaves(random, width, borderMinDepth, borderMaxDepth, borderVariation)[0]
    ];
    const desert = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = y * width + x;
            if (elevation[tile] !== 0 || water[tile]) continue;

            const insideBorder =
                x <= getBorderDepth(y, waves[0]) ||
                width - 1 - x <= getBorderDepth(y, waves[1]) ||
                y <= getBorderDepth(x, waves[2]) ||
                height - 1 - y <= getBorderDepth(x, waves[3]);

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
    if (candidates.length < minimumPatchSize) return { desert, patchCount: 0 };

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

    return { desert, patchCount: created };
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
    const innerResult = generateDryZ1Patches(
        width, height, elevation, waterDistance, random, settings
    );
    const innerPatches = innerResult.desert;

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
            innerPatchCount: innerResult.patchCount,
            minimumPatchSize: settings.minimumPatchSize
        }
    };
}
