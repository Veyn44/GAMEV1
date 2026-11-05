// Cliff edges are stored as directional bits on the higher tile.
// N=1, E=2, S=4, W=8. Z4 peaks are impassable and excluded.
const EDGE = { NORTH: 1, EAST: 2, SOUTH: 4, WEST: 8 };
const WATER_CLEARANCE = 4;
const MIN_RAMP_LENGTH = 4;

const DIRECTIONS = [
    { dx: 0, dy: -1, bit: EDGE.NORTH, axis: "h" },
    { dx: 1, dy: 0, bit: EDGE.EAST, axis: "v" },
    { dx: 0, dy: 1, bit: EDGE.SOUTH, axis: "h" },
    { dx: -1, dy: 0, bit: EDGE.WEST, axis: "v" }
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

function createWaterBuffer(width, height, rivers) {
    const blocked = new Uint8Array(width * height);
    const water = new Uint8Array(width * height);

    for (let i = 0; i < (rivers?.riverTiles?.length || 0); i++) {
        if (rivers.riverTiles[i]) water[i] = 1;
    }
    for (const lake of rivers?.lakes || []) {
        for (const tile of lake.tiles || []) {
            if (tile >= 0 && tile < water.length) water[tile] = 1;
        }
    }

    for (let tile = 0; tile < water.length; tile++) {
        if (!water[tile]) continue;
        const x = tile % width;
        const y = Math.floor(tile / width);
        for (let dy = -WATER_CLEARANCE; dy <= WATER_CLEARANCE; dy++) {
            for (let dx = -WATER_CLEARANCE; dx <= WATER_CLEARANCE; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                blocked[indexOf(nx, ny, width)] = 1;
            }
        }
    }
    return blocked;
}

// A run is always a straight, cardinally adjacent sequence. Turns create
// separate runs, so ramps can never jump diagonally around a cliff corner.
function collectStraightRuns(tiles, width, axis) {
    const sorted = tiles.slice().sort((a, b) => {
        const ax = a % width, ay = Math.floor(a / width);
        const bx = b % width, by = Math.floor(b / width);
        return axis === "h" ? ay - by || ax - bx : ax - bx || ay - by;
    });

    const runs = [];
    let run = [];
    for (const tile of sorted) {
        if (run.length) {
            const prev = run[run.length - 1];
            const sameLine = axis === "h"
                ? Math.floor(prev / width) === Math.floor(tile / width)
                : prev % width === tile % width;
            const adjacent = axis === "h"
                ? tile % width === prev % width + 1
                : Math.floor(tile / width) === Math.floor(prev / width) + 1;
            if (!sameLine || !adjacent) {
                if (run.length >= 2) runs.push(run);
                run = [];
            }
        }
        run.push(tile);
    }
    if (run.length >= 2) runs.push(run);
    return runs;
}

function nearestMountain(tile, width, mountains) {
    if (!mountains?.length) return 0;
    const x = tile % width;
    const y = Math.floor(tile / width);
    let best = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < mountains.length; i++) {
        const mountain = mountains[i];
        const dx = x - mountain.x;
        const dy = y - mountain.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    }
    return best;
}

function rampCenter(tiles, width) {
    const middle = tiles[Math.floor(tiles.length / 2)];
    return { x: middle % width, y: Math.floor(middle / width) };
}

function isTooClose(candidate, placed, width, minDistanceSquared) {
    const center = rampCenter(candidate, width);
    return placed.some(item => {
        if (item.level !== candidate.level) return false;
        const dx = center.x - item.x;
        const dy = center.y - item.y;
        return dx * dx + dy * dy < minDistanceSquared;
    });
}

export function generateRamps({
    width,
    height,
    elevation,
    mountains = [],
    rivers,
    random,
    rampSpacing = 50,
    rampMaxLength = 8,
    rampsPerPeak = 1
}) {
    const size = width * height;
    const cliffTiles = new Uint8Array(size);
    const rampTiles = new Uint8Array(size);
    const waterBuffer = createWaterBuffer(width, height, rivers);
    const cliffRuns = [];
    let totalCliffEdges = 0;

    // A cliff belongs to the higher tile only. We compare cardinal neighbors
    // and record the edge direction; no diagonal neighbor can create a cliff.
    for (const direction of DIRECTIONS) {
        const edgeTiles = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tile = indexOf(x, y, width);
                const level = elevation[tile];
                if (level < 1 || level >= 4) continue;

                const nx = x + direction.dx;
                const ny = y + direction.dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                const lowerLevel = elevation[indexOf(nx, ny, width)];
                if (lowerLevel !== level - 1) continue;

                cliffTiles[tile] |= direction.bit;
                edgeTiles.push(tile);
                totalCliffEdges++;
            }
        }

        for (const run of collectStraightRuns(edgeTiles, width, direction.axis)) {
            const safeTiles = [];
            for (const tile of run) {
                if (waterBuffer[tile]) {
                    if (safeTiles.length >= 2) {
                        cliffRuns.push({ tiles: safeTiles.slice(), bit: direction.bit });
                    }
                    safeTiles.length = 0;
                } else {
                    safeTiles.push(tile);
                }
            }
            if (safeTiles.length >= 2) {
                cliffRuns.push({ tiles: safeTiles, bit: direction.bit });
            }
        }
    }

    // Associate each straight cliff segment with its nearest mountain and
    // elevation transition. Z4->Z3 is intentionally never considered.
    const groups = new Map();
    for (const run of cliffRuns) {
        const level = elevation[run.tiles[0]];
        const mountainIndex = nearestMountain(run.tiles[Math.floor(run.tiles.length / 2)], width, mountains);
        const key = `${mountainIndex}:${level}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ...run, level, mountainIndex });
    }

    const placed = [];
    const rampStatsByPeak = mountains.map((_, index) => ({
        mountain: index,
        z3ToZ2: 0,
        z2ToZ1: 0,
        z1ToZ0: 0
    }));
    const quota = Math.max(1, Math.floor(rampsPerPeak));
    const minDistanceSquared = Math.max(0, rampSpacing) ** 2;

    // Every mountain gets up to the requested number of ramps on each
    // playable transition. Water clearance and spacing are respected.
    for (let mountainIndex = 0; mountainIndex < Math.max(1, mountains.length); mountainIndex++) {
        for (const level of [3, 2, 1]) {
            const key = `${mountainIndex}:${level}`;
            const candidates = shuffle((groups.get(key) || []).slice(), random)
                .sort((a, b) => b.tiles.length - a.tiles.length);
            let created = 0;

            for (const run of candidates) {
                if (created >= quota) break;
                const maxLength = Math.min(rampMaxLength, run.tiles.length);
                if (maxLength < MIN_RAMP_LENGTH) continue;

                // A natural ramp must be long enough to be a usable passage.
                // The slider controls only its maximum length; 4 tiles is the hard minimum.
                const lengths = [];
                for (let length = maxLength; length >= MIN_RAMP_LENGTH; length--) lengths.push(length);
                shuffle(lengths, random);

                let selected = null;
                for (const length of lengths) {
                    const startOptions = [];
                    for (let start = 0; start <= run.tiles.length - length; start++) startOptions.push(start);
                    shuffle(startOptions, random);

                    for (const start of startOptions) {
                        const tiles = run.tiles.slice(start, start + length);
                        const center = rampCenter(tiles, width);
                        if (placed.some(item => {
                            if (item.level !== level) return false;
                            const dx = center.x - item.x, dy = center.y - item.y;
                            return dx * dx + dy * dy < minDistanceSquared;
                        })) continue;
                        selected = tiles;
                        break;
                    }
                    if (selected) break;
                }

                if (!selected) continue;
                for (const tile of selected) {
                    rampTiles[tile] |= run.bit;
                    cliffTiles[tile] &= ~run.bit;
                }
                const center = rampCenter(selected, width);
                placed.push({ ...center, level, mountainIndex, length: selected.length });
                created++;
            }

            const stats = rampStatsByPeak[mountainIndex];
            if (stats) {
                if (level === 3) stats.z3ToZ2 = created;
                if (level === 2) stats.z2ToZ1 = created;
                if (level === 1) stats.z1ToZ0 = created;
            }
        }
    }

    let remainingCliffTiles = 0;
    for (const mask of cliffTiles) if (mask) remainingCliffTiles++;

    return {
        cliffTiles,
        rampTiles,
        stats: {
            totalCliffEdges,
            remainingCliffTiles,
            rampTiles: placed.reduce((sum, item) => sum + item.length, 0),
            rampCount: placed.length,
            rampSpacing,
            minRampLength: MIN_RAMP_LENGTH,
            rampMaxLength,
            rampsPerPeak: quota,
            waterClearance: WATER_CLEARANCE,
            rampStatsByPeak
        }
    };
}
