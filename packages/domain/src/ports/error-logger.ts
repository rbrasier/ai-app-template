import type { ErrorLogLevel } from "../entities/error-log.js";
import type { Result } from "../result.js";

export interface ErrorLogPayload {
  readonly level: ErrorLogLevel;
  readonly message: string;
  readonly stack?: string | null;
  readonly userId?: string | null;
  readonly page?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface IErrorLogger {
  log(payload: ErrorLogPayload): Promise<Result<true>>;
}
