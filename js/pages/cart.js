
    const PAY_METHODS = {
      'paystack-titan': { label:'Paystack Titan', note:'Card, bank transfer or USSD — you\'re redirected to Paystack Titan to finish.' },
      monnify:  { label:'Monnify',  note:'Monnify checkout opens in a moment. (Demo — merchant key not wired up yet.)' }
    };
    let selectedPay = 'paystack-titan';

    function renderCartPage(){
      const box = document.getElementById('cartItems');
      const totalRow = document.getElementById('cartTotalRow');
      const checkoutBtn = document.getElementById('cartCheckoutBtn');
      const payOptions = document.getElementById('payOptions');
      const hasItems = cart.length > 0;
      if (!hasItems){
        box.innerHTML = `
          <div class="cart_empty">
            <img src="data:image/png;base64,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" alt="Duka.cu mascot">
            <p><strong>Your cart looks a little light.</strong><br>Browse the market and add something you like — it'll wait for you here.</p>
            <a class="empty_cta" href="index.html">Browse listings →</a>
          </div>`;
      } else {
        box.innerHTML = cart.map(c => `
          <div class="cart_item" id="cart_item_${c.id}">
            <span class="cart_item_title">${c.title} ${c.qty > 1 ? '× ' + c.qty : ''}</span>
            <span class="cart_item_price">${money(c.price * c.qty)}</span>
            <button class="cart_item_remove" onclick="removeFromCart('${c.id}')">Remove</button>
          </div>`).join('');
      }
      totalRow.style.display = hasItems ? 'flex' : 'none';
      checkoutBtn.style.display = hasItems ? 'block' : 'none';
      payOptions.hidden = !hasItems;
      const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
      document.getElementById('cartTotal').textContent = money(total);
    }

    function selectPayMethod(method, btn){
      if (!PAY_METHODS[method]) return;
      selectedPay = method;
      document.querySelectorAll('.pay_option').forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      document.getElementById('payOptionsNote').textContent = PAY_METHODS[method].note;
    }

    document.getElementById('payOptions').addEventListener('click', (e) => {
      const btn = e.target.closest('.pay_option');
      if (btn) selectPayMethod(btn.dataset.pay, btn);
    });

    function checkout(){
      if (!cart.length){ alert('Your cart is empty.'); return; }
      const email = account.email || prompt('Enter your school email for checkout:');
      if (!email) return;
      const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
      if (selectedPay === 'monnify'){ payWithMonnify(email, total); return; }
      payWithPaystackTitan(email, total * 100); // Paystack Titan expects kobo
    }

    (async function(){
      await initShell();
      await chatInit();
      renderCartPage();
      document.querySelectorAll('.pay_option').forEach(b => {
        if (b.dataset.pay === selectedPay) selectPayMethod(selectedPay, b);
      });
    })();
  
