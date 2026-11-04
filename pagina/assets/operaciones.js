(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $o = (s) => document.querySelector(s);
  if (!$o("#operaciones")) return;

  const NOMBRES = {
    "BANCO BISA": "Banco BISA", "BANCO DE CREDITO": "Banco de Crédito (BCP)", "BANCO DE LA NACION ARGENTINA": "Banco de la Nación Argentina",
    "BANCO ECONOMICO": "Banco Económico", "BANCO FIE": "Banco FIE", "BANCO FORTALEZA": "Banco Fortaleza", "BANCO GANADERO": "Banco Ganadero",
    "BANCO MERCANTIL SANTA CRUZ": "Banco Mercantil Santa Cruz", "BANCO NACIONAL DE BOLIVIA": "Banco Nacional de Bolivia", "BANCO PRODEM": "Banco Prodem",
    "BANCO PYME DE LA COMUNIDAD": "Banco PyME de la Comunidad", "BANCO PYME ECOFUTURO": "Banco PyME Ecofuturo", "BANCO SOLIDARIO": "Banco Solidario",
    "BANCO UNION": "Banco Unión",
  };
  const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  const nombre = (s) => NOMBRES[sinTildes(s)] || s;

  let precio, entero, usd, dia, diaLargo;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    precio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    entero = new Intl.NumberFormat(regional, { maximumFractionDigits: 0 });
    usd = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    dia = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short" });
    diaLargo = new Intl.DateTimeFormat(regional, { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  };
  prepararFormatos();
  const compacto = {
    format: (v) => {
      const a = Math.abs(v);
      if (a >= 1e6) return traducir("{n} M", { n: usd.format(v / 1e6) });
      if (a >= 1e3) return traducir("{n} mil", { n: usd.format(v / 1e3) });
      return usd.format(v);
    },
  };
  const fecha = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const poner = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const nodo = (tag, attrs = {}, padre = null) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.append(el);
    return el;
  };

  let datos = null, ventana = "dia", rango = "todo", geo = null, fallo = false;
  const ACUMULADOS = { "30": "acumulado_ultimos_30_cortes", todo: "acumulado_todos_los_cortes" };

  function cifras() {
    const u = datos.ultimo_corte;
    poner("op-corte", traducir("Corte del {fecha} · vigencia {vigencia}", { fecha: diaLargo.format(fecha(u.fecha_corte)), vigencia: u.vigencia }));
    poner("op-monto", compacto.format(n(u.monto_total)));
    poner("op-monto-nota", `${usd.format(n(u.monto_total))} USD`);
    poner("op-numero", entero.format(n(u.numero_operaciones)));
    poner("op-precio", precio.format(n(u.precio_ponderado)));
    poner("op-precio-nota", traducir("media ponderada por monto"));
    poner("op-tco", precio.format(n(u.tco)));
    poner("op-tco-nota", traducir("vigente {fecha}", { fecha: dia.format(fecha(u.vigencia)) }));
    const r = datos.rankings;
    const lider = (id, nota, x, conPrecio = true) => {
      if (!x) return;
      poner(id, nombre(x.banco));
      poner(nota, conPrecio && x.precio_ponderado != null
        ? traducir("{monto} USD a {precio}", { monto: compacto.format(n(x.monto)), precio: precio.format(n(x.precio_ponderado)) })
        : `${compacto.format(n(x.monto))} USD`);
    };
    lider("op-lider-dia", "op-lider-dia-nota", r.mayor_monto_ultimo_corte?.[0]);
    lider("op-lider-30", "op-lider-30-nota", r.mayor_monto_ultimos_30_cortes?.[0]);
    const extremo = (id, nota, x) => {
      if (!x) return;
      poner(id, nombre(x.banco));
      poner(nota, `${precio.format(n(x.precio_ponderado))} · ${compacto.format(n(x.monto))} USD`);
    };
    extremo("op-alto", "op-alto-nota", r.precio_ponderado_mas_alto_ultimo_corte?.[0]);
    extremo("op-bajo", "op-bajo-nota", r.precio_ponderado_mas_bajo_ultimo_corte?.[0]);
  }

  function ranking() {
    const filas = (ventana === "dia" ? datos.ultimo_corte.bancos : datos[ACUMULADOS[ventana]] || datos.acumulado_ultimos_30_cortes)
      .filter((b) => n(b.monto) > 0)
      .sort((a, b) => n(b.monto) - n(a.monto));
    const max = Math.max(1, ...filas.map((b) => n(b.monto)));
    const host = $o("#op-ranking");
    host.replaceChildren(...filas.map((b) => {
      const li = document.createElement("li");
      const celda = (clase, texto) => { const s = document.createElement("span"); s.className = clase; s.textContent = texto; return s; };
      const barra = document.createElement("span");
      barra.className = "b";
      const i = document.createElement("i");
      i.style.width = `${(n(b.monto) / max) * 100}%`;
      barra.append(i);
      li.append(
        celda("n", nombre(b.banco)),
        celda("m", compacto.format(n(b.monto))),
        celda("p", b.precio_ponderado == null ? "—" : precio.format(n(b.precio_ponderado))),
        celda("o", b.numero_operaciones == null ? "—" : entero.format(n(b.numero_operaciones))),
        barra,
      );
      return li;
    }));
    document.querySelectorAll("#op-ventana button").forEach((b) => {
      const activo = b.dataset.ventana === ventana;
      b.classList.toggle("active", activo);
      b.setAttribute("aria-pressed", String(activo));
    });
  }

  function grafico() {
    const svg = $o("#op-chart");
    svg.replaceChildren();
    document.querySelectorAll("#op-rango button").forEach((b) => {
      const activo = b.dataset.rango === rango;
      b.classList.toggle("active", activo);
      b.setAttribute("aria-pressed", String(activo));
    });
    const s = rango === "30" ? datos.serie_diaria.slice(-30) : datos.serie_diaria;
    if (!s.length) return;
    const ancho = svg.clientWidth || 600, alto = svg.clientHeight || 360;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    const pad = { l: 8, r: 68, t: 14, b: 26 };
    const altoVol = Math.round(alto * .3);
    const yPrecioFin = alto - pad.b - altoVol - 24;
    const valores = s.flatMap((x) => [n(x.precio_ponderado), n(x.tco)]).filter((v) => v != null);
    let lo = Math.min(...valores), hi = Math.max(...valores);
    const m = (hi - lo || .1) * .12; lo -= m; hi += m;
    const paso = (ancho - pad.l - pad.r) / s.length;
    const x = (i) => pad.l + paso * (i + .5);
    const y = (v) => yPrecioFin - ((v - lo) / (hi - lo)) * (yPrecioFin - pad.t);
    const maxVol = Math.max(1, ...s.map((p) => n(p.monto_total) || 0));
    const base = alto - pad.b;
    const yv = (v) => base - (v / maxVol) * altoVol;

    const rejilla = nodo("g", {}, svg);
    for (let k = 0; k <= 4; k += 1) {
      const v = lo + ((hi - lo) * k) / 4;
      nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: y(v).toFixed(1), y2: y(v).toFixed(1), stroke: "rgba(255,255,255,.08)" }, rejilla);
      nodo("text", { x: ancho - pad.r + 10, y: (y(v) + 3.5).toFixed(1), fill: "#7d7d84", "font-size": 11 }, rejilla).textContent = precio.format(v);
    }
    const ancho_b = Math.max(2, Math.min(26, paso * .62));
    const barras = nodo("g", { fill: "var(--verde)", opacity: .55 }, svg);
    s.forEach((p, i) => {
      const v = n(p.monto_total) || 0;
      nodo("rect", { x: (x(i) - ancho_b / 2).toFixed(1), y: yv(v).toFixed(1), width: ancho_b.toFixed(1), height: Math.max(1.5, base - yv(v)).toFixed(1), rx: 2 }, barras);
    });
    nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: base, y2: base, stroke: "rgba(255,255,255,.12)" }, svg);
    nodo("text", { x: ancho - pad.r + 10, y: (yv(maxVol) + 3.5).toFixed(1), fill: "#7d7d84", "font-size": 11 }, svg).textContent = compacto.format(maxVol);

    const linea = (clave, attrs) => {
      let d = "";
      s.forEach((p, i) => { const v = n(p[clave]); if (v == null) return; d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; });
      if (d) nodo("path", { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs }, svg);
    };
    linea("tco", { stroke: "var(--tco)", "stroke-width": 1.8, "stroke-dasharray": "7 4" });
    linea("precio_ponderado", { stroke: "var(--celeste)", "stroke-width": 2.4 });
    const puntos = nodo("g", { fill: "var(--celeste)" }, svg);
    s.forEach((p, i) => { const v = n(p.precio_ponderado); if (v != null) nodo("circle", { cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: 2.6 }, puntos); });

    const ejes = nodo("g", {}, svg);
    const marcas = ancho < 480 ? 3 : 5;
    for (let k = 0; k < marcas; k += 1) {
      const i = Math.round((k / (marcas - 1)) * (s.length - 1));
      nodo("text", { x: x(i).toFixed(1), y: alto - 8, fill: "#7d7d84", "font-size": 11, "text-anchor": k === 0 ? "start" : k === marcas - 1 ? "end" : "middle" }, ejes).textContent = dia.format(fecha(s[i].fecha_corte));
    }
    nodo("line", { id: "op-cursor", x1: 0, x2: 0, y1: pad.t - 6, y2: base, stroke: "rgba(255,255,255,.3)", "stroke-dasharray": "3 3", visibility: "hidden" }, svg);
    geo = { x, paso, pad, ancho, s };
  }

  function mostrarTip(ev) {
    if (!geo) return;
    const svg = $o("#op-chart");
    const caja = svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * geo.ancho;
    const i = Math.max(0, Math.min(geo.s.length - 1, Math.floor((px - geo.pad.l) / geo.paso)));
    const p = geo.s[i];
    const cursor = document.getElementById("op-cursor");
    cursor.setAttribute("x1", geo.x(i).toFixed(1));
    cursor.setAttribute("x2", geo.x(i).toFixed(1));
    cursor.setAttribute("visibility", "visible");
    const fila = (et, v, color) => `<div class="tip-row"><span>${color ? `<i class="dot" style="background:${color}"></i>` : ""}${et}</span><b>${v}</b></div>`;
    const tip = $o("#op-tip");
    tip.innerHTML = `<h4>${traducir("Corte {fecha}", { fecha: diaLargo.format(fecha(p.fecha_corte)) })}</h4>`
      + fila(traducir("Precio ponderado"), `Bs ${precio.format(n(p.precio_ponderado))}`, "var(--celeste)")
      + fila(traducir("TCO"), `Bs ${precio.format(n(p.tco))}`, "var(--tco)")
      + fila(traducir("Monto comprado"), `${usd.format(n(p.monto_total))} USD`, "var(--verde)")
      + fila(traducir("Operaciones"), entero.format(n(p.numero_operaciones)));
    tip.hidden = false;
    const w = $o("#op-wrap").clientWidth;
    tip.style.left = `${Math.min(Math.max(4, geo.x(i) + 14), Math.max(4, w - tip.offsetWidth - 4))}px`;
    tip.style.top = `${Math.min(Math.max(4, ev.clientY - caja.top - 20), caja.height - tip.offsetHeight - 4)}px`;
  }
  function ocultarTip() {
    $o("#op-tip").hidden = true;
    document.getElementById("op-cursor")?.setAttribute("visibility", "hidden");
  }

  $o("#op-ventana").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-ventana]");
    if (!b || !datos) return;
    ventana = b.dataset.ventana;
    ranking();
  });
  $o("#op-rango").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-rango]");
    if (!b || !datos || b.dataset.rango === rango) return;
    rango = b.dataset.rango;
    ocultarTip();
    grafico();
  });
  const svg = $o("#op-chart");
  svg.addEventListener("pointermove", mostrarTip);
  svg.addEventListener("pointerdown", mostrarTip);
  svg.addEventListener("pointerleave", ocultarTip);
  let espera = 0;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (datos) grafico(); }, 160); });

  addEventListener("idiomachange", () => {
    prepararFormatos();
    ocultarTip();
    if (datos) { cifras(); grafico(); ranking(); } else if (fallo) poner("op-corte", "");
  });

  cargarDatos("operaciones")
    .then((d) => { datos = d; cifras(); grafico(); ranking(); })
    .catch(() => { fallo = true; $o("#op-error").hidden = false; poner("op-corte", ""); });
})();
