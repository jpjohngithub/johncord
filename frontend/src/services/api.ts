import { handleMockAPI } from './mockBackend';

// Priority order: 1. Live Cloudflare tunnel, 2. Vite env var, 3. Render, 4. Same origin
const CLOUDFLARE_URL = 'https://circulation-noticed-significant-prints.trycloudflare.com';
const BACKEND_CANDIDATES = [
  CLOUDFLARE_URL,
  (import.meta as any).env?.VITE_API_URL,
  'https://johncord-backend.onrender.com',
].filter(Boolean);

const BASE_BACKEND_URL = BACKEND_CANDIDATES[0] || '';
const API_URL = BASE_BACKEND_URL
  ? (BASE_BACKEND_URL.endsWith('/api') ? BASE_BACKEND_URL : `${BASE_BACKEND_URL}/api`)
  : '/api';

let _workingApiUrl: string | null = null;

async function findWorkingBackend(): Promise<string> {
  if (_workingApiUrl) return _workingApiUrl;

  for (const candidate of BACKEND_CANDIDATES) {
    const url = candidate.endsWith('/api') ? candidate : `${candidate}/api`;
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (res.ok || res.status < 500) {
        console.log(`[Johncord] ✅ Live Backend connected at: ${url}`);
        _workingApiUrl = url;
        return url;
      }
    } catch {
      // try next
    }
  }
  console.warn('[Johncord] No backend reachable, using client storage fallback');
  _workingApiUrl = API_URL;
  return API_URL;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const workingUrl = await findWorkingBackend();
  const token = localStorage.getItem('johncord_token');
  const headers: Record<string, string> = {
    'bypass-tunnel-reminder': 'true',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${workingUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(10000)
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html') || !contentType.includes('application/json')) {
      _workingApiUrl = null;
      console.warn(`[Johncord] Backend returned HTML for ${endpoint}. Falling back to client storage.`);
      return await handleMockAPI(endpoint, options);
    }

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/')) {
        localStorage.removeItem('johncord_token');
        localStorage.removeItem('johncord_user');
        window.location.reload();
      }
      throw new Error(data.error || 'Erro na requisição.');
    }

    return data;
  } catch (err: any) {
    if (
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.name === 'TimeoutError' ||
      err.name === 'AbortError'
    ) {
      _workingApiUrl = null;
      console.warn(`[Johncord] Network error. Using client storage for ${endpoint}`);
      return await handleMockAPI(endpoint, options);
    }
    throw err;
  }
}
