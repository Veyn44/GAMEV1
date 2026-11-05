// Cliff edges are stored as directional bits on the higher tile.
// N=1, E=2, S=4, W=8. Z4 is intentionally excluded: mountain peaks
// are impassable and can never receive ramps.
const EDGE = { NORTH: 1, EAST: 2, SOUTH: 4, WEST: 8 };
const WATER_CLEARANCE = 4;

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

    if (rivers?.riverTiles) {
        for (let i = 0; i < rivers.riverTiles.length; i++) {
            if (rivers.riverTiles[i]) water[i] = 1;
        }
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

// Build straight, orthogonally contiguous cliff runs. A corner starts a
// new run rather than introducing a diagonal connection between tiles.
function collectStraightRuns(tiles, width, axis) {
    const sorted = tiles.slice().sort((a, b) => {
        const ax = a % width, ay = Math.floor(a / width);
        const bx = b % width, by = Math.floor(b / width);
        if (axis === "h") return ay - by || ax - bx;
        return ax - bx || ay - by;
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

function tooClose(candidate, placed, width, minDistanceSquared) {
    for (const tile of candidate) {
        const x = tile % width, y = Math.floor(tile / width);
        for (const other of placed) {
            const ox = other % width, oy = Math.floor(other / width);
            const dx = x - ox, dy = y - oy;
            if (dx * dx + dy * dy < minDistanceSquared) return true;
        }
    }
    return false;
}

export function generateRamps({
    width,
    height,
    elevation,
    rivers,
    random,
    rampSpacing = 50,
    rampMaxLength = 8
}) {
    const size = width * height;
    const cliffTiles = new Uint8Array(size);
    const rampTiles = new Uint8Array(size);
    const waterBuffer = createWaterBuffer(width, height, rivers);
    const cliffRuns = [];
    let totalCliffTiles = 0;

    // Detect cliff edges only across cardinal neighbors and only where
    // the elevation difference is exactly one. Z4 is never a ramp/cliff tile.
    for (const direction of DIRECTIONS) {
        const edgeTiles = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tile = indexOf(x, y, width);
                const level = elevation[tile];
                if (level < 1 || level >= 4) continue;

                const nx = x + direction.dx, ny = y + direction.dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const neighborLevel = elevation[indexOf(nx, ny, width)];
                if (neighborLevel !== level - 1) continue;

                cliffTiles[tile] |= direction.bit;
                edgeTiles.push(tile);
                totalCliffTiles++;
            }
        }

        cliffRuns.push(...collectStraightRuns(edgeTiles, width, direction.axis));
    }

    // Ramp candidates must consist entirely of cliff tiles and stay outside
    // the four-tile river/lake buffer.
    const candidates = [];
    for (const run of cliffRuns) {
        const safeRun = [];
        for (const tile of run) {
            if (waterBuffer[tile]) {
                if (safeRun.length >= 2) candidates.push(safeRun.slice());
                safeRun.length = 0;
            } else {
                safeRun.push(tile);
            }
        }
        if (safeRun.length >= 2) candidates.push(safeRun);
    }

    shuffle(candidates, random);
    const placedRampTiles = [];
    const minDistanceSquared = rampSpacing * rampSpacing;
    let rampCount = 0;

    for (const run of candidates) {
        const maxLength = Math.min(rampMaxLength, run.length);
        if (maxLength < 2) continue;

        // Try a handful of random positions/lengths in this run. If all
        // conflict with an existing ramp's spacing, leave this cliff intact.
        for (let attempt = 0; attempt < 8; attempt++) {
            const length = randomInt(random, 2, maxLength);
            const start = randomInt(random, 0, run.length - length);
            const candidate = run.slice(start, start + length);
            if (tooClose(candidate, placedRampTiles, width, minDistanceSquared)) continue;

            // The run is straight, so all its tiles share one cliff direction.
            const first = candidate[0];
            const bit = cliffTiles[first] & (EDGE.NORTH | EDGE.EAST | EDGE.SOUTH | EDGE.WEST);
            // Determine the shared direction from adjacent terrain elevation.
            const x = first % width, y = Math.floor(first / width);
            let directionBit = 0;
            for (const direction of DIRECTIONS) {
                if (!(bit & direction.bit)) continue;
                const nx = x + direction.dx, ny = y + direction.dy;
                if (nx >= 0 && ny >= 0 && nx < width && ny < height &&
                    elevation[indexOf(nx, ny, width)] === elevation[first] - 1) {
                    directionBit = direction.bit;
                    break;
                }
            }
            if (!directionBit) continue;

            for (const tile of candidate) {
                rampTiles[tile] |= directionBit;
                cliffTiles[tile] &= ~directionBit;
                placedRampTiles.push(tile);
                rampCount++;
            }
            break;
        }
    }

    let remainingCliffTiles = 0;
    for (const mask of cliffTiles) if (mask) remainingCliffTiles++;

    return {
        cliffTiles,
        rampTiles,
        stats: {
            totalCliffTiles,
            remainingCliffTiles,
            rampTiles: rampCount,
            rampSpacing,
            rampMaxLength,
            waterClearance: WATER_CLEARANCE
        }
    };
}
