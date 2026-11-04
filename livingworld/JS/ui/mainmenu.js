
export function initializeMenu() {
    const menu = document.getElementById("mainMenu");
    const generator = document.getElementById("generatorScreen");

    document.getElementById("generatorButton").addEventListener("click", () => {
        menu.classList.add("hidden");
        generator.classList.remove("hidden");
    });

    document.getElementById("backButton").addEventListener("click", () => {
        generator.classList.add("hidden");
        menu.classList.remove("hidden");
    });
}
