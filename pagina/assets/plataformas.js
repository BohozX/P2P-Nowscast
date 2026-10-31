(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $p = (s) => document.querySelector(s);
  if (!$p("#plataformas")) return;

  const PLATAFORMAS = [
    { id: "binance", nombre: "Binance", color: "var(--verde)" },
    { id: "bybit", nombre: "Bybit", color: "var(--celeste)" },
    { id: "bitget", nombre: "Bitget", color: "#b9b4ff" },
  ];
  let precio3, dos, dia, diaLargo;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    precio3 = new Intl.NumberFormat(regional, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    dos = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    dia = new Intl.DateTimeFormat(regional, { timeZone: "America/La_Paz", day: "2-digit", month: "short" });
    diaLargo = new Intl.DateTimeFormat(regional, { timeZone: "America/La_Paz", day: "2-digit", month: "short", year: "numeric" });
  };
  prepararFormatos();
  const compacto = (v) => (Math.abs(v) >= 1e6 ? traducir("{n} M", { n: dos.format(v / 1e6) }) : Math.abs(v) >= 1e3 ? traducir("{n} mil", { n: dos.format(v / 1e3) }) : dos.format(v));
  const nodo = (tag, attrs = {}, padre = null) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.append(el);
    return el;
  };

  let lado = "compra", datos = null, geo = null;
  const activo = () => document.documentElement.dataset.asset || "USDT";

  function resumen() {
    return PLATAFORMAS.map((p) => {
      const pts = datos.series[p.id] || [];
      const vol = pts.reduce((s, x) => s + (+x.volume_asset || 0), 0);
      const bob = pts.reduce((s, x) => s + (+x.volume_bob || 0), 0);
      return { ...p, vol, vwap: vol > 0 ? bob / vol : null };
    });
  }

  function ranking() {
    const filas = resumen();
    const total = filas.reduce((s, x) => s + x.vol, 0) || 1;
    $p("#pl-ranking").replaceChildren(...filas.sort((a, b) => b.vol - a.vol).map((f) => {
      const li = document.createElement("li");
      const celda = (clase, t) => { const s = document.createElement("span"); s.className = clase; s.textContent = t; return s; };
      const barra = document.createElement("span");
      barra.className = "b";
      const i = document.createElement("i");
      i.style.width = `${(f.vol / total) * 100}%`;
      i.style.background = f.color;
      barra.append(i);
      li.append(celda("n", f.nombre), celda("m", `${compacto(f.vol)} ${activo()}`), celda("p", f.vwap == null ? "—" : precio3.format(f.vwap)), celda("o", traducir("{n} %", { n: dos.format((f.vol / total) * 100) })), barra);
      return li;
    }));
  }

  function grafico() {
    const svg = $p("#pl-chart");
    svg.replaceChildren();
    const ref = datos.series.binance || [];
    const tiempos = ref.map((x) => x.timestamp_utc);
    if (!tiempos.length) return;
    const ancho = svg.clientWidth || 600, alto = svg.clientHeight || 340;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    const pad = { l: 8, r: 58, t: 14, b: 26 };
    const mapa = Object.fromEntries(PLATAFORMAS.map((p) => [p.id, new Map((datos.series[p.id] || []).map((x) => [x.timestamp_utc, x]))]));
    const totales = tiempos.map((t) => PLATAFORMAS.reduce((s, p) => s + (+(mapa[p.id].get(t)?.volume_asset) || 0), 0));
    const max = Math.max(1, ...totales);
    const paso = (ancho - pad.l - pad.r) / tiempos.length;
    const base = alto - pad.b;
    const y = (v) => base - (v / max) * (base - pad.t);
    for (let k = 0; k <= 4; k += 1) {
      const v = (max * k) / 4;
      nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: y(v).toFixed(1), y2: y(v).toFixed(1), stroke: "rgba(255,255,255,.08)" }, svg);
      nodo("text", { x: ancho - pad.r + 10, y: (y(v) + 3.5).toFixed(1), fill: "#7d7d84", "font-size": 11 }, svg).textContent = v >= 1e6 ? traducir("{n} M", { n: dos.format(v / 1e6) }) : v >= 1e3 ? traducir("{n} mil", { n: Math.round(v / 1e3) }) : String(Math.round(v));
    }
    const anchoB = Math.max(2, Math.min(24, paso * .64));
    tiempos.forEach((t, i) => {
      let acum = 0;
      PLATAFORMAS.forEach((p) => {
        const v = +(mapa[p.id].get(t)?.volume_asset) || 0;
        if (!v) return;
        nodo("rect", { x: (pad.l + paso * (i + .5) - anchoB / 2).toFixed(1), y: y(acum + v).toFixed(1), width: anchoB.toFixed(1), height: Math.max(1, y(acum) - y(acum + v)).toFixed(1), fill: p.color, opacity: .8 }, svg);
        acum += v;
      });
    });
    const marcas = ancho < 480 ? 3 : 5;
    for (let k = 0; k < marcas; k += 1) {
      const i = Math.round((k / (marcas - 1)) * (tiempos.length - 1));
      nodo("text", { x: (pad.l + paso * (i + .5)).toFixed(1), y: alto - 8, fill: "#7d7d84", "font-size": 11, "text-anchor": k === 0 ? "start" : k === marcas - 1 ? "end" : "middle" }, svg).textContent = dia.format(new Date(tiempos[i]));
    }
    geo = { tiempos, mapa, paso, pad, ancho, totales };
  }

  function tip(ev) {
    if (!geo) return;
    const svg = $p("#pl-chart");
    const caja = svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * geo.ancho;
    const i = Math.max(0, Math.min(geo.tiempos.length - 1, Math.floor((px - geo.pad.l) / geo.paso)));
    const t = geo.tiempos[i];
    const filas = PLATAFORMAS.map((p) => {
      const x = geo.mapa[p.id].get(t);
      const v = +(x?.volume_asset) || 0;
      return `<div class="tip-row"><span><i class="dot" style="background:${p.color}"></i>${p.nombre}</span><b>${compacto(v)}${x?.vwap_bob != null ? ` · ${precio3.format(x.vwap_bob)}` : ""}</b></div>`;
    }).join("");
    const el = $p("#pl-tip");
    el.innerHTML = `<h4>${diaLargo.format(new Date(t))}</h4>${filas}<div class="tip-row"><span>${traducir("Total")}</span><b>${compacto(geo.totales[i])} ${activo()}</b></div>`;
    el.hidden = false;
    const w = $p("#pl-wrap").clientWidth;
    el.style.left = `${Math.min(Math.max(4, geo.pad.l + geo.paso * (i + .5) + 14), Math.max(4, w - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.min(Math.max(4, ev.clientY - caja.top - 20), caja.height - el.offsetHeight - 4)}px`;
  }

  function pintar() {
    $p("#pl-titulo").textContent = traducir("Por plataforma · {activo} · últimos 30 días", { activo: activo() });
    $p("#pl-leyenda").innerHTML = PLATAFORMAS.map((p) => `<span><i class="swatch bar" style="background:${p.color}"></i>${p.nombre}</span>`).join("");
    document.querySelectorAll("#pl-lado button").forEach((b) => { const a = b.dataset.lado === lado; b.classList.toggle("active", a); b.setAttribute("aria-pressed", String(a)); });
    ranking();
    grafico();
  }

  let pedido = 0;
  function cargar() {
    const yo = ++pedido;
    cargarDatos("plataformas", [activo(), lado])
      .then((d) => { if (yo === pedido) { datos = d; $p("#plataformas").hidden = false; $p("#pl-error").hidden = true; pintar(); } })
      .catch((e) => { if (yo === pedido) { datos = null; $p("#pl-ranking").replaceChildren(); $p("#pl-chart").replaceChildren(); if (e.estado === 404) $p("#plataformas").hidden = true; else $p("#pl-error").hidden = false; } });
  }

  $p("#pl-lado").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-lado]"); if (b && b.dataset.lado !== lado) { lado = b.dataset.lado; cargar(); } });
  const svg = $p("#pl-chart");
  svg.addEventListener("pointermove", tip);
  svg.addEventListener("pointerdown", tip);
  svg.addEventListener("pointerleave", () => { $p("#pl-tip").hidden = true; });
  addEventListener("idiomachange", () => {
    prepararFormatos();
    $p("#pl-tip").hidden = true;
    if (datos) pintar();
  });
  new MutationObserver(cargar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-asset"] });
  let espera = 0;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (datos) grafico(); }, 160); });
  cargar();
})();
