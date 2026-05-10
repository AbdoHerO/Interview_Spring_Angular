// Server-backed authentication via api.php (PHP session cookie).
// Falls back to local-only mode if the API is unreachable (e.g. running from
// `python -m http.server`), so the app keeps working offline.
(function () {
  const LOCAL_FLAG = 'irh_auth_v1';

  async function jpost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  const Auth = {
    serverAvailable: null, // unknown until first call

    isLocallyFlagged() {
      return localStorage.getItem(LOCAL_FLAG) === 'ok';
    },

    /**
     * Returns true if logged in (server session OR local fallback flag).
     * Only treats HTTP 401 as "not authenticated". Any other error (network,
     * 500, timeout) falls back to the localStorage flag so a slow/broken
     * dev server does not force the user to log in again.
     */
    async isAuthenticated() {
      try {
        const res = await fetch('api.php?action=state', {
          credentials: 'include',
          signal: AbortSignal.timeout(4000), // don't block boot for more than 4s
        });
        this.serverAvailable = true;
        if (res.status === 200) return true;
        if (res.status === 401) {
          // Real 401 from server — clear stale local flag
          localStorage.removeItem(LOCAL_FLAG);
          return false;
        }
        // Any other status (500, etc.) — trust local flag
        return this.isLocallyFlagged();
      } catch {
        this.serverAvailable = false;
        return this.isLocallyFlagged();
      }
    },

    async login(user, pass) {
      // Try server first
      try {
        const r = await jpost('api.php?action=login', { user, pass });
        this.serverAvailable = true;
        if (r.ok) {
          localStorage.setItem(LOCAL_FLAG, 'ok');
          return true;
        }
        if (r.status === 401) return false;
      } catch {
        this.serverAvailable = false;
      }
      // Server unreachable -> client-side check from APP_CONFIG
      const cfg = window.APP_CONFIG.auth;
      if (user === cfg.username && pass === cfg.password) {
        localStorage.setItem(LOCAL_FLAG, 'ok');
        return true;
      }
      return false;
    },

    async logout() {
      try { await fetch('api.php?action=logout', { method: 'POST', credentials: 'include' }); } catch {}
      localStorage.removeItem(LOCAL_FLAG);
    },
  };

  window.Auth = Auth;
})();
