// Genera un slug URL-safe y le añade un sufijo aleatorio corto para unicidad.
export function slugify(str) {
    const base = String(str || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 60);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base || "item"}-${suffix}`;
}
