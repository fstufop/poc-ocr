export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AIAnalysisInput {
  fileBuffer: Buffer;
  mimeType: string;
  prompt: string;
  responseSchema: object;
}

export interface AIProviderPort {
  analyze<T>(input: AIAnalysisInput): Promise<T>;
}
