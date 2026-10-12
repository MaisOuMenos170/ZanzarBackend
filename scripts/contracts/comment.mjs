/**
 * Lists the Swift types that decode a changed Zod schema.
 * The comment names files only.
 */
import { readFile, writeFile } from "node:fs/promises";

const fixtureSchema = {
  "src/schemas/fixtures/place-nearby.json": "src/schemas/place.ts",
  "src/schemas/place.fixture.vitest.ts": "src/schemas/place.ts",
};

export function commentForChangedFiles(changedFiles, clients) {
  const schemas = new Set();
  const unmapped = [];
  for (const file of changedFiles) {
    if (!file.startsWith("src/schemas/") || file.endsWith("/")) continue;
    const viaFixture = fixtureSchema[file];
    if (viaFixture) {
      schemas.add(viaFixture);
      continue;
    }
    if (!file.endsWith(".ts")) continue;
    if (clients[file]?.length) schemas.add(file);
    else unmapped.push(file);
  }

  const lines = ["## Clientes Swift", ""];
  if (schemas.size === 0 && unmapped.length === 0) {
    lines.push("Nenhum schema com cliente Swift mudou.");
    return `${lines.join("\n")}\n`;
  }
  for (const file of schemas) {
    lines.push(`- \`${file}\` → ${clients[file].join(", ")}`);
  }
  for (const file of unmapped) {
    lines.push(`- \`${file}\` → sem cliente Swift mapeado`);
  }
  lines.push("", "O app ainda não lê o fixture. O Zod daqui decodifica o JSON do schema citado.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const changedPath = process.argv[2];
  const outPath = process.argv[3] ?? "contract-comment.md";
  const changed = (await readFile(changedPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const clients = JSON.parse(
    await readFile(new URL("./swift-clients.json", import.meta.url), "utf8"),
  );
  await writeFile(outPath, commentForChangedFiles(changed, clients));
}

if (process.argv[1]?.endsWith("comment.mjs")) {
  await main();
}
