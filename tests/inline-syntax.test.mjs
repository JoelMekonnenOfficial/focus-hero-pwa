import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

for (const file of ["index.html", "focus-hero.html"]) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());

  assert.ok(scripts.length > 0, `${file} must contain inline scripts`);
  scripts.forEach((source, index) => {
    new vm.Script(source, { filename:`${file}:inline-script-${index + 1}` });
  });
  console.log(`ok - ${file}: ${scripts.length} inline scripts parse`);
}
