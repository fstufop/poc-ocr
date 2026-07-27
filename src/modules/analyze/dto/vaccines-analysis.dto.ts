export class VaccineItemDto {
  name: string;
  date?: string;
  dose?: string;
}

export class VaccinesAnalysisDto {
  vaccines: VaccineItemDto[];
}
