
import { generateWorld } from "../world/worldgenerator.js";
import { renderMap } from "./maprenderer.js";
import { openWorldInspector } from "./worldinspector.js";

export function initializeGenerator(config) {
    const container = document.getElementById("generatorControls");
    const mapPreview = document.getElementById("mapPreview");
    const mapInfo = document.getElementById("mapInfo");
    const generateButton = document.getElementById("generateButton");

    const settings = [
        {
            key: "mountainCount",
            label: "Number of mountains",
            value: config.mountains.count,
            min: 1,
            max: 30
        },
        {
            key: "peakMax",
            label: "Maximum peak size",
            value: config.mountains.peakSize.max,
            min: 4,
            max: 10
        },
        {
            key: "minimumDistance",
            label: "Minimum peak distance",
            value: config.mountains.minimumDistance,
            min: 0,
            max: 100
        },
        {
            key: "desertChance",
            label: "Desert percentage",
            value: config.biomes.z0.desertChance * 100,
            min: 0,
            max: 100
        },
        {
            key: "riverLength",
            label: "River length before lake",
            value: config.rivers.minimumLengthOnElevation,
            min: 3,
            max: 20
        }
    ];

    container.innerHTML = "";

    // SEED CONTROL
    const seedControl = document.createElement("div");
    seedControl.className = "control";

    seedControl.innerHTML = `
        <label>
            World seed
        </label>

        <div style="display:flex; gap:8px; margin-top:8px;">
            <input
                id="worldSeed"
                type="number"
                min="0"
                max="4294967295"
                style="flex:1; min-width:0;"
            >

            <button
                id="randomSeedButton"
                type="button"
                style="padding:8px 12px;"
            >
                RANDOMIZE
            </button>
        </div>
    `;

    container.appendChild(seedControl);

    const seedInput = seedControl.querySelector("#worldSeed");
    const randomSeedButton =
        seedControl.querySelector("#randomSeedButton");

    function createRandomSeed() {
        return Math.floor(Math.random() * 4294967296);
    }

    seedInput.value = createRandomSeed();

    settings.forEach(setting => {
        const control = document.createElement("div");
        control.className = "control";

        control.innerHTML = `
            <label>
                ${setting.label}
                <span class="control-value">${setting.value}</span>
            </label>

            <input
                type="range"
                min="${setting.min}"
                max="${setting.max}"
                value="${setting.value}"
                step="1"
            >
        `;

        const slider = control.querySelector("input");
        const output = control.querySelector(".control-value");

        slider.addEventListener("input", () => {
            output.textContent = slider.value;
            setting.currentValue = Number(slider.value);
        });

        container.appendChild(control);
    });

    function getSettings() {
        const values = {};

        settings.forEach(setting => {
            values[setting.key] =
                setting.currentValue ?? setting.value;
        });

        return values;
    }

    let currentWorld = null;

    // INSPECT WORLD BUTTON
    const inspectButton = document.createElement("button");

    inspectButton.id = "inspectWorldButton";
    inspectButton.textContent = "INSPECT WORLD";
    inspectButton.disabled = true;

    inspectButton.style.cssText = `
        width: 100%;
        margin-top: 10px;
        padding: 12px;
        background: #343b48;
        color: white;
        border: 1px solid #596273;
        cursor: pointer;
        font-weight: bold;
    `;

    generateButton.insertAdjacentElement("afterend", inspectButton);

    function generate() {
        const values = getSettings();

        const seed = Number(seedInput.value);

        if (
            !Number.isSafeInteger(seed) ||
            seed < 0 ||
            seed > 4294967295
        ) {
            alert("Seed must be an integer between 0 and 4294967295.");
            return;
        }

        currentWorld = generateWorld(config, {
            mountainCount: values.mountainCount,
            peakMax: values.peakMax,
            minimumDistance: values.minimumDistance,
            seed: seed
        });

        renderMap(currentWorld, mapPreview);

        mapInfo.textContent =
            `${currentWorld.width} × ${currentWorld.height} | ` +
            `${currentWorld.width * currentWorld.height} tiles | ` +
            `${currentWorld.mountains.length} mountains | ` +
            `Seed: ${currentWorld.seed}`;

        inspectButton.disabled = false;

        console.log("Generated world:", currentWorld);
    }

    // Generate button repeats the current seed.
    generateButton.addEventListener("click", generate);

    // Randomize button creates a new seed and generates immediately.
    randomSeedButton.addEventListener("click", () => {
        seedInput.value = createRandomSeed();
        generate();
    });

    inspectButton.addEventListener("click", () => {
        if (!currentWorld) return;

        openWorldInspector(currentWorld);
    });

    // Generate the first random map automatically.
    generate();
}
