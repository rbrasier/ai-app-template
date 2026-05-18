#!/usr/bin/env node
/**
 * create-ai-app-template — interactive scaffold CLI.
 *
 * Usage (run from inside your target directory):
 *   cd my-app
 *   pnpm create ai-app-template
 *   npx create-ai-app-template
 *
 * Scaffolds into the current working directory, wires @rbrasier/* framework
 * packages as versioned npm dependencies, and leaves git history clean.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import prompts from "prompts";
import pc from "picocolors";
import {
  buildDatabaseUrl,
  generateSecret,
  isDatabaseUrl,
  isDirectoryEmpty,
  patchEnvContent,
} from "./helpers.js";

const TEMPLATE_REPO = "https://github.com/rbrasier/ai-app-template";
const FRAMEWORK_SCOPE = "@rbrasier";
const FRAMEWORK_PKGS = ["domain", "shared", "application", "adapters"] as const;

type AiProvider = "anthropic" | "openai" | "mistral";
type DbSetup = "local" | "docker" | "url";

interface ScaffoldOptions {
  projectName: string;
  appScope: string;
  aiProvider: AiProvider;
  aiProviderKey: string;
  langfuseEnabled: boolean;
  databaseUrl: string;
  dbSetup: DbSetup;
  adminEmail: string;
  authSecret: string;
  targetDir: string;
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

function detectPostgres(): boolean {
  const result = spawnSync("pg_isready", [], { encoding: "utf8" });
  if (result.status === 0) return true;
  const psql = spawnSync("psql", ["--version"], { encoding: "utf8" });
  return psql.status === 0;
}

function detectPlatform(): "mac" | "linux" | "unknown" {
  const platform = process.platform;
  if (platform === "darwin") return "mac";
  if (platform === "linux") return "linux";
  return "unknown";
}

const AI_KEY_NAMES: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

async function collectInputs(): Promise<ScaffoldOptions> {
  const targetDir = process.cwd();
  const defaultName = basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const { projectName } = await prompts({
    type: "text",
    name: "projectName",
    message: "Project name (lowercase, hyphens only)",
    initial: defaultName,
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

  const { aiProviderKey } = await prompts({
    type: "text",
    name: "aiProviderKey",
    message: `${AI_KEY_NAMES[aiProvider as AiProvider]} (leave blank to set later)`,
    initial: "",
  });

  const { dbInput } = await prompts({
    type: "text",
    name: "dbInput",
    message: "Database name or full connection URL",
    initial: projectName,
  });
  if (dbInput === undefined) process.exit(0);

  let databaseUrl: string;
  let dbSetup: DbSetup = "local";

  if (isDatabaseUrl(dbInput)) {
    databaseUrl = dbInput;
    dbSetup = "url";
  } else {
    const postgresFound = detectPostgres();
    if (postgresFound) {
      console.log(pc.green("  ✓ PostgreSQL detected locally"));
      databaseUrl = buildDatabaseUrl(dbInput);
      dbSetup = "local";
    } else {
      console.log(pc.yellow("  ! PostgreSQL not detected on this machine"));
      const { installChoice } = await prompts({
        type: "select",
        name: "installChoice",
        message: "How would you like to set up PostgreSQL?",
        choices: [
          { title: "Use Docker Compose (recommended)", value: "docker" },
          ...(detectPlatform() === "mac"
            ? [{ title: "Install via Homebrew (brew install postgresql@16)", value: "brew" }]
            : []),
          ...(detectPlatform() === "linux"
            ? [{ title: "Install via apt (sudo apt-get install postgresql)", value: "apt" }]
            : []),
          { title: "I will set DATABASE_URL manually later", value: "manual" },
        ],
      });
      if (!installChoice) process.exit(0);

      if (installChoice === "brew") {
        console.log(pc.green("  Installing PostgreSQL via Homebrew…"));
        run("brew install postgresql@16");
        run("brew services start postgresql@16");
      } else if (installChoice === "apt") {
        console.log(pc.green("  Installing PostgreSQL via apt…"));
        run("sudo apt-get install -y postgresql");
        run("sudo systemctl start postgresql");
      }

      databaseUrl = installChoice === "manual"
        ? `postgresql://postgres:postgres@localhost:5432/${dbInput}`
        : buildDatabaseUrl(dbInput);
      dbSetup = installChoice === "docker" ? "docker" : "local";
    }
  }

  const { adminEmail } = await prompts({
    type: "text",
    name: "adminEmail",
    message: "Admin seed email",
    initial: "admin@example.com",
    validate: (v: string) => (v.includes("@") ? true : "Enter a valid email"),
  });
  if (!adminEmail) process.exit(0);

  const { langfuseEnabled } = await prompts({
    type: "confirm",
    name: "langfuseEnabled",
    message: "Enable Langfuse observability?",
    initial: false,
  });

  const authSecret = generateSecret();

  console.log();
  console.log(pc.bold("  Summary"));
  console.log(`  Project name   : ${pc.cyan(projectName)}`);
  console.log(`  App scope      : ${pc.cyan(appScope)}`);
  console.log(`  AI provider    : ${pc.cyan(aiProvider)}`);
  console.log(`  Database       : ${pc.cyan(databaseUrl)}`);
  console.log(`  Admin email    : ${pc.cyan(adminEmail)}`);
  console.log(`  Langfuse       : ${pc.cyan(String(langfuseEnabled))}`);
  console.log(`  Target dir     : ${pc.cyan(targetDir)}`);
  console.log();

  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "Proceed?",
    initial: true,
  });
  if (!confirmed) { console.log("Aborted."); process.exit(0); }

  return {
    projectName,
    appScope,
    aiProvider: aiProvider as AiProvider,
    aiProviderKey: aiProviderKey ?? "",
    langfuseEnabled,
    databaseUrl,
    dbSetup,
    adminEmail,
    authSecret,
    targetDir,
  };
}

function replaceInFile(filePath: string, find: string, replace: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(find)) return;
  writeFileSync(filePath, content.replaceAll(find, replace));
}

async function scaffold(opts: ScaffoldOptions) {
  const {
    projectName, appScope, aiProvider, aiProviderKey,
    langfuseEnabled, databaseUrl, dbSetup, adminEmail, authSecret, targetDir,
  } = opts;

  if (!isDirectoryEmpty(targetDir)) {
    console.error(pc.red(`  ✗ Target directory is not empty: ${targetDir}`));
    console.error(pc.red("    Create an empty directory and run this command from inside it."));
    process.exit(1);
  }

  // ── clone & strip template git history ────────────────────────────────────
  console.log(pc.green("  Cloning template…"));
  run(`git clone --depth=1 ${TEMPLATE_REPO} .`, targetDir);
  rmSync(join(targetDir, ".git"), { recursive: true, force: true });

  // ── read framework version before we remove packages/ ─────────────────────
  const frameworkVersion = readFileSync(join(targetDir, "VERSION"), "utf8").trim();

  // ── remove the framework source packages (they become npm deps) ───────────
  console.log(pc.green("  Removing framework source packages…"));
  rmSync(join(targetDir, "packages"), { recursive: true, force: true });

  // ── update pnpm-workspace.yaml to only list apps/ ─────────────────────────
  writeFileSync(join(targetDir, "pnpm-workspace.yaml"), `packages:\n  - "apps/*"\n`);

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
  if (existsSync(join(targetDir, "docker-compose.yml"))) {
    const dc = readFileSync(join(targetDir, "docker-compose.yml"), "utf8");
    writeFileSync(join(targetDir, "docker-compose.yml"), dc.replace(/^ {2}template:/m, `  ${projectName}:`));
  }

  // ── write fully-populated .env ────────────────────────────────────────────
  console.log(pc.green("  Writing .env with generated values…"));
  const envExamplePath = join(targetDir, ".env.example");
  const envExample = readFileSync(envExamplePath, "utf8");

  const envReplacements: Record<string, string> = {
    APP_NAME: projectName,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: authSecret,
    ADMIN_SEED_EMAIL: adminEmail,
    AI_DEFAULT_PROVIDER: aiProvider,
    OTEL_SERVICE_NAME: `${projectName}-api`,
  };

  if (aiProviderKey) {
    const keyName = AI_KEY_NAMES[aiProvider];
    envReplacements[keyName] = aiProviderKey;
  }

  // Replace database name in DATABASE_URL placeholder that references "template"
  let envContent = patchEnvContent(envExample, envReplacements);

  if (!langfuseEnabled) {
    envContent = envContent.replace(/^(LANGFUSE_)/gm, "# $1");
  }

  writeFileSync(join(targetDir, ".env"), envContent);

  // ── write tracking files ──────────────────────────────────────────────────
  console.log(pc.green("  Writing version tracking files…"));
  writeFileSync(join(targetDir, ".template-version"), frameworkVersion);
  writeFileSync(join(targetDir, ".framework-scope"), FRAMEWORK_SCOPE);

  // ── write .dbsetup so restart.sh knows how postgres is configured ──────────
  writeFileSync(join(targetDir, ".dbsetup"), dbSetup);

  // ── initialise a clean git repo ───────────────────────────────────────────
  console.log(pc.green("  Initialising git repository…"));
  run("git init -q", targetDir);
  run("git add .", targetDir);
  run(`git commit -q -m "chore: initial commit from ai-app-template v${frameworkVersion}"`, targetDir);

  // ── install dependencies ──────────────────────────────────────────────────
  console.log(pc.green("  Installing dependencies…"));
  run("pnpm install", targetDir);

  // ── summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(pc.green(`  ✓ Project "${projectName}" is ready.`));
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();
  console.log("  Start the app:");
  console.log(pc.cyan("    ./restart.sh"));
  console.log();
  if (!aiProviderKey) {
    console.log(pc.yellow(`  ! Add your ${AI_KEY_NAMES[aiProvider]} to .env before starting.`));
    console.log();
  }
  console.log("  Push to GitHub:");
  console.log("    git remote add origin <url> && git push -u origin main");
  console.log();
  console.log("  Update the framework later:");
  console.log("    pnpm run framework:update");
  console.log();
}

const options = await collectInputs();
await scaffold(options);
