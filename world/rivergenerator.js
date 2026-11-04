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

function nearestEdgeDirection(x, y, width, height) {
    const distances = [y, width - 1 - x, height - 1 - y, x];
    return distances.indexOf(Math.min(...distances));
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
function findRiverPath(startX, startY, initialDirection, width, height, elevation, random) {
    const tileCount = width * height;
    const stateCount = tileCount * 4;
    const distances = new Float64Array(stateCount);
    distances.fill(Infinity);

    const parents = new Int32Array(stateCount);
    parents.fill(-1);

    const startTile = indexOf(startX, startY, width);
    const startState = startTile * 4 + initialDirection;
    distances[startState] = 0;

    const heap = new MinHeap();
    heap.push({ state: startState, cost: 0 });

    let targetState = -1;
    const turnPenalty = 2.4;

    while (heap.length) {
        const current = heap.pop();
        if (current.cost !== distances[current.state]) continue;

        const tile = Math.floor(current.state / 4);
        const heading = current.state % 4;
        const level = elevation[tile];

        if (level === 0) {
            targetState = current.state;
            break;
        }

        const x = tile % width;
        const y = Math.floor(tile / width);

        for (let direction = 0; direction < 4; direction++) {
            const d = DIRECTIONS[direction];
            const nx = x + d.x;
            const ny = y + d.y;

            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const nextTile = indexOf(nx, ny, width);
            const nextLevel = elevation[nextTile];

            // Water never flows uphill or through the Z4 peak.
            if (nextLevel > level || nextLevel === 4) continue;

            const nextState = nextTile * 4 + direction;
            const turnDistance = Math.min(
                (direction - heading + 4) % 4,
                (heading - direction + 4) % 4
            );

            // A half-turn is strongly discouraged; a 90-degree bend is
            // allowed, but costs more than continuing in the same direction.
            const bendCost = turnDistance === 0 ? 0 : turnDistance === 1
                ? turnPenalty
                : turnPenalty * 2.5;
            const downhillBonus = nextLevel < level ? 0.12 : 0;
            const stepCost = 1 + bendCost - downhillBonus + random() * 0.08;
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
        reversed.push(Math.floor(state / 4));
    }
    reversed.reverse();
    return reversed;
}

// A lake is a half-ellipse whose straight edge sits against the higher
// elevation cliff and whose rounded body spreads into the lower terrain.
function makeCliffLake(x, y, lowerLevel, direction, width, height, elevation, lakes, terminal = false) {
    const d = DIRECTIONS[direction];
    const across = terminal ? 20 : lowerLevel === 2 ? 6 : 3;
    const depth = terminal ? 10 : lowerLevel === 2 ? 3 : 3;
    const halfAcross = across / 2;
    const halfDepth = depth / 2;

    const minX = Math.max(0, x - across - depth);
    const maxX = Math.min(width - 1, x + across + depth);
    const minY = Math.max(0, y - across - depth);
    const maxY = Math.min(height - 1, y + across + depth);
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
            const shoreline = 1 + 0.045 * Math.sin(lx * 1.71 + ly * 0.93);

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

        const initialDirection = nearestEdgeDirection(start.x, start.y, width, height);
        const path = findRiverPath(
            start.x, start.y, initialDirection,
            width, height, elevation, random
        );

        if (!path.length) continue;

        let strength = 1;
        let previousLevel = elevation[path[0]];
        let previousDirection = initialDirection;

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
