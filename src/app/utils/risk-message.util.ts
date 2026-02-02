import { Section } from '../models/election.models';

export interface RiskContext {
  section?: Section;
  candidate?: {
    candidateId?: string;
    candidateName?: string;
    partyId?: string;
    partyName?: string;
  };
  partiesById?: { [id: string]: string };
}

function resolvePartyName(partyId: string | undefined, context?: RiskContext): string {
  if (!partyId) return '';
  if (context?.candidate?.partyId === partyId && context.candidate.partyName) {
    return context.candidate.partyName;
  }
  if (context?.section?.topParties) {
    const tp = context.section.topParties.find(p => p.partyId === partyId);
    if (tp?.name) return tp.name;
  }
  if (context?.partiesById?.[partyId]) return context.partiesById[partyId];
  return `Партия ${partyId}`;
}

function resolveCandidateName(
  partyId: string | undefined,
  candidateId: string | undefined,
  context?: RiskContext
): string {
  if (candidateId && context?.candidate?.candidateId === candidateId && context.candidate.candidateName) {
    return context.candidate.candidateName;
  }
  if (partyId && candidateId && context?.section?.candidateVotes) {
    const key = `${partyId}_${candidateId}`;
    const cv = context.section.candidateVotes[key];
    if (cv?.candidateName) return cv.candidateName;
  }
  if (candidateId) return `Кандидат ${candidateId}`;
  return 'Кандидат';
}

export function formatRiskMessage(risk: { code: string; details?: any }, context?: RiskContext): string {
  const d = risk.details || {};

  switch (risk.code) {
    case 'R1.1':
      return `Аномалия в активността: ${((d.turnoutChange || 0) * 100).toFixed(1)}% промяна (${(d.stdDevs || 0).toFixed(1)}σ от средното)`;
    case 'R1.2': {
      const partyName = resolvePartyName(d.partyId, context);
      return `Една партия улавя ${((d.captureRatio || 0) * 100).toFixed(0)}% от новите гласове: ${partyName}`;
    }
    case 'R1.3': {
      const partyName = resolvePartyName(d.partyId, context);
      return `Ниска волатилност на ${partyName} спрямо съседните секции`;
    }
    case 'R2.1':
      return `Отклонение в съотношението хартия/машина: ${((d.sectionPaperPercent || 0) * 100).toFixed(1)}% хартиени (регион: ${((d.regionPaperPercent || 0) * 100).toFixed(1)}%)`;
    case 'R2.2': {
      const partyName = resolvePartyName(d.partyId, context);
      const sectionPercent = Math.round((d.sectionPaperRatio || 0) * 100);
      const regionPercent = Math.round((d.regionPaperRatio || 0) * 100);
      return `${partyName}: ${sectionPercent}% хартиени (регион: ${regionPercent}%)`;
    }
    case 'R2.3': {
      const party1 = resolvePartyName(d.party1Id, context);
      const party2 = resolvePartyName(d.party2Id, context);
      return `Асиметрия: ${party1} ${((d.party1PaperRatio || 0) * 100).toFixed(0)}% хартия, ${party2} ${((d.party2PaperRatio || 0) * 100).toFixed(0)}% хартия`;
    }
    case 'R3.1':
      return `Скачване в невалидните гласове: ${((d.currentInvalidRate || 0) * 100).toFixed(1)}% (исторически: ${((d.baselineInvalidRate || 0) * 100).toFixed(1)}%)`;
    case 'R3.2': {
      const partyName = resolvePartyName(d.partyId, context);
      return `Увеличение на невалидните (+${d.invalidIncrease || 0}) корелира с загуби за ${partyName}`;
    }
    case 'R4.1': {
      const partyName = resolvePartyName(d.partyId, context);
      return `Голям замах в исторически стабилна секция: ${partyName} ${((d.swing || 0) * 100).toFixed(1)}% промяна (от ${((d.avgHistoricalShare || 0) * 100).toFixed(1)}% към ${((d.currentShare || 0) * 100).toFixed(1)}%)`;
    }
    case 'R4.2': {
      const prefix = d.isFragmentation ? 'Внезапна фрагментация' : 'Внезапна консолидация';
      return `${prefix}: индекс ${(d.currentHerfindahl || 0).toFixed(2)} (исторически: ${(d.avgHistorical || 0).toFixed(2)})`;
    }
    case 'R4.3': {
      const topParty = resolvePartyName(d.topPartyId, context);
      const ppdbParty = resolvePartyName(d.ppdbPartyId, context);
      return `Критична секция: ${topParty} води с ${((d.margin || 0) * 100).toFixed(1)}% пред ${ppdbParty}`;
    }
    case 'R2.5': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Инверсия: ${candidateName} (${partyName}) има ${((d.candidatePaperRatio || 0) * 100).toFixed(0)}% хартиени преференции, докато партията е ${((d.partyMachineRatio || 0) * 100).toFixed(0)}% машинни`;
    }
    case 'R4.4': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Несъответствие волатилност: ${candidateName} (${partyName}) е стабилен докато партията е волатилна`;
    }
    case 'R5.1': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Аномалия в участието на преференции: ${candidateName} (${partyName}) има ${((d.sectionPreferenceRate || 0) * 100).toFixed(1)}% (регион: ${((d.regionPreferenceRate || 0) * 100).toFixed(1)}%)`;
    }
    case 'R6.1': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      if (d.avgSectionShare !== undefined && d.avgMunicipalityShare !== undefined) {
        const count = d.sectionsTriggered || 0;
        return `Доминиране на концентрация (средно от ${count} секции): ${candidateName} (${partyName}) има ${((d.avgSectionShare || 0) * 100).toFixed(1)}% (община: ${((d.avgMunicipalityShare || 0) * 100).toFixed(1)}%)`;
      }
      return `Доминиране на концентрация: ${candidateName} (${partyName}) има ${((d.sectionShare || 0) * 100).toFixed(1)}% от преференциите (община: ${((d.municipalityShare || 0) * 100).toFixed(1)}%)`;
    }
    case 'R6.2': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Ексклузивност: ${candidateName} (${partyName}) е концентриран в ${d.sectionsWithCandidate || 0} от ${d.regionSectionsCount || 0} секции (Gini: ${(d.gini || 0).toFixed(2)})`;
    }
    case 'R2.4': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Разлика в преференциите по технология за ${candidateName} (${partyName}): ${((d.paperShare || 0) * 100).toFixed(0)}% хартиени, ${((d.machineShare || 0) * 100).toFixed(0)}% машинни`;
    }
    case 'R5.2': {
      const candidateName = resolveCandidateName(d.partyId, d.candidateId, context);
      const partyName = resolvePartyName(d.partyId, context);
      return `Внезапна активация на преференции: ${candidateName} (${partyName}) от ${((d.avgHistoricalRate || 0) * 100).toFixed(1)}% към ${((d.currentRate || 0) * 100).toFixed(1)}%`;
    }
    default:
      return risk.code;
  }
}
