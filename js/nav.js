
    // ===== Duka.cu navigation drawer =====
    // Standalone on purpose: budget.html does not load app.js, so this module
    // must not depend on anything defined in there. It injects a hamburger at
    // the far right of the header plus the slide-in drawer that holds the
    // account / settings / data / account-action menu.

    (function(){
      var SETTINGS_PAGE = 'settings.html';
      // Per-device keys. Deliberately excludes duka-listings, which is
      // marketplace content rather than the user's own data.
      var ACCOUNT_KEYS = ['duka-account', 'duka-cart', 'duka-chat', 'duka-search-history', 'duka-budget'];
      var TOKEN_KEY = 'local:duka-api-token';

      // Same rule as js/api.js: same-origin when the backend serves the pages.
      function apiBase(){
        if (window.DUKA_API_BASE) return window.DUKA_API_BASE;
        return (/^https?:$/.test(location.protocol) && location.port === '3000') ? '/api/v1' : 'http://127.0.0.1:3000/api/v1';
      }
      function savedToken(){
        try{ return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); }catch(e){ return null; }
      }
      // Ends the session: the token is removed from the browser first, so the
      // person is signed out even when the server cannot be reached. Without
      // this, login.html finds the old token and bounces straight back home.
      function endSession(){
        var token = savedToken();
        try{ localStorage.removeItem(TOKEN_KEY); }catch(e){}
        try{ sessionStorage.removeItem(TOKEN_KEY); }catch(e){}
        if (!token || !window.fetch) return Promise.resolve();
        return fetch(apiBase() + '/auth/logout', { method:'POST', headers:{ authorization:'Bearer ' + token, 'content-type':'application/json' }, keepalive:true }).catch(function(){});
      }

      // Icons are drawn here as inline SVG (24x24 grid, 1.8px round strokes,
      // currentColor) so they follow the theme and stay crisp at any size.
      var ICON_PATHS = {
        user:     '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-3.6 3.6-5.6 7.5-5.6s6.9 2 7.5 5.6"/>',
        sliders:  '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
        wallet:   '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v1.5"/><path d="M4 8.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.5H6.5A2.5 2.5 0 0 1 4 8.5Z"/><circle cx="15.8" cy="14.3" r="1.1"/>',
        scooter:  '<circle cx="6" cy="17" r="2.6"/><circle cx="18" cy="17" r="2.6"/><path d="M8.6 17H14l2.2-8H13"/><path d="M15.4 6.5h2.6"/><path d="M6 14.4V9.5h4"/>',
        lock:     '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.3 10.5V8a3.7 3.7 0 0 1 7.4 0v2.5"/><circle cx="12" cy="15.2" r="1.1"/>',
        clock:    '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 2"/>',
        receipt:  '<path d="M6 3.8h12v16.4l-2.4-1.6-2.3 1.6-2.3-1.6-2.3 1.6L6 20.2Z"/><path d="M9.2 8.6h5.6M9.2 12h5.6"/>',
        card:     '<rect x="3.5" y="5.5" width="17" height="13" rx="2.4"/><path d="M3.5 10h17M7 14.8h3"/>',
        chat:     '<path d="M5 5h14a1.8 1.8 0 0 1 1.8 1.8v8.4A1.8 1.8 0 0 1 19 17h-7l-4.6 3.4V17H5a1.8 1.8 0 0 1-1.8-1.8V6.8A1.8 1.8 0 0 1 5 5Z"/><path d="M8.2 9.4h7.6M8.2 12.6h4.6"/>',
        logout:   '<path d="M10 4.5H6.5A1.8 1.8 0 0 0 4.7 6.3v11.4a1.8 1.8 0 0 0 1.8 1.8H10"/><path d="M14.5 8l4 4-4 4M18.5 12H9.5"/>',
        trash:    '<path d="M4.5 7h15M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.4 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12"/><path d="M10 11v5.5M14 11v5.5"/>',
        close:    '<path d="M6 6l12 12M18 6L6 18"/>'
      };
      function svgIcon(name){
        return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
      }

      function esc(s){
        return String(s).replace(/[&<>"']/g, function(ch){
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
      }
      function baseName(path){ return String(path || '').split('/').pop().split('?')[0].split('#')[0]; }

      function clearAccountKeys(){
        ACCOUNT_KEYS.forEach(function(key){
          try{ localStorage.removeItem('local:' + key); }catch(e){ /* storage blocked */ }
        });
      }

      function doLogout(){
        if (!confirm('Log out of Duka.cu on this device? Your listings stay put.')) return;
        clearAccountKeys();
        endSession().then(function(){ window.location.href = 'index.html'; });
      }

      function doDeleteAccount(){
        if (!confirm('Delete your account and its data on this device?\n\nThis clears your name, email, cart and chat history. It cannot be undone.')) return;
        if (!confirm('Last chance — really delete your account?')) return;
        clearAccountKeys();
        endSession().then(function(){ window.location.href = 'index.html'; });
      }

      // Order here is the order shown in the drawer.
      var ITEMS = [
        { id:'account',          icon:'user',    label:'Profile',             href:'profile.html' },
        { id:'budget',           icon:'wallet',  label:'Budget',              href:'budget.html' },
        { id:'riders',           icon:'scooter', label:'Ride for Duka',       href:'riders.html' },
        { id:'settings',         icon:'sliders', label:'Settings',            href:SETTINGS_PAGE + '#settings', divider:true },
        { id:'privacy',          icon:'lock',    label:'Privacy Settings',    href:SETTINGS_PAGE + '#privacy' },
        { id:'search-history',   icon:'clock',   label:'Search History',      href:SETTINGS_PAGE + '#search-history' },
        { id:'purchase-history', icon:'receipt', label:'Purchase History',    href:SETTINGS_PAGE + '#purchase-history' },
        { id:'payment',          icon:'card',    label:'Payment Information', href:SETTINGS_PAGE + '#payment-information' },
        { id:'feedback',         icon:'chat',    label:'Feedback',            href:SETTINGS_PAGE + '#feedback', divider:true },
        { id:'logout',           icon:'logout',  label:'Log out',             action:doLogout },
        { id:'delete',           icon:'trash',   label:'Delete Account',      action:doDeleteAccount, danger:true }
      ];

      var burger, scrim, drawer, list, closeBtn, lastFocus = null;

      function currentPage(){ return baseName(window.location.pathname) || 'index.html'; }

      function buildList(){
        var here = currentPage();
        list.innerHTML = ITEMS.map(function(item){
          var divider = item.divider ? '<div class="nav_divider" role="separator"></div>' : '';
          var inner = '<span class="nav_icon" aria-hidden="true">' + svgIcon(item.icon) + '</span>' +
                      '<span class="nav_label">' + esc(item.label) + '</span>';
          if (item.action){
            return divider + '<button class="nav_item nav_action' + (item.danger ? ' nav_danger' : '') +
              '" type="button" data-nav-action="' + esc(item.id) + '">' + inner + '</button>';
          }
          var active = baseName(item.href) === here;
          return divider + '<a class="nav_item' + (active ? ' is-active' : '') + '" href="' + esc(item.href) + '">' + inner + '</a>';
        }).join('');
      }

      function isOpen(){ return drawer.classList.contains('is-open'); }

      function openDrawer(){
        if (isOpen()) return;
        lastFocus = document.activeElement;
        scrim.classList.add('is-open');
        drawer.classList.add('is-open');
        burger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('nav_locked');
        closeBtn.focus();
      }

      function closeDrawer(){
        if (!isOpen()) return;
        scrim.classList.remove('is-open');
        drawer.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav_locked');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        lastFocus = null;
      }

      function mount(){
        var header = document.querySelector('.header');
        if (!header || document.getElementById('navDrawer')) return;

        burger = document.createElement('button');
        burger.type = 'button';
        burger.id = 'navBurger';
        burger.className = 'nav_burger';
        burger.setAttribute('aria-label', 'Open menu');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-controls', 'navDrawer');
        burger.innerHTML = '<span></span><span></span><span></span>';

        scrim = document.createElement('div');
        scrim.id = 'navScrim';
        scrim.className = 'nav_scrim';

        drawer = document.createElement('aside');
        drawer.id = 'navDrawer';
        drawer.className = 'nav_drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Menu');
        drawer.innerHTML =
          '<div class="nav_drawer_head">' +
            '<span class="nav_drawer_title">Duka.cu</span>' +
            '<button class="nav_close" id="navClose" type="button" aria-label="Close menu">' + svgIcon('close') + '</button>' +
          '</div>' +
          '<nav class="nav_drawer_list" id="navDrawerList"></nav>';

        closeBtn = drawer.querySelector('#navClose');
        list = drawer.querySelector('#navDrawerList');
        buildList();

        document.body.appendChild(scrim);
        document.body.appendChild(drawer);
        header.appendChild(burger);

        burger.addEventListener('click', function(){
          if (isOpen()) closeDrawer(); else openDrawer();
        });
        closeBtn.addEventListener('click', closeDrawer);
        scrim.addEventListener('click', closeDrawer);

        // Any link inside the drawer closes it so the page can navigate cleanly.
        drawer.addEventListener('click', function(e){
          var link = e.target.closest('.nav_item[href]');
          if (link) closeDrawer();
        });

        list.addEventListener('click', function(e){
          var btn = e.target.closest('[data-nav-action]');
          if (!btn) return;
          var item = ITEMS.filter(function(i){ return i.id === btn.dataset.navAction; })[0];
          if (item && item.action){ closeDrawer(); item.action(); }
        });

        document.addEventListener('keydown', function(e){
          if (e.key === 'Escape') closeDrawer();
          if (e.key === 'Tab' && isOpen()) trapFocus(e);
        });

        window.addEventListener('resize', function(){
          if (isOpen() && window.innerWidth > 900) closeDrawer();
        });
      }

      // Keep Tab inside the drawer while it is open.
      function trapFocus(e){
        var focusables = drawer.querySelectorAll('a[href], button:not([disabled])');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
      else mount();
    })();
