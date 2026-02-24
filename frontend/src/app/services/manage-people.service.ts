import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

export type ManagePersonDto = {
  id: string;
  electionId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ManagePeopleService {
  constructor(private readonly http: HttpClient) {}

  list(electionId: string) {
    return this.http.get<ManagePersonDto[]>(`${API_BASE_URL}/elections/manage/${electionId}/people`);
  }

  create(electionId: string, payload: { fullName: string; email?: string; phone?: string }) {
    return this.http.post<ManagePersonDto>(`${API_BASE_URL}/elections/manage/${electionId}/people`, payload);
  }

  update(electionId: string, personId: string, payload: { fullName: string; email?: string; phone?: string }) {
    return this.http.patch<ManagePersonDto>(`${API_BASE_URL}/elections/manage/${electionId}/people/${personId}`, payload);
  }

  remove(electionId: string, personId: string) {
    return this.http.delete<{ ok: true }>(`${API_BASE_URL}/elections/manage/${electionId}/people/${personId}`);
  }
}
