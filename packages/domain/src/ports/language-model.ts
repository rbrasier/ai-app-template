import type { Result } from "../result.js";

export type ProviderName = "anthropic" | "openai" | "mistral";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface GenerateObjectInput<TSchema = unknown> {
  readonly model?: string;
  readonly system?: string;
  readonly prompt?: string;
  readonly messages?: ChatMessage[];
  readonly schema: TSchema;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface StreamTextInput {
  readonly model?: string;
  readonly system?: string;
  readonly prompt?: string;
  readonly messages?: ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface StreamObjectInput<TSchema = unknown> {
  readonly model?: string;
  readonly system?: string;
  readonly prompt?: string;
  readonly messages?: ChatMessage[];
  readonly schema: TSchema;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

/**
 * Provider-agnostic language model port.
 *
 * `TStream` and `TObjectStream` are intentionally generic so adapters can
 * return whatever streaming primitive their underlying SDK exposes
 * (e.g. ReadableStream, AsyncIterable). Application code consumes them
 * through small helper utilities, never by importing an SDK type.
 */
export interface ILanguageModel {
  readonly provider: ProviderName;

  generateObject<T>(
    input: GenerateObjectInput,
  ): Promise<Result<{ object: T }>>;

  streamText(
    input: StreamTextInput,
  ): Promise<Result<{ textStream: AsyncIterable<string> }>>;

  streamObject<T>(
    input: StreamObjectInput,
  ): Promise<
    Result<{
      partialObjectStream: AsyncIterable<Partial<T>>;
      object: Promise<T>;
    }>
  >;
}
