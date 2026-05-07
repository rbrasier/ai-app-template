import { errorRouter } from "./routers/error";
import { messageRouter } from "./routers/message";
import { userRouter } from "./routers/user";
import { router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  error: errorRouter,
  message: messageRouter,
});

export type AppRouter = typeof appRouter;
