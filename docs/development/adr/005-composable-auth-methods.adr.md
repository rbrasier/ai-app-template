# ADR-005 — Composable Auth Methods (email+password base, magic-link & Entra options)

- **Status**: Accepted
- **Date**: 2026-06-26

## Context

`createAuth` (`packages/adapters/src/auth/better-auth.ts`) takes a single
`AuthMethod` discriminated union: `magic-link | pki | pki-and-magic-link |
google-oauth | other | none`. Each value selects exactly one strategy. This
cannot express the requirement that **email+password is the default and
magic-link and/or Entra are additive options enabled at the same time**. The
`google-oauth` member is a stub that throws.

Better Auth supports running several credential and social strategies
concurrently: `emailAndPassword` is a core config block, `magicLink` and
`genericOAuth` are plugins. The blocker is purely the template's own
single-choice wiring, plus a missing `account` table (Better Auth stores
password hashes and OAuth tokens in its `account` model, which the schema does
not yet define).

Entra (Microsoft Azure AD) exposes standards-compliant **OpenID Connect**
discovery at
`https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`.
Better Auth's `genericOAuth` plugin consumes a discovery URL directly. A SAML
path would require a separate provider and certificate management for no benefit
here.

## Decision

Replace the single-choice union with a **composable auth configuration** and add
the missing account table.

- `AUTH_METHOD` default changes from `magic-link` to **`email-password`** and
  the enum gains `email-password`. Existing values (`magic-link`, `pki`,
  `pki-and-magic-link`, `none`, `other`) are retained for backward compatibility.
- Additive options are independent booleans, valid when the base method is a
  credential method (`email-password`):
  - `AUTH_ENABLE_MAGIC_LINK` (default `false`)
  - `AUTH_ENABLE_ENTRA` (default `false`)
- `createAuth` accepts a structured config describing which strategies to wire:

  ```typescript
  interface AuthMethodsConfig {
    readonly emailPassword: boolean;
    readonly magicLink?: { sendMagicLink: (p: { email: string; url: string }) => Promise<void> };
    readonly entra?: { clientId: string; clientSecret: string; discoveryUrl: string };
    readonly pki?: PkiConfig;
  }
  ```

  The legacy `AuthMethod` union is mapped into this config by the container, so
  PKI and `none` paths are unaffected.
- **Entra is OIDC via `genericOAuth`**, `providerId = "entra"`, configured from
  `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, and a discovery URL derived from
  `ENTRA_TENANT_ID` (or an explicit `ENTRA_DISCOVERY_URL` override).
- Add a **`core_accounts`** table mapped to Better Auth's `account` model
  (password hash for credential sign-in; tokens for OAuth). This unblocks both
  email+password and Entra.
- `google-oauth` stays a throwing stub; it is not part of this work.

## Consequences

**Positive**

- A project enables any combination of email+password, magic-link, and Entra
  through environment configuration alone.
- PKI and `none` deployments are untouched — the container maps them onto the
  new config.
- OIDC keeps the adapter thin; swapping Entra for any other OIDC provider is an
  env change, not code.

**Negative**

- A schema migration is required (`core_accounts`), and existing users have no
  account row until they set a password or link a provider.
- `createAuth`'s input shape changes; the container and any direct callers must
  be updated in the same phase.
- More env vars and more validation (Entra vars required only when
  `AUTH_ENABLE_ENTRA=true`).

## Enforcement

- `apps/web/src/lib/env.ts` validates the new vars and makes Entra vars required
  only when Entra is enabled (zod refinement).
- The Build step must verify the exact `emailAndPassword`, `genericOAuth`, and
  Drizzle account-model field-mapping APIs in `node_modules/better-auth` — not
  from memory — per the project's third-party-API rule.
- Result pattern preserved at adapter boundaries; auth strategy selection stays
  inside `packages/adapters`, wired from the app container only.
