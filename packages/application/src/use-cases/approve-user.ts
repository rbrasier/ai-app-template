import {
  type IMailer,
  type IUserRepository,
  type Result,
  type User,
  domainError,
  err,
} from "@rbrasier/domain";

export class ApproveUser {
  constructor(
    private readonly users: IUserRepository,
    private readonly mailer: IMailer,
  ) {}

  async execute(id: string): Promise<Result<User>> {
    const found = await this.users.findById(id);
    if (found.error) return found;
    if (!found.data) return err(domainError("NOT_FOUND", `User ${id} not found.`));

    const updated = await this.users.update(id, { status: "active" });
    if (updated.error) return updated;

    // Best-effort: a failed notice must not undo an approval.
    await this.mailer.sendApprovalNotice({ email: updated.data.email });
    return updated;
  }
}
