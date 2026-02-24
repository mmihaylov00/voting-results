declare global {
  interface Window {
    __API_BASE__?: string;
  }
}

export const API_BASE_URL = (typeof window !== 'undefined' && window.__API_BASE__) || 'http://localhost:3000/api';
