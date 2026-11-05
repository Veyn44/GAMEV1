
const elevationColors = [
    "#78945d", // Z0 - lowland
    "#b4a36c", // Z1 - foothills
    "#858b91", // Z2 - mountain slopes
    "#e4e8e8", // Z3 - playable upper terrain
    "#ffffff"  // Z4 - peak
];

const DESERT_COLOR = [211, 181, 112];

export function renderMap(world, container) {
    container.innerHTML = "";

    const canvas = document.createElement("canvas");

    canvas.width = world.width;
    canvas.height = world.height;

    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.imageRendering = "pixelated";

    const context = canvas.getContext("2d");
    const image = context.createImageData(world.width, world.height);

    const rgbColors = elevationColors.map(color => {
        const value = parseInt(color.slice(1), 16);

        return [
            (value >> 16) & 255,
            (value >> 8) & 255,
            value & 255
        ];
    });

    for (let i = 0; i < world.elevation.length; i++) {
        const level = world.elevation[i];
        const color = rgbColors[level];

        const pixel = i * 4;

        image.data[pixel] = color[0];
        image.data[pixel + 1] = color[1];
        image.data[pixel + 2] = color[2];
        image.data[pixel + 3] = 255;
    }

    // Desert is a biome overlay, not an elevation. It is applied before
    // water so rivers and lakes remain visibly water even at the map edge.
    if (world.desertTiles) {
        for (let i = 0; i < world.desertTiles.length; i++) {
            if (!world.desertTiles[i]) continue;
            const p = i * 4;
            image.data[p] = DESERT_COLOR[0];
            image.data[p + 1] = DESERT_COLOR[1];
            image.data[p + 2] = DESERT_COLOR[2];
        }
    }

    if (world.rivers && world.rivers.riverTiles) {
        for (let i = 0; i < world.rivers.riverTiles.length; i++) {
            if (!world.rivers.riverTiles[i]) continue;
            const p = i * 4;
            image.data[p] = 35;
            image.data[p + 1] = 105;
            image.data[p + 2] = 165;
        }
        for (const lake of world.rivers.lakes || []) {
            for (const tile of lake.tiles) {
                const p = tile * 4;
                image.data[p] = 45;
                image.data[p + 1] = 125;
                image.data[p + 2] = 185;
            }
        }
    }

    // Diagnostic overlay: orange cliff tiles, purple ramp tiles.
    if (world.cliffTiles) {
        for (let i = 0; i < world.cliffTiles.length; i++) {
            if (!world.cliffTiles[i]) continue;
            const p = i * 4;
            image.data[p] = 255;
            image.data[p + 1] = 112;
            image.data[p + 2] = 0;
        }
    }

    if (world.rampTiles) {
        for (let i = 0; i < world.rampTiles.length; i++) {
            if (!world.rampTiles[i]) continue;
            const p = i * 4;
            image.data[p] = 132;
            image.data[p + 1] = 65;
            image.data[p + 2] = 185;
        }
    }

    context.putImageData(image, 0, 0);

    container.appendChild(canvas);

    return canvas;
}
