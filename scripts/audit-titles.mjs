// Throwaway audit script — list title + description lengths per page.
import fs from "node:fs";
import path from "node:path";

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith(".astro")) files.push(p);
  }
  return files;
}

const files = walk("src/pages");
const out = [];
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  // Match double-quoted first (allows apostrophes), fall back to single-quoted.
  // Astro template literals (backticks) also handled.
  const titleMatch =
    txt.match(/title="([^"]+)"/) ||
    txt.match(/title='([^']+)'/) ||
    txt.match(/title=\{`([^`]+)`\}/);
  const descMatch =
    txt.match(/description="([^"]+)"/) ||
    txt.match(/description='([^']+)'/) ||
    txt.match(/description=\{`([^`]+)`\}/);
  out.push({
    route: f.replace(/\\/g, "/").replace(/^src\/pages\//, "/").replace(/\.astro$/, "/").replace(/index\/$/, ""),
    title: titleMatch?.[1] ?? null,
    desc: descMatch?.[1] ?? null,
  });
}
out.sort((a, b) => a.route.localeCompare(b.route));

for (const r of out) {
  const tLen = r.title?.length ?? 0;
  const dLen = r.desc?.length ?? 0;
  const tFlag = tLen > 60 ? " ⚠OVER" : (!r.title ? " ❌MISSING" : "");
  const dFlag = dLen > 160 ? " ⚠OVER" : (dLen > 0 && dLen < 120 ? " ⚠SHORT" : (!r.desc ? " ❌MISSING" : ""));
  console.log(r.route);
  console.log(`  TITLE [${tLen}]${tFlag}: ${r.title ?? "—"}`);
  console.log(`  DESC  [${dLen}]${dFlag}: ${r.desc ?? "—"}`);
}
