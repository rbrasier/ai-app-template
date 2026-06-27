import { ok, type ILogger, type IMailer, type Result } from "@rbrasier/domain";

/**
 * Default mailer: logs instead of sending. Real SMTP wiring is out of scope —
 * swap this for a transport-backed implementation behind the same port.
 */
export class LoggingMailer implements IMailer {
  constructor(private readonly logger: ILogger) {}

  async sendPasswordReset(input: { email: string; url: string }): Promise<Result<true>> {
    this.logger.info(`[mail] password reset for ${input.email}: ${input.url}`);
    return ok(true as const);
  }

  async sendApprovalNotice(input: { email: string }): Promise<Result<true>> {
    this.logger.info(`[mail] account approved for ${input.email}`);
    return ok(true as const);
  }
}
