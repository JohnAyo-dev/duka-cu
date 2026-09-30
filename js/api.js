// Duka.cu HTTP client. The backend is optional during the migration: callers
// fall back to browser storage when it is offline.
(function () {
  // Where the API lives, in order of preference:
  //  1. window.DUKA_API_BASE, if a page sets it before this script.
  //  2. The same origin (/api/v1) on any real hosted address, and on
  //     http://localhost:3000 when `npm start` serves the pages itself. On a
  //     static host such as Netlify, netlify.toml proxies /api/* to the backend.
  //  3. http://127.0.0.1:3000 when the pages are opened from somewhere local that
  //     is not the backend (VS Code Live Server on :5500, or a file:// double-click).
  const localHost = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const isLocalDev = localHost && location.port !== '3000';
  const baseUrl = window.DUKA_API_BASE || ((/^https?:$/.test(location.protocol) && !isLocalDev) ? '/api/v1' : 'http://127.0.0.1:3000/api/v1');
  const userKey = 'local:duka-api-user-id';
  const tokenKey = 'local:duka-api-token';
  let online = null;

  function currentUserId() {
    let id = localStorage.getItem(userKey);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`; localStorage.setItem(userKey, id); }
    return id;
  }
  function savedToken() { try { return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey); } catch (e) { return null; } }
  // remember=false keeps the token in sessionStorage so closing the tab signs
  // the user out. remember=true (or omitting it) persists across restarts.
  function setToken(token, remember) {
    try {
      if (remember === false) { localStorage.removeItem(tokenKey); sessionStorage.setItem(tokenKey, token); return; }
      sessionStorage.removeItem(tokenKey);
      localStorage.setItem(tokenKey, token);
    } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem(tokenKey); } catch (e) {}
    try { sessionStorage.removeItem(tokenKey); } catch (e) {}
  }

  async function request(path, options) {
    const token = savedToken();
    const headers = { 'content-type': 'application/json', 'x-user-id': currentUserId(), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options && options.headers) };
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    let payload = null;
    if (response.status !== 204) { try { payload = await response.json(); } catch (e) { payload = null; } }
    if (!response.ok) {
      // A real API error always comes back as JSON with a message. Anything else
      // (an HTML 404 from a static host with no backend behind it, a proxy's 502)
      // means the Duka server itself was not reached.
      const fromApi = Boolean(payload && payload.error);
      const err = new Error(fromApi ? payload.error.message : 'The Duka.cu server is not reachable right now.');
      err.status = response.status;
      err.unreachable = !fromApi;
      throw err;
    }
    online = true;
    if (payload && payload.data && typeof payload.data.token === 'string') setToken(payload.data.token, options && options.remember);
    return payload ? payload.data : null;
  }
  const json = (method, body, extra) => ({ method, body: JSON.stringify(body || {}), ...(extra || {}) });
  async function health() { try { await request('/health'); return true; } catch (error) { online = false; return false; } }

  window.DukaApi = {
    baseUrl,
    // True when running from a developer's machine, where "start the backend" is the right advice.
    isLocalDev,
    health,
    isOnline: () => online === true,
    hasToken: () => Boolean(savedToken()),
    clearToken,
    // --- account ---
    me: () => request('/auth/me'),
    register: (data, remember) => request('/auth/register', json('POST', data, { remember })),
    login: (data, remember) => request('/auth/login', json('POST', data, { remember })),
    // Clears the token first, so the browser is signed out even if the server
    // cannot be reached, then asks the server to end the session too.
    logout: async () => { const t = savedToken(); clearToken(); try { await request('/auth/logout', { method: 'POST', headers: t ? { authorization: `Bearer ${t}` } : {} }); } catch (e) {} },
    providers: () => request('/auth/providers'),
    oauthStart: (provider, next, role) => request(`/auth/oauth/${provider}/start`, json('POST', { next, role })),
    oauthExchange: (code, remember) => request('/auth/oauth/exchange', json('POST', { code }, { remember })),
    profile: () => request('/me/profile'),
    saveProfile: (data) => request('/me/profile', json('PATCH', data)),
    preferences: () => request('/me/preferences'),
    savePreferences: (data) => request('/me/preferences', json('PUT', data)),
    budget: () => request('/me/budget'),
    saveBudget: (data) => request('/me/budget', json('PUT', data)),
    // --- market ---
    listings: () => request('/listings'),
    listing: (id) => request(`/listings/${encodeURIComponent(id)}`),
    createListing: (data) => request('/listings', json('POST', data)),
    deleteListing: (id) => request(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reportListing: (id, reason, note) => request(`/listings/${encodeURIComponent(id)}/report`, json('POST', { reason, note })),
    // --- orders ---
    createOrder: (items) => request('/orders', json('POST', { items })),
    orders: () => request('/orders'),
    order: (id) => request(`/orders/${encodeURIComponent(id)}`),
    cancelOrder: (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    config: () => request('/config'),
    // --- chat ---
    conversations: (withMessages) => request(`/conversations${withMessages ? '?include=messages' : ''}`),
    openConversation: (listingId) => request('/conversations', json('POST', { listingId })),
    sendMessage: (conversationId, text) => request(`/conversations/${encodeURIComponent(conversationId)}/messages`, json('POST', { text })),
    markRead: (conversationId) => request(`/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST' }),
    // --- riders and feedback ---
    applyToRide: (data) => request('/riders/applications', json('POST', data)),
    myRiderApplication: () => request('/riders/applications/me'),
    sendFeedback: (data) => request('/feedback', json('POST', data))
  };
})();
