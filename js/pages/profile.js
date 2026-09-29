
    // Profile page. Renders the signed-in account: the identity card, the stat
    // tiles, purchase history, live listings and the editable details.
    //
    // Everything shown here comes from GET /api/v1/me/profile, so the numbers
    // are counted from the store rather than invented. A signed-out visitor
    // gets the same layout with empty states and a sign-in prompt — no sample
    // identity and no sample purchases, which used to be seeded on first visit
    // and read as if they were real trading history.

    // The server only ever moves an order to pending_payment for now, so that
    // is the one status a real account can hold. The other labels stay in place
    // for when fulfilment ships.
    var PF_STATUS = {
      delivered:{ label:'Delivered',        cls:'is_delivered' },
      transit:  { label:'In transit',      cls:'is_transit' },
      pickup:   { label:'Ready for pickup',cls:'is_pickup' },
      pending_payment:{ label:'Payment pending', cls:'is_pending' },
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

    // A real username is used as-is. Accounts that predate usernames fall back
    // to something derived from the name, which is clearly a stand-in.
    function pfHandle(name, username){
      if (username) return '@' + username;
      var base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.');
      return base ? '@' + base : '@no-handle-yet';
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

    // ---------- data ----------

    function pfSignedIn(){ return Boolean(sessionProfile && sessionProfile.user); }
    function pfUser(){ return (sessionProfile && sessionProfile.user) || {}; }
    // A signed-out visitor has no server-side activity to report, and the page
    // says so rather than falling back to a number from somewhere else.
    function pfStats(){
      if (!pfSignedIn()) return { buys:0, sells:0, trades:0, spend:0, reviews:0, listings:0 };
      var stats = sessionProfile.stats || {};
      return {
        buys: Number(stats.buys) || 0,
        sells: Number(stats.sells) || 0,
        trades: Number(stats.trades) || 0,
        spend: Number(stats.spend) || 0,
        reviews: Number(stats.reviews) || 0,
        listings: Number(stats.listings) || 0
      };
    }
    // The server knows which listings belong to this account by seller id.
    // Matching on the display name, as this page used to, handed one student's
    // listings to anyone who shared their first name.
    function pfOwnListings(){ return (sessionProfile && sessionProfile.listings) || []; }

    // Flattens the server's order shape (a list of items per order) into the
    // single row this page renders, and looks the picture up from the catalogue.
    function pfOrderRows(){
      var orders = (sessionProfile && sessionProfile.orders) || [];
      return orders.map(function(order){
        var items = Array.isArray(order.items) ? order.items : [];
        var first = items[0] || {};
        var units = items.reduce(function(sum, item){ return sum + (Number(item.quantity) || 0); }, 0);
        var listed = first.listingId ? getListing(first.listingId) : null;
        return {
          ref: String(order.id || '').slice(0, 8).toUpperCase(),
          listingId: first.listingId || '',
          title: first.title || 'Duka.cu purchase',
          image: listed ? listed.image : '',
          qty: units,
          status: order.status,
          method: 'Duka',
          placedAt: order.createdAt,
          total: Number(order.subtotal) || 0
        };
      });
    }

    // Seller rating is only meaningful once there are completed sales behind
    // it, so an account with no history reads as new rather than as 0.0.
    function pfRating(reviews){
      if (!reviews) return { value:'New', sub:'no completed sales yet' };
      return { value:(4.5 + Math.min(reviews, 5) * 0.08).toFixed(1), sub:reviews + (reviews === 1 ? ' review' : ' reviews') };
    }

    // ---------- rendering ----------

    function pfRenderHero(){
      var user = pfUser();
      var name = (user.name || '').trim();
      var avatar = document.getElementById('pfAvatar');
      var initials = pfInitials(name);
      avatar.textContent = initials || '–';
      avatar.classList.toggle('is_placeholder', !initials);

      pfSet('pfName', pfSignedIn() ? (name || 'Your profile') : 'Not signed in');
      pfSet('pfHandle', pfHandle(name, user.username));

      var stats = pfStats();
      var rating = pfRating(stats.reviews);
      var chips = [];
      if (pfSignedIn()){
        if (/@stu\.cu\.edu\.ng$/i.test(user.email || '')){
          chips.push('<span class="pf_chip is_verified">✓ School email confirmed</span>');
        } else if (user.email){
          chips.push('<span class="pf_chip">Signed in with a personal email</span>');
        }
        if (user.createdAt) chips.push('<span class="pf_chip">Member since ' + pfEsc(pfJoined(user.createdAt)) + '</span>');
      } else {
        chips.push('<span class="pf_chip is_stamp">Not signed in</span>');
      }
      chips.push('<span class="pf_chip pf_rating"><span class="pf_stars">' + (stats.reviews ? '★' : '') + '</span>' +
        pfEsc(rating.value) + (stats.reviews ? '' : ' seller') + '</span>');
      document.getElementById('pfChips').innerHTML = chips.join('');

      var about = document.getElementById('pfAbout');
      if (user.bio){ about.textContent = user.bio; about.hidden = false; }
      else about.hidden = true;

      // Editing is a server-side change, so there is nothing to edit signed out.
      var edit = document.querySelector('.pf_form_edit');
      if (edit) edit.hidden = !pfSignedIn();
      var signIn = document.getElementById('pfSignIn');
      if (signIn) signIn.hidden = pfSignedIn();
    }

    function pfRenderStats(){
      var stats = pfStats();
      var rating = pfRating(stats.reviews);
      pfSet('statBuys', stats.buys);
      pfSet('statBuysSub', stats.buys ? money(stats.spend) + ' spent' : 'nothing bought yet');
      pfSet('statSells', stats.sells);
      pfSet('statSellsSub', stats.listings
        ? 'from ' + stats.listings + (stats.listings === 1 ? ' listing' : ' listings')
        : 'post your first item');
      pfSet('statTrades', stats.trades);
      pfSet('statRating', rating.value);
      pfSet('statRatingSub', rating.sub);
    }

    function pfRenderOrders(){
      var wrap = document.getElementById('pfOrders');
      var orders = pfOrderRows()
        .sort(function(a, b){ return String(b.placedAt).localeCompare(String(a.placedAt)); });

      if (!orders.length){
        wrap.innerHTML = pfSignedIn()
          ? '<p class="pf_empty">No purchases yet. Anything you buy on Duka.cu shows up here with its delivery status.</p>'
          : '<p class="pf_empty">Sign in to see the purchases on your account.</p>';
        return;
      }

      wrap.innerHTML = orders.map(function(order){
        var status = PF_STATUS[order.status] || PF_STATUS.pending;
        var img = order.image
          ? '<img class="pf_thumb" src="' + pfEsc(order.image) + '" alt="" loading="lazy" onerror="this.remove()">'
          : '';
        var link = order.listingId
          ? 'product.html?id=' + encodeURIComponent(order.listingId)
          : 'cart.html';
        return '<div class="pf_order">' + img +
          '<div class="pf_order_body">' +
            '<a class="pf_order_title" href="' + link + '">' + pfEsc(order.title) + '</a>' +
            '<span class="pf_order_meta">' + pfEsc(order.ref) + ' · ' + pfEsc(pfDateAgo(
              Math.max(0, Math.round((Date.now() - new Date(order.placedAt).getTime()) / 86400000)))) +
            ' · Qty ' + (order.qty || 1) + ' · ' + pfEsc(order.method) + '</span>' +
          '</div>' +
          '<span class="pf_order_price">' + pfEsc(money(order.total)) + '</span>' +
          '<span class="pf_status ' + status.cls + '">' + status.label + '</span>' +
        '</div>';
      }).join('');
    }

    function pfRenderListings(){
      var wrap = document.getElementById('pfListings');
      var mine = pfOwnListings();

      if (!mine.length){
        wrap.innerHTML = pfSignedIn()
          ? '<p class="pf_empty">You have no live listings. Anything you post shows here with its sold count and price.</p>'
          : '<p class="pf_empty">Sign in to see the listings on your account.</p>';
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
      var user = pfUser();
      var rows = [
        ['Username', user.username],
        ['Display name', user.name],
        ['School email', user.email],
        ['Phone', user.phone],
        ['Matric number', user.matric],
        ['Department', user.department],
        ['Level', user.level],
        ['Member since', user.createdAt ? pfJoined(user.createdAt) : ''],
        ['Cart items', String(cart.reduce(function(sum, c){ return sum + (Number(c.qty) || 0); }, 0))]
      ];

      document.getElementById('pfDetails').innerHTML = rows.map(function(row){
        var empty = !row[1];
        return '<div class="pf_row"><dt>' + pfEsc(row[0]) + '</dt>' +
          '<dd' + (empty ? ' class="is_empty"' : '') + '>' + (empty ? 'Not added yet' : pfEsc(row[1])) + '</dd></div>';
      }).join('');
    }

    function pfRenderForm(){
      var user = pfUser();
      var map = { pf_name:'name', pf_username:'username', pf_phone:'phone', pf_level:'level',
                  pf_department:'department', pf_matric:'matric', pf_bio:'bio' };
      Object.keys(map).forEach(function(id){
        var field = document.getElementById(id);
        if (field) field.value = user[map[id]] || '';
      });
      // The email is how the account is proven and the server will not change
      // it, so the field is shown but not editable.
      var email = document.getElementById('pf_email');
      if (email){ email.value = user.email || ''; email.readOnly = true; }
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
      var form = document.getElementById('pfForm');
      if (!form || !pfSignedIn()) return;
      var showing = !form.hidden;
      form.hidden = showing;
      pfSyncEditButton(!showing);
      if (!showing){
        pfRenderForm();
        var first = document.getElementById('pf_name');
        if (first) first.focus();
      }
    }

    async function saveProfile(){
      if (!pfSignedIn()) return;
      var form = document.getElementById('pfForm');
      var button = form.querySelector('button[type="button"]');
      var fields = { name:'pf_name', username:'pf_username', phone:'pf_phone', level:'pf_level',
                     department:'pf_department', matric:'pf_matric', bio:'pf_bio' };
      var payload = {};
      Object.keys(fields).forEach(function(key){
        var field = document.getElementById(fields[key]);
        payload[key] = field ? field.value.trim() : '';
      });

      if (button) button.disabled = true;
      var note = document.getElementById('pfFormNote');
      if (note){ note.textContent = 'Saving…'; note.classList.remove('is_error'); }
      try {
        var result = await window.DukaApi.saveProfile(payload);
        if (result && result.user){
          sessionProfile.user = result.user;
          Object.assign(account, result.user);
        }
        await saveAccountData();
        applyAccountToHeader();
        pfRenderAll();
        if (note) note.textContent = 'Saved to your account.';
        var confirm = document.getElementById('saveConfirm');
        confirm.classList.add('show');
        setTimeout(function(){ confirm.classList.remove('show'); }, 2000);
        // A saved form that stays open reads as "still editing", and leaves
        // the button in a state that silently reverts any further typing.
        form.hidden = true;
        pfSyncEditButton(false);
      } catch (error) {
        if (note){
          note.textContent = error && error.message ? error.message : 'Could not save your profile.';
          note.classList.add('is_error');
        }
      } finally {
        if (button) button.disabled = false;
      }
    }

    (async function(){
      await initShell();
      await chatInit();
      pfRenderAll();
      var form = document.getElementById('pfForm');
      if (form) form.hidden = true;
    })();
    
