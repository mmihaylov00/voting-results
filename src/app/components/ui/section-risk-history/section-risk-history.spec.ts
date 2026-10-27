import { TestBed } from '@angular/core/testing';
import { ElectionService } from '../../../services/election';
import { Section } from '../../../models/election.models';
import { SectionRiskHistoryComponent } from './section-risk-history';

describe('SectionRiskHistoryComponent', () => {
  it('renders the supplied history without requesting full datasets again', () => {
    TestBed.configureTestingModule({
      imports: [SectionRiskHistoryComponent],
      providers: [{ provide: ElectionService, useValue: { getDates: () => [
        { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
        { date: '2026.04.19', name: 'Април 2026', type: 'governmental' },
      ] } }],
    });
    const fixture = TestBed.createComponent(SectionRiskHistoryComponent);
    const section: Section = {
      sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
      total: 100, voted: 80, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 8000,
      riskScore: 0,
    };
    fixture.componentRef.setInput('section', section);
    fixture.componentRef.setInput('date', '2026.04.19');
    fixture.componentRef.setInput('history', { '2024.10.27': { sections: [{ ...section, riskScore: undefined }], parties: {} } });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('0 от 1');
    expect(text).toContain('Без сигнали');
    expect(text).toContain('Няма налична оценка');
    expect(text).toContain('а не доказателство за нарушение');
  });
});
