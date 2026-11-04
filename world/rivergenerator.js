const DIRECTIONS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
];

const indexOf = (x, y, width) => y * width + x;

function getStart(elevation, width, height, mountain, random) {
    const candidates = [];

    for (
        let y = Math.max(1, Math.floor(mountain.y - mountain.peakHeight / 2 - 2));
        y <= Math.min(height - 2, Math.ceil(mountain.y + mountain.peakHeight / 2 + 2));
        y++
    ) {
        for (
            let x = Math.max(1, Math.floor(mountain.x - mountain.peakWidth / 2 - 2));
            x <= Math.min(width - 2, Math.ceil(mountain.x + mountain.peakWidth / 2 + 2));
            x++
        ) {
            const i = indexOf(x, y, width);
            if (elevation[i] !== 3) continue;

            const touchesPeak = DIRECTIONS.some(d =>
                elevation[indexOf(x + d.x, y + d.y, width)] === 4
            );

            if (touchesPeak) candidates.push({ x, y });
        }
    }

    if (!candidates.length) return null;
    return candidates[Math.floor(random() * candidates.length)];
}

// Small binary min-heap used by the direction-aware Dijkstra search.
class MinHeap {
    constructor() {
        this.items = [];
    }

    push(item) {
        const items = this.items;
        items.push(item);
        let index = items.length - 1;

        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (items[parent].cost <= item.cost) break;
            items[index] = items[parent];
            index = parent;
        }

        items[index] = item;
    }

    pop() {
        const items = this.items;
        if (!items.length) return null;

        const first = items[0];
        const last = items.pop();
        if (items.length) {
            let index = 0;

            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                if (left >= items.length) break;

                let child = left;
                if (right < items.length && items[right].cost < items[left].cost) {
                    child = right;
                }

                if (items[child].cost >= last.cost) break;
                items[index] = items[child];
                index = child;
            }

            items[index] = last;
        }

        return first;
    }

    get length() {
        return this.items.length;
    }
}

// Find the nearest reachable tile of the next lower elevation.
// Within each elevation band the river holds a heading for seven tiles,
// then must turn left or right. Reversing direction is never permitted.
// Breadth-first search finds the nearest lower-elevation landing.
// The heading is held for exactly seven tiles, then a left/right turn
// is mandatory. Reverse movement is never allowed.
function findElevationSegment(startTile, level, targetLevel, incomingDirection, width, height, elevation, random) {
    const runLengths = 8;
    // Sparse state storage avoids allocating several large full-map arrays
    // for every mountain and every elevation band.
    const parents = new Map();
    const queue = [];
    let read = 0;

    const encode = (tile, direction, run) =>
        (tile * 4 + direction) * runLengths + run;

    const initialDirections = [0, 1, 2, 3];
    // Seeded shuffle makes equally near routes vary between worlds.
    for (let i = initialDirections.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [initialDirections[i], initialDirections[j]] =
            [initialDirections[j], initialDirections[i]];
    }

    for (const direction of initialDirections) {
        if (incomingDirection !== null &&
            direction === (incomingDirection + 2) % 4) continue;
        const state = encode(startTile, direction, 0);
        if (parents.has(state)) continue;
        parents.set(state, -1);
        queue.push(state);
    }

    let targetState = -1;

    while (read < queue.length) {
        const state = queue[read++];
        const run = state % runLengths;
        const packed = Math.floor(state / runLengths);
        const direction = packed % 4;
        const tile = Math.floor(packed / 4);

        const x = tile % width;
        const y = Math.floor(tile / width);
        const nextDirections = run === 7
            ? [(direction + 1) % 4, (direction + 3) % 4]
            : [direction];

        for (const nextDirection of nextDirections) {
            // The opposite direction is excluded even after a forced turn.
            if (nextDirection === (direction + 2) % 4) continue;

            const d = DIRECTIONS[nextDirection];
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const nextTile = indexOf(nx, ny, width);
            const nextLevel = elevation[nextTile];

            if (nextLevel > level || nextLevel === 4) continue;
            if (nextLevel < level && nextLevel !== targetLevel) continue;

            const nextRun = nextDirection === direction ? Math.min(7, run + 1) : 1;
            const nextState = encode(nextTile, nextDirection, nextRun);
            if (parents.has(nextState)) continue;

            parents.set(nextState, state);
            if (nextLevel === targetLevel) {
                targetState = nextState;
                read = queue.length;
                break;
            }

            queue.push(nextState);
        }
    }

    if (targetState < 0) return null;

    const reversed = [];
    for (let state = targetState; state !== -1; state = parents.get(state)) {
        reversed.push(Math.floor(state / runLengths / 4));
    }
    reversed.reverse();

    return {
        path: reversed,
        direction: Math.floor(targetState / runLengths) % 4
    };
}

// Route a river one elevation band at a time: Z3→Z2→Z1→Z0.
// Each new band resets the seven-tile counter but keeps the incoming
// heading so the river cannot immediately turn back toward its source.
function findRiverPath(startX, startY, width, height, elevation, random) {
    const startTile = indexOf(startX, startY, width);
    let currentTile = startTile;
    let currentLevel = elevation[currentTile];
    let incomingDirection = null;
    const path = [startTile];
    const visited = new Set(path);

    while (currentLevel > 0) {
        const targetLevel = currentLevel - 1;
        const segment = findElevationSegment(
            currentTile, currentLevel, targetLevel, incomingDirection,
            width, height, elevation, random
        );

        if (!segment || !segment.path.length) return [];

        for (const tile of segment.path) {
            if (visited.has(tile)) return [];
            visited.add(tile);
            path.push(tile);
        }

        currentTile = segment.path[segment.path.length - 1];
        incomingDirection = segment.direction;
        currentLevel = elevation[currentTile];
    }

    return path;
}

// A lake is a half-ellipse whose straight edge sits against the higher
// elevation cliff and whose rounded body spreads into the lower terrain.
function makeCliffLake(x, y, lowerLevel, direction, width, height, elevation, lakes, terminal = false) {
    const d = DIRECTIONS[direction];
    // Give the shoreline enough room to meet nearby cliffs instead of
    // ending as a small, isolated half-ellipse. Higher terrain clips the
    // shape naturally, producing a cove pressed against the cliff.
    const across = terminal ? 30 : lowerLevel === 2 ? 10 : 7;
    const depth = terminal ? 14 : lowerLevel === 2 ? 6 : 5;
    const halfAcross = across / 2;
    const halfDepth = depth / 2;

    const searchRadius = across + depth + 2;
    const minX = Math.max(0, x - searchRadius);
    const maxX = Math.min(width - 1, x + searchRadius);
    const minY = Math.max(0, y - searchRadius);
    const maxY = Math.min(height - 1, y + searchRadius);
    const tiles = [];

    for (let ly = minY; ly <= maxY; ly++) {
        for (let lx = minX; lx <= maxX; lx++) {
            const dx = lx - x;
            const dy = ly - y;
            const along = dx * d.x + dy * d.y;
            const sideways = Math.abs(dx * d.y - dy * d.x);

            // The broad, flat side is at the cliff. The lake bulges outward
            // in the direction of the falling water.
            const normalizedAlong = along / depth;
            const normalizedSideways = sideways / halfAcross;
            // Multi-scale deterministic shoreline noise: retain the same
            // lake footprint, but break up the perfectly clean pixel edge.
            const shoreline = 1
                + 0.10 * Math.sin(lx * 1.71 + ly * 0.93)
                + 0.045 * Math.sin(lx * 3.17 - ly * 2.41)
                + 0.025 * Math.cos(lx * 5.13 + ly * 4.37);

            if (along < 0 || normalizedAlong * normalizedAlong +
                normalizedSideways * normalizedSideways > shoreline) continue;

            const tile = indexOf(lx, ly, width);
            if (elevation[tile] > lowerLevel) continue;
            tiles.push(tile);
        }
    }

    if (!tiles.length) return null;

    let lakeMinX = width, lakeMinY = height, lakeMaxX = 0, lakeMaxY = 0;
    for (const tile of tiles) {
        const tx = tile % width;
        const ty = Math.floor(tile / width);
        lakeMinX = Math.min(lakeMinX, tx);
        lakeMinY = Math.min(lakeMinY, ty);
        lakeMaxX = Math.max(lakeMaxX, tx);
        lakeMaxY = Math.max(lakeMaxY, ty);
    }

    const lake = {
        x: lakeMinX,
        y: lakeMinY,
        width: lakeMaxX - lakeMinX + 1,
        height: lakeMaxY - lakeMinY + 1,
        level: lowerLevel,
        type: terminal ? "terminal" : "cliff",
        tiles
    };

    lakes.push(lake);
    return lake;
}

export function generateRivers({ width, height, elevation, mountains, random }) {
    const riverTiles = new Uint8Array(width * height);
    const waterfalls = [];
    const lakes = [];
    const rivers = [];

    for (const mountain of mountains) {
        const start = getStart(elevation, width, height, mountain, random);
        if (!start) continue;

        const path = findRiverPath(
            start.x, start.y, width, height, elevation, random
        );

        if (!path.length) continue;

        let strength = 1;
        let previousLevel = elevation[path[0]];
        const firstNext = path[1];
        let previousDirection = firstNext === undefined ? 0 : DIRECTIONS.findIndex(d =>
            start.x + d.x === firstNext % width &&
            start.y + d.y === Math.floor(firstNext / width)
        );
        if (previousDirection < 0) previousDirection = 0;

        for (let i = 0; i < path.length; i++) {
            const tile = path[i];
            const x = tile % width;
            const y = Math.floor(tile / width);
            const level = elevation[tile];

            if (i > 0) {
                const previous = path[i - 1];
                const px = previous % width;
                const py = Math.floor(previous / width);
                const direction = DIRECTIONS.findIndex(d =>
                    px + d.x === x && py + d.y === y
                );

                if (direction >= 0) previousDirection = direction;

                if (level < previousLevel) {
                    strength = Math.min(4, strength + 1);
                    const terminal = level === 0;
                    const lake = makeCliffLake(
                        x, y, level, previousDirection,
                        width, height, elevation, lakes, terminal
                    );

                    waterfalls.push({
                        x, y,
                        from: previousLevel,
                        to: level,
                        direction: previousDirection,
                        lake
                    });

                    // The terminal lake is the river mouth. No need to
                    // continue a narrow channel across the lowland.
                    if (terminal) {
                        riverTiles[tile] = Math.max(riverTiles[tile], strength);
                        break;
                    }
                }
            }

            riverTiles[tile] = Math.max(riverTiles[tile], strength);
            previousLevel = level;
        }

        rivers.push({ path, source: start, strength: 1 });
    }

    return { riverTiles, rivers, waterfalls, lakes };
}
