import { settingsUpdateSchema } from "@rbrasier/shared";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "../trpc";

const manageSettings = permissionProcedure("settings.manage");

export const settingsRouter = router({
  // Returns settings with secrets redacted to set/unset — plaintext never leaves
  // the server.
  get: manageSettings.query(async ({ ctx }) => {
    const result = await ctx.container.settingsService.getRedacted();
    if (result.error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
    }
    return result.data;
  }),

  update: manageSettings.input(settingsUpdateSchema).mutation(async ({ ctx, input }) => {
    const result = await ctx.container.settingsService.update(input);
    if (result.error) {
      const code = result.error.code === "VALIDATION_FAILED" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR";
      throw new TRPCError({ code, message: result.error.message });
    }
    const redacted = await ctx.container.settingsService.getRedacted();
    if (redacted.error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: redacted.error.message });
    }
    return redacted.data;
  }),
});
