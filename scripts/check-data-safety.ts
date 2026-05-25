import { existsSync, readFileSync } from "node:fs";
import { globSync } from "glob";

const failures: string[] = [];

function expect(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

const gitignore = readFileSync(".gitignore", "utf8");
for (const pattern of ["backups/", "*.dump", "*.sql", "*.sql.gz", "*.backup", "*.bak", "*.db", "*.sqlite", "*.sqlite3"]) {
  expect(gitignore.includes(pattern), `.gitignore missing pattern: ${pattern}`);
}

expect(existsSync("scripts/db-backup.sh"), "scripts/db-backup.sh not found");
expect(existsSync("scripts/db-restore.sh"), "scripts/db-restore.sh not found");

const forbidden = globSync("**/*.{dump,sql,sql.gz,backup,bak,sqlite,sqlite3}", {
  ignore: ["node_modules/**", ".git/**", "backups/**"],
  nodir: true,
});
if (forbidden.length > 0) {
  failures.push(`Potential dump/database files tracked in repo: ${forbidden.join(", ")}`);
}

if (failures.length) {
  console.error("Data safety check failed:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("Data safety check passed.");
