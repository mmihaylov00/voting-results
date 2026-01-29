import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Section } from '../../../../models/election.models';
import { HlmButtonDirective } from '../../../ui/button-helm/src/lib/hlm-button.directive';
import {
  HlmCardDirective,
  HlmCardHeaderDirective,
  HlmCardContentDirective,
  HlmCardDescriptionDirective
} from '../../../ui/card-helm/src/lib/hlm-card.directives';
import { HlmTypographyDirective } from '../../../ui/typography-helm/src/lib/hlm-typography.directive';

@Component({
  selector: 'app-export-csv-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmCardDirective,
    HlmTypographyDirective
  ],
  templateUrl: './export-csv-modal.html',
  host: {
    '(document:keydown.escape)': 'close.emit()'
  }
})
export class ExportCsvModalComponent {
  @Input({ required: true }) sections: Section[] = [];
  @Input() allParties: { id: string, name: string }[] = [];
  @Input() selectedPartyIds: Set<string> = new Set();
  @Input() date: string = '';
  @Input() regionName: string = '';
  @Output() close = new EventEmitter<void>();

  exportPartyIds: Set<string> = new Set();

  ngOnInit() {
    this.exportPartyIds = new Set(this.selectedPartyIds);
  }

  toggleExportPartySelection(partyId: string) {
    if (this.exportPartyIds.has(partyId)) {
      this.exportPartyIds.delete(partyId);
    } else {
      this.exportPartyIds.add(partyId);
    }
  }

  downloadCsv() {
    const partiesMap: { [id: string]: string } = {};
    this.allParties.forEach(p => {
      if (this.exportPartyIds.has(p.id)) {
        partiesMap[p.id] = p.name;
      }
    });

    const csvContent = this.generateCsv(partiesMap);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `results_${this.regionName}_${this.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.close.emit();
  }

  generateCsv(partiesMap: { [id: string]: string }): string {
    const sortedPartyIds = Object.keys(partiesMap).sort((a, b) => {
      const idA = parseInt(a, 10);
      const idB = parseInt(b, 10);
      if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
      return a.localeCompare(b);
    });

    const headers = [
      'Секция',
      'Град',
      'Име на секция',
      'Избиратели',
      'Гласували',
      'Недействителни',
      'Не подкрепя никого',
      ...sortedPartyIds.map(id => partiesMap[id])
    ];

    const rows = this.sections.map(section => {
      const partyVotes = sortedPartyIds.map(id => section.partyVotes[id]?.total || 0);
      return [
        section.sectionId,
        section.cityName,
        section.sectionName,
        section.total,
        section.voted,
        section.discardedVotes,
        section.noVotes,
        ...partyVotes
      ].map(v => this.escapeSemi(String(v)));
    });

    return [
      headers.map(h => this.escapeSemi(h)).join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');
  }

  escapeSemi(v: string): string {
    if (!v) return '';
    if (v.includes(';') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }
}
