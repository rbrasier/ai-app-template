import {
  CreateUser,
  DeleteUser,
  ListErrors,
  ListUsers,
  LogError,
  SendMessage,
  UpdateErrorStatus,
  UpdateUser,
} from "@template/application";
import {
  DrizzleConversationRepository,
  DrizzleErrorLogRepository,
  DrizzleErrorLogger,
  DrizzleUserRepository,
  LangGraphAgentRunner,
  LanguageModelAdapter,
  createAuth,
  createDatabase,
  withOptionalLangfuse,
} from "@template/adapters";
import { serverEnv } from "./env.js";

let cached: ReturnType<typeof build> | null = null;

const build = () => {
  const env = serverEnv();
  const db = createDatabase(env.DATABASE_URL);

  const users = new DrizzleUserRepository(db);
  const conversations = new DrizzleConversationRepository(db);
  const errorLogs = new DrizzleErrorLogRepository(db);
  const errorLogger = new DrizzleErrorLogger(errorLogs);

  const baseLlm = new LanguageModelAdapter(env.AI_DEFAULT_PROVIDER);
  const llm = withOptionalLangfuse(baseLlm, env);
  const agent = new LangGraphAgentRunner(llm);

  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    adminSeedEmail: env.ADMIN_SEED_EMAIL,
    sendMagicLink: async ({ email, url }) => {
      // eslint-disable-next-line no-console
      console.log(`[auth] magic link for ${email}: ${url}`);
    },
  });

  return {
    env,
    db,
    auth,
    services: { llm, agent, errorLogger },
    repos: { users, conversations, errorLogs },
    useCases: {
      createUser: new CreateUser(users),
      updateUser: new UpdateUser(users),
      deleteUser: new DeleteUser(users),
      listUsers: new ListUsers(users),
      logError: new LogError(errorLogger),
      listErrors: new ListErrors(errorLogs),
      updateErrorStatus: new UpdateErrorStatus(errorLogs),
      sendMessage: new SendMessage(llm, conversations),
    },
  };
};

export const getContainer = () => {
  if (cached) return cached;
  cached = build();
  return cached;
};

export type Container = ReturnType<typeof getContainer>;
