import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { UploadsService } from '../../../services/uploads.service';
import { HlmButtonDirective } from '../../ui/button-helm/src/lib/hlm-button.directive';
import { HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardContentDirective } from '../../ui/card-helm/src/lib/hlm-card.directives';
import {
  HlmTableBodyDirective,
  HlmTableCellDirective,
  HlmTableDirective,
  HlmTableHeadDirective,
  HlmTableHeaderDirective,
  HlmTableRowDirective,
} from '../../ui/table-helm/src/lib/hlm-table.directives';

@Component({
  selector: 'app-sections-upload',
  standalone: true,
  imports: [
    CommonModule,
    HlmButtonDirective,
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
  templateUrl: './sections-upload.html',
})
export class SectionsUploadComponent {
  electionId: string | null = null;
  selectedFile = signal<File | null>(null);
  preview = signal<any>(null);
  error = signal<string | null>(null);
  validationErrors = signal<Array<{ line: number; message: string }>>([]);

  constructor(private route: ActivatedRoute, private uploads: UploadsService) {
    this.electionId = this.route.snapshot.paramMap.get('id');
  }

  onFileSelected(file: File | null) {
    this.selectedFile.set(file);
  }

  onPreview() {
    if (!this.electionId || !this.selectedFile()) return;
    this.error.set(null);
    this.validationErrors.set([]);
    this.uploads.previewSections(this.electionId, this.selectedFile() as File).subscribe({
      next: (data) => this.preview.set(data),
      error: (err) => this.handleError(err, 'Preview failed'),
    });
  }

  onUpload() {
    if (!this.electionId || !this.selectedFile()) return;
    this.error.set(null);
    this.validationErrors.set([]);
    this.uploads.uploadSections(this.electionId, this.selectedFile() as File).subscribe({
      next: (data) => this.preview.set(data),
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
