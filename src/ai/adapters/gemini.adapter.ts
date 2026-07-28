import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AIAnalysisInput,
  AIProviderPort,
  TokenUsage,
} from '../ai-provider.port';

@Injectable()
export class GeminiAdapter implements AIProviderPort {
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: this.config.get<string>('GEMINI_API_KEY'),
    });
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-1.5-flash');
    this.timeoutMs = this.config.get<number>('AI_TIMEOUT_MS', 30000);
  }

  async analyze<T>(
    input: AIAnalysisInput,
  ): Promise<{ data: T; tokenUsage: TokenUsage }> {
    const base64 = input.fileBuffer.toString('base64');

    const responsePromise = this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: input.mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: input.responseSchema,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new GatewayTimeoutException('AI provider timed out')),
        this.timeoutMs,
      ),
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);

    if (!response.text) {
      throw new BadGatewayException(
        'AI provider returned an unexpected response',
      );
    }

    this.logger.debug(`Gemini raw response: ${response.text.slice(0, 120)}`);

    const usage = response.usageMetadata;
    const tokenUsage: TokenUsage = {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };

    return { data: JSON.parse(response.text) as T, tokenUsage };
  }
}
