(() => {
  if (window.__markup) return;
  window.__markup = true;

  const STORE = 'markup.entries';
  const ON = 'markup.enabled';
  const CORNER = 'markup.corner';
  const M = 16; // gap from the viewport edge

  let enabled = false;
  let mode = 'edit'; // edit | comment | browse
  let minimized = false;
  let entries = [];
  let host, root, hoverBox, pickBox, markers, dock, panel, content, pill, seg, thumb;
  let editing = null; // { el, before, html, prev }
  let picked = null; // element chosen in comment mode
  let corner = { right: true, bottom: true }; // where the panel rests
  let anchor = { right: true, bottom: true }; // which panel corner sits on the dock point

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pageKey = () => location.origin + location.pathname;
  const pageEntries = () => entries.filter((e) => e.page === pageKey());
  const save = () => chrome.storage.local.set({ [STORE]: entries });
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const snip = (s, n = 60) => {
    s = clean(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  // ---------- selectors ----------
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      let p = el.localName;
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === el.localName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(p);
      if (el === document.body) break;
      el = parent;
    }
    return parts.join(' > ');
  }
  const find = (sel) => {
    try { return document.querySelector(sel); } catch { return null; }
  };
  const ours = (e) => host && e.composedPath().includes(host);

  // ---------- look ----------
  const CSS_TEXT = `
    :host {
      all: initial;
      --out: cubic-bezier(0.23, 1, 0.32, 1);
      --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      --accent: #007aff; --edit: #34c759; --note: #ffcc00;
      --label: rgba(0,0,0,.85); --label2: rgba(0,0,0,.5); --label3: rgba(0,0,0,.28);
      --material: rgba(252,252,253,.94); --material-solid: #f6f6f8;
      --fill: rgba(0,0,0,.05); --fill2: rgba(0,0,0,.08);
      --thumb: #fff; --thumb-shadow: 0 1px 2px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.06);
      --edge: rgba(0,0,0,.14); --highlight: rgba(255,255,255,.7);
      --field: rgba(255,255,255,.75);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --accent: #0a84ff; --edit: #30d158; --note: #ffd60a;
        --label: rgba(255,255,255,.88); --label2: rgba(255,255,255,.55); --label3: rgba(255,255,255,.3);
        --material: rgba(36,36,40,.7); --material-solid: #242428;
        --fill: rgba(255,255,255,.06); --fill2: rgba(255,255,255,.1);
        --thumb: rgba(255,255,255,.18); --thumb-shadow: 0 1px 2px rgba(0,0,0,.3);
        --edge: rgba(255,255,255,.1); --highlight: rgba(255,255,255,.12);
        --field: rgba(0,0,0,.25);
      }
    }
    * { box-sizing: border-box; font-family: var(--font); -webkit-font-smoothing: antialiased; }

    /* page overlays: instant, they follow the pointer all day */
    .box { position: fixed; pointer-events: none; z-index: 2147483646; border-radius: 5px; display: none; }
    .hover { outline: 2px solid var(--accent); outline-offset: 0; background: color-mix(in srgb, var(--accent) 7%, transparent); }
    .hover.comment { outline-color: var(--note); background: color-mix(in srgb, var(--note) 9%, transparent); }
    .pick { outline: 2px solid var(--note); background: color-mix(in srgb, var(--note) 12%, transparent); }
    .mark { position: fixed; pointer-events: none; z-index: 2147483645; border-radius: 5px; outline: 1.5px dashed var(--edit); }
    .mark.comment { outline-color: var(--note); }
    .mark i { position: absolute; top: -9px; left: -9px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font: 600 10.5px/18px var(--font); font-style: normal; text-align: center; color: #fff; background: var(--edit); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    .mark.comment i { color: #1c1c1e; background: var(--note); }

    /* the dock is a zero-size point; panel and pill hang off it by their anchor corner */
    .dock { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; will-change: transform; }
    .surface {
      position: absolute; color: var(--label);
      background: var(--material);
      -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%);
      box-shadow: inset 0 .5px 0 var(--highlight), 0 0 0 .5px var(--edge), 0 12px 40px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.1);
      transition: opacity 220ms var(--out), transform 220ms var(--out), filter 220ms var(--out), visibility 0s;
    }
    .dock:not(.shown) .surface, .dock.min .panel, .dock:not(.min) .pill {
      opacity: 0; transform: scale(.96); filter: blur(3px); visibility: hidden; pointer-events: none;
      transition: opacity 160ms var(--out), transform 160ms var(--out), filter 160ms var(--out), visibility 0s 160ms;
    }
    .panel { width: 344px; max-height: 70vh; display: flex; flex-direction: column; border-radius: 14px; font-size: 13px; line-height: 1.38; letter-spacing: -.08px; }
    .top { display: flex; align-items: center; gap: 6px; padding: 10px 10px 6px; user-select: none; touch-action: none; }
    .sp { flex: 1; align-self: stretch; }

    .seg { position: relative; display: flex; padding: 2px; border-radius: 8px; background: var(--fill2); }
    .seg button { position: relative; z-index: 1; border: 0; background: none; cursor: default; padding: 3px 11px; border-radius: 6px; font: 500 12px/18px var(--font); letter-spacing: 0; color: var(--label2); transition: color 150ms var(--out); }
    .seg button.on { color: var(--label); }
    .thumb { position: absolute; top: 2px; bottom: 2px; left: 0; border-radius: 6px; background: var(--thumb); box-shadow: var(--thumb-shadow); }
    .seg.ready .thumb { transition: transform 220ms var(--out), width 220ms var(--out); }

    button { -webkit-tap-highlight-color: transparent; }
    .icon { display: grid; place-items: center; width: 22px; height: 22px; border: 0; padding: 0; border-radius: 11px; background: transparent; color: var(--label2); cursor: default; transition: background 120ms var(--out), transform 100ms ease-out; }
    .icon:hover { background: var(--fill2); color: var(--label); }
    .icon svg { width: 10px; height: 10px; }
    button:active { transform: scale(.97); }

    .list {
      overflow: auto; padding: 4px 6px; display: flex; flex-direction: column; gap: 1px; overscroll-behavior: contain;
      -webkit-mask-image: linear-gradient(transparent, #000 6px, #000 calc(100% - 6px), transparent);
              mask-image: linear-gradient(transparent, #000 6px, #000 calc(100% - 6px), transparent);
    }
    .hint { padding: 14px 10px; color: var(--label2); line-height: 1.45; }
    .row { display: flex; gap: 9px; align-items: flex-start; padding: 7px 8px; border-radius: 8px; cursor: default; }
    .row:hover { background: var(--fill); }
    .dot { flex: none; min-width: 18px; height: 18px; margin-top: 0; padding: 0 5px; border-radius: 9px; font: 600 10.5px/18px var(--font); text-align: center; color: #fff; background: var(--edit); }
    .row.comment .dot { color: #1c1c1e; background: var(--note); }
    .body { flex: 1; min-width: 0; word-wrap: break-word; }
    .old { color: var(--label3); text-decoration: line-through; }
    .new { color: var(--label); }
    .ctx { color: var(--label2); font-size: 12px; }
    .x { flex: none; opacity: 0; transition: opacity 120ms var(--out); }
    .row:hover .x { opacity: 1; }

    .compose { padding: 6px 10px 4px; display: flex; flex-direction: column; gap: 6px; }
    .compose .ctx { display: flex; align-items: center; gap: 6px; }
    .compose .ctx span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    textarea { width: 100%; min-height: 58px; resize: vertical; padding: 7px 9px; border-radius: 8px; border: 0; background: var(--field); color: var(--label); font: 13px/1.38 var(--font); letter-spacing: -.08px; outline: none; box-shadow: 0 0 0 .5px var(--edge); transition: box-shadow 150ms var(--out); }
    textarea::placeholder { color: var(--label3); }
    textarea:focus { box-shadow: 0 0 0 .5px var(--accent), 0 0 0 3.5px color-mix(in srgb, var(--accent) 35%, transparent); }

    .foot { display: flex; align-items: center; gap: 6px; padding: 8px 10px 10px; }
    .foot .ctx { flex: 1; }
    .btn { border: 0; cursor: default; border-radius: 7px; padding: 4px 11px; font: 500 12.5px/18px var(--font); letter-spacing: -.05px; color: var(--label); background: var(--fill2); transition: filter 120ms var(--out), transform 100ms ease-out; }
    .btn:hover { filter: brightness(.96); }
    .btn.primary { color: #fff; background: var(--accent); box-shadow: inset 0 .5px 0 rgba(255,255,255,.25); }
    .btn.primary:hover { filter: brightness(1.08); }
    .btn:disabled { opacity: .4; pointer-events: none; }
    .btn svg { width: 11px; height: 11px; margin: 0 4px -1px 0; }

    .pill { display: flex; align-items: center; gap: 8px; padding: 6px 7px 6px 12px; border-radius: 999px; font: 500 12.5px/18px var(--font); letter-spacing: -.05px; user-select: none; touch-action: none; cursor: default; white-space: nowrap; }
    .pill b { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font: 600 11px/20px var(--font); text-align: center; color: #fff; background: var(--accent); }
    .pill b.zero { color: var(--label2); background: var(--fill2); }

    .dock.dragging .surface { transition: none; }

    @media (prefers-reduced-motion: reduce) {
      .surface, .dock:not(.shown) .surface, .dock.min .panel, .dock:not(.min) .pill { transform: none; filter: none; }
      .seg.ready .thumb { transition: opacity 150ms; }
      button:active { transform: none; }
    }
    @media (prefers-reduced-transparency: reduce) {
      .surface { background: var(--material-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
    }
    @media (prefers-contrast: more) {
      .surface { background: var(--material-solid); -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: 0 0 0 1px var(--label2), 0 12px 40px rgba(0,0,0,.25); }
      .seg button { color: var(--label); }
    }
  `;

  const ICON = {
    min: '<svg viewBox="0 0 10 10"><path d="M1.5 5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 12 12"><path d="M2.5 6.5l2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const MODES = [['edit', 'Edit Copy'], ['comment', 'Comment'], ['browse', 'Browse']];

  function div(cls, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount() {
    host = document.createElement('markup-root');
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS_TEXT;
    hoverBox = div('box hover');
    pickBox = div('box pick');
    markers = div('');

    dock = div('dock');
    panel = div('surface panel');
    panel.innerHTML = `
      <div class="top">
        <div class="seg"><span class="thumb"></span>${MODES.map(([m, l]) => `<button data-mode="${m}">${l}</button>`).join('')}</div>
        <span class="sp"></span>
        <button class="icon" data-act="min" title="Minimize">${ICON.min}</button>
        <button class="icon" data-act="close" title="Turn off (Alt+Shift+E)">${ICON.close}</button>
      </div>
      <div class="content"></div>`;
    content = panel.querySelector('.content');
    content.style.cssText = 'display:flex;flex-direction:column;min-height:0;';
    seg = panel.querySelector('.seg');
    thumb = panel.querySelector('.thumb');
    pill = div('surface pill');
    pill.setAttribute('role', 'button');
    pill.title = 'Open Markup';
    dock.append(panel, pill);

    seg.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    panel.querySelector('[data-act="min"]').onclick = () => setMinimized(true);
    panel.querySelector('[data-act="close"]').onclick = () => chrome.storage.local.set({ [ON]: false });
    panel.querySelector('.top').addEventListener('pointerdown', onGrab);
    pill.addEventListener('pointerdown', onGrab);

    root.append(style, markers, hoverBox, pickBox, dock);
    document.documentElement.append(host);
    setAnchorCSS();
  }

  function place(box, el) {
    if (!el || !el.isConnected) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
  }

  function drawMarkers() {
    if (!markers) return;
    markers.innerHTML = '';
    pageEntries().forEach((e, i) => {
      const el = find(e.selector);
      if (!el) return;
      const m = div('mark' + (e.type === 'comment' ? ' comment' : ''), `<i>${i + 1}</i>`);
      place(m, el);
      markers.append(m);
    });
    place(pickBox, picked);
  }

  function moveThumb() {
    const b = seg.querySelector(`[data-mode="${mode}"]`);
    seg.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    thumb.style.width = b.offsetWidth + 'px';
    thumb.style.transform = `translateX(${b.offsetLeft - 2}px)`;
    if (!seg.classList.contains('ready')) requestAnimationFrame(() => seg.classList.add('ready'));
  }

  // ---------- render ----------
  function render() {
    if (!enabled || !dock) return;
    const here = pageEntries();
    const elsewhere = entries.length - here.length;

    pill.innerHTML = `<span>Markup</span><b class="${entries.length ? '' : 'zero'}">${entries.length}</b>`;
    moveThumb();

    const hints = {
      edit: 'Click any text to edit it in place. Return saves, Shift‑Return adds a line, Esc reverts.',
      comment: 'Click anything to leave a note. ↑ selects the parent.',
      browse: 'The page works as normal. Switch to Edit Copy or Comment to mark it up.',
    };

    content.innerHTML = `
      <div class="list">
        ${here.length ? '' : `<div class="hint">${hints[mode]}</div>`}
        ${here.map((e, i) => `
          <div class="row ${e.type}" data-id="${e.id}">
            <span class="dot">${i + 1}</span>
            <div class="body">${e.type === 'edit'
              ? `<div class="old">${esc(snip(e.before, 140))}</div><div class="new">${esc(snip(e.after, 140))}</div>`
              : `<div class="new">${esc(e.comment)}</div><div class="ctx">&lt;${esc(e.tag)}&gt; ${esc(snip(e.before, 70) || '(no text)')}</div>`}
            </div>
            <button class="icon x" data-del="${e.id}" title="Remove">${ICON.close}</button>
          </div>`).join('')}
      </div>
      ${mode === 'comment' && picked ? `
        <div class="compose">
          <div class="ctx"><span>&lt;${esc(picked.localName)}&gt; ${esc(snip(picked.innerText, 60) || '(no text)')}</span>
            <button class="btn" data-act="parent" title="Select parent (↑)">↑ Parent</button></div>
          <textarea placeholder="Note for the agent. Return saves, Esc cancels."></textarea>
        </div>` : ''}
      <div class="foot">
        <span class="ctx">${elsewhere ? `+${elsewhere} on other pages` : ''}</span>
        <button class="btn" data-act="clear" ${entries.length ? '' : 'disabled'}>Clear</button>
        <button class="btn primary" data-act="copy" ${entries.length ? '' : 'disabled'}>Copy Prompt (${entries.length})</button>
      </div>`;

    content.querySelector('[data-act="clear"]').onclick = clearAll;
    content.querySelector('[data-act="copy"]').onclick = (ev) => copyPrompt(ev.currentTarget);
    content.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (ev) => {
      ev.stopPropagation();
      entries = entries.filter((e) => e.id !== b.dataset.del);
      save(); render();
    }));
    content.querySelectorAll('.row').forEach((r) => (r.onclick = () => {
      const e = entries.find((x) => x.id === r.dataset.id);
      const el = e && find(e.selector);
      if (el) el.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
    }));
    const ta = content.querySelector('textarea');
    if (ta) {
      content.querySelector('[data-act="parent"]').onclick = selectParent;
      ta.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); addComment(ta.value); }
        if (ev.key === 'Escape') { picked = null; render(); }
        if (ev.key === 'ArrowUp' && !ta.value) { ev.preventDefault(); selectParent(); }
      };
      setTimeout(() => ta.focus(), 0);
    }
    drawMarkers();
  }

  // ---------- dock position: springs, drag, momentum ----------
  const pos = { x: { value: 0, velocity: 0, target: 0 }, y: { value: 0, velocity: 0, target: 0 } };
  let springRaf = 0, springLast = 0, springParams = { damping: 1, response: 0.35 };

  const viewport = () => ({ w: document.documentElement.clientWidth || innerWidth, h: document.documentElement.clientHeight || innerHeight });
  const surfaceEl = () => (minimized ? pill : panel);
  const dims = () => ({ w: surfaceEl().offsetWidth, h: surfaceEl().offsetHeight });
  const applyPos = () => { dock.style.transform = `translate3d(${pos.x.value}px, ${pos.y.value}px, 0)`; };

  function setAnchorCSS() {
    for (const el of [panel, pill]) {
      el.style.left = anchor.right ? 'auto' : '0';
      el.style.right = anchor.right ? '0' : 'auto';
      el.style.top = anchor.bottom ? 'auto' : '0';
      el.style.bottom = anchor.bottom ? '0' : 'auto';
      el.style.transformOrigin = `${anchor.right ? 'right' : 'left'} ${anchor.bottom ? 'bottom' : 'top'}`;
    }
  }

  // Dock point that puts the surface in corner c, given the current anchor.
  function cornerPoint(c, a = anchor) {
    const { w, h } = dims();
    const vp = viewport();
    const left = c.right ? vp.w - M - w : M;
    const top = c.bottom ? vp.h - M - h : M;
    return { x: a.right ? left + w : left, y: a.bottom ? top + h : top };
  }

  function jumpToCorner() {
    stopSpring();
    anchor = { ...corner };
    setAnchorCSS();
    const p = cornerPoint(corner);
    pos.x.value = pos.x.target = p.x; pos.y.value = pos.y.target = p.y;
    pos.x.velocity = pos.y.velocity = 0;
    applyPos();
  }

  function springTo(tx, ty, vx, vy, params) {
    pos.x.target = tx; pos.y.target = ty;
    pos.x.velocity = vx; pos.y.velocity = vy;
    springParams = params;
    if (reducedMotion.matches) { pos.x.value = tx; pos.y.value = ty; applyPos(); settle(); return; }
    if (!springRaf) { springLast = performance.now(); springRaf = requestAnimationFrame(springTick); }
  }

  // Damping ratio + response (seconds), mass 1. Independent X and Y springs.
  function springTick(now) {
    const dt = Math.min(0.064, (now - springLast) / 1000);
    springLast = now;
    const { damping, response } = springParams;
    const k = (2 * Math.PI / response) ** 2;
    const c = (4 * Math.PI * damping) / response;
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (const s of [pos.x, pos.y]) {
      for (let i = 0; i < steps; i++) {
        s.velocity += (-k * (s.value - s.target) - c * s.velocity) * h;
        s.value += s.velocity * h;
      }
    }
    applyPos();
    const done = [pos.x, pos.y].every((s) => Math.abs(s.value - s.target) < 0.25 && Math.abs(s.velocity) < 4);
    if (done) {
      pos.x.value = pos.x.target; pos.y.value = pos.y.target;
      applyPos();
      springRaf = 0;
      settle();
    } else {
      springRaf = requestAnimationFrame(springTick);
    }
  }

  function stopSpring() {
    if (springRaf) cancelAnimationFrame(springRaf);
    springRaf = 0;
  }

  // Once at rest, hang the surface from the corner it sits in, so it grows away from the edge.
  function settle() {
    if (anchor.right === corner.right && anchor.bottom === corner.bottom) return;
    jumpToCorner();
  }

  const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  function onGrab(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.seg button, .icon')) return;
    const target = e.currentTarget;
    stopSpring(); // interrupt: carry on from the live on-screen value
    const start = { x: e.clientX, y: e.clientY, px: pos.x.value, py: pos.y.value };
    const samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    let moved = false;
    target.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      dock.classList.add('dragging');
      const { w, h } = dims();
      const vp = viewport();
      // Rubber-band past the viewport edges instead of a hard stop.
      let left = (anchor.right ? start.px - w : start.px) + dx;
      let top = (anchor.bottom ? start.py - h : start.py) + dy;
      const maxL = vp.w - w, maxT = vp.h - h;
      if (left < 0) left = -rubberband(-left, vp.w);
      else if (left > maxL) left = maxL + rubberband(left - maxL, vp.w);
      if (top < 0) top = -rubberband(-top, vp.h);
      else if (top > maxT) top = maxT + rubberband(top - maxT, vp.h);
      pos.x.value = anchor.right ? left + w : left;
      pos.y.value = anchor.bottom ? top + h : top;
      applyPos();
      samples.push({ x: ev.clientX, y: ev.clientY, t: ev.timeStamp });
      while (samples.length > 2 && ev.timeStamp - samples[0].t > 100) samples.shift();
    };

    const up = (ev) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      dock.classList.remove('dragging');
      if (!moved) {
        if (target === pill && ev.type === 'pointerup') setMinimized(false);
        else settleBack();
        return;
      }
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      const vx = ev.timeStamp - b.t > 80 ? 0 : (b.x - a.x) / dt; // paused before release = no fling
      const vy = ev.timeStamp - b.t > 80 ? 0 : (b.y - a.y) / dt;

      // Pick the corner nearest to where the throw is heading, not where it was let go.
      const { w, h } = dims();
      const vp = viewport();
      const cx = (anchor.right ? pos.x.value - w : pos.x.value) + w / 2 + project(vx);
      const cy = (anchor.bottom ? pos.y.value - h : pos.y.value) + h / 2 + project(vy);
      corner = { right: cx > vp.w / 2, bottom: cy > vp.h / 2 };
      chrome.storage.local.set({ [CORNER]: corner });
      const p = cornerPoint(corner);
      const flung = Math.hypot(vx, vy) > 300;
      springTo(p.x, p.y, vx, vy, flung ? { damping: 0.8, response: 0.35 } : { damping: 1, response: 0.35 });
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  function settleBack() {
    const p = cornerPoint(corner);
    springTo(p.x, p.y, 0, 0, { damping: 1, response: 0.3 });
  }

  function setMinimized(v) {
    if (minimized === v) return;
    commitEdit();
    minimized = v;
    picked = v ? null : picked;
    // Keep the resting corner fixed while the surface swaps, so panel and pill share one origin.
    if (!springRaf) jumpToCorner();
    dock.classList.toggle('min', v);
    render();
    if (springRaf) settleBack();
  }

  // ---------- actions ----------
  function setMode(m) {
    commitEdit();
    mode = m;
    picked = null;
    hoverBox.style.display = 'none';
    render();
  }

  function selectParent() {
    if (picked && picked.parentElement && picked.parentElement !== document.documentElement) {
      picked = picked.parentElement;
      render();
    }
  }

  function addComment(text) {
    text = text.trim();
    if (!text || !picked) return;
    entries.push({
      id: uid(), type: 'comment', page: pageKey(), url: location.href, title: document.title,
      selector: cssPath(picked), tag: picked.localName, before: clean(picked.innerText).slice(0, 400),
      comment: text, ts: Date.now(),
    });
    picked = null;
    save(); render();
  }

  function startEdit(el, x, y) {
    commitEdit();
    editing = { el, before: el.innerText, html: el.innerHTML, prev: el.getAttribute('contenteditable') };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    const range = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    if (range && el.contains(range.startContainer)) {
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    }
    el.addEventListener('keydown', onEditKey, true);
    el.addEventListener('blur', commitEdit, { once: true });
  }

  function onEditKey(ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitEdit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); editing.el.innerHTML = editing.html; commitEdit(); }
  }

  function commitEdit() {
    if (!editing) return;
    const { el, before, prev } = editing;
    editing = null;
    el.removeEventListener('keydown', onEditKey, true);
    if (prev == null) el.removeAttribute('contenteditable'); else el.setAttribute('contenteditable', prev);
    el.blur();
    const after = el.innerText;
    if (clean(after) === clean(before)) return;
    const selector = cssPath(el);
    const existing = entries.find((e) => e.type === 'edit' && e.page === pageKey() && e.selector === selector);
    if (existing) {
      existing.after = clean(after);
      if (clean(existing.after) === clean(existing.before)) entries = entries.filter((e) => e !== existing);
    } else {
      entries.push({
        id: uid(), type: 'edit', page: pageKey(), url: location.href, title: document.title,
        selector, tag: el.localName, before: clean(before), after: clean(after), ts: Date.now(),
      });
    }
    save(); render();
  }

  function clearAll() {
    if (!entries.length) return;
    const here = pageEntries().length;
    const msg = here === entries.length ? `Clear ${here} change(s)?` : `Clear all ${entries.length} change(s) across every page?`;
    if (!confirm(msg)) return;
    entries = [];
    save(); render();
  }

  function buildPrompt() {
    const byPage = new Map();
    entries.forEach((e) => {
      if (!byPage.has(e.page)) byPage.set(e.page, []);
      byPage.get(e.page).push(e);
    });
    const out = [
      'Apply these copy changes and notes to the site source.',
      'For each edit, search the codebase for the exact "Current" text and replace it with "New". Keep markup, links, and styling intact.',
      'For each comment, do what the note asks to the element described. If a string is not found, list it at the end instead of guessing.',
      '',
    ];
    let n = 0;
    for (const [page, list] of byPage) {
      out.push(`## ${list[0].title ? list[0].title + ' — ' : ''}${page}`, '');
      for (const e of list) {
        n++;
        if (e.type === 'edit') {
          out.push(`${n}. Edit copy in <${e.tag}> \`${e.selector}\``, `   Current: "${e.before}"`, `   New: "${e.after}"`, '');
        } else {
          out.push(`${n}. Comment on <${e.tag}> \`${e.selector}\``);
          if (e.before) out.push(`   Element text: "${snip(e.before, 200)}"`);
          out.push(`   Note: ${e.comment}`, '');
        }
      }
    }
    return out.join('\n').trim() + '\n';
  }

  async function copyPrompt(btn) {
    const text = buildPrompt();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const t = document.createElement('textarea');
      t.value = text; t.style.cssText = 'position:fixed;opacity:0;';
      document.body.append(t); t.select();
      ok = document.execCommand('copy');
      t.remove();
    }
    btn.innerHTML = ok ? `${ICON.check}Copied` : 'Copy Failed';
    setTimeout(render, 1400);
  }

  // ---------- page events ----------
  function onMove(e) {
    if (mode === 'browse' || ours(e) || editing) { hoverBox.style.display = 'none'; return; }
    const el = e.target;
    if (!(el instanceof Element) || el === document.body || el === document.documentElement) { hoverBox.style.display = 'none'; return; }
    hoverBox.className = 'box hover' + (mode === 'comment' ? ' comment' : '');
    place(hoverBox, el);
  }

  function onDown(e) {
    if (mode === 'browse' || ours(e)) return;
    if (editing && editing.el.contains(e.target)) return;
    e.preventDefault();
  }

  function onClick(e) {
    if (mode === 'browse' || ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (mode === 'edit') {
      if (editing && editing.el.contains(el)) return;
      if (!clean(el.innerText)) return;
      hoverBox.style.display = 'none';
      startEdit(el, e.clientX, e.clientY);
    } else if (mode === 'comment') {
      picked = el;
      hoverBox.style.display = 'none';
      if (minimized) setMinimized(false); else render();
    }
  }

  function onKey(e) {
    if (ours(e) || editing) return;
    if (e.key === 'Escape' && mode !== 'browse') { picked ? (picked = null, render()) : setMode('browse'); }
    if (e.key === 'ArrowUp' && mode === 'comment' && picked) { e.preventDefault(); selectParent(); }
  }

  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawMarkers(); hoverBox.style.display = 'none'; });
  };
  const onResize = () => { onScroll(); if (!springRaf) jumpToCorner(); };

  const LISTENERS = [
    ['mousemove', onMove], ['mousedown', onDown], ['click', onClick], ['keydown', onKey],
    ['scroll', onScroll], ['resize', onResize],
  ];

  let hideTimer = 0;
  function enable() {
    if (enabled) return;
    enabled = true;
    clearTimeout(hideTimer);
    if (!host) mount();
    host.style.display = '';
    LISTENERS.forEach(([t, f]) => window.addEventListener(t, f, true));
    render();
    jumpToCorner();
    requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.add('shown')));
  }

  function disable() {
    if (!enabled) return;
    commitEdit();
    enabled = false;
    picked = null;
    LISTENERS.forEach(([t, f]) => window.removeEventListener(t, f, true));
    hoverBox.style.display = 'none';
    pickBox.style.display = 'none';
    markers.innerHTML = '';
    dock.classList.remove('shown');
    hideTimer = setTimeout(() => { if (!enabled) host.style.display = 'none'; }, 180);
  }

  chrome.storage.onChanged.addListener((ch) => {
    if (ch[STORE]) { entries = ch[STORE].newValue || []; render(); }
    if (ch[ON]) (ch[ON].newValue ? enable : disable)();
    if (ch[CORNER] && ch[CORNER].newValue && !springRaf) {
      corner = ch[CORNER].newValue;
      if (enabled) settleBack();
    }
  });

  chrome.storage.local.get([STORE, ON, CORNER]).then((s) => {
    entries = s[STORE] || [];
    if (s[CORNER]) corner = s[CORNER];
    if (s[ON]) enable();
  });

  // SPA route changes: redraw markers for the new path.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; picked = null; render(); }
  }, 800);
})();
