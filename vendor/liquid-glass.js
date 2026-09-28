// Liquid glass displacement filter.
// Based on liquid-glass by Shu Ding (https://github.com/shuding/liquid-glass), MIT License,
// Copyright (c) 2025 Shu Ding. Full license text: vendor/LICENSE-liquid-glass.
//
// Changes from the original console demo: no container, drag, or mouse code. The shader core
// (SDF helpers, displacement-map baking, feImage + feDisplacementMap filter) is wrapped in
// createLiquidGlass(), which bakes a map for an element's size and re-bakes it on resize.
// The default fragment is a rim lens: clear in the middle, bending the backdrop near the edge.

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  function smoothStep(a, b, t) {
    t = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function length(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function roundedRectSDF(x, y, width, height, radius) {
    const qx = Math.abs(x) - width + radius;
    const qy = Math.abs(y) - height + radius;
    return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
  }

  function texture(x, y) {
    return { type: 't', x, y };
  }

  function generateId() {
    return 'liquid-glass-' + Math.random().toString(36).slice(2, 11);
  }

  // Rim lens in pixel space: inside the bezel band, sample the backdrop from further in,
  // along the surface normal, so content bends toward the edge like thick glass.
  function rimLens({ radius, bezel, strength }) {
    return (uv, w, h) => {
      const px = uv.x * w, py = uv.y * h;
      const x = px - w / 2, y = py - h / 2;
      const r = Math.min(radius, w / 2, h / 2);
      const d = roundedRectSDF(x, y, w / 2, h / 2, r);
      const depth = -d;
      if (depth >= bezel || depth < 0) return texture(uv.x, uv.y);
      const e = 0.5;
      let nx = roundedRectSDF(x + e, y, w / 2, h / 2, r) - roundedRectSDF(x - e, y, w / 2, h / 2, r);
      let ny = roundedRectSDF(x, y + e, w / 2, h / 2, r) - roundedRectSDF(x, y - e, w / 2, h / 2, r);
      const n = length(nx, ny) || 1;
      nx /= n; ny /= n;
      const falloff = smoothStep(bezel, 0, depth); // 1 at the rim, 0 at the inner edge of the band
      const pull = falloff * falloff * bezel * strength;
      return texture((px - nx * pull) / w, (py - ny * pull) / h);
    };
  }

  // Bake the fragment into an RGB displacement map, as in the original Shader.updateShader.
  function bake(canvas, context, fragment, w, h) {
    canvas.width = w;
    canvas.height = h;
    const data = new Uint8ClampedArray(w * h * 4);
    const raw = new Float32Array(w * h * 2);
    let maxScale = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j += 2) {
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const pos = fragment({ x: x / w, y: y / h }, w, h);
      const dx = pos.x * w - x;
      const dy = pos.y * h - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      raw[j] = dx;
      raw[j + 1] = dy;
    }
    maxScale = Math.max(maxScale * 0.5, 0.001);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 2) {
      data[i] = (raw[j] / maxScale + 0.5) * 255;
      data[i + 1] = (raw[j + 1] / maxScale + 0.5) * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    context.putImageData(new ImageData(data, w, h), 0, 0);
    return { url: canvas.toDataURL(), scale: maxScale };
  }

  // Attach a liquid glass filter to `el`. The SVG goes into `root` (a document or shadow root
  // that shares the element's tree scope, so url(#id) resolves). Returns { id, filter, destroy }.
  function createLiquidGlass(el, root, opts = {}) {
    const options = { radius: 14, bezel: 16, strength: 0.9, blur: 6, saturate: 1.6, brightness: 1, ...opts };
    const id = generateId();
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    const feImage = document.createElementNS(SVG_NS, 'feImage');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('preserveAspectRatio', 'none');
    const feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'map');
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');
    filter.append(feImage, feDisp);
    svg.append(filter);
    root.append(svg);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fragment = options.fragment || rimLens(options);
    let lastW = 0, lastH = 0;

    function update() {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w; lastH = h;
      const { url, scale } = bake(canvas, context, fragment, w, h);
      for (const node of [filter, feImage]) {
        node.setAttribute('width', String(w));
        node.setAttribute('height', String(h));
      }
      feImage.setAttributeNS(XLINK_NS, 'href', url);
      feImage.setAttribute('href', url);
      feDisp.setAttribute('scale', String(scale));
    }

    const filterCSS = `url(#${id}) blur(${options.blur}px) saturate(${options.saturate}) brightness(${options.brightness})`;
    el.style.setProperty('--glass-filter', filterCSS);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return {
      id,
      filter: filterCSS,
      update,
      destroy() { ro.disconnect(); svg.remove(); el.style.removeProperty('--glass-filter'); },
    };
  }

  globalThis.createLiquidGlass = createLiquidGlass;
})();
