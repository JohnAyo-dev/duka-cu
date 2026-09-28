
    // ===== Duka.cu navigation drawer =====
    // Standalone on purpose: budget.html does not load app.js, so this module
    // must not depend on anything defined in there. It injects a hamburger at
    // the far right of the header plus the slide-in drawer that holds the
    // account / settings / data / account-action menu.

    (function(){
      var SETTINGS_PAGE = 'settings.html';
      // Per-device keys. Deliberately excludes duka-listings, which is
      // marketplace content rather than the user's own data.
      var ACCOUNT_KEYS = ['duka-account', 'duka-cart', 'duka-chat'];

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
        window.location.href = 'index.html';
      }

      function doDeleteAccount(){
        if (!confirm('Delete your account and its data on this device?\n\nThis clears your name, email, cart and chat history. It cannot be undone.')) return;
        if (!confirm('Last chance — really delete your account?')) return;
        clearAccountKeys();
        window.location.href = 'index.html';
      }

      // Order here is the order shown in the drawer.
      var ITEMS = [
        { id:'account',          icon:'👤', label:'Profile',            href:'profile.html' },
        { id:'settings',         icon:'⚙️', label:'Settings',           href:SETTINGS_PAGE + '#settings' },
        { id:'budget',           icon:'💸', label:'Budget',             href:'budget.html' },
        { id:'riders',           icon:'🛵', label:'Ride for Duka',      href:'riders.html' },
        { id:'privacy',          icon:'🔒', label:'Privacy Settings',   href:SETTINGS_PAGE + '#privacy' },
        { id:'search-history',   icon:'🕘', label:'Search History',     href:SETTINGS_PAGE + '#search-history' },
        { id:'purchase-history', icon:'🧾', label:'Purchase History',   href:SETTINGS_PAGE + '#purchase-history' },
        { id:'payment',          icon:'💳', label:'Payment Information',href:SETTINGS_PAGE + '#payment-information' },
        { id:'feedback',         icon:'💬', label:'Feedback',           href:SETTINGS_PAGE + '#feedback', divider:true },
        { id:'logout',           icon:'↩',  label:'Log out',            action:doLogout },
        { id:'delete',           icon:'🗑', label:'Delete Account',     action:doDeleteAccount, danger:true }
      ];

      var burger, scrim, drawer, list, closeBtn, lastFocus = null;

      function currentPage(){ return baseName(window.location.pathname) || 'index.html'; }

      function buildList(){
        var here = currentPage();
        list.innerHTML = ITEMS.map(function(item){
          var divider = item.divider ? '<div class="nav_divider" role="separator"></div>' : '';
          var inner = '<span class="nav_icon" aria-hidden="true">' + item.icon + '</span>' +
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
            '<button class="nav_close" id="navClose" type="button" aria-label="Close menu">✕</button>' +
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
