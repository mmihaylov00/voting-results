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

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function candidateRiskAppliesToSection(risk: any, section?: Section): boolean {
  if (!section) return false;
  if (!risk?.details?.candidateId) return false;
  const sectionId = section.sectionId;
  const riskSectionId = risk.details?.sectionId;
  if (sectionId && riskSectionId && String(riskSectionId) !== String(sectionId)) return false;
  const partyId = risk.details?.partyId;
  const candidateId = risk.details?.candidateId;
  if (!partyId || !candidateId) return false;
  const key = `${partyId}_${candidateId}`;
  const cv = section.candidateVotes?.[key];
  if (!cv) return false;

  if (risk.code === 'R2.4') {
    const total = (cv.paper || 0) + (cv.machine || 0);
    if (!total) return false;
    const paperShare = (cv.paper || 0) / total;
    const machineShare = (cv.machine || 0) / total;
    if (typeof risk.details?.paperShare !== 'number' || typeof risk.details?.machineShare !== 'number') {
      return true;
    }
    return approxEqual(paperShare, risk.details.paperShare, 0.02)
      && approxEqual(machineShare, risk.details.machineShare, 0.02);
  }

  if (risk.code === 'R5.2') {
    const voted = section.voted || 0;
    if (!voted) return false;
    const currentRate = (cv.total || 0) / voted;
    if (typeof risk.details?.currentRate !== 'number') return true;
    return approxEqual(currentRate, risk.details.currentRate, 0.02);
  }

  if (risk.code === 'R6.1') {
    // If this is an aggregated/region-level risk, don't show per section.
    if (typeof risk.details?.avgSectionShare === 'number' || typeof risk.details?.avgMunicipalityShare === 'number') {
      return false;
    }
    const totalPreferences = section.candidateVotes
      ? Object.values(section.candidateVotes).reduce((sum, c) => sum + (c.total || 0), 0)
      : 0;
    if (!totalPreferences) return false;
    const sectionShare = (cv.total || 0) / totalPreferences;
    if (typeof risk.details?.sectionShare !== 'number') return true;
    return approxEqual(sectionShare, risk.details.sectionShare, 0.02);
  }

  if (risk.code === 'R4.4') {
    return (cv.total || 0) >= 10;
  }

  return true;
}
