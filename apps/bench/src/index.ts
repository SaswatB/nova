import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import duckdb from "duckdb";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { simpleGit } from "simple-git";
import { fileURLToPath } from "url";

import { ProjectContext } from "@repo/web/src/lib/nodes/node-types";
import { PROJECT_RULES, SUPPORTED_EXTENSIONS, SYSTEM_PROMPT } from "@repo/web/src/lib/nodes/projectctx-constants";

import { GraphRunner } from "../../web/src/lib/nodes/run-graph";

const rootCacheDirectory = join(dirname(fileURLToPath(import.meta.url)), "cache");

async function runGoal(rootDirectory: string, goal: string) {
  const cacheDirectory = join(rootCacheDirectory, "graph");
  const projectId = rootDirectory.replace(/\//g, "-");
  const cacheGet = async (key: string) => {
    const fullPath = join(cacheDirectory, projectId, key);
    try {
      return existsSync(fullPath) ? JSON.parse(readFileSync(fullPath, "utf8")) : undefined;
    } catch (e) {
      console.error(e);
      return undefined;
    }
  };
  const cacheSet = async (key: string, value: unknown) => {
    const fullPath = join(cacheDirectory, key);
    writeFileSync(fullPath, JSON.stringify(value));
  };
  const projectContext: ProjectContext = {
    systemPrompt: SYSTEM_PROMPT,
    rules: PROJECT_RULES,
    extensions: SUPPORTED_EXTENSIONS,
    trpcClient: createTRPCProxyClient({
      links: [httpBatchLink({ url: `http://localhost:3000/trpc` })],
    }),
    dryRun: false,
    ensureFS: () => Promise.resolve(), // noop
    readFile: async (path) => {
      const fullPath = join(rootDirectory, path);
      if (!existsSync(fullPath)) return { type: "not-found" };
      const stats = statSync(fullPath);
      if (stats.isFile()) return { type: "file", content: readFileSync(fullPath, "utf8") };
      return { type: "directory", files: readdirSync(fullPath) };
    },
    writeFile: async (path, content) => {
      const fullPath = join(rootDirectory, path);
      const originalContent = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
      return originalContent;
    },
    displayToast: (message) => console.log(message),
    showRevertFilesDialog: (p) => Promise.resolve(p),
    projectCacheGet: (key) => cacheGet(`${projectId}-${key}`),
    projectCacheSet: (key, value) => cacheSet(`${projectId}-${key}`, value),
    globalCacheGet: cacheGet,
    globalCacheSet: cacheSet,
  };
  const runner = GraphRunner.fromGoal(projectContext, goal);
  await runner.run();
  writeFileSync(
    join(rootCacheDirectory, "results", `${Date.now()}-${goal.replace(/\n/g, " ")}.json`),
    JSON.stringify(runner.toData(), null, 2),
  );
}

async function main() {
  const repoCacheDirectory = join(rootCacheDirectory, "repo");

  const db = new duckdb.Database(":memory:");
  const res = await new Promise<
    {
      repo: string;
      instance_id: string;
      base_commit: string;
      patch: string;
      test_patch: string;
      problem_statement: string;
      hints_text: string;
      created_at: string;
      version: string;
      FAIL_TO_PASS: string;
      PASS_TO_PASS: string;
      environment_setup_commit: string;
    }[]
  >((resolve, reject) => {
    db.all(
      `SELECT * FROM '/Users/saswat/Documents/clones/SWE-bench_Lite/data/dev-00000-of-00001.parquet' limit 1`,
      (err, res) => (err ? reject(err) : resolve(res as any)),
    );
  });
  console.log(res.length, "tests loaded");

  for (const test of res) {
    const repo = test.repo;
    const baseCommit = test.base_commit;
    const repoPath = join(repoCacheDirectory, `${repo.replace(/\//g, "-")}-${baseCommit}`);
    if (!existsSync(repoPath)) {
      console.log(`Cloning ${repo} into ${repoPath}`);
      mkdirSync(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.clone(`https://github.com/${repo}`, ".");
      console.log(`Cloned ${repo} into ${repoPath}`);
      await git.checkout(baseCommit);
      console.log(`Checked out ${baseCommit}`);
    } else {
      console.log(`Repository ${repo} already exists at ${repoPath}`);
    }

    console.log(`Running test for ${repo}`, test);
    await runGoal(
      repoPath,
      `The following is a GitHub issue filed for the given repository, please resolve the issue:\n${test.problem_statement}`,
    );
  }
}
main().catch(console.error);
