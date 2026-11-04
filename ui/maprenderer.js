
const elevationColors = [
    "#78945d", // Z0 - lowland
    "#b4a36c", // Z1 - foothills
    "#858b91", // Z2 - mountain slopes
    "#e4e8e8", // Z3 - playable upper terrain
    "#ffffff"  // Z4 - peak
];

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

    context.putImageData(image, 0, 0);

    container.appendChild(canvas);

    return canvas;
}
