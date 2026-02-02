import { Section } from '../models/election.models';

export const UNIQUE_RISK_CODES = new Set(['R5.1', 'R6.1', 'R6.2', 'R4.4', 'R2.4', 'R5.2']);
export const REGION_LEVEL_RISK_CODES = new Set(['R6.2', 'R2.4']);

export function isUniqueRisk(code: string): boolean {
  return UNIQUE_RISK_CODES.has(code);
}

export function isRegionLevelRisk(code: string): boolean {
  return REGION_LEVEL_RISK_CODES.has(code);
}

export function isCandidateRisk(risk: any): boolean {
  return Boolean(risk?.details?.candidateId);
}

export function matchesCandidateRisk(
  risk: any,
  candidateId: string | number | null | undefined,
  partyId: string | number | null | undefined
): boolean {
  if (!risk?.details?.candidateId) return false;
  const riskCandidateId = String(risk.details.candidateId);
  const candidateIdString = String(candidateId ?? '');
  if (riskCandidateId !== candidateIdString) return false;
  if (risk.details.partyId) {
    return String(risk.details.partyId) === String(partyId ?? '');
  }
  return true;
}

export function addCandidateRiskWithDedup(map: Map<string, any>, risk: any): void {
  if (isUniqueRisk(risk.code)) {
    if (!map.has(risk.code)) {
      map.set(risk.code, risk);
    }
    return;
  }
  const key = `${risk.code}_${risk.details?.sectionId || ''}`;
  if (!map.has(key)) {
    map.set(key, risk);
  }
}

export function filterCandidateRisksForSection(
  risks: any[],
  options: {
    candidateId: string | number | null | undefined;
    partyId: string | number | null | undefined;
    sectionId?: string | null | undefined;
    excludeCodes?: Set<string>;
  }
): any[] {
  const { candidateId, partyId, sectionId, excludeCodes } = options;
  return risks.filter(risk => {
    if (excludeCodes?.has(risk.code)) return false;
    if (!matchesCandidateRisk(risk, candidateId, partyId)) return false;
    if (sectionId && risk.details?.sectionId && risk.details.sectionId !== sectionId) {
      return false;
    }
    return true;
  });
}

export function filterSectionLevelRisks(risks: any[], excludeCodes?: Set<string>): any[] {
  return risks.filter(risk => {
    if (excludeCodes?.has(risk.code)) return false;
    return !isCandidateRisk(risk);
  });
}

export function getRisksForSection(section: Section): any[] {
  return (section as any).candidateRiskIndicators || section.riskIndicators || [];
}
