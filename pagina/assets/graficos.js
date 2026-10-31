(() => {
  const NS = "http://www.w3.org/2000/svg";
  const nodo = (tag, attrs = {}, padre = null) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.append(el);
    return el;
  };
  const vistos = new WeakMap();

  function ejes(svg, ancho, alto, pad, lo, hi, y, etiquetaY) {
    for (let k = 0; k <= 4; k += 1) {
      const v = lo + ((hi - lo) * k) / 4;
      nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: y(v).toFixed(1), y2: y(v).toFixed(1), stroke: "rgba(255,255,255,.08)" }, svg);
      nodo("text", { x: ancho - pad.r + 10, y: (y(v) + 3.5).toFixed(1), fill: "#7d7d84", "font-size": 11 }, svg).textContent = etiquetaY(v);
    }
  }

  function rotulosX(svg, ancho, alto, xs, etiquetas) {
    const marcas = Math.min(xs.length, ancho < 480 ? 3 : 5);
    for (let k = 0; k < marcas; k += 1) {
      const i = Math.round((k / Math.max(1, marcas - 1)) * (xs.length - 1));
      nodo("text", { x: xs[i].toFixed(1), y: alto - 8, fill: "#7d7d84", "font-size": 11, "text-anchor": k === 0 ? "start" : k === marcas - 1 ? "end" : "middle" }, svg).textContent = etiquetas[i];
    }
  }

  function preparar(svg) {
    svg.replaceChildren();
    const ancho = svg.clientWidth || 600, alto = svg.clientHeight || 340;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    return { ancho, alto, pad: { l: 8, r: 66, t: 14, b: 26 } };
  }

  function tip(svg, wrap, tipEl, xs, contenido, ev) {
    const g = vistos.get(svg);
    if (!g) return;
    const caja = svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * g.ancho;
    let i = 0, mejor = Infinity;
    xs.forEach((x, k) => { const d = Math.abs(x - px); if (d < mejor) { mejor = d; i = k; } });
    g.cursor.setAttribute("x1", xs[i].toFixed(1));
    g.cursor.setAttribute("x2", xs[i].toFixed(1));
    g.cursor.setAttribute("visibility", "visible");
    tipEl.innerHTML = contenido(i);
    tipEl.hidden = false;
    const w = wrap.clientWidth;
    tipEl.style.left = `${Math.min(Math.max(4, xs[i] + 14), Math.max(4, w - tipEl.offsetWidth - 4))}px`;
    tipEl.style.top = `${Math.min(Math.max(4, ev.clientY - caja.top - 20), caja.height - tipEl.offsetHeight - 4)}px`;
  }

  function enlazar(svg, wrap, tipEl, xs, contenido) {
    const g = vistos.get(svg);
    g.xs = xs; g.contenido = contenido;
    if (g.enlazado) return;
    g.enlazado = true;
    const mover = (ev) => { const h = vistos.get(svg); tip(svg, wrap, tipEl, h.xs, h.contenido, ev); };
    svg.addEventListener("pointermove", mover);
    svg.addEventListener("pointerdown", mover);
    svg.addEventListener("pointerleave", () => { tipEl.hidden = true; vistos.get(svg)?.cursor.setAttribute("visibility", "hidden"); });
  }

  function barras(svg, { etiquetas, valores, color, etiquetaY, wrap, tipEl, contenido }) {
    const { ancho, alto, pad } = preparar(svg);
    const n = etiquetas.length;
    if (!n) return;
    const max = Math.max(1, ...valores.map((v) => v || 0));
    const base = alto - pad.b;
    const y = (v) => base - (v / max) * (base - pad.t);
    ejes(svg, ancho, alto, pad, 0, max, y, etiquetaY);
    const paso = (ancho - pad.l - pad.r) / n;
    const xs = etiquetas.map((_, i) => pad.l + paso * (i + .5));
    const anchoB = Math.max(1.5, Math.min(26, paso * .66));
    const g = nodo("g", { fill: color, opacity: .9 }, svg);
    valores.forEach((v, i) => { if (v) nodo("rect", { x: (xs[i] - anchoB / 2).toFixed(1), y: y(v).toFixed(1), width: anchoB.toFixed(1), height: Math.max(1, base - y(v)).toFixed(1), rx: Math.min(2, anchoB / 3) }, g); });
    rotulosX(svg, ancho, alto, xs, etiquetas);
    const cursor = nodo("line", { x1: 0, x2: 0, y1: pad.t - 6, y2: base, stroke: "rgba(255,255,255,.3)", "stroke-dasharray": "3 3", visibility: "hidden" }, svg);
    vistos.set(svg, { ...(vistos.get(svg) || {}), ancho, cursor });
    if (tipEl) enlazar(svg, wrap, tipEl, xs, contenido);
  }

  window.MCGraficos = { barras };
})();
