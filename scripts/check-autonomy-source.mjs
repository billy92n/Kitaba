import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const decisionFile = fileURLToPath(
  new URL(
    "../artifacts/api-server/src/engine/autonomyDecision.ts",
    import.meta.url,
  ),
);
const contextFile = fileURLToPath(
  new URL(
    "../artifacts/api-server/src/engine/autonomyContext.ts",
    import.meta.url,
  ),
);

const checks = [
  {
    file: decisionFile,
    forbidden: [
      /\bWorldState\b/,
      /\bcontrolledEntityId\b/,
      /\bplayer\b/i,
      /\bMath\.random\b/,
      /\bDate\.now\b/,
      /\brandomUUID\b/,
    ],
  },
  {
    file: contextFile,
    forbidden: [
      /\bcontrolledEntityId\b/,
      /\bplayer\b/i,
      /\bMath\.random\b/,
      /\bDate\.now\b/,
      /\brandomUUID\b/,
    ],
  },
];

const failures = [];
for (const check of checks) {
  const source = await readFile(check.file, "utf8");
  for (const pattern of check.forbidden) {
    if (pattern.test(source)) {
      failures.push(`${check.file}: forbidden pattern ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Autonomy source audit passed.\n");
}
