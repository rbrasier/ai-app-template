import { hasPermission } from "@rbrasier/domain";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getContainer, type Container } from "@/lib/container";

export interface TrpcContext {
  readonly container: Container;
  readonly userId: string | null;
  readonly isAdmin: boolean;
  readonly permissions: readonly string[];
  readonly headers: Headers;
}

const getSessionToken = (req: Request): string | null => {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const pair = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("better-auth.session_token="));
  return pair ? pair.slice("better-auth.session_token=".length) : null;
};

export const createTrpcContext = async (req: Request): Promise<TrpcContext> => {
  const container = getContainer();

  let userId: string | null = null;
  let isAdmin = false;
  let permissions: readonly string[] = [];

  const token = getSessionToken(req);
  if (token) {
    const session = await container.resolveSession(token);
    if (session) {
      userId = session.userId;
      isAdmin = session.isAdmin;
      // Admins are a wildcard — skip the lookup; non-admins get their roles' union.
      if (!isAdmin) {
        const resolved = await container.useCases.getUserPermissions.execute(session.userId);
        if (resolved.data) permissions = resolved.data;
      }
    }
  }

  return { container, userId, isAdmin, permissions, headers: req.headers };
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

/**
 * Gate a procedure behind a single capability. Admins pass unconditionally
 * (immutable wildcard); everyone else must hold the permission via a role.
 */
export const permissionProcedure = (permissionKey: string) =>
  publicProcedure.use(({ ctx, next }) => {
    if (!hasPermission(ctx.isAdmin, ctx.permissions, permissionKey)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Requires permission: ${permissionKey}.` });
    }
    return next();
  });
