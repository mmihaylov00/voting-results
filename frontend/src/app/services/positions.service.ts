import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

export type PositionDto = { id: string; name: string; color?: string };

@Injectable({ providedIn: 'root' })
export class PositionsService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<PositionDto[]>(`${API_BASE_URL}/positions`);
  }

  create(payload: { name: string; color?: string }) {
    return this.http.post<PositionDto>(`${API_BASE_URL}/positions`, payload);
  }

  update(id: string, payload: { name: string; color?: string }) {
    return this.http.patch<PositionDto>(`${API_BASE_URL}/positions/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<{ ok: true }>(`${API_BASE_URL}/positions/${id}`);
  }
}
