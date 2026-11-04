(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $p = (s) => document.querySelector(s);
  if (!$p("#plataformas")) return;

  const PLATAFORMAS = [
    { id: "binance", nombre: "Binance" },
    { id: "bybit", nombre: "Bybit" },
    { id: "bitget", nombre: "Bitget" },
  ];
  const LADOS = { compra: "BUY", venta: "SELL" };
  let dos, entero, dia, diaLargo, hora, fechaHora;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    const zona = { timeZone: "America/La_Paz" };
    dos = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    entero = new Intl.NumberFormat(regional, { maximumFractionDigits: 0 });
    dia = new Intl.DateTimeFormat(regional, { ...zona, day: "2-digit", month: "short" });
    diaLargo = new Intl.DateTimeFormat(regional, { ...zona, day: "2-digit", month: "short", year: "numeric" });
    hora = new Intl.DateTimeFormat(regional, { ...zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fechaHora = new Intl.DateTimeFormat(regional, { ...zona, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  };
  prepararFormatos();
  const pct = (v) => (v == null ? "—" : traducir("{n} %", { n: dos.format(v) }));
  const nodo = (tag, attrs = {}, padre = null) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.append(el);
    return el;
  };

  let dias = 30, datos = null, pedido = 0;
  const cache = new Map();
  const participaciones = new Map();
  const activo = () => document.documentElement.dataset.asset || "USDT";
  const instante = (tiempo) => new Date(Date.parse(tiempo) + (datos.frecuencia === "1h" ? 3_600_000 : 0));

  function cabecera() {
    $p("#pl-titulo").textContent = traducir("Venta y compra por plataforma · {activo}", { activo: activo() });
    $p("#pl-error").textContent = traducir("No fue posible cargar los datos por plataforma.");
    document.querySelectorAll("#pl-rango button").forEach((b) => {
      const seleccionado = Number(b.dataset.dias) === dias;
      b.classList.toggle("active", seleccionado);
      b.setAttribute("aria-pressed", String(seleccionado));
    });
  }

  function bloques(plataforma) {
    const filas = new Map();
    Object.entries(LADOS).forEach(([lado, clave]) => {
      datos.series[plataforma][clave].forEach((punto) => {
        if (!filas.has(punto.timestamp_utc)) filas.set(punto.timestamp_utc, { tiempo: punto.timestamp_utc, venta: 0, compra: 0 });
        filas.get(punto.timestamp_utc)[lado === "compra" ? "venta" : "compra"] = Number(punto.activity || 0);
      });
    });
    return [...filas.values()].sort((a, b) => Date.parse(a.tiempo) - Date.parse(b.tiempo)).slice(-(dias === 30 ? 30 : dias * 24));
  }

  function grafico(columna, plataforma) {
    const svg = columna.querySelector("svg");
    columna.querySelector(".chart-tooltip").hidden = true;
    svg.replaceChildren();
    svg.__geo = null;
    const puntos = bloques(plataforma);
    if (!puntos.length) return;
    const ancho = svg.clientWidth || 300, alto = svg.clientHeight || 170;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    const margen = 8, base = alto - 26, altura = base - 10;
    const paso = (ancho - margen * 2) / puntos.length;
    const anchoBarra = Math.min(22, Math.max(.6, paso * .78));
    const maximo = Math.max(Number.EPSILON, ...puntos.map((p) => p.venta + p.compra));
    puntos.forEach((p, i) => {
      let acumulado = 0;
      [[p.venta, "var(--green)"], [p.compra, "var(--cyan)"]].forEach(([valor, color]) => {
        if (!valor) return;
        const altoBarra = valor / maximo * altura;
        acumulado += altoBarra;
        nodo("rect", { x: margen + paso * (i + .5) - anchoBarra / 2, y: base - acumulado, width: anchoBarra, height: altoBarra, fill: color, opacity: .6 }, svg);
      });
    });
    nodo("line", { x1: margen, x2: ancho - margen, y1: base, y2: base, stroke: "var(--borde2)", "stroke-width": 1 }, svg);
    [0, puntos.length - 1].forEach((i, extremo) => {
      const fecha = instante(puntos[i].tiempo);
      const partes = Object.fromEntries(dia.formatToParts(fecha).map((p) => [p.type, p.value]));
      const rotulo = `${partes.day}-${partes.month.replace(/\.$/, "")}${dias === 1 ? ` ${hora.format(fecha)}` : ""}`;
      nodo("text", { x: extremo ? ancho - margen : margen, y: alto - 8, fill: "#7d7d84", "font-size": 11, "text-anchor": extremo ? "end" : "start" }, svg).textContent = rotulo;
    });
    svg.__geo = { puntos, ancho, margen, paso };
  }

  function tip(ev, columna) {
    const svg = columna.querySelector("svg");
    const geo = svg.__geo;
    if (!geo || !datos) return;
    const caja = svg.getBoundingClientRect();
    if (!caja.width) return;
    const px = (ev.clientX - caja.left) / caja.width * geo.ancho;
    const i = Math.max(0, Math.min(geo.puntos.length - 1, Math.floor((px - geo.margen) / geo.paso)));
    const punto = geo.puntos[i];
    const total = punto.venta + punto.compra;
    const fecha = instante(punto.tiempo);
    const cuando = datos.frecuencia === "1d" ? diaLargo.format(fecha) : fechaHora.format(fecha);
    let contenido = `<small>${traducir("Sin operaciones")}</small>`;
    if (total > 0) {
      const venta = Math.round(100 * punto.venta / total), compra = 100 - venta;
      contenido = `<small>${traducir("Operaciones")}</small><div class="barra-reparto"><i class="venta" style="flex-grow:${venta}"></i><i class="compra" style="flex-grow:${compra}"></i></div><div class="tip-porcentajes"><b class="venta">${traducir("{n} %", { n: entero.format(venta) })}</b><b class="compra">${traducir("{n} %", { n: entero.format(compra) })}</b></div>`;
    }
    const el = columna.querySelector(".chart-tooltip");
    el.innerHTML = `<h4>${cuando}</h4><div class="tip-operaciones">${contenido}</div>`;
    el.hidden = false;
    const envoltura = columna.querySelector(".chart-wrap");
    el.style.left = `${Math.min(Math.max(4, ev.clientX - caja.left + 14), Math.max(4, envoltura.clientWidth - el.offsetWidth - 4))}px`;
    el.style.top = `${Math.min(Math.max(4, ev.clientY - caja.top - 20), Math.max(4, caja.height - el.offsetHeight - 4))}px`;
  }

  function pintar() {
    cabecera();
    $p("#pl-columnas").replaceChildren(...PLATAFORMAS.map((p) => {
      const ventana = datos.participacion.scopes?.[p.id]?.[String(dias)];
      const venta = ventana?.volume?.BUY ?? null, compra = ventana?.volume?.SELL ?? null;
      const completo = venta != null && compra != null;
      const columna = document.createElement("div");
      columna.className = `pl-columna${completo ? "" : " sin-reparto"}`;
      columna.innerHTML = `<h4>${traducir(p.nombre)}</h4><div class="metric-pair"><div class="metric-side venta"><small>${traducir("Venta")}</small><strong>${pct(venta)}</strong></div><div class="metric-side compra"><small>${traducir("Compra")}</small><strong>${pct(compra)}</strong></div></div><div class="barra-reparto"><i class="venta" style="flex-grow:${completo ? venta : 1}"></i><i class="compra" style="flex-grow:${completo ? compra : 1}"></i></div><p class="pl-transacciones">${traducir("Transacciones · Venta {v} · Compra {c}", { v: pct(ventana?.events?.BUY), c: pct(ventana?.events?.SELL) })}</p><div class="chart-wrap no-volume"><svg class="grafico-linea" role="img" aria-label="${traducir("Venta y compra de {plataforma}", { plataforma: p.nombre })}"></svg><div class="chart-tooltip" hidden></div></div>`;
      const svg = columna.querySelector("svg");
      svg.addEventListener("pointermove", (ev) => tip(ev, columna));
      svg.addEventListener("pointerdown", (ev) => tip(ev, columna));
      svg.addEventListener("pointerleave", () => { columna.querySelector(".chart-tooltip").hidden = true; });
      svg.addEventListener("pointercancel", () => { columna.querySelector(".chart-tooltip").hidden = true; });
      return columna;
    }));
    graficos();
  }

  function graficos() {
    document.querySelectorAll("#pl-columnas .pl-columna").forEach((columna, i) => grafico(columna, PLATAFORMAS[i].id));
  }

  function obtener(a, frecuencia) {
    const clave = `${a}/${frecuencia}`;
    if (!cache.has(clave)) {
      if (!participaciones.has(a)) {
        participaciones.set(a, cargarDatos("participacion", [a]).catch((e) => { participaciones.delete(a); throw e; }));
      }
      cache.set(clave, Promise.all([
        participaciones.get(a),
        ...PLATAFORMAS.flatMap((p) => Object.keys(LADOS).map((lado) => cargarDatos("plataforma", [a, lado, p.id, frecuencia]))),
      ]).then(([participacion, ...series]) => ({
        participacion, frecuencia,
        series: Object.fromEntries(PLATAFORMAS.map((p, i) => [p.id, Object.fromEntries(Object.values(LADOS).map((lado, j) => [lado, series[i * 2 + j].points || []]))])),
      })).catch((e) => { cache.delete(clave); throw e; }));
    }
    return cache.get(clave);
  }

  function cargar() {
    const yo = ++pedido;
    datos = null;
    cabecera();
    $p("#pl-columnas").replaceChildren();
    $p("#plataformas").hidden = false;
    $p("#pl-error").hidden = true;
    obtener(activo(), dias === 30 ? "1d" : "1h")
      .then((resultado) => {
        if (yo !== pedido) return;
        datos = resultado;
        pintar();
      })
      .catch((e) => {
        if (yo !== pedido) return;
        datos = null;
        $p("#pl-columnas").replaceChildren();
        if (e.estado === 404) $p("#plataformas").hidden = true; else $p("#pl-error").hidden = false;
      });
  }

  $p("#pl-rango").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-dias]");
    if (b && Number(b.dataset.dias) !== dias) { dias = Number(b.dataset.dias); cargar(); }
  });
  addEventListener("idiomachange", () => {
    prepararFormatos();
    if (datos) pintar(); else cabecera();
  });
  let ultimoActivo = activo();
  new MutationObserver(() => { if (activo() !== ultimoActivo) { ultimoActivo = activo(); cargar(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-asset"] });
  let espera = 0;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (datos) graficos(); }, 160); });
  cargar();
})();
