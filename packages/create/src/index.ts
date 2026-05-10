#!/usr/bin/env node
/**
 * @template/create — interactive scaffold CLI.
 *
 * Usage:
 *   npx @template/create
 *   npx @template/create my-saas-app
 *
 * Creates a new project by cloning the scaffold, renaming all @template/
 * references, and installing dependencies.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prompts from "prompts";
import pc from "picocolors";

const TEMPLATE_REPO = "https://github.com/rbrasier/ai-app-template";

interface ScaffoldOptions {
  projectName: string;
  pkgScope: string;
  aiProvider: "anthropic" | "openai" | "mistral";
  langfuseEnabled: boolean;
  targetDir: string;
}

async function collectInputs(argv: string[]): Promise<ScaffoldOptions> {
  const nameArg = argv[2];

  const { projectName } = await prompts({
    type: "text",
    name: "projectName",
    message: "Project name (lowercase, hyphens only)",
    initial: nameArg ?? "my-app",
    validate: (v: string) =>
      /^[a-z][a-z0-9-]*$/.test(v)
        ? true
        : "Must be lowercase letters, numbers, and hyphens only",
  });

  if (!projectName) process.exit(0);

  const { pkgScope } = await prompts({
    type: "text",
    name: "pkgScope",
    message: "Package scope",
    initial: `@${projectName}`,
    validate: (v: string) =>
      v.startsWith("@") ? true : "Scope must start with @",
  });

  if (!pkgScope) process.exit(0);

  const { aiProvider } = await prompts({
    type: "select",
    name: "aiProvider",
    message: "Default AI provider",
    choices: [
      { title: "Anthropic (Claude)", value: "anthropic" },
      { title: "OpenAI (GPT-4o)", value: "openai" },
      { title: "Mistral (Mistral Large)", value: "mistral" },
    ],
  });

  if (!aiProvider) process.exit(0);

  const { langfuseEnabled } = await prompts({
    type: "confirm",
    name: "langfuseEnabled",
    message: "Enable Langfuse observability?",
    initial: false,
  });

  const targetDir = join(process.cwd(), projectName);

  console.log();
  console.log(pc.bold("  Summary"));
  console.log(`  Project name  : ${pc.cyan(projectName)}`);
  console.log(`  Package scope : ${pc.cyan(pkgScope)}`);
  console.log(`  AI provider   : ${pc.cyan(aiProvider)}`);
  console.log(`  Langfuse      : ${pc.cyan(String(langfuseEnabled))}`);
  console.log(`  Target dir    : ${pc.cyan(targetDir)}`);
  console.log();

  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "Proceed?",
    initial: true,
  });

  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  return { projectName, pkgScope, aiProvider, langfuseEnabled, targetDir };
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

function replaceInFile(filePath: string, find: string, replace: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  writeFileSync(filePath, content.replaceAll(find, replace));
}

async function scaffold(opts: ScaffoldOptions) {
  const { projectName, pkgScope, aiProvider, langfuseEnabled, targetDir } = opts;

  if (existsSync(targetDir)) {
    console.error(pc.red(`  ✗ Directory already exists: ${targetDir}`));
    process.exit(1);
  }

  console.log(pc.green("  Cloning template…"));
  run(`git clone --depth=1 ${TEMPLATE_REPO} "${targetDir}"`);

  process.chdir(targetDir);

  // Remove the template's git history
  run("rm -rf .git");

  console.log(pc.green("  Renaming @template/ → " + pkgScope + "/…"));

  // Rename scope across all source files
  const extensions = ["*.json", "*.ts", "*.tsx", "*.md", "*.sh", "*.yml", "*.yaml"];
  for (const ext of extensions) {
    run(
      `find . -name "${ext}" ` +
        `-not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" ` +
        `-exec sed -i.bak "s|@template/|${pkgScope}/|g" {} \\; ` +
        `-exec rm -f {}.bak \\;`,
    );
  }

  replaceInFile("package.json", '"name": "template"', `"name": "${projectName}"`);
  replaceInFile("docker-compose.yml", "POSTGRES_DB=template", `POSTGRES_DB=${projectName}`);
  replaceInFile(".env.example", "APP_NAME=template", `APP_NAME=${projectName}`);
  replaceInFile(".env.example", "/template", `/${projectName}`);
  replaceInFile(
    ".env.example",
    "AI_DEFAULT_PROVIDER=anthropic",
    `AI_DEFAULT_PROVIDER=${aiProvider}`,
  );

  if (!langfuseEnabled && existsSync(".env.example")) {
    const content = readFileSync(".env.example", "utf8");
    writeFileSync(".env.example", content.replace(/^(LANGFUSE_)/gm, "# $1"));
  }

  console.log(pc.green("  Writing version tracking files…"));
  const version = readFileSync("VERSION", "utf8").trim();
  writeFileSync(".template-version", version);
  writeFileSync(".framework-scope", pkgScope);

  console.log(pc.green("  Copying .env…"));
  run("cp .env.example .env");

  console.log(pc.green("  Initialising git repository…"));
  run("git init -q");
  run("git add .");
  run(`git commit -q -m "chore: initial commit from ai-app-template v${version}"`);

  console.log(pc.green("  Installing dependencies…"));
  run("pnpm install");

  mkdirSync(targetDir, { recursive: true });

  console.log();
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log(pc.green(`  ✓ Project "${projectName}" is ready.`));
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log();
  console.log("  Next steps:");
  console.log(`    cd ${projectName}`);
  console.log("    1. Fill in secrets in .env (DATABASE_URL, BETTER_AUTH_SECRET, AI keys)");
  console.log("    2. Start infrastructure:   docker compose up -d");
  console.log("    3. Start the app:          ./restart.sh");
  console.log("    4. Open the app:           http://localhost:3000");
  console.log("    5. Push to GitHub:         git remote add origin <url> && git push -u origin main");
  console.log();
  console.log("  Admin login is seeded from ADMIN_SEED_EMAIL in .env.");
  console.log();
}

const options = await collectInputs(process.argv);
await scaffold(options);
