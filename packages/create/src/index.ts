#!/usr/bin/env node
/**
 * create-ai-app-template — interactive scaffold CLI.
 *
 * Usage:
 *   npx create-ai-app-template
 *   npx create-ai-app-template my-saas-app
 *   pnpm create ai-app-template
 *
 * Creates a new project directory, wires @rbrasier/* framework packages as
 * versioned npm dependencies, and leaves git history clean.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prompts from "prompts";
import pc from "picocolors";

const TEMPLATE_REPO = "https://github.com/rbrasier/ai-app-template";
const FRAMEWORK_SCOPE = "@rbrasier";
const FRAMEWORK_PKGS = ["domain", "shared", "application", "adapters"] as const;

interface ScaffoldOptions {
  projectName: string;
  appScope: string;
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

  const { appScope } = await prompts({
    type: "text",
    name: "appScope",
    message: "Package scope for your app packages (e.g. @acme)",
    initial: `@${projectName}`,
    validate: (v: string) =>
      v.startsWith("@") ? true : "Scope must start with @",
  });
  if (!appScope) process.exit(0);

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
  console.log(`  Project name     : ${pc.cyan(projectName)}`);
  console.log(`  App scope        : ${pc.cyan(appScope)}`);
  console.log(`  Framework scope  : ${pc.cyan(FRAMEWORK_SCOPE)} (published npm packages)`);
  console.log(`  AI provider      : ${pc.cyan(aiProvider)}`);
  console.log(`  Langfuse         : ${pc.cyan(String(langfuseEnabled))}`);
  console.log(`  Target dir       : ${pc.cyan(targetDir)}`);
  console.log();

  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "Proceed?",
    initial: true,
  });
  if (!confirmed) { console.log("Aborted."); process.exit(0); }

  return { projectName, appScope, aiProvider, langfuseEnabled, targetDir };
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

function replaceInFile(filePath: string, find: string, replace: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(find)) return;
  writeFileSync(filePath, content.replaceAll(find, replace));
}

async function scaffold(opts: ScaffoldOptions) {
  const { projectName, appScope, aiProvider, langfuseEnabled, targetDir } = opts;

  if (existsSync(targetDir)) {
    console.error(pc.red(`  ✗ Directory already exists: ${targetDir}`));
    process.exit(1);
  }

  // ── clone & strip template git history ────────────────────────────────────
  console.log(pc.green("  Cloning template…"));
  run(`git clone --depth=1 ${TEMPLATE_REPO} "${targetDir}"`);
  rmSync(join(targetDir, ".git"), { recursive: true, force: true });

  // ── read framework version before we remove packages/ ─────────────────────
  const frameworkVersion = readFileSync(join(targetDir, "VERSION"), "utf8").trim();

  // ── remove the framework source packages (they become npm deps) ───────────
  console.log(pc.green("  Removing framework source packages…"));
  rmSync(join(targetDir, "packages"), { recursive: true, force: true });

  // ── update pnpm-workspace.yaml to only list apps/ ─────────────────────────
  writeFileSync(
    join(targetDir, "pnpm-workspace.yaml"),
    `packages:\n  - "apps/*"\n`,
  );

  // ── rename app-level packages to the user's scope ─────────────────────────
  console.log(pc.green(`  Renaming @rbrasier/web and @rbrasier/api → ${appScope}/…`));
  replaceInFile(join(targetDir, "apps/web/package.json"), `"@rbrasier/web"`, `"${appScope}/web"`);
  replaceInFile(join(targetDir, "apps/api/package.json"), `"@rbrasier/api"`, `"${appScope}/api"`);

  // ── swap workspace:* framework refs → versioned npm deps ──────────────────
  console.log(pc.green("  Wiring framework packages as versioned npm dependencies…"));
  const versionRange = `^${frameworkVersion}`;
  for (const appDir of ["apps/web", "apps/api"]) {
    const pkgPath = join(targetDir, appDir, "package.json");
    if (!existsSync(pkgPath)) continue;
    for (const pkg of FRAMEWORK_PKGS) {
      replaceInFile(pkgPath, `"${FRAMEWORK_SCOPE}/${pkg}": "workspace:*"`, `"${FRAMEWORK_SCOPE}/${pkg}": "${versionRange}"`);
    }
  }

  // ── update root package.json name ─────────────────────────────────────────
  replaceInFile(join(targetDir, "package.json"), '"name": "template"', `"name": "${projectName}"`);

  // ── docker / env renames ──────────────────────────────────────────────────
  replaceInFile(join(targetDir, "docker-compose.yml"), "POSTGRES_DB=template", `POSTGRES_DB=${projectName}`);
  const envExample = join(targetDir, ".env.example");
  replaceInFile(envExample, "APP_NAME=template", `APP_NAME=${projectName}`);
  replaceInFile(envExample, "/template", `/${projectName}`);
  replaceInFile(envExample, "AI_DEFAULT_PROVIDER=anthropic", `AI_DEFAULT_PROVIDER=${aiProvider}`);
  if (existsSync(join(targetDir, "docker-compose.yml"))) {
    const dc = readFileSync(join(targetDir, "docker-compose.yml"), "utf8");
    writeFileSync(join(targetDir, "docker-compose.yml"), dc.replace(/^ {2}template:/m, `  ${projectName}:`));
  }

  if (!langfuseEnabled && existsSync(envExample)) {
    const content = readFileSync(envExample, "utf8");
    writeFileSync(envExample, content.replace(/^(LANGFUSE_)/gm, "# $1"));
  }

  // ── write tracking files ──────────────────────────────────────────────────
  console.log(pc.green("  Writing version tracking files…"));
  writeFileSync(join(targetDir, ".template-version"), frameworkVersion);
  writeFileSync(join(targetDir, ".framework-scope"), FRAMEWORK_SCOPE);

  // ── copy .env ─────────────────────────────────────────────────────────────
  console.log(pc.green("  Copying .env…"));
  run(`cp .env.example .env`, targetDir);

  // ── initialise a clean git repo ───────────────────────────────────────────
  console.log(pc.green("  Initialising git repository…"));
  run("git init -q", targetDir);
  run("git add .", targetDir);
  run(`git commit -q -m "chore: initial commit from ai-app-template v${frameworkVersion}"`, targetDir);

  // ── configure npm registry auth for @rbrasier scope ──────────────────────
  writeFileSync(
    join(targetDir, ".npmrc"),
    `@rbrasier:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}\n`,
  );

  // ── install dependencies ──────────────────────────────────────────────────
  console.log(pc.green("  Installing dependencies…"));
  run("pnpm install", targetDir);

  // ── summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(pc.green(`  ✓ Project "${projectName}" is ready.`));
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();
  console.log(`    cd ${projectName}`);
  console.log();
  console.log("  Next steps:");
  console.log("    1. Set GITHUB_TOKEN in your environment (read:packages scope)");
  console.log("    2. Fill in secrets in .env (DATABASE_URL, BETTER_AUTH_SECRET, AI keys)");
  console.log("    3. Start infrastructure:   docker compose up -d");
  console.log("    4. Start the app:          ./restart.sh");
  console.log("    5. Open the app:           http://localhost:3000");
  console.log("    6. Push to GitHub:         git remote add origin <url> && git push -u origin main");
  console.log();
  console.log("  To update the framework later:");
  console.log("    pnpm run framework:update");
  console.log();
}

const options = await collectInputs(process.argv);
await scaffold(options);
