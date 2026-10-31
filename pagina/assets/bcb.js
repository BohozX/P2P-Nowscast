(() => {
  const $r = (s) => document.querySelector(s);
  if (!$r("#reservas") || !window.MCGraficos) return;
  const { lineas, barras } = window.MCGraficos;

  let millones, pct, dia, diaLargo, mes, precio;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    millones = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    pct = new Intl.NumberFormat(regional, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    dia = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short" });
    diaLargo = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
    mes = new Intl.DateTimeFormat(regional, { timeZone: "UTC", month: "short", year: "numeric" });
    precio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  prepararFormatos();
  const FRAGMENTOS = ["Reporte de Inflación y Política Monetaria", "Primer trimestre", "Segundo trimestre", "Tercer trimestre", "Cuarto trimestre", "Múltiples Tipos de Cambio", "Gráfico", "Banco Central de Bolivia y Binance"];
  const frase = (t) => FRAGMENTOS.reduce((s, f) => s.split(f).join(traducir(f)), t || "");
  const fecha = (iso) => new Date(`${iso.length === 7 ? `${iso}-01` : iso}T12:00:00Z`);
  const poner = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const fila = (et, v, color) => `<div class="tip-row"><span>${color ? `<i class="dot" style="background:${color}"></i>` : ""}${et}</span><b>${v}</b></div>`;

  let reservas = null, paralelo = null, vista = "diaria";

  function cifras() {
    const d = reservas.diaria.datos.filter((x) => x.rin != null);
    const ud = d.at(-1);
    if (ud) { poner("rv-rin", millones.format(ud.rin)); poner("rv-rin-nota", `${traducir("al {fecha}", { fecha: diaLargo.format(fecha(ud.fecha)) })}${ud.preliminar ? traducir(" · preliminar") : ""}`); }
    const um = reservas.mensual.datos.filter((x) => x.rin != null).at(-1);
    if (um) {
      poner("rv-mes", millones.format(um.rin));
      poner("rv-mes-nota", mes.format(fecha(um.mes)));
      if (um.oro != null) { poner("rv-oro", millones.format(um.oro)); poner("rv-oro-nota", um.reservas_brutas ? traducir("{pct} % de las brutas", { pct: pct.format((um.oro / um.reservas_brutas) * 100) }) : ""); }
      if (um.divisas != null) { poner("rv-divisas", millones.format(um.divisas)); poner("rv-divisas-nota", um.reservas_brutas ? traducir("{pct} % de las brutas", { pct: pct.format((um.divisas / um.reservas_brutas) * 100) }) : ""); }
    }
  }

  function grafico() {
    const svg = $r("#rv-chart"), wrap = $r("#rv-wrap"), tipEl = $r("#rv-tip");
    const etiquetaY = (v) => millones.format(v);
    if (vista === "anual") {
      const a = reservas.anual.datos;
      barras(svg, {
        etiquetas: a.map((x) => String(x.anio)), valores: a.map((x) => x.rin), color: "var(--verde)", etiquetaY, wrap, tipEl,
        contenido: (i) => `<h4>${a[i].parcial ? traducir("{anio} · a {mes}", { anio: a[i].anio, mes: mes.format(fecha(a[i].mes_cierre)) }) : a[i].anio}</h4>${fila(traducir("RIN"), `${millones.format(a[i].rin)} M`, "var(--verde)")}${a[i].reservas_brutas != null ? fila(traducir("Brutas"), `${millones.format(a[i].reservas_brutas)} M`) : ""}`,
      });
    } else {
      const fuente = vista === "diaria" ? reservas.diaria.datos : reservas.mensual.datos;
      const clave = vista === "diaria" ? "fecha" : "mes";
      const formato = vista === "diaria" ? dia : mes;
      lineas(svg, {
        etiquetas: fuente.map((x) => formato.format(fecha(x[clave]))),
        series: [{ nombre: traducir("RIN"), color: "var(--verde)", ancho: 2.2, valores: fuente.map((x) => x.rin ?? null) }],
        etiquetaY, wrap, tipEl, puntos: true,
        contenido: (i) => `<h4>${(vista === "diaria" ? diaLargo : mes).format(fecha(fuente[i][clave]))}${fuente[i].preliminar ? traducir(" · preliminar") : ""}</h4>${fila(traducir("RIN"), fuente[i].rin == null ? "—" : `${millones.format(fuente[i].rin)} M`, "var(--verde)")}${fuente[i].reservas_brutas != null ? fila(traducir("Brutas"), `${millones.format(fuente[i].reservas_brutas)} M`) : ""}`,
      });
    }
    poner("rv-titulo", traducir("Reservas Internacionales Netas · {vista} · millones USD", { vista: traducir({ diaria: "diaria", mensual: "mensual", anual: "anual" }[vista]) }));
    document.querySelectorAll("#rv-vista button").forEach((b) => { const a = b.dataset.vista === vista; b.classList.toggle("active", a); b.setAttribute("aria-pressed", String(a)); });
  }

  function graficoParalelo() {
    const s = paralelo.serie;
    const series = [
      { nombre: traducir("Tipo de cambio paralelo"), color: "var(--verde)", ancho: 2.4, valores: s.map((x) => x.paralelo) },
      { nombre: traducir("Valor referencial del dólar"), color: "var(--celeste)", ancho: 2, valores: s.map((x) => x.valor_referencial) },
      { nombre: traducir("TCO"), color: "var(--tco)", ancho: 1.6, raya: "7 4", valores: s.map((x) => x.tco) },
      { nombre: traducir("Oficial fijo"), color: "var(--tco-2)", ancho: 1.4, raya: "2 4", valores: s.map((x) => x.oficial_fijo) },
    ];
    lineas($r("#pb-chart"), {
      etiquetas: s.map((x) => mes.format(fecha(x.periodo))), series, puntos: true,
      etiquetaY: (v) => precio.format(v), wrap: $r("#pb-wrap"), tipEl: $r("#pb-tip"),
      contenido: (i) => `<h4>${mes.format(fecha(s[i].periodo))}</h4>${series.filter((x) => x.valores[i] != null).map((x) => fila(x.nombre, `Bs ${precio.format(x.valores[i])}`, x.color)).join("")}`,
    });
    poner("pb-fuente", traducir("Fuente: {informe}, {grafico} ({fuente})", { informe: frase(paralelo.informe), grafico: frase(paralelo.grafico), fuente: frase(paralelo.fuente_bcb.replace(/^Fuente:\s*/, "").replace(/\.$/, "")) }));
  }

  $r("#rv-vista").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-vista]"); if (b && reservas) { vista = b.dataset.vista; grafico(); } });
  let espera = 0;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { if (reservas) grafico(); if (paralelo) graficoParalelo(); }, 160); });

  addEventListener("idiomachange", () => {
    prepararFormatos();
    ["#rv-tip", "#pb-tip"].forEach((t) => { $r(t).hidden = true; });
    if (reservas) { cifras(); grafico(); }
    if (paralelo) graficoParalelo();
  });

  cargarDatos("reservas").then((d) => { reservas = d; cifras(); grafico(); }).catch(() => { $r("#rv-error").hidden = false; });
  cargarDatos("paralelo").then((d) => { paralelo = d; graficoParalelo(); }).catch(() => { $r("#rv-error").hidden = false; });
})();
