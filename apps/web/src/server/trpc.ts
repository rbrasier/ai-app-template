import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getContainer, type Container } from "@/lib/container";

export interface TrpcContext {
  readonly container: Container;
  readonly userId: string | null;
  readonly isAdmin: boolean;
  readonly headers: Headers;
}

export const createTrpcContext = async (req: Request): Promise<TrpcContext> => {
  const container = getContainer();
  // Better Auth session resolution — wire up as needed.
  // For now, anonymous by default; admin gates check container.auth in middleware.
  return {
    container,
    userId: null,
    isAdmin: false,
    headers: req.headers,
  };
};

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

const errorLogging = t.middleware(async ({ ctx, path, type, next }) => {
  const result = await next();
  if (!result.ok) {
    void ctx.container.services.errorLogger.log({
      level: "error",
      message: result.error.message,
      stack: result.error.stack ?? null,
      page: `trpc:${type}:${path}`,
      metadata: { code: result.error.code },
    });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(errorLogging);

export const adminProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only." });
  }
  return next();
});
