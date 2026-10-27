import { InjectionToken } from '@angular/core';

export type ElectionType = 'governmental' | 'presidential';

export const ELECTION_TYPE = new InjectionToken<ElectionType>('ElectionType', {
  providedIn: 'root',
  factory: () => 'governmental',
});
