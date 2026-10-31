(() => {
  const lienzo = document.getElementById("portada-red");
  const zona = document.getElementById("portada");
  if (!lienzo || !zona || !lienzo.getContext) return;
  const c = lienzo.getContext("2d");
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VERDE = "53,224,139", CELESTE = "70,200,234";
  const ALTO_CINTA = 44, ESTIRA = 1.6, FRANJA_CINTA = ALTO_CINTA * ESTIRA;
  const DIBUJO = 2.4, VUELTA = 18, ENLACE = 120;

  let ancho = 0, alto = 0, arriba = 0, abajo = 0, dpr = 1;
  let nodos = [];
  let serie = null, geo = null, inicio = 0, pendiente = 0;
  let fondo = null, capa = null, cinta = null, cintaAncho = 0;
  const raton = { x: -9999, y: -9999, fuerza: 0, dentro: false };

  const lienzoNuevo = (w, h) => {
    const l = document.createElement("canvas");
    l.width = Math.max(1, Math.round(w * dpr)); l.height = Math.max(1, Math.round(h * dpr));
    const k = l.getContext("2d");
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [l, k];
  };

  function medir() {
    const r = zona.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    ancho = r.width; alto = r.height;
    lienzo.width = Math.max(1, Math.round(ancho * dpr));
    lienzo.height = Math.max(1, Math.round(alto * dpr));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    arriba = FRANJA_CINTA + 8;
    abajo = alto - FRANJA_CINTA - 8;
  }

  function armarFondo() {
    const [l, k] = lienzoNuevo(ancho, alto);
    const g = k.createRadialGradient(ancho * .5, alto * .45, 0, ancho * .5, alto * .45, Math.max(ancho, alto) * .7);
    g.addColorStop(0, "#03150d");
    g.addColorStop(1, "#000000");
    k.fillStyle = g; k.fillRect(0, 0, ancho, alto);
    fondo = l;
  }

  function armarCinta() {
    const paso = 13;
    cintaAncho = Math.max(paso * 2, Math.ceil(ancho / paso + 2) * paso);
    const base = document.createElement("canvas");
    base.width = cintaAncho; base.height = ALTO_CINTA;
    const k = base.getContext("2d");
    k.font = '11px "Geist Mono", ui-monospace, monospace';
    k.fillStyle = "#bff7d9";
    for (let f = 0; f < 3; f += 1)
      for (let x = 0; x < cintaAncho; x += paso)
        k.fillText(Math.random() < .5 ? "0" : "1", x, 12 + f * 14);
    const [l, e] = lienzoNuevo(cintaAncho, FRANJA_CINTA);
    e.globalAlpha = .5;
    e.drawImage(base, 0, 0, cintaAncho, FRANJA_CINTA);
    cinta = l;
  }

  function armarNodos() {
    const n = Math.round(Math.min(110, Math.max(48, ancho / 13)));
    nodos = Array.from({ length: n }, () => ({
      x: Math.random() * ancho,
      y: arriba + 10 + Math.random() * (abajo - arriba - 20),
      vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .16,
      r: 1.1 + Math.random() * 1.2,
    }));
  }

  function trazo(k, clave) {
    k.beginPath();
    let abierto = false;
    serie.puntos.forEach((q, i) => {
      const v = q[clave];
      if (v == null) { abierto = false; return; }
      if (abierto) k.lineTo(geo.x(i), geo.y(v)); else { k.moveTo(geo.x(i), geo.y(v)); abierto = true; }
    });
  }

  function armarCapa() {
    capa = null; geo = null;
    if (!serie || !ancho) return;
    const v = serie.puntos.flatMap((q) => [q.venta, q.compra, q.oficial]).filter((x) => x != null);
    let lo = Math.min(...v), hi = Math.max(...v);
    const m = (hi - lo || .1) * .18;
    lo -= m; hi += m;
    const h = abajo - arriba, y0 = arriba + h * .2, y1 = abajo - h * .1;
    const n = serie.puntos.length;
    const margen = Math.min(60, ancho * .04);
    geo = {
      x: (i) => margen + (i / Math.max(1, n - 1)) * (ancho - 2 * margen),
      y: (val) => y1 - ((val - lo) / (hi - lo)) * (y1 - y0),
    };
    const [l, k] = lienzoNuevo(ancho, alto);
    k.beginPath();
    serie.puntos.forEach((q, i) => { if (q.venta != null) k.lineTo(geo.x(i), geo.y(q.venta)); });
    for (let i = n - 1; i >= 0; i -= 1) { const q = serie.puntos[i]; if (q.oficial != null) k.lineTo(geo.x(i), geo.y(q.oficial)); }
    k.closePath();
    k.fillStyle = `rgba(${VERDE},.05)`;
    k.fill();
    k.setLineDash([6, 5]);
    k.lineWidth = 1.2;
    k.strokeStyle = "rgba(255,255,255,.26)";
    trazo(k, "oficial"); k.stroke();
    k.setLineDash([]);
    k.lineJoin = "round";
    [["compra", CELESTE], ["venta", VERDE]].forEach(([clave, color]) => {
      k.shadowBlur = 14;
      k.shadowColor = `rgba(${color},.9)`;
      k.strokeStyle = `rgba(${color},.62)`;
      k.lineWidth = 1.8;
      trazo(k, clave); k.stroke();
      k.shadowBlur = 0;
      k.fillStyle = `rgba(${color},.85)`;
      k.beginPath();
      serie.puntos.forEach((q, i) => { if (q[clave] != null) { k.moveTo(geo.x(i) + 2, geo.y(q[clave])); k.arc(geo.x(i), geo.y(q[clave]), 2, 0, 6.283); } });
      k.fill();
    });
    capa = l;
  }

  function armar() {
    medir();
    armarFondo();
    armarCinta();
    armarNodos();
    armarCapa();
  }

  function mover(dt) {
    nodos.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      if (p.x > ancho) { p.x = ancho; p.vx *= -1; }
      if (p.y < arriba) { p.y = arriba; p.vy *= -1; }
      if (p.y > abajo) { p.y = abajo; p.vy *= -1; }
    });
  }

  function dibujarSerie(t) {
    if (!capa) return;
    const avance = quieto ? 1 : Math.min(1, (t - inicio) / DIBUJO);
    const w = Math.max(1, ancho * avance);
    c.drawImage(capa, 0, 0, w * dpr, alto * dpr, 0, 0, w, alto);
    if (avance < 1 || quieto) return;
    const n = serie.puntos.length;
    const fase = ((((t - inicio - DIBUJO) % VUELTA) + VUELTA) % VUELTA) / VUELTA;
    const x = geo.x(0) + (geo.x(n - 1) - geo.x(0)) * fase;
    const luz = c.createLinearGradient(x - 70, 0, x, 0);
    luz.addColorStop(0, `rgba(${VERDE},0)`);
    luz.addColorStop(1, `rgba(${VERDE},.09)`);
    c.fillStyle = luz;
    c.fillRect(x - 70, arriba, 70, abajo - arriba);
    c.strokeStyle = `rgba(${VERDE},.35)`;
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, arriba); c.lineTo(x, abajo); c.stroke();
  }

  function enlaces() {
    const grupos = [[], [], []];
    for (let i = 0; i < nodos.length; i += 1) {
      const p = nodos[i];
      for (let j = i + 1; j < nodos.length; j += 1) {
        const q = nodos[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        if (dx > ENLACE || dx < -ENLACE || dy > ENLACE || dy < -ENLACE) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > ENLACE * ENLACE) continue;
        grupos[d2 < 1600 ? 0 : d2 < 6400 ? 1 : 2].push(p.x, p.y, q.x, q.y);
      }
    }
    c.lineWidth = 1;
    [.12, .08, .04].forEach((alfa, g) => {
      const v = grupos[g];
      if (!v.length) return;
      c.strokeStyle = `rgba(190,240,215,${alfa})`;
      c.beginPath();
      for (let k = 0; k < v.length; k += 4) { c.moveTo(v[k], v[k + 1]); c.lineTo(v[k + 2], v[k + 3]); }
      c.stroke();
    });
    if (raton.fuerza > .01) {
      c.strokeStyle = `rgba(${VERDE},${.28 * raton.fuerza})`;
      c.beginPath();
      nodos.forEach((p) => {
        const dx = raton.x - p.x, dy = raton.y - p.y;
        if (dx * dx + dy * dy < 170 * 170) { c.moveTo(p.x, p.y); c.lineTo(raton.x, raton.y); }
      });
      c.stroke();
    }
  }

  function cuadro(t, dt) {
    if (fondo) c.drawImage(fondo, 0, 0, ancho, alto); else c.clearRect(0, 0, ancho, alto);
    if (cinta) {
      const c1 = -((t * 9) % cintaAncho), c2 = ((t * 6) % cintaAncho) - cintaAncho;
      c.drawImage(cinta, c1, 3, cintaAncho, FRANJA_CINTA);
      c.drawImage(cinta, c1 + cintaAncho, 3, cintaAncho, FRANJA_CINTA);
      c.drawImage(cinta, c2, alto - FRANJA_CINTA, cintaAncho, FRANJA_CINTA);
      c.drawImage(cinta, c2 + cintaAncho, alto - FRANJA_CINTA, cintaAncho, FRANJA_CINTA);
    }

    if (!quieto) mover(dt);
    enlaces();
    dibujarSerie(t);

    c.fillStyle = "rgba(200,245,222,.42)";
    c.beginPath();
    nodos.forEach((p) => { c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 6.283); });
    c.fill();

    if (raton.fuerza > .01) {
      const halo = c.createRadialGradient(raton.x, raton.y, 0, raton.x, raton.y, 180);
      halo.addColorStop(0, `rgba(${VERDE},${.12 * raton.fuerza})`);
      halo.addColorStop(1, `rgba(${VERDE},0)`);
      c.fillStyle = halo;
      c.fillRect(raton.x - 180, raton.y - 180, 360, 360);
    }
  }

  let lazo = 0, previo = 0, visible = true;
  function paso(ahora) {
    const dt = Math.min(.05, (ahora - (previo || ahora)) / 1000);
    previo = ahora;
    raton.fuerza += ((raton.dentro ? 1 : 0) - raton.fuerza) * .08;
    cuadro(ahora / 1000, dt * 60);
    lazo = requestAnimationFrame(paso);
  }
  const andar = () => { if (!lazo && !quieto) { previo = 0; lazo = requestAnimationFrame(paso); } };
  const parar = () => { if (lazo) { cancelAnimationFrame(lazo); lazo = 0; } };
  const decidir = () => (visible && !document.hidden ? andar() : parar());

  zona.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = zona.getBoundingClientRect();
    raton.x = e.clientX - r.left; raton.y = e.clientY - r.top; raton.dentro = true;
  });
  zona.addEventListener("pointerleave", () => { raton.dentro = false; });
  if ("IntersectionObserver" in window) new IntersectionObserver((f) => { visible = f[0].isIntersecting; decidir(); }).observe(zona);
  document.addEventListener("visibilitychange", decidir);
  let medida = "";
  const rehacer = () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      const r = zona.getBoundingClientRect();
      const clave = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (clave === medida) return;
      medida = clave;
      armar();
      if (quieto) cuadro(0, 0);
    }, 150);
  };
  addEventListener("resize", rehacer);
  if ("ResizeObserver" in window) new ResizeObserver(rehacer).observe(zona);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ancho) armarCinta(); });

  let precio, signo, dia, cargados = null;
  const prepararFormatos = () => {
    const regional = configuracionRegional();
    precio = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    signo = new Intl.NumberFormat(regional, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
    dia = new Intl.DateTimeFormat(regional, { timeZone: "UTC", day: "2-digit", month: "short" });
  };
  prepararFormatos();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const rotulo = (iso) => dia.format(new Date(`${iso}T12:00:00Z`));
  const poner = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };

  function leerOficial(texto) {
    const lineas = texto.trim().split(/\r?\n/);
    const cab = lineas[0].split(",").map((s) => s.trim());
    const iV = cab.indexOf("vigencia"), iC = cab.indexOf("tco_compra");
    const mapa = new Map();
    lineas.slice(1).forEach((l) => {
      const x = l.split(",");
      const v = (x[iV] || "").trim();
      if (v) mapa.set(v, x[iC] === "" ? null : Number(x[iC]));
    });
    return mapa;
  }

  const ultimo = (pts) => [...pts].reverse().find((p) => p.vwap_bob != null) || null;
  const oficialDe = (oficial, d) => {
    if (!oficial) return null;
    const previas = [...oficial.keys()].filter((f) => f <= d).sort();
    return previas.length ? oficial.get(previas.at(-1)) : null;
  };

  function cifras(dVenta, dCompra, oficial) {
    const v = ultimo(dVenta.points || []), q = ultimo(dCompra.points || []);
    const nota = (p) => (p ? traducir(p.timestamp_bo.slice(0, 10) === hoy ? "Bs. · hoy, {fecha}" : "Bs. · {fecha}", { fecha: rotulo(p.timestamp_bo.slice(0, 10)) }) : "");
    poner("c-venta", v ? precio.format(v.vwap_bob) : "—");
    poner("c-venta-nota", nota(v));
    poner("c-compra", q ? precio.format(q.vwap_bob) : "—");
    poner("c-compra-nota", nota(q));
    const fechas = oficial ? [...oficial.keys()].filter((f) => f <= hoy).sort() : [];
    const vig = fechas.length ? oficial.get(fechas.at(-1)) : null;
    poner("c-oficial", vig != null ? precio.format(vig) : "—");
    poner("c-oficial-nota", vig != null ? traducir("BCB · vigente {fecha}", { fecha: rotulo(fechas.at(-1)) }) : "");
    const brecha = document.getElementById("c-brecha");
    if (brecha && v && vig) {
      brecha.textContent = signo.format(((v.vwap_bob - vig) / vig) * 100);
      const pct = document.createElement("small");
      pct.textContent = "%";
      brecha.append(pct);
    }
  }

  function armarSerie(dVenta, dCompra, oficial) {
    const compra = new Map((dCompra.points || []).map((p) => [p.timestamp_utc, p]));
    const puntos = (dVenta.points || []).map((p) => {
      const q = compra.get(p.timestamp_utc);
      const o = oficialDe(oficial, p.timestamp_bo.slice(0, 10));
      return {
        venta: p.vwap_bob ?? null, compra: q ? q.vwap_bob ?? null : null, oficial: o ?? null,
      };
    });
    if (puntos.length < 2) return null;
    return { puntos };
  }

  addEventListener("idiomachange", () => {
    prepararFormatos();
    if (cargados) cifras(...cargados);
  });

  Promise.allSettled([
    cargarDatos("p2p", ["USDT", "compra", "1d"]), cargarDatos("p2p", ["USDT", "venta", "1d"]),
    cargarDatos("tco", [], "texto"),
  ]).then(([dV, dC, o]) => {
    const oficial = o.status === "fulfilled" ? leerOficial(o.value) : null;
    if (dV.status === "fulfilled" && dC.status === "fulfilled") {
      cargados = [dV.value, dC.value, oficial];
      cifras(dV.value, dC.value, oficial);
      serie = armarSerie(dV.value, dC.value, oficial);
      armarCapa();
    }
    inicio = performance.now() / 1000;
    if (quieto) cuadro(0, 0);
  });

  armar();
  medida = `${Math.round(ancho)}x${Math.round(alto)}`;
  inicio = performance.now() / 1000;
  if (quieto) cuadro(0, 0); else decidir();
})();
