---
"@rbrasier/domain": minor
"@rbrasier/shared": minor
"@rbrasier/application": minor
"@rbrasier/adapters": minor
"@rbrasier/web": minor
"create-ai-app-template": minor
---

Auth methods, RBAC, and navigation progress.

- Auth: email+password is the new default, with magic-link and Microsoft Entra
  (Azure AD OIDC) as additive options that can run alongside it. Adds the
  Better Auth `core_accounts` table and snake_case field mapping.
- RBAC: roles and capability-flag permissions. Seeds `everyone` and `admin`
  (admin is an immutable wildcard sourced from `is_admin`). Admin UI at
  `/admin/roles` to create custom roles; tRPC `permissionProcedure` gating.
- Navigation: a 2px top progress bar shown during prefetch-before-navigation.
- Both installers (`init-project.sh` and `create-ai-app-template`) prompt for
  the new auth options.
