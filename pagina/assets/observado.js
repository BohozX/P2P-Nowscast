(() => {
  const $s = (s) => document.querySelector(s);
  if (!$s("#observado")) return;

  const PLATAFORMAS = [
    { id: "binance", nombre: "Binance" },
    { id: "bybit", nombre: "Bybit" },
    { id: "bitget", nombre: "Bitget" },
  ];
  const zona = "America/La_Paz";
  let precio, precio3, hora;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    precio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    precio3 = new Intl.NumberFormat(regional, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    hora = new Intl.DateTimeFormat(regional, { timeZone: zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  };
  prepararFormatos();
  const poner = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const ultimoValor = (arr) => { for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] != null) return arr[i]; return null; };

  let datos = null, fallo = false;

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
    const ultimas = PLATAFORMAS.map((p) => ({ ...p, venta: ultimoValor(c.venta[p.id]), compra: ultimoValor(c.compra[p.id]) }));
    const barata = ultimas.filter((p) => p.venta != null).sort((a, b) => a.venta - b.venta)[0];
    if (barata) { poner("ob-barata", barata.nombre); poner("ob-barata-nota", traducir("Venta a {precio}", { precio: precio3.format(barata.venta) })); }
    const host = $s("#ob-plataformas");
    host.replaceChildren(...ultimas.map((p) => {
      const a = document.createElement("article");
      a.className = "metrica";
      a.innerHTML = `<span class="metric-title">${p.nombre}</span><div class="metric-pair"><div class="metric-side venta"><small><i></i>${traducir("Venta")}</small><strong>${p.venta == null ? "—" : precio.format(p.venta)}</strong></div><div class="metric-side compra"><small><i></i>${traducir("Compra")}</small><strong>${p.compra == null ? "—" : precio.format(p.compra)}</strong></div></div>`;
      return a;
    }));
  }

  addEventListener("idiomachange", () => {
    prepararFormatos();
    if (datos) { cifras(); } else if (fallo) poner("ob-hora", "");
  });

  cargarDatos("top5")
    .then((d) => { datos = d; cifras(); })
    .catch((e) => {
      fallo = true;
      poner("ob-hora", "");
      if (e.estado === 404) { $s("#observado").hidden = true; $s('.nav-links a[href="#observado"]').hidden = true; }
      else $s("#ob-error").hidden = false;
    });
})();
