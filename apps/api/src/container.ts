import {
  CreateUser,
  DeleteUser,
  ListErrors,
  ListUsers,
  LogError,
  UpdateErrorStatus,
  UpdateUser,
} from "@template/application";
import {
  DrizzleConversationRepository,
  DrizzleErrorLogRepository,
  DrizzleErrorLogger,
  DrizzleUserRepository,
  LanguageModelAdapter,
  createDatabase,
  withOptionalLangfuse,
} from "@template/adapters";
import type { Env } from "./env.js";

export const buildContainer = (env: Env) => {
  const db = createDatabase(env.DATABASE_URL);

  const users = new DrizzleUserRepository(db);
  const conversations = new DrizzleConversationRepository(db);
  const errorLogs = new DrizzleErrorLogRepository(db);
  const errorLogger = new DrizzleErrorLogger(errorLogs);

  const baseLlm = new LanguageModelAdapter(env.AI_DEFAULT_PROVIDER);
  const llm = withOptionalLangfuse(baseLlm, env);

  return {
    env,
    db,
    repos: { users, conversations, errorLogs },
    services: { llm, errorLogger },
    useCases: {
      createUser: new CreateUser(users),
      updateUser: new UpdateUser(users),
      deleteUser: new DeleteUser(users),
      listUsers: new ListUsers(users),
      logError: new LogError(errorLogger),
      listErrors: new ListErrors(errorLogs),
      updateErrorStatus: new UpdateErrorStatus(errorLogs),
    },
  };
};

export type Container = ReturnType<typeof buildContainer>;
