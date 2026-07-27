export class MedicineItemDto {
  name: string;
  dosage?: string;
  frequency?: string;
}

export class MedicinesAnalysisDto {
  medicines: MedicineItemDto[];
}
