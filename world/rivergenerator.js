const DIRECTIONS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
];

const indexOf = (x, y, width) => y * width + x;

function chooseTurn(random) {
    const roll = random();
    return roll < 0.6 ? 0 : roll < 0.8 ? -1 : 1;
}

function getStart(elevation, width, height, mountain, random) {
    const candidates = [];
    for (let y = Math.max(1, Math.floor(mountain.y - mountain.peakHeight / 2 - 2));
         y <= Math.min(height - 2, Math.ceil(mountain.y + mountain.peakHeight / 2 + 2)); y++) {
        for (let x = Math.max(1, Math.floor(mountain.x - mountain.peakWidth / 2 - 2));
             x <= Math.min(width - 2, Math.ceil(mountain.x + mountain.peakWidth / 2 + 2)); x++) {
            const i = indexOf(x, y, width);
            if (elevation[i] !== 3) continue;
            let touchesPeak = false;
            for (const d of DIRECTIONS) {
                if (elevation[indexOf(x + d.x, y + d.y, width)] === 4) touchesPeak = true;
            }
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


function findPathToZ0(startX, startY, width, height, elevation) {
    const start = indexOf(startX, startY, width);
    const parent = new Int32Array(width * height);
    parent.fill(-2);
    parent[start] = -1;

    const queue = [start];
    let target = -1;

    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        if (elevation[current] === 0) {
            target = current;
            break;
        }

        const x = current % width;
        const y = Math.floor(current / width);

        for (const d of DIRECTIONS) {
            const nx = x + d.x;
            const ny = y + d.y;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const next = indexOf(nx, ny, width);
            if (parent[next] !== -2 || elevation[next] > 1 || elevation[next] === 4) continue;

            parent[next] = current;
            queue.push(next);
        }
    }

    if (target < 0) return [];

    const path = [];
    for (let current = target; current !== start; current = parent[current]) {
        path.push(current);
    }
    path.reverse();
    return path;
}

function makeTerminalLake(x, y, direction, width, height, lakes) {
    const d = DIRECTIONS[direction];
    const horizontal = direction === 1 || direction === 3;
    const lakeWidth = horizontal ? 20 : 10;
    const lakeHeight = horizontal ? 10 : 20;

    // Place the upstream edge close to the waterfall so the river visibly
    // enters the lake instead of ending in the middle of it.
    const centerX = x + d.x * 9;
    const centerY = y + d.y * 9;
    const startX = Math.max(0, Math.min(width - lakeWidth, Math.round(centerX - lakeWidth / 2)));
    const startY = Math.max(0, Math.min(height - lakeHeight, Math.round(centerY - lakeHeight / 2)));
    const tiles = [];

    for (let ly = startY; ly < startY + lakeHeight; ly++) {
        for (let lx = startX; lx < startX + lakeWidth; lx++) {
            const nx = (lx - (startX + (lakeWidth - 1) / 2)) / (lakeWidth / 2);
            const ny = (ly - (startY + (lakeHeight - 1) / 2)) / (lakeHeight / 2);
            // Rounded, slightly irregular shoreline rather than a hard rectangle.
            const edge = 1 + 0.06 * Math.sin(lx * 1.7 + ly * 0.9);
            if (nx * nx + ny * ny <= edge) tiles.push(indexOf(lx, ly, width));
        }
    }

    const lake = {
        x: startX,
        y: startY,
        width: lakeWidth,
        height: lakeHeight,
        level: 0,
        type: "terminal",
        tiles
    };
    lakes.push(lake);
    return lake;
}

function makeLake(x, y, level, direction, width, height, lakes) {
    const size = level === 3 ? 3 : level === 2 ? 6 : 9;
    const horizontal = direction === 1 || direction === 3;
    const lakeWidth = horizontal ? size : 3;
    const lakeHeight = horizontal ? 3 : size;
    const tiles = [];
    const startX = Math.max(0, Math.min(width - lakeWidth, x - Math.floor(lakeWidth / 2)));
    const startY = Math.max(0, Math.min(height - lakeHeight, y - Math.floor(lakeHeight / 2)));
    for (let ly = startY; ly < startY + lakeHeight; ly++) {
        for (let lx = startX; lx < startX + lakeWidth; lx++) {
            tiles.push(indexOf(lx, ly, width));
        }
    }
    const lake = { x: startX, y: startY, width: lakeWidth, height: lakeHeight, level, tiles };
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

        let x = start.x;
        let y = start.y;
        let direction = nearestEdgeDirection(x, y, width, height);
        let level = 3;
        let strength = 1;
        const path = [];
        const visited = new Set();
        const maxSteps = width * height;

        for (let step = 0; step < maxSteps; step++) {
            const index = indexOf(x, y, width);
            if (visited.has(index)) break;
            visited.add(index);
            path.push(index);
            riverTiles[index] = Math.max(riverTiles[index], strength);

            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
                if (level === 0) break;
            }

            const turn = chooseTurn(random);
            direction = (direction + turn + 4) % 4;
            const candidates = [direction, (direction + 3) % 4, (direction + 1) % 4];
            let next = null;

            for (const candidate of candidates) {
                const d = DIRECTIONS[candidate];
                const nx = x + d.x;
                const ny = y + d.y;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const nextLevel = elevation[indexOf(nx, ny, width)];
                if (nextLevel > level || nextLevel === 4) continue;
                if (visited.has(indexOf(nx, ny, width))) continue;
                next = { x: nx, y: ny, level: nextLevel, direction: candidate };
                break;
            }

            if (!next) {
                // Try any legal downhill/level neighbor before terminating.
                for (let candidate = 0; candidate < 4; candidate++) {
                    const d = DIRECTIONS[candidate];
                    const nx = x + d.x, ny = y + d.y;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const ni = indexOf(nx, ny, width);
                    if (!visited.has(ni) && elevation[ni] <= level && elevation[ni] !== 4) {
                        next = { x: nx, y: ny, level: elevation[ni], direction: candidate };
                        break;
                    }
                }
            }
            if (!next) {
                // A random walk can exhaust its unvisited Z1 neighbors before
                // reaching the lowlands. Use a shortest legal downhill route
                // as a deterministic fallback so the river can reach Z0.
                if (level === 1) {
                    const escapePath = findPathToZ0(x, y, width, height, elevation);
                    for (const tile of escapePath) {
                        const px = tile % width;
                        const py = Math.floor(tile / width);
                        const fromLevel = level;
                        const toLevel = elevation[tile];
                        const previous = path.length ? path[path.length - 1] : index;
                        const previousX = previous % width;
                        const previousY = Math.floor(previous / width);
                        const directionToTile = DIRECTIONS.findIndex(d =>
                            previousX + d.x === px && previousY + d.y === py
                        );

                        path.push(tile);
                        riverTiles[tile] = Math.max(riverTiles[tile], strength);

                        if (toLevel < fromLevel) {
                            const lake = makeTerminalLake(px, py, directionToTile < 0 ? direction : directionToTile, width, height, lakes);
                            waterfalls.push({
                                x: px, y: py, from: fromLevel, to: toLevel,
                                direction: directionToTile < 0 ? direction : directionToTile,
                                lake
                            });
                            level = 0;
                            break;
                        }
                    }
                }
                break;
            }

            if (next.level < level) {
                if (next.level === 0) {
                    const lake = makeTerminalLake(next.x, next.y, next.direction, width, height, lakes);
                    waterfalls.push({
                        x: next.x, y: next.y, from: level, to: 0,
                        direction: next.direction, lake
                    });
                    path.push(indexOf(next.x, next.y, width));
                    riverTiles[indexOf(next.x, next.y, width)] = Math.max(
                        riverTiles[indexOf(next.x, next.y, width)], strength
                    );
                    level = 0;
                    break;
                }

                const lake = makeLake(next.x, next.y, level, next.direction, width, height, lakes);
                waterfalls.push({
                    x: next.x, y: next.y, from: level, to: next.level,
                    direction: next.direction, lake
                });
                level = next.level;
                strength = Math.min(4, strength + 1);
                // The lake is a separate visual feature; continue below its outlet.
                const d = DIRECTIONS[next.direction];
                x = next.x + d.x;
                y = next.y + d.y;
            } else {
                x = next.x;
                y = next.y;
            }
            if (x < 0 || y < 0 || x >= width || y >= height) break;
            level = Math.min(level, elevation[indexOf(x, y, width)]);
            strength = Math.max(strength, 4 - level);
        }

        rivers.push({ path, source: start, strength: 1 });
    }

    return { riverTiles, rivers, waterfalls, lakes };
}
