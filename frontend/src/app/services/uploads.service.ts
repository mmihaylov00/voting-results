import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

@Injectable({ providedIn: 'root' })
export class UploadsService {
  constructor(private readonly http: HttpClient) {}

  previewSections(electionId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/sections/preview`, form);
  }

  uploadSections(electionId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/sections/upload`, form);
  }

  previewPeople(electionId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/people/preview`, form);
  }

  uploadPeople(electionId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/people/upload`, form);
  }

  previewResults(electionId: string, electionDate: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/results/preview?electionDate=${electionDate}`, form);
  }

  uploadResults(electionId: string, electionDate: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${API_BASE_URL}/elections/manage/${electionId}/results/upload?electionDate=${electionDate}`, form);
  }
}
