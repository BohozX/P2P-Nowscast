(() => {
  const DIA = 86_400_000;
  const HORA = 3_600_000;
  const DIAS_TABLA = 7;
  const zona = "America/La_Paz";
  const CLAVE = "p2p-nowcast-bancos";

  const NOMBRES = {
    "BANCO BISA": ["Banco BISA", "BISA", "bisa.png"],
    "BANCO DE CRÉDITO": ["Banco de Crédito (BCP)", "BCP", "bcp.png"],
    "BANCO DE LA NACIÓN ARGENTINA": ["Banco de la Nación Argentina", "BNA", "bna.png"],
    "BANCO ECONÓMICO": ["Banco Económico", "Económico", "baneco.png"],
    "BANCO FIE": ["Banco FIE", "FIE", "fie.svg"],
    "BANCO FORTALEZA": ["Banco Fortaleza", "Fortaleza", "fortaleza.png"],
    "BANCO GANADERO": ["Banco Ganadero", "Ganadero", "ganadero.png"],
    "BANCO MERCANTIL SANTA CRUZ": ["Banco Mercantil Santa Cruz", "Mercantil", "bmsc.svg"],
    "BANCO NACIONAL DE BOLIVIA": ["Banco Nacional de Bolivia", "BNB", "bnb.png"],
    "BANCO PRODEM": ["Banco Prodem", "Prodem", "prodem.png"],
    "BANCO PYME DE LA COMUNIDAD": ["Banco PyME de la Comunidad", "Comunidad", "comunidad.png"],
    "BANCO PYME ECOFUTURO": ["Banco PyME Ecofuturo", "Ecofuturo", "ecofuturo.svg"],
    "BANCO SOLIDARIO": ["Banco Solidario", "BancoSol", "bancosol.svg"],
    "BANCO UNION": ["Banco Unión", "Unión", "union.png"],
  };

  const SERIES = [
    { id: "venta", etiqueta: "Venta", clase: "venta", lado: "venta" },
    { id: "compra", etiqueta: "Compra", clase: "compra", lado: "compra" },
    { id: "tco", etiqueta: "TCO", clase: "tco", lado: null, dash: true },
  ];
  const VISTAS = { venta: ["venta", "tco"], compra: ["compra", "tco"], spread: ["venta", "compra"] };

  let fmtPrecio, fmtEje, fmtDif, fmtPct, fmtLargo, fmtHora, fmtDia, fmtDiaTabla;
  function prepararFormatos() {
    const regional = configuracionRegional();
    fmtPrecio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    fmtEje = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    fmtDif = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
    fmtPct = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    fmtLargo = new Intl.DateTimeFormat(regional, { timeZone: zona, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    fmtHora = new Intl.DateTimeFormat(regional, { timeZone: zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    fmtDia = new Intl.DateTimeFormat(regional, { timeZone: zona, day: "2-digit", month: "short" });
    fmtDiaTabla = new Intl.DateTimeFormat(regional, { timeZone: zona, weekday: "short", day: "2-digit", month: "short" });
  }
  prepararFormatos();
  const fmtIso = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });

  const estado = { banco: null, dias: 7, lado: "venta", bancos: [], tco: new Map(), fin: null, inicio: null, p2pVenta: null, cargando: false, geo: null };
  const $b = (sel) => document.querySelector(sel);
  const NS = "http://www.w3.org/2000/svg";

  const aTiempo = (fh) => Date.parse(`${fh.trim().replace(" ", "T")}:00-04:00`);
  const inicioDia = (iso) => Date.parse(`${iso}T00:00:00-04:00`);
  const isoDe = (t) => fmtIso.format(new Date(t));
  const num = (v) => {
    const s = (v || "").trim();
    if (!s) return null;
    const x = Number(s);
    return Number.isFinite(x) ? x : null;
  };
  const precio = (v) => (v == null ? "—" : fmtPrecio.format(v));
  const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const tcoDe = (t) => estado.tco.get(isoDe(t)) ?? null;
  const placa = (banco) => (banco.logo
    ? `<span class="placa"><img src="assets/bancos/${banco.logo}" alt="" decoding="async"></span>`
    : `<span class="placa sin-logo">${escaparHtml(banco.corto)}</span>`);

  function restaurar() {
    try {
      const g = JSON.parse(window.localStorage.getItem(CLAVE) || "{}");
      if ([1, 7, 30].includes(g.dias)) estado.dias = g.dias;
      if (Object.hasOwn(VISTAS, g.lado)) estado.lado = g.lado;
      if (typeof g.banco === "string") estado.banco = g.banco;
    } catch (error) {
      estado.dias = 7;
    }
  }

  function guardar() {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({ banco: estado.banco, dias: estado.dias, lado: estado.lado }));
    } catch (error) {
      estado.dias = estado.dias || 7;
    }
  }

  function leerBancos(texto) {
    const lineas = texto.trim().split(/\r?\n/).map((l) => l.split(","));
    if (lineas.length < 2 || (lineas[0][0] || "").trim() !== "fecha_hora") {
      throw new Error("El CSV de bancos no tiene el formato esperado");
    }
    const [nombres, etiquetas] = lineas;
    const columnas = new Map();
    for (let j = 1; j < nombres.length; j += 1) {
      const etiqueta = (etiquetas[j] || "").trim();
      if (etiqueta !== "USD compra" && etiqueta !== "USD venta") continue;
      const nombre = nombres[j].trim();
      if (nombre === "IDEPRO IFD") continue;
      if (!columnas.has(nombre)) columnas.set(nombre, {});
      columnas.get(nombre)[etiqueta === "USD compra" ? "compra" : "venta"] = j;
    }
    const filas = lineas.slice(2).filter((f) => (f[0] || "").trim());
    const bancos = [...columnas.entries()].map(([nombre, cols]) => {
      const puntos = [];
      filas.forEach((f) => {
        const compra = cols.compra != null ? num(f[cols.compra]) : null;
        const venta = cols.venta != null ? num(f[cols.venta]) : null;
        if (compra == null && venta == null) return;
        puntos.push({ t: aTiempo(f[0]), compra, venta });
      });
      const [largo, corto, logo] = NOMBRES[nombre] || [nombre, nombre, null];
      return { nombre, largo, corto, logo, tieneCompra: cols.compra != null, puntos };
    });
    return {
      bancos,
      fin: filas.length ? aTiempo(filas[filas.length - 1][0]) : null,
      inicio: filas.length ? aTiempo(filas[0][0]) : null,
    };
  }

  function leerTco(texto) {
    const lineas = texto.trim().split(/\r?\n/);
    const cab = lineas[0].split(",").map((s) => s.trim());
    const iV = cab.indexOf("vigencia");
    const iC = cab.indexOf("tco_compra");
    const mapa = new Map();
    if (iV < 0 || iC < 0) return mapa;
    lineas.slice(1).forEach((l) => {
      const c = l.split(",");
      const vig = (c[iV] || "").trim();
      if (vig) mapa.set(vig, num(c[iC]));
    });
    return mapa;
  }

  const bancoActual = () => estado.bancos.find((b) => b.nombre === estado.banco) || estado.bancos[0] || null;

  function vigente(banco, t) {
    let actual = null;
    for (const p of banco.puntos) {
      if (p.t > t) break;
      actual = p;
    }
    return actual;
  }

  function rango() {
    const t1 = estado.fin;
    let t0 = Math.max(t1 - estado.dias * DIA, estado.inicio);
    if (t1 - t0 < 60_000) t0 = t1 - HORA;
    return [t0, t1];
  }

  function tramos(puntos, clave, t0, t1) {
    const segs = [];
    let actual = null;
    let desde = t0;
    puntos.forEach((p) => {
      if (p.t <= t0) actual = p[clave];
    });
    puntos.forEach((p) => {
      if (p.t <= t0 || p.t > t1) return;
      if (actual != null) segs.push({ a: desde, b: p.t, y: actual });
      actual = p[clave];
      desde = p.t;
    });
    if (actual != null && t1 > desde) segs.push({ a: desde, b: t1, y: actual });
    return segs;
  }

  function tramosTco(t0, t1) {
    const segs = [];
    let dia = inicioDia(isoDe(t0));
    while (dia < t1) {
      const valor = tcoDe(dia + HORA);
      const a = Math.max(dia, t0);
      const b = Math.min(dia + DIA, t1);
      if (valor != null && b > a) segs.push({ a, b, y: valor });
      dia += DIA;
    }
    return segs;
  }

  const valorEn = (segs, t) => segs.find((s) => t >= s.a && t <= s.b)?.y ?? null;

  function camino(segs, x, y) {
    let d = "";
    let previo = null;
    segs.forEach((s) => {
      d += previo && previo.b === s.a
        ? `V${y(s.y).toFixed(1)}H${x(s.b).toFixed(1)}`
        : `M${x(s.a).toFixed(1)},${y(s.y).toFixed(1)}H${x(s.b).toFixed(1)}`;
      previo = s;
    });
    return d;
  }

  function nodo(nombre, attrs = {}, padre = null) {
    const el = document.createElementNS(NS, nombre);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (padre) padre.appendChild(el);
    return el;
  }

  function texto(sel, valor) {
    const el = $b(sel);
    if (el) el.textContent = valor;
    return el;
  }

  function delta(sel, actual, inicial) {
    const el = $b(sel);
    el.classList.remove("up", "down");
    if (actual == null || inicial == null) {
      el.textContent = "—";
      return;
    }
    if (actual === inicial) {
      el.textContent = traducir("Sin cambios en el periodo");
      return;
    }
    const pct = ((actual - inicial) / inicial) * 100;
    el.classList.add(actual > inicial ? "up" : "down");
    el.textContent = `${actual > inicial ? "▲" : "▼"} ${traducir("{n} %", { n: fmtPct.format(Math.abs(pct)) })}`;
  }

  function metricas(banco) {
    const [t0, t1] = rango();
    const actual = vigente(banco, t1);
    const inicial = vigente(banco, t0) || banco.puntos.find((p) => p.t >= t0) || null;
    const tco = tcoDe(t1);

    texto("#banco-venta", precio(actual?.venta));
    texto("#banco-compra", banco.tieneCompra ? precio(actual?.compra) : traducir("No publica"));
    $b("#banco-compra").classList.toggle("sin-dato", !banco.tieneCompra);
    delta("#banco-delta-venta", actual?.venta, inicial?.venta);
    delta("#banco-delta-compra", actual?.compra, inicial?.compra);

    texto("#banco-tco", tco != null ? fmtEje.format(tco) : "—");
    texto("#banco-tco-stamp", tco != null ? fmtDia.format(new Date(t1)) : "");

    const brechaV = actual?.venta != null && tco != null ? actual.venta - tco : null;
    texto("#banco-brecha-venta", brechaV == null ? "—" : fmtDif.format(brechaV));
    texto("#banco-brecha-venta-pct", brechaV == null ? traducir("Sin TCO")
      : traducir("{pct} % sobre el TCO", { pct: fmtDif.format((brechaV / tco) * 100) }));

    const brechaC = actual?.compra != null && tco != null ? actual.compra - tco : null;
    texto("#banco-brecha-compra", brechaC == null ? "—" : fmtDif.format(brechaC));
    texto("#banco-brecha-compra-pct", !banco.tieneCompra ? traducir("La entidad no publica compra")
      : brechaC == null ? traducir("Sin TCO") : traducir("{pct} % sobre el TCO", { pct: fmtDif.format((brechaC / tco) * 100) }));

    const spread = actual?.venta != null && actual?.compra != null ? actual.venta - actual.compra : null;
    texto("#banco-spread", spread == null ? "—" : fmtEje.format(spread));
    texto("#banco-spread-pct", spread == null ? traducir("La entidad no publica compra")
      : traducir("{pct} % sobre el precio de compra", { pct: fmtPct.format((spread / actual.compra) * 100) }));

  }

  function leyenda() {
    const host = $b("#bancos-leyenda");
    const activas = new Set(VISTAS[estado.lado]);
    const banco = bancoActual();
    host.replaceChildren();
    SERIES.forEach((serie) => {
      if (serie.id === "compra" && banco && !banco.tieneCompra) return;
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.serie = serie.id;
      b.setAttribute("aria-pressed", String(activas.has(serie.id)));
      b.innerHTML = `<i class="swatch${serie.dash ? " dash" : ""} sw-${serie.clase}"></i>${traducir(serie.etiqueta)}`;
      host.appendChild(b);
    });
    if (!banco || banco.tieneCompra) {
      const s = document.createElement("button");
      s.type = "button";
      s.className = "legend-icon";
      s.dataset.serie = "spread";
      s.setAttribute("aria-pressed", String(estado.lado === "spread"));
      s.setAttribute("aria-label", traducir("Comparar venta y compra de la entidad"));
      s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 8h18M3 16h18"></path><path d="M12 5v3M12 16v3"></path>
        <path d="M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5"></path></svg>`;
      host.appendChild(s);
    }
  }

  function dibujar() {
    const svg = $b("#banco-chart");
    const vacio = $b("#bancos-vacio");
    ocultarTip();
    svg.replaceChildren();
    const banco = bancoActual();
    if (!banco) return;
    if (!banco.tieneCompra && estado.lado !== "venta") estado.lado = "venta";

    const ancho = svg.clientWidth || 600;
    const alto = svg.clientHeight || 340;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
    const [t0, t1] = rango();
    const s = {
      venta: tramos(banco.puntos, "venta", t0, t1),
      compra: tramos(banco.puntos, "compra", t0, t1),
      tco: tramosTco(t0, t1),
    };
    const [idA, idB] = VISTAS[estado.lado];
    const valores = [...s[idA], ...s[idB]].map((x) => x.y);
    vacio.hidden = valores.length > 0;
    if (!valores.length) {
      estado.geo = null;
      return;
    }

    let lo = Math.min(...valores);
    let hi = Math.max(...valores);
    if (lo === hi) {
      lo -= 0.05;
      hi += 0.05;
    }
    const margen = (hi - lo) * 0.12;
    lo -= margen;
    hi += margen;

    const pad = { l: 8, r: 58, t: 14, b: 26 };
    const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (ancho - pad.l - pad.r);
    const y = (v) => (alto - pad.b) - ((v - lo) / (hi - lo)) * (alto - pad.b - pad.t);

    const rejilla = nodo("g", {}, svg);
    for (let paso = 0; paso <= 4; paso += 1) {
      const v = lo + ((hi - lo) * paso) / 4;
      nodo("line", { x1: 0, x2: ancho - pad.r + 4, y1: y(v).toFixed(1), y2: y(v).toFixed(1), class: "grid" }, rejilla);
      nodo("text", { x: ancho - pad.r + 10, y: (y(v) + 3.5).toFixed(1), class: "eje" }, rejilla).textContent = fmtEje.format(v);
    }

    const cortes = [...new Set([t0, t1, ...s[idA].flatMap((z) => [z.a, z.b]), ...s[idB].flatMap((z) => [z.a, z.b])])]
      .sort((a, b) => a - b);
    const sombra = nodo("g", {}, svg);
    for (let i = 0; i < cortes.length - 1; i += 1) {
      const medio = (cortes[i] + cortes[i + 1]) / 2;
      const va = valorEn(s[idA], medio);
      const vb = valorEn(s[idB], medio);
      if (va == null || vb == null || va === vb) continue;
      nodo("rect", {
        x: x(cortes[i]).toFixed(1),
        width: Math.max(0.5, x(cortes[i + 1]) - x(cortes[i])).toFixed(1),
        y: y(Math.max(va, vb)).toFixed(1),
        height: Math.abs(y(va) - y(vb)).toFixed(1),
        class: va > vb ? `s-${estado.lado === "compra" ? "compra" : "venta"}` : "s-baja",
      }, sombra);
    }

    [idB, idA].forEach((id) => {
      const serie = SERIES.find((z) => z.id === id);
      const d = camino(s[id], x, y);
      if (d) nodo("path", { d, class: `l-${serie.clase}` }, svg);
      if (serie.dash) return;
      const marcas = nodo("g", { class: `p-${serie.clase}` }, svg);
      banco.puntos.forEach((p) => {
        if (p.t < t0 || p.t > t1 || p[id] == null) return;
        nodo("circle", { cx: x(p.t).toFixed(1), cy: y(p[id]).toFixed(1), r: 3 }, marcas);
      });
      const ultimo = s[id].at(-1);
      if (ultimo) nodo("circle", { cx: x(ultimo.b).toFixed(1), cy: y(ultimo.y).toFixed(1), r: 3.6, class: `fin p-${serie.clase}` }, svg);
    });

    const corto = t1 - t0 <= 3 * DIA;
    const ejeX = nodo("g", {}, svg);
    const vistos = [];
    const marcasX = ancho < 480 ? 3 : 5;
    for (let i = 0; i < marcasX; i += 1) {
      const t = t0 + ((t1 - t0) * i) / (marcasX - 1);
      let etiqueta = corto ? fmtHora.format(new Date(t)) : fmtDia.format(new Date(t));
      if (!corto && vistos.includes(etiqueta)) etiqueta = fmtHora.format(new Date(t));
      vistos.push(etiqueta);
      nodo("text", {
        x: x(t).toFixed(1), y: alto - 8, class: "eje-x",
        "text-anchor": i === 0 ? "start" : i === marcasX - 1 ? "end" : "middle",
      }, ejeX).textContent = etiqueta;
    }

    nodo("line", { id: "banco-cursor", x1: 0, x2: 0, y1: pad.t - 6, y2: alto - pad.b, class: "cursor", visibility: "hidden" }, svg);
    estado.geo = { x, t0, t1, pad, ancho, s, idA, idB };
  }

  function ocultarTip() {
    const tip = $b("#banco-tooltip");
    if (tip) tip.hidden = true;
    document.getElementById("banco-cursor")?.setAttribute("visibility", "hidden");
  }

  function mostrarTip(ev) {
    const g = estado.geo;
    const svg = $b("#banco-chart");
    if (!g) return;
    const caja = svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * g.ancho;
    const t = acotar(g.t0 + ((px - g.pad.l) / (g.ancho - g.pad.l - g.pad.r)) * (g.t1 - g.t0), g.t0, g.t1);
    const cursor = document.getElementById("banco-cursor");
    cursor.setAttribute("x1", g.x(t).toFixed(1));
    cursor.setAttribute("x2", g.x(t).toFixed(1));
    cursor.setAttribute("visibility", "visible");

    const filas = [];
    [g.idA, g.idB].forEach((id) => {
      const serie = SERIES.find((z) => z.id === id);
      const v = valorEn(g.s[id], t);
      if (v == null) return;
      filas.push(`<div class="tip-row"><span><i class="dot sw-${serie.clase}"></i>${traducir(serie.etiqueta)}</span><b>Bs ${precio(v)}</b></div>`);
    });
    const va = valorEn(g.s[g.idA], t);
    const vb = valorEn(g.s[g.idB], t);
    if (va != null && vb != null && vb !== 0) {
      const dif = va - vb;
      filas.push(`<div class="tip-row"><span>${traducir(estado.lado === "spread" ? "Spread" : "Brecha")}</span><b>Bs ${fmtEje.format(dif)} · ${traducir("{n} %", { n: fmtPct.format((dif / vb) * 100) })}</b></div>`);
    }
    const tip = $b("#banco-tooltip");
    tip.innerHTML = `<h4>${fmtLargo.format(new Date(t))}</h4>${filas.join("")}`;
    tip.hidden = false;
    const anchoWrap = $b("#banco-wrap").clientWidth;
    tip.style.left = `${acotar(g.x(t) + 14, 4, Math.max(4, anchoWrap - tip.offsetWidth - 4))}px`;
    tip.style.top = `${acotar(ev.clientY - caja.top - 20, 4, caja.height - tip.offsetHeight - 4)}px`;
  }

  let selectorBanco = null;
  function elegir(nombre) {
    estado.banco = nombre;
    guardar();
    vistaBanco();
  }

  function selector() {
    if (selectorBanco) {
      selectorBanco.sinc();
      return;
    }
    selectorBanco = armarDesplegable(
      $b("#bancos-selector"),
      () => estado.bancos.map((banco) => [banco.nombre, banco.largo, placa(banco)]),
      () => bancoActual()?.nombre ?? "",
      elegir,
    );
  }

  function celda(actual, previo) {
    const td = document.createElement("td");
    if (!actual || (actual.venta == null && actual.compra == null)) {
      td.innerHTML = '<span class="vacio">—</span>';
      return td;
    }
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = precio(actual.venta);
    const c = document.createElement("span");
    c.className = "c";
    c.textContent = actual.compra == null ? "—" : precio(actual.compra);
    if (previo && previo.venta != null && actual.venta != null && previo.venta !== actual.venta) {
      const f = document.createElement("i");
      f.className = actual.venta > previo.venta ? "sube" : "baja";
      f.textContent = actual.venta > previo.venta ? "▲" : "▼";
      v.prepend(f);
      td.classList.add("cambio");
    }
    td.append(v, c);
    return td;
  }

  function celdaTco(valor) {
    const td = document.createElement("td");
    td.innerHTML = valor == null ? '<span class="vacio">—</span>' : `<span class="v">${precio(valor)}</span>`;
    return td;
  }

  function tabla() {
    const tbl = $b("#bancos-tabla");
    const dias = [];
    for (let i = DIAS_TABLA - 1; i >= 0; i -= 1) dias.push(isoDe(estado.fin - i * DIA));

    const thead = document.createElement("thead");
    const cab = document.createElement("tr");
    cab.innerHTML = `<th>${traducir("Entidad")}</th>`;
    dias.forEach((iso) => {
      const th = document.createElement("th");
      th.textContent = fmtDiaTabla.format(new Date(inicioDia(iso) + 12 * HORA));
      cab.appendChild(th);
    });
    thead.appendChild(cab);

    const tbody = document.createElement("tbody");
    const filaTco = document.createElement("tr");
    filaTco.className = "fila-tco";
    filaTco.innerHTML = `<th scope="row">${traducir("TCO")}</th>`;
    dias.forEach((iso) => filaTco.appendChild(celdaTco(estado.tco.get(iso) ?? null)));
    tbody.appendChild(filaTco);

    estado.bancos.forEach((banco) => {
      const tr = document.createElement("tr");
      tr.dataset.banco = banco.nombre;
      tr.classList.toggle("activa", banco.nombre === bancoActual()?.nombre);
      const th = document.createElement("th");
      th.scope = "row";
      th.innerHTML = `<span class="entidad">${placa(banco)}<span>${escaparHtml(banco.largo)}</span></span>`;
      tr.appendChild(th);
      dias.forEach((iso) => {
        const finDia = Math.min(inicioDia(iso) + DIA - 1, estado.fin);
        const previo = vigente(banco, inicioDia(iso) - 1);
        const actual = finDia >= inicioDia(iso) ? vigente(banco, finDia) : null;
        tr.appendChild(celda(actual, previo));
      });
      tbody.appendChild(tr);
    });
    tbl.replaceChildren(thead, tbody);
    const contenedor = tbl.parentElement;
    requestAnimationFrame(() => { contenedor.scrollLeft = contenedor.scrollWidth; });
  }

  function preciosAhora() {
    return estado.bancos
      .map((banco) => ({ banco, valor: vigente(banco, estado.fin)?.venta ?? null }))
      .filter((x) => x.valor != null)
      .sort((a, b) => a.valor - b.valor || a.banco.corto.localeCompare(b.banco.corto, "es"));
  }

  function nombrar(bancos) {
    if (bancos.length === 1) return bancos[0].corto;
    if (bancos.length === 2) return traducir("{a} y {b}", { a: bancos[0].corto, b: bancos[1].corto });
    return traducir("{a}, {b} y {n} más", { a: bancos[0].corto, b: bancos[1].corto, n: bancos.length - 2 });
  }

  function mediana(precios) {
    const n = precios.length;
    const medio = Math.floor(n / 2);
    const bajo = precios[n % 2 ? medio : medio - 1].valor;
    const alto = precios[medio].valor;
    const de = (v) => ({ valor: v, bancos: precios.filter((x) => x.valor === v).map((x) => x.banco) });
    return { valor: (bajo + alto) / 2, bajo: de(bajo), alto: bajo === alto ? null : de(alto) };
  }

  function resumenBancos() {
    const precios = preciosAhora();
    const tarjeta = $b("#metric-bancos");
    if (!tarjeta) return;
    if (!precios.length) {
      texto("#metric-bancos-mediana", "—");
      texto("#metric-bancos-de", "");
      texto("#metric-bancos-media", "");
      texto("#metric-bancos-stamp", "");
      delete tarjeta.dataset.tip;
      return;
    }
    const m = mediana(precios);
    const media = precios.reduce((s, x) => s + x.valor, 0) / precios.length;
    texto("#metric-bancos-mediana", fmtEje.format(m.valor));
    texto("#metric-bancos-stamp", fmtDia.format(new Date(estado.fin)));
    const lista = (grupo) => grupo.bancos.map((b) => b.largo).join(", ");
    texto("#metric-bancos-de", m.alto
      ? traducir("Mediana · entre {a} y {b}", { a: nombrar(m.bajo.bancos), b: nombrar(m.alto.bancos) })
      : traducir("Mediana · {bancos}", { bancos: nombrar(m.bajo.bancos) }));
    texto("#metric-bancos-media", traducir("Media · {valor}", { valor: fmtEje.format(media) }));
    tarjeta.dataset.tip = m.alto
      ? traducir("Mediana de {n} bancos: promedio de {a} ({va}) y {b} ({vb})", { n: precios.length, a: lista(m.bajo), va: precio(m.bajo.valor), b: lista(m.alto), vb: precio(m.alto.valor) })
      : traducir("Mediana de {n} bancos: {lista}", { n: precios.length, lista: lista(m.bajo) });
  }

  function tipBanco(banco, valor, tco, p2p) {
    let t = `${banco.largo} · ${precio(valor)}`;
    if (tco != null) t += traducir(" · {dif} frente al TCO", { dif: fmtDif.format(valor - tco) });
    if (p2p != null) t += traducir(" · {dif} frente a P2P Venta", { dif: fmtDif.format(valor - p2p) });
    return t;
  }

  function ajustarEjePizarra() {
    const escala = $b("#pz-escala");
    const pista = escala.querySelector(".pz-refs");
    if (!pista || !pista.clientWidth) return;
    const ancho = pista.clientWidth;
    const etiquetas = [...pista.querySelectorAll(".pz-etiqueta")];
    const alinear = (el) => {
      const posicion = (parseFloat(el.style.left) / 100) * ancho;
      const desplazamiento = Math.max(-posicion, Math.min(-el.offsetWidth / 2, ancho - posicion - el.offsetWidth));
      el.style.transform = `translateX(${desplazamiento.toFixed(1)}px)`;
      el.style.setProperty("--pz-origen", `${(-desplazamiento).toFixed(1)}px`);
    };
    const chocan = (a, b) => a.left < b.right + 8 && a.right + 8 > b.left;
    escala.classList.remove("con-referencia-arriba");
    etiquetas.forEach((el) => {
      el.classList.remove("arriba");
      alinear(el);
    });
    if (etiquetas.length === 2) {
      const distancia = Math.abs(parseFloat(etiquetas[0].style.left) - parseFloat(etiquetas[1].style.left)) * ancho / 100;
      if (distancia < 90 || chocan(etiquetas[0].getBoundingClientRect(), etiquetas[1].getBoundingClientRect())) {
        etiquetas[1].classList.add("arriba");
        escala.classList.add("con-referencia-arriba");
      }
    }
    const ocupadas = etiquetas.filter((el) => !el.classList.contains("arriba")).map((el) => el.getBoundingClientRect());
    escala.querySelectorAll(".pz-marca").forEach((el) => {
      el.hidden = false;
      alinear(el);
      const caja = el.getBoundingClientRect();
      el.hidden = ocupadas.some((otra) => chocan(caja, otra));
      if (!el.hidden) ocupadas.push(caja);
    });
  }

  function pizarra() {
    const caja = $b("#pizarra");
    const precios = preciosAhora();
    caja.hidden = !precios.length;
    if (!precios.length) return;
    const tco = tcoDe(estado.fin);
    const p2p = estado.p2pVenta;
    const barato = precios[0].valor;
    const caro = precios.at(-1).valor;
    const bancosBaratos = precios.filter((x) => x.valor === barato).map((x) => x.banco);
    const bancosCaros = precios.filter((x) => x.valor === caro).map((x) => x.banco);
    texto("#pz-barato", precio(barato));
    texto("#pz-barato-de", bancosBaratos.length === 1 ? bancosBaratos[0].largo : nombrar(bancosBaratos));
    texto("#pz-caro", precio(caro));
    texto("#pz-caro-de", bancosCaros.length === 1 ? bancosCaros[0].largo : nombrar(bancosCaros));

    const refs = [
      tco != null ? { clase: "tco", nombre: traducir("TCO"), valor: tco } : null,
      p2p != null ? { clase: "p2p", nombre: traducir("P2P Venta"), valor: p2p } : null,
    ].filter(Boolean);
    const todos = [...precios.map((n) => n.valor), ...refs.map((r) => r.valor)];
    let lo = Math.min(...todos);
    let hi = Math.max(...todos);
    const margen = Math.max((hi - lo) * 0.05, 0.01);
    lo -= margen;
    hi += margen;
    const x = (v) => ((v - lo) / (hi - lo)) * 100;
    const origen = x(tco ?? lo + margen);
    const partes = ['<div class="pz-filas">'];
    precios.forEach(({ banco, valor }) => {
      const marca = valor === barato ? " barato" : valor === caro ? " caro" : "";
      const hasta = x(valor);
      partes.push(`<button type="button" class="pz-banco${marca}" data-banco="${escaparHtml(banco.nombre)}" aria-label="${escaparHtml(banco.largo)}" data-tip="${escaparHtml(tipBanco(banco, valor, tco, p2p))}">
        <span class="pz-entidad">${placa(banco)}<span class="pz-nombre">${escaparHtml(banco.corto)}</span></span>
        <span class="pz-pista"><i class="pz-tallo" style="left:${Math.min(origen, hasta).toFixed(2)}%;width:${Math.abs(hasta - origen).toFixed(2)}%"></i><i class="pz-punto" style="left:${hasta.toFixed(2)}%"></i></span>
        <span class="pz-precio"><span>${fmtEje.format(valor)}</span>${tco != null ? `<small>${fmtDif.format(valor - tco)}</small>` : ""}</span>
      </button>`);
    });
    partes.push(`<div class="pz-refs" aria-hidden="true">${refs.map((r) => {
      const posicion = x(r.valor).toFixed(2);
      return `<i class="pz-ref ${r.clase}" style="left:${posicion}%"></i><b class="pz-etiqueta ${r.clase}" style="left:${posicion}%">${escaparHtml(r.nombre)} ${fmtEje.format(r.valor)}</b>`;
    }).join("")}</div></div>`);
    const base = 10 ** Math.floor(Math.log10((hi - lo) / 3));
    const paso = [1, 2, 2.5, 5, 10].map((n) => Math.max(0.01, n * base))
      .find((n) => Math.floor(hi / n) - Math.ceil(lo / n) + 1 <= 4);
    const marcas = [];
    for (let i = Math.ceil(lo / paso); i * paso <= hi; i += 1) {
      const valor = i * paso;
      marcas.push(`<span class="pz-marca" style="left:${x(valor).toFixed(2)}%">${fmtEje.format(valor)}</span>`);
    }
    partes.push(`<div class="pz-eje" aria-hidden="true"><div class="pz-eje-pista">${marcas.join("")}</div></div>`);
    const escala = $b("#pz-escala");
    escala.innerHTML = partes.join("");
    ajustarEjePizarra();
    document.fonts?.ready.then(ajustarEjePizarra);
  }

  function marcarActivo() {
    const nombre = bancoActual()?.nombre;
    selectorBanco?.sinc();
    document.querySelectorAll("#bancos-tabla tbody tr[data-banco]").forEach((tr) => {
      tr.classList.toggle("activa", tr.dataset.banco === nombre);
    });
    document.querySelectorAll("#pz-escala .pz-banco").forEach((b) => {
      b.classList.toggle("activo", b.dataset.banco === nombre);
    });
  }

  function vistaBanco() {
    const banco = bancoActual();
    if (!banco) return;
    texto("#banco-nombre", traducir("{banco} · USD / Bs.", { banco: banco.largo }));
    metricas(banco);
    leyenda();
    dibujar();
    marcarActivo();
  }

  function pintar() {
    const error = $b("#bancos-error");
    if (!estado.bancos.length || estado.fin == null) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    if (!estado.bancos.some((b) => b.nombre === estado.banco)) estado.banco = estado.bancos[0].nombre;
    texto("#bancos-consulta", traducir("Cotizaciones publicadas en el sitio web de cada entidad · última consulta {fecha}", { fecha: fmtHora.format(new Date(estado.fin)) }));
    selector();
    resumenBancos();
    pizarra();
    tabla();
    vistaBanco();
  }

  async function cargar() {
    if (estado.cargando) return;
    estado.cargando = true;
    try {
      const [textoBancos, textoTco, p2p] = await Promise.all([
        cargarDatos("bancos", [], "texto"),
        cargarDatos("tco", [], "texto").catch(() => null),
        cargarDatos("p2p", ["USDT", "compra", "1d"]).catch(() => null),
      ]);
      const datos = leerBancos(textoBancos);
      estado.bancos = datos.bancos;
      estado.fin = datos.fin;
      estado.inicio = datos.inicio;
      estado.tco = textoTco != null ? leerTco(textoTco) : new Map();
      estado.p2pVenta = [...(p2p?.points || [])].reverse().find((p) => p.vwap_bob != null)?.vwap_bob ?? null;
      pintar();
    } catch (error) {
      $b("#bancos-error").hidden = false;
    } finally {
      estado.cargando = false;
    }
  }

  function sincronizarRango() {
    document.querySelectorAll("#bancos-rango button").forEach((b) => {
      const activo = Number(b.dataset.dias) === estado.dias;
      b.classList.toggle("active", activo);
      b.setAttribute("aria-pressed", String(activo));
    });
  }

  function iniciar() {
    if (!$b("#bancos")) return;
    restaurar();
    sincronizarRango();

    $b("#bancos-tabla").addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-banco]");
      if (!tr) return;
      elegir(tr.dataset.banco);
      $b("#bancos-campo").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $b("#pz-escala").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-banco]");
      if (!b) return;
      elegir(b.dataset.banco);
    });

    $b("#bancos-rango").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-dias]");
      if (!b) return;
      estado.dias = Number(b.dataset.dias);
      guardar();
      sincronizarRango();
      vistaBanco();
    });

    $b("#bancos-leyenda").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-serie]");
      if (!b) return;
      if (b.dataset.serie === "spread") {
        estado.lado = estado.lado === "spread" ? "venta" : "spread";
      } else {
        const serie = SERIES.find((z) => z.id === b.dataset.serie);
        if (!serie.lado && estado.lado !== "spread") return;
        estado.lado = serie.lado || "venta";
      }
      guardar();
      leyenda();
      dibujar();
    });

    const svg = $b("#banco-chart");
    svg.addEventListener("pointermove", mostrarTip);
    svg.addEventListener("pointerdown", mostrarTip);
    svg.addEventListener("pointerleave", ocultarTip);

    let espera = null;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        dibujar();
        ajustarEjePizarra();
      }, 160);
    });

    addEventListener("idiomachange", () => {
      prepararFormatos();
      ocultarTip();
      if (estado.bancos.length && estado.fin != null) pintar();
    });

    $b("#refresh-btn")?.addEventListener("click", cargar);
    setInterval(cargar, 10 * 60 * 1000);
    cargar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
