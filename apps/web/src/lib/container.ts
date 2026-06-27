import {
  ApproveUser,
  AssignRoleToUser,
  CreateRole,
  CreateUser,
  DeleteRole,
  DeleteUser,
  FailJob,
  GetFeatureFlag,
  GetUsageSummary,
  GetUserPermissions,
  ListErrors,
  ListFeatureFlags,
  ListJobs,
  ListPendingUsers,
  ListPermissions,
  ListRoles,
  ListUsers,
  LogAuditEvent,
  LogError,
  PingJob,
  RegisterJob,
  RejectUser,
  RemoveRoleFromUser,
  SendMessage,
  SettingsService,
  TrackUsage,
  UpdateErrorStatus,
  UpdateRole,
  UpdateUser,
  UpsertFeatureFlag,
} from "@rbrasier/application";
import {
  AesSecretCipher,
  DrizzleAuditLogger,
  DrizzleConversationRepository,
  DrizzleErrorLogRepository,
  DrizzleErrorLogger,
  DrizzleFeatureFlagRepository,
  DrizzleJobRepository,
  DrizzlePermissionRepository,
  DrizzleRoleRepository,
  DrizzleSettingsRepository,
  DrizzleUsageRepository,
  DrizzleUserRepository,
  LangGraphAgentRunner,
  LanguageModelAdapter,
  LoggingMailer,
  PinoLogger,
  PkiCertAdapter,
  createAuth,
  createDatabase,
  resolveSession,
  seedRbac,
  seedSettings,
  withOptionalLangfuse,
  withUsageTracking,
  type Auth,
  type AuthMethodsConfig,
} from "@rbrasier/adapters";
import { defaultAppSettings } from "@rbrasier/shared";
import { randomBytes } from "node:crypto";
import { serverEnv } from "./env";

let cached: ReturnType<typeof build> | null = null;

const build = () => {
  const env = serverEnv();
  const db = createDatabase(env.DATABASE_URL);
  const logger = new PinoLogger(env.NODE_ENV !== "production");

  const users = new DrizzleUserRepository(db);
  const roles = new DrizzleRoleRepository(db);
  const permissions = new DrizzlePermissionRepository(db);
  const conversations = new DrizzleConversationRepository(db);
  const errorLogs = new DrizzleErrorLogRepository(db);
  const errorLogger = new DrizzleErrorLogger(errorLogs);
  const auditLogger = new DrizzleAuditLogger(db);
  const featureFlags = new DrizzleFeatureFlagRepository(db);
  const usageRepo = new DrizzleUsageRepository(db);
  const jobRepo = new DrizzleJobRepository(db);

  // Settings store: env seeds and is the fallback; the DB row overrides per ADR-007.
  const settingsRepository = new DrizzleSettingsRepository(db);
  const mailer = new LoggingMailer(logger);
  const encryptionKey =
    env.APP_SETTINGS_ENCRYPTION_KEY ??
    (() => {
      // Dev-only ephemeral key: secrets do not survive a restart, which is fine
      // locally. Production validation requires the key to be set explicitly.
      logger.warn("[settings] APP_SETTINGS_ENCRYPTION_KEY unset — using an ephemeral dev key.");
      return randomBytes(32).toString("base64");
    })();
  const cipher = AesSecretCipher.fromBase64Key(encryptionKey);
  const settingsService = new SettingsService(
    settingsRepository,
    cipher,
    defaultAppSettings(env),
    { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, mistral: env.MISTRAL_API_KEY },
  );

  // Decorated language model built from the env default provider. The chat path
  // resolves a fresh instance per request from settings (see resolveSendMessage).
  const decorateLlm = (provider: typeof env.AI_DEFAULT_PROVIDER, apiKey?: string) =>
    withOptionalLangfuse(withUsageTracking(new LanguageModelAdapter(provider, apiKey), usageRepo), env);

  const llm = decorateLlm(env.AI_DEFAULT_PROVIDER);
  const agent = new LangGraphAgentRunner(llm);

  // Builds a SendMessage whose model + key come from the live settings store, so
  // a provider/key change in /admin/settings takes effect on the next request.
  const resolveSendMessage = async (): Promise<SendMessage> => {
    const settings = await settingsService.get();
    const provider = settings.data?.ai.provider ?? env.AI_DEFAULT_PROVIDER;
    const key = await settingsService.resolveApiKey(provider);
    return new SendMessage(decorateLlm(provider, key.data ?? undefined), conversations);
  };

  const pkiConfig = {
    trustedProxyIps: (env.PKI_TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
    sessionTtlHours: env.PKI_SESSION_TTL_HOURS,
  };

  const sendMagicLink = async ({ email, url }: { email: string; url: string }) => {
    logger.info(`[auth] magic link for ${email}: ${url}`);
  };

  const buildAuthMethods = (
    authSettings: ReturnType<typeof defaultAppSettings>["auth"],
  ): AuthMethodsConfig => {
    const magicLinkEnabled =
      authSettings.method === "magic-link" ||
      authSettings.method === "pki-and-magic-link" ||
      authSettings.enableMagicLink;
    return {
      emailPassword: authSettings.method === "email-password",
      magicLink: magicLinkEnabled ? { sendMagicLink } : undefined,
      entra:
        authSettings.enableEntra &&
        env.ENTRA_TENANT_ID &&
        env.ENTRA_CLIENT_ID &&
        env.ENTRA_CLIENT_SECRET
          ? {
              tenantId: env.ENTRA_TENANT_ID,
              clientId: env.ENTRA_CLIENT_ID,
              clientSecret: env.ENTRA_CLIENT_SECRET,
            }
          : undefined,
    };
  };

  // PKI is env-managed (out of the settings store), so it stays bound to AUTH_METHOD.
  const pkiCertAdapter =
    env.AUTH_METHOD === "pki" || env.AUTH_METHOD === "pki-and-magic-link"
      ? new PkiCertAdapter(db, users, pkiConfig)
      : null;

  // Better Auth is built from the live settings and rebuilt lazily when the
  // settings version changes, so an auth-method/approval change needs no redeploy.
  let authInstance: Auth | null = null;
  let authBuiltVersion = -1;
  const getAuth = async (): Promise<Auth> => {
    const settings = await settingsService.get();
    const authSettings = settings.data?.auth ?? defaultAppSettings(env).auth;
    const version = settingsService.version();
    if (authInstance && authBuiltVersion === version) return authInstance;
    authInstance = createAuth(db, {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      adminSeedEmail: env.ADMIN_SEED_EMAIL,
      methods: buildAuthMethods(authSettings),
      allowRegistrationWithoutApproval: authSettings.allowRegistrationWithoutApproval,
      sendPasswordReset: async (input: { email: string; url: string }) => {
        await mailer.sendPasswordReset(input);
      },
    });
    authBuiltVersion = version;
    return authInstance;
  };

  return {
    env,
    db,
    getAuth,
    pkiCertAdapter,
    logger,
    settingsService,
    resolveSession: (token: string) => resolveSession(db, token),
    resolveSendMessage,
    seedRbac: () => seedRbac(db),
    seedSettings: () =>
      seedSettings(settingsRepository, cipher, {
        AUTH_METHOD: env.AUTH_METHOD,
        AUTH_ENABLE_MAGIC_LINK: env.AUTH_ENABLE_MAGIC_LINK,
        AUTH_ENABLE_ENTRA: env.AUTH_ENABLE_ENTRA,
        AI_DEFAULT_PROVIDER: env.AI_DEFAULT_PROVIDER,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        MISTRAL_API_KEY: env.MISTRAL_API_KEY,
      }),
    services: { llm, agent, errorLogger, auditLogger },
    repos: { users, roles, permissions, conversations, errorLogs, featureFlags, usageRepo, jobRepo },
    useCases: {
      createUser: new CreateUser(users),
      updateUser: new UpdateUser(users),
      deleteUser: new DeleteUser(users),
      listUsers: new ListUsers(users),
      listPendingUsers: new ListPendingUsers(users),
      approveUser: new ApproveUser(users, mailer),
      rejectUser: new RejectUser(users),
      listRoles: new ListRoles(roles),
      createRole: new CreateRole(roles),
      updateRole: new UpdateRole(roles),
      deleteRole: new DeleteRole(roles),
      assignRoleToUser: new AssignRoleToUser(roles),
      removeRoleFromUser: new RemoveRoleFromUser(roles),
      getUserPermissions: new GetUserPermissions(roles),
      listPermissions: new ListPermissions(permissions),
      logError: new LogError(errorLogger),
      listErrors: new ListErrors(errorLogs),
      updateErrorStatus: new UpdateErrorStatus(errorLogs),
      logAuditEvent: new LogAuditEvent(auditLogger),
      getFeatureFlag: new GetFeatureFlag(featureFlags),
      upsertFeatureFlag: new UpsertFeatureFlag(featureFlags),
      listFeatureFlags: new ListFeatureFlags(featureFlags),
      trackUsage: new TrackUsage(usageRepo),
      getUsageSummary: new GetUsageSummary(usageRepo),
      registerJob: new RegisterJob(jobRepo),
      pingJob: new PingJob(jobRepo),
      failJob: new FailJob(jobRepo),
      listJobs: new ListJobs(jobRepo),
    },
  };
};

export const getContainer = () => {
  if (cached) return cached;
  cached = build();
  return cached;
};

export type Container = ReturnType<typeof getContainer>;
