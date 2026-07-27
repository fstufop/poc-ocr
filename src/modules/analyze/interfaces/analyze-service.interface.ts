import { MedicinesAnalysisDto } from '../dto/medicines-analysis.dto';
import { VaccinesAnalysisDto } from '../dto/vaccines-analysis.dto';

export const ANALYZE_SERVICE = Symbol('ANALYZE_SERVICE');

export interface IAnalyzeService {
  analyzeMedicines(file: Express.Multer.File): Promise<MedicinesAnalysisDto>;
  analyzeVaccines(file: Express.Multer.File): Promise<VaccinesAnalysisDto>;
}
