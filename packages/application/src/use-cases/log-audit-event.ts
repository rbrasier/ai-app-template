import type { IAuditLogger, NewAuditLog, Result } from "@template/domain";

export class LogAuditEvent {
  constructor(private readonly logger: IAuditLogger) {}

  execute(payload: NewAuditLog): Promise<Result<true>> {
    return this.logger.log(payload);
  }
}
