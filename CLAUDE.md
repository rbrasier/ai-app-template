# CLAUDE.md — Skill Routing Layer

This file instructs Claude Code (and any agent operating in this repo) how to
handle every prompt automatically. It is the **single entry point** for all
AI-driven work in this monorepo.

---

## How Every Prompt Is Handled

For **every** prompt, follow these steps in order:

1. Read the incoming prompt.
2. Identify which skill applies (see "Skill Routing Rules" below).
3. State clearly:
   `Applying skill: [skill name] because [one-line reason]`
4. Ask any clarifying questions required by that skill **before** proceeding.
5. Execute the skill's workflow.
6. On completion: run `./validate.sh` and fix any failures before declaring done.

Never start writing code before stating the chosen skill. Never end a task
without running `validate.sh`.

---

## Project Identity

This repo is the **template** scaffold. The package scope is `@template/*`.
When a real project is bootstrapped from this template via the
"New App / Feature Setup" skill, the agent must:

- Replace `template` with the new project name in:
  - root `package.json` `name` field
  - every `package.json` in `apps/*` and `packages/*` (`name` and dependency keys)
  - `pnpm-lock.yaml` (regenerate via `pnpm install`)
  - `tsconfig.*.json` `paths` and `references`
  - `docker-compose.yml` service names and `POSTGRES_DB`
  - `.env.example` (`APP_NAME`, `DATABASE_URL`)
  - `README.md`
- Run `pnpm install` to regenerate the lockfile
- Run `./validate.sh` to confirm

A grep for `@template/` should return zero matches outside the template
itself once renamed.

---

## Architecture Rules (non-negotiable)

These rules are enforced by `validate.sh` and ESLint. Skills that write code
must respect them:

- `packages/domain` has **zero external dependencies**. Pure TypeScript.
  Only relative imports.
- `packages/application` may import only `@template/domain` and
  `@template/shared`. No frameworks, no ORMs, no AI SDKs.
- `packages/adapters` implements interfaces from `packages/domain`.
  This is where Drizzle, Vercel AI SDK, LangGraph.js, Langfuse, and
  Better Auth live.
- Apps (`apps/*`) import from `@template/application` and
  `@template/adapters` only. Wiring lives in `lib/container.ts` per app.
- All port interfaces use the **Result pattern**:
  `{ data: T } | { error: DomainError }`. Never throw across boundaries.
- Domain entities are plain TypeScript types/classes — no decorators,
  no ORM annotations.
- Database table names use group prefixes: `core_`, `ai_`, `kb_`, `admin_`,
  `app_`, `job_`. Column names are snake_case. Every table has `id` (uuid),
  `created_at`, `updated_at`.

See `docs/guides/architecture.md` for the full picture.

---

## Skill Routing Rules

### Skill: New App / Feature Setup

**Triggers when** the user wants to plan something new, create a new bounded
context, or start a new project phase.

**Required clarifying questions:**

1. What problem does this solve? Who uses it?
2. What are the key entities involved?
3. Does it require DB changes? (If yes, which group prefix?)
4. What version bump does it warrant? (MAJOR / MINOR / PATCH)
5. If this is a brand-new project bootstrapped from the template:
   - What is the project name? (used for `@<name>/*` scope, README,
     docker-compose service names)
   - Are there existing files we should integrate with rather than overwrite?
   - Which LLM provider should be the default?
     (`anthropic` / `openai` / `mistral`)
   - Should Langfuse observability be enabled day one or stubbed out?

**Workflow:**

- Generate a PRD in `docs/development/prd/` using
  `docs/development/prd/template.prd.md` as the starting point.
- If architectural decisions are made, generate ADR(s) in
  `docs/development/adr/`.
- Generate a phase doc in `docs/development/to-be-implemented/`.

**Important:** Do NOT write code in this skill. It produces documentation
for review only.

---

### Skill: Documentation Review

**Triggers when** the user asks to review, check, or validate docs before
building, **or** when a phase doc exists in `to-be-implemented/` and the user
says "let's build this".

**Workflow:**

- Read all referenced PRD, ADR, and phase documents.
- Check:
  - PRD and ADR are consistent
  - Phase scope matches PRD goals
  - DB changes follow naming conventions (group prefix, snake_case, `id`/timestamps)
  - Version bump is specified and correct (per `docs/guides/versioning.md`)
  - No contradictions between ADRs
- Output a structured report: `PASS` / `WARN` / `FAIL` per check with
  suggested fixes.

**Do NOT proceed to implementation until all checks PASS.**

---

### Skill: Build — New Phase or Feature

**Triggers when** documentation review has passed and the user confirms,
**or** the user explicitly asks to implement a specific phase/feature.

**Workflow:**

- Implement the code described in the phase doc.
- Follow hexagonal architecture rules strictly.
- On completion:
  - Move phase doc from `to-be-implemented/` to `implemented/v[version]/`.
  - Write an implementation summary in `implemented/v[version]/` covering:
    what was built, files created/modified, migrations run, known limitations.
  - Update `VERSION` file and root `package.json` `version` field
    (they must match).
  - Run `./validate.sh` and fix all failures before declaring done.

---

### Skill: Enhancement / Revision

**Triggers when** the user wants to change or extend something already built.

**Required clarifying questions:**

1. What's changing, and why?
2. Which entities / use cases are affected?
3. Are DB changes needed?
4. Is this a MINOR or PATCH bump?

**Workflow:**

- Generate an updated phase doc in `to-be-implemented/`.
- Route to the **Documentation Review** skill before building.

---

### Skill: Bug Fix

**Triggers when** the user reports something broken or not working as expected.

**Required clarifying questions:**

1. What's the symptom?
2. How do you reproduce it?
3. Which page / feature is affected?
4. Severity (blocker / major / minor)?

**Workflow:**

- Generate a bug-fix doc in `to-be-implemented/` with diagnosis and fix plan.
- Implement the fix.
- On completion:
  - Move doc to `implemented/v[version]/`.
  - Write an implementation summary.
  - Apply a PATCH version bump.
  - Run `./validate.sh`.

---

### Default — when no skill clearly applies

Ask the user:

> Is this planning/documentation, a review, an implementation, a change to
> existing functionality, or a bug fix?

Then route accordingly.

---

## Versioning

Tracked in `VERSION` and root `package.json` `version`. Both must always match.
`validate.sh` enforces this.

- **MAJOR** (x.0.0): Breaking API or domain changes
- **MINOR** (0.x.0): DB schema change, new phase, new feature
- **PATCH** (0.0.x): Bug fixes, UI tweaks, config changes with no schema impact

Starting version: `0.1.0`. Every code-writing skill must specify the version
bump in its implementation summary.

---

## Quick Reference

| If the user says…                          | Skill                       |
| ------------------------------------------ | --------------------------- |
| "let's plan…", "design a…", "I want to…"   | New App / Feature Setup     |
| "review the docs", "let's build this"      | Documentation Review        |
| "implement phase X", "build the spec"      | Build — New Phase / Feature |
| "change…", "extend…", "tweak…"             | Enhancement / Revision      |
| "broken", "not working", "should be doing" | Bug Fix                     |
| Anything else                              | Ask, then route             |

See `docs/guides/skills.md` to add a new skill.
