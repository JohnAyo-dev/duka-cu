// Duka.cu HTTP client. The backend is optional during the migration: callers
// fall back to browser storage when it is offline.
(function () {
  const baseUrl = window.DUKA_API_BASE || 'http://127.0.0.1:3000/api/v1';
  const userKey = 'local:duka-api-user-id';
  const tokenKey = 'local:duka-api-token';
  let online = null;

  function currentUserId() {
    let id = localStorage.getItem(userKey);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`; localStorage.setItem(userKey, id); }
    return id;
  }
  function savedToken() { try { return localStorage.getItem(tokenKey); } catch (e) { return null; } }
  function setToken(token) { try { localStorage.setItem(tokenKey, token); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(tokenKey); } catch (e) {} }

  async function request(path, options) {
    const token = savedToken();
    const headers = { 'content-type': 'application/json', 'x-user-id': currentUserId(), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options && options.headers) };
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error((payload && payload.error && payload.error.message) || 'The server could not complete that request.');
    online = true;
    if (payload && payload.data && typeof payload.data.token === 'string') setToken(payload.data.token);
    return payload ? payload.data : null;
  }
  async function health() { try { await request('/health'); return true; } catch (error) { online = false; return false; } }

  window.DukaApi = {
    health,
    isOnline: () => online === true,
    me: () => request('/auth/me'),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: async () => { clearToken(); try { await request('/auth/logout', { method: 'POST' }); } catch (e) {} },
    listings: () => request('/listings'),
    createListing: (data) => request('/listings', { method: 'POST', body: JSON.stringify(data) })
  };
})();