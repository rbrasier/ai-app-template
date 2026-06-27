import { describe, it, expect } from "vitest";
import {
  domainError,
  err,
  ok,
  type IMailer,
  type IUserRepository,
  type NewUser,
  type Result,
  type User,
  type UserUpdate,
} from "@rbrasier/domain";
import { ApproveUser } from "./approve-user";
import { RejectUser } from "./reject-user";
import { ListPendingUsers } from "./list-pending-users";

class InMemoryUsers implements IUserRepository {
  private byId = new Map<string, User>();

  async create(input: NewUser): Promise<Result<User>> {
    const now = new Date();
    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name ?? null,
      isAdmin: input.isAdmin ?? false,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(user.id, user);
    return ok(user);
  }
  async findById(id: string): Promise<Result<User | null>> {
    return ok(this.byId.get(id) ?? null);
  }
  async findByEmail(email: string): Promise<Result<User | null>> {
    return ok([...this.byId.values()].find((u) => u.email === email) ?? null);
  }
  async list(): Promise<Result<User[]>> {
    return ok([...this.byId.values()]);
  }
  async update(id: string, patch: UserUpdate): Promise<Result<User>> {
    const existing = this.byId.get(id);
    if (!existing) return err(domainError("NOT_FOUND", "missing"));
    const next: User = { ...existing, ...patch, updatedAt: new Date() };
    this.byId.set(id, next);
    return ok(next);
  }
  async delete(id: string): Promise<Result<true>> {
    this.byId.delete(id);
    return ok(true as const);
  }
}

class RecordingMailer implements IMailer {
  approvalNotices: string[] = [];
  async sendPasswordReset(): Promise<Result<true>> {
    return ok(true as const);
  }
  async sendApprovalNotice(input: { email: string }): Promise<Result<true>> {
    this.approvalNotices.push(input.email);
    return ok(true as const);
  }
}

describe("ListPendingUsers", () => {
  it("returns only users awaiting approval", async () => {
    const users = new InMemoryUsers();
    await users.create({ email: "active@x.com", status: "active" });
    await users.create({ email: "pending@x.com", status: "pending" });
    const result = await new ListPendingUsers(users).execute();
    expect(result.data?.map((u) => u.email)).toEqual(["pending@x.com"]);
  });
});

describe("ApproveUser", () => {
  it("activates a pending user and sends a notice", async () => {
    const users = new InMemoryUsers();
    const mailer = new RecordingMailer();
    const created = await users.create({ email: "p@x.com", status: "pending" });
    const result = await new ApproveUser(users, mailer).execute(created.data!.id);
    expect(result.data?.status).toBe("active");
    expect(mailer.approvalNotices).toEqual(["p@x.com"]);
  });

  it("returns NOT_FOUND for an unknown user", async () => {
    const result = await new ApproveUser(new InMemoryUsers(), new RecordingMailer()).execute(
      crypto.randomUUID(),
    );
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("RejectUser", () => {
  it("marks a pending user as rejected", async () => {
    const users = new InMemoryUsers();
    const created = await users.create({ email: "p@x.com", status: "pending" });
    const result = await new RejectUser(users).execute(created.data!.id);
    expect(result.data?.status).toBe("rejected");
  });
});
