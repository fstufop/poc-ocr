import { AnalysisContext } from '../interfaces/processor.interface';

export const MedicinesContext: AnalysisContext = {
  prompt: `Analise o conteúdo fornecido (receita médica em imagem, PDF ou áudio de relato de paciente).
Extraia todos os medicamentos mencionados.
Para cada medicamento, identifique: nome (comercial ou genérico), dosagem e frequência de uso.
Omita campos que não estejam claramente indicados no conteúdo — não invente informações.
Retorne apenas os dados encontrados.`,
  responseSchema: {
    type: 'object',
    properties: {
      medicines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do medicamento' },
            dosage: { type: 'string', description: 'Dosagem (ex: 500mg)' },
            frequency: {
              type: 'string',
              description: 'Frequência (ex: 8h, 1x ao dia)',
            },
          },
          required: ['name'],
        },
      },
    },
    required: ['medicines'],
  },
};
