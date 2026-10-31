/* P2P Nowcast Bolivia — interfaz publica.
   Este archivo solo renderiza. No calcula ni corrige ningun indicador de mercado:
   los valores P2P se muestran tal como llegan en los JSON publicos y el tipo de
   cambio oficial tal como lo publica el CSV diario de TCO-BCB. */

const FRECUENCIAS = {
  total: { USDT: ["5m", "15m", "30m", "1h", "4h", "1d"], USDC: ["1h", "4h", "1d"] },
  plataforma: { USDT: ["5m", "15m", "1h", "1d"], USDC: ["1h", "1d"] },
};

const PLATAFORMAS_P2P = [
  { id: "total", nombre: "Mercado total" },
  { id: "binance", nombre: "Binance", color: "var(--verde)" },
  { id: "bybit", nombre: "Bybit", color: "var(--celeste)" },
  { id: "bitget", nombre: "Bitget", color: "#b9b4ff" },
];

const allowedRanges = [1, 7, 30];

const FREQ_OPTIONS = [
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1h" },
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
];

/* Duracion de cada bloque. El dato se etiqueta con el FIN de su intervalo: lo que
   se ve como 08:15 en la frecuencia de 15 minutos es lo ocurrido antes de las 08:15. */
const FREQ_MS = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 3_600_000,
  "4h": 4 * 3_600_000,
  "1d": 86_400_000,
};

const esDiaria = () => state.frequency === "1d";

/* Instante que se muestra para un punto. En la resolucion diaria se deja el dia
   tal cual, sin hora y sin correrlo al dia siguiente. */
function instante(time) {
  return esDiaria() ? new Date(time) : new Date(time + (FREQ_MS[state.frequency] || 0));
}

const state = {
  asset: "USDT",
  platform: "total",
  frequency: "5m",
  rangeDays: 30,
  side: "venta",
  showActivity: true,
  rows: [],
  tco: new Map(),
  participacion: null,
  asOf: null,
  loading: false,
  token: 0,
  estado: null,
  error: null,
};

const esPlataforma = () => state.platform !== "total";

function availableFrequencies(asset) {
  return FRECUENCIAS[esPlataforma() ? "plataforma" : "total"][asset];
}

// El dato conserva su clave contractual. La etiqueta se muestra desde la
// perspectiva del comerciante: BUY -> Venta y SELL -> Compra.
const displaySides = [
  { key: "BUY", path: "compra", label: "Venta", slug: "venta" },
  { key: "SELL", path: "venta", label: "Compra", slug: "compra" },
];

const SERIES = [
  { id: "p2pVenta", label: "P2P Venta", width: 2.4, dash: "", side: "venta" },
  { id: "p2pCompra", label: "P2P Compra", width: 2.4, dash: "", side: "compra" },
  { id: "tco", label: "TCO", width: 1.8, dash: "7 4", side: null },
];

const SIDE_VIEW = {
  venta: { p2p: "p2pVenta", tco: "tco" },
  compra: { p2p: "p2pCompra", tco: "tco" },
  spread: { p2p: "p2pVenta", tco: "p2pCompra" },
};

/* Un bloque sin operaciones no tiene precio propio. Para que la linea no quede
   partida se arrastra el ultimo precio conocido: el mercado siguio en ese nivel
   porque nadie opero. Solo afecta al dibujo. */
function arrastrarPrecios(points, claves) {
  const ultimo = {};
  points.forEach((point) => {
    claves.forEach((clave) => {
      const valor = point[clave];
      if (valor != null && Number.isFinite(Number(valor))) {
        ultimo[clave] = valor;
      } else if (ultimo[clave] != null) {
        point[clave] = ultimo[clave];
        point.arrastrado = true;
      }
    });
  });
  return points;
}

function palette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (styles.getPropertyValue(name) || "").trim() || fallback;
  return {
    p2pVenta: read("--green", "#35e08b"),
    p2pCompra: read("--cyan", "#46c8ea"),
    tco: read("--tco", "#d7e2dd"),
    grid: read("--grid-line", "rgba(126,231,178,.07)"),
    panel: read("--bg-2", "#071613"),
  };
}

const enSpread = () => state.side === "spread";

function sideSeries() {
  if (enSpread()) return SERIES.filter((serie) => serie.side);
  return SERIES.filter((serie) => serie.side === state.side || !serie.side);
}

const timeZone = "America/La_Paz";
let priceFormat;
let tcoFormat;
let percentFormat;
let diferenciaFormat;
let fullDateFormat;
let shortDateFormat;
let dayFormat;
let diaLargoFormat;

function prepararFormatos() {
  const regional = configuracionRegional();
  priceFormat = new Intl.NumberFormat(regional, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  tcoFormat = new Intl.NumberFormat(regional, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  percentFormat = new Intl.NumberFormat(regional, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  diferenciaFormat = new Intl.NumberFormat(regional, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });
  fullDateFormat = new Intl.DateTimeFormat(regional, {
    timeZone, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  shortDateFormat = new Intl.DateTimeFormat(regional, {
    timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  dayFormat = new Intl.DateTimeFormat(regional, { timeZone, day: "2-digit", month: "short" });
  diaLargoFormat = new Intl.DateTimeFormat(regional, {
    timeZone, day: "2-digit", month: "short", year: "numeric",
  });
}

prepararFormatos();
/* Fecha de hoy en Bolivia, en formato AAAA-MM-DD, para saber que TCO rige ahora. */
const isoBoFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
});
const hoyEnBolivia = () => isoBoFormat.format(new Date());

const $ = (selector) => document.querySelector(selector);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/* --------------------------------------------------------------- ajustes -- */
/* Solo preferencias de vista. Ningun dato de mercado se guarda en el navegador. */

const STORE_KEY = "p2p-nowcast-view";

function restorePreferences() {
  let saved = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
  } catch (error) {
    saved = {};
  }
  if (Object.hasOwn(FRECUENCIAS.total, saved.asset)) state.asset = saved.asset;
  if (PLATAFORMAS_P2P.some((p) => p.id === saved.platform)) state.platform = saved.platform;
  const disponibles = availableFrequencies(state.asset);
  state.frequency = disponibles.includes(saved.frequency) ? saved.frequency : disponibles[0];
  if (allowedRanges.includes(saved.rangeDays)) state.rangeDays = saved.rangeDays;
  if (Object.hasOwn(SIDE_VIEW, saved.side)) state.side = saved.side;
  if (typeof saved.showActivity === "boolean") state.showActivity = saved.showActivity;
}

function savePreferences() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      asset: state.asset,
      platform: state.platform,
      frequency: state.frequency,
      rangeDays: state.rangeDays,
      side: state.side,
      showActivity: state.showActivity,
    }));
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

/* ----------------------------------------------------------------- datos -- */

async function loadSeries(asset, platform, side, frequency) {
  const total = platform === "total";
  const key = total
    ? `${asset}/${side.path}/${frequency}`
    : `${asset}/${side.path}/plataformas/${platform}/${frequency}`;
  let payload;
  try {
    payload = total
      ? await cargarDatos("p2p", [asset, side.path, frequency])
      : await cargarDatos("plataforma", [asset, side.path, platform, frequency]);
  } catch (error) {
    if (error.estado) throw Object.assign(new Error(key), { clave: "No se pudo cargar {clave}", valores: { clave: key } });
    throw error;
  }
  if (
    payload.window_days !== 30
    || payload.asset !== asset
    || payload.side !== side.key
    || payload.frequency !== frequency
    || (!total && payload.platform !== platform)
  ) {
    throw Object.assign(new Error(key), { clave: "El archivo público no cumple el contrato esperado" });
  }
  return payload;
}

async function loadMarket(asset, platform, frequency) {
  const payloads = await Promise.all(
    displaySides.map((side) => loadSeries(asset, platform, side, frequency)),
  );
  return Object.fromEntries(displaySides.map((side, index) => [side.key, payloads[index]]));
}

async function loadParticipacion(asset) {
  const payload = await cargarDatos("participacion", [asset]);
  return payload.asset === asset ? payload : null;
}

/* El CSV se consume tal cual: una fila por fecha de vigencia con el valor ya
   publicado. No se interpola ni se arrastra ningun valor. */
async function loadTco() {
  const text = await cargarDatos("tco", [], "texto");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((item) => item.trim());
  const iVig = header.indexOf("vigencia");
  const iTco = header.indexOf("tco_compra");
  if (iVig < 0 || iTco < 0) {
    throw new Error("El CSV oficial no tiene las columnas esperadas");
  }

  const map = new Map();
  lines.slice(1).forEach((line) => {
    const cells = line.split(",");
    const vigencia = (cells[iVig] || "").trim();
    if (!vigencia) return;
    const valor = (cells[iTco] || "").trim();
    map.set(vigencia, { vigencia, tco: valor === "" ? null : Number(valor) });
  });
  return { map };
}

function buildRows(market, rangeDays) {
  const allPoints = displaySides.flatMap((side) => market[side.key].points || []);
  if (!allPoints.length) return [];

  const endTime = Math.max(...allPoints.map((point) => Date.parse(point.timestamp_utc)));
  const startLimit = endTime - rangeDays * 86_400_000;
  const merged = new Map();

  displaySides.forEach((side) => {
    (market[side.key].points || []).forEach((point) => {
      const time = Date.parse(point.timestamp_utc);
      if (time < startLimit) return;
      if (!merged.has(point.timestamp_utc)) {
        merged.set(point.timestamp_utc, { timestamp_utc: point.timestamp_utc, sides: {} });
      }
      merged.get(point.timestamp_utc).sides[side.key] = point;
    });
  });

  const rows = [...merged.values()].sort(
    (left, right) => Date.parse(left.timestamp_utc) - Date.parse(right.timestamp_utc),
  );
  const firstUseful = rows.findIndex((row) => displaySides.some((side) => {
    const point = row.sides[side.key];
    return point && (point.vwap_bob != null || Number(point.activity || 0) > 0);
  }));

  return firstUseful < 0 ? [] : rows.slice(firstUseful);
}

function summarizeSide(rows, side) {
  const priced = rows.map((row) => row.sides[side.key]).filter((point) => point && point.vwap_bob != null);
  const first = priced.at(0)?.vwap_bob;
  const last = priced.at(-1)?.vwap_bob;
  return {
    price: last ?? null,
    change: first != null && last != null && Number(first) !== 0
      ? ((Number(last) - Number(first)) / Number(first)) * 100
      : null,
  };
}

function downsampleRows(rows, maxPoints) {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const sampled = [];

  for (let index = 0; index < rows.length; index += step) {
    const group = rows.slice(index, index + step);
    const row = { timestamp_utc: group.at(-1).timestamp_utc, sides: {} };
    displaySides.forEach((side) => {
      const points = group.map((item) => item.sides[side.key]).filter(Boolean);
      if (!points.length) return;
      const lastPriced = points.findLast((point) => point.vwap_bob != null);
      row.sides[side.key] = {
        ...points.at(-1),
        vwap_bob: lastPriced?.vwap_bob ?? null,
        activity: points.reduce((sum, point) => sum + Number(point.activity || 0), 0),
        price_observed: points.some((point) => point.price_observed),
      };
    });
    sampled.push(row);
  }
  return sampled;
}

/* Aplana una fila a la forma que consume el grafico. El TCO se resuelve por la
   fecha boliviana del propio punto; si esa fecha no esta publicada, queda vacia. */
function flattenRow(row) {
  const buy = row.sides.BUY;
  const sell = row.sides.SELL;
  const stamp = buy?.timestamp_bo || sell?.timestamp_bo || "";
  const official = state.tco.get(stamp.slice(0, 10)) || null;
  return {
    time: Date.parse(row.timestamp_utc),
    p2pVenta: buy?.vwap_bob ?? null,
    p2pCompra: sell?.vwap_bob ?? null,
    tco: official?.tco ?? null,
    actVenta: Number(buy?.activity || 0),
    actCompra: Number(sell?.activity || 0),
    shareVenta: buy?.share ?? null,
    shareCompra: sell?.share ?? null,
  };
}

/* --------------------------------------------------------------- métricas -- */

const porcentaje = (valor) => traducir("{n} %", { n: percentFormat.format(valor) });

function renderDelta(node, change) {
  node.classList.remove("up", "down");
  if (change == null) {
    node.textContent = "—";
    return;
  }
  node.classList.add(change >= 0 ? "up" : "down");
  node.textContent = `${change >= 0 ? "▲" : "▼"} ${porcentaje(Math.abs(change))}`;
}

function rotuloBrecha() {
  $("#metric-gap-title").textContent = enSpread()
    ? traducir("Brecha P2P − TCO · Bs.")
    : traducir(state.side === "venta" ? "Brecha Venta · Bs." : "Brecha Compra · Bs.");
}

/* El TCO que rige hoy. El BCB publica el de manana por adelantado, pero no entra
   en vigor hasta esa fecha: la pagina muestra el del dia en curso. */
function tcoVigente() {
  const hoy = hoyEnBolivia();
  const fechas = [...state.tco.keys()].filter((f) => f <= hoy).sort();
  return fechas.length ? state.tco.get(fechas.at(-1)) : null;
}

/* Vigencia publicada justo antes de la que rige, para la variacion diaria. */
function tcoPrevio() {
  const actual = tcoVigente();
  if (!actual) return null;
  const fechas = [...state.tco.keys()].filter((f) => f < actual.vigencia).sort();
  return fechas.length ? state.tco.get(fechas.at(-1)) : null;
}

function renderReparto() {
  const ventana = state.participacion?.scopes?.[state.platform]?.[String(state.rangeDays)] || null;
  [["volume", "volume"], ["transactions", "events"]].forEach(([id, campo]) => {
    const venta = ventana?.[campo]?.BUY ?? null;
    const compra = ventana?.[campo]?.SELL ?? null;
    const tarjeta = $(`#reparto-${id}`);
    const completo = venta != null && compra != null;
    $(`#metric-${id}-venta`).textContent = venta == null ? "—" : porcentaje(venta);
    $(`#metric-${id}-compra`).textContent = compra == null ? "—" : porcentaje(compra);
    $(`#barra-${id}-venta`).style.flexGrow = completo ? String(venta) : "1";
    $(`#barra-${id}-compra`).style.flexGrow = completo ? String(compra) : "1";
    tarjeta.classList.toggle("sin-reparto", !completo);
    if (completo) {
      tarjeta.dataset.tip = traducir("P2P Venta − P2P Compra: {n} pp", { n: diferenciaFormat.format(venta - compra) });
    } else {
      delete tarjeta.dataset.tip;
    }
  });
}

function renderMetrics(rows) {
  const summaries = {};
  displaySides.forEach((side) => {
    const summary = summarizeSide(rows, side);
    summaries[side.slug] = summary;
    $(`#metric-price-${side.slug}`).textContent = summary.price == null
      ? "—"
      : priceFormat.format(summary.price);
    renderDelta($(`#delta-${side.slug}`), summary.change);
  });
  renderReparto();

  const venta = summaries.venta.price;
  const compra = summaries.compra.price;
  if (venta == null || compra == null) {
    $("#metric-spread").textContent = "—";
    $("#metric-spread-pct").textContent = traducir("Sin precios en el rango");
  } else {
    const spread = Number(venta) - Number(compra);
    $("#metric-spread").textContent = priceFormat.format(spread);
    $("#metric-spread-pct").textContent = Number(compra) === 0
      ? "—"
      : traducir("{pct} % sobre el precio de compra", { pct: percentFormat.format((spread / Number(compra)) * 100) });
  }

  const official = tcoVigente();
  const oficial = official ? official.tco : null;

  rotuloBrecha();
  if (enSpread()) {
    $("#metric-gap").textContent = "—";
    $("#metric-gap-pct").textContent = traducir("Elige venta o compra para ver su brecha");
  } else {
    const p2p = summaries[state.side].price;
    if (p2p == null || oficial == null) {
      $("#metric-gap").textContent = "—";
      $("#metric-gap-pct").textContent = traducir("P2P frente al TCO");
    } else {
      const gap = Number(p2p) - Number(oficial);
      $("#metric-gap").textContent = priceFormat.format(gap);
      $("#metric-gap-pct").textContent = traducir("{pct} % sobre el TCO", { pct: percentFormat.format((gap / Number(oficial)) * 100) });
    }
  }

  const previo = tcoPrevio();
  const fecha = (iso) => dayFormat.format(new Date(`${iso}T12:00:00Z`));
  $("#metric-tco").textContent = oficial == null ? "—" : tcoFormat.format(oficial);
  $("#metric-tco-stamp").textContent = official ? fecha(official.vigencia) : "";
  const nota = $("#metric-tco-note");
  const anterior = previo ? previo.tco : null;
  if (oficial == null || anterior == null) {
    nota.className = "metric-note";
    nota.textContent = "Banco Central de Bolivia";
    return;
  }
  const cambio = Number(oficial) - Number(anterior);
  const signo = cambio > 0 ? "▲" : cambio < 0 ? "▼" : "=";
  const pct = Number(anterior) === 0 ? "" : traducir(" · {n} %", { n: percentFormat.format((cambio / Number(anterior)) * 100) });
  nota.className = `metric-note delta ${cambio > 0 ? "up" : cambio < 0 ? "down" : ""}`.trim();
  nota.textContent = `${signo} ${priceFormat.format(Math.abs(cambio))}${pct} vs ${fecha(previo.vigencia)}`;
}

/* --------------------------------------------------------------- gráfico -- */

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function chartGeometry(points, width, height) {
  const withActivity = state.showActivity;
  const padLeft = 8;
  const padRight = 58;
  const padTop = 14;
  const padBottom = 26;
  const activityHeight = withActivity ? Math.round(height * 0.24) : 0;
  const priceTop = padTop;
  const priceBottom = height - padBottom - (withActivity ? activityHeight + 24 : 0);

  const activeSeries = sideSeries();
  const values = [];
  points.forEach((point) => {
    activeSeries.forEach((serie) => {
      const value = point[serie.id];
      if (value != null && Number.isFinite(Number(value))) values.push(Number(value));
    });
  });

  let low = values.length ? Math.min(...values) : 0;
  let high = values.length ? Math.max(...values) : 1;
  if (low === high) { low -= 0.05; high += 0.05; }
  const margin = (high - low) * 0.12;
  low -= margin;
  high += margin;

  const span = Math.max(points.length - 1, 1);
  const xOf = (index) => padLeft + (index / span) * (width - padLeft - padRight);
  const yOf = (value) => priceBottom - ((Number(value) - low) / (high - low)) * (priceBottom - priceTop);

  const maxActivity = withActivity
    ? Math.max(Number.EPSILON, ...points.map((point) => (enSpread()
      ? Math.max(point.actVenta || 0, point.actCompra || 0)
      : (state.side === "venta" ? point.actVenta : point.actCompra) || 0)))
    : 1;
  const activityBase = height - padBottom;
  const yAct = (value) => activityBase - (value / maxActivity) * activityHeight;

  return { xOf, yOf, yAct, low, high, priceTop, priceBottom, activityBase, activityHeight, padRight, withActivity, activeSeries };
}

function linePath(points, geo, key) {
  let path = "";
  let open = false;
  points.forEach((point, index) => {
    const value = point[key];
    if (value == null || !Number.isFinite(Number(value))) { open = false; return; }
    const command = open ? "L" : "M";
    path += `${command}${geo.xOf(index).toFixed(1)} ${geo.yOf(value).toFixed(1)} `;
    open = true;
  });
  return path.trim();
}

/* Devuelve dos conjuntos de poligonos: donde el P2P esta por encima del TCO y
   donde esta por debajo. Se corta en cada cruce y en cada hueco de datos, de modo
   que el relleno nunca salta de un tramo a otro con una linea recta ni mezcla
   los dos sentidos en una sola mancha. */
function gapShapes(points, geo, upper, lower) {
  const valor = (point, key) => {
    const raw = point[key];
    return raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
  };

  const arriba = [];
  const abajo = [];
  let tramo = null;
  let signo = 0;

  const cerrar = () => {
    if (tramo && tramo.top.length >= 2) {
      const d = `M${tramo.top.join(" L")} L${[...tramo.bottom].reverse().join(" L")} Z`;
      (tramo.signo > 0 ? arriba : abajo).push(d);
    }
    tramo = null;
    signo = 0;
  };

  points.forEach((point, index) => {
    const a = valor(point, upper);
    const b = valor(point, lower);
    if (a === null || b === null) { cerrar(); return; }

    const x = geo.xOf(index);
    const s = a === b ? signo : Math.sign(a - b);

    if (tramo && s !== 0 && signo !== 0 && s !== signo) {
      // cruce: se interpola el punto exacto donde ambas series se tocan
      const prev = points[index - 1];
      const pa = valor(prev, upper);
      const pb = valor(prev, lower);
      const t = (pa - pb) / ((pa - pb) - (a - b));
      const xc = geo.xOf(index - 1) + (x - geo.xOf(index - 1)) * t;
      const yc = geo.yOf(pa + (a - pa) * t);
      tramo.top.push(`${xc.toFixed(1)} ${yc.toFixed(1)}`);
      tramo.bottom.push(`${xc.toFixed(1)} ${yc.toFixed(1)}`);
      cerrar();
      tramo = { top: [`${xc.toFixed(1)} ${yc.toFixed(1)}`], bottom: [`${xc.toFixed(1)} ${yc.toFixed(1)}`], signo: s };
      signo = s;
    }

    if (!tramo) {
      tramo = { top: [], bottom: [], signo: s || 1 };
      signo = s;
    }
    if (s !== 0 && signo === 0) { signo = s; tramo.signo = s; }

    tramo.top.push(`${x.toFixed(1)} ${geo.yOf(a).toFixed(1)}`);
    tramo.bottom.push(`${x.toFixed(1)} ${geo.yOf(b).toFixed(1)}`);
  });
  cerrar();

  return { arriba: arriba.join(" "), abajo: abajo.join(" ") };
}

function renderChart(points) {
  const svg = $("#market-chart");
  const wrap = $("#chart-wrap");
  wrap.classList.toggle("no-volume", !state.showActivity);
  svg.textContent = "";

  const width = svg.clientWidth || wrap.clientWidth || 600;
  const height = svg.clientHeight || 360;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (!points.length) return;

  const geo = chartGeometry(points, width, height);
  const tone = palette();

  /* posicion del ultimo valor de cada serie, solo para el punto final */
  const edge = [];
  geo.activeSeries.forEach((serie) => {
    let lastIndex = -1;
    points.forEach((point, index) => {
      if (point[serie.id] != null && Number.isFinite(Number(point[serie.id]))) lastIndex = index;
    });
    if (lastIndex < 0) return;
    edge.push({ serie, index: lastIndex, anchor: geo.yOf(Number(points[lastIndex][serie.id])) });
  });

  /* rejilla y niveles */
  const gridGroup = svgElement("g");
  for (let step = 0; step <= 4; step += 1) {
    const value = geo.low + ((geo.high - geo.low) * step) / 4;
    const y = geo.yOf(value);
    gridGroup.append(svgElement("line", {
      x1: 0, x2: width - geo.padRight + 4, y1: y.toFixed(1), y2: y.toFixed(1),
      stroke: tone.grid, "stroke-width": 1,
    }));
    const label = svgElement("text", {
      x: width - geo.padRight + 10, y: (y + 3.5).toFixed(1),
      fill: "#7d7d84", "font-size": 11, "font-family": "Geist Mono, monospace",
    });
    label.textContent = tcoFormat.format(value);
    gridGroup.append(label);
  }
  svg.append(gridGroup);

  /* sombreado de la distancia entre el precio P2P y el TCO del lado elegido.
     Es solo relleno entre dos lineas ya dibujadas: no calcula ninguna brecha. */
  const view = SIDE_VIEW[state.side];
  const shade = gapShapes(points, geo, view.p2p, view.tco);
  if (shade.arriba) {
    svg.append(svgElement("path", {
      d: shade.arriba, fill: tone[view.p2p], "fill-opacity": .14, stroke: "none",
    }));
  }
  if (shade.abajo) {
    /* Mas opaco que el tramo de arriba: sobre fondo oscuro un rojo tenue se lee
       como un hueco en el sombreado en vez de como un tramo por debajo del TCO. */
    svg.append(svgElement("path", {
      d: shade.abajo, fill: "#ff6b6b", "fill-opacity": .3, stroke: "none",
    }));
  }

  if (geo.withActivity) {
    const barras = enSpread()
      ? [["actVenta", tone.p2pVenta, -1], ["actCompra", tone.p2pCompra, 1]]
      : [[state.side === "venta" ? "actVenta" : "actCompra", tone[SIDE_VIEW[state.side].p2p], 0]];
    const slot = (width - 8 - geo.padRight) / Math.max(points.length, 1);
    const barWidth = clamp(slot * (enSpread() ? 0.4 : 0.78), 0.6, 22);
    const activityGroup = svgElement("g");
    points.forEach((point, index) => {
      const x = geo.xOf(index);
      barras.forEach(([key, color, dir]) => {
        const value = point[key];
        if (!value) return;
        const y = geo.yAct(value);
        activityGroup.append(svgElement("rect", {
          x: (x + dir * barWidth * 0.55 - barWidth / 2).toFixed(1),
          y: y.toFixed(1),
          width: barWidth.toFixed(1),
          height: Math.max(1.5, geo.activityBase - y).toFixed(1),
          fill: color, opacity: .5, rx: Math.min(2, barWidth / 3),
        }));
      });
    });
    svg.append(activityGroup);
    svg.append(svgElement("line", {
      x1: 0, x2: width - geo.padRight + 4, y1: geo.activityBase, y2: geo.activityBase,
      stroke: "rgba(255,255,255,.12)", "stroke-width": 1,
    }));
  }

  /* series */
  geo.activeSeries.forEach((serie) => {
    const d = linePath(points, geo, serie.id);
    if (!d) return;
    svg.append(svgElement("path", {
      d,
      fill: "none",
      stroke: tone[serie.id],
      "stroke-width": serie.width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...(serie.dash ? { "stroke-dasharray": serie.dash } : {}),
    }));

    /* Un punto por observacion real. Donde se arrastro el precio por falta de
       operaciones no hay punto, asi se distingue de un dato observado. */
    const paso = (width - 8 - geo.padRight) / Math.max(points.length - 1, 1);
    if (!serie.dash && paso >= 2.5) {
      const radio = clamp(paso * 0.26, 1.1, 3);
      const puntos = svgElement("g", { fill: tone[serie.id] });
      points.forEach((point, index) => {
        const value = point[serie.id];
        if (value == null || !Number.isFinite(Number(value)) || point.arrastrado) return;
        puntos.append(svgElement("circle", {
          cx: geo.xOf(index).toFixed(1), cy: geo.yOf(value).toFixed(1), r: radio.toFixed(1),
        }));
      });
      svg.append(puntos);
    }

    const marker = edge.find((item) => item.serie.id === serie.id);
    if (marker && !serie.dash) {
      svg.append(svgElement("circle", {
        cx: geo.xOf(marker.index).toFixed(1), cy: marker.anchor.toFixed(1), r: 3.6,
        fill: tone[serie.id], stroke: tone.panel, "stroke-width": 1.4,
      }));
    }
  });

  /* eje temporal: si el rango abarca poco tiempo se muestra la hora */
  const spanMs = points.at(-1).time - points[0].time;
  const useClock = spanMs <= 3 * 86_400_000;
  const ticks = Math.min(5, points.length);
  const axisGroup = svgElement("g");
  const seen = [];
  for (let index = 0; index < ticks; index += 1) {
    const position = Math.round((index / Math.max(ticks - 1, 1)) * (points.length - 1));
    const date = instante(points[position].time);
    let text = (useClock && !esDiaria()) ? shortDateFormat.format(date) : dayFormat.format(date);
    if (!useClock && !esDiaria() && seen.includes(text)) text = shortDateFormat.format(date);
    seen.push(text);
    const label = svgElement("text", {
      x: geo.xOf(position).toFixed(1),
      y: height - 8,
      fill: "#7d7d84",
      "font-size": 11,
      "text-anchor": index === 0 ? "start" : index === ticks - 1 ? "end" : "middle",
    });
    label.textContent = text;
    axisGroup.append(label);
  }
  svg.append(axisGroup);

  /* crosshair */
  const crosshair = svgElement("line", {
    id: "crosshair", x1: 0, x2: 0, y1: geo.priceTop - 6, y2: geo.activityBase,
    stroke: "rgba(255,255,255,.3)", "stroke-width": 1, "stroke-dasharray": "3 3",
    visibility: "hidden",
  });
  svg.append(crosshair);

  svg.__geo = geo;
  svg.__points = points;
}

/* --------------------------------------------------------------- tooltip -- */

function hideTooltip() {
  $("#chart-tooltip").hidden = true;
  const crosshair = document.getElementById("crosshair");
  if (crosshair) crosshair.setAttribute("visibility", "hidden");
}

function showTooltip(event) {
  const svg = $("#market-chart");
  const points = svg.__points;
  const geo = svg.__geo;
  if (!points || !points.length || !geo) return;

  const rect = svg.getBoundingClientRect();
  const x = event.clientX - rect.left;
  let index = 0;
  let best = Infinity;
  points.forEach((point, position) => {
    const distance = Math.abs(geo.xOf(position) - x);
    if (distance < best) { best = distance; index = position; }
  });

  const point = points[index];
  const crosshair = document.getElementById("crosshair");
  if (crosshair) {
    crosshair.setAttribute("x1", geo.xOf(index).toFixed(1));
    crosshair.setAttribute("x2", geo.xOf(index).toFixed(1));
    crosshair.setAttribute("visibility", "visible");
  }

  const tone = palette();
  const view = SIDE_VIEW[state.side];
  const rows = [];
  sideSeries().forEach((serie) => {
    const value = point[serie.id];
    if (value == null || !Number.isFinite(Number(value))) return;
    rows.push(`<div class="tip-row"><span><i class="dot" style="background:${tone[serie.id]}"></i>${traducir(serie.label)}</span><b>Bs ${priceFormat.format(value)}</b></div>`);
  });

  const pP2p = point[view.p2p];
  const pTco = point[view.tco];
  if (pP2p != null && pTco != null && Number(pTco) !== 0) {
    const gap = Number(pP2p) - Number(pTco);
    const nombre = traducir(enSpread() ? "Spread P2P" : "Brecha");
    rows.push(`<div class="tip-row"><span>${nombre}</span><b>Bs ${priceFormat.format(gap)} · ${porcentaje((gap / Number(pTco)) * 100)}</b></div>`);
  }
  if (esPlataforma()) {
    const lados = enSpread()
      ? [["Participación · Venta", point.shareVenta], ["Participación · Compra", point.shareCompra]]
      : [[state.side === "venta" ? "Participación · Venta" : "Participación · Compra", state.side === "venta" ? point.shareVenta : point.shareCompra]];
    lados.forEach(([clave, share]) => {
      if (share != null) rows.push(`<div class="tip-row"><span>${traducir(clave)}</span><b>${porcentaje(share)}</b></div>`);
    });
  }

  const tooltip = $("#chart-tooltip");
  const cuando = esDiaria()
    ? diaLargoFormat.format(instante(point.time))
    : fullDateFormat.format(instante(point.time));
  tooltip.innerHTML = `<h4>${cuando}</h4>${rows.join("")}`;
  tooltip.hidden = false;

  const wrapWidth = $("#chart-wrap").clientWidth;
  const tipWidth = tooltip.offsetWidth;
  tooltip.style.left = `${clamp(geo.xOf(index) + 14, 4, Math.max(4, wrapWidth - tipWidth - 4))}px`;
  tooltip.style.top = `${clamp(event.clientY - rect.top - 20, 4, rect.height - tooltip.offsetHeight - 4)}px`;
}

/* --------------------------------------------------------------- estados -- */

function setStatus(mode, texto) {
  state.estado = texto;
  const pill = $("#data-status");
  pill.classList.remove("is-ok", "is-error", "is-loading");
  if (mode) pill.classList.add(`is-${mode}`);
  $("#data-status-text").textContent = texto();
}

function relativeLabel(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 1) return traducir("hace menos de 1 min");
  if (minutes < 60) return traducir("hace {n} min", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return traducir("hace {n} h", { n: hours });
  return traducir("hace {n} d", { n: Math.floor(hours / 24) });
}

function textoError(error) {
  if (error?.clave) return traducir(error.clave, error.valores);
  return error?.message || traducir("No fue posible obtener la captura actual.");
}

function showLoading() {
  state.loading = true;
  state.error = null;
  setStatus("loading", () => traducir("Cargando"));
  $("#chart-skeleton").hidden = false;
  $("#empty-state").hidden = true;
  $("#error-state").hidden = true;
  $("#refresh-btn").classList.add("is-busy");
  hideTooltip();

  /* la captura anterior no se conserva en pantalla */
  $("#market-chart").textContent = "";
  ["#metric-price-venta", "#metric-price-compra", "#metric-tco",
    "#metric-spread", "#metric-gap", "#metric-volume-venta", "#metric-volume-compra",
    "#metric-transactions-venta", "#metric-transactions-compra"].forEach((id) => {
    $(id).textContent = "—";
  });
  ["#delta-venta", "#delta-compra"].forEach((id) => {
    $(id).textContent = "—";
    $(id).classList.remove("up", "down");
  });
  ["#reparto-volume", "#reparto-transactions"].forEach((id) => {
    $(id).classList.add("sin-reparto");
    delete $(id).dataset.tip;
  });
  $("#metric-spread-pct").textContent = "—";
  $("#metric-gap-pct").textContent = "—";
  $("#metric-tco-stamp").textContent = "";
  $("#status-rel").textContent = "";
}

function showError(error) {
  state.loading = false;
  state.rows = [];
  state.error = error || {};
  setStatus("error", () => traducir("Sin datos"));
  $("#chart-skeleton").hidden = true;
  $("#empty-state").hidden = true;
  $("#error-state").hidden = false;
  $("#error-detail").textContent = textoError(state.error);
  $("#refresh-btn").classList.remove("is-busy");
  $("#status-rel").textContent = "";
}

/* -------------------------------------------------------------- controles -- */

function renderFrequencySelector() {
  const host = $("#frequency-selector");
  host.textContent = "";
  const disponibles = availableFrequencies(state.asset);
  FREQ_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.dataset.frequency = option.id;
    if (!disponibles.includes(option.id)) {
      button.setAttribute("aria-disabled", "true");
      button.dataset.tip = traducir(FRECUENCIAS.total[state.asset].includes(option.id) ? "Solo mercado total" : "Disponible próximamente");
    } else if (option.id === state.frequency) {
      button.classList.add("active");
    }
    host.append(button);
  });
}

/* La leyenda es el unico conmutador: al tocar cualquier serie de un lado, el
   grafico pasa entero a ese lado (precio P2P + TCO) y se sombrea la brecha. */
function renderLegend() {
  const host = $("#legend");
  const tone = palette();
  host.textContent = "";
  const activas = new Set(sideSeries().map((serie) => serie.id));
  SERIES.forEach((serie) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.serie = serie.id;
    button.setAttribute("aria-pressed", String(activas.has(serie.id)));
    button.innerHTML = `<i class="swatch${serie.dash ? " dash" : ""}" style="${serie.dash ? `color:${tone[serie.id]}` : `background:${tone[serie.id]}`}"></i>${traducir(serie.label)}`;
    host.append(button);
  });

  const activity = document.createElement("button");
  activity.type = "button";
  activity.dataset.serie = "activity";
  activity.setAttribute("aria-pressed", String(state.showActivity));
  activity.innerHTML = `<i class="swatch bar" style="background:${tone[SIDE_VIEW[state.side].p2p]}"></i>${traducir("Actividad relativa")}`;
  host.append(activity);

  /* Boton compacto: compara los dos precios P2P entre si. */
  const spread = document.createElement("button");
  spread.type = "button";
  spread.className = "legend-icon";
  spread.dataset.serie = "spread";
  spread.setAttribute("aria-pressed", String(enSpread()));
  spread.setAttribute("aria-label", traducir("Comparar precio de venta y de compra P2P"));
  spread.dataset.tip = traducir("Spread P2P: compara el precio de venta y el de compra entre si");
  spread.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 8h18M3 16h18"></path><path d="M12 5v3M12 16v3"></path>
    <path d="M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5"></path></svg>`;
  host.append(spread);
}

const plataformaSel = armarDesplegable(
  $("#plataforma-sel"),
  () => PLATAFORMAS_P2P.map((p) => [p.id, traducir(p.nombre), `<i class="sel-punto${p.color ? "" : " todas"}"${p.color ? ` style="background:${p.color}"` : ""}></i>`]),
  () => state.platform,
  (clave) => {
    if (clave === state.platform) return;
    state.platform = clave;
    const disponibles = availableFrequencies(state.asset);
    if (!disponibles.includes(state.frequency)) state.frequency = disponibles.includes("1h") ? "1h" : disponibles[0];
    savePreferences();
    syncControls();
    refresh();
  },
);

function syncControls() {
  document.documentElement.dataset.asset = state.asset;
  const plataforma = PLATAFORMAS_P2P.find((p) => p.id === state.platform);
  $("#market-label").textContent = esPlataforma() ? `${state.asset} / Bs. · ${plataforma.nombre}` : `${state.asset} / Bs.`;
  document.querySelectorAll("#asset-selector button").forEach((button) => {
    const active = button.dataset.asset === state.asset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("#range-selector button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.range) === state.rangeDays);
  });
  plataformaSel.sinc();
  renderFrequencySelector();
  renderLegend();
  rotuloBrecha();
}

/* ------------------------------------------------------------------ ciclo -- */

function paint() {
  const rows = state.rows;
  renderMetrics(rows);

  const flat = arrastrarPrecios(
    downsampleRows(rows, 4000).map(flattenRow),
    ["p2pVenta", "p2pCompra"],
  );
  const usable = flat.filter((point) => (
    point.p2pVenta != null || point.p2pCompra != null || point.actVenta || point.actCompra
  ));

  $("#chart-skeleton").hidden = true;
  if (!usable.length) {
    $("#market-chart").textContent = "";
    $("#empty-state").hidden = false;
    return;
  }
  $("#empty-state").hidden = true;
  renderChart(flat);
}

async function refresh() {
  const token = ++state.token;
  showLoading();

  let market = null;
  let official = null;
  let tcoError = false;

  const participacion = loadParticipacion(state.asset).catch(() => null);
  try {
    market = await loadMarket(state.asset, state.platform, state.frequency);
  } catch (error) {
    if (token !== state.token) return;
    showError(error);
    return;
  }

  try {
    official = await loadTco();
  } catch (error) {
    tcoError = true;
  }
  const reparto = await participacion;

  if (token !== state.token) return;

  state.tco = official ? official.map : new Map();
  state.participacion = reparto;
  state.rows = buildRows(market, state.rangeDays);

  const asOf = market.BUY?.as_of_utc || market.SELL?.as_of_utc || null;
  state.asOf = asOf;
  state.loading = false;
  $("#refresh-btn").classList.remove("is-busy");
  $("#error-state").hidden = true;

  if (asOf) {
    $("#status-rel").textContent = relativeLabel(asOf);
    setStatus(tcoError ? "loading" : "ok", () => traducir("Última captura · {fecha}", { fecha: fullDateFormat.format(new Date(asOf)) }));
  } else {
    setStatus("error", () => traducir("Sin captura"));
  }

  paint();
}

/* ---------------------------------------------------------------- eventos -- */

function bindTip() {
  const bubble = $("#tip-bubble");
  const show = (target) => {
    const text = target.dataset.tip;
    if (!text) return;
    bubble.textContent = text;
    bubble.hidden = false;
    const rect = target.getBoundingClientRect();
    const width = bubble.offsetWidth;
    bubble.style.left = `${clamp(rect.left + rect.width / 2 - width / 2, 8, window.innerWidth - width - 8)}px`;
    bubble.style.top = `${Math.max(8, rect.top - bubble.offsetHeight - 8)}px`;
  };
  const hide = () => { bubble.hidden = true; };

  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest("[data-tip]");
    if (target) show(target); else hide();
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("[data-tip]");
    if (target) show(target); else hide();
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-tip]");
    if (target) show(target); else hide();
  });
  window.addEventListener("scroll", hide, { passive: true });
}

function bindEvents() {
  $("#asset-selector").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-asset]");
    if (!button || button.dataset.asset === state.asset) return;
    state.asset = button.dataset.asset;
    const disponibles = availableFrequencies(state.asset);
    if (!disponibles.includes(state.frequency)) state.frequency = disponibles[0];
    savePreferences();
    syncControls();
    refresh();
  });

  $("#frequency-selector").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-frequency]");
    if (!button || button.getAttribute("aria-disabled") === "true" || button.dataset.frequency === state.frequency) return;
    state.frequency = button.dataset.frequency;
    savePreferences();
    syncControls();
    refresh();
  });

  $("#range-selector").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-range]");
    if (!button || button.disabled) return;
    const range = Number(button.dataset.range);
    if (range === state.rangeDays) return;
    state.rangeDays = range;
    savePreferences();
    syncControls();
    refresh();
  });

  $("#legend").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-serie]");
    if (!button) return;
    const id = button.dataset.serie;
    if (id === "activity") {
      state.showActivity = !state.showActivity;
    } else if (id === "spread") {
      state.side = enSpread() ? "venta" : "spread";
    } else {
      const serie = SERIES.find((item) => item.id === id);
      if (!serie) return;
      if (!serie.side) {
        if (!enSpread()) return;
        state.side = "venta";
      } else {
        if (!enSpread() && serie.side === state.side) return;
        state.side = serie.side;
      }
    }
    savePreferences();
    renderLegend();
    if (!state.loading) paint();
  });

  $("#refresh-btn").addEventListener("click", () => { if (!state.loading) refresh(); });
  $("#retry-btn").addEventListener("click", () => { if (!state.loading) refresh(); });

  const svg = $("#market-chart");
  svg.addEventListener("pointermove", showTooltip);
  svg.addEventListener("pointerdown", showTooltip);
  svg.addEventListener("pointerleave", hideTooltip);
  svg.addEventListener("pointerup", hideTooltip);
  svg.addEventListener("pointercancel", hideTooltip);
  svg.addEventListener("contextmenu", (event) => event.preventDefault());

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (!state.loading) paint(); }, 160);
  });

  window.setInterval(() => {
    if (state.asOf) $("#status-rel").textContent = relativeLabel(state.asOf);
  }, 60000);

  window.addEventListener("idiomachange", () => {
    prepararFormatos();
    hideTooltip();
    $("#tip-bubble").hidden = true;
    plataformaSel.sinc();
    renderFrequencySelector();
    renderLegend();
    rotuloBrecha();
    if (state.estado) $("#data-status-text").textContent = state.estado();
    if (state.asOf && $("#status-rel").textContent) $("#status-rel").textContent = relativeLabel(state.asOf);
    if (state.error) $("#error-detail").textContent = textoError(state.error);
    if (!state.loading && !state.error) paint();
  });
}

restorePreferences();
syncControls();
bindTip();
bindEvents();
refresh();
