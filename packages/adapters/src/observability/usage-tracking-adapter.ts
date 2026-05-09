import type {
  GenerateObjectInput,
  ILanguageModel,
  IUsageRepository,
  ProviderName,
  Result,
  StreamObjectInput,
  StreamTextInput,
} from "@template/domain";

const TOKEN_COST_USD: Record<string, { prompt: number; completion: number }> = {
  "claude-opus-4-7": { prompt: 0.000015, completion: 0.000075 },
  "claude-sonnet-4-6": { prompt: 0.000003, completion: 0.000015 },
  "claude-haiku-4-5": { prompt: 0.00000025, completion: 0.00000125 },
  "gpt-4o": { prompt: 0.000005, completion: 0.000015 },
  "gpt-4o-mini": { prompt: 0.00000015, completion: 0.0000006 },
  "mistral-large-latest": { prompt: 0.000003, completion: 0.000009 },
};

const estimateCost = (model: string, promptTokens: number, completionTokens: number): number => {
  const rates = TOKEN_COST_USD[model];
  if (!rates) return 0;
  return rates.prompt * promptTokens + rates.completion * completionTokens;
};

export class UsageTrackingAdapter implements ILanguageModel {
  constructor(
    private readonly inner: ILanguageModel,
    private readonly usageRepo: IUsageRepository,
    private readonly context?: { userId?: string; conversationId?: string },
  ) {}

  get provider(): ProviderName {
    return this.inner.provider;
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<Result<{ object: T }>> {
    const result = await this.inner.generateObject<T>(input);
    if (!result.error && input.model) {
      const promptTokens = (result as { usage?: { promptTokens: number } }).usage?.promptTokens ?? 0;
      const completionTokens =
        (result as { usage?: { completionTokens: number } }).usage?.completionTokens ?? 0;
      void this.usageRepo.create({
        userId: this.context?.userId,
        conversationId: this.context?.conversationId,
        provider: this.provider,
        model: input.model,
        promptTokens,
        completionTokens,
        costUsd: estimateCost(input.model, promptTokens, completionTokens),
      });
    }
    return result;
  }

  streamText(input: StreamTextInput): Promise<Result<{ textStream: AsyncIterable<string> }>> {
    return this.inner.streamText(input);
  }

  streamObject<T>(
    input: StreamObjectInput,
  ): Promise<
    Result<{ partialObjectStream: AsyncIterable<Partial<T>>; object: Promise<T> }>
  > {
    return this.inner.streamObject<T>(input);
  }
}

export const withUsageTracking = (
  inner: ILanguageModel,
  usageRepo: IUsageRepository,
  context?: { userId?: string; conversationId?: string },
): ILanguageModel => new UsageTrackingAdapter(inner, usageRepo, context);
