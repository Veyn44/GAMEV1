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

// Find a downhill route while penalizing sharp turns. This is a simplified
// hydrology-inspired least-cost path: elevation may stay level or decrease,
// while directional inertia favors longer, smoother river segments.
// Find the nearest reachable Z0 valley with a shortest-path search.
// A river may bend freely once, but after every bend it must travel at
// least four tiles straight before another bend is allowed.
function findRiverPath(startX, startY, width, height, elevation, random) {
    const tileCount = width * height;
    const runLengths = 5; // 0..3 exact, 4 means four or more straight tiles.
    const stateCount = tileCount * 4 * runLengths * 2;
    const distances = new Float64Array(stateCount);
    distances.fill(Infinity);

    const parents = new Int32Array(stateCount);
    parents.fill(-1);

    const encode = (tile, direction, run, hasTurned) =>
        (((tile * 4 + direction) * runLengths + run) * 2 + (hasTurned ? 1 : 0));

    const startTile = indexOf(startX, startY, width);
    const heap = new MinHeap();
    // Let the pathfinder choose its first heading toward the nearest valley.
    // It must still make at least one later turn before reaching Z0.
    for (let direction = 0; direction < 4; direction++) {
        const startState = encode(startTile, direction, 4, false);
        const initialCost = random() * 0.001;
        distances[startState] = initialCost;
        heap.push({ state: startState, cost: initialCost });
    }

    let targetState = -1;

    while (heap.length) {
        const current = heap.pop();
        if (current.cost !== distances[current.state]) continue;

        const hasTurned = (current.state & 1) === 1;
        const packed = Math.floor(current.state / 2);
        const run = packed % runLengths;
        const directionAndTile = Math.floor(packed / runLengths);
        const heading = directionAndTile % 4;
        const tile = Math.floor(directionAndTile / 4);
        const level = elevation[tile];

        // Reaching Z0 is the destination, but a river must have at least
        // one genuine bend before its mouth.
        if (level === 0 && hasTurned) {
            targetState = current.state;
            break;
        }

        const x = tile % width;
        const y = Math.floor(tile / width);

        for (let direction = 0; direction < 4; direction++) {
            const changedDirection = direction !== heading;
            if (changedDirection && run < 4) continue;

            const d = DIRECTIONS[direction];
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const nextTile = indexOf(nx, ny, width);
            const nextLevel = elevation[nextTile];

            // Water never flows uphill or through a Z4 peak.
            if (nextLevel > level || nextLevel === 4) continue;

            const nextRun = changedDirection ? 0 : Math.min(4, run + 1);
            const nextTurned = hasTurned || changedDirection;
            const nextState = encode(nextTile, direction, nextRun, nextTurned);

            // Prefer the shortest route to a lowland valley. A small bend
            // cost breaks ties in favor of fewer, broader curves; tiny
            // seeded noise keeps equally good rivers from looking identical.
            const stepCost = 1 + (changedDirection ? 0.18 : 0) + random() * 0.025;
            const nextCost = current.cost + stepCost;

            if (nextCost >= distances[nextState]) continue;

            distances[nextState] = nextCost;
            parents[nextState] = current.state;
            heap.push({ state: nextState, cost: nextCost });
        }
    }

    if (targetState < 0) return [];

    const reversed = [];
    for (let state = targetState; state !== -1; state = parents[state]) {
        const packed = Math.floor(state / 2);
        const directionAndTile = Math.floor(packed / runLengths);
        reversed.push(Math.floor(directionAndTile / 4));
    }
    reversed.reverse();
    return reversed;
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
