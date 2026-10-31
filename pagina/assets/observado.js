(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $s = (s) => document.querySelector(s);
  if (!$s("#observado")) return;

  const PLATAFORMAS = [
    { id: "todas_promedio", nombre: "Promedio", color: "#f7f7f8", ancho: 2.4 },
    { id: "binance", nombre: "Binance", color: "var(--verde)", ancho: 1.6 },
    { id: "bybit", nombre: "Bybit", color: "var(--celeste)", ancho: 1.6 },
    { id: "bitget", nombre: "Bitget", color: "#b9b4ff", ancho: 1.6 },
  ];
  const zona = "America/La_Paz";
  let precio, precio3, hora, soloHora, dia, diaLargo;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    precio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    precio3 = new Intl.NumberFormat(regional, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    hora = new Intl.DateTimeFormat(regional, { timeZone: zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    soloHora = new Intl.DateTimeFormat(regional, { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false });
    dia = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short" });
    diaLargo = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
  };
  prepararFormatos();
  const poner = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const nodo = (tag, attrs = {}, padre = null) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.append(el);
    return el;
  };
  const ultimoValor = (arr) => { for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] != null) return arr[i]; return null; };

  let datos = null, lado = "venta", dias = 1, fallo = false;
  const graficos = {};

  function lineas(id, tiempos, series, rotular, titulo) {
    const svg = document.getElementById(id);
    svg.replaceChildren();
    const ancho = svg.clientWidth || 600, alto = svg.clientHeight || 340;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    const pad = { l: 8, r: 58, t: 14, b: 26 };
    const valores = series.flatMap((s) => s.valores).filter((v) => v != null);
    if (!valores.length || tiempos.length < 2) return;
    let lo = Math.min(...valores), hi = Math.max(...valores);
    const m = (hi - lo || .05) * .12; lo -= m; hi += m;
    const t0 = tiempos[0], t1 = tiempos.at(-1);
    const x = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (ancho - pad.l - pad.r);
    const y = (v) => (alto - pad.b) - ((v - lo) / (hi - lo)) * (alto - pad.b - pad.t);
    const rejilla = nodo("g", {}, svg);
    for (let k = 0; k <= 4; k += 1) {
      const v = lo + ((hi - lo) * k) / 4;
      nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: y(v).toFixed(1), y2: y(v).toFixed(1), stroke: "rgba(255,255,255,.08)" }, rejilla);
      nodo("text", { x: ancho - pad.r + 10, y: (y(v) + 3.5).toFixed(1), fill: "#7d7d84", "font-size": 11 }, rejilla).textContent = precio.format(v);
    }
    [...series].reverse().forEach((s) => {
      let d = "", abierto = false;
      s.valores.forEach((v, i) => {
        if (v == null) { abierto = false; return; }
        d += `${abierto ? "L" : "M"}${x(tiempos[i]).toFixed(1)} ${y(v).toFixed(1)} `;
        abierto = true;
      });
      if (d) nodo("path", { d, fill: "none", stroke: s.color, "stroke-width": s.ancho, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.opacidad ?? 1 }, svg);
      if (s.puntos) {
        const g = nodo("g", { fill: s.color }, svg);
        s.valores.forEach((v, i) => { if (v != null) nodo("circle", { cx: x(tiempos[i]).toFixed(1), cy: y(v).toFixed(1), r: 2.2 }, g); });
      }
    });
    const marcas = ancho < 480 ? 3 : 5;
    const ejes = nodo("g", {}, svg);
    for (let k = 0; k < marcas; k += 1) {
      const t = t0 + ((t1 - t0) * k) / (marcas - 1);
      nodo("text", { x: x(t).toFixed(1), y: alto - 8, fill: "#7d7d84", "font-size": 11, "text-anchor": k === 0 ? "start" : k === marcas - 1 ? "end" : "middle" }, ejes).textContent = rotular(t, t1 - t0);
    }
    const cursor = nodo("line", { x1: 0, x2: 0, y1: pad.t - 6, y2: alto - pad.b, stroke: "rgba(255,255,255,.3)", "stroke-dasharray": "3 3", visibility: "hidden" }, svg);
    graficos[id] = { svg, x, tiempos, series, ancho, pad, cursor, titulo };
  }

  function tip(id, tipId, wrapId, ev) {
    const g = graficos[id];
    if (!g) return;
    const caja = g.svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * g.ancho;
    let i = 0, mejor = Infinity;
    g.tiempos.forEach((t, k) => { const d = Math.abs(g.x(t) - px); if (d < mejor) { mejor = d; i = k; } });
    g.cursor.setAttribute("x1", g.x(g.tiempos[i]).toFixed(1));
    g.cursor.setAttribute("x2", g.x(g.tiempos[i]).toFixed(1));
    g.cursor.setAttribute("visibility", "visible");
    const filas = g.series.filter((s) => s.valores[i] != null)
      .map((s) => `<div class="tip-row"><span><i class="dot" style="background:${s.color}"></i>${s.nombre}</span><b>Bs ${precio3.format(s.valores[i])}</b></div>`).join("");
    const el = document.getElementById(tipId);
    el.innerHTML = `<h4>${g.titulo(g.tiempos[i])}</h4>${filas}`;
    el.hidden = false;
    const w = document.getElementById(wrapId).clientWidth;
    el.style.left = `${Math.min(Math.max(4, g.x(g.tiempos[i]) + 14), Math.max(4, w - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.min(Math.max(4, ev.clientY - caja.top - 20), caja.height - el.offsetHeight - 4)}px`;
  }
  function ocultar(id, tipId) {
    document.getElementById(tipId).hidden = true;
    graficos[id]?.cursor.setAttribute("visibility", "hidden");
  }

  function cifras() {
    const c = datos.cada_5_minutos;
    const v = ultimoValor(c.venta.todas_promedio), q = ultimoValor(c.compra.todas_promedio);
    poner("ob-hora", traducir("Última captura · {fecha}", { fecha: hora.format(new Date(c.intervalos.at(-1))) }));
    poner("ob-venta", v == null ? "—" : precio.format(v));
    poner("ob-compra", q == null ? "—" : precio.format(q));
    if (v != null && q != null) {
      poner("ob-dif", precio3.format(v - q));
      poner("ob-dif-nota", traducir("{pct} % sobre la compra", { pct: precio.format(((v - q) / q) * 100) }));
    }
    const ultimas = PLATAFORMAS.slice(1).map((p) => ({ ...p, venta: ultimoValor(c.venta[p.id]), compra: ultimoValor(c.compra[p.id]) }));
    const barata = ultimas.filter((p) => p.venta != null).sort((a, b) => a.venta - b.venta)[0];
    if (barata) { poner("ob-barata", barata.nombre); poner("ob-barata-nota", traducir("Venta a {precio}", { precio: precio3.format(barata.venta) })); }
    const host = $s("#ob-plataformas");
    host.replaceChildren(...ultimas.map((p) => {
      const a = document.createElement("article");
      a.className = "metrica";
      a.innerHTML = `<span class="metric-title">${p.nombre}</span><div class="metric-pair"><div class="metric-side venta"><small><i></i>${traducir("Venta")}</small><strong>${p.venta == null ? "—" : precio.format(p.venta)}</strong></div><div class="metric-side compra"><small><i></i>${traducir("Compra")}</small><strong>${p.compra == null ? "—" : precio.format(p.compra)}</strong></div></div>`;
      return a;
    }));
    const anuncio = document.createElement("article");
    anuncio.className = "metrica";
    const dias1 = datos.diario.fechas;
    anuncio.innerHTML = `<span class="metric-title">${traducir("Serie diaria")}</span><strong class="nombre">${traducir("{n} días", { n: dias1.length })}</strong><span class="metric-note">${traducir("desde el {fecha}", { fecha: diaLargo.format(new Date(`${dias1[0]}T12:00:00Z`)) })}</span>`;
    host.append(anuncio);
  }

  function dibujar5m() {
    const c = datos.cada_5_minutos;
    const tiempos = c.intervalos.map((s) => Date.parse(s));
    const corte = tiempos.at(-1) - dias * 864e5;
    const i0 = Math.max(0, tiempos.findIndex((t) => t > corte));
    const series = PLATAFORMAS.map((p) => ({ ...p, nombre: traducir(p.nombre), valores: c[lado][p.id].slice(i0), opacidad: p.id === "todas_promedio" ? 1 : .85 }));
    lineas("ob-5m", tiempos.slice(i0), series, (t, span) => (span <= 864e5 * 1.05 ? soloHora.format(new Date(t)) : hora.format(new Date(t))), (t) => hora.format(new Date(t)));
    $s("#ob-leyenda").innerHTML = PLATAFORMAS.map((p) => `<span><i class="swatch" style="background:${p.color}"></i>${traducir(p.nombre)}</span>`).join("");
    document.querySelectorAll("#ob-lado button").forEach((b) => { const a = b.dataset.lado === lado; b.classList.toggle("active", a); b.setAttribute("aria-pressed", String(a)); });
    document.querySelectorAll("#ob-rango button").forEach((b) => { const a = Number(b.dataset.dias) === dias; b.classList.toggle("active", a); b.setAttribute("aria-pressed", String(a)); });
  }

  function dibujar1d() {
    const d = datos.diario;
    const tiempos = d.fechas.map((f) => Date.parse(`${f}T12:00:00Z`));
    lineas("ob-1d", tiempos, [
      { nombre: traducir("P2P Venta"), color: "var(--verde)", ancho: 2.2, valores: d.venta.todas_promedio, puntos: true },
      { nombre: traducir("P2P Compra"), color: "var(--celeste)", ancho: 2.2, valores: d.compra.todas_promedio, puntos: true },
    ], (t) => dia.format(new Date(t)), (t) => diaLargo.format(new Date(t)));
  }

  $s("#ob-lado").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-lado]"); if (b && datos) { lado = b.dataset.lado; dibujar5m(); } });
  $s("#ob-rango").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-dias]"); if (b && datos) { dias = Number(b.dataset.dias); dibujar5m(); } });
  [["ob-5m", "ob-tip-5m", "ob-wrap-5m"], ["ob-1d", "ob-tip-1d", "ob-wrap-1d"]].forEach(([id, t, w]) => {
    const svg = document.getElementById(id);
    svg.addEventListener("pointermove", (ev) => tip(id, t, w, ev));
    svg.addEventListener("pointerdown", (ev) => tip(id, t, w, ev));
    svg.addEventListener("pointerleave", () => ocultar(id, t));
  });
  let espera = 0;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (datos) { dibujar5m(); dibujar1d(); } }, 160); });

  addEventListener("idiomachange", () => {
    prepararFormatos();
    ocultar("ob-5m", "ob-tip-5m");
    ocultar("ob-1d", "ob-tip-1d");
    if (datos) { cifras(); dibujar5m(); dibujar1d(); } else if (fallo) poner("ob-hora", "");
  });

  cargarDatos("top5")
    .then((d) => { datos = d; cifras(); dibujar5m(); dibujar1d(); })
    .catch((e) => {
      fallo = true;
      poner("ob-hora", "");
      if (e.estado === 404) { $s("#observado").hidden = true; $s('.nav-links a[href="#observado"]').hidden = true; }
      else $s("#ob-error").hidden = false;
    });
})();
