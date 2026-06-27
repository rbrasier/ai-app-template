import type { Result } from "../result";

/**
 * Transactional mail for the auth front door. The default adapter logs instead
 * of sending; real SMTP wiring is out of scope. Returns Result so a delivery
 * failure never throws across the boundary.
 */
export interface IMailer {
  sendPasswordReset(input: { email: string; url: string }): Promise<Result<true>>;
  sendApprovalNotice(input: { email: string }): Promise<Result<true>>;
}
