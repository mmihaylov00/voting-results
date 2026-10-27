import { Component, Input } from '@angular/core';
import { MapMetric } from '../../../utils/map-metric.helper';

export type MapIconName = MapMetric | 'download' | 'download-table' | 'history' | 'fullscreen' | 'loading' | 'settlement' | 'municipality' | 'neighborhood' | 'section' | 'region'
  | 'calendar' | 'parliament' | 'person' | 'users' | 'globe' | 'percent' | 'education' | 'economy' | 'religion' | 'check' | 'reset' | 'target' | 'swing' | 'declining' | 'filter' | 'mobile' | 'share' | 'square-check'
  | 'chevron-left' | 'chevron-right';

@Component({
  selector: 'app-map-icon',
  standalone: true,
  template: `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path [attr.d]="paths[name]" />
    </svg>
  `,
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
})
export class MapIconComponent {
  @Input() name: MapIconName = 'leading-party';
  readonly paths: Record<MapIconName, string> = {
    'leading-party': 'M3 21h18M5 21V10h4v11M10 21V4h4v17M15 21V14h4v7',
    summary: 'M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01',
    'leading-preference': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 10l2 2 4-4',
    activity: 'M2 12h4l3-9 6 18 3-9h4',
    risks: 'M10.3 3.9 1.8 18.7A1.5 1.5 0 0 0 3.1 21h17.8a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01',
    'invalid-votes': 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M9 9l6 6M15 9l-6 6',
    'no-votes': 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M8 12h8',
    'machine-vs-paper': 'M3 3h18v13H3zM8 21h8M12 16v5M7 7h4M7 11h8',
    'winner-margin': 'M8 3h8v5a4 4 0 0 1-8 0V3M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21h8M9 18h6v3',
    'party-votes': 'M5 9H3v12h18V9h-2M8 3l10 4-4 9-10-4zM10 8l1 3 4-1',
    'party-change': 'M3 17l6-6 4 4 8-10M15 5h6v6',
    'below-threshold': 'M3 9h18M5 21V13h4v8M10 21V4h4v17M15 21V16h4v5',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    'download-table': 'M13 21H3V3h18v6M3 9h18M3 15h10M9 3v18M18 12v9M14 17l4 4 4-4',
    history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2',
    fullscreen: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
    'chevron-left': 'm15 18-6-6 6-6',
    'chevron-right': 'm9 18 6-6-6-6',
    loading: 'M21 12a9 9 0 1 1-6.2-8.6',
    settlement: 'M3 10l9-7 9 7v11h-6v-7H9v7H3z',
    municipality: 'M3 21V7h8v14M11 21V3h10v18M1 21h22M6 11h2M6 15h2M14 7h4M14 11h4M14 15h4',
    neighborhood: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    section: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0M15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    region: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M7 14h2M15 14h2M7 18h2',
    parliament: 'M3 10h18M4 10l8-7 8 7M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18M2 18h20',
    person: 'M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    globe: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M2 12h20M12 2a18 18 0 0 1 0 20 18 18 0 0 1 0-20',
    percent: 'M19 5 5 19M9 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0M21 18a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    education: 'm2 9 10-6 10 6-10 6-10-6M6 12v6c4 3 8 3 12 0v-6M22 9v9',
    economy: 'M3 8h18v13H3zM8 8V3h8v5M3 13h18M10 13v3h4v-3',
    religion: 'M3 21h18M5 21V11l7-5 7 5v10M12 2v4M10 4h4M10 21v-6h4v6',
    check: 'm5 12 4 4L19 6',
    share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 16V3M7 8l5-5 5 5',
    'square-check': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M8 12l3 3 5-6',
    reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
    target: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M18 12a6 6 0 1 0-12 0 6 6 0 0 0 12 0M14 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
    swing: 'M3 3l7 7M3 3v5M3 3h5M21 21l-7-7M21 21v-5M21 21h-5',
    declining: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
    filter: 'M4 4h16l-6 8v7l-4 2v-9z',
    mobile: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M10 18h4',
  };
}
