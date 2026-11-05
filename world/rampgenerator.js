// Directional cliff-edge bits are stored on the higher-elevation tile.
const EDGE = { NORTH: 1, EAST: 2, SOUTH: 4, WEST: 8 };
const MAX_RAMP_CLIFF_PERCENT = 10;
const MIN_WATER_CLEARANCE = 4;

const DIRECTIONS = [
    { dx: 0, dy: -1, bit: EDGE.NORTH, tangent: "horizontal" },
    { dx: 1, dy: 0, bit: EDGE.EAST, tangent: "vertical" },
    { dx: 0, dy: 1, bit: EDGE.SOUTH, tangent: "horizontal" },
    { dx: -1, dy: 0, bit: EDGE.WEST, tangent: "vertical" }
];

const indexOf = (x, y, width) => y * width + x;

function randomInt(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// Mark river channels, lake water, and a four-tile safety margin.
function createWaterBuffer(width, height, rivers) {
    const blocked = new Uint8Array(width * height);
    const water = new Uint8Array(width * height);

    if (rivers?.riverTiles) {
        for (let i = 0; i < rivers.riverTiles.length; i++) {
            if (rivers.riverTiles[i]) water[i] = 1;
        }
    }

    for (const lake of rivers?.lakes || []) {
        for (const tile of lake.tiles || []) water[tile] = 1;
    }

    for (let tile = 0; tile < water.length; tile++) {
        if (!water[tile]) continue;
        const x = tile % width;
        const y = Math.floor(tile / width);

        for (let dy = -MIN_WATER_CLEARANCE; dy <= MIN_WATER_CLEARANCE; dy++) {
            for (let dx = -MIN_WATER_CLEARANCE; dx <= MIN_WATER_CLEARANCE; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                blocked[indexOf(nx, ny, width)] = 1;
            }
        }
    }

    return blocked;
}

// Convert edge tiles into contiguous straight cliff stretches.
function makeSegments(edgeTiles, width, tangent) {
    const ordered = edgeTiles.slice().sort((a, b) => {
        const ax = a % width, ay = Math.floor(a / width);
        const bx = b % width, by = Math.floor(b / width);
        return tangent === "horizontal" ? ax - bx : ay - by;
    });

    const segments = [];
    let current = [];

    for (const tile of ordered) {
        if (current.length) {
            const previous = current[current.length - 1];
            const sameLine = tangent === "horizontal"
                ? Math.floor(previous / width) === Math.floor(tile / width)
                : previous % width === tile % width;
            const adjacent = tangent === "horizontal"
                ? tile % width === previous % width + 1
                : Math.floor(tile / width) === Math.floor(previous / width) + 1;

            if (!sameLine || !adjacent) {
                if (current.length >= 2) segments.push(current);
                current = [];
            }
        }
        current.push(tile);
    }

    if (current.length >= 2) segments.push(current);
    return segments;
}

export function generateRamps({ width, height, elevation, rivers, random }) {
    const size = width * height;
    const cliffTiles = new Uint8Array(size);
    const rampTiles = new Uint8Array(size);
    const waterBuffer = createWaterBuffer(width, height, rivers);
    const edgeGroups = [];

    // First calculate the complete cliff network. This gives us a real
    // denominator before deciding how many cliff edges may become ramps.
    let totalCliffEdges = 0;

    for (const direction of DIRECTIONS) {
        const byLowerLevel = new Map();

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tile = indexOf(x, y, width);
                const level = elevation[tile];
                if (level === 0) continue;

                const nx = x + direction.dx;
                const ny = y + direction.dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                const lowerLevel = elevation[indexOf(nx, ny, width)];
                if (lowerLevel !== level - 1) continue;

                cliffTiles[tile] |= direction.bit;
                totalCliffEdges++;

                if (!byLowerLevel.has(lowerLevel)) byLowerLevel.set(lowerLevel, []);
                byLowerLevel.get(lowerLevel).push(tile);
            }
        }

        for (const [lowerLevel, tiles] of byLowerLevel) {
            edgeGroups.push({ bit: direction.bit, lowerLevel, tangent: direction.tangent, tiles });
        }
    }

    // Maximum is a percentage of all directional cliff edges, not all map tiles.
    const rampEdgeBudget = Math.floor(totalCliffEdges * MAX_RAMP_CLIFF_PERCENT / 100);
    const segments = [];

    for (const group of edgeGroups) {
        for (const tiles of makeSegments(group.tiles, width, group.tangent)) {
            const safeTiles = tiles.filter(tile => !waterBuffer[tile]);
            for (const safeSegment of makeSegments(safeTiles, width, group.tangent)) {
                segments.push({ ...group, tiles: safeSegment });
            }
        }
    }

    // Randomize which eligible cliff stretches get the limited ramp allowance.
    shuffle(segments, random);
    let rampEdges = 0;

    for (const segment of segments) {
        if (rampEdges + 2 > rampEdgeBudget) break;

        const tiles = segment.tiles;
        const maxLength = Math.min(8, tiles.length, rampEdgeBudget - rampEdges);
        if (maxLength < 2) continue;

        const runLength = randomInt(random, 2, maxLength);
        const start = randomInt(random, 0, tiles.length - runLength);

        for (let i = start; i < start + runLength; i++) {
            const tile = tiles[i];
            rampTiles[tile] |= segment.bit;
            cliffTiles[tile] &= ~segment.bit;
            rampEdges++;
        }
    }

    return {
        cliffTiles,
        rampTiles,
        stats: {
            totalCliffEdges,
            rampEdges,
            rampEdgeBudget,
            rampPercent: totalCliffEdges ? rampEdges / totalCliffEdges * 100 : 0,
            maxRampPercent: MAX_RAMP_CLIFF_PERCENT,
            waterClearance: MIN_WATER_CLEARANCE
        }
    };
}
