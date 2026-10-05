/* Kočičí bydlení – frontend e-shopu (návrh). Data: data/products.json, data/settings.json */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = n => n.toLocaleString('cs-CZ') + ' Kč';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CART_KEY = 'kb_cart_v1';

  // Ilustrace kategorií pro placeholdery obrázků
  const ICONS = {
    skrabadla: '<svg viewBox="0 0 100 100"><rect x="18" y="84" width="64" height="6" rx="2"/><path d="M34 84V40M66 84V58"/><rect x="24" y="34" width="26" height="6" rx="2"/><rect x="52" y="52" width="26" height="6" rx="2"/><path d="M34 34V14"/><rect x="22" y="10" width="26" height="5" rx="2"/><path d="M38 44v6M38 56v6M38 68v6M62 62v6M62 72v6"/></svg>',
    pelisky: '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="66" rx="38" ry="14"/><path d="M12 66c0-12 17-20 38-20s38 8 38 20"/><path d="M36 58c4-8 24-8 28 0"/><path d="M40 54l-3-7 6 3M60 54l3-7-6 3"/></svg>',
    domecky: '<svg viewBox="0 0 100 100"><path d="M20 86V46L50 22l30 24v40Z"/><path d="M12 52 50 20l38 32"/><path d="M38 86V68a12 12 0 0 1 24 0v18"/><path d="M14 86h72"/></svg>',
    okno: '<svg viewBox="0 0 100 100"><rect x="18" y="12" width="64" height="56" rx="2"/><path d="M50 12v56M18 40h64"/><path d="M26 68c0 12 48 12 48 0"/><path d="M30 68l-6 18M70 68l6 18M16 86h68"/></svg>',
    hracky: '<svg viewBox="0 0 100 100"><path d="M14 88 58 30"/><path d="M58 30c8 2 14 10 12 20"/><path d="M70 50c-6 4-8 12-4 18M66 68l-6 6M66 68l8 4M66 68l2 9"/><circle cx="72" cy="80" r="5"/></svg>'
  };
  const ph = (cat, extra = '') => `<div class="ph ${extra}">${ICONS[cat] || ICONS.domecky}</div>`;
  const CAT_TINT = { skrabadla: '#e8dcc4', pelisky: '#e4e2cf', domecky: '#ead8bd', okno: '#e3ddd0', hracky: '#efe0b8' };

  const state = {
    products: [], settings: null, cats: {},
    filter: 'all', sort: 'rec', q: '',
    cart: load(),
    detail: null,
    co: { step: 1, ship: null, pay: null }
  };

  function load() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
  function save() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch {} }

  /* ---------- Data ---------- */
  async function loadData() {
    try {
      const [p, s] = await Promise.all([
        fetch('data/products.json').then(r => { if (!r.ok) throw r; return r.json(); }),
        fetch('data/settings.json').then(r => { if (!r.ok) throw r; return r.json(); })
      ]);
      return { products: p, settings: s };
    } catch {
      // Fallback pro otevření přes file:// (fetch je blokovaný) – data/data.js generovaný z JSON
      await new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'data/data.js'; sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
      return window.KB_DATA;
    }
  }

  /* ---------- Kategorie + chipy ---------- */
  function renderCats() {
    const counts = {};
    state.products.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
    $('#cats').innerHTML = state.settings.categories.map(c => `
      <button class="cat" data-cat="${c.id}">
        <div class="ph" style="background:linear-gradient(145deg,${CAT_TINT[c.id]},#dccdb0)">${ICONS[c.id]}</div>
        <div class="cat__body"><h3>${esc(c.name)}</h3><span>${counts[c.id] || 0} produktů</span></div>
      </button>`).join('');

    $('#chips').innerHTML = [{ id: 'all', name: 'Vše' }, ...state.settings.categories]
      .map(c => `<button class="chip${c.id === state.filter ? ' is-active' : ''}" data-filter="${c.id}">${esc(c.name)}</button>`).join('');
  }

  function setFilter(cat, scroll) {
    state.filter = cat;
    $$('.chip').forEach(c => c.classList.toggle('is-active', c.dataset.filter === cat));
    $$('.nav a').forEach(a => a.classList.toggle('is-active', a.dataset.cat === cat));
    renderGrid();
    if (scroll) $('#obchod').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- Mřížka produktů ---------- */
  function stockHtml(p) {
    if (p.stock <= 0) return '<span class="stock stock--low">Vyprodáno</span>';
    if (p.stock <= 5) return `<span class="stock stock--low">Poslední ${p.stock} ks</span>`;
    return '<span class="stock">Skladem</span>';
  }
  function flagHtml(p) {
    let h = '';
    if (p.flag === 'tip') h += '<span class="flag flag--tip">Tip chovatelky</span>';
    if (p.flag === 'new') h += '<span class="flag flag--new">Novinka</span>';
    if (p.old) h += `<span class="flag flag--sale">−${Math.round((1 - p.price / p.old) * 100)} %</span>`;
    return h;
  }
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function renderGrid() {
    let list = state.products.slice();
    if (state.filter !== 'all') list = list.filter(p => p.cat === state.filter);
    if (state.q) {
      const q = norm(state.q);
      list = list.filter(p => norm(p.name + ' ' + p.short + ' ' + state.cats[p.cat]).includes(q));
    }
    const rank = p => (p.flag === 'tip' ? 0 : p.flag === 'new' ? 1 : 2);
    if (state.sort === 'asc') list.sort((a, b) => a.price - b.price);
    else if (state.sort === 'desc') list.sort((a, b) => b.price - a.price);
    else if (state.sort === 'new') list.sort((a, b) => (b.flag === 'new') - (a.flag === 'new') || state.products.indexOf(b) - state.products.indexOf(a));
    else list.sort((a, b) => rank(a) - rank(b));

    $('#grid').innerHTML = list.map((p, i) => `
      <article class="card" data-id="${p.id}" style="animation-delay:${i * 40}ms" tabindex="0">
        <div class="card__img">${flagHtml(p)}<div class="ph" style="background:linear-gradient(145deg,${CAT_TINT[p.cat]},#dccdb0)">${ICONS[p.cat]}</div></div>
        <div class="card__body">
          <span class="card__cat">${esc(state.cats[p.cat])}</span>
          <h3 class="card__name">${esc(p.name)}</h3>
          <p class="card__short">${esc(p.short)}</p>
          ${stockHtml(p)}
          <div class="card__foot">
            <div class="price">${p.old ? `<del>${fmt(p.old)}</del>` : ''}${fmt(p.price)}</div>
            <button class="add" data-add="${p.id}" aria-label="Přidat ${esc(p.name)} do košíku"${p.stock <= 0 ? ' disabled' : ''}>+</button>
          </div>
        </div>
      </article>`).join('');

    $('#empty').hidden = list.length > 0;
    const n = list.length;
    $('#resultCount').textContent = n ? `${n} ${n === 1 ? 'produkt' : n < 5 ? 'produkty' : 'produktů'}` : '';
  }

  /* ---------- Detail produktu ---------- */
  function openDetail(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    state.detail = { p, color: 0, qty: 1 };
    $('#pd').innerHTML = `
      <div class="pd__img">${flagHtml(p)}<div class="ph" style="background:linear-gradient(145deg,${CAT_TINT[p.cat]},#d4c29f)">${ICONS[p.cat]}<span>Foto produktu</span></div></div>
      <div class="pd__body">
        <span class="label">${esc(state.cats[p.cat])}</span>
        <h2>${esc(p.name)}</h2>
        ${stockHtml(p)}
        <div class="pd__price"><span class="price">${fmt(p.price)}</span>${p.old ? `<del>${fmt(p.old)}</del>` : ''}</div>
        <p class="pd__desc">${esc(p.desc)}</p>
        <p class="pd__label">Barva <b id="pdColor">${esc(p.colors[0].name)}</b></p>
        <div class="swatches">${p.colors.map((c, i) => `<button class="swatch${i ? '' : ' is-active'}" data-swatch="${i}" style="background:${c.hex}" title="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`).join('')}</div>
        <div class="pd__buy">
          <div class="qty"><button type="button" data-pdq="-1" aria-label="Méně">−</button><span id="pdQty">1</span><button type="button" data-pdq="1" aria-label="Více">+</button></div>
          <button class="btn btn--dark" id="pdAdd"${p.stock <= 0 ? ' disabled' : ''}>Do košíku</button>
        </div>
        <dl class="params">${Object.entries(p.params).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      </div>`;
    openModal('#productModal');
  }

  /* ---------- Košík ---------- */
  const subtotal = () => state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = () => state.cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(id, colorIdx = 0, qty = 1) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const color = p.colors[colorIdx]?.name || '';
    const key = id + '|' + color;
    const item = state.cart.find(i => i.key === key);
    const max = Math.max(p.stock, 1);
    if (item) item.qty = Math.min(item.qty + qty, max);
    else state.cart.push({ key, id, name: p.name, cat: p.cat, color, price: p.price, qty: Math.min(qty, max) });
    save(); renderCart();
    const badge = $('#cartCount');
    badge.classList.add('bump'); setTimeout(() => badge.classList.remove('bump'), 300);
    toast(`Přidáno do košíku: ${p.name}`);
  }

  function changeQty(key, d) {
    const item = state.cart.find(i => i.key === key);
    if (!item) return;
    const p = state.products.find(x => x.id === item.id);
    item.qty = Math.min(item.qty + d, p ? Math.max(p.stock, 1) : 99);
    if (item.qty <= 0) state.cart = state.cart.filter(i => i !== item);
    save(); renderCart();
  }

  function renderCart() {
    $('#cartCount').textContent = count();
    const sub = subtotal(), free = state.settings.freeShippingFrom;
    const box = $('#cartItems');
    if (!state.cart.length) {
      box.innerHTML = `<div class="cart-empty"><p class="label">Košík je prázdný</p><div class="divider"><span></span>◆<span></span></div><a href="#obchod" class="btn btn--outline" data-close>Vybrat něco pro kočku</a></div>`;
    } else {
      box.innerHTML = state.cart.map(i => `
        <div class="ci">
          ${ph(i.cat)}
          <div>
            <div class="ci__name">${esc(i.name)}</div>
            <div class="ci__var">${esc(i.color)} · ${fmt(i.price)}</div>
            <div class="qty"><button data-q="-1" data-key="${esc(i.key)}" aria-label="Méně">−</button><span>${i.qty}</span><button data-q="1" data-key="${esc(i.key)}" aria-label="Více">+</button></div>
          </div>
          <div class="ci__right"><span class="ci__price">${fmt(i.price * i.qty)}</span><button class="remove" data-remove="${esc(i.key)}">Odebrat</button></div>
        </div>`).join('');
    }
    $('#cartSubtotal').textContent = fmt(sub);
    $('#checkoutBtn').disabled = !state.cart.length;
    const sp = $('#shipProgress');
    const isFree = sub >= free;
    sp.classList.toggle('is-free', isFree);
    $('#shipText').innerHTML = isFree ? '◆ Máte dopravu zdarma!' : `Do dopravy zdarma zbývá <strong>${fmt(free - sub)}</strong>`;
    $('#shipBar').style.width = Math.min(100, sub / free * 100) + '%';
  }

  /* ---------- Objednávka ---------- */
  const shipPrice = s => (subtotal() >= state.settings.freeShippingFrom ? 0 : s.price);
  const curShip = () => state.settings.shipping.find(s => s.id === state.co.ship);
  const curPay = () => state.settings.payments.find(p => p.id === state.co.pay);
  const total = () => subtotal() + (curShip() ? shipPrice(curShip()) : 0) + (curPay() ? curPay().price : 0);

  function renderOptions() {
    $('#shipOptions').innerHTML = state.settings.shipping.map(s => {
      const pr = shipPrice(s);
      const priceHtml = pr === 0 ? `${s.price ? `<s>${fmt(s.price)}</s>` : ''}<span class="free">Zdarma</span>` : fmt(pr);
      return `<label class="opt"><input type="radio" name="ship" value="${s.id}"${state.co.ship === s.id ? ' checked' : ''}><span class="opt__txt"><strong>${esc(s.name)}</strong><span>${esc(s.desc)}</span></span><span class="opt__price">${priceHtml}</span></label>`;
    }).join('');
    $('#payOptions').innerHTML = state.settings.payments.map(p =>
      `<label class="opt"><input type="radio" name="pay" value="${p.id}"${state.co.pay === p.id ? ' checked' : ''}><span class="opt__txt"><strong>${esc(p.name)}</strong><span>${esc(p.desc)}</span></span><span class="opt__price">${p.price ? '+ ' + fmt(p.price) : '<span class="free">Zdarma</span>'}</span></label>`).join('');
  }

  function openCheckout() {
    if (!state.cart.length) return;
    closeAll();
    state.co.step = 1;
    state.co.ship = state.co.ship || state.settings.shipping[0].id;
    state.co.pay = state.co.pay || state.settings.payments[0].id;
    renderOptions();
    goStep(1);
    openModal('#checkoutModal');
  }

  function goStep(n) {
    state.co.step = n;
    $$('.co-step').forEach(s => s.hidden = +s.dataset.step !== n);
    $$('#steps .step').forEach((s, i) => {
      s.classList.toggle('is-active', i + 1 === n);
      s.classList.toggle('is-done', i + 1 < n || n === 4);
    });
    $('#coFoot').hidden = n === 4;
    $('#coBack').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('#coNext').textContent = n === 3 ? 'Odeslat objednávku' : 'Pokračovat';
    $('#coTotal').textContent = fmt(total());
    if (n === 2) {
      const needAddr = curShip().address;
      $('#checkoutForm').classList.toggle('addr-off', !needAddr);
      $('#addrNote').textContent = needAddr ? '' : '(u osobního odběru nepovinná)';
    }
    if (n === 3) renderSummary();
    $('#checkoutModal .modal__box').scrollTop = 0;
  }

  const RULES = {
    name: v => v.trim().split(/\s+/).length >= 2 || 'Vyplňte jméno i příjmení.',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Zadejte platný e-mail.',
    phone: v => /^(\+?\d{3})?\s?\d{3}\s?\d{3}\s?\d{3}$/.test(v.trim()) || 'Zadejte telefon ve tvaru +420 777 123 456.',
    street: v => /\S+\s+\d/.test(v.trim()) || 'Zadejte ulici a číslo popisné.',
    city: v => v.trim().length >= 2 || 'Zadejte město.',
    zip: v => /^\d{3}\s?\d{2}$/.test(v.trim()) || 'PSČ má 5 číslic.'
  };

  function validateField(input) {
    const rule = RULES[input.name];
    if (!rule) return true;
    const field = input.closest('.field');
    const optional = input.hasAttribute('data-addr') && !curShip().address && !input.value.trim();
    const res = optional ? true : rule(input.value);
    field.classList.toggle('is-invalid', res !== true);
    let msg = $('small', field);
    if (res !== true) { if (!msg) { msg = document.createElement('small'); field.appendChild(msg); } msg.textContent = res; }
    else if (msg) msg.remove();
    return res === true;
  }

  function validateStep2() {
    const inputs = $$('.co-step[data-step="2"] input');
    const ok = inputs.map(validateField).every(Boolean);
    if (!ok) $('.co-step[data-step="2"] .is-invalid input')?.focus();
    return ok;
  }

  function renderSummary() {
    const f = new FormData($('#checkoutForm'));
    const s = curShip(), p = curPay(), sp = shipPrice(s);
    const addr = s.address || f.get('street') ? `${esc(f.get('street'))}, ${esc(f.get('zip'))} ${esc(f.get('city'))}` : 'Osobní odběr – Železný Brod';
    $('#summary').innerHTML = `
      ${state.cart.map(i => `<div class="line"><span>${i.qty}× ${esc(i.name)} <small>(${esc(i.color)})</small></span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
      <hr>
      <div class="line"><span>Doprava: ${esc(s.name)}</span><span>${sp ? fmt(sp) : 'Zdarma'}</span></div>
      <div class="line"><span>Platba: ${esc(p.name)}</span><span>${p.price ? fmt(p.price) : 'Zdarma'}</span></div>
      <hr>
      <div class="line total"><span>Celkem k úhradě</span><span>${fmt(total())}</span></div>
      <hr>
      <p class="who"><strong>${esc(f.get('name'))}</strong><br>${esc(f.get('email'))} · ${esc(f.get('phone'))}<br>${addr}${f.get('note') ? `<br><em>„${esc(f.get('note'))}“</em>` : ''}</p>`;
  }

  function submitStep(e) {
    e.preventDefault();
    const n = state.co.step;
    if (n === 1) return goStep(2);
    if (n === 2) return validateStep2() && goStep(3);
    if (n === 3) {
      if (!$('#terms').checked) { $('#termsErr').hidden = false; return; }
      const d = new Date();
      const no = `KB${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 9000) + 1000)}`;
      $('#orderNo').textContent = no;
      // TODO backend: odeslání objednávky (state.cart, FormData, doprava, platba)
      state.cart = []; save(); renderCart();
      $('#checkoutForm').reset(); $('#termsErr').hidden = true;
      state.co.ship = state.co.pay = null;
      goStep(4);
    }
  }

  /* ---------- Modaly / drawer ---------- */
  function openModal(sel) {
    $(sel).classList.add('is-open'); $(sel).setAttribute('aria-hidden', 'false');
    document.body.classList.add('lock');
    setTimeout(() => $(sel + ' .modal__close')?.focus(), 50);
  }
  function openDrawer() {
    closeAll();
    $('#drawer').classList.add('is-open'); $('#drawer').setAttribute('aria-hidden', 'false');
    $('#overlay').classList.add('is-open'); document.body.classList.add('lock');
  }
  function closeTop() {
    const m = $$('.modal.is-open').pop();
    if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }
    else if ($('#drawer').classList.contains('is-open')) { $('#drawer').classList.remove('is-open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#overlay').classList.remove('is-open'); }
    else { toggleNav(false); $('#searchbar').classList.remove('is-open'); }
    if (!$('.modal.is-open') && !$('#drawer.is-open')) document.body.classList.remove('lock');
  }
  function closeAll() {
    $$('.modal.is-open').forEach(m => { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); });
    $('#drawer').classList.remove('is-open'); $('#overlay').classList.remove('is-open');
    toggleNav(false);
    document.body.classList.remove('lock');
  }
  function toggleNav(open) {
    const o = open ?? !$('#nav').classList.contains('is-open');
    document.documentElement.style.setProperty('--nav-top', $('#header').getBoundingClientRect().bottom + 'px');
    $('#nav').classList.toggle('is-open', o); $('#burger').classList.toggle('is-open', o);
  }

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('is-show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-show'), 2600);
  }

  /* ---------- Události ---------- */
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target;
      const add = t.closest('[data-add]');
      if (add) { e.stopPropagation(); return addToCart(add.dataset.add); }
      const card = t.closest('.card');
      if (card) return openDetail(card.dataset.id);
      const catEl = t.closest('[data-cat]');
      if (catEl) { e.preventDefault(); toggleNav(false); return setFilter(catEl.dataset.cat, true); }
      const chip = t.closest('[data-filter]');
      if (chip) return setFilter(chip.dataset.filter);
      const sw = t.closest('[data-swatch]');
      if (sw) {
        state.detail.color = +sw.dataset.swatch;
        $$('.swatch').forEach(s => s.classList.toggle('is-active', s === sw));
        $('#pdColor').textContent = state.detail.p.colors[state.detail.color].name;
        return;
      }
      const pdq = t.closest('[data-pdq]');
      if (pdq) {
        const max = Math.max(state.detail.p.stock, 1);
        state.detail.qty = Math.min(max, Math.max(1, state.detail.qty + +pdq.dataset.pdq));
        $('#pdQty').textContent = state.detail.qty; return;
      }
      if (t.closest('#pdAdd')) { const d = state.detail; addToCart(d.p.id, d.color, d.qty); return closeTop(); }
      const q = t.closest('[data-q]');
      if (q) return changeQty(q.dataset.key, +q.dataset.q);
      const rm = t.closest('[data-remove]');
      if (rm) { state.cart = state.cart.filter(i => i.key !== rm.dataset.remove); save(); return renderCart(); }
      if (t.closest('[data-close]')) return closeTop();
      if (t.classList.contains('modal') || t.id === 'overlay') return closeTop();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeTop();
      if (e.key === 'Enter' && e.target.classList.contains('card')) openDetail(e.target.dataset.id);
    });

    $('#cartOpen').addEventListener('click', openDrawer);
    $('#checkoutBtn').addEventListener('click', openCheckout);
    $('#burger').addEventListener('click', () => toggleNav());
    $('#searchToggle').addEventListener('click', () => {
      const sb = $('#searchbar'); sb.classList.toggle('is-open');
      if (sb.classList.contains('is-open')) setTimeout(() => $('#headerSearch').focus(), 200);
    });
    $('#headerSearch').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      state.q = e.target.value; $('#shopSearch').value = state.q;
      setFilter('all', true); $('#searchbar').classList.remove('is-open');
    });
    $('#shopSearch').addEventListener('input', e => { state.q = e.target.value; renderGrid(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderGrid(); });
    $('#resetFilters').addEventListener('click', () => { state.q = ''; $('#shopSearch').value = ''; setFilter('all'); });

    const form = $('#checkoutForm');
    form.addEventListener('submit', submitStep);
    form.addEventListener('change', e => {
      if (e.target.name === 'ship') { state.co.ship = e.target.value; $('#coTotal').textContent = fmt(total()); }
      if (e.target.name === 'pay') { state.co.pay = e.target.value; $('#coTotal').textContent = fmt(total()); }
      if (e.target.name === 'terms' && e.target.checked) $('#termsErr').hidden = true;
    });
    form.addEventListener('focusout', e => { if (e.target.matches('input') && e.target.value) validateField(e.target); });
    form.addEventListener('input', e => { if (e.target.closest('.is-invalid')) validateField(e.target); });
    $('#coBack').addEventListener('click', () => goStep(Math.max(1, state.co.step - 1)));

    window.addEventListener('scroll', () => $('#header').classList.toggle('is-scrolled', scrollY > 10), { passive: true });
    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------- Start ---------- */
  loadData().then(({ products, settings }) => {
    state.products = products;
    state.settings = settings;
    settings.categories.forEach(c => state.cats[c.id] = c.name);
    // ceny v košíku vždy podle aktuálních dat
    state.cart = state.cart.filter(i => products.some(p => p.id === i.id))
      .map(i => ({ ...i, price: products.find(p => p.id === i.id).price }));
    renderCats(); renderGrid(); renderCart(); bind();
  }).catch(err => {
    console.error(err);
    $('#grid').innerHTML = '<p>Produkty se nepodařilo načíst.</p>';
  });
})();
