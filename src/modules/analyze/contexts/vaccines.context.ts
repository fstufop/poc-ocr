import { AnalysisContext } from '../interfaces/processor.interface';

export const VaccinesContext: AnalysisContext = {
  prompt: `Analise o conteúdo fornecido (carteira de vacinação em imagem, PDF ou áudio de relato de paciente).
Extraia todas as vacinas mencionadas ou registradas.
Para cada vacina, identifique: nome, data de aplicação e número ou tipo da dose.
Omita campos que não estejam claramente indicados no conteúdo — não invente informações.
Retorne apenas os dados encontrados.`,
  responseSchema: {
    type: 'object',
    properties: {
      vaccines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome da vacina' },
            date: {
              type: 'string',
              description: 'Data de aplicação (ISO 8601 ou texto livre)',
            },
            dose: {
              type: 'string',
              description: 'Tipo ou número da dose (ex: única, 1ª dose)',
            },
          },
          required: ['name'],
        },
      },
    },
    required: ['vaccines'],
  },
};
