import { handleMockAPI } from './mockBackend';

const defaultUrl = typeof window !== 'undefined' && window.location.hostname.includes('netlify.app')
  ? 'https://johncord-backend.onrender.com'
  : '';
const BASE_BACKEND_URL = (import.meta as any).env?.VITE_API_URL || defaultUrl;
const API_URL = BASE_BACKEND_URL ? (BASE_BACKEND_URL.endsWith('/api') ? BASE_BACKEND_URL : `${BASE_BACKEND_URL}/api`) : '/api';

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('johncord_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type') || '';
    
    // If the server returned HTML (e.g. Netlify 404 SPA fallback), fallback to client mock DB
    if (contentType.includes('text/html') || !contentType.includes('application/json')) {
      console.warn(`[Johncord] Backend at ${API_URL} returned HTML instead of JSON. Falling back to in-browser database for ${endpoint}`);
      return await handleMockAPI(endpoint, options);
    }

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/guest')) {
        localStorage.removeItem('johncord_token');
        localStorage.removeItem('johncord_user');
        window.location.reload();
      }
      throw new Error(data.error || 'Erro na requisição.');
    }

    return data;
  } catch (err: any) {
    // If network failed, seamlessly handle via mock database
    if (
      err.message?.includes('Unexpected token') ||
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('is not valid JSON')
    ) {
      console.warn(`[Johncord] Network error connecting to ${API_URL}${endpoint}. Using client storage.`);
      return await handleMockAPI(endpoint, options);
    }
    throw err;
  }
}
