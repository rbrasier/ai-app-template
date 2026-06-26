import {
  assignRoleInputSchema,
  createRoleInputSchema,
  deleteRoleInputSchema,
  updateRoleInputSchema,
} from "@rbrasier/shared";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "../trpc";

const codeFor = (errorCode: string): "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" => {
  if (errorCode === "NOT_FOUND") return "NOT_FOUND";
  if (errorCode === "ALREADY_EXISTS") return "CONFLICT";
  if (errorCode === "FORBIDDEN") return "FORBIDDEN";
  if (errorCode === "VALIDATION_FAILED") return "BAD_REQUEST";
  return "INTERNAL_SERVER_ERROR";
};

export const roleRouter = router({
  list: permissionProcedure("roles.read").query(async ({ ctx }) => {
    const result = await ctx.container.useCases.listRoles.execute();
    if (result.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
    return result.data;
  }),

  listPermissions: permissionProcedure("roles.read").query(async ({ ctx }) => {
    const result = await ctx.container.useCases.listPermissions.execute();
    if (result.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
    return result.data;
  }),

  create: permissionProcedure("roles.manage")
    .input(createRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.container.useCases.createRole.execute(input);
      if (result.error) throw new TRPCError({ code: codeFor(result.error.code), message: result.error.message });
      return result.data;
    }),

  update: permissionProcedure("roles.manage")
    .input(updateRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const result = await ctx.container.useCases.updateRole.execute(id, patch);
      if (result.error) throw new TRPCError({ code: codeFor(result.error.code), message: result.error.message });
      return result.data;
    }),

  delete: permissionProcedure("roles.manage")
    .input(deleteRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.container.useCases.deleteRole.execute(input.id);
      if (result.error) throw new TRPCError({ code: codeFor(result.error.code), message: result.error.message });
      return { ok: true };
    }),

  assignToUser: permissionProcedure("users.write")
    .input(assignRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.container.useCases.assignRoleToUser.execute(input.userId, input.roleId);
      if (result.error) throw new TRPCError({ code: codeFor(result.error.code), message: result.error.message });
      return { ok: true };
    }),

  removeFromUser: permissionProcedure("users.write")
    .input(assignRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.container.useCases.removeRoleFromUser.execute(input.userId, input.roleId);
      if (result.error) throw new TRPCError({ code: codeFor(result.error.code), message: result.error.message });
      return { ok: true };
    }),
});
