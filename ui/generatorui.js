
export function initializeGenerator(config) {
    const container = document.getElementById("generatorControls");

    const settings = [
        {
            key: "mountainCount",
            label: "Number of mountains",
            value: config.mountains.count,
            min: 1,
            max: 30
        },
        {
            key: "peakSize",
            label: "Maximum peak size",
            value: config.mountains.peakSize.max,
            min: 2,
            max: 20
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

    document.getElementById("generateButton").addEventListener("click", () => {
        const values = {};

        settings.forEach(setting => {
            values[setting.key] = setting.currentValue ?? setting.value;
        });

        console.log("Generation settings:", values);
        alert("Settings ready. World generation will be connected next.");
    });
}
