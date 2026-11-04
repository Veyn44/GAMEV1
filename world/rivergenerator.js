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
            if (!next) break;

            if (next.level < level) {
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
