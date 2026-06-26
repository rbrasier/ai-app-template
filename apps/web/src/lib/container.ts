import {
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
  ListPermissions,
  ListRoles,
  ListUsers,
  LogAuditEvent,
  LogError,
  PingJob,
  RegisterJob,
  RemoveRoleFromUser,
  SendMessage,
  TrackUsage,
  UpdateErrorStatus,
  UpdateRole,
  UpdateUser,
  UpsertFeatureFlag,
} from "@rbrasier/application";
import {
  DrizzleAuditLogger,
  DrizzleConversationRepository,
  DrizzleErrorLogRepository,
  DrizzleErrorLogger,
  DrizzleFeatureFlagRepository,
  DrizzleJobRepository,
  DrizzlePermissionRepository,
  DrizzleRoleRepository,
  DrizzleUsageRepository,
  DrizzleUserRepository,
  LangGraphAgentRunner,
  LanguageModelAdapter,
  PinoLogger,
  PkiCertAdapter,
  createAuth,
  createDatabase,
  resolveSession,
  seedRbac,
  withOptionalLangfuse,
  withUsageTracking,
  type AuthMethodsConfig,
} from "@rbrasier/adapters";
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

  const baseLlm = new LanguageModelAdapter(env.AI_DEFAULT_PROVIDER);
  const llm = withOptionalLangfuse(withUsageTracking(baseLlm, usageRepo), env);
  const agent = new LangGraphAgentRunner(llm);

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

  const magicLinkEnabled =
    env.AUTH_METHOD === "magic-link" ||
    env.AUTH_METHOD === "pki-and-magic-link" ||
    env.AUTH_ENABLE_MAGIC_LINK;

  const authMethods: AuthMethodsConfig = {
    emailPassword: env.AUTH_METHOD === "email-password",
    magicLink: magicLinkEnabled ? { sendMagicLink } : undefined,
    entra:
      env.AUTH_ENABLE_ENTRA && env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET
        ? {
            tenantId: env.ENTRA_TENANT_ID,
            clientId: env.ENTRA_CLIENT_ID,
            clientSecret: env.ENTRA_CLIENT_SECRET,
          }
        : undefined,
  };

  const pkiCertAdapter =
    env.AUTH_METHOD === "pki" || env.AUTH_METHOD === "pki-and-magic-link"
      ? new PkiCertAdapter(db, users, pkiConfig)
      : null;

  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    adminSeedEmail: env.ADMIN_SEED_EMAIL,
    methods: authMethods,
  });

  return {
    env,
    db,
    auth,
    pkiCertAdapter,
    logger,
    resolveSession: (token: string) => resolveSession(db, token),
    seedRbac: () => seedRbac(db),
    services: { llm, agent, errorLogger, auditLogger },
    repos: { users, roles, permissions, conversations, errorLogs, featureFlags, usageRepo, jobRepo },
    useCases: {
      createUser: new CreateUser(users),
      updateUser: new UpdateUser(users),
      deleteUser: new DeleteUser(users),
      listUsers: new ListUsers(users),
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
      sendMessage: new SendMessage(llm, conversations),
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
