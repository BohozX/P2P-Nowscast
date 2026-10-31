(() => {
  const seccion = document.getElementById("noticias");
  const pista = document.getElementById("titulares-pista");
  if (!seccion || !pista) return;
  const VELOCIDAD = 42;
  const NOMBRES = { "La Razon": "La Razón", "Vision 360": "Visión 360", "Opinion": "Opinión" };
  const nombre = (f) => NOMBRES[f] || f;
  const limpio = (t) => String(t).replace(/[<>&"]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[x]));

  function recientes(porDia) {
    const dias = Object.keys(porDia || {}).sort().reverse()
      .map((d) => (Array.isArray(porDia[d]) ? porDia[d] : []).filter((t) => t?.titulo).sort((a, b) => String(b.hora || "").localeCompare(String(a.hora || ""))))
      .filter((lista) => lista.length);
    const vistos = new Set();
    const lista = [];
    for (const t of dias[0]?.length >= 12 ? dias[0] : dias.flat()) {
      const clave = t.enlace || `${t.medio}|${t.titulo}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(t);
      if (lista.length === 40) break;
    }
    return lista;
  }

  function ocultar() {
    seccion.hidden = true;
    document.querySelectorAll('a[href="#noticias"]').forEach((a) => { a.hidden = true; });
  }

  function titulares(lista) {
    if (!lista.length) { ocultar(); return; }
    const uno = lista.map((t) => {
      const enlace = /^https:\/\//.test(t.enlace || "") ? ` href="${limpio(t.enlace)}" target="_blank" rel="noopener noreferrer"` : "";
      return `<a class="titular"${enlace}>${t.medio ? `<b>${limpio(nombre(t.medio))}</b>` : ""}${limpio(t.titulo)}</a>`;
    }).join("");
    pista.innerHTML = uno + uno;
    document.fonts.ready.then(() => { pista.style.animationDuration = `${(pista.scrollWidth / 2 / VELOCIDAD).toFixed(1)}s`; });
  }

  cargarDatos("noticias").then((d) => titulares(recientes(d?.titulares))).catch(ocultar);
})();
