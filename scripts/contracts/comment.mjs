/**
 * Lists the Swift types that decode a changed Zod schema.
 * The comment names files only.
 */
import { readFile, writeFile } from "node:fs/promises";

export function commentForChangedFiles(changedFiles, clients) {
  const relevant = changedFiles.filter((file) => file.startsWith("src/schemas/"));
  const lines = ["## Clientes Swift", ""];
  if (relevant.length === 0) {
    lines.push("Nenhum arquivo em `src/schemas` mudou.");
    return lines.join("\n");
  }
  for (const file of relevant) {
    const swift = clients[file];
    if (swift?.length) {
      lines.push(`- \`${file}\` → ${swift.join(", ")}`);
    } else {
      lines.push(`- \`${file}\` → sem cliente Swift mapeado`);
    }
  }
  lines.push(
    "",
    "O Zod deste repositório decodifica `src/schemas/fixtures/place-nearby.json`. O app ainda não lê esse arquivo.",
  );
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
