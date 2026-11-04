const COLORS = [
    "#78945d", // Z0 - lowland
    "#b4a36c", // Z1 - foothills
    "#858b91", // Z2 - mountain slopes
    "#e4e8e8", // Z3 - playable upper terrain
    "#ffffff"  // Z4 - peak
];

export function openWorldInspector(world) {
    const overlay = document.createElement("div");

    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #11151c;
        color: #eeeeee;
        font-family: Arial, sans-serif;
        display: flex;
        flex-direction: column;
    `;

    overlay.innerHTML = `
        <header style="
            height: 54px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 18px;
            border-bottom: 1px solid #39404b;
        ">
            <strong>WORLD INSPECTOR</strong>
            <div>
                <span id="inspectorCoords">X: - | Y: -</span>
                <button id="inspectorClose" style="margin-left:18px">
                    BACK TO GENERATOR [ESC]
                </button>
            </div>
        </header>

        <main style="
            flex: 1;
            min-height: 0;
            position: relative;
            overflow: hidden;
            background: #0c1016;
        ">
            <canvas id="inspectorCanvas" style="
                width: 100%;
                height: 100%;
                display: block;
                cursor: crosshair;
            "></canvas>

            <div id="inspectorMinimapPanel" style="
                position: absolute;
                top: 14px;
                right: 14px;
                width: 210px;
                padding: 8px;
                background: rgba(20,25,34,.94);
                border: 1px solid #596273;
            ">
                <div style="font-size:12px;margin-bottom:6px">
                    WORLD MAP
                </div>
                <canvas id="inspectorMinimap" width="512" height="256"
                    style="width:100%;display:block;cursor:crosshair">
                </canvas>
            </div>

            <div id="inspectorInfo" style="
                position: absolute;
                bottom: 14px;
                left: 14px;
                padding: 10px 14px;
                background: rgba(20,25,34,.94);
                border: 1px solid #596273;
                font-size: 12px;
                line-height: 1.7;
            ">
                WASD: Move | Shift: Fast | Wheel: Zoom | G: Grid | M: Minimap
            </div>

            <div id="inspectorTile" style="
                position: absolute;
                bottom: 14px;
                right: 14px;
                padding: 10px 14px;
                background: rgba(20,25,34,.94);
                border: 1px solid #596273;
                font-size: 12px;
                display: none;
            "></div>
        </main>
    `;

    document.body.appendChild(overlay);

    const canvas = overlay.querySelector("#inspectorCanvas");
    const ctx = canvas.getContext("2d");

    const minimap = overlay.querySelector("#inspectorMinimap");
    const miniCtx = minimap.getContext("2d");

    const coordsLabel = overlay.querySelector("#inspectorCoords");
    const tilePanel = overlay.querySelector("#inspectorTile");
    const minimapPanel = overlay.querySelector("#inspectorMinimapPanel");

    const width = world.width;
    const height = world.height;

    // Create a permanent one-pixel-per-tile terrain image.
    const terrain = document.createElement("canvas");
    terrain.width = width;
    terrain.height = height;

    const terrainCtx = terrain.getContext("2d");
    const image = terrainCtx.createImageData(width, height);

    const rgb = COLORS.map(color => {
        const value = parseInt(color.slice(1), 16);

        return [
            (value >> 16) & 255,
            (value >> 8) & 255,
            value & 255
        ];
    });

    for (let i = 0; i < world.elevation.length; i++) {
        const level = world.elevation[i];
        const color = rgb[level] ?? rgb[0];
        const pixel = i * 4;

        image.data[pixel] = color[0];
        image.data[pixel + 1] = color[1];
        image.data[pixel + 2] = color[2];
        image.data[pixel + 3] = 255;
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

    terrainCtx.putImageData(image, 0, 0);

    // Initial camera position and zoom.
    let cameraX = width / 2;
    let cameraY = height / 2;
    let zoom = 3;

    let gridEnabled = false;
    let minimapVisible = true;
    let selectedTile = null;
    let animationFrame = null;
    let running = true;

    const keys = new Set();

    function resize() {
        const rect = canvas.getBoundingClientRect();

        canvas.width = Math.max(1, Math.floor(rect.width));
        canvas.height = Math.max(1, Math.floor(rect.height));

        draw();
    }

    function clampCamera() {
        const viewWidth = canvas.width / zoom;
        const viewHeight = canvas.height / zoom;

        cameraX = Math.max(
            viewWidth / 2,
            Math.min(width - viewWidth / 2, cameraX)
        );

        cameraY = Math.max(
            viewHeight / 2,
            Math.min(height - viewHeight / 2, cameraY)
        );

        if (viewWidth >= width) cameraX = width / 2;
        if (viewHeight >= height) cameraY = height / 2;
    }

    function drawMinimap() {
        miniCtx.clearRect(0, 0, width, height);
        miniCtx.drawImage(terrain, 0, 0);

        const viewWidth = canvas.width / zoom;
        const viewHeight = canvas.height / zoom;

        const left = cameraX - viewWidth / 2;
        const top = cameraY - viewHeight / 2;

        miniCtx.strokeStyle = "#ffdf75";
        miniCtx.lineWidth = 2;

        miniCtx.strokeRect(
            left,
            top,
            viewWidth,
            viewHeight
        );

        miniCtx.fillStyle = "rgba(255,223,117,0.08)";
        miniCtx.fillRect(left, top, viewWidth, viewHeight);
    }

    function draw() {
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#0c1016";
        ctx.fillRect(0, 0, w, h);

        const viewWidth = w / zoom;
        const viewHeight = h / zoom;

        const left = cameraX - viewWidth / 2;
        const top = cameraY - viewHeight / 2;

        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(
            terrain,
            left,
            top,
            viewWidth,
            viewHeight,
            0,
            0,
            w,
            h
        );

        if (gridEnabled && zoom >= 3) {
            ctx.strokeStyle = "rgba(0,0,0,0.22)";
            ctx.lineWidth = 1;

            const startX = Math.floor(left);
            const endX = Math.ceil(left + viewWidth);
            const startY = Math.floor(top);
            const endY = Math.ceil(top + viewHeight);

            ctx.beginPath();

            for (let x = startX; x <= endX; x++) {
                const screenX = (x - left) * zoom;
                ctx.moveTo(screenX, 0);
                ctx.lineTo(screenX, h);
            }

            for (let y = startY; y <= endY; y++) {
                const screenY = (y - top) * zoom;
                ctx.moveTo(0, screenY);
                ctx.lineTo(w, screenY);
            }

            ctx.stroke();
        }

        if (selectedTile) {
            const sx = (selectedTile.x - left) * zoom;
            const sy = (selectedTile.y - top) * zoom;

            ctx.strokeStyle = "#ffdf75";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, zoom, zoom);
        }

        coordsLabel.textContent =
            `Camera X: ${Math.round(cameraX)} | Y: ${Math.round(cameraY)} | Zoom: ${zoom.toFixed(1)}x`;

        if (minimapVisible) {
            drawMinimap();
        }
    }

    function screenToWorld(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();

        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        return {
            x: Math.floor(
                cameraX + (screenX - canvas.width / 2) / zoom
            ),
            y: Math.floor(
                cameraY + (screenY - canvas.height / 2) / zoom
            )
        };
    }

    function moveCamera(deltaTime) {
        const speed = keys.has("shift") ? 1800 : 700;
        const distance = speed * deltaTime / zoom;

        if (keys.has("w")) cameraY -= distance;
        if (keys.has("s")) cameraY += distance;
        if (keys.has("a")) cameraX -= distance;
        if (keys.has("d")) cameraX += distance;

        clampCamera();
    }

    function loop(timestamp) {
        if (!running) return;

        const deltaTime = Math.min(
            (timestamp - (loop.lastTime ?? timestamp)) / 1000,
            0.05
        );

        loop.lastTime = timestamp;

        if (keys.size > 0) {
            moveCamera(deltaTime);
            draw();
        }

        animationFrame = requestAnimationFrame(loop);
    }

    function onKeyDown(event) {
        const key = event.key.toLowerCase();

        if (["w", "a", "s", "d", "shift"].includes(key)) {
            event.preventDefault();
            keys.add(key);
        }

        if (key === "g") {
            gridEnabled = !gridEnabled;
            draw();
        }

        if (key === "m") {
            minimapVisible = !minimapVisible;
            minimapPanel.style.display =
                minimapVisible ? "block" : "none";
            draw();
        }

        if (key === "escape") close();
    }

    function onKeyUp(event) {
        keys.delete(event.key.toLowerCase());
    }

    function onWheel(event) {
        event.preventDefault();

        const before = screenToWorld(event.clientX, event.clientY);

        zoom = Math.max(
            1,
            Math.min(24, zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2))
        );

        const rect = canvas.getBoundingClientRect();

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // Keep the tile under the cursor stationary while zooming.
        cameraX = before.x - (screenX - canvas.width / 2) / zoom;
        cameraY = before.y - (screenY - canvas.height / 2) / zoom;

        clampCamera();
        draw();
    }

    function selectTile(clientX, clientY) {
        const tile = screenToWorld(clientX, clientY);

        if (
            tile.x < 0 || tile.x >= width ||
            tile.y < 0 || tile.y >= height
        ) return;

        selectedTile = tile;

        const level = world.elevation[tile.y * width + tile.x];

        tilePanel.style.display = "block";
        tilePanel.textContent =
            `X: ${tile.x} | Y: ${tile.y} | Elevation: Z${level}`;

        draw();
    }

    function onMiniClick(event) {
        const rect = minimap.getBoundingClientRect();

        const x = (event.clientX - rect.left) / rect.width * width;
        const y = (event.clientY - rect.top) / rect.height * height;

        cameraX = x;
        cameraY = y;

        clampCamera();
        draw();
    }

    function close() {
        if (!running) return;

        running = false;

        cancelAnimationFrame(animationFrame);

        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", clearKeys);
        window.removeEventListener("resize", resize);

        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("click", onCanvasClick);
        minimap.removeEventListener("click", onMiniClick);

        overlay.remove();
    }

    function clearKeys() {
        keys.clear();
    }

    function onCanvasClick(event) {
        selectTile(event.clientX, event.clientY);
    }

    overlay.querySelector("#inspectorClose")
        .addEventListener("click", close);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    window.addEventListener("resize", resize);

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onCanvasClick);
    minimap.addEventListener("click", onMiniClick);

    resize();
    clampCamera();
    draw();

    animationFrame = requestAnimationFrame(loop);

    return close;
}
