
export async function loadConfig() {
    const response = await fetch("./config/mapgen.json");

    if (!response.ok) {
        throw new Error("Cannot load mapgen.json");
    }

    return await response.json();
}
