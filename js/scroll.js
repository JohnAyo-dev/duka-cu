
// ===== Duka.cu scroll build/destroy =====
// Marked containers (.sb-grid / .sb-section) assemble their UI parts — every
// [data-sb] element inside (image, title, price, seller, button…) — one at a
// time as the container enters the viewport (sb-in) and disassemble them in
// reverse as it leaves (sb-out). scroll-anim stamps each part's --sb-delay so
// the whole set rides a single wave; style.css keys the actual transforms.
// Reduced-motion users get a static, fully-built page — the controller no-ops
// and every animated state in style.css is gated behind no-preference.
(function(){
  if (!('IntersectionObserver' in window)) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VIEW_CROP = 0.88; // treat the bottom 12% as "not yet arrived"
  var ASSEMBLY_MS = 1400; // target time for the whole set of parts to assemble
  var PART_MS = 300;      // single part entrance
  var STEP_MIN = 6;
  var STEP_MAX = 90;

  var built = new WeakMap(); // true = assembled while in view
  var targets = [];

  function inView(el){
    if (!el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top < vh * VIEW_CROP && r.bottom > 0;
  }

  function partsOf(el){
    return Array.prototype.slice.call(el.querySelectorAll('[data-sb]'));
  }

  // Give every part its place in the wave. Build plays top-to-bottom, destroy
  // plays the reverse (last part drops out first). Returns the last delay.
  function stamp(parts, entering){
    var total = parts.length;
    var step = total ? Math.max(STEP_MIN, Math.min(STEP_MAX, Math.round(ASSEMBLY_MS / total))) : 0;
    parts.forEach(function(p, i){
      var ms = entering ? i * step : (total - 1 - i) * step;
      p.style.setProperty('--sb-delay', ms + 'ms');
    });
    return total ? step * (total - 1) : 0;
  }

  function build(target){
    if (reduce) return;
    var lastDelay = stamp(partsOf(target), true);
    target.classList.remove('sb-out');
    void target.offsetWidth;
    target.classList.add('sb-in');
    built.set(target, true);
    clearTimeout(target._sbTimer);
    target._sbTimer = setTimeout(function(){
      target.classList.remove('sb-in');
    }, lastDelay + PART_MS + 40);
  }

  function destroy(target){
    if (reduce) return;
    stamp(partsOf(target), false);
    target.classList.remove('sb-in');
    clearTimeout(target._sbTimer);
    void target.offsetWidth;
    target.classList.add('sb-out');
    built.set(target, false);
  }

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (en.isIntersecting) build(en.target);
      else destroy(en.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });

  function register(el){
    targets.push(el);
    io.observe(el);
    if (inView(el)) build(el);
  }

  // Called by renderGrids() after the grids are refilled so newly-rendered
  // parts build if visible and anything off-screen stays collapsed.
  // Cards render fresh each time renderGrids() runs (search/filter/sort),
  // so old card nodes get swapped out of the DOM. registerNew() drops any
  // target that's no longer connected and picks up newly-rendered cards,
  // observing each one on its own — independent of its neighbours, so
  // whichever card scrolls into view builds first, not top-to-bottom.
  function registerNew(){
    var stale = targets.filter(function(el){ return !el.isConnected; });
    stale.forEach(function(el){ io.unobserve(el); });
    targets = targets.filter(function(el){ return el.isConnected; });
    document.querySelectorAll('.sb-section, .sb-card').forEach(function(el){
      if (targets.indexOf(el) === -1) register(el);
    });
  }

  function revealInView(){
    if (reduce) return;
    registerNew();
    targets.forEach(function(el){
      if (inView(el)){
        if (!built.get(el)) build(el);
      } else {
        destroy(el);
      }
    });
  }

  document.querySelectorAll('.sb-section, .sb-card').forEach(register);
  window.revealInView = revealInView;
})();
