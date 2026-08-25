/* P2P Nowcast Bolivia — interfaz publica.
   Este archivo solo renderiza. No calcula ni corrige ningun indicador de mercado:
   los valores P2P se muestran tal como llegan en los JSON publicos y el tipo de
   cambio oficial tal como lo publica el CSV diario de TCO-BCB. */

/* Resoluciones que publica el sistema tal cual. */
const BASE_FREQUENCIES = {
  USDT: ["5m", "1h", "1d"],
  USDC: ["1h", "1d"],
};

/* Resoluciones derivadas: se arman agrupando los puntos que ya llegan en el JSON.
   El precio de cada bloque es la suma de volume_bob dividida por la suma de
   volume_asset, es decir el mismo promedio ponderado que trae la fuente, no un
   promedio simple ni un valor inventado. */
const DERIVED = {
  "15m": { base: "5m", ms: 15 * 60_000 },
  "30m": { base: "5m", ms: 30 * 60_000 },
  "4h": { base: "1h", ms: 4 * 3_600_000 },
};

const allowedRanges = [1, 7, 30];

const FREQ_OPTIONS = [
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1h" },
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
];

const baseOf = (frequency) => DERIVED[frequency]?.base || frequency;

function availableFrequencies(asset) {
  return FREQ_OPTIONS
    .filter((option) => BASE_FREQUENCIES[asset].includes(baseOf(option.id)))
    .map((option) => option.id);
}

/* Serie oficial publicada en el repositorio publico TCO-BCB. */
const TCO_URL = "https://raw.githubusercontent.com/BohozX/TCO-BCB/main/datos/tco.csv";

const state = {
  asset: "USDT",
  frequency: "5m",
  rangeDays: 30,
  side: "venta",
  showVolume: true,
  rows: [],
  tco: new Map(),
  tcoLatest: null,
  asOf: null,
  loading: false,
  token: 0,
};

// El dato conserva su clave contractual. La etiqueta se muestra desde la
// perspectiva del comerciante: BUY -> Venta y SELL -> Compra.
const displaySides = [
  { key: "BUY", path: "compra", label: "Venta", slug: "venta" },
  { key: "SELL", path: "venta", label: "Compra", slug: "compra" },
];

/* El color se toma de las variables CSS para que el tema del activo mande:
   verde para USDT, celeste para USDC. */
const SERIES = [
  { id: "p2pVenta", label: "P2P Venta", tone: "--green", width: 2.4, dash: "", side: "venta" },
  { id: "p2pCompra", label: "P2P Compra", tone: "--cyan", width: 2.4, dash: "", side: "compra" },
  { id: "tcoVenta", label: "TCO Venta", tone: "--tco", width: 1.8, dash: "7 4", side: "venta" },
  { id: "tcoCompra", label: "TCO Compra", tone: "--tco-2", width: 1.8, dash: "2 4", side: "compra" },
];

/* El grafico muestra un lado a la vez: el precio P2P y el tipo de cambio oficial
   que le corresponde, con la distancia entre ambos sombreada. */
const SIDE_VIEW = {
  venta: { p2p: "p2pVenta", tco: "tcoVenta" },
  compra: { p2p: "p2pCompra", tco: "tcoCompra" },
};

function palette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (styles.getPropertyValue(name) || "").trim() || fallback;
  return {
    p2pVenta: read("--green", "#35e08b"),
    p2pCompra: read("--cyan", "#46c8ea"),
    tcoVenta: read("--tco", "#d7e2dd"),
    tcoCompra: read("--tco-2", "#8aa39a"),
    grid: read("--grid-line", "rgba(126,231,178,.07)"),
    panel: read("--bg-2", "#071613"),
  };
}

function sideSeries() {
  return SERIES.filter((serie) => serie.side === state.side);
}

const frequencyLabels = { "5m": "5 minutos", "1h": "1 hora", "1d": "1 día" };
const integerFormat = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const priceFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const tcoFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat("es-BO", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const timeZone = "America/La_Paz";
const fullDateFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone, day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const shortDateFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});
const dayFormat = new Intl.DateTimeFormat("es-BO", { timeZone, day: "2-digit", month: "short" });

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
  if (Object.hasOwn(BASE_FREQUENCIES, saved.asset)) state.asset = saved.asset;
  const disponibles = availableFrequencies(state.asset);
  state.frequency = disponibles.includes(saved.frequency) ? saved.frequency : disponibles[0];
  if (allowedRanges.includes(saved.rangeDays)) state.rangeDays = saved.rangeDays;
  if (Object.hasOwn(SIDE_VIEW, saved.side)) state.side = saved.side;
  if (typeof saved.showVolume === "boolean") state.showVolume = saved.showVolume;
}

function savePreferences() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      asset: state.asset,
      frequency: state.frequency,
      rangeDays: state.rangeDays,
      side: state.side,
      showVolume: state.showVolume,
    }));
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

/* ----------------------------------------------------------------- datos -- */

/* Agrupa los puntos que ya llegan del JSON en bloques de mayor duracion.
   Los volumenes se suman y el precio del bloque es sum(volume_bob)/sum(volume_asset),
   que es exactamente el promedio ponderado de los puntos que lo componen. Un bloque
   sin volumen queda sin precio, no se arrastra el anterior. */
function aggregatePoints(points, ms) {
  const buckets = new Map();
  points.forEach((point) => {
    const time = Date.parse(point.timestamp_utc);
    if (!Number.isFinite(time)) return;
    const key = Math.floor(time / ms) * ms;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { asset: 0, bob: 0, events: 0, observed: false };
      buckets.set(key, bucket);
    }
    bucket.asset += Number(point.volume_asset || 0);
    bucket.bob += Number(point.volume_bob || 0);
    bucket.events += Number(point.validated_events || 0);
    bucket.observed = bucket.observed || Boolean(point.price_observed);
  });

  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([key, bucket]) => ({
    timestamp_utc: new Date(key).toISOString().replace(".000Z", "Z"),
    timestamp_bo: `${new Date(key - 4 * 3_600_000).toISOString().slice(0, 19)}-04:00`,
    vwap_bob: bucket.asset > 0 ? bucket.bob / bucket.asset : null,
    volume_asset: bucket.asset,
    volume_bob: bucket.bob,
    validated_events: bucket.events,
    price_observed: bucket.observed,
  }));
}

async function loadSeries(asset, side, frequency) {
  const base = baseOf(frequency);
  const key = `${asset}/${side.path}/${base}`;
  const response = await fetch(`data/${key}.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${key}`);
  const payload = await response.json();
  if (
    payload.window_days !== 30
    || payload.asset !== asset
    || payload.side !== side.key
    || payload.frequency !== base
  ) {
    throw new Error("El archivo público no cumple el contrato esperado");
  }
  if (DERIVED[frequency]) {
    payload.points = aggregatePoints(payload.points || [], DERIVED[frequency].ms);
  }
  return payload;
}

async function loadMarket(asset, frequency) {
  const payloads = await Promise.all(
    displaySides.map((side) => loadSeries(asset, side, frequency)),
  );
  return Object.fromEntries(displaySides.map((side, index) => [side.key, payloads[index]]));
}

/* El CSV se consume tal cual: una fila por fecha de vigencia con los valores de
   compra y venta ya publicados. No se interpola ni se arrastra ningun valor. */
async function loadTco() {
  const response = await fetch(`${TCO_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el tipo de cambio oficial");
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((item) => item.trim());
  const iVig = header.indexOf("vigencia");
  const iCompra = header.indexOf("tco_compra");
  const iVenta = header.indexOf("tco_venta");
  if (iVig < 0 || iCompra < 0 || iVenta < 0) {
    throw new Error("El CSV oficial no tiene las columnas esperadas");
  }

  const map = new Map();
  let latest = null;
  lines.slice(1).forEach((line) => {
    const cells = line.split(",");
    const vigencia = (cells[iVig] || "").trim();
    if (!vigencia) return;
    const compra = (cells[iCompra] || "").trim();
    const venta = (cells[iVenta] || "").trim();
    const entry = {
      vigencia,
      compra: compra === "" ? null : Number(compra),
      venta: venta === "" ? null : Number(venta),
    };
    map.set(vigencia, entry);
    if (!latest || vigencia > latest.vigencia) latest = entry;
  });
  return { map, latest };
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
    return point && (
      point.vwap_bob != null
      || Number(point.volume_asset || 0) > 0
      || Number(point.validated_events || 0) > 0
    );
  }));

  return firstUseful < 0 ? [] : rows.slice(firstUseful);
}

function summarizeSide(rows, side) {
  const points = rows.map((row) => row.sides[side.key]).filter(Boolean);
  const priced = points.filter((point) => point.vwap_bob != null);
  const first = priced.at(0)?.vwap_bob;
  const last = priced.at(-1)?.vwap_bob;
  return {
    price: last ?? null,
    change: first != null && last != null && Number(first) !== 0
      ? ((Number(last) - Number(first)) / Number(first)) * 100
      : null,
    volume: points.reduce((sum, point) => sum + Number(point.volume_asset || 0), 0),
    transactions: points.reduce(
      (sum, point) => sum + Number(point.validated_events || 0),
      0,
    ),
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
        volume_asset: points.reduce((sum, point) => sum + Number(point.volume_asset || 0), 0),
        validated_events: points.reduce(
          (sum, point) => sum + Number(point.validated_events || 0),
          0,
        ),
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
    tcoVenta: official?.venta ?? null,
    tcoCompra: official?.compra ?? null,
    volVenta: Number(buy?.volume_asset || 0),
    volCompra: Number(sell?.volume_asset || 0),
    txVenta: Number(buy?.validated_events || 0),
    txCompra: Number(sell?.validated_events || 0),
  };
}

/* --------------------------------------------------------------- métricas -- */

function renderDelta(node, change) {
  node.classList.remove("up", "down");
  if (change == null) {
    node.textContent = "—";
    return;
  }
  node.classList.add(change >= 0 ? "up" : "down");
  node.textContent = `${change >= 0 ? "▲" : "▼"} ${percentFormat.format(Math.abs(change))} %`;
}

function renderMetrics(rows) {
  $("#volume-unit").textContent = state.asset;

  const summaries = {};
  displaySides.forEach((side) => {
    const summary = summarizeSide(rows, side);
    summaries[side.slug] = summary;
    $(`#metric-price-${side.slug}`).textContent = summary.price == null
      ? "—"
      : priceFormat.format(summary.price);
    $(`#metric-volume-${side.slug}`).textContent = compactFormat.format(summary.volume);
    $(`#metric-transactions-${side.slug}`).textContent = integerFormat.format(summary.transactions);
    renderDelta($(`#delta-${side.slug}`), summary.change);
  });

  const venta = summaries.venta.price;
  const compra = summaries.compra.price;
  if (venta == null || compra == null) {
    $("#metric-spread").textContent = "—";
    $("#metric-spread-pct").textContent = "Sin precios en el rango";
  } else {
    const spread = Number(venta) - Number(compra);
    $("#metric-spread").textContent = priceFormat.format(spread);
    $("#metric-spread-pct").textContent = Number(compra) === 0
      ? "—"
      : `${percentFormat.format((spread / Number(compra)) * 100)} % sobre el precio de compra`;
  }

  /* Brecha del lado activo: precio P2P frente al TCO vigente del mismo lado. */
  const etiqueta = state.side === "venta" ? "Venta" : "Compra";
  $("#metric-gap-title").textContent = `Brecha ${etiqueta} · Bs.`;
  const p2p = summaries[state.side].price;
  const oficialLado = state.tcoLatest ? state.tcoLatest[state.side] : null;
  if (p2p == null || oficialLado == null) {
    $("#metric-gap").textContent = "—";
    $("#metric-gap-pct").textContent = "P2P frente al tipo de cambio oficial";
  } else {
    const gap = Number(p2p) - Number(oficialLado);
    $("#metric-gap").textContent = priceFormat.format(gap);
    $("#metric-gap-pct").textContent = `${percentFormat.format((gap / Number(oficialLado)) * 100)} % sobre el TCO ${etiqueta}`;
  }

  const official = state.tcoLatest;
  const stamp = official ? `Vigencia ${dayFormat.format(new Date(`${official.vigencia}T12:00:00Z`))}` : "";
  $("#metric-tco-venta").textContent = official?.venta == null ? "—" : tcoFormat.format(official.venta);
  $("#metric-tco-compra").textContent = official?.compra == null ? "—" : tcoFormat.format(official.compra);
  $("#metric-tco-venta-note").textContent = official ? stamp : "Banco Central de Bolivia";
  $("#metric-tco-compra-note").textContent = official ? stamp : "Banco Central de Bolivia";
}

/* --------------------------------------------------------------- gráfico -- */

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function chartGeometry(points, width, height) {
  const withVolume = state.showVolume;
  const padLeft = 8;
  const padRight = 58;
  const padTop = 14;
  const padBottom = 26;
  const volumeHeight = withVolume ? Math.round(height * 0.24) : 0;
  const priceTop = padTop;
  const priceBottom = height - padBottom - (withVolume ? volumeHeight + 24 : 0);

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

  const maxVolume = withVolume
    ? Math.max(1, ...points.map((point) => Math.max(point.volVenta, point.volCompra)))
    : 1;
  const volumeBase = height - padBottom;
  const yVol = (value) => volumeBase - (value / maxVolume) * volumeHeight;

  return { xOf, yOf, yVol, low, high, priceTop, priceBottom, volumeBase, volumeHeight, padRight, withVolume, activeSeries };
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

function gapPath(points, geo, upper, lower) {
  const top = [];
  const bottom = [];
  points.forEach((point, index) => {
    const a = point[upper];
    const b = point[lower];
    if (a == null || b == null) return;
    top.push(`${geo.xOf(index).toFixed(1)} ${geo.yOf(a).toFixed(1)}`);
    bottom.push(`${geo.xOf(index).toFixed(1)} ${geo.yOf(b).toFixed(1)}`);
  });
  if (top.length < 2) return "";
  return `M${top.join(" L")} L${bottom.reverse().join(" L")} Z`;
}

function renderChart(points) {
  const svg = $("#market-chart");
  const wrap = $("#chart-wrap");
  wrap.classList.toggle("no-volume", !state.showVolume);
  svg.textContent = "";

  const width = svg.clientWidth || wrap.clientWidth || 600;
  const height = svg.clientHeight || 360;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (!points.length) return;

  const geo = chartGeometry(points, width, height);
  const tone = palette();

  /* etiquetas del borde derecho: se calculan primero y se separan entre si para
     que nunca queden encimadas cuando dos series comparten nivel */
  const edge = [];
  geo.activeSeries.forEach((serie) => {
    let lastIndex = -1;
    points.forEach((point, index) => {
      if (point[serie.id] != null && Number.isFinite(Number(point[serie.id]))) lastIndex = index;
    });
    if (lastIndex < 0) return;
    const value = Number(points[lastIndex][serie.id]);
    edge.push({ serie, value, index: lastIndex, y: geo.yOf(value), anchor: geo.yOf(value) });
  });
  edge.sort((a, b) => a.y - b.y);
  const GAP = 14;
  for (let i = 1; i < edge.length; i += 1) {
    if (edge[i].y - edge[i - 1].y < GAP) edge[i].y = edge[i - 1].y + GAP;
  }
  const overflow = edge.length ? edge.at(-1).y - (height - 6) : 0;
  if (overflow > 0) edge.forEach((item) => { item.y -= overflow; });

  /* rejilla y niveles */
  const gridGroup = svgElement("g");
  for (let step = 0; step <= 4; step += 1) {
    const value = geo.low + ((geo.high - geo.low) * step) / 4;
    const y = geo.yOf(value);
    gridGroup.append(svgElement("line", {
      x1: 0, x2: width - geo.padRight + 4, y1: y.toFixed(1), y2: y.toFixed(1),
      stroke: tone.grid, "stroke-width": 1,
    }));
    if (edge.some((item) => Math.abs(item.y - y) < GAP)) continue;
    const label = svgElement("text", {
      x: width - geo.padRight + 10, y: (y + 3.5).toFixed(1),
      fill: "#6d857c", "font-size": 11, "font-family": "JetBrains Mono, monospace",
    });
    label.textContent = tcoFormat.format(value);
    gridGroup.append(label);
  }
  svg.append(gridGroup);

  /* sombreado de la distancia entre el precio P2P y el TCO del lado elegido.
     Es solo relleno entre dos lineas ya dibujadas: no calcula ninguna brecha. */
  const view = SIDE_VIEW[state.side];
  const shade = gapPath(points, geo, view.p2p, view.tco);
  if (shade) {
    svg.append(svgElement("path", {
      d: shade, fill: tone[view.p2p], "fill-opacity": .13, stroke: "none",
    }));
  }

  /* barras de volumen */
  if (geo.withVolume) {
    const density = points.length;
    const slot = (width - 8 - geo.padRight) / Math.max(density, 1);
    const barWidth = clamp(slot * 0.42, 1.5, 13);
    const volumeGroup = svgElement("g");
    points.forEach((point, index) => {
      const x = geo.xOf(index);
      [["volVenta", tone.p2pVenta, -1], ["volCompra", tone.p2pCompra, 1]].forEach(([key, color, dir]) => {
        const value = point[key];
        if (!value) return;
        const y = geo.yVol(value);
        volumeGroup.append(svgElement("rect", {
          x: (x + dir * barWidth * 0.52 - barWidth / 2).toFixed(1),
          y: y.toFixed(1),
          width: barWidth.toFixed(1),
          height: Math.max(1.5, geo.volumeBase - y).toFixed(1),
          fill: color, opacity: .55, rx: Math.min(2, barWidth / 3),
        }));
      });
    });
    svg.append(volumeGroup);
    svg.append(svgElement("line", {
      x1: 0, x2: width - geo.padRight + 4, y1: geo.volumeBase, y2: geo.volumeBase,
      stroke: "rgba(126,231,178,.10)", "stroke-width": 1,
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

    const marker = edge.find((item) => item.serie.id === serie.id);
    if (marker && !serie.dash) {
      svg.append(svgElement("circle", {
        cx: geo.xOf(marker.index).toFixed(1), cy: marker.anchor.toFixed(1), r: 3.4, fill: tone[serie.id],
      }));
    }
  });

  /* etiquetas del ultimo valor, ya separadas */
  edge.forEach((item) => {
    const text = tcoFormat.format(item.value);
    const x = width - geo.padRight + 6;
    svg.append(svgElement("rect", {
      x: x.toFixed(1), y: (item.y - 8).toFixed(1),
      width: Math.max(38, text.length * 7.2), height: 16, rx: 4,
      fill: tone.panel, stroke: tone[item.serie.id], "stroke-width": .8, opacity: .96,
    }));
    const tag = svgElement("text", {
      x: (x + 5).toFixed(1), y: (item.y + 3.6).toFixed(1),
      fill: tone[item.serie.id], "font-size": 11, "font-weight": 700,
      "font-family": "JetBrains Mono, monospace",
    });
    tag.textContent = text;
    svg.append(tag);
  });

  /* eje temporal: si el rango abarca poco tiempo se muestra la hora */
  const spanMs = points.at(-1).time - points[0].time;
  const useClock = spanMs <= 3 * 86_400_000;
  const ticks = Math.min(5, points.length);
  const axisGroup = svgElement("g");
  const seen = [];
  for (let index = 0; index < ticks; index += 1) {
    const position = Math.round((index / Math.max(ticks - 1, 1)) * (points.length - 1));
    const date = new Date(points[position].time);
    let text = useClock ? shortDateFormat.format(date) : dayFormat.format(date);
    if (!useClock && seen.includes(text)) text = shortDateFormat.format(date);
    seen.push(text);
    const label = svgElement("text", {
      x: geo.xOf(position).toFixed(1),
      y: height - 8,
      fill: "#6d857c",
      "font-size": 11,
      "text-anchor": index === 0 ? "start" : index === ticks - 1 ? "end" : "middle",
    });
    label.textContent = text;
    axisGroup.append(label);
  }
  svg.append(axisGroup);

  /* crosshair */
  const crosshair = svgElement("line", {
    id: "crosshair", x1: 0, x2: 0, y1: geo.priceTop - 6, y2: geo.volumeBase,
    stroke: "rgba(238,246,242,.28)", "stroke-width": 1, "stroke-dasharray": "3 3",
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
    rows.push(`<div class="tip-row"><span><i class="dot" style="background:${tone[serie.id]}"></i>${serie.label}</span><b>Bs ${priceFormat.format(value)}</b></div>`);
  });

  const pP2p = point[view.p2p];
  const pTco = point[view.tco];
  if (pP2p != null && pTco != null && Number(pTco) !== 0) {
    const gap = Number(pP2p) - Number(pTco);
    rows.push(`<div class="tip-row"><span>Brecha</span><b>Bs ${priceFormat.format(gap)} · ${percentFormat.format((gap / Number(pTco)) * 100)} %</b></div>`);
  }
  if (state.showVolume && (point.volVenta || point.volCompra)) {
    rows.push(`<div class="tip-row"><span>Vol. estimado</span><b>${compactFormat.format(point.volVenta + point.volCompra)} ${state.asset}</b></div>`);
  }
  if (point.txVenta || point.txCompra) {
    rows.push(`<div class="tip-row"><span>Trans. estimadas</span><b>${integerFormat.format(point.txVenta + point.txCompra)}</b></div>`);
  }

  const tooltip = $("#chart-tooltip");
  tooltip.innerHTML = `<h4>${fullDateFormat.format(new Date(point.time))}</h4>${rows.join("")}`;
  tooltip.hidden = false;

  const wrapWidth = $("#chart-wrap").clientWidth;
  const tipWidth = tooltip.offsetWidth;
  tooltip.style.left = `${clamp(geo.xOf(index) + 14, 4, Math.max(4, wrapWidth - tipWidth - 4))}px`;
  tooltip.style.top = `${clamp(event.clientY - rect.top - 20, 4, rect.height - tooltip.offsetHeight - 4)}px`;
}

/* --------------------------------------------------------------- estados -- */

function setStatus(mode, text) {
  const pill = $("#data-status");
  pill.classList.remove("is-ok", "is-error", "is-loading");
  if (mode) pill.classList.add(`is-${mode}`);
  $("#data-status-text").textContent = text;
}

function relativeLabel(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 1) return "Actualizado hace menos de 1 min";
  if (minutes < 60) return `Actualizado hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Actualizado hace ${hours} h`;
  return `Actualizado hace ${Math.floor(hours / 24)} d`;
}

function showLoading() {
  state.loading = true;
  setStatus("loading", "Cargando");
  $("#chart-skeleton").hidden = false;
  $("#empty-state").hidden = true;
  $("#error-state").hidden = true;
  $("#refresh-btn").classList.add("is-busy");
  hideTooltip();

  /* la captura anterior no se conserva en pantalla */
  $("#market-chart").textContent = "";
  ["#metric-price-venta", "#metric-price-compra", "#metric-tco-venta", "#metric-tco-compra",
    "#metric-spread", "#metric-volume-venta", "#metric-volume-compra",
    "#metric-transactions-venta", "#metric-transactions-compra"].forEach((id) => {
    $(id).textContent = "—";
  });
  ["#delta-venta", "#delta-compra"].forEach((id) => {
    $(id).textContent = "—";
    $(id).classList.remove("up", "down");
  });
  $("#metric-spread-pct").textContent = "—";
  $("#as-of").textContent = "—";
  $("#as-of-rel").textContent = "";
  $("#foot-capture").textContent = "Última captura: —";
}

function showError(message) {
  state.loading = false;
  state.rows = [];
  setStatus("error", "Sin datos");
  $("#chart-skeleton").hidden = true;
  $("#empty-state").hidden = true;
  $("#error-state").hidden = false;
  $("#error-detail").textContent = message || "No fue posible obtener la captura actual.";
  $("#refresh-btn").classList.remove("is-busy");
  $("#status-capture").textContent = "—";
  $("#status-tco").textContent = "—";
}

/* -------------------------------------------------------------- controles -- */

function renderFrequencySelector() {
  const host = $("#frequency-selector");
  host.textContent = "";
  FREQ_OPTIONS.forEach((option) => {
    const supported = availableFrequencies(state.asset).includes(option.id);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.dataset.frequency = option.id;
    if (!supported) {
      button.disabled = true;
      button.dataset.tip = "Disponible próximamente";
    }
    if (supported && option.id === state.frequency) button.classList.add("active");
    host.append(button);
  });
}

/* La leyenda es el unico conmutador: al tocar cualquier serie de un lado, el
   grafico pasa entero a ese lado (precio P2P + su TCO) y se sombrea la brecha. */
function renderLegend() {
  const host = $("#legend");
  const tone = palette();
  host.textContent = "";
  SERIES.forEach((serie) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.serie = serie.id;
    button.setAttribute("aria-pressed", String(serie.side === state.side));
    button.innerHTML = `<i class="swatch${serie.dash ? " dash" : ""}" style="${serie.dash ? `color:${tone[serie.id]}` : `background:${tone[serie.id]}`}"></i>${serie.label}`;
    host.append(button);
  });

  const volume = document.createElement("button");
  volume.type = "button";
  volume.dataset.serie = "volume";
  volume.setAttribute("aria-pressed", String(state.showVolume));
  volume.innerHTML = `<i class="swatch bar" style="background:${tone[SIDE_VIEW[state.side].p2p]}"></i>Volumen`;
  host.append(volume);
}

function syncControls() {
  document.documentElement.dataset.asset = state.asset;
  $("#market-label").textContent = `${state.asset} / Bs.`;
  document.querySelectorAll("#asset-selector button").forEach((button) => {
    const active = button.dataset.asset === state.asset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("#range-selector button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.range) === state.rangeDays);
  });
  renderFrequencySelector();
  renderLegend();
}

/* ------------------------------------------------------------------ ciclo -- */

function paint() {
  const rows = state.rows;
  renderMetrics(rows);

  const flat = downsampleRows(rows, 320).map(flattenRow);
  const usable = flat.filter((point) => (
    point.p2pVenta != null || point.p2pCompra != null || point.volVenta || point.volCompra
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

  try {
    market = await loadMarket(state.asset, state.frequency);
  } catch (error) {
    if (token !== state.token) return;
    showError(error.message);
    return;
  }

  try {
    official = await loadTco();
  } catch (error) {
    tcoError = true;
  }

  if (token !== state.token) return;

  state.tco = official ? official.map : new Map();
  state.tcoLatest = official ? official.latest : null;
  state.rows = buildRows(market, state.rangeDays);

  const asOf = market.BUY?.as_of_utc || market.SELL?.as_of_utc || null;
  state.asOf = asOf;
  state.loading = false;
  $("#refresh-btn").classList.remove("is-busy");
  $("#error-state").hidden = true;

  if (asOf) {
    $("#as-of").textContent = fullDateFormat.format(new Date(asOf));
    $("#as-of-rel").textContent = relativeLabel(asOf);
    $("#foot-capture").textContent = `Última captura: ${fullDateFormat.format(new Date(asOf))}`;
    $("#status-capture").textContent = fullDateFormat.format(new Date(asOf));
  }
  $("#status-freq").textContent = frequencyLabels[state.frequency] || state.frequency;
  $("#status-tco").textContent = tcoError
    ? "No disponible"
    : state.tcoLatest
      ? `Bs ${tcoFormat.format(state.tcoLatest.compra)} / ${tcoFormat.format(state.tcoLatest.venta)}`
      : "—";

  setStatus(tcoError ? "loading" : "ok", tcoError ? "Datos parciales" : "Datos actualizados");
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
    if (!button || button.disabled || button.dataset.frequency === state.frequency) return;
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
    if (id === "volume") {
      state.showVolume = !state.showVolume;
    } else {
      const serie = SERIES.find((item) => item.id === id);
      if (!serie || serie.side === state.side) return;
      state.side = serie.side;
    }
    savePreferences();
    renderLegend();
    if (!state.loading) paint();
  });

  $("#refresh-btn").addEventListener("click", () => { if (!state.loading) refresh(); });
  $("#retry-btn").addEventListener("click", () => { if (!state.loading) refresh(); });

  const statusButton = $("#data-status");
  statusButton.addEventListener("click", () => {
    const panel = $("#status-panel");
    const open = panel.hidden;
    panel.hidden = !open;
    statusButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".status-wrap")) return;
    $("#status-panel").hidden = true;
    statusButton.setAttribute("aria-expanded", "false");
  });

  const svg = $("#market-chart");
  svg.addEventListener("pointermove", showTooltip);
  svg.addEventListener("pointerdown", showTooltip);
  svg.addEventListener("pointerleave", hideTooltip);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (!state.loading) paint(); }, 160);
  });

  window.setInterval(() => {
    if (state.asOf) $("#as-of-rel").textContent = relativeLabel(state.asOf);
  }, 60000);
}

restorePreferences();
syncControls();
bindTip();
bindEvents();
refresh();
