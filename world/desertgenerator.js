const DEFAULTS = {
    borderDepth: 50,
    borderVariation: 15,
    waterRadius: 50,
    minimumPatchSize: 50
};

const NEIGHBORS_8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],    [1, 1]
];

const NEIGHBORS_4 = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
];

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

// Multi-source breadth-first search. Eight-way distance is intentional:
// the 50-tile water radius should feel circular rather than diamond-shaped.
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
        amplitudeA: variation * (0.55 + random() * 0.25),
        amplitudeB: variation * (0.20 + random() * 0.15),
        frequencyA: 0.8 + random() * 0.8,
        frequencyB: 2.0 + random() * 1.5
    }));
}

function getBorderDepth(position, length, wave, baseDepth, variation) {
    const t = length <= 1 ? 0 : position / (length - 1);
    const depth = baseDepth
        + Math.sin(t * Math.PI * 2 * wave.frequencyA + wave.phaseA) * wave.amplitudeA
        + Math.sin(t * Math.PI * 2 * wave.frequencyB + wave.phaseB) * wave.amplitudeB;

    return Math.max(baseDepth - variation, Math.min(baseDepth + variation, depth));
}

function generateBorderDesert(width, height, elevation, water, random, options) {
    const {
        borderDepth,
        borderVariation
    } = options;

    const waves = createBorderWaves(random, borderVariation);
    const desert = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = y * width + x;
            if (elevation[tile] !== 0) continue;

            const fromLeft = x;
            const fromRight = width - 1 - x;
            const fromTop = y;
            const fromBottom = height - 1 - y;

            const insideBorder =
                fromLeft <= getBorderDepth(y, height, waves[0], borderDepth, borderVariation) ||
                fromRight <= getBorderDepth(y, height, waves[1], borderDepth, borderVariation) ||
                fromTop <= getBorderDepth(x, width, waves[2], borderDepth, borderVariation) ||
                fromBottom <= getBorderDepth(x, width, waves[3], borderDepth, borderVariation);

            // Keep water as water; it is still allowed to reach the map edge.
            if (insideBorder && !water[tile]) desert[tile] = 1;
        }
    }

    return desert;
}

function generateDryZ1Patches(width, height, elevation, waterDistance, options) {
    const { waterRadius, minimumPatchSize } = options;
    const size = width * height;
    const candidate = new Uint8Array(size);
    const visited = new Uint8Array(size);
    const desert = new Uint8Array(size);

    for (let i = 0; i < size; i++) {
        if (elevation[i] === 1 && waterDistance[i] > waterRadius) {
            candidate[i] = 1;
        }
    }

    const queue = new Int32Array(size);

    for (let start = 0; start < size; start++) {
        if (!candidate[start] || visited[start]) continue;

        let read = 0;
        let write = 0;
        queue[write++] = start;
        visited[start] = 1;

        while (read < write) {
            const tile = queue[read++];
            const x = tile % width;
            const y = Math.floor(tile / width);

            for (const [dx, dy] of NEIGHBORS_4) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                const next = ny * width + nx;
                if (!candidate[next] || visited[next]) continue;

                visited[next] = 1;
                queue[write++] = next;
            }
        }

        // Only coherent, meaningful patches become desert. Tiny isolated
        // pockets are left to the normal Z1 biome instead.
        if (write >= minimumPatchSize) {
            for (let i = 0; i < write; i++) desert[queue[i]] = 1;
        }
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

    // The outer Z0 desert is generated first and takes priority over the
    // inner dry-Z1 patches. Neither rule ever overwrites actual water.
    const desertTiles = generateBorderDesert(
        width, height, elevation, water, random, settings
    );
    const innerPatches = generateDryZ1Patches(
        width, height, elevation, waterDistance, settings
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
            borderDepth: settings.borderDepth,
            borderVariation: settings.borderVariation,
            waterRadius: settings.waterRadius,
            minimumPatchSize: settings.minimumPatchSize
        }
    };
}
