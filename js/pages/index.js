
    function cardHTML(item){
      const deliveryTag = item.delivery === 'duka'
        ? '<span class="delivery_tag">Duka delivery</span>'
        : '<span class="delivery_tag self">Self pickup</span>';
      const fee = item.category === 'food' ? 500 : 2500;
      const verifiedCheck = item.verified ? '<span class="verified_check">✓</span>' : '';
      const verifyBadge = item.verified ? '<span class="verify_badge" title="Verified seller">✓</span>' : '';
      return `
        <div class="product_card sb-card">
          <div class="perf" data-sb></div>
          <a class="card_image" data-sb="image" href="product.html?id=${encodeURIComponent(item.id)}">
            ${verifyBadge}
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" onerror="imgFallback(this)">
          </a>
          <div class="card_content">
            <span class="category" data-sb>${categoryLabel(item.category)}</span>
            <h4 class="product_title" data-sb><a href="product.html?id=${encodeURIComponent(item.id)}" class="title_link">${escapeHtml(item.title)}</a></h4>
            <div class="card_meta">
              <span class="price" data-sb>${money(item.price)}</span>
              <span class="seller_row" data-sb>${verifiedCheck}<span class="seller">${escapeHtml(item.sellerName)}${item.sellerLevel ? ' · ' + escapeHtml(item.sellerLevel) : ''}</span></span>
            </div>
            <div class="delivery_row" data-sb>
              ${deliveryTag}
              <span class="fee">+${money(fee)} delivery</span>
            </div>
            <details class="contact_details" data-sb>
              <summary>Contact seller</summary>
              <ul>
                <li><b>Phone:</b> ${escapeHtml(item.phone)}</li>
                ${item.snap ? `<li><b>Snap:</b> ${escapeHtml(item.snap)}</li>` : ''}
                ${item.email ? `<li><b>School email:</b> ${escapeHtml(item.email)}</li>` : ''}
              </ul>
            </details>
            <div class="card_actions">
              <button class="btn_msg" data-sb="pop" onclick="chatOpenFromCard('${escapeHtml(item.id)}')">💬 Message</button>
              <button class="btn_view" data-sb="pop" id="btn_${escapeHtml(item.id)}" onclick="addToCart('${escapeHtml(item.id)}')"><span class="btn_label">Add to cart</span><span class="btn_check">Added ✓</span></button>
            </div>
          </div>
        </div>`;
    }

    function emptyStateHTML(msg, cta){
      return `<div class="empty_state" role="status">
        <img src="data:image/png;base64,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" alt="Duka.cu mascot">
        <p>${msg}</p>
        ${cta ? `<button class="empty_cta" onclick="resetFilters()">${cta}</button>` : ''}
      </div>`;
    }

    function resetFilters(){
      document.getElementById('searchInput').value = '';
      document.getElementById('category').value = 'all';
      document.getElementById('verification').value = 'all';
      renderGrids();
    }

    let firstGridPaint = true;

    function renderGrids(){
      const search = document.getElementById('searchInput').value.trim().toLowerCase();
      const category = document.getElementById('category').value;
      const verification = document.getElementById('verification').value;
      const sort = document.getElementById('regular_filter').value;

      let filtered = listings.filter(item => {
        if (search && !item.title.toLowerCase().includes(search)) return false;
        if (category !== 'all' && item.category !== category) return false;
        if (verification === 'verified_only' && !item.verified) return false;
        if (verification === 'unverified' && item.verified) return false;
        return true;
      });

      let market = filtered.filter(i => i.category !== 'food');
      let food = filtered.filter(i => i.category === 'food');

      const sorters = {
        newest_first: (a,b) => b.createdAt - a.createdAt,
        cheapest: (a,b) => a.price - b.price,
        most_sold: (a,b) => b.sold - a.sold,
        best_value: (a,b) => (a.price/(a.sold+1)) - (b.price/(b.sold+1)),
        verified_first: (a,b) => (b.verified - a.verified) || (b.createdAt - a.createdAt)
      };
      market.sort(sorters[sort]);

      const marketGrid = document.getElementById('marketGrid');
      const foodGrid = document.getElementById('foodGrid');
      marketGrid.innerHTML = market.length ? market.map(cardHTML).join('') : emptyStateHTML(
        '<strong>No matches yet.</strong> Try a different search or loosen a filter.',
        'Clear filters'
      );
      foodGrid.innerHTML = food.length ? food.map(cardHTML).join('') : emptyStateHTML(
        '<strong>No food on the corner right now.</strong> Check the search or filters above.',
        'Clear filters'
      );

      const totalMarket = listings.filter(i => i.category !== 'food').length;
      document.getElementById('marketCount').textContent = `${market.length} of ${totalMarket} listings`;
      document.getElementById('statListings').textContent = listings.length;
      const verifiedSellers = new Set(listings.filter(i => i.verified).map(i => i.sellerName)).size;
      document.getElementById('statVerified').textContent = verifiedSellers;

      marketGrid.classList.remove('sb-in', 'sb-out', 'grid-fade');
      foodGrid.classList.remove('sb-in', 'sb-out', 'grid-fade');
      if (window.revealInView) window.revealInView();
      if (firstGridPaint){
        firstGridPaint = false;
      } else {
        void marketGrid.offsetWidth; void foodGrid.offsetWidth;
        marketGrid.classList.add('grid-fade');
        foodGrid.classList.add('grid-fade');
      }
    }

    (function(){ const q = new URLSearchParams(location.search).get('q'); if (q) document.getElementById('searchInput').value = q.slice(0, 80); })();
    document.getElementById('searchForm').addEventListener('submit', (e) => { e.preventDefault(); recordSearch(document.getElementById('searchInput').value); renderGrids(); });

    // The x on the verification / payment banner removes the banner from the
    // page (and its "show again" bar) and remembers that on this device.
    (function(){
      const KEY = 'local:duka-trust-dismissed';
      function removeBanner(){
        ['trustStrip', 'trustRestore'].forEach(function(id){ const el = document.getElementById(id); if (el) el.remove(); });
      }
      let dismissed = false;
      try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) {}
      if (dismissed) { removeBanner(); return; }
      const close = document.getElementById('trustClose');
      if (close) close.addEventListener('click', function(){
        removeBanner();
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
      });
    })();
    document.getElementById('category').addEventListener('change', renderGrids);
    document.getElementById('verification').addEventListener('change', renderGrids);
    document.getElementById('regular_filter').addEventListener('change', renderGrids);

    (async function(){ await initShell(); await chatInit(); renderGrids(); })();

    // ---------- interactive hero mascot: draggable, follows scroll, boops on click ----------
    (function(){
      var mascot = document.getElementById('heroMascot');
      if (!mascot) return;

      // Anchor it to its current on-screen spot, then switch it to fixed
      // positioning so it stays put (relative to the viewport) as the page
      // scrolls, instead of scrolling away with the hero section.
      var rect = mascot.getBoundingClientRect();
      mascot.style.position = 'fixed';
      mascot.style.left = rect.left + 'px';
      mascot.style.top = rect.top + 'px';
      mascot.style.right = 'auto';
      mascot.style.bottom = 'auto';
      mascot.style.margin = '0';
      mascot.classList.add('mascot-live');

      // Tiny synthesized "boop" so we don't need an external audio file.
      var audioCtx = null;
      function boop(){
        try {
          audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
          var t0 = audioCtx.currentTime;
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, t0);
          osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.12);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(t0);
          osc.stop(t0 + 0.24);
        } catch (e) { /* Web Audio unavailable — silently skip the sound */ }
      }

      var dragging = false, moved = false, offsetX = 0, offsetY = 0;
      var DRAG_THRESHOLD = 6; // px of movement before a press counts as a drag, not a click

      function clamp(val, min, max){ return Math.max(min, Math.min(max, val)); }

      function onPointerDown(e){
        dragging = true; moved = false;
        var p = e.touches ? e.touches[0] : e;
        var r = mascot.getBoundingClientRect();
        offsetX = p.clientX - r.left;
        offsetY = p.clientY - r.top;
        mascot.classList.add('mascot-dragging');
        if (e.cancelable) e.preventDefault();
      }

      function onPointerMove(e){
        if (!dragging) return;
        var p = e.touches ? e.touches[0] : e;
        var newLeft = p.clientX - offsetX;
        var newTop = p.clientY - offsetY;
        var w = mascot.offsetWidth, h = mascot.offsetHeight;
        newLeft = clamp(newLeft, 0, window.innerWidth - w);
        newTop = clamp(newTop, 0, window.innerHeight - h);
        if (Math.abs(p.clientX - (offsetX + parseFloat(mascot.style.left))) > DRAG_THRESHOLD ||
            Math.abs(p.clientY - (offsetY + parseFloat(mascot.style.top))) > DRAG_THRESHOLD) {
          moved = true;
        }
        mascot.style.left = newLeft + 'px';
        mascot.style.top = newTop + 'px';
        if (e.cancelable) e.preventDefault();
      }

      function onPointerUp(){
        if (!dragging) return;
        dragging = false;
        mascot.classList.remove('mascot-dragging');
        if (!moved) boop(); // a press with no real movement counts as a click
      }

      mascot.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      mascot.addEventListener('touchstart', onPointerDown, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);

      // Keep it fully on-screen if the window gets resized.
      window.addEventListener('resize', function(){
        var w = mascot.offsetWidth, h = mascot.offsetHeight;
        mascot.style.left = clamp(parseFloat(mascot.style.left), 0, window.innerWidth - w) + 'px';
        mascot.style.top = clamp(parseFloat(mascot.style.top), 0, window.innerHeight - h) + 'px';
      });
    })();
  