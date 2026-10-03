import config from "../../astro.config.mjs";
export default { ...config, vite: { ...config.vite, cacheDir: ".astro/cogs-mobile-vite" } };
