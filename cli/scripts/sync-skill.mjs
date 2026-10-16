import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const cliRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await rm(path.join(cliRoot, "skills"), { recursive: true, force: true });
for (const name of ["iterlay-workspace", "using-iterlay"]) {
  const source = path.join(cliRoot, "..", "resources", "skills", name);
  const destination = path.join(cliRoot, "skills", name);
  await cp(source, destination, { recursive: true, force: true });
  stdout.write(`已同步 Iterlay Skill 到 ${destination}\n`);
}
