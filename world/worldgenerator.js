import { generateMountains } from "./mountaingenerator.js";
import { generateRivers } from "./rivergenerator.js";

function createRandom(seed) {
    let state = seed >>> 0;

    return function () {
        state = (state + 0x6D2B79F5) | 0;

        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function generateWorld(config, overrides = {}) {
    const width = config.map.width;
    const height = config.map.height;

    const seed = overrides.seed ?? config.map.seed;
    const random = createRandom(seed);

    const elevation = new Uint8Array(width * height);

    const count =
        overrides.mountainCount ?? config.mountains.count;

    const minimumDistance =
        overrides.minimumDistance ??
        config.mountains.minimumDistance;

    const peakMin =
        overrides.peakMin ?? config.mountains.peakSize.min;

    const peakMax =
        overrides.peakMax ?? config.mountains.peakSize.max;

    const mountains = generateMountains({
        width,
        height,
        count,
        minimumDistance,
        peakMin,
        peakMax,
        bands: config.elevation.bands,
        random,
        elevation
    });

    const rivers = generateRivers({ width, height, elevation, mountains, random });

    return {
        width,
        height,
        elevation,
        mountains,
        rivers,
        seed
    };
}
