/* Lolita Bakery · site script
   Loads content/translations.json, content/menu.json, content/info.json
   and content/photos.json (the photo galleries),
   fills the page in the visitor's language and runs the small interactions.
   No libraries, no build step. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const SPRITE = 'assets/img/sprite.svg';
  const LANG_KEY = 'lolita-lang';
  const CART_KEY = 'lolita-cart';
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => motionQuery.matches;

  // localStorage can be blocked (private mode, strict settings): never let that break the page
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  let T = {}, MENU = {}, INFO = {}, PHOTOS = {};
  let lang = 'en';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="${SPRITE}#${id}"/></svg>`;

  /* ---------- translations ---------- */
  function t(key, vars) {
    const node = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), T);
    let s = node && typeof node === 'object' ? (node[lang] != null ? node[lang] : node.en) : undefined;
    if (s == null) { console.warn('[lolita] missing text:', key); s = ''; }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }
  const L = (obj) => (obj ? (obj[lang] != null ? obj[lang] : obj.en || '') : '');
  const locale = () => (lang === 'es' ? 'es-US' : 'en-US');

  function money(n, whole) {
    if (n == null || isNaN(n)) return t('common.ask');
    const cur = MENU.currency || '$';
    return cur + (whole && Number.isInteger(n) ? String(n) : Number(n).toFixed(2));
  }

  function pickLang() {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'es') { store.set(LANG_KEY, q); return q; }
    const saved = store.get(LANG_KEY);
    if (saved === 'en' || saved === 'es') return saved;
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    return prefs.some((l) => /^es\b/i.test(l)) ? 'es' : 'en';
  }

  function applyText() {
    root.lang = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s && s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.title = t('meta.title');
    const desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));
    $$('.lang__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }

  /* ---------- business info (info.json) ---------- */
  const addr = () => INFO.address || {};
  const addressOneLine = () => `${addr().street}, ${addr().city}, ${addr().state} ${addr().zip}`;
  const links = () => ({
    directions: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(INFO.mapQuery || addressOneLine()),
    mailto: 'mailto:' + INFO.email,
    facebook: INFO.facebook,
    instagram: INFO.instagram
  });

  function applyInfo() {
    const l = links();
    $$('[data-info-href]').forEach((a) => {
      const href = l[a.dataset.infoHref];
      if (href) a.setAttribute('href', href); else a.hidden = true;
    });
    $$('[data-info="email"]').forEach((el) => { el.textContent = INFO.email; });
    $$('[data-info="addressLines"]').forEach((el) => {
      el.innerHTML = `<span>${esc(addr().street)}</span><br><span>${esc(addr().city)}, ${esc(addr().state)} ${esc(addr().zip)}</span>`;
    });
    $$('[data-info="hours"]').forEach((el) => {
      const rows = Array.isArray(INFO.hours) ? INFO.hours : [];
      el.innerHTML = rows.length
        ? `<div class="hours">${rows.map((r) => `<div class="hours__row"><span>${esc(L(r.days))}</span><span>${esc(L(r.time))}</span></div>`).join('')}</div>`
        : `<span class="hours__soon">${esc(t('visit.hoursSoon'))}</span>`;
    });
    const map = $('.map__frame');
    if (map) {
      const src = `https://www.google.com/maps?q=${encodeURIComponent(INFO.mapQuery || addressOneLine())}&hl=${lang}&z=15&output=embed`;
      if (map.getAttribute('src') !== src) map.setAttribute('src', src);
    }
    writeSchema();
  }

  function writeSchema() {
    let tag = $('#lolita-schema');
    if (!tag) {
      tag = document.createElement('script');
      tag.type = 'application/ld+json';
      tag.id = 'lolita-schema';
      document.head.appendChild(tag);
    }
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Bakery',
      name: INFO.name,
      email: INFO.email,
      servesCuisine: 'Mexican',
      description: t('meta.description'),
      address: { '@type': 'PostalAddress', streetAddress: addr().street, addressLocality: addr().city, addressRegion: addr().state, postalCode: addr().zip, addressCountry: 'US' },
      sameAs: [INFO.instagram].filter(Boolean)
    };
    tag.textContent = JSON.stringify(data);
  }

  /* ---------- menus (menu.json) ---------- */
  const orderables = new Map();   // item id -> { item, area }
  const ordersOn = () => !!(INFO.orders && INFO.orders.enabled);
  const rendered = new Set();

  function tagHtml(tag) {
    if (tag === 'favorite') return `<span class="tag">${esc(t('common.favorite'))}</span>`;
    if (tag === 'seasonal') return `<span class="tag tag--seasonal">${esc(t('common.seasonal'))}</span>`;
    return '';
  }

  function qtyHtml(item, key, name, count) {
    key = key || item.id; name = name || L(item.name); count = count || 0;
    return `<div class="qty" role="group" aria-label="${esc(name)}" data-qty="${esc(key)}" data-count="${count}">
      <button type="button" class="qty__btn qty__less" data-step="-1" aria-label="${esc(t('cart.less', { item: name }))}">${icon('i-minus')}</button>
      <span class="qty__n" aria-live="polite">${count}</span>
      <button type="button" class="qty__btn qty__more" data-step="1" aria-label="${esc(t(count ? 'cart.more' : 'cart.add', { item: name }))}">${icon('i-plus')}</button>
    </div>`;
  }

  function renderList(area) {
    const box = $(`[data-menu="${area}"]`);
    if (!box || !Array.isArray(MENU[area])) return;
    const showPrices = MENU.showPrices !== false;
    const canOrder = ordersOn() && (area === 'bakery' || area === 'coffee');
    let n = 0;
    box.innerHTML = MENU[area].map((cat) => `
      <section class="cat" aria-labelledby="cat-${esc(cat.id)}">
        <div class="cat__head">
          <h4 class="cat__title" id="cat-${esc(cat.id)}">${esc(L(cat.title))}</h4>
          ${cat.note ? `<p class="cat__note">${esc(L(cat.note))}</p>` : ''}
        </div>
        <ul class="cat__list">
          ${cat.items.map((item) => `
            <li class="item" data-reveal style="--i:${Math.min(n++ % 8, 7)}" data-item="${esc(item.id)}">
              <div class="item__top">
                <span class="item__name">${esc(L(item.name))}${tagHtml(item.tag)}</span>
                ${showPrices ? `<span class="item__lead" aria-hidden="true"></span><span class="item__price">${esc(money(item.price))}</span>` : ''}
              </div>
              <div class="item__bottom">
                <p class="item__desc">${esc(L(item.desc))}</p>
                ${canOrder && item.orderable ? qtyHtml(item) : ''}
              </div>
            </li>`).join('')}
        </ul>
      </section>`).join('');
    afterRender(box);
  }

  function renderCatalog() {
    const box = $('[data-menu="clothing"]');
    if (!box || !Array.isArray(MENU.clothing)) return;
    const showPrices = MENU.showPrices !== false;
    const alsoSlot = $('[data-clothing-also]');
    const chips = (cat, h) => `
        <div class="also">
          <${h} class="also__title">${esc(L(cat.title))}</${h}>
          <ul class="also__list">
            ${cat.items.map((item) => `<li class="chip">${icon('floral-mini')}${esc(L(item.name))}</li>`).join('')}
          </ul>
        </div>`;
    if (alsoSlot) {
      const plain = MENU.clothing.filter((c) => !c.items.some((i) => i.image));
      alsoSlot.innerHTML = plain.map((c) => chips(c, 'h3').replace('<div class="also">', '<div>')).join('');
      alsoSlot.hidden = !plain.length;
    }
    box.innerHTML = MENU.clothing.map((cat) => {
      const withPhotos = cat.items.some((i) => i.image);
      if (withPhotos) {
        return `
          <h3 class="menu-title">${esc(L(cat.title))}</h3>
          ${cat.note ? `<p class="cat__note" style="text-align:center;margin-top:6px">${esc(L(cat.note))}</p>` : ''}
          <ul class="catalog__grid">
            ${cat.items.map((item, i) => {
              const name = L(item.name);
              const ask = links().mailto + '?subject=' + encodeURIComponent(t('clothing.askSubject', { item: name }));
              return `
              <li class="card" data-reveal style="--i:${i % 3}">
                <div class="card__media">
                  <picture>
                    <source srcset="${esc(item.image)}.webp" type="image/webp">
                    <img src="${esc(item.image)}.jpg" width="640" height="800" alt="${esc(L(item.alt) || name)}" loading="lazy" decoding="async">
                  </picture>
                  ${tagHtml(item.tag)}
                </div>
                <h4 class="card__name">${esc(name)}</h4>
                <p class="card__desc">${esc(L(item.desc))}</p>
                <div class="card__foot">
                  ${showPrices && item.price != null ? `<span class="card__price">${item.fromPrice ? esc(t('common.from')) + ' ' : ''}${esc(money(item.price, true))}</span>` : '<span></span>'}
                  <a class="card__ask" href="${esc(ask)}" aria-label="${esc(t('clothing.askSubject', { item: name }))}"><span>${esc(t('clothing.ask'))}</span>${icon('i-arrow-right')}</a>
                </div>
                ${ordersOn() && item.orderable ? buyHtml(item, name) : ''}
              </li>`;
            }).join('')}
          </ul>`;
      }
      return alsoSlot ? '' : chips(cat, 'h4');
    }).join('');
    afterRender(box);
  }

  function buyHtml(item, name) {
    const sizes = item.sizes ? (item.sizes[lang] || item.sizes.en || []) : null;
    const sel = sizes ? `<select class="card__size" id="size-${esc(item.id)}" aria-label="${esc(t('cart.size') + ': ' + name)}">
        <option value="">${esc(t('cart.size'))}</option>${sizes.map((sz, i) => `<option value="${i}">${esc(sz)}</option>`).join('')}
      </select>` : `<span class="card__onesize">${esc(t('cart.oneSize'))}</span>`;
    return `<div class="card__buy">${sel}
      <button type="button" class="card__add" data-add="${esc(item.id)}">${icon('i-bag')}<span class="card__add-text">${esc(t('cart.addToCart'))}</span></button>
    </div>
    <p class="card__err" role="alert"></p>`;
  }

  function afterRender(box) {
    const key = box.dataset.menu;
    const items = $$('[data-reveal]', box);
    if (rendered.has(key) || reduced()) items.forEach((el) => el.classList.add('is-in'));
    else items.forEach((el) => revealer.observe(el));
    rendered.add(key);
  }

  function indexOrderables() {
    orderables.clear();
    ['bakery', 'coffee', 'clothing'].forEach((area) => (MENU[area] || []).forEach((cat) =>
      cat.items.forEach((item) => { if (item.orderable) orderables.set(item.id, { item, area }); })));
  }

  function renderMenus() {
    renderList('bakery');
    renderList('coffee');
    renderCatalog();
    renderGalleries();
    $$('[data-preorder-only]').forEach((el) => { el.hidden = !ordersOn(); });
  }

  /* ---------- photo galleries (content/photos.json) ---------- */
  // bakery: a wide photo of the whole case + a swipeable row; drinks: a row; cakes: a mosaic
  const galleryList = (key) => {
    const g = PHOTOS[key];
    if (!g || !Array.isArray(g.items)) return [];
    return (g.band ? [g.band] : []).concat(g.items);
  };

  function photoHtml(p, index, cls, w, h) {
    const name = L(p.name);
    const pos = p.pos && /^[\d.]+% [\d.]+%$/.test(p.pos) ? ` style="object-position:${p.pos}"` : '';
    return `<button type="button" class="ph ${cls}" data-ph="${index}" aria-haspopup="dialog">
      <picture>
        <source srcset="${esc(p.file)}-800.webp" type="image/webp">
        <img src="${esc(p.file)}-800.jpg" width="${w}" height="${h}" alt="${esc(L(p.alt) || name)}" loading="lazy" decoding="async"${pos}>
      </picture>
      <span class="ph__name" aria-hidden="true">${esc(name)}</span>
    </button>`;
  }

  function railNavHtml() {
    return `<div class="gallery__nav">
      <button type="button" class="gallery__btn gallery__btn--prev" data-rail-step="-1" aria-label="${esc(t('gallery.prev'))}" disabled>${icon('i-arrow-right')}</button>
      <button type="button" class="gallery__btn" data-rail-step="1" aria-label="${esc(t('gallery.next'))}">${icon('i-arrow-right')}</button>
    </div>`;
  }

  function syncRail(rail) {
    const box = rail.closest('[data-gallery]');
    const prev = $('[data-rail-step="-1"]', box), next = $('[data-rail-step="1"]', box);
    if (!prev || !next) return;
    const max = rail.scrollWidth - rail.clientWidth - 4;
    prev.disabled = rail.scrollLeft <= 4;
    next.disabled = rail.scrollLeft >= max;
    box.classList.toggle('is-scrollable', max > 0);
  }

  function renderGalleries() {
    $$('[data-gallery]').forEach((box) => {
      const key = box.dataset.gallery;
      const g = PHOTOS[key];
      if (!g || !Array.isArray(g.items) || !g.items.length) { box.hidden = true; return; }
      box.hidden = false;
      const off = g.band ? 1 : 0;
      if (box.dataset.layout === 'mosaic') {
        box.innerHTML = `<ul class="mosaic">${g.items.map((p, i) => `<li>${photoHtml(p, i + off, 'ph--tile', 800, 800)}</li>`).join('')}</ul>`;
        return;
      }
      const keep = $('.rail', box);
      const scrolled = keep ? keep.scrollLeft : 0;
      box.innerHTML = `
        ${g.band ? photoHtml(g.band, 0, 'ph--band', 800, 211) : ''}
        <div class="gallery__head">
          <p class="gallery__title">${esc(box.dataset.title ? t(box.dataset.title) : '')}</p>
          ${railNavHtml()}
        </div>
        <ul class="rail">${g.items.map((p, i) => `<li>${photoHtml(p, i + off, 'ph--tile', 800, 1000)}</li>`).join('')}</ul>`;
      const rail = $('.rail', box);
      rail.scrollLeft = scrolled;
      rail.addEventListener('scroll', () => syncRail(rail), { passive: true });
      requestAnimationFrame(() => syncRail(rail));
    });
  }

  function initGalleries() {
    window.addEventListener('resize', () => $$('[data-gallery] .rail').forEach(syncRail), { passive: true });

    // row arrows (mouse and keyboard; on phones the row swipes)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rail-step]');
      if (!btn) return;
      const rail = $('.rail', btn.closest('[data-gallery]'));
      const dir = parseInt(btn.dataset.railStep, 10);
      rail.scrollBy({ left: dir * Math.max(rail.clientWidth * 0.8, 200), behavior: reduced() ? 'auto' : 'smooth' });
    });

    // full-size viewer
    const dlg = $('[data-lightbox]');
    if (!dlg) return { refresh() {} };
    const img = $('[data-lb-img]', dlg), source = $('[data-lb-source]', dlg);
    const nameEl = $('[data-lb-name]', dlg), countEl = $('[data-lb-count]', dlg);
    let list = [], at = 0, opener = null;

    function show(i) {
      if (!list.length) return;
      at = (i + list.length) % list.length;
      const p = list[at];
      img.classList.add('is-loading');
      source.srcset = `${p.file}-1600.webp`;
      img.src = `${p.file}-1600.jpg`;
      img.alt = L(p.alt) || L(p.name);
      nameEl.textContent = L(p.name);
      countEl.textContent = list.length > 1 ? t('gallery.count', { n: at + 1, total: list.length }) : '';
      $$('[data-lb-step]', dlg).forEach((b) => { b.hidden = list.length < 2; });
      // warm up the next photo so arrows feel instant
      const next = list[(at + 1) % list.length];
      if (next && next !== p) { const pre = new Image(); pre.src = `${next.file}-1600.jpg`; }
    }
    img.addEventListener('load', () => img.classList.remove('is-loading'));
    img.addEventListener('error', () => img.classList.remove('is-loading'));

    function close() { if (dlg.open) dlg.close(); }

    document.addEventListener('click', (e) => {
      const ph = e.target.closest('[data-ph]');
      if (!ph) return;
      list = galleryList(ph.closest('[data-gallery]').dataset.gallery);
      opener = ph;
      show(parseInt(ph.dataset.ph, 10) || 0);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      document.body.classList.add('lb-open');
      $('[data-lb-close]', dlg).focus();
    });
    $$('[data-lb-step]', dlg).forEach((b) => b.addEventListener('click', () => show(at + parseInt(b.dataset.lbStep, 10))));
    $('[data-lb-close]', dlg).addEventListener('click', close);
    // a click on the dark space around the photo closes it
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.hasAttribute('data-lb-stage')) close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
    });
    dlg.addEventListener('close', () => {
      document.body.classList.remove('lb-open');
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    });

    // swipe left / right on phones
    let x0 = null, y0 = 0;
    dlg.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
    dlg.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) show(at + (dx < 0 ? 1 : -1));
    });
    dlg.addEventListener('pointercancel', () => { x0 = null; });

    return { refresh() { if (dlg.open) show(at); } };
  }

  /* ---------- reveal on scroll ---------- */
  const revealer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add('is-in'); revealer.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    : { observe: (el) => el.classList.add('is-in'), unobserve() {} };

  function initReveals() {
    $$('[data-reveal], .tiles, .floral').forEach((el) => {
      if (reduced()) el.classList.add('is-in'); else revealer.observe(el);
    });
  }

  /* ---------- papel picado garlands ---------- */
  const FLAG_COLORS = ['#E2367C', '#F08A24', '#F7C232', '#14A39A', '#DD3B2C', '#2457B3'];
  const FLAG_SHAPES = ['pp-flower', 'pp-sun', 'pp-heart', 'pp-lattice'];

  function buildGarland(el) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h || el._w === w) return;
    el._w = w;
    const mini = el.dataset.garland === 'mini';
    const small = w < 600;
    const fw = mini ? (small ? 28 : 34) : small ? 36 : w < 1100 ? 46 : 54;
    const gap = mini ? (small ? 9 : 12) : small ? 7 : 12;
    const n = Math.max(5, Math.floor((w + gap) / (fw + gap)));
    const step = w / n;
    const y0 = mini ? 0 : 4, sag = mini ? (small ? 5 : 8) : Math.min(h * 0.2, small ? 9 : 20);
    const x0 = mini ? 0 : -12, x1 = mini ? w : w + 12, cy = y0 + 2 * sag;
    const at = (x) => {
      const s = (x - x0) / (x1 - x0);
      const y = (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * cy + s * s * y0;
      const dy = 2 * (1 - s) * (cy - y0) + 2 * s * (y0 - cy);
      return { y, tilt: Math.atan2(dy, x1 - x0) * 180 / Math.PI };
    };
    const offset = el.dataset.garland === 'footer' ? 2 : mini ? (el._seed = el._seed != null ? el._seed : $$('[data-garland="mini"]').indexOf(el)) + 1 : 0;
    let html = `<svg class="garland__cord" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M${x0} ${y0} Q ${w / 2} ${cy} ${x1} ${y0}"/></svg>`;
    for (let i = 0; i < n; i++) {
      const x = step * (i + 0.5);
      const p = at(x);
      const color = FLAG_COLORS[(i + offset) % FLAG_COLORS.length];
      const shape = FLAG_SHAPES[(i + offset) % FLAG_SHAPES.length];
      const dur = (3.4 + ((i * 7) % 5) * 0.32).toFixed(2);
      const delay = (-((i * 0.53) % 3)).toFixed(2);
      html += `<span class="flag" style="--f-w:${fw}px;left:${(x - fw / 2).toFixed(1)}px;top:${(p.y - 1).toFixed(1)}px;--tilt:${p.tilt.toFixed(2)}deg;--dur:${dur}s;--delay:${delay}s;color:${color}"><svg viewBox="0 0 100 124"><use href="${SPRITE}#${shape}"/></svg></span>`;
    }
    el.innerHTML = html;
  }

  function initGarlands() {
    const gs = $$('[data-garland]');
    const all = () => gs.forEach(buildGarland);
    all();
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(all, 120); }, { passive: true });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-off', !e.isIntersecting)));
      gs.forEach((g) => io.observe(g));
    }
  }

  /* ---------- videos ---------- */
  const preferMp4 = /Apple/.test(navigator.vendor || '');
  function addSources(v, name) {
    if (v._loaded) return;
    v._loaded = true;
    const webm = `<source src="assets/video/${name}.webm" type="video/webm">`;
    const mp4 = `<source src="assets/video/${name}.mp4" type="video/mp4">`;
    v.insertAdjacentHTML('afterbegin', preferMp4 ? mp4 + webm : webm + mp4);
    v.load();
  }

  function syncVideoButton(v) {
    const btn = v.parentElement && $('.vid-btn', v.parentElement);
    if (!btn) return;
    const paused = v.paused || !v._loaded;
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', t(paused ? 'common.playVideo' : 'common.pauseVideo'));
  }

  function play(v) {
    if (v.dataset.poster && !v.getAttribute('poster')) v.poster = v.dataset.poster;
    addSources(v, v.dataset.video);
    const p = v.play();
    if (p && p.catch) p.catch(() => syncVideoButton(v));
  }

  function initVideos() {
    const vids = $$('video[data-video]');
    vids.forEach((v) => {
      v._userPaused = reduced();
      ['play', 'pause'].forEach((ev) => v.addEventListener(ev, () => syncVideoButton(v)));
      const btn = $('.vid-btn', v.parentElement);
      if (btn) btn.addEventListener('click', () => {
        if (v.paused) { v._userPaused = false; play(v); }
        else { v._userPaused = true; v.pause(); }
      });
      syncVideoButton(v);
    });
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { if (v.dataset.poster) v.poster = v.dataset.poster; }); return; }
    const near = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const v = e.target;
        if (v.dataset.poster && !v.getAttribute('poster')) v.poster = v.dataset.poster;
        near.unobserve(v);
      });
    }, { rootMargin: '900px 0px' });
    vids.forEach((v) => near.observe(v));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { if (!v._userPaused && !reduced()) play(v); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.3 });
    vids.forEach((v) => io.observe(v));
  }

  // hero doors: hovering an arch plays a short preview of that shop (mouse only)
  function initDoors() {
    $$('.door__link').forEach((link) => {
      const img = $('img[data-preview]', link);
      if (!img) return;
      let v;
      link.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' || reduced() || !hoverQuery.matches) return;
        if (!v) {
          v = document.createElement('video');
          v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('aria-hidden', 'true');
          v.addEventListener('playing', () => v.classList.add('is-playing'));
          img.parentElement.appendChild(v);
          addSources(v, img.dataset.preview);
        }
        const p = v.play(); if (p && p.catch) p.catch(() => {});
      });
      link.addEventListener('pointerleave', () => { if (v) { v.pause(); v.classList.remove('is-playing'); } });
    });
  }

  /* ---------- showpieces: folk-art decorations breaking out around each video ---------- */
  // x: centre as % of the window width; t / b: centre from the top / bottom in % of the window width
  // (cqw); w: width in % of window width; d: parallax depth (+ front, - behind); l: layer; flip: mirror art
  const DECO_ART = { marigold: '200 / 140', marigolds: '220 / 200', bird: '126 / 80', sun: '1', tile: '1' };
  const DECO_A = [
    { k: 'sun', l: 'back', x: 5, t: 9, w: 31, d: -0.55, r: -8 },
    { k: 'tile', l: 'back', x: 99, b: 7, w: 22, d: -0.35, r: 14 },
    { k: 'tile', l: 'back', x: 86, b: -2, w: 15, d: -0.25, r: -10 },
    { k: 'marigold', l: 'back', x: 103, b: 72, w: 31, d: -0.6, r: 10 },
    { k: 'banner', l: 'front', x: 50, t: -12, w: 112, d: 0.35, r: 0 },
    { k: 'bird', l: 'front', x: 92, t: 3, w: 27, d: 0.9, r: 4 },
    { k: 'marigolds', l: 'front', x: 5, b: 5, w: 42, d: 1, r: -4 },
  ];
  // layout b mirrors the top and the tiles; the marigolds stay bottom-left, clear of the pause button
  const DECO_B = DECO_A.map((o) => (o.k === 'marigolds' || o.k === 'banner') ? o
    : Object.assign({}, o, { x: 100 - o.x, r: -o.r, flip: o.k === 'bird' || o.k === 'sun' }));
  const FLAG_SET = ['#E2367C', '#F08A24', '#F7C232', '#14A39A', '#DD3B2C', '#2457B3', '#E2367C'];

  function bannerHtml() {
    const n = 7;
    let flags = '';
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const y = ((4 + 28 * u * (1 - u)) / 30) * 100;           // on the cord (quadratic sag)
      flags += `<span class="flag deco__flag" style="--f-w:8.6cqw;left:calc(${(u * 100).toFixed(2)}% - 4.3cqw);top:${y.toFixed(1)}%;` +
        `--tilt:${((0.5 - u) * 12).toFixed(1)}deg;--dur:${(3.1 + (i % 3) * 0.45).toFixed(2)}s;--delay:${(-i * 0.47).toFixed(2)}s;` +
        `--unfold:${(0.35 + i * 0.07).toFixed(2)}s;color:${FLAG_SET[i]}"><svg viewBox="0 0 100 124"><use href="${SPRITE}#${FLAG_SHAPES[i % 4]}"/></svg></span>`;
    }
    return `<svg class="deco__cord" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0 4 Q50 18 100 4"/></svg>${flags}`;
  }

  function buildShowpiece(p) {
    if (p.querySelector('.showpiece__layer')) return;
    const list = p.dataset.showpiece === 'b' ? DECO_B : DECO_A;
    const back = document.createElement('div'), front = document.createElement('div');
    back.className = 'showpiece__layer showpiece__back'; front.className = 'showpiece__layer showpiece__front';
    back.setAttribute('aria-hidden', 'true'); front.setAttribute('aria-hidden', 'true');
    list.forEach((o, i) => {
      const el = document.createElement('span');
      el.className = `deco deco--${o.k}${o.flip ? ' deco--flip' : ''}`;
      const top = o.t != null ? `calc(${o.t} * 1cqw)` : `calc(100% - ${o.b} * 1cqw)`;
      el.style.cssText = `--x:${o.x};--w:${o.w};--d:${o.d};--r:${o.r}deg;--ar:${DECO_ART[o.k] || '112 / 24'};` +
        `--delay:${(0.1 + i * 0.08).toFixed(2)}s;--ey:${o.t != null ? 28 : -28}cqw;top:${top}`;
      el.innerHTML = o.k === 'banner' ? bannerHtml() : `<svg aria-hidden="true"><use href="${SPRITE}#deco-${o.k}"/></svg>`;
      (o.l === 'back' ? back : front).appendChild(el);
    });
    p.insertBefore(back, p.firstChild);
    p.appendChild(front);
  }

  function initShowpieces() {
    const pieces = $$('[data-showpiece]');
    pieces.forEach(buildShowpiece);
    if (reduced() || !('IntersectionObserver' in window)) { pieces.forEach((p) => p.classList.add('is-out')); return; }

    // scroll-in: the decorations unfold out from behind the video
    const reveal = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      setTimeout(() => e.target.classList.add('is-out'), 200);
      reveal.unobserve(e.target);
    }), { threshold: 0.28 });
    pieces.forEach((p) => reveal.observe(p));

    // which pieces are near the screen (only those get parallax updates)
    const live = new Set();
    const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) live.add(e.target); else live.delete(e.target); }),
      { rootMargin: '200px 0px' });
    pieces.forEach((p) => near.observe(p));

    // parallax: scroll moves the layers at different speeds; the mouse shifts them gently (desktop)
    const mouse = { x: 0, y: 0, on: false };
    const state = new Map(pieces.map((p) => [p, { mx: 0, my: 0 }]));
    let raf = 0;
    function frame() {
      raf = 0;
      const vh = window.innerHeight, vw = window.innerWidth;
      let again = false;
      live.forEach((p) => {
        const host = p.closest('.area, .visit') || p;
        const r = host.getBoundingClientRect();
        const prog = Math.max(-1, Math.min(1, ((r.top + r.height / 2) - vh / 2) / (r.height / 2 + vh / 2)));
        p.style.setProperty('--sy', (prog * -26).toFixed(2));
        const st = state.get(p);
        let tx = 0, ty = 0;
        if (mouse.on) {
          const b = p.getBoundingClientRect();
          tx = Math.max(-1, Math.min(1, (mouse.x - (b.left + b.width / 2)) / (vw / 2))) * 16;
          ty = Math.max(-1, Math.min(1, (mouse.y - (b.top + b.height / 2)) / (vh / 2))) * 12;
        }
        st.mx += (tx - st.mx) * 0.12; st.my += (ty - st.my) * 0.12;
        if (Math.abs(tx - st.mx) > 0.05 || Math.abs(ty - st.my) > 0.05) again = true;
        p.style.setProperty('--mx', st.mx.toFixed(2));
        p.style.setProperty('--my', st.my.toFixed(2));
      });
      if (again) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick, { passive: true });
    if (hoverQuery.matches) {
      window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; kick(); }, { passive: true });
      document.addEventListener('pointerleave', () => { mouse.on = false; kick(); });
    }
    // touch: a tap on the video makes the decorations react (the hover effects, briefly)
    pieces.forEach((p) => p.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      p.classList.add('is-poked');
      clearTimeout(p._poke);
      p._poke = setTimeout(() => p.classList.remove('is-poked'), 1200);
    }));
    kick();
  }

  /* ---------- header: scrolled state, mobile tabs, active section ---------- */
  function initNav() {
    const header = $('.header');
    const hero = $('.hero');
    const nav = $('.nav');
    const ink = $('.nav__ink');
    const navLinks = $$('.nav__link');
    let active = null;

    function moveInk() {
      const link = navLinks.find((a) => a.dataset.area === active);
      nav.classList.toggle('has-active', !!link);
      if (!link) return;
      ink.style.width = link.offsetWidth - 20 + 'px';
      ink.style.transform = `translateX(${link.offsetLeft + 10}px)`;
    }
    function setActive(area) {
      if (area === active) return;
      active = area;
      if (area) root.dataset.area = area; else delete root.dataset.area;
      navLinks.forEach((a) => {
        const on = a.dataset.area === area;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      moveInk();
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        header.classList.toggle('is-scrolled', window.scrollY > 8);
        const heroBottom = hero.getBoundingClientRect().bottom;
        root.classList.toggle('show-tabs', heroBottom < header.offsetHeight + 40);
        // the section crossing the line 40% down the screen is the active one
        const line = window.innerHeight * 0.4;
        let current = null;
        $$('[data-area]', $('#main')).forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.top <= line && r.bottom > line) current = s.dataset.area;
        });
        setActive(current);
        // once a menu or catalog fills the screen, that section's sticky video eases back (CSS, desktop)
        $$('.area').forEach((s) => {
          const m = $('.menu-wrap, .catalog-wrap', s);
          if (!m) return;
          s.classList.toggle('is-reading', m.getBoundingClientRect().top < window.innerHeight * 0.55 && s.getBoundingClientRect().bottom > window.innerHeight * 0.5);
        });
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { moveInk(); onScroll(); }, { passive: true });
    onScroll();
    return { moveInk };
  }

  /* ---------- shopping cart (pickup orders) ---------- */
  const cart = new Map();   // key ("id", or "id@size" for clothing) -> quantity
  let navApi = { moveInk() {} };
  let lightbox = { refresh() {} };
  const api = {
    // the one place the order leaves the site: swap this for a form or payment service later
    openMail(href) { window.location.href = href; }
  };
  window.lolita = api;
  const AREAS = ['bakery', 'coffee', 'clothing'];
  const orders = () => INFO.orders || {};
  const maxPer = () => orders().maxPerItem || 60;
  const parseKey = (key) => { const [id, sz] = key.split('@'); return { id, size: sz == null ? null : parseInt(sz, 10) }; };
  const sizeLabel = (item, size) => (size == null || !item.sizes ? '' : ((item.sizes[lang] || item.sizes.en || [])[size] || ''));
  function entry(key) {
    const { id, size } = parseKey(key);
    const o = orderables.get(id);
    if (!o) return null;
    if (size != null && !sizeLabel(o.item, size)) return null;
    if (size == null && o.item.sizes) return null;
    return { item: o.item, area: o.area, size };
  }
  const lineName = (e) => L(e.item.name) + (e.size != null ? ' · ' + t('cart.sizeLine', { size: sizeLabel(e.item, e.size) }) : '');
  const areasInCart = () => new Set(Array.from(cart.keys()).map((k) => (entry(k) || {}).area).filter(Boolean));

  function loadCart() {
    cart.clear();
    try {
      const saved = JSON.parse(store.get(CART_KEY) || '{}');
      Object.keys(saved).forEach((key) => {
        const q = parseInt(saved[key], 10);
        if (entry(key) && q > 0) cart.set(key, Math.min(q, maxPer()));
      });
    } catch (e) { /* ignore a broken saved cart */ }
  }
  const saveCart = () => store.set(CART_KEY, JSON.stringify(Object.fromEntries(cart)));
  const pieces = () => Array.from(cart.values()).reduce((a, b) => a + b, 0);
  function totals() {
    let sum = 0, unpriced = false, from = false;
    cart.forEach((q, key) => {
      const e = entry(key);
      if (!e) return;
      if (e.item.price == null) unpriced = true; else sum += e.item.price * q;
      if (e.item.fromPrice) from = true;
    });
    return { sum, unpriced, from };
  }
  const countText = (n) => (n === 1 ? t('cart.countOne') : t('cart.countMany', { n }));
  // "$76.25", or "from $76.25" when clothing priced "from" is in the cart
  const totalText = ({ sum, from }) => (from ? t('cart.from', { price: money(sum) }) : money(sum));
  // the total line: "Price to confirm" when nothing in the cart has a price yet (e.g. only a cake)
  const totalLine = (tot) => (tot.unpriced && tot.sum === 0
    ? t('cart.priceToConfirmOnly')
    : totalText(tot) + (tot.unpriced ? ' + ' + t('cart.priceToConfirm') : ''));
  function bump(el) { if (!el || reduced()) return; el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }

  function step(key, delta) {
    if (!entry(key)) return;
    const next = Math.max(0, Math.min(maxPer(), (cart.get(key) || 0) + delta));
    if (next) cart.set(key, next); else cart.delete(key);
    saveCart();
    updateCartUI(key, delta > 0);
  }

  function updateCartUI(changedKey, bumped) {
    $$('.qty[data-qty]').forEach((q) => {
      const key = q.dataset.qty;
      const n = cart.get(key) || 0;
      const e = entry(key);
      const name = e ? lineName(e) : '';
      q.dataset.count = String(n);
      $('.qty__n', q).textContent = String(n);
      $('.qty__more', q).setAttribute('aria-label', t(n ? 'cart.more' : 'cart.add', { item: name }));
      $('.qty__less', q).setAttribute('aria-label', t('cart.less', { item: name }));
      const row = q.closest('.item');
      if (row) row.classList.toggle('is-picked', n > 0);
      if (bumped && key === changedKey) bump(q);
    });

    const count = pieces();
    const tot = totals();
    const { sum, unpriced } = tot;
    const on = count > 0 && ordersOn();
    const tray = $('[data-tray]');
    if (tray) {
      tray.hidden = false;
      tray.classList.toggle('is-on', on);
      tray.setAttribute('aria-hidden', String(!on));
      $('.tray__btn', tray).tabIndex = on ? 0 : -1;
      document.body.classList.toggle('has-tray', on);
      $('[data-tray-count]').textContent = String(count);
      $('[data-tray-summary]').textContent = countText(count) + (sum > 0 ? ' · ' + totalText(tot) + (unpriced ? ' +' : '') : '');
      if (bumped) bump($('[data-tray-count]'));
    }
    const headBtn = $('[data-cart-btn]');
    if (headBtn) {
      headBtn.hidden = !ordersOn();
      const badge = $('[data-cart-count]', headBtn);
      badge.textContent = String(count);
      badge.hidden = count === 0;
      headBtn.setAttribute('aria-label', t('cart.open', { n: count }));
      headBtn.classList.toggle('has-items', count > 0);
      $('[data-cart-total]', headBtn).textContent = count ? (sum > 0 ? money(sum) + (unpriced || tot.from ? '+' : '') : countText(count)) : '';
      if (bumped) bump(badge);
    }
    renderOrderList();
  }

  function renderOrderList() {
    const list = $('[data-preorder-list]');
    if (!list) return;
    const keys = Array.from(cart.keys()).filter((k) => entry(k));
    const groups = AREAS.map((area) => ({ area, keys: keys.filter((k) => entry(k).area === area) })).filter((g) => g.keys.length);
    list.innerHTML = groups.map((g) => `
      <li class="po__group po__group--${g.area}">${esc(t('nav.' + g.area))}</li>
      ${g.keys.map((key) => {
        const e = entry(key), q = cart.get(key), it = e.item;
        const each = it.price == null ? t('cart.priceToConfirm')
          : it.fromPrice ? t('cart.from', { price: money(it.price, true) })
          : `${t('cart.each', { price: money(it.price) })} · ${money(it.price * q)}`;
        return `<li class="po__line po__line--${g.area}">
          <span class="po__line-name">${esc(lineName(e))}</span>
          ${qtyHtml(it, key, lineName(e), q)}
          <span class="po__line-each">${esc(each)}</span>
        </li>`;
      }).join('')}`).join('');
    $('[data-preorder-empty]').hidden = keys.length > 0;
    $('[data-preorder-clear]').hidden = keys.length === 0;
    const tot = totals();
    $('[data-preorder-total]').textContent = totalLine(tot);
    // clothing note only when clothing is in the cart; otherwise just "we confirm the total" when a price is open
    const note = $('[data-estimate-note]');
    if (note) {
      const clothing = areasInCart().has('clothing');
      note.textContent = clothing ? t('cart.estimateNote') : t('cart.confirmNote');
      note.hidden = !clothing && !tot.unpriced;
    }
    const lead = $('[data-lead-time]');
    if (lead) lead.hidden = !areasInCart().has('bakery');
    updateDateBounds();
  }

  // dates as yyyy-mm-dd in the visitor's local time
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const fmtDate = (s, opts) => new Intl.DateTimeFormat(locale(), opts).format(parseIso(s));
  const fmtTime = (s) => { const [h, m] = s.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }); };

  // earliest pickup day: the strictest section in the cart (bakery needs notice, coffee and clothing can be today)
  function minDays() {
    const m = orders().minDaysAhead;
    if (typeof m === 'number') return m;
    let d = 0;
    areasInCart().forEach((a) => { d = Math.max(d, (m && m[a]) || 0); });
    // too late for a pickup today? then tomorrow is the first option
    if (d === 0 && orders().latestPickup && nowPlus(30) > orders().latestPickup) d = 1;
    return d;
  }
  // "HH:MM" for now + some minutes (same-day orders need a little time to prepare)
  const nowPlus = (mins) => { const n = new Date(Date.now() + mins * 60000); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
  function updateDateBounds() {
    const dateIn = $('#po-date'), timeIn = $('#po-time');
    if (!dateIn) return;
    dateIn.min = iso(addDays(minDays()));
    dateIn.max = iso(addDays(orders().maxDaysAhead || 60));
    if (orders().earliestPickup) timeIn.min = orders().earliestPickup;
    if (orders().latestPickup) timeIn.max = orders().latestPickup;
  }

  function initPreorder() {
    const dialog = $('[data-preorder-dialog]');
    const form = $('[data-preorder-form]');
    const done = $('[data-preorder-done]');
    let tried = false;
    let lastText = '';

    loadCart();
    updateCartUI();

    function addFromCard(btn) {
      const id = btn.dataset.add;
      const o = orderables.get(id);
      if (!o) return;
      const card = btn.closest('.card');
      const sel = $('.card__size', card);
      const err = $('.card__err', card);
      let key = id;
      if (o.item.sizes) {
        if (!sel || sel.value === '') {
          err.textContent = t('cart.chooseSize');
          sel.setAttribute('aria-invalid', 'true');
          sel.focus();
          return;
        }
        key = `${id}@${sel.value}`;
      }
      err.textContent = '';
      if (sel) sel.removeAttribute('aria-invalid');
      step(key, 1);
      const label = $('.card__add-text', btn);
      btn.classList.add('is-added');
      label.textContent = t('cart.added');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove('is-added'); label.textContent = t('cart.addToCart'); }, 1600);
    }

    document.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { addFromCard(add); return; }
      const btn = e.target.closest('.qty__btn');
      if (!btn) return;
      const q = btn.closest('[data-qty]');
      const key = q.dataset.qty;
      const dir = btn.dataset.step;
      const inSheet = !!q.closest('.po__line');
      step(key, parseInt(dir, 10));
      // the list inside the sheet re-renders: put focus back on the same button
      if (inSheet) {
        const same = $(`.po__line [data-qty="${key}"] [data-step="${dir}"]`, dialog);
        const target = (same && cart.has(key) && same) || $('.po__line .qty__more', dialog) || $('[data-preorder-close]', dialog);
        if (target) target.focus();
      } else if (!cart.has(key)) {
        $('.qty__more', q).focus(); // the minus button just disappeared
      }
    });
    document.addEventListener('change', (e) => {
      const sel = e.target.closest('.card__size');
      if (sel && sel.value !== '') { sel.removeAttribute('aria-invalid'); $('.card__err', sel.closest('.card')).textContent = ''; }
    });

    $$('[data-preorder-start]').forEach((a) => a.addEventListener('click', () => {
      const hint = $('.preorder-hint');
      if (!hint || reduced()) return;
      setTimeout(() => { hint.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-in-out' }); }, 650);
    }));

    function showForm() { form.hidden = false; done.hidden = true; }
    function open() {
      showForm();
      renderOrderList();
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      document.body.classList.add('sheet-open');
    }
    function close() { if (dialog.open) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); } }
    dialog.addEventListener('close', () => {
      document.body.classList.remove('sheet-open');
      // the order was handed to the email app: start fresh next time
      if (!done.hidden) { cart.clear(); saveCart(); updateCartUI(); form.reset(); tried = false; showForm(); }
    });

    $$('[data-preorder-open]').forEach((b) => b.addEventListener('click', open));
    $$('[data-cake-order]').forEach((b) => b.addEventListener('click', () => {
      if (!cart.has('party-cake')) step('party-cake', 1);
      open();
    }));
    $('[data-preorder-close]').addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    $('[data-preorder-clear]').addEventListener('click', () => { cart.clear(); saveCart(); updateCartUI(); });
    $('[data-preorder-back]').addEventListener('click', () => { showForm(); $('#po-date').focus(); });

    function setError(name, msg) {
      const out = $(`[data-error-for="${name}"]`, form);
      if (out) out.textContent = msg || '';
      const input = form.elements[name];
      if (input && input.setAttribute) {
        if (msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `err-${name}`); out.id = `err-${name}`; }
        else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
      }
      return !msg;
    }

    function validate() {
      const f = form.elements;
      const errs = {};
      updateDateBounds();
      if (!cart.size) errs.items = t('cart.errItems');
      const min = f.date.min, max = f.date.max, d = f.date.value;
      if (!d || d < min || d > max) errs.date = t('cart.errDate', { min: fmtDate(min, { month: 'long', day: 'numeric' }) });
      const tMin = f.time.min, tMax = f.time.max, tv = f.time.value;
      if (!tv) errs.time = t('cart.errTime');
      else if ((tMin && tv < tMin) || (tMax && tv > tMax)) errs.time = t('cart.errTimeRange', { min: fmtTime(tMin || '00:00'), max: fmtTime(tMax || '23:59') });
      else if (d === iso(addDays(0)) && tv < nowPlus(30)) errs.time = t('cart.errTimePast');
      if (f.name.value.trim().length < 2) errs.name = t('cart.errName');
      if ((f.phone.value.match(/\d/g) || []).length < 10) errs.phone = t('cart.errPhone');
      const em = f.email.value.trim();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) errs.email = t('cart.errEmail');
      ['items', 'date', 'time', 'name', 'phone', 'email'].forEach((k) => setError(k, errs[k]));
      return errs;
    }

    form.addEventListener('input', () => { if (tried) validate(); });

    function composeOrder() {
      const f = form.elements;
      const lines = [];
      AREAS.forEach((area) => {
        const keys = Array.from(cart.keys()).filter((k) => entry(k) && entry(k).area === area);
        if (!keys.length) return;
        lines.push(t('nav.' + area) + ':');
        keys.forEach((k) => {
          const e = entry(k), q = cart.get(k), it = e.item;
          const price = it.price == null ? t('cart.priceToConfirm') : it.fromPrice ? t('cart.from', { price: money(it.price * q, true) }) : money(it.price * q);
          lines.push(`• ${q} × ${lineName(e)}: ${price}`);
        });
        lines.push('');
      });
      const tot = totals();
      const when = `${fmtDate(f.date.value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${fmtTime(f.time.value)}`;
      const body = [
        t('cart.mailHello'), '',
        ...lines,
        `${t('cart.estimate')}: ${totalLine(tot)}`, '',
        `${t('cart.mailPickup')}: ${when}`,
        `${t('cart.mailName')}: ${f.name.value.trim()}`,
        `${t('cart.mailPhone')}: ${f.phone.value.trim()}`,
        f.email.value.trim() ? `${t('cart.mailEmail')}: ${f.email.value.trim()}` : null,
        f.notes.value.trim() ? `${t('cart.mailNotes')}: ${f.notes.value.trim()}` : null,
        '', t('cart.mailPay'), t('cart.mailThanks')
      ].filter((x) => x !== null).join('\n');
      const subject = t('cart.mailSubject', { date: fmtDate(f.date.value, { weekday: 'short', month: 'short', day: 'numeric' }), name: f.name.value.trim() });
      const to = orders().sendTo || INFO.email;
      const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
      return { body, subject, href, to };
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      tried = true;
      const errs = validate();
      const firstBad = ['items', 'date', 'time', 'name', 'phone', 'email'].find((k) => errs[k]);
      if (firstBad) {
        const el = firstBad === 'items' ? $(`[data-error-for="items"]`, form) : form.elements[firstBad];
        if (firstBad === 'items') el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        else el.focus();
        return;
      }
      const order = composeOrder();
      lastText = `${order.subject}\n\n${order.body}`;
      $('[data-preorder-summary]').textContent = order.body;
      $('[data-preorder-mailto]').setAttribute('href', order.href);
      $('[data-preorder-fallback]').textContent = t('cart.doneFallback', { email: order.to });
      form.hidden = true;
      done.hidden = false;
      done.scrollTop = 0;
      $('.po-done__title').focus();
      api.openMail(order.href);
    });

    $('[data-preorder-copy]').addEventListener('click', async () => {
      const label = $('[data-copy-label]');
      let ok = false;
      try { await navigator.clipboard.writeText(lastText); ok = true; } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = lastText; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
      }
      if (ok) {
        label.textContent = t('cart.copied');
        setTimeout(() => { label.textContent = t('cart.copy'); }, 2200);
      }
    });
  }

  /* ---------- language switch ---------- */
  function applyAll() {
    applyText();
    applyInfo();
    renderMenus();
    updateCartUI();
    lightbox.refresh();
    $$('video[data-video]').forEach(syncVideoButton);
    navApi.moveInk();
  }

  function setLang(next) {
    if (next === lang || !(next === 'en' || next === 'es')) return;
    lang = next;
    store.set(LANG_KEY, lang);
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) { url.searchParams.set('lang', lang); history.replaceState(null, '', url); }
    if (reduced()) { applyAll(); return; }
    root.classList.add('is-switching');
    setTimeout(() => {
      applyAll();
      requestAnimationFrame(() => root.classList.remove('is-switching'));
    }, 170);
  }

  /* ---------- start ---------- */
  async function boot() {
    // photos are a nice-to-have: if the file is missing the galleries just stay hidden
    const photosReady = fetch('content/photos.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    try {
      const files = ['content/translations.json', 'content/menu.json', 'content/info.json'];
      const [tr, menu, info] = await Promise.all(files.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`${u}: ${r.status}`);
        return r.json();
      })));
      T = tr; MENU = menu; INFO = info;
      PHOTOS = await photosReady;
    } catch (err) {
      console.error('[lolita] could not load content files', err);
      root.classList.add('load-failed');
      const box = $('[data-load-error]');
      if (box) box.hidden = false;
      return;
    }

    lang = pickLang();
    indexOrderables();
    const year = $('[data-year]');
    if (year) year.textContent = String(new Date().getFullYear());

    applyText();
    applyInfo();
    renderMenus();
    initReveals();
    initGarlands();
    initVideos();
    initShowpieces();
    initDoors();
    navApi = initNav();
    lightbox = initGalleries();
    initPreorder();

    $$('.lang__btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

    // logo and "Back to top": always go all the way up (the header is sticky, so a plain #top jump barely moves)
    $$('a[href="#top"]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      if (!a.classList.contains('brand')) $('.brand').focus({ preventScroll: true });
    }));

    // wait for the display font so headings don't jump, but never more than a moment
    const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]) : Promise.resolve();
    fontsReady.then(() => {
      root.classList.add('is-ready');
      navApi.moveInk();
      $$('[data-garland]').forEach((g) => { g._w = 0; buildGarland(g); });
    });
  }

  boot();
})();
