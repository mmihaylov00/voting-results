import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

export type ElectionManageDto = {
  id: string;
  date: string;
  name?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable({ providedIn: 'root' })
export class ElectionsManageService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<ElectionManageDto[]>(`${API_BASE_URL}/elections/manage`);
  }

  get(id: string) {
    return this.http.get<ElectionManageDto>(`${API_BASE_URL}/elections/manage/${id}`);
  }

  create(payload: { date: string }) {
    return this.http.post<ElectionManageDto>(`${API_BASE_URL}/elections/manage`, payload);
  }

  update(id: string, payload: { date?: string; name?: string }) {
    return this.http.patch<ElectionManageDto>(`${API_BASE_URL}/elections/manage/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete(`${API_BASE_URL}/elections/manage/${id}`);
  }
}
