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
            key: "peakMin",
            label: "Minimum peak size",
            value: config.mountains.peakSize.min,
            min: 4,
            max: 10
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
            key: "rampSpacing",
            label: "Minimum distance between ramps",
            value: 50,
            min: 30,
            max: 100
        },
        {
            key: "rampMaxLength",
            label: "Maximum ramp length",
            value: 8,
            min: 2,
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

    const settingControls = new Map();

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

        settingControls.set(setting.key, { slider, output });

        slider.addEventListener("input", () => {
            setting.currentValue = Number(slider.value);
            output.textContent = slider.value;

            // Keep the minimum and maximum peak sizes in a valid order.
            if (setting.key === "peakMin" || setting.key === "peakMax") {
                const otherKey = setting.key === "peakMin" ? "peakMax" : "peakMin";
                const otherSetting = settings.find(item => item.key === otherKey);
                const otherControl = settingControls.get(otherKey);
                const otherValue = otherSetting.currentValue ?? otherSetting.value;

                const crossed =
                    setting.key === "peakMin"
                        ? setting.currentValue > otherValue
                        : setting.currentValue < otherValue;

                if (crossed) {
                    otherSetting.currentValue = setting.currentValue;
                    otherControl.slider.value = setting.currentValue;
                    otherControl.output.textContent = setting.currentValue;
                }
            }
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
            peakMin: values.peakMin,
            peakMax: values.peakMax,
            minimumDistance: values.minimumDistance,
            rampSpacing: values.rampSpacing,
            rampMaxLength: values.rampMaxLength,
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

    // Every Generate Map click creates a new random world.
    generateButton.addEventListener("click", () => {
        seedInput.value = createRandomSeed();
        generate();
    });

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
