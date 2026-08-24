const allowedFrequencies = {
  USDT: ["5m", "1h", "1d"],
  USDC: ["1h", "1d"],
};
const allowedRanges = [1, 7, 30];

const state = {
  asset: "USDT",
  frequency: "5m",
  rangeDays: 30,
  showVolume: true,
  rows: [],
};

// El dato conserva su clave contractual. La etiqueta se muestra desde la
// perspectiva del comerciante: BUY -> Venta y SELL -> Compra.
const displaySides = [
  { key: "BUY", path: "compra", label: "Venta", slug: "venta" },
  { key: "SELL", path: "venta", label: "Compra", slug: "compra" },
];

const frequencyLabels = { "5m": "5 MIN", "1h": "1 HORA", "1d": "1 DÍA" };
const integerFormat = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const priceFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const volumeFormat = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 });
const percentFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat("es-BO", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const timeZone = "America/La_Paz";
const shortDateFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fullDateFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const clockFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone,
  day: "2-digit",
  month: "short",
});

const $ = (selector) => document.querySelector(selector);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/* ------------------------------------------------------------------ boot -- */

const RING_LENGTH = 276.5;
const boot = {
  root: $("#boot"),
  bar: $("#boot-bar-fill"),
  percent: $("#boot-pct"),
  step: $("#boot-step"),
  log: $("#boot-log"),
  rings: [...document.querySelectorAll(".ring-value")],
  startedAt: performance.now(),
  value: 0,
  finished: false,
};

function bootLog(message) {
  if (!boot.root) return;
  const item = document.createElement("li");
  item.textContent = message;
  boot.log.append(item);
  while (boot.log.children.length > 4) boot.log.firstElementChild.remove();
}

function bootProgress(value, step, message) {
  if (!boot.root || value < boot.value) return;
  boot.value = value;
  boot.bar.style.width = `${boot.value}%`;
  boot.percent.textContent = `${Math.round(boot.value)}%`;
  boot.rings.forEach((ring) => {
    ring.style.strokeDashoffset = String(RING_LENGTH * (1 - boot.value / 100));
  });
  if (step) boot.step.textContent = step;
  if (message) bootLog(message);
}

const logosReady = Promise.all(
  [...document.querySelectorAll(".boot-coin img")].map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })
  )),
);

async function finishBoot() {
  if (boot.finished || !boot.root) return;
  boot.finished = true;
  await logosReady;
  bootProgress(100, "Mercado listo", "render completo");
  const wait = Math.max(0, 1500 - (performance.now() - boot.startedAt));
  window.setTimeout(() => {
    boot.root.classList.add("is-complete");
    window.setTimeout(() => {
      boot.root.remove();
      boot.root = null;
    }, 680);
  }, wait);
}

function startBootSequence() {
  if (!boot.root) return;
  bootProgress(8, "Iniciando núcleo", "boot p2p-nowcast");
  bootProgress(18, "Enlazando fuentes", "binance p2p · bybit p2p");
  logosReady.then(() => {
    $("#boot-coin-usdt").classList.add("is-live");
    window.setTimeout(() => $("#boot-coin-usdc")?.classList.add("is-live"), 170);
  });
  window.setTimeout(finishBoot, 6000);
}

/* --------------------------------------------------------------- ajustes -- */

const STORE_KEY = "p2p-nowcast-view";

function restorePreferences() {
  let saved = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
  } catch (error) {
    saved = {};
  }
  if (Object.hasOwn(allowedFrequencies, saved.asset)) state.asset = saved.asset;
  if (allowedFrequencies[state.asset].includes(saved.frequency)) state.frequency = saved.frequency;
  else state.frequency = allowedFrequencies[state.asset][0];
  if (allowedRanges.includes(saved.rangeDays)) state.rangeDays = saved.rangeDays;
  if (typeof saved.showVolume === "boolean") state.showVolume = saved.showVolume;
}

function savePreferences() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      asset: state.asset,
      frequency: state.frequency,
      rangeDays: state.rangeDays,
      showVolume: state.showVolume,
    }));
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

/* ----------------------------------------------------------------- datos -- */

async function loadSeries(asset, side, frequency) {
  const key = `${asset}/${side.path}/${frequency}`;
  const response = await fetch(`data/${key}.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${key}`);
  const payload = await response.json();
  if (
    payload.window_days !== 30
    || payload.asset !== asset
    || payload.side !== side.key
    || payload.frequency !== frequency
  ) {
    throw new Error("El archivo público no cumple el contrato esperado");
  }
  return payload;
}

async function loadMarket(asset, frequency) {
  const payloads = await Promise.all(
    displaySides.map((side) => loadSeries(asset, side, frequency)),
  );
  return Object.fromEntries(displaySides.map((side, index) => [side.key, payloads[index]]));
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
  $("#price-title").textContent = `Precio del ${state.asset} · Bs.`;
  $("#volume-title").textContent = `Volumen estimado · ${state.asset}`;

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
    return;
  }
  const spread = Number(venta) - Number(compra);
  $("#metric-spread").textContent = priceFormat.format(spread);
  $("#metric-spread-pct").textContent = Number(compra) === 0
    ? "—"
    : `${percentFormat.format((spread / Number(compra)) * 100)} % sobre el precio de compra`;
}

/* --------------------------------------------------------------- gráfico -- */

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
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

function nearestRowIndex(rows, targetTime) {
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    const current = Math.abs(Date.parse(row.timestamp_utc) - targetTime);
    if (current < distance) {
      distance = current;
      closest = index;
    }
  });
  return closest;
}

function tickFormatter(timeSpan) {
  if (timeSpan <= 40 * 3_600_000) return clockFormat;
  return timeSpan <= 8 * 86_400_000 ? shortDateFormat : dayFormat;
}

function renderTooltip(rows, index) {
  const row = rows[index];
  const previous = rows[index - 1];
  const lines = displaySides.map((side) => {
    const point = row.sides[side.key];
    const price = point?.vwap_bob == null
      ? "Sin precio"
      : `Bs. ${priceFormat.format(point.vwap_bob)}`;
    const before = previous?.sides[side.key]?.vwap_bob;
    const move = point?.vwap_bob != null && before != null
      ? Number(point.vwap_bob) - Number(before)
      : null;
    const moveText = move == null || move === 0
      ? ""
      : ` · ${move > 0 ? "▲" : "▼"} ${priceFormat.format(Math.abs(move))}`;
    const volume = volumeFormat.format(Number(point?.volume_asset || 0));
    const transactions = integerFormat.format(Number(point?.validated_events || 0));
    return `
      <div class="tooltip-side ${side.slug}">
        <span><i></i>${side.label}${moveText}</span>
        <strong>${price}</strong>
        <small>${volume} ${state.asset} · ${transactions} transacciones</small>
      </div>`;
  }).join("");
  return `<time>${shortDateFormat.format(new Date(row.timestamp_utc))}</time>${lines}`;
}

function renderChart(sourceRows, { animate = false } = {}) {
  const svg = $("#market-chart");
  const wrap = $("#chart-wrap");
  const tooltip = $("#chart-tooltip");
  const empty = $("#empty-state");

  const maxChartPoints = clamp(Math.floor(wrap.clientWidth / 3.4), 120, 460);
  const rows = downsampleRows(sourceRows, maxChartPoints);
  const pricedValues = rows.flatMap((row) => displaySides
    .map((side) => row.sides[side.key]?.vwap_bob)
    .filter((value) => value != null)
    .map(Number));

  svg.replaceChildren();
  svg.classList.remove("is-fresh");
  tooltip.hidden = true;
  const hasPrice = pricedValues.length > 0;
  wrap.classList.toggle("is-empty", !hasPrice);
  empty.hidden = hasPrice;
  if (!hasPrice) return;

  const width = Math.max(320, wrap.clientWidth);
  const height = Math.max(300, wrap.clientHeight);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (animate) svg.classList.add("is-fresh");

  const volumes = rows.map((row) => Object.fromEntries(displaySides.map((side) => [
    side.key,
    Number(row.sides[side.key]?.volume_asset || 0),
  ])));
  const maxVolume = Math.max(
    ...volumes.flatMap((rowVolumes) => displaySides.map((side) => rowVolumes[side.key])),
    0,
  );
  const showVolume = state.showVolume && maxVolume > 0;

  const compact = width < 560;
  const margin = { top: 26, right: compact ? 58 : 78, bottom: 28, left: compact ? 6 : 10 };
  const volumeHeight = showVolume ? (compact ? 64 : 84) : 0;
  const volumeGap = showVolume ? 24 : 0;
  const priceBottom = height - margin.bottom - volumeHeight - volumeGap;
  const priceHeight = priceBottom - margin.top;
  const volumeTop = priceBottom + volumeGap;
  const chartWidth = width - margin.left - margin.right;
  const startTime = Date.parse(rows[0].timestamp_utc);
  const endTime = Date.parse(rows.at(-1).timestamp_utc);
  const timeSpan = Math.max(endTime - startTime, 1);
  const x = (row) => margin.left
    + ((Date.parse(row.timestamp_utc) - startTime) / timeSpan) * chartWidth;

  let priceMin = Math.min(...pricedValues);
  let priceMax = Math.max(...pricedValues);
  const padding = Math.max((priceMax - priceMin) * 0.16, priceMax * 0.0025, 0.01);
  priceMin -= padding;
  priceMax += padding;
  const y = (price) => margin.top
    + (1 - (price - priceMin) / Math.max(priceMax - priceMin, 0.0001)) * priceHeight;

  const defs = svgElement("defs");
  displaySides.forEach((side) => {
    const gradient = svgElement("linearGradient", {
      id: `area-${side.slug}`,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1,
    });
    gradient.append(
      svgElement("stop", {
        offset: "0%",
        "stop-color": `var(--${side.slug})`,
        "stop-opacity": 0.22,
      }),
      svgElement("stop", {
        offset: "100%",
        "stop-color": `var(--${side.slug})`,
        "stop-opacity": 0,
      }),
    );
    defs.append(gradient);
  });
  svg.append(defs);

  for (let index = 0; index <= 4; index += 1) {
    const lineY = margin.top + (index / 4) * priceHeight;
    svg.append(svgElement("line", {
      x1: margin.left,
      y1: lineY,
      x2: width - margin.right,
      y2: lineY,
      class: index === 4 ? "grid-line base" : "grid-line",
    }));
    const label = svgElement("text", {
      x: width - margin.right + 9,
      y: lineY + 3.5,
      class: "axis-text right",
    });
    label.textContent = priceFormat.format(priceMax - (index / 4) * (priceMax - priceMin));
    svg.append(label);
  }

  const tickCount = clamp(Math.floor(chartWidth / (compact ? 96 : 132)), 2, 6);
  const formatTick = tickFormatter(timeSpan);
  for (let index = 0; index <= tickCount; index += 1) {
    const ratio = index / tickCount;
    let anchor = "center";
    if (index === 0) anchor = "start";
    else if (index === tickCount) anchor = "end";
    const label = svgElement("text", {
      x: margin.left + ratio * chartWidth,
      y: height - 9,
      class: `axis-text ${anchor}`,
    });
    label.textContent = formatTick.format(new Date(startTime + ratio * timeSpan));
    svg.append(label);
  }

  if (showVolume) {
    const panelLabel = svgElement("text", {
      x: margin.left + 2,
      y: volumeTop - 8,
      class: "panel-label",
    });
    panelLabel.textContent = `VOLUMEN ${state.asset}`;
    svg.append(panelLabel);

    const peak = svgElement("text", {
      x: width - margin.right + 9,
      y: volumeTop + 6,
      class: "axis-text right",
    });
    peak.textContent = compactFormat.format(maxVolume);
    svg.append(peak);

    svg.append(svgElement("line", {
      x1: margin.left,
      y1: volumeTop + volumeHeight,
      x2: width - margin.right,
      y2: volumeTop + volumeHeight,
      class: "grid-line base",
    }));

    const slotWidth = chartWidth / Math.max(rows.length, 1);
    const clusterWidth = clamp(slotWidth * 0.9, 5, 16);
    const barGap = 0.9;
    const barWidth = Math.max(2, (clusterWidth - barGap) / displaySides.length);
    const groupWidth = barWidth * displaySides.length + barGap;
    rows.forEach((row, rowIndex) => {
      displaySides.forEach((side, sideIndex) => {
        const volume = volumes[rowIndex][side.key];
        if (volume <= 0) return;
        const barHeight = Math.max(1.4, (volume / maxVolume) * volumeHeight);
        svg.append(svgElement("rect", {
          x: x(row) - groupWidth / 2 + sideIndex * (barWidth + barGap),
          y: volumeTop + volumeHeight - barHeight,
          width: barWidth,
          height: barHeight,
          rx: Math.min(1.6, barWidth / 3),
          class: `volume-bar ${side.slug}`,
        }));
      });
    });
  }

  const lastTags = [];
  displaySides.forEach((side) => {
    const validRows = rows.filter((row) => row.sides[side.key]?.vwap_bob != null);
    if (!validRows.length) return;

    const points = validRows.map((row) => (
      `${x(row).toFixed(2)},${y(Number(row.sides[side.key].vwap_bob)).toFixed(2)}`
    ));
    svg.append(svgElement("path", {
      d: `M${points[0]} L${points.join(" L")} L${x(validRows.at(-1)).toFixed(2)},${priceBottom} L${x(validRows[0]).toFixed(2)},${priceBottom} Z`,
      class: `price-area ${side.slug}`,
    }));
    svg.append(svgElement("path", {
      d: `M${points.join(" L")}`,
      pathLength: 1,
      class: `price-line ${side.slug}`,
    }));

    const observedRows = validRows.filter((row) => row.sides[side.key].price_observed);
    const dotStep = Math.max(1, Math.ceil(observedRows.length / 80));
    observedRows.filter((_, index) => index % dotStep === 0).forEach((row) => {
      svg.append(svgElement("circle", {
        cx: x(row),
        cy: y(Number(row.sides[side.key].vwap_bob)),
        r: 2.3,
        class: `observed-dot ${side.slug}`,
      }));
    });

    const lastValue = Number(validRows.at(-1).sides[side.key].vwap_bob);
    lastTags.push({ side, value: lastValue, y: clamp(y(lastValue), margin.top + 9, priceBottom - 9) });
  });

  if (lastTags.length === 2 && Math.abs(lastTags[0].y - lastTags[1].y) < 19) {
    const [upper, lower] = [...lastTags].sort((left, right) => left.y - right.y);
    const shift = (19 - (lower.y - upper.y)) / 2;
    upper.y = Math.max(margin.top + 9, upper.y - shift);
    lower.y = Math.min(priceBottom - 9, lower.y + shift);
  }
  lastTags.forEach((tag) => {
    const group = svgElement("g", { class: `last-tag ${tag.side.slug}` });
    group.append(svgElement("rect", {
      x: width - margin.right + 4,
      y: tag.y - 9,
      width: margin.right - 10,
      height: 18,
      rx: 5,
    }));
    const text = svgElement("text", {
      x: width - margin.right + 4 + (margin.right - 10) / 2,
      y: tag.y + 3.5,
    });
    text.textContent = priceFormat.format(tag.value);
    group.append(text);
    svg.append(group);
  });

  const cursor = svgElement("line", {
    y1: margin.top,
    y2: showVolume ? volumeTop + volumeHeight : priceBottom,
    class: "cursor-line",
    visibility: "hidden",
  });
  svg.append(cursor);

  const focusDots = Object.fromEntries(displaySides.map((side) => {
    const dot = svgElement("circle", { r: 4, class: `focus-dot ${side.slug}`, visibility: "hidden" });
    svg.append(dot);
    return [side.key, dot];
  }));

  const hideCursor = () => {
    cursor.setAttribute("visibility", "hidden");
    Object.values(focusDots).forEach((dot) => dot.setAttribute("visibility", "hidden"));
    tooltip.hidden = true;
  };

  const moveCursor = (event) => {
    const bounds = svg.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = clamp((pointerX - margin.left) / chartWidth, 0, 1);
    const index = nearestRowIndex(rows, startTime + ratio * timeSpan);
    const row = rows[index];
    const cursorX = x(row);

    cursor.setAttribute("x1", cursorX);
    cursor.setAttribute("x2", cursorX);
    cursor.setAttribute("visibility", "visible");

    displaySides.forEach((side) => {
      const price = row.sides[side.key]?.vwap_bob;
      const dot = focusDots[side.key];
      if (price == null) {
        dot.setAttribute("visibility", "hidden");
        return;
      }
      dot.setAttribute("cx", cursorX);
      dot.setAttribute("cy", y(Number(price)));
      dot.setAttribute("visibility", "visible");
    });

    tooltip.innerHTML = renderTooltip(rows, index);
    tooltip.hidden = false;
    const tooltipWidth = tooltip.offsetWidth;
    const anchor = (cursorX / width) * wrap.clientWidth;
    tooltip.style.left = `${clamp(anchor - tooltipWidth / 2, 8, Math.max(8, wrap.clientWidth - tooltipWidth - 8))}px`;
    tooltip.style.top = `${margin.top - 6}px`;
  };

  const interaction = svgElement("rect", {
    x: margin.left,
    y: margin.top,
    width: chartWidth,
    height: (showVolume ? volumeTop + volumeHeight : priceBottom) - margin.top,
    fill: "transparent",
  });
  interaction.addEventListener("pointermove", moveCursor);
  interaction.addEventListener("pointerdown", moveCursor);
  interaction.addEventListener("pointerleave", hideCursor);
  svg.append(interaction);
}

/* ---------------------------------------------------------------- vistas -- */

function setActive(container, attribute, value) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset[attribute] === String(value));
  });
}

function renderFrequencyButtons() {
  const container = $("#frequency-selector");
  container.innerHTML = allowedFrequencies[state.asset]
    .map((frequency) => (
      `<button type="button" data-frequency="${frequency}" class="${frequency === state.frequency ? "active" : ""}">${frequencyLabels[frequency]}</button>`
    ))
    .join("");

  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.frequency === button.dataset.frequency) return;
      state.frequency = button.dataset.frequency;
      setActive(container, "frequency", state.frequency);
      savePreferences();
      await refresh({ animate: true });
    });
  });
}

function latestCapture(market) {
  const values = displaySides
    .map((side) => market[side.key].as_of_utc)
    .filter(Boolean)
    .map((value) => Date.parse(value));
  return values.length ? new Date(Math.max(...values)) : null;
}

let refreshToken = 0;

async function refresh({ animate = false } = {}) {
  const currentToken = ++refreshToken;
  const requestedAsset = state.asset;
  const requestedFrequency = state.frequency;
  const status = $("#data-status");
  const statusText = $("#data-status-text");
  status.className = "status-pill loading";
  statusText.textContent = "Cargando datos";
  bootProgress(34, "Solicitando series públicas", `fetch ${requestedAsset} ${requestedFrequency}`);

  try {
    const market = await loadMarket(requestedAsset, requestedFrequency);
    if (currentToken !== refreshToken) return;
    bootProgress(72, "Contrato público verificado", "10 series · ventana 30d");
    state.rows = buildRows(market, state.rangeDays);
    const capture = latestCapture(market);
    $("#market-label").textContent = `${state.asset} / Bs.`;
    $("#as-of").textContent = capture
      ? fullDateFormat.format(capture)
      : "Pendiente de primera ejecución";
    renderMetrics(state.rows);
    renderChart(state.rows, { animate });
    status.className = "status-pill ready";
    statusText.textContent = capture ? "Datos verificados" : "Esperando datos";
    bootProgress(92, "Renderizando mercado", `${state.rows.length} observaciones`);
  } catch (error) {
    if (currentToken !== refreshToken) return;
    console.error(error);
    state.rows = [];
    renderMetrics([]);
    renderChart([]);
    status.className = "status-pill error";
    statusText.textContent = "Datos no disponibles";
    bootProgress(92, "Sin datos disponibles", "fallo de lectura pública");
  }
  finishBoot();
}

function applyAssetView() {
  document.documentElement.dataset.asset = state.asset;
  $("#market-logo").src = `assets/${state.asset.toLowerCase()}.png`;
  $("#market-label").textContent = `${state.asset} / Bs.`;
  setActive($("#asset-selector"), "asset", state.asset);
}

$("#asset-selector").querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", async () => {
    if (state.asset === button.dataset.asset) return;
    state.asset = button.dataset.asset;
    if (!allowedFrequencies[state.asset].includes(state.frequency)) {
      state.frequency = allowedFrequencies[state.asset][0];
    }
    applyAssetView();
    renderFrequencyButtons();
    savePreferences();
    await refresh({ animate: true });
  });
});

$("#range-selector").querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", async () => {
    const range = Number(button.dataset.range);
    if (state.rangeDays === range) return;
    state.rangeDays = range;
    setActive($("#range-selector"), "range", state.rangeDays);
    savePreferences();
    await refresh({ animate: true });
  });
});

const volumeToggle = $("#volume-toggle");
volumeToggle.addEventListener("click", () => {
  state.showVolume = !state.showVolume;
  volumeToggle.classList.toggle("active", state.showVolume);
  volumeToggle.setAttribute("aria-pressed", String(state.showVolume));
  savePreferences();
  renderChart(state.rows, { animate: true });
});

const refreshButton = $("#refresh-btn");
refreshButton.addEventListener("click", async () => {
  refreshButton.classList.add("is-busy");
  await refresh();
  refreshButton.classList.remove("is-busy");
});

let lastChartSize = { width: 0, height: 0 };
let resizeTimer;
const chartObserver = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (Math.abs(width - lastChartSize.width) < 8 && Math.abs(height - lastChartSize.height) < 8) {
    return;
  }
  lastChartSize = { width, height };
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => renderChart(state.rows), 160);
});
chartObserver.observe($("#chart-wrap"));

window.setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, 300_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});

restorePreferences();
applyAssetView();
volumeToggle.classList.toggle("active", state.showVolume);
volumeToggle.setAttribute("aria-pressed", String(state.showVolume));
setActive($("#range-selector"), "range", state.rangeDays);
renderFrequencyButtons();
startBootSequence();
refresh({ animate: true });
