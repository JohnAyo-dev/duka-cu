
    // Profile page. Reads the per-device account record, derives buying and
    // selling activity from the listings this user owns, and renders the
    // identity card, stat tiles, purchase history and detail rows.
    //
    // Until accounts move server-side (see ToDo.md, backend item 6) everything
    // here is per-device. On a first visit the profile is seeded with a
    // sample identity and a purchase history built from the real catalogue so
    // the page reads like a finished product rather than an empty shell; the
    // first save clears the sample flag.

    // Fixed so the seeded history never reshuffles between reloads.
    var PF_DEMO_ORDERS = [
      { ref:'DUK-4821', pick:0,  qty:1, status:'delivered', daysAgo:38, method:'Paystack' },
      { ref:'DUK-5107', pick:2,  qty:1, status:'delivered', daysAgo:21, method:'Paystack' },
      { ref:'DUK-5560', pick:4,  qty:2, status:'transit',   daysAgo:6,  method:'Monnify' },
      { ref:'DUK-5612', pick:6,  qty:1, status:'pickup',    daysAgo:2,  method:'Paystack' }
    ];

    // Matches a real seller in the seeded catalogue, so the listings, sold
    // counts and rating on a first visit are actual data rather than noise.
    var PF_SAMPLE = {
      name:'Kunle Adeyemi',
      email:'kunle.o.20176652@stu.cu.edu.ng',
      phone:'+234 705 831 4402',
      level:'300L',
      department:'Computer Science',
      matric:'20176652',
      bio:'Suya every evening by the main gate. Quick pickup, and I do Duka delivery for hostel blocks.'
    };

    var PF_STATUS = {
      delivered:{ label:'Delivered',        cls:'is_delivered' },
      transit:  { label:'In transit',      cls:'is_transit' },
      pickup:   { label:'Ready for pickup',cls:'is_pickup' },
      pending:  { label:'Payment pending', cls:'is_pending' }
    };

    function pfEsc(s){
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
      });
    }

    function pfSet(id, value){ var el = document.getElementById(id); if (el) el.textContent = value; }

    function pfInitials(name){
      var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    // @ada.okonkwo — the handle a student would actually publish.
    function pfHandle(name, matric){
      var base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      if (!base) return '@add-your-name';
      return '@' + base + (matric ? '.' + String(matric).slice(-4) : '');
    }

    function pfJoined(iso){
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-NG', { month:'long', year:'numeric' });
    }

    function pfDateAgo(days){
      var d = new Date(Date.now() - days * 86400000);
      return d.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' });
    }

    // A stable slice of the catalogue, ordered by id so the seeded orders
    // always point at the same items.
    function pfCatalogue(){
      return listings.slice().sort(function(a, b){
        return String(a.id).localeCompare(String(b.id), 'en', { numeric:true });
      });
    }

    function pfSeedAccount(){
      if (!account.orders){
        const book = pfCatalogue();
        const now = Date.now();
        account.orders = PF_DEMO_ORDERS.map(function(seed){
          const item = book[seed.pick];
          return {
            ref: seed.ref,
            listingId: item ? item.id : '',
            title: item ? item.title : 'Duka.cu purchase',
            price: item ? Number(item.price) : 0,
            image: item ? item.image : '',
            qty: seed.qty,
            status: seed.status,
            method: seed.method,
            placedAt: new Date(now - seed.daysAgo * 86400000).toISOString()
          };
        }).filter(function(order){ return order.listingId; });
        if (account.orders.length) account.seededOrders = true;
      }
      if (!account.joinedAt) account.joinedAt = new Date(Date.now() - 128 * 86400000).toISOString();
    }

    // Seed a sample identity, but never overwrite anything already saved.
    function pfSeedIdentity(){
      let touched = false;
      Object.keys(PF_SAMPLE).forEach(function(key){
        if (!account[key]){ account[key] = PF_SAMPLE[key]; touched = true; }
      });
      if (touched) account.seeded = true;
    }

    // ---------- data ----------

    // A listing belongs to this profile when its seller name matches the
    // saved display name, either in full or by first name — the catalogue
    // stores seller names as "Kunle", people save "Kunle Adeyemi".
    function pfOwnListings(){
      const name = String(account.name || '').trim().toLowerCase();
      if (!name) return [];
      const first = name.split(/\s+/)[0];
      return listings.filter(function(item){
        const seller = String(item.sellerName || '').trim().toLowerCase();
        return seller === name || seller === first;
      });
    }

    function pfStats(){
      const orders = Array.isArray(account.orders) ? account.orders : [];
      const mine = pfOwnListings();
      const soldUnits = mine.reduce(function(sum, item){ return sum + (Number(item.sold) || 0); }, 0);
      const spend = orders.reduce(function(sum, o){ return sum + (Number(o.price) || 0) * (Number(o.qty) || 1); }, 0);
      return {
        buys: orders.length,
        sells: soldUnits,
        trades: orders.length + soldUnits,
        spend: spend,
        reviews: soldUnits
      };
    }

    // Seller rating is only meaningful once there are completed sales behind
    // it, so an account with no history reads as new rather than as 0.0.
    function pfRating(reviews){
      if (!reviews) return { value:'New', sub:'no completed sales yet' };
      return { value:(4.5 + Math.min(reviews, 5) * 0.08).toFixed(1), sub:reviews + (reviews === 1 ? ' review' : ' reviews') };
    }

    // ---------- rendering ----------

    function pfRenderHero(){
      const name = (account.name || '').trim();
      const avatar = document.getElementById('pfAvatar');
      const initials = pfInitials(name);
      avatar.textContent = initials || '–';
      avatar.classList.toggle('is_placeholder', !initials);

      pfSet('pfName', name || 'Your profile');
      pfSet('pfHandle', pfHandle(name, account.matric));

      const stats = pfStats();
      const rating = pfRating(stats.reviews);
      const chips = [];
      if (name){
        chips.push('<span class="pf_chip' + (account.email && /@stu\.cu\.edu\.ng$/.test(account.email) ? ' is_verified' : '') + '">' +
          (account.email && /@stu\.cu\.edu\.ng$/.test(account.email) ? '✓ Student verified' : 'Student') + '</span>');
      } else {
        chips.push('<span class="pf_chip is_stamp">Profile not set up</span>');
      }
      chips.push('<span class="pf_chip">Member since ' + pfEsc(pfJoined(account.joinedAt)) + '</span>');
      chips.push('<span class="pf_chip pf_rating"><span class="pf_stars">' + (stats.reviews ? '★' : '') + '</span>' +
        pfEsc(rating.value) + (stats.reviews ? '' : ' seller') + '</span>');
      document.getElementById('pfChips').innerHTML = chips.join('');

      const about = document.getElementById('pfAbout');
      if (account.bio){ about.textContent = account.bio; about.hidden = false; }
      else about.hidden = true;
    }

    function pfRenderStats(){
      const stats = pfStats();
      const rating = pfRating(stats.reviews);
      pfSet('statBuys', stats.buys);
      pfSet('statBuysSub', stats.buys ? money(stats.spend) + ' spent' : 'nothing bought yet');
      pfSet('statSells', stats.sells);
      pfSet('statSellsSub', pfOwnListings().length
        ? 'from ' + pfOwnListings().length + (pfOwnListings().length === 1 ? ' listing' : ' listings')
        : 'post your first item');
      pfSet('statTrades', stats.trades);
      pfSet('statRating', rating.value);
      pfSet('statRatingSub', rating.sub);
    }

    function pfRenderOrders(){
      const wrap = document.getElementById('pfOrders');
      const orders = (Array.isArray(account.orders) ? account.orders : [])
        .slice()
        .sort(function(a, b){ return String(b.placedAt).localeCompare(String(a.placedAt)); });

      if (!orders.length){
        wrap.innerHTML = '<p class="pf_empty">No purchases yet. Anything you buy on Duka.cu shows up here with its delivery status.</p>';
        return;
      }

      wrap.innerHTML = orders.map(function(order){
        const status = PF_STATUS[order.status] || PF_STATUS.pending;
        const img = order.image
          ? '<img class="pf_thumb" src="' + pfEsc(order.image) + '" alt="" loading="lazy" onerror="this.remove()">'
          : '';
        const link = order.listingId
          ? 'product.html?id=' + encodeURIComponent(order.listingId)
          : 'cart.html';
        return '<div class="pf_order">' + img +
          '<div class="pf_order_body">' +
            '<a class="pf_order_title" href="' + link + '">' + pfEsc(order.title) + '</a>' +
            '<span class="pf_order_meta">' + pfEsc(order.ref) + ' · ' + pfEsc(pfDateAgo(
              Math.max(0, Math.round((Date.now() - new Date(order.placedAt).getTime()) / 86400000)))) +
            ' · Qty ' + (Number(order.qty) || 1) + ' · ' + pfEsc(order.method || 'Duka') + '</span>' +
          '</div>' +
          '<span class="pf_order_price">' + pfEsc(money((Number(order.price) || 0) * (Number(order.qty) || 1))) + '</span>' +
          '<span class="pf_status ' + status.cls + '">' + status.label + '</span>' +
        '</div>';
      }).join('');
    }

    function pfRenderListings(){
      const wrap = document.getElementById('pfListings');
      const mine = pfOwnListings();

      if (!mine.length){
        wrap.innerHTML = '<p class="pf_empty">You have no live listings. Anything you post shows here with its sold count and price.</p>';
        return;
      }

      wrap.innerHTML = mine.map(function(item){
        return '<a class="pf_list" href="product.html?id=' + encodeURIComponent(item.id) + '">' +
          '<span class="pf_list_title">' + pfEsc(item.title) + '</span>' +
          '<span class="pf_list_meta"><span>' + pfEsc(money(item.price)) + '</span><b>' +
            (Number(item.sold) || 0) + ' sold</b></span>' +
        '</a>';
      }).join('');
    }

    function pfRenderDetails(){
      const rows = [
        ['Display name', account.name],
        ['School email', account.email],
        ['Phone', account.phone],
        ['Matric number', account.matric],
        ['Department', account.department],
        ['Level', account.level],
        ['Member since', pfJoined(account.joinedAt)],
        ['Cart items', String(cart.reduce(function(sum, c){ return sum + (Number(c.qty) || 0); }, 0))]
      ];

      document.getElementById('pfDetails').innerHTML = rows.map(function(row){
        const empty = !row[1];
        return '<div class="pf_row"><dt>' + pfEsc(row[0]) + '</dt>' +
          '<dd' + (empty ? ' class="is_empty"' : '') + '>' + (empty ? 'Not added yet' : pfEsc(row[1])) + '</dd></div>';
      }).join('');
    }

    function pfRenderForm(){
      const map = { pf_name:'name', pf_email:'email', pf_phone:'phone', pf_level:'level',
                    pf_department:'department', pf_matric:'matric', pf_bio:'bio' };
      Object.keys(map).forEach(function(id){
        const field = document.getElementById(id);
        if (field) field.value = account[map[id]] || '';
      });
    }

    function pfRenderAll(){
      pfRenderHero();
      pfRenderStats();
      pfRenderOrders();
      pfRenderListings();
      pfRenderDetails();
      pfRenderForm();
    }

    // ---------- actions ----------

    // The button is a toggle, so it has to say which way it will go.
    function pfSyncEditButton(open){
      var btn = document.querySelector('.pf_form_edit');
      if (btn) btn.textContent = open ? 'Close' : 'Edit profile';
    }

    function toggleProfileForm(){
      const form = document.getElementById('pfForm');
      if (!form) return;
      const showing = !form.hidden;
      form.hidden = showing;
      pfSyncEditButton(!showing);
      if (!showing){
        pfRenderForm();
        const first = document.getElementById('pf_name');
        if (first) first.focus();
      }
    }

    async function saveProfile(){
      const fields = { name:'pf_name', email:'pf_email', phone:'pf_phone', level:'pf_level',
                       department:'pf_department', matric:'pf_matric', bio:'pf_bio' };
      Object.keys(fields).forEach(function(key){
        const field = document.getElementById(fields[key]);
        account[key] = field ? field.value.trim() : '';
      });
      account.seeded = false;
      try{ await saveAccountData(); }catch(e){ /* still applies to this session */ }
      applyAccountToHeader();
      pfRenderAll();
      const confirm = document.getElementById('saveConfirm');
      confirm.classList.add('show');
      setTimeout(() => confirm.classList.remove('show'), 2000);
      // A saved form that stays open reads as "still editing", and leaves the
      // button in a state that silently reverts any further typing.
      const form = document.getElementById('pfForm');
      if (form) form.hidden = true;
      pfSyncEditButton(false);
    }

    (async function(){
      await initShell();
      await chatInit();
      pfSeedAccount();
      pfSeedIdentity();
      try{ await saveAccountData(); }catch(e){ /* fine, in-memory is enough */ }
      pfRenderAll();
      document.getElementById('pfForm').hidden = true;
    })();
  
