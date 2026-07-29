import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const engineDirectory = fileURLToPath(
  new URL("../artifacts/api-server/src/engine/", import.meta.url),
);
const forbidden = [
  { label: "controlledEntityId", pattern: /\bcontrolledEntityId\b/ },
  { label: "variable controlled", pattern: /\bcontrolled\b/ },
  {
    label: "vocabulaire lié au joueur",
    pattern: /\b(joueur|personnage contrôlé|entité contrôlée)\b/i,
  },
  {
    label: "assertion non nulle",
    pattern: /(?:[\w)\]])!(?=[.;,[\]])/,
  },
  { label: "type any explicite", pattern: /:\s*any\b|<any>|\bas\s+any\b/ },
];

const files = (await readdir(engineDirectory))
  .filter((name) => name.endsWith(".ts"))
  .sort();
const failures = [];

for (const file of files) {
  const content = await readFile(join(engineDirectory, file), "utf8");
  for (const check of forbidden) {
    if (check.pattern.test(content)) failures.push(`${file}: ${check.label}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Engine source audit passed (${files.length} files).\n`);
}
