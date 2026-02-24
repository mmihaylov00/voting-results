import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

@Injectable({ providedIn: 'root' })
export class ResultsService {
  constructor(private readonly http: HttpClient) {}

  list(electionId: string, electionDate: string) {
    return this.http.get(`${API_BASE_URL}/elections/manage/${electionId}/results?electionDate=${electionDate}`);
  }

  stats(electionId: string, electionDate: string) {
    return this.http.get(`${API_BASE_URL}/elections/manage/${electionId}/results/stats?electionDate=${electionDate}`);
  }
}
