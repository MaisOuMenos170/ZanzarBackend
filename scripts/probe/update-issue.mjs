/**
 * Abre, comenta ou fecha a issue `sonda` a partir do relatório já sanitizado.
 */
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LABEL = "sonda";

export async function updateProbeIssue(report, outcome, run = gh) {
  const openNumber = await findOpenIssue(run);
  if (outcome === "success") {
    if (!openNumber) return "healthy-quiet";
    await run(["issue", "comment", openNumber, "--body", report]);
    await run(["issue", "close", openNumber, "--reason", "completed"]);
    return "closed";
  }

  if (openNumber) {
    await run(["issue", "comment", openNumber, "--body", report]);
    return "commented";
  }

  await ensureLabel(run);
  await run([
    "issue",
    "create",
    "--title",
    "Sonda da API falhou",
    "--label",
    LABEL,
    "--body",
    report,
  ]);
  return "opened";
}

async function findOpenIssue(run) {
  const { stdout } = await run([
    "issue",
    "list",
    "--label",
    LABEL,
    "--state",
    "open",
    "--limit",
    "1",
    "--json",
    "number",
  ]);
  const issues = JSON.parse(stdout || "[]");
  return issues[0]?.number ? String(issues[0].number) : "";
}

async function ensureLabel(run) {
  try {
    await run([
      "label",
      "create",
      LABEL,
      "--color",
      "B60205",
      "--description",
      "Sonda da API no ar",
      "--force",
    ]);
  } catch {
    // A issue ainda pode ser criada se o label já existir e o create falhar.
  }
}

async function gh(args) {
  return execFileAsync("gh", args, { encoding: "utf8" });
}

async function main() {
  const reportPath = process.argv[2];
  const outcome = process.env.PROBE_OUTCOME === "success" ? "success" : "failure";
  const report = reportPath
    ? await readFile(reportPath, "utf8")
    : "## Sonda da API\n\n- Health: falhou\n- Mapa (centro de Curitiba): falhou\n- Foto: falhou\n";
  const action = await updateProbeIssue(report.trim(), outcome);
  process.stdout.write(`${action}\n`);
}

const isDirectRun = process.argv[1]?.endsWith("update-issue.mjs");
if (isDirectRun) {
  await main();
}
