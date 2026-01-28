import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { ElectionService } from '../../services/election';
import {PartyResult, Section, SectionDetails} from '../../models/election.models';
import { HlmButtonDirective } from '../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../ui/table-helm/src/lib/hlm-table.directives';
import { HlmTypographyDirective } from '../ui/typography-helm/src/lib/hlm-typography.directive';
import { HlmCardDirective } from '../ui/card-helm/src/lib/hlm-card.directives';
import { HlmInputDirective } from '../ui/input-helm/src/lib/hlm-input.directive';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-election-detail',
  host: {
    '(document:click)': 'closePartyFilter()',
    '(document:keydown.escape)': 'closeModal()'
  },
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    HlmButtonDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
    HlmTypographyDirective,
    HlmCardDirective,
    HlmInputDirective,
  ],
  templateUrl: './election-detail.html',
  styleUrl: './election-detail.scss',
})
export class ElectionDetailComponent implements OnInit {
  loading$: Observable<boolean>;
  date: string = '';
  regionId: string = '';
  dateName: string = '';
  regionName: string = '';
  sections: Section[] = [];
  filteredSections: Section[] = [];
  selectedSection: SectionDetails | null = null;
  searchTerm: string = '';

  sectionSortColumn: keyof Section = 'sectionId';
  sectionSortDir: 'asc' | 'desc' = 'asc';

  partySortColumn: keyof PartyResult = 'total';
  partySortDir: 'asc' | 'desc' = 'desc';

  selectedPartyIds: Set<string> = new Set();
  allParties: { id: string, name: string }[] = [];
  showPartyFilter: boolean = false;
  isModalOpen: boolean = false;

  private readonly DEFAULT_KEYWORDS = ["ГЕРБ", "ПРОДЪЛЖАВАМЕ", "ВЪЗРАЖДАНЕ", "ДПС", "БСП", "ТАКЪВ НАРОД", "МЕЧ", "ВЕЛИЧИЕ"];

  constructor(
    private route: ActivatedRoute,
    private electionService: ElectionService
  ) {
    this.loading$ = this.electionService.loading$;
  }

  downloadCsv(): void {
    if (!this.date || this.sections.length === 0) return;

    this.electionService.getParties(this.date).subscribe(partiesMap => {
      const csvContent = this.generateCsv(partiesMap);
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `election_results_${this.date}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  private generateCsv(partiesMap: { [id: string]: string }): string {
    const partyIds = Object.keys(partiesMap).filter(id => id !== '0');
    try {
      partyIds.sort((a, b) => parseInt(a) - parseInt(b));
    } catch (e) {
      partyIds.sort();
    }
    // Add "Others" (id '0') at the end if it exists
    if (partiesMap['0']) {
      partyIds.push('0');
    }

    let header = 'Град;Секция;Секция ИД;По списък;Гласували;Процент;Недействителни;Не подкрепя никого;Активност %';
    for (const _ of partyIds) {
      header += ';Партия;Общо;Хартиени;Машинни;Процент';
    }

    const rows = this.sections.map(section => {
      let row = `${section.cityName};${section.sectionId};${this.escapeSemi(section.sectionName)};${section.total};${section.voted};${section.total > 0 ? (section.voted / section.total) : 0};${section.discardedVotes};${section.noVotes};${(section.activityPercent * 100).toFixed(2)}%`;

      for (const partyId of partyIds) {
        const votes = section.partyVotes[partyId] || { total: 0, paper: 0, machine: 0 };
        const partyName = partiesMap[partyId] || partyId;
        const percent = section.total > 0 ? (votes.total / section.total) : 0;
        row += `;${partyName};${votes.total};${votes.paper};${votes.machine};${percent}`;
      }
      return row;
    });

    return [header, ...rows].join('\n');
  }

  private escapeSemi(v: string): string {
    if (!v) return '';
    if (v.includes(';') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  ngOnInit(): void {
    this.date = this.route.snapshot.paramMap.get('date') || '';
    this.regionId = this.route.snapshot.paramMap.get('regionId') || '';
    this.dateName = this.electionService.getDates().find(d => d.date === this.date)?.name ?? this.date;
    if (this.date) {
      this.electionService.getSections(this.date, this.regionId).subscribe(sections => {
        this.sections = sections;
        if (sections.length > 0) {
          this.regionName = (sections[0] as any).regionName;
        }
        this.applyFilter();
        this.sortSections(this.sectionSortColumn, true);
      });
      this.electionService.getParties(this.date).subscribe(partiesMap => {
        this.allParties = Object.entries(partiesMap)
          .map(([id, name]) => ({ id, name }))
          .filter(p => p.id !== '0')
          .sort((a, b) => {
            const numA = parseInt(a.id);
            const numB = parseInt(b.id);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.id.localeCompare(b.id);
          });

        // Add Others at the end if it exists
        if (partiesMap['0']) {
          this.allParties.push({ id: '0', name: partiesMap['0'] });
        }

        // Apply default selection
        this.allParties.forEach(party => {
          const name = party.name.toUpperCase();
          if (this.DEFAULT_KEYWORDS.some(k => name.includes(k))) {
            this.selectedPartyIds.add(party.id);
          }
        });
      });
    }
  }

  applyFilter(): void {
    if (!this.searchTerm) {
      this.filteredSections = [...this.sections];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredSections = this.sections.filter(s =>
        s.sectionId.toLowerCase().includes(term) ||
        s.cityName.toLowerCase().includes(term) ||
        s.sectionName.toLowerCase().includes(term)
      );
    }
    this.sortSections(this.sectionSortColumn, true);
  }

  sortSections(column: keyof Section, preserveDir: boolean = false): void {
    if (!preserveDir) {
      if (this.sectionSortColumn === column) {
        this.sectionSortDir = this.sectionSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sectionSortColumn = column;
        this.sectionSortDir = 'asc';
      }
    }

    this.filteredSections.sort((a, b) => {
      const valA = a[column];
      const valB = b[column];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.sectionSortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      const numA = valA as number;
      const numB = valB as number;
      return this.sectionSortDir === 'asc' ? numA - numB : numB - numA;
    });
  }

  sortParties(column: keyof PartyResult, preserveDir: boolean = false): void {
    if (!this.selectedSection) return;

    if (!preserveDir) {
      if (this.partySortColumn === column) {
        this.partySortDir = this.partySortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.partySortColumn = column;
        this.partySortDir = 'desc';
      }
    }

    this.selectedSection.partyResults.sort((a, b) => {
      const valA = a[column];
      const valB = b[column];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return this.partySortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      const numA = valA as number;
      const numB = valB as number;
      return this.partySortDir === 'asc' ? numA - numB : numB - numA;
    });
  }

  loadSectionDetails(sectionId: string): void {
    this.electionService.getSectionDetails(this.date, sectionId).subscribe(details => {
      this.selectedSection = details;
      this.sortParties(this.partySortColumn, true);
      this.isModalOpen = true;
    });
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  togglePartySelection(partyId: string): void {
    if (this.selectedPartyIds.has(partyId)) {
      this.selectedPartyIds.delete(partyId);
    } else {
      this.selectedPartyIds.add(partyId);
    }
  }

  closePartyFilter(): void {
    this.showPartyFilter = false;
  }

  togglePartyFilter(event: Event): void {
    event.stopPropagation();
    this.showPartyFilter = !this.showPartyFilter;
  }

  get filteredPartyResults(): PartyResult[] {
    if (!this.selectedSection) return [];
    return this.selectedSection.partyResults.filter(r => this.selectedPartyIds.has(r.partyId));
  }

  get othersResult(): PartyResult | null {
    if (!this.selectedSection) return null;

    const unselected = this.selectedSection.partyResults.filter(r => !this.selectedPartyIds.has(r.partyId));
    if (unselected.length === 0) return null;

    const total = unselected.reduce((sum, r) => sum + r.total, 0);
    const paper = unselected.reduce((sum, r) => sum + r.paper, 0);
    const machine = unselected.reduce((sum, r) => sum + r.machine, 0);
    const percent = unselected.reduce((sum, r) => sum + r.percent, 0);

    return {
      partyId: 'others',
      partyName: 'Останали',
      total,
      paper,
      machine,
      percent
    };
  }
}
