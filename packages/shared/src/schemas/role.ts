import { z } from "zod";

const roleKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/, "Key must be lowercase letters, numbers, hyphens, or underscores.");

export const createRoleInputSchema = z.object({
  key: roleKey,
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  permissionKeys: z.array(z.string()).optional(),
});

export const updateRoleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionKeys: z.array(z.string()).optional(),
});

export const deleteRoleInputSchema = z.object({
  id: z.string().uuid(),
});

export const assignRoleInputSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;
export type DeleteRoleInput = z.infer<typeof deleteRoleInputSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleInputSchema>;
