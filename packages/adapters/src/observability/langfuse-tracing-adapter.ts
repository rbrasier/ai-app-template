import type {
  GenerateObjectInput,
  ILanguageModel,
  ProviderName,
  Result,
  StreamObjectInput,
  StreamTextInput,
} from "@template/domain";
import { Langfuse } from "langfuse";

export interface LangfuseConfig {
  readonly publicKey: string;
  readonly secretKey: string;
  readonly host?: string;
}

/**
 * Decorates an ILanguageModel with Langfuse traces.
 * Only enabled if both keys are present — see `withOptionalLangfuse`.
 */
export class LangfuseTracingAdapter implements ILanguageModel {
  private readonly client: Langfuse;

  constructor(
    private readonly inner: ILanguageModel,
    config: LangfuseConfig,
  ) {
    this.client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.host,
    });
  }

  get provider(): ProviderName {
    return this.inner.provider;
  }

  private async traced<T>(
    name: string,
    input: unknown,
    fn: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const trace = this.client.trace({ name, input: input as Record<string, unknown> });
    const start = Date.now();
    const result = await fn();
    trace.update({
      output: result.error
        ? { error: result.error.code, message: result.error.message }
        : { ok: true },
      metadata: { latencyMs: Date.now() - start, provider: this.provider },
    });
    return result;
  }

  generateObject<T>(input: GenerateObjectInput) {
    return this.traced<{ object: T }>("generateObject", input, () =>
      this.inner.generateObject<T>(input),
    );
  }

  streamText(input: StreamTextInput) {
    return this.traced<{ textStream: AsyncIterable<string> }>("streamText", input, () =>
      this.inner.streamText(input),
    );
  }

  streamObject<T>(input: StreamObjectInput) {
    return this.traced<{
      partialObjectStream: AsyncIterable<Partial<T>>;
      object: Promise<T>;
    }>("streamObject", input, () => this.inner.streamObject<T>(input));
  }
}

/**
 * Wrap an ILanguageModel with Langfuse only when both keys are configured.
 * Otherwise returns the inner model unchanged — observability is opt-in.
 */
export const withOptionalLangfuse = (
  inner: ILanguageModel,
  env: { LANGFUSE_PUBLIC_KEY?: string; LANGFUSE_SECRET_KEY?: string; LANGFUSE_HOST?: string },
): ILanguageModel => {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return inner;
  return new LangfuseTracingAdapter(inner, {
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    host: env.LANGFUSE_HOST,
  });
};
