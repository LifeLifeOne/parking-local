import { execFileSync } from "node:child_process";
const title =
  process.env.PR_TITLE ??
  execFileSync("git", ["log", "-1", "--format=%s"], {
    encoding: "utf8",
  }).trim();
if (
  !/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9/-]+\))?!?: .+/.test(
    title,
  )
) {
  console.error(
    "Utilisez Conventional Commits, par exemple feat(reservations): ajouter les transferts",
  );
  process.exit(1);
}
