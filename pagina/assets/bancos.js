(() => {
  const URL_BANCOS = "https://raw.githubusercontent.com/BohozX/TC-BANCOS/main/ultimos_30_dias.csv";
  const URL_TCO = "https://raw.githubusercontent.com/BohozX/TCO-BCB/main/datos/tco.csv";
  const DIA = 86_400_000;
  const DIAS_TABLA = 7;
  const zona = "America/La_Paz";

  const NOMBRES = {
    "BANCO BISA": "Banco BISA",
    "BANCO DE CRÉDITO": "Banco de Crédito (BCP)",
    "BANCO DE LA NACIÓN ARGENTINA": "Banco de la Nación Argentina",
    "BANCO ECONÓMICO": "Banco Económico",
    "BANCO FIE": "Banco FIE",
    "BANCO FORTALEZA": "Banco Fortaleza",
    "BANCO GANADERO": "Banco Ganadero",
    "BANCO MERCANTIL SANTA CRUZ": "Banco Mercantil Santa Cruz",
    "BANCO NACIONAL DE BOLIVIA": "Banco Nacional de Bolivia",
    "BANCO PRODEM": "Banco Prodem",
    "BANCO PYME DE LA COMUNIDAD": "Banco PyME de la Comunidad",
    "BANCO PYME ECOFUTURO": "Banco PyME Ecofuturo",
    "BANCO SOLIDARIO": "Banco Solidario",
    "BANCO UNION": "Banco Unión",
    "IDEPRO IFD": "IDEPRO IFD",
  };

  const fmtPrecio = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtDif = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const fmtHora = new Intl.DateTimeFormat("es-BO", { timeZone: zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtDiaCorto = new Intl.DateTimeFormat("es-BO", { timeZone: zona, day: "2-digit", month: "short" });
  const fmtDiaTabla = new Intl.DateTimeFormat("es-BO", { timeZone: zona, weekday: "short", day: "2-digit", month: "short" });
  const fmtIso = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });

  const estado = { dias: 7, bancos: [], tco: new Map(), fin: null, inicio: null, cargando: false };
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
      if (!columnas.has(nombre)) columnas.set(nombre, {});
      columnas.get(nombre)[etiqueta === "USD compra" ? "compra" : "venta"] = j;
    }
    const filas = lineas.slice(2).filter((f) => (f[0] || "").trim());
    const fin = filas.length ? aTiempo(filas[filas.length - 1][0]) : null;
    const inicio = filas.length ? aTiempo(filas[0][0]) : null;
    const bancos = [...columnas.entries()].map(([nombre, cols]) => {
      const puntos = [];
      filas.forEach((f) => {
        const compra = cols.compra != null ? num(f[cols.compra]) : null;
        const venta = cols.venta != null ? num(f[cols.venta]) : null;
        if (compra == null && venta == null) return;
        puntos.push({ t: aTiempo(f[0]), compra, venta });
      });
      return { nombre, etiqueta: NOMBRES[nombre] || nombre, tieneCompra: cols.compra != null, puntos };
    });
    return { bancos, fin, inicio };
  }

  function leerTco(texto) {
    const lineas = texto.trim().split(/\r?\n/);
    const cab = lineas[0].split(",").map((s) => s.trim());
    const iV = cab.indexOf("vigencia");
    const iC = cab.indexOf("tco_compra");
    const iVe = cab.indexOf("tco_venta");
    const mapa = new Map();
    if (iV < 0 || iC < 0 || iVe < 0) return mapa;
    lineas.slice(1).forEach((l) => {
      const c = l.split(",");
      const vig = (c[iV] || "").trim();
      if (vig) mapa.set(vig, { compra: num(c[iC]), venta: num(c[iVe]) });
    });
    return mapa;
  }

  function vigente(banco, t) {
    let actual = null;
    for (const p of banco.puntos) {
      if (p.t > t) break;
      actual = p;
    }
    return actual;
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

  function tramosTco(clave, t0, t1) {
    const segs = [];
    let dia = inicioDia(isoDe(t0));
    while (dia < t1) {
      const valor = estado.tco.get(isoDe(dia + 3_600_000))?.[clave];
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

  function dibujar(card, banco) {
    const svg = card.querySelector("svg");
    const hover = card.querySelector(".banco-hover");
    svg.replaceChildren();
    const ancho = Math.max(220, svg.clientWidth || 300);
    const alto = 118;
    svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);

    const t1 = estado.fin;
    let t0 = Math.max(t1 - estado.dias * DIA, estado.inicio);
    if (t1 - t0 < 60_000) t0 = t1 - 3_600_000;

    const series = {
      venta: tramos(banco.puntos, "venta", t0, t1),
      compra: tramos(banco.puntos, "compra", t0, t1),
      tcoVenta: tramosTco("venta", t0, t1),
      tcoCompra: tramosTco("compra", t0, t1),
    };
    const valores = Object.values(series).flat().map((s) => s.y);
    if (!valores.length) {
      hover.textContent = "Sin datos en el periodo";
      return;
    }
    let lo = Math.min(...valores);
    let hi = Math.max(...valores);
    const pad = Math.max((hi - lo) * 0.14, 0.06);
    lo -= pad;
    hi += pad;

    const m = { l: 40, r: 6, t: 8, b: 17 };
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (ancho - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (alto - m.t - m.b);

    [lo + pad, hi - pad].forEach((v) => {
      nodo("line", { x1: m.l, x2: ancho - m.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1), class: "grid" }, svg);
      nodo("text", { x: m.l - 5, y: (y(v) + 3).toFixed(1), class: "eje", "text-anchor": "end" }, svg).textContent = fmtPrecio.format(v);
    });

    const cortes = [...new Set([t0, t1, ...series.venta.flatMap((s) => [s.a, s.b]), ...series.tcoVenta.flatMap((s) => [s.a, s.b])])]
      .sort((a, b) => a - b);
    for (let i = 0; i < cortes.length - 1; i += 1) {
      const medio = (cortes[i] + cortes[i + 1]) / 2;
      const vb = valorEn(series.venta, medio);
      const vt = valorEn(series.tcoVenta, medio);
      if (vb == null || vt == null || vb === vt) continue;
      nodo("rect", {
        x: x(cortes[i]).toFixed(1), width: Math.max(0.5, x(cortes[i + 1]) - x(cortes[i])).toFixed(1),
        y: y(Math.max(vb, vt)).toFixed(1), height: Math.abs(y(vb) - y(vt)).toFixed(1), class: "brecha",
      }, svg);
    }

    [["tcoCompra", "l-tco-compra"], ["tcoVenta", "l-tco-venta"], ["compra", "l-compra"], ["venta", "l-venta"]]
      .forEach(([clave, clase]) => {
        const d = camino(series[clave], x, y);
        if (d) nodo("path", { d, class: clase }, svg);
      });

    nodo("text", { x: m.l, y: alto - 3, class: "eje" }, svg).textContent = fmtDiaCorto.format(new Date(t0));
    nodo("text", { x: ancho - m.r, y: alto - 3, class: "eje", "text-anchor": "end" }, svg).textContent = fmtDiaCorto.format(new Date(t1));

    const cursor = nodo("line", { y1: m.t, y2: alto - m.b, class: "cursor", visibility: "hidden" }, svg);
    const textoBase = hover.dataset.base;
    hover.textContent = textoBase;

    const mover = (ev) => {
      const caja = svg.getBoundingClientRect();
      const px = ((ev.clientX - caja.left) / caja.width) * ancho;
      if (px < m.l || px > ancho - m.r) return;
      const t = t0 + ((px - m.l) / (ancho - m.l - m.r)) * (t1 - t0);
      cursor.setAttribute("x1", px.toFixed(1));
      cursor.setAttribute("x2", px.toFixed(1));
      cursor.setAttribute("visibility", "visible");
      const partes = [fmtHora.format(new Date(t))];
      const v = valorEn(series.venta, t);
      const c = valorEn(series.compra, t);
      const tv = valorEn(series.tcoVenta, t);
      if (v != null) partes.push(`V ${precio(v)}`);
      if (c != null) partes.push(`C ${precio(c)}`);
      if (tv != null) partes.push(`TCO V ${precio(tv)}`);
      hover.textContent = partes.join(" · ");
    };
    svg.onpointermove = mover;
    svg.onpointerdown = mover;
    svg.onpointerleave = () => {
      cursor.setAttribute("visibility", "hidden");
      hover.textContent = textoBase;
    };
  }

  function tarjeta(banco) {
    const card = document.createElement("article");
    card.className = "banco-card";
    const actual = vigente(banco, estado.fin);
    const tco = estado.tco.get(isoDe(estado.fin));
    const brecha = actual?.venta != null && tco?.venta != null ? actual.venta - tco.venta : null;
    const pct = brecha != null ? (brecha / tco.venta) * 100 : null;
    const spread = actual?.venta != null && actual?.compra != null ? actual.venta - actual.compra : null;

    card.innerHTML = `
      <header>
        <strong></strong>
        <span class="banco-desde"></span>
      </header>
      <div class="banco-precios">
        <div class="venta"><small><i></i>Venta</small><b></b></div>
        <div class="compra"><small><i></i>Compra</small><b></b></div>
      </div>
      <p class="banco-brecha"></p>
      <svg class="banco-chart" role="img"></svg>
      <p class="banco-hover"></p>`;
    card.querySelector("header strong").textContent = banco.etiqueta;
    card.querySelector(".banco-desde").textContent = actual ? `desde ${fmtHora.format(new Date(actual.t))}` : "sin datos";
    card.querySelector(".venta b").textContent = precio(actual?.venta);
    card.querySelector(".compra b").textContent = banco.tieneCompra ? precio(actual?.compra) : "No publica";
    if (!banco.tieneCompra) card.querySelector(".compra b").classList.add("sin-dato");

    const nota = card.querySelector(".banco-brecha");
    if (brecha != null) {
      const clase = brecha > 0 ? "up" : brecha < 0 ? "down" : "";
      nota.innerHTML = `Brecha venta vs TCO <b class="${clase}"></b>`;
      nota.querySelector("b").textContent = `${fmtDif.format(brecha)} Bs. (${fmtDif.format(pct)}%)`;
      if (spread != null) nota.append(` · Spread ${fmtPrecio.format(spread)} Bs.`);
    } else {
      nota.textContent = spread != null ? `Spread ${fmtPrecio.format(spread)} Bs.` : "Sin tipo de cambio oficial para comparar";
    }
    const hover = card.querySelector(".banco-hover");
    hover.dataset.base = "Toca o pasa el cursor sobre el gráfico para ver cada hora";
    card.querySelector("svg").setAttribute("aria-label", `Compra y venta de ${banco.etiqueta} frente al tipo de cambio oficial`);
    return card;
  }

  function celda(actual, previo, esTco = false) {
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
    if (!esTco && previo && previo.venta != null && actual.venta != null && previo.venta !== actual.venta) {
      const f = document.createElement("i");
      f.className = actual.venta > previo.venta ? "sube" : "baja";
      f.textContent = actual.venta > previo.venta ? "▲" : "▼";
      v.prepend(f);
      td.classList.add("cambio");
    }
    td.append(v, c);
    return td;
  }

  function tabla() {
    const tbl = $b("#bancos-tabla");
    const diasIso = [];
    for (let i = DIAS_TABLA - 1; i >= 0; i -= 1) diasIso.push(isoDe(estado.fin - i * DIA));

    const thead = document.createElement("thead");
    const filaCab = document.createElement("tr");
    filaCab.innerHTML = "<th>Entidad</th>";
    diasIso.forEach((iso) => {
      const th = document.createElement("th");
      th.textContent = fmtDiaTabla.format(new Date(inicioDia(iso) + 12 * 3_600_000));
      filaCab.appendChild(th);
    });
    thead.appendChild(filaCab);

    const tbody = document.createElement("tbody");
    const filaTco = document.createElement("tr");
    filaTco.className = "fila-tco";
    filaTco.innerHTML = "<th scope=\"row\">Oficial BCB (TCO)</th>";
    diasIso.forEach((iso) => filaTco.appendChild(celda(estado.tco.get(iso) || null, null, true)));
    tbody.appendChild(filaTco);

    estado.bancos.forEach((banco) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = banco.etiqueta;
      tr.appendChild(th);
      diasIso.forEach((iso) => {
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

  function pintar() {
    const grid = $b("#bancos-grid");
    const estadoNodo = $b("#bancos-estado");
    if (!estado.bancos.length || estado.fin == null) {
      grid.replaceChildren();
      estadoNodo.hidden = false;
      estadoNodo.textContent = "Las cotizaciones de las entidades financieras aún no están disponibles.";
      return;
    }
    estadoNodo.hidden = true;
    $b("#bancos-consulta").textContent = `Última consulta: ${fmtHora.format(new Date(estado.fin))}`;
    const cards = estado.bancos.map(tarjeta);
    grid.replaceChildren(...cards);
    cards.forEach((card, i) => dibujar(card, estado.bancos[i]));
    tabla();
  }

  async function cargar() {
    if (estado.cargando) return;
    estado.cargando = true;
    try {
      const [rb, rt] = await Promise.all([
        fetch(`${URL_BANCOS}?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${URL_TCO}?v=${Date.now()}`, { cache: "no-store" }).catch(() => null),
      ]);
      if (!rb.ok) throw new Error("No se pudo cargar el CSV de bancos");
      const datos = leerBancos(await rb.text());
      estado.bancos = datos.bancos;
      estado.fin = datos.fin;
      estado.inicio = datos.inicio;
      estado.tco = rt && rt.ok ? leerTco(await rt.text()) : new Map();
      pintar();
    } catch (error) {
      const nodoEstado = $b("#bancos-estado");
      nodoEstado.hidden = false;
      nodoEstado.textContent = "No fue posible obtener las cotizaciones de las entidades financieras.";
    } finally {
      estado.cargando = false;
    }
  }

  function iniciar() {
    if (!$b("#bancos")) return;
    document.querySelectorAll("#bancos-rango button").forEach((btn) => {
      btn.addEventListener("click", () => {
        estado.dias = Number(btn.dataset.dias);
        document.querySelectorAll("#bancos-rango button").forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-pressed", String(b === btn));
        });
        document.querySelectorAll("#bancos-grid .banco-card").forEach((card, i) => dibujar(card, estado.bancos[i]));
      });
    });

    const cta = $b("#cta-bancos");
    if (cta) {
      cta.addEventListener("click", (ev) => {
        ev.preventDefault();
        const destino = $b("#bancos");
        destino.scrollIntoView({ behavior: "smooth", block: "start" });
        destino.classList.remove("resaltar");
        void destino.offsetWidth;
        destino.classList.add("resaltar");
        history.replaceState(null, "", "#bancos");
      });
    }

    let espera = null;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        document.querySelectorAll("#bancos-grid .banco-card").forEach((card, i) => dibujar(card, estado.bancos[i]));
      }, 160);
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
