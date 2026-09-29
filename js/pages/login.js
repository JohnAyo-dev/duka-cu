// Sign-in, registration and provider handling for login.html.
(function () {
  const $ = (id) => document.getElementById(id);
  const alertBox = $('loginAlert');
  const providerNote = $('providerNote');
  const forms = { login: $('loginForm'), register: $('registerForm') };
  // Carries the "keep me signed in" choice across the provider redirect.
  const REMEMBER_KEY = 'duka-oauth-remember';
  const ROLE_NAMES = { buyer: 'buyer', seller: 'seller' };

  // Where the user was heading. Only a bare page name is honoured, so `?next=`
  // cannot be used to send someone off to another site after they sign in. It
  // stays *relative* (no leading slash) so it works from any folder the site
  // is served out of, and from file:// too.
  const params = new URLSearchParams(location.search);
  const rawNext = (params.get('next') || '').replace(/^\//, '');
  const explicitNext = /^[A-Za-z0-9_-]+\.html$/.test(rawNext) ? rawNext : '';

  let mode = 'login';
  let role = '';

  function showAlert(message, good) {
    if (!message) { alertBox.hidden = true; alertBox.textContent = ''; return; }
    alertBox.hidden = false;
    alertBox.textContent = message;
    alertBox.classList.toggle('is-good', Boolean(good));
  }

  function busy(form, on) {
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = on; button.textContent = on ? 'Working…' : button.dataset.label; }
  }

  // New sellers land on the page where they post their first listing; everyone
  // else goes back to where they were headed, or the marketplace.
  function destination(justRegistered) {
    if (explicitNext) return explicitNext;
    return justRegistered && role === 'seller' ? 'sell.html' : 'index.html';
  }
  function goHome(justRegistered) { location.replace(destination(justRegistered)); }

  // One place decides what is visible, so the steps can never disagree.
  function render() {
    const login = mode === 'login';
    const needsRole = !login && !role;
    $('tabLogin').classList.toggle('is-active', login);
    $('tabRegister').classList.toggle('is-active', !login);
    $('tabLogin').setAttribute('aria-selected', String(login));
    $('tabRegister').setAttribute('aria-selected', String(!login));
    forms.login.hidden = !login;
    $('roleStep').hidden = !needsRole;
    $('roleChip').hidden = login || needsRole;
    forms.register.hidden = login || needsRole;
    $('providerBlock').hidden = needsRole;
    if (role) $('roleLabel').textContent = ROLE_NAMES[role];
    $('loginNote').textContent = login
      ? 'Your Duka.cu account keeps your listings, orders and messages in one place.'
      : (needsRole ? '' : 'Create your Duka.cu account. It takes about twenty seconds.');
    $('loginNote').hidden = needsRole;
  }

  function setMode(next) {
    mode = next;
    showAlert('');
    render();
    if (next === 'login') $('loginEmail').focus();
    else if (role) $('regName').focus();
  }

  function chooseRole(value) {
    role = ROLE_NAMES[value] || '';
    render();
    if (role) $('regName').focus();
  }

  async function submit(which, form) {
    const button = form.querySelector('button[type="submit"]');
    button.dataset.label = button.textContent;
    busy(form, true);
    showAlert('');
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const remember = (which === 'login' ? $('remember') : $('regRemember')).checked;
      if (which === 'register') {
        data.username = data.username.trim().toLowerCase();
        data.role = role;
        await window.DukaApi.register(data, remember);
      } else {
        await window.DukaApi.login({ email: data.email, password: data.password }, remember);
      }
      goHome(which === 'register');
    } catch (error) {
      // fetch() throws a bare TypeError when the server cannot be reached at all.
      const unreachable = error instanceof TypeError;
      showAlert(unreachable ? 'Could not reach the Duka.cu server. Start it with "npm start" and open http://localhost:3000.' : (error.message || 'That did not work. Please try again.'));
      busy(form, false);
    }
  }

  // Reads which providers actually have credentials, so the buttons say the
  // truth rather than failing when clicked.
  async function loadProviders() {
    const buttons = Array.from(document.querySelectorAll('.provider_btn[data-provider]'));
    try {
      const { providers } = await window.DukaApi.providers();
      const live = [];
      providers.forEach(provider => {
        const button = buttons.find(b => b.dataset.provider === provider.name);
        if (!button) return;
        if (provider.configured) { live.push(provider.label); return; }
        button.disabled = true;
        button.title = `${provider.label} sign-in is not configured on this server yet.`;
      });
      if (live.length) providerNote.textContent = `Also available: ${live.join(', ')}.`;
      else providerNote.textContent = 'Email and password work right now. Google and Apple sign-in switch on once their keys are added to the server (see claude.md).';
    } catch (error) {
      providerNote.textContent = 'Could not reach the sign-in service. Start the Duka.cu backend (npm start) and reload.';
      buttons.forEach(b => { b.disabled = true; });
    }
  }

  async function startProvider(name, button) {
    const label = button.querySelector('.provider_label').textContent;
    button.disabled = true;
    // The choice is made before the browser leaves, and the return trip is a
    // redirect that can only carry the one-time code, so the preference has to
    // be parked here in the meantime.
    try { sessionStorage.setItem(REMEMBER_KEY, (mode === 'login' ? $('remember') : $('regRemember')).checked ? '1' : '0'); } catch (e) {}
    try {
      const next = new URL(destination(mode === 'register'), location.href).href;
      const { authorizeUrl } = await window.DukaApi.oauthStart(name, next, mode === 'register' ? role : '');
      location.assign(authorizeUrl);
    } catch (error) {
      // 501 from the server means the provider has no credentials yet. Say
      // exactly that rather than pretending the click failed for no reason.
      showAlert(error.message || `${label} sign-in is unavailable.`);
      button.disabled = false;
    }
  }

  // Drops the one-time code from the address bar once it has been spent or has
  // failed, so it cannot be replayed from history.
  function clearCodeFromUrl() {
    const p = new URLSearchParams(location.search);
    p.delete('oauth_code');
    p.delete('oauth_error');
    const query = p.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
  }

  // The provider sends the browser back here with a single-use code instead of
  // a bearer token, so nothing sensitive ends up in browser history.
  async function completeProvider() {
    const failure = params.get('oauth_error');
    if (failure) { showAlert(failure); clearCodeFromUrl(); return false; }
    const code = params.get('oauth_code');
    if (!code) return false;
    let remember = true;
    try { remember = sessionStorage.getItem(REMEMBER_KEY) !== '0'; sessionStorage.removeItem(REMEMBER_KEY); } catch (e) {}
    clearCodeFromUrl();
    try {
      await window.DukaApi.oauthExchange(code, remember);
      goHome(false);
      return true;
    } catch (error) {
      showAlert(error.message || 'That sign-in could not be completed. Please try again.');
      return false;
    }
  }

  // Someone who is already signed in is told so and given a choice. Silently
  // redirecting them away (the old behaviour) made the form vanish the moment
  // it appeared, and left no way to switch accounts.
  function showSignedIn(user) {
    ['tabLogin', 'tabRegister'].forEach(id => { $(id).parentElement.hidden = true; });
    ['loginNote', 'roleStep', 'roleChip', 'providerBlock'].forEach(id => { $(id).hidden = true; });
    forms.login.hidden = true; forms.register.hidden = true;
    $('signedInText').textContent = `You're signed in as ${user.name || user.email}.`;
    $('signedInContinue').href = explicitNext || 'index.html';
    $('signedInPanel').hidden = false;
  }
  $('signedInSwitch').addEventListener('click', async () => {
    await window.DukaApi.logout();
    location.replace('login.html' + (explicitNext ? `?next=${encodeURIComponent(explicitNext)}` : ''));
  });

  $('tabLogin').addEventListener('click', () => setMode('login'));
  $('tabRegister').addEventListener('click', () => setMode('register'));
  document.querySelectorAll('.role_option').forEach(b => b.addEventListener('click', () => chooseRole(b.dataset.role)));
  $('roleChange').addEventListener('click', () => { role = ''; render(); });
  forms.login.addEventListener('submit', (e) => { e.preventDefault(); submit('login', forms.login); });
  forms.register.addEventListener('submit', (e) => { e.preventDefault(); submit('register', forms.register); });
  document.querySelectorAll('.provider_btn[data-provider]').forEach(button => {
    button.addEventListener('click', () => startProvider(button.dataset.provider, button));
  });

  (async function start() {
    mode = params.get('mode') === 'register' ? 'register' : 'login';
    render();
    if (await completeProvider()) return;
    if (window.DukaApi.hasToken()) {
      try { const { user } = await window.DukaApi.me().then(u => ({ user: u.user || u })); showSignedIn(user); return; }
      catch (error) { if (error.status === 401) window.DukaApi.clearToken(); }
    }
    await loadProviders();
  })();
})();
