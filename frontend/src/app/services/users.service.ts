import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CreateUserDto, UpdateUserDto, UserDto } from '@votes/shared';
import { API_BASE_URL } from './api';
export type { UserDto } from '@votes/shared';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<UserDto[]>(`${API_BASE_URL}/users`);
  }

  create(payload: CreateUserDto) {
    return this.http.post<UserDto>(`${API_BASE_URL}/users`, payload);
  }

  update(id: string, payload: UpdateUserDto) {
    return this.http.patch<UserDto>(`${API_BASE_URL}/users/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete(`${API_BASE_URL}/users/${id}`);
  }
}
