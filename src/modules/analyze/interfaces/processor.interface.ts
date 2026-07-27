export interface AnalysisContext {
  prompt: string;
  responseSchema: object;
}

export interface IProcessor {
  extract<T>(file: Express.Multer.File, context: AnalysisContext): Promise<T>;
}
