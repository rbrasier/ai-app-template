import {
  domainError,
  err,
  ok,
  type GenerateObjectInput,
  type ILanguageModel,
  type ProviderName,
  type Result,
  type StreamObjectInput,
  type StreamTextInput,
} from "@template/domain";
import { generateObject, streamObject, streamText } from "ai";
import { resolveModel } from "./providers";

export class LanguageModelAdapter implements ILanguageModel {
  constructor(public readonly provider: ProviderName) {}

  async generateObject<T>(input: GenerateObjectInput): Promise<Result<{ object: T }>> {
    try {
      const result = await generateObject({
        model: resolveModel(this.provider, input.model),
        schema: input.schema as never,
        system: input.system,
        prompt: input.prompt,
        messages: input.messages as never,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      return ok({ object: result.object as T });
    } catch (cause) {
      return err(domainError("AI_PROVIDER_FAILED", "generateObject failed.", cause));
    }
  }

  async streamText(
    input: StreamTextInput,
  ): Promise<Result<{ textStream: AsyncIterable<string> }>> {
    try {
      const result = streamText({
        model: resolveModel(this.provider, input.model),
        system: input.system,
        prompt: input.prompt,
        messages: input.messages as never,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      return ok({ textStream: result.textStream });
    } catch (cause) {
      return err(domainError("AI_PROVIDER_FAILED", "streamText failed.", cause));
    }
  }

  async streamObject<T>(
    input: StreamObjectInput,
  ): Promise<
    Result<{
      partialObjectStream: AsyncIterable<Partial<T>>;
      object: Promise<T>;
    }>
  > {
    try {
      const result = streamObject({
        model: resolveModel(this.provider, input.model),
        schema: input.schema as never,
        system: input.system,
        prompt: input.prompt,
        messages: input.messages as never,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      return ok({
        partialObjectStream: result.partialObjectStream as AsyncIterable<Partial<T>>,
        object: result.object as Promise<T>,
      });
    } catch (cause) {
      return err(domainError("AI_PROVIDER_FAILED", "streamObject failed.", cause));
    }
  }
}
