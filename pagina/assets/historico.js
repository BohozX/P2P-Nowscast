(() => {
  const REMOTO = "https://bohozx.github.io/Mercado-Cambiario/historico/";
  const LOCAL = "assets/historico/";
  const HISTORICO_P2PARMY = {
    es: {
      titulo: "Histórico desde marzo de 2023",
      alt: "Precio P2P diario del USDT en Binance, en bolivianos, desde el 17 de marzo de 2023: P2P Venta y P2P Compra.",
      fuente: {
        remoto: "Fuente: Binance P2P. Se actualiza cada día.",
        local: "Fuente: Binance P2P. Promedio de los mejores anuncios de seis métodos de pago a las 20:00 de cada día, del 17 de marzo de 2023 al 20 de agosto de 2026.",
      },
    },
    en: {
      titulo: "History since March 2023",
      alt: "Daily P2P price of USDT on Binance, in bolivianos, since March 17, 2023: P2P Sell and P2P Buy.",
      fuente: {
        remoto: "Source: Binance P2P. Updated daily.",
        local: "Source: Binance P2P. Average of the best ads across six payment methods at 20:00 each day, from March 17, 2023 to August 20, 2026.",
      },
    },
  };

  const img = document.getElementById("historico-img");
  if (!img) return;
  const fuentes = [...img.closest("picture").querySelectorAll("source")];
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  let base = REMOTO;
  let sinIngles = false;
  let variante = "es";

  const imagen = (ancho) => `${base}p2parmy-${ancho}${variante === "en" ? "-en" : ""}.png${base === REMOTO ? `?v=${dia}` : ""}`;

  function aplicar() {
    const textos = HISTORICO_P2PARMY[idioma === "en" ? "en" : "es"];
    variante = idioma === "en" && !sinIngles ? "en" : "es";
    document.getElementById("historico-titulo").textContent = textos.titulo;
    document.getElementById("historico-fuente").textContent = textos.fuente[base === REMOTO ? "remoto" : "local"];
    img.alt = textos.alt;
    fuentes.forEach((s) => { const ruta = imagen(s.dataset.ancho); if (s.getAttribute("srcset") !== ruta) s.setAttribute("srcset", ruta); });
    const ruta = imagen(img.dataset.ancho);
    if (img.getAttribute("src") !== ruta) img.setAttribute("src", ruta);
  }

  img.addEventListener("error", () => {
    if (base === REMOTO) {
      base = LOCAL;
      aplicar();
      return;
    }
    if (variante !== "en") return;
    sinIngles = true;
    aplicar();
  });
  addEventListener("idiomachange", aplicar);
  aplicar();
})();
