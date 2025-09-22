// tools/backfill-foundations.mjs
import fs from "fs";
import path from "path";

const DATA_ROOT = process.env.DATA_ROOT || path.resolve("./data");
const registryPath = path.join(DATA_ROOT, "buildings.json");

const slugify = (x="") => x
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const arr = JSON.parse(fs.readFileSync(registryPath, "utf8"));
for (const b of arr) {
  if (!b.foundationId) {
    b.foundationId = b.foundationSlug || (b.foundationName ? slugify(b.foundationName) : "f_default");
  }
  if (!b.foundationSlug && b.foundationName) {
    b.foundationSlug = slugify(b.foundationName);
  }
}
fs.writeFileSync(registryPath, JSON.stringify(arr, null, 2));
console.log(`Updated ${arr.length} buildings → ${registryPath}`);
