
    async function submitRider(e){
      e.preventDefault();
      const confirm = document.getElementById('riderConfirm');
      confirm.classList.add('show');
      document.getElementById('riderForm').style.display = 'none';
    }

    (async function(){
      await initShell();
      await chatInit();
      if (account.name) document.getElementById('r_name').value = account.name;
      if (account.email) document.getElementById('r_email').value = account.email;
    })();
  