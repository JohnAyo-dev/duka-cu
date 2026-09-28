
    (async function(){
      await initShell();
      await chatInit();
      const params = new URLSearchParams(window.location.search);
      const open = params.get('open');
      if (open) chatOpen(open);
    })();
  