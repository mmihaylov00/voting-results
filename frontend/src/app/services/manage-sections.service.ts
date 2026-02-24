import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

export type ManageSectionDto = {
  id: string;
  electionId: string;
  sectionId: string;
  sectionName: string;
  cityName: string;
  regionName: string;
};

@Injectable({ providedIn: 'root' })
export class ManageSectionsService {
  constructor(private readonly http: HttpClient) {}

  list(electionId: string) {
    return this.http.get<ManageSectionDto[]>(`${API_BASE_URL}/elections/manage/${electionId}/sections`);
  }
}
