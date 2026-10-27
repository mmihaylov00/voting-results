import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Params } from '@angular/router';
import { RegionCandidate, Section } from '../../../../models/election.models';
import { ContestantDetailModalComponent } from '../../../contestant-detail-modal/contestant-detail-modal';
import { CandidateDetailModalComponent } from './candidate-detail-modal';

@Component({ selector: 'app-contestant-detail-modal', standalone: true, template: '' })
class ContestantDetailStubComponent {
  @Input() partyName = '';
  @Input() partyId = '';
  @Input() currentDate = '';
  @Input() preferenceCandidate: RegionCandidate | null = null;
  @Input() preferenceSections: Section[] = [];
  @Input() preferencePageRoute: string[] = [];
  @Input() preferencePageQueryParams: Params = {};
  @Output() close = new EventEmitter<void>();
}

describe('CandidateDetailModalComponent', () => {
  async function setup() {
    await TestBed.configureTestingModule({ imports: [CandidateDetailModalComponent] })
      .overrideComponent(CandidateDetailModalComponent, {
        remove: { imports: [ContestantDetailModalComponent] },
        add: { imports: [ContestantDetailStubComponent] },
      }).compileComponents();
    const fixture = TestBed.createComponent(CandidateDetailModalComponent);
    const candidate: RegionCandidate = {
      candidateId: '109', candidateName: 'Иван Петров Иванов', partyId: '12',
      partyName: 'Пълно име на партията', total: 10, paper: 6, machine: 4,
      totalInRegion: 10, partyPercentInRegion: 20, preferencePercentOfPartyVotes: 25,
    };
    const sections: Section[] = [{
      sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: 'Училище',
      sectionType: 'City', total: 120, voted: 100, discardedVotes: 0, noVotes: 0,
      activityBp: 8333, topParties: [], partyVotes: { '12': { total: 40, paper: 20, machine: 20 } },
    }];
    const pageRoute = ['/', 'governmental', 'election', '2026.04.19', 'region', '23'];
    const pageQueryParams = { candidate: '12_109', analysis: 'preserved-scope', section: null };
    fixture.componentRef.setInput('candidate', candidate);
    fixture.componentRef.setInput('sections', sections);
    fixture.componentRef.setInput('currentDate', '2026.04.19');
    fixture.componentRef.setInput('pageRoute', pageRoute);
    fixture.componentRef.setInput('pageQueryParams', pageQueryParams);
    await fixture.whenStable();
    const profile = fixture.debugElement.query(By.directive(ContestantDetailStubComponent))
      .injector.get(ContestantDetailStubComponent);
    return { fixture, profile, candidate, sections, pageRoute, pageQueryParams };
  }

  it('delegates the full preference identity, election scope and page context to the shared profile', async () => {
    const { profile, candidate, sections, pageRoute, pageQueryParams } = await setup();
    expect(profile.partyName).toBe(candidate.candidateName);
    expect(profile.partyId).toBe(candidate.partyId);
    expect(profile.currentDate).toBe('2026.04.19');
    expect(profile.preferenceCandidate).toBe(candidate);
    expect(profile.preferenceSections).toBe(sections);
    expect(profile.preferencePageRoute).toBe(pageRoute);
    expect(profile.preferencePageQueryParams).toBe(pageQueryParams);
  });

  it('forwards the shared profile close action to its caller', async () => {
    const { fixture, profile } = await setup();
    const close = vi.fn();
    fixture.componentInstance.close.subscribe(close);
    profile.close.emit();
    expect(close).toHaveBeenCalledOnce();
  });
});
