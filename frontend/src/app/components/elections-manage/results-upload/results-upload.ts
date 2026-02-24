import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UploadsService } from '../../../services/uploads.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmInputDirective } from '../../ui/input-helm/src/lib/hlm-input.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

type ResultsPreview = {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ line: number; message: string }>;
  samples: Array<{ sectionId: string; data: Record<string, unknown> }>;
};

@Component({
  selector: 'app-results-upload',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonDirective,
    HlmInputDirective,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardContentDirective,
    HlmTableDirective,
    HlmTableHeaderDirective,
    HlmTableBodyDirective,
    HlmTableRowDirective,
    HlmTableHeadDirective,
    HlmTableCellDirective,
  ],
  templateUrl: './results-upload.html',
})
export class ResultsUploadComponent {
  electionId: string | null = null;
  electionDate = '';
  selectedFile = signal<File | null>(null);
  preview = signal<ResultsPreview | null>(null);
  error = signal<string | null>(null);
  validationErrors = signal<Array<{ line: number; message: string }>>([]);

  constructor(private route: ActivatedRoute, private uploads: UploadsService) {
    this.electionId = this.route.snapshot.paramMap.get('id');
  }

  onFileSelected(file: File | null) {
    this.selectedFile.set(file);
  }

  onPreview() {
    if (!this.electionId || !this.electionDate || !this.selectedFile()) return;
    this.error.set(null);
    this.validationErrors.set([]);
    this.uploads.previewResults(this.electionId, this.electionDate, this.selectedFile() as File).subscribe({
      next: (data) => this.preview.set(data as ResultsPreview),
      error: (err) => this.handleError(err, 'Preview failed'),
    });
  }

  onUpload() {
    if (!this.electionId || !this.electionDate || !this.selectedFile()) return;
    this.error.set(null);
    this.validationErrors.set([]);
    this.uploads.uploadResults(this.electionId, this.electionDate, this.selectedFile() as File).subscribe({
      next: () => this.onPreview(),
      error: (err) => this.handleError(err, 'Upload failed'),
    });
  }

  private handleError(err: any, fallbackMessage: string) {
    const errors = Array.isArray(err?.error?.errors) ? err.error.errors : [];
    this.validationErrors.set(
      errors
        .filter((e: any) => typeof e?.line === 'number' && typeof e?.message === 'string')
        .map((e: any) => ({ line: e.line, message: e.message })),
    );
    this.error.set(err?.error?.message || fallbackMessage);
  }
}
