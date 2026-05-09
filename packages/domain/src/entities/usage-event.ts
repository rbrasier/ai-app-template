export interface UsageEvent {
  readonly id: string;
  readonly userId: string | null;
  readonly conversationId: string | null;
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewUsageEvent {
  readonly userId?: string | null;
  readonly conversationId?: string | null;
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly metadata?: Record<string, unknown> | null;
}

export interface UsageSummary {
  readonly provider: string;
  readonly model: string;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalCostUsd: number;
  readonly eventCount: number;
}
