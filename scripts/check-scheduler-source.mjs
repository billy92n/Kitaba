import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = [
  {
    path: fileURLToPath(
      new URL(
        "../artifacts/api-server/src/engine/worldScheduler.ts",
        import.meta.url,
      ),
    ),
    forbidden: [
      /\bcontrolledEntityId\b/,
      /\bplayer\b/i,
      /\bMath\.random\b/,
      /\bDate\.now\b/,
      /\brandomUUID\b/,
      /\bObject\.values\s*\(\s*state\.entities\s*\)/,
      /postgres/i,
      /worldRepository/i,
    ],
  },
  {
    path: fileURLToPath(
      new URL(
        "../artifacts/api-server/src/services/worldScheduler.ts",
        import.meta.url,
      ),
    ),
    forbidden: [
      /\bcontrolledEntityId\b/,
      /\bplayer\b/i,
      /\bMath\.random\b/,
      /\bDate\.now\b/,
      /\brandomUUID\b/,
      /\.tryCommit\s*\(/,
    ],
  },
];

const failures = [];
for (const file of files) {
  const source = await readFile(file.path, "utf8");
  for (const pattern of file.forbidden) {
    if (pattern.test(source)) {
      failures.push(`${file.path}: forbidden pattern ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Scheduler source audit passed.\n");
}
