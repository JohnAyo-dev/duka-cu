
    // Sends the application to the server, which keeps one open application
    // per account. Signed-out visitors are sent to sign in first and brought back.
    async function submitRider(e){
      e.preventDefault();
      const status = ensureRiderStatus();
      if (!sessionProfile){ location.href = 'login.html?next=riders.html'; return; }
      const button = document.querySelector('#riderForm button[type=submit]');
      button.disabled = true; status.textContent = 'Sending…'; status.style.color = '';
      try {
        await DukaApi.applyToRide({
          name: document.getElementById('r_name').value.trim(), level: document.getElementById('r_level').value.trim(),
          email: document.getElementById('r_email').value.trim(), phone: document.getElementById('r_phone').value.trim(),
          availability: document.getElementById('r_availability').value, hostel: document.getElementById('r_hostel').value.trim(),
          reason: document.getElementById('r_reason').value.trim()
        });
        document.getElementById('riderConfirm').classList.add('show');
        document.getElementById('riderForm').style.display = 'none';
        status.textContent = '';
      } catch (err) {
        status.textContent = err instanceof TypeError ? 'Could not reach the server. Nothing was sent; please try again.' : err.message;
        status.style.color = 'var(--stamp, #a8322d)'; button.disabled = false;
      }
    }
    function ensureRiderStatus(){
      let el = document.getElementById('riderStatus');
      if (!el){ el = document.createElement('p'); el.id = 'riderStatus'; el.className = 'page_note'; el.setAttribute('role', 'status'); document.getElementById('riderForm').appendChild(el); }
      return el;
    }
    const RIDER_STATE = {
      pending: 'Your application is with the Duka team. We will email you once it is reviewed.',
      approved: 'You are an approved Duka rider. Welcome aboard!',
      rejected: 'Your last application was not approved. You are welcome to apply again.'
    };

    (async function(){
      await initShell();
      await chatInit();
      if (account.name) document.getElementById('r_name').value = account.name;
      if (account.email) document.getElementById('r_email').value = account.email;
      if (sessionProfile){
        try {
          const mine = await DukaApi.myRiderApplication();
          if (mine && RIDER_STATE[mine.status]){
            ensureRiderStatus().textContent = RIDER_STATE[mine.status];
            if (mine.status !== 'rejected'){ document.getElementById('riderForm').querySelectorAll('input,select,button').forEach(el => { el.disabled = true; }); }
          }
        } catch (e) {}
      }
    })();
  