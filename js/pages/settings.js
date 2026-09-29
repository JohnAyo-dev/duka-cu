// Settings page: appearance, privacy, search history, purchase history,
// payment preference and feedback. Everything is built with textContent, never
// innerHTML, because search history and order titles are text people typed.
(function () {
  const $ = (id) => document.getElementById(id);
  const money2 = (n) => money(n);
  const STATUS_LABEL = { pending_payment: 'Waiting for payment', paid: 'Paid', cancelled: 'Cancelled' };

  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v); });
    kids.forEach(kid => node.append(kid));
    return node;
  }
  function flash(id, message, bad) {
    const node = $(id); node.textContent = message || ''; node.style.color = bad ? 'var(--stamp, #a8322d)' : '';
  }
  function setSwitch(button, on) { button.setAttribute('aria-checked', String(on)); button.classList.toggle('is-on', on); }

  let prefs = getPrefs();

  function applyThemeMode(mode) {
    if (mode === 'system') {
      try { localStorage.removeItem('local:duka-theme'); } catch (e) {}
      const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      const icon = document.querySelector('.theme_icon'); if (icon) icon.textContent = dark ? '☀' : '☾';
    } else { setTheme(mode); }
  }

  function renderPrefs() {
    $('setTheme').value = prefs.theme;
    setSwitch($('swHistory'), prefs.privacy.saveSearchHistory);
    setSwitch($('swEmail'), prefs.privacy.showEmailOnListings);
    $('setPay').value = prefs.payment.preferred;
  }
  function commit() { setPrefs(prefs); renderPrefs(); }

  function renderHistory() {
    const list = getSearchHistory(); const box = $('historyList'); box.textContent = '';
    if (!list.length) {
      box.append(el('p', { class: 'page_note', text: prefs.privacy.saveSearchHistory ? 'No searches yet. What you search for on the marketplace will show up here.' : 'Search history is turned off in Privacy Settings.' }));
    } else {
      const ul = el('ul', { class: 'set_list' });
      list.forEach(item => {
        const when = new Date(item.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
        ul.append(el('li', {}, el('a', { href: 'index.html?q=' + encodeURIComponent(item.q), text: item.q }), el('span', { class: 'set_when', text: when })));
      });
      box.append(ul);
    }
    $('clearHistory').hidden = !list.length;
  }

  async function renderOrders() {
    const box = $('ordersList'); box.textContent = '';
    if (!sessionProfile) {
      box.append(el('p', { class: 'page_note' }, 'Sign in to see your orders. ', el('a', { href: 'login.html?next=settings.html', text: 'Sign in →' })));
      return;
    }
    try {
      const orders = await DukaApi.orders();
      if (!orders.length) { box.append(el('p', { class: 'page_note', text: 'No orders yet. When you check out from your cart, they appear here.' })); return; }
      const ul = el('ul', { class: 'set_list' });
      orders.forEach(order => {
        const summary = order.items.map(i => `${i.title}${i.quantity > 1 ? ' × ' + i.quantity : ''}`).join(', ');
        const meta = `${new Date(order.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · ${money2(order.total)}${order.deliveryFee ? ` (incl. ${money2(order.deliveryFee)} delivery)` : ''}`;
        const li = el('li', { class: 'set_order' },
          el('div', {}, el('strong', { text: summary }), el('span', { class: 'set_when', text: meta })),
          el('span', { class: 'set_pill set_pill_' + order.status, text: STATUS_LABEL[order.status] || order.status }));
        ul.append(li);
      });
      box.append(ul);
    } catch (e) { box.append(el('p', { class: 'page_note', text: 'Could not load your orders right now.' })); }
  }

  async function renderPayStatus() {
    try {
      const config = await DukaApi.config();
      $('payStatus').textContent = config.paymentsLive ? 'Online payment is switched on.' : 'Online payment is not switched on for this site yet.';
    } catch (e) { $('payStatus').textContent = 'Could not check payment status.'; }
  }

  function wire() {
    $('setTheme').addEventListener('change', (e) => { prefs.theme = e.target.value; applyThemeMode(prefs.theme); commit(); });
    $('swHistory').addEventListener('click', () => { prefs.privacy.saveSearchHistory = !prefs.privacy.saveSearchHistory; commit(); renderHistory(); });
    $('swEmail').addEventListener('click', () => { prefs.privacy.showEmailOnListings = !prefs.privacy.showEmailOnListings; commit(); });
    $('setPay').addEventListener('change', (e) => { prefs.payment.preferred = e.target.value; commit(); });
    $('clearHistory').addEventListener('click', () => { saveSearchHistory([]); renderHistory(); });
    $('setRole').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      try { await DukaApi.saveProfile({ role: e.target.value }); flash('settingsStatus', 'Saved.'); }
      catch (err) { flash('settingsStatus', err.message, true); }
    });
    $('feedbackForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = $('fbMessage').value.trim();
      if (message.length < 5) { flash('fbStatus', 'Tell us a little more (at least 5 characters).', true); return; }
      const button = $('fbSend'); button.disabled = true; flash('fbStatus', 'Sending…');
      try {
        await DukaApi.sendFeedback({ category: $('fbCategory').value, message, contact: $('fbContact').value.trim(), page: 'settings.html' });
        $('fbMessage').value = ''; flash('fbStatus', 'Thank you. Your feedback was sent.');
      } catch (err) {
        flash('fbStatus', err instanceof TypeError ? 'Could not reach the server. Your message was not sent; try again in a moment.' : err.message, true);
      } finally { button.disabled = false; }
    });
  }

  (async function start() {
    await initShell();
    await chatInit();
    // A signed-in person's saved preferences win over this device's copy.
    if (sessionProfile) {
      try { prefs = mergePrefs(prefs, await DukaApi.preferences()); localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
      $('roleRow').hidden = false; $('setRole').value = (sessionProfile.user && sessionProfile.user.role) || '';
    }
    renderPrefs(); renderHistory(); wire();
    renderOrders(); renderPayStatus();
  })();
})();
