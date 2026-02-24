import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api';

@Injectable({ providedIn: 'root' })
export class AssignmentsService {
  constructor(private readonly http: HttpClient) {}

  list(electionId: string) {
    return this.http.get(`${API_BASE_URL}/elections/manage/${electionId}/assignments`);
  }

  create(payload: { electionId: string; personId: string; electionSectionId: string; positionId: string }) {
    return this.http.post(`${API_BASE_URL}/elections/manage/${payload.electionId}/assignments`, payload);
  }

  update(electionId: string, id: string, payload: { personId?: string; electionSectionId?: string; positionId?: string }) {
    return this.http.patch(`${API_BASE_URL}/elections/manage/${electionId}/assignments/${id}`, payload);
  }

  remove(electionId: string, id: string) {
    return this.http.delete(`${API_BASE_URL}/elections/manage/${electionId}/assignments/${id}`);
  }

  peopleWithoutSection(electionId: string, positionId: string) {
    return this.http.get(`${API_BASE_URL}/elections/manage/${electionId}/assignments/people-without-section?positionId=${positionId}`);
  }

  sectionsMissingPosition(electionId: string, positionId: string) {
    return this.http.get(`${API_BASE_URL}/elections/manage/${electionId}/assignments/sections-missing-position?positionId=${positionId}`);
  }
}
