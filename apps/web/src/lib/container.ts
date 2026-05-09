import {
  CreateUser,
  DeleteUser,
  FailJob,
  GetFeatureFlag,
  GetUsageSummary,
  ListErrors,
  ListFeatureFlags,
  ListJobs,
  ListUsers,
  LogAuditEvent,
  LogError,
  PingJob,
  RegisterJob,
  SendMessage,
  TrackUsage,
  UpdateErrorStatus,
  UpdateUser,
  UpsertFeatureFlag,
} from "@template/application";
import {
  DrizzleAuditLogger,
  DrizzleConversationRepository,
  DrizzleErrorLogRepository,
  DrizzleErrorLogger,
  DrizzleFeatureFlagRepository,
  DrizzleJobRepository,
  DrizzleUsageRepository,
  DrizzleUserRepository,
  LangGraphAgentRunner,
  LanguageModelAdapter,
  PinoLogger,
  createAuth,
  createDatabase,
  resolveSession,
  withOptionalLangfuse,
} from "@template/adapters";
import { serverEnv } from "./env";

let cached: ReturnType<typeof build> | null = null;

const build = () => {
  const env = serverEnv();
  const db = createDatabase(env.DATABASE_URL);
  const logger = new PinoLogger(env.NODE_ENV !== "production");

  const users = new DrizzleUserRepository(db);
  const conversations = new DrizzleConversationRepository(db);
  const errorLogs = new DrizzleErrorLogRepository(db);
  const errorLogger = new DrizzleErrorLogger(errorLogs);
  const auditLogger = new DrizzleAuditLogger(db);
  const featureFlags = new DrizzleFeatureFlagRepository(db);
  const usageRepo = new DrizzleUsageRepository(db);
  const jobRepo = new DrizzleJobRepository(db);

  const baseLlm = new LanguageModelAdapter(env.AI_DEFAULT_PROVIDER);
  const llm = withOptionalLangfuse(baseLlm, env);
  const agent = new LangGraphAgentRunner(llm);

  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    adminSeedEmail: env.ADMIN_SEED_EMAIL,
    sendMagicLink: async ({ email, url }) => {
      logger.info(`[auth] magic link for ${email}: ${url}`);
    },
  });

  return {
    env,
    db,
    auth,
    logger,
    resolveSession: (token: string) => resolveSession(db, token),
    services: { llm, agent, errorLogger, auditLogger },
    repos: { users, conversations, errorLogs, featureFlags, usageRepo, jobRepo },
    useCases: {
      createUser: new CreateUser(users),
      updateUser: new UpdateUser(users),
      deleteUser: new DeleteUser(users),
      listUsers: new ListUsers(users),
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
