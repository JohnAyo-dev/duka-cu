
    const MIN_PICTURES = 1;
    const MAX_PICTURES = 6;
    const MAX_PICTURE_BYTES = 120000;
    const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=500&auto=format&fit=crop&q=60';

    let pictList = [];

    const pictInput = document.getElementById('f_images');
    const pictBtn = document.getElementById('pictBtn');
    const pictBtnLabel = document.getElementById('pictBtnLabel');
    const pictGrid = document.getElementById('pictGrid');
    const pictClear = document.getElementById('pictClear');
    const pictNote = document.getElementById('pictNote');

    pictBtn.addEventListener('click', () => pictInput.click());

    function setPictNotice(msg, isError){
      if (!pictNote) return;
      pictNote.textContent = msg;
      pictNote.classList.toggle('is_error', !!isError);
    }

    function compressPicture(file){
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('That file could not be read.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('That file is not a readable image.'));
          img.onload = () => {
            const maxW = 900;
            const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#F7F2E7';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            let quality = 0.7;
            let out = canvas.toDataURL('image/jpeg', quality);
            while (out.length > MAX_PICTURE_BYTES && quality > 0.3) {
              quality -= 0.1;
              out = canvas.toDataURL('image/jpeg', quality);
            }
            resolve(out);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function renderPicts(){
      const atMax = pictList.length >= MAX_PICTURES;
      pictGrid.innerHTML = '';
      pictGrid.hidden = pictList.length === 0;
      pictGrid.setAttribute('aria-live', 'polite');

      pictList.forEach((src, index) => {
        const figure = document.createElement('figure');
        figure.className = 'pict_thumb';

        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Listing picture ' + (index + 1) + ' of ' + pictList.length;

        const order = document.createElement('span');
        order.className = 'pict_order';
        order.textContent = String(index + 1);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pict_clear';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', 'Remove picture ' + (index + 1));
        remove.addEventListener('click', () => {
          pictList.splice(index, 1);
          renderPicts();
          setPictNotice(pictList.length + ' of ' + MAX_PICTURES + ' pictures added. The first one is the cover photo.');
        });

        figure.appendChild(img);
        figure.appendChild(order);
        figure.appendChild(remove);

        if (index === 0) {
          const tag = document.createElement('span');
          tag.className = 'pict_cover_tag';
          tag.textContent = 'Cover';
          figure.appendChild(tag);
        }

        pictGrid.appendChild(figure);
      });

      pictClear.hidden = pictList.length === 0;
      pictBtn.disabled = atMax;
      pictBtnLabel.textContent = atMax
        ? 'Maximum of 6 pictures reached'
        : (pictList.length ? 'Add more pictures' : 'Add pictures');
    }

    async function addFiles(fileList){
      const incoming = Array.from(fileList || []);
      if (!incoming.length) return;

      const room = MAX_PICTURES - pictList.length;
      const usable = incoming.filter(file => /^image\/(png|jpe?g|webp)$/i.test(file.type));
      const rejected = incoming.length - usable.length;

      if (!usable.length) {
        setPictNotice('Please choose PNG, JPG, or WebP images.', true);
        pictInput.value = '';
        return;
      }

      const accepted = usable.slice(0, room);
      const overflow = usable.length - accepted.length;
      const failed = [];

      for (const file of accepted) {
        try {
          pictList.push(await compressPicture(file));
        } catch (error) {
          failed.push(file.name || 'a file');
        }
      }

      renderPicts();
      pictInput.value = '';

      if (failed.length) {
        setPictNotice('Could not read ' + failed.join(', ') + '. Try different files.', true);
        return;
      }
      if (overflow) {
        setPictNotice('Added ' + accepted.length + ', but a listing can only have ' + MAX_PICTURES + ' pictures.', true);
        return;
      }
      if (rejected) {
        setPictNotice('Added ' + accepted.length + ' picture(s). Skipped ' + rejected + ' file(s) that were not PNG, JPG, or WebP.', true);
        return;
      }
      setPictNotice(pictList.length + ' of ' + MAX_PICTURES + ' pictures added. The first one is the cover photo.');
    }

    pictInput.addEventListener('change', () => addFiles(pictInput.files));

    renderPicts();

    pictClear.addEventListener('click', () => {
      pictList = [];
      pictInput.value = '';
      renderPicts();
      setPictNotice('All pictures removed. Add at least 1 to post this listing.', true);
    });

    async function submitListing(e){
      e.preventDefault();

      if (pictList.length < MIN_PICTURES) {
        setPictNotice('Add at least 1 picture before posting — buyers need to see what you are selling.', true);
        pictBtn.focus();
        return;
      }

      const item = {
        id: 'l' + Date.now(),
        title: document.getElementById('f_title').value.trim(),
        category: document.getElementById('f_category').value,
        price: Number(document.getElementById('f_price').value),
        condition: document.getElementById('f_condition').value,
        description: document.getElementById('f_description').value.trim() || 'No additional details provided by the seller yet.',
        verified: false,
        sellerName: document.getElementById('f_seller').value.trim(),
        sellerLevel: document.getElementById('f_level').value.trim(),
        images: pictList.slice(0, MAX_PICTURES),
        image: pictList[0] || FALLBACK_IMAGE,
        delivery: document.getElementById('f_delivery').value,
        phone: document.getElementById('f_phone').value.trim(),
        snap: document.getElementById('f_snap').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        createdAt: Date.now(),
        sold: 0
      };
      try {
        if (window.DukaApi && DukaApi.isOnline()) {
          const saved = await DukaApi.createListing({ ...item, image: '', images: [] });
          const merged = { ...saved, image: item.image, images: item.images };
          listings.unshift(merged);
          window.location.href = 'product.html?id=' + merged.id + '&posted=1';
          return;
        }
      } catch (error) {
        // A rejected session is not an outage. A listing has to belong to a
        // real account, so send the seller to sign in rather than quietly
        // keeping their listing on this device where nobody else can see it.
        if (error && error.status === 401) { window.location.href = 'login.html?next=sell.html'; return; }
        console.warn('Listing API unavailable; saving locally.', error);
      }
      listings.unshift(item);
      try{ await saveListings(); }catch(e){ /* still shows locally this session */ }
      window.location.href = 'product.html?id=' + item.id + '&posted=1';
    }

    (async function(){
      await initShell();
      await chatInit();
      if (account.name) document.getElementById('f_seller').value = account.name;
      if (account.email && getPrefs().privacy.showEmailOnListings) document.getElementById('f_email').value = account.email;
    })();
