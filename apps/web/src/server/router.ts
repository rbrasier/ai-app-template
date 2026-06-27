import { errorRouter } from "./routers/error";
import { featureFlagRouter } from "./routers/feature-flag";
import { messageRouter } from "./routers/message";
import { roleRouter } from "./routers/role";
import { settingsRouter } from "./routers/settings";
import { usageRouter } from "./routers/usage";
import { userRouter } from "./routers/user";
import { router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  role: roleRouter,
  error: errorRouter,
  message: messageRouter,
  featureFlag: featureFlagRouter,
  usage: usageRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
