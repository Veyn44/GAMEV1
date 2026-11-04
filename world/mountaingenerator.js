function randomInt(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

// Smooths random values around a circular contour.
// This prevents sharp, noisy changes between neighboring points.
function smoothCircular(values) {
    const result = [];

    for (let i = 0; i < values.length; i++) {
        const previous = values[(i - 1 + values.length) % values.length];
        const current = values[i];
        const next = values[(i + 1) % values.length];

        result.push(
            previous * 0.25 +
            current * 0.5 +
            next * 0.25
        );
    }

    return result;
}

// Creates an irregular elliptical peak.
// Randomness changes the boundary, never the interior.
function createPeakRadii(width, height, random, pointCount) {
    const radiusX = width / 2;
    const radiusY = height / 2;

    const variations = [];

    // Large-scale irregularity:
    // creates broad protrusions and indentations.
    for (let i = 0; i < pointCount; i++) {
        variations.push(0.65 + random() * 0.70);
    }

    const smoothVariations = smoothCircular(variations);
    const radii = [];

    for (let i = 0; i < pointCount; i++) {
        const angle = (i / pointCount) * Math.PI * 2;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const ellipseRadius = 1 / Math.sqrt(
            (cos * cos) / (radiusX * radiusX) +
            (sin * sin) / (radiusY * radiusY)
        );

        // Small-scale irregularity:
        // adds sharper local changes to the contour.
        const fineDetail = 0.90 + random() * 0.20;

        radii.push(
            ellipseRadius *
            smoothVariations[i] *
            fineDetail
        );
    }

    return radii;
}

// Expands the existing contour by a random distance.
// Each contour point gets its own expansion value.
function expandRadii(radii, minDistance, maxDistance, random) {
    const increments = [];

    for (let i = 0; i < radii.length; i++) {
        increments.push(
            randomInt(random, minDistance, maxDistance)
        );
    }

    const smoothIncrements = smoothCircular(increments);

    return radii.map((radius, index) => {
        return radius + smoothIncrements[index];
    });
}

// Converts radial distances into polygon coordinates.
function createPolygon(centerX, centerY, radii) {
    const polygon = [];

    for (let i = 0; i < radii.length; i++) {
        const angle = (i / radii.length) * Math.PI * 2;

        polygon.push({
            x: centerX + Math.cos(angle) * radii[i],
            y: centerY + Math.sin(angle) * radii[i]
        });
    }

    return polygon;
}

// Checks whether a point is inside a closed polygon.
function pointInsidePolygon(x, y, polygon) {
    let inside = false;

    for (
        let i = 0, j = polygon.length - 1;
        i < polygon.length;
        j = i++
    ) {
        const a = polygon[i];
        const b = polygon[j];

        const intersects =
            ((a.y > y) !== (b.y > y)) &&
            (x < (b.x - a.x) * (y - a.y) /
                (b.y - a.y) + a.x);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

// Fills every tile inside the polygon.
// Higher elevation always wins if mountains overlap.
function fillPolygon(elevation, width, height, polygon, level) {
    const size = width * height;

    const minX = Math.max(
        0,
        Math.floor(Math.min(...polygon.map(p => p.x)))
    );

    const maxX = Math.min(
        width - 1,
        Math.ceil(Math.max(...polygon.map(p => p.x)))
    );

    const minY = Math.max(
        0,
        Math.floor(Math.min(...polygon.map(p => p.y)))
    );

    const maxY = Math.min(
        height - 1,
        Math.ceil(Math.max(...polygon.map(p => p.y)))
    );

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (!pointInsidePolygon(x + 0.5, y + 0.5, polygon)) {
                continue;
            }

            const index = y * width + x;

            if (index < 0 || index >= size) continue;

            elevation[index] = Math.max(
                elevation[index],
                level
            );
        }
    }
}

// Generates one complete mountain massif.
function generateMountain(
    elevation,
    width,
    height,
    mountain,
    bands,
    random
) {
    const pointCount = 64;

    // Z4: create and fill the central peak.
    let radii = createPeakRadii(
        mountain.peakWidth,
        mountain.peakHeight,
        random,
        pointCount
    );

    let polygon = createPolygon(
        mountain.x,
        mountain.y,
        radii
    );

    fillPolygon(elevation, width, height, polygon, 4);

    // Expand the complete contour layer by layer.
    const layers = [
        { level: 3, range: bands.z3 },
        { level: 2, range: bands.z2 },
        { level: 1, range: bands.z1 }
    ];

    for (const layer of layers) {
        radii = expandRadii(
            radii,
            layer.range.min,
            layer.range.max,
            random
        );

        polygon = createPolygon(
            mountain.x,
            mountain.y,
            radii
        );

        fillPolygon(
            elevation,
            width,
            height,
            polygon,
            layer.level
        );
    }
}

// Main mountain generator.
export function generateMountains({
    width,
    height,
    count,
    minimumDistance,
    peakMin,
    peakMax,
    bands,
    random,
    elevation
}) {
    const mountains = [];

    // The peak can be twice as tall as it is wide.
    // Reserve enough space for that maximum dimension and all outer bands.
    const maximumExpansion =
        bands.z3.max +
        bands.z2.max +
        bands.z1.max;

    const margin = Math.ceil(
        peakMax + maximumExpansion + 2
    );

    let attempts = 0;
    const maxAttempts = count * 500;

    // 1. Place mountain centers.
    while (
        mountains.length < count &&
        attempts < maxAttempts
    ) {
        attempts++;

        let peakWidth = randomInt(random, peakMin, peakMax);
        let peakHeight = randomInt(random, peakMin * 2, peakMax * 2);

        // Randomly rotate the mountain's orientation.
        if (random() < 0.5) {
            [peakWidth, peakHeight] = [peakHeight, peakWidth];
        }

        const x = randomInt(
            random,
            margin,
            width - margin - 1
        );

        const y = randomInt(
            random,
            margin,
            height - margin - 1
        );

        // Minimum distance applies to peak centers.
        const tooClose = mountains.some(mountain => {
            return Math.hypot(
                mountain.x - x,
                mountain.y - y
            ) < minimumDistance;
        });

        if (tooClose) continue;

        mountains.push({
            x,
            y,
            peakWidth,
            peakHeight
        });
    }

    // 2. Generate complete mountain massifs.
    for (const mountain of mountains) {
        generateMountain(
            elevation,
            width,
            height,
            mountain,
            bands,
            random
        );
    }

    return mountains;
}
