export const COMPACT_MAPPING = {
  section: {
    total: 't',
    voted: 'v',
    discardedVotes: 'inv',
    noVotes: 'nv',
    noVotesPaper: 'nvp',
    noVotesMachine: 'nvm',
    totalPaper: 'tp',
    totalMachine: 'tm',
    activityBp: 'ab',
  },
  region: {
    total: 't',
    voted: 'v',
    discardedVotes: 'inv',
    noVotes: 'nv',
    totalPaper: 'tp',
    totalMachine: 'tm',
    avgTurnoutBp: 'atb',
    partyPercentsBp: 'ppb',
  },
  partyVotes: {
    total: 't',
    paper: 'p',
    machine: 'm',
  },
  candidateVotes: {
    total: 't',
    paper: 'p',
    machine: 'm',
  },
  topParties: {
    percentBp: 'pb',
  },
} as const;

export type CompactMapping = typeof COMPACT_MAPPING;
