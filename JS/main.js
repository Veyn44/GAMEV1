
import { loadConfig } from "./configloader.js";
import { initializeMenu } from "../ui/mainmenu.js";
import { initializeGenerator } from "../ui/generatorui.js";

async function startApplication() {
    try {
        const config = await loadConfig();

        initializeMenu();

        initializeGenerator(config);

        console.log("LIVING WORLD INITIALIZED");
        console.log("Configuration loaded:", config);

    } catch (error) {
        console.error("Application initialization failed:", error);
        alert("Failed to load configuration. Check the console.");
    }
}

startApplication();
