// Direction bits describe the cliff edge on the HIGHER tile.
const EDGE = {
    NORTH: 1,
    EAST: 2,
    SOUTH: 4,
    WEST: 8
};

const DIRECTIONS = [
    { dx: 0, dy: -1, bit: EDGE.NORTH, tangent: [[-1, 0], [1, 0]] },
    { dx: 1, dy: 0, bit: EDGE.EAST, tangent: [[0, -1], [0, 1]] },
    { dx: 0, dy: 1, bit: EDGE.SOUTH, tangent: [[-1, 0], [1, 0]] },
    { dx: -1, dy: 0, bit: EDGE.WEST, tangent: [[0, -1], [0, 1]] }
];

const indexOf = (x, y, width) => y * width + x;

function randomInt(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

// Finds connected stretches of the same cliff edge. A ramp run is
// 2–8 tiles long along the cliff and remains exactly one tile wide.
function findCliffRuns(edges, width, height) {
    const groups = [];

    for (const edge of edges) {
        const visited = new Set();

        for (const start of edge.tiles) {
            if (visited.has(start)) continue;

            const queue = [start];
            const group = [];
            visited.add(start);

            for (let read = 0; read < queue.length; read++) {
                const tile = queue[read];
                group.push(tile);
                const x = tile % width;
                const y = Math.floor(tile / width);

                for (const [dx, dy] of edge.tangent) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                    const next = indexOf(nx, ny, width);
                    if (edge.tileSet.has(next) && !visited.has(next)) {
                        visited.add(next);
                        queue.push(next);
                    }
                }
            }

            if (group.length >= 2) groups.push({ ...edge, tiles: group });
        }
    }

    return groups;
}

export function generateRamps({ width, height, elevation, random }) {
    const size = width * height;
    // Each byte is a directional bitmask: N=1, E=2, S=4, W=8.
    // The mask is stored on the higher-elevation tile only.
    const cliffTiles = new Uint8Array(size);
    const rampTiles = new Uint8Array(size);
    const edgeGroups = [];

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

                if (!byLowerLevel.has(lowerLevel)) {
                    byLowerLevel.set(lowerLevel, []);
                }
                byLowerLevel.get(lowerLevel).push(tile);
            }
        }

        for (const [lowerLevel, tiles] of byLowerLevel) {
            edgeGroups.push({
                bit: direction.bit,
                lowerLevel,
                tangent: direction.tangent,
                tiles,
                tileSet: new Set(tiles)
            });
        }
    }

    const runs = findCliffRuns(edgeGroups, width, height);

    for (const group of runs) {
        // Pick separated short sections rather than turning an entire
        // continuous cliff into one long ramp.
        const ordered = group.tiles.slice().sort((a, b) => {
            const ax = a % width, ay = Math.floor(a / width);
            const bx = b % width, by = Math.floor(b / width);
            return group.tangent[0][0] !== 0 ? ax - bx : ay - by;
        });

        let cursor = 0;
        while (ordered.length - cursor >= 2) {
            const remaining = ordered.length - cursor;
            const runLength = randomInt(random, 2, Math.min(8, remaining));
            for (let i = cursor; i < cursor + runLength; i++) {
                rampTiles[ordered[i]] |= group.bit;
                cliffTiles[ordered[i]] &= ~group.bit;
            }
            cursor += runLength;

            if (ordered.length - cursor < 2) break;
            cursor += randomInt(random, 4, 10);
        }
    }

    return { cliffTiles, rampTiles };
}
