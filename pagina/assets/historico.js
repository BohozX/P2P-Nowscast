(() => {
  const HISTORICO_P2PARMY = {
    es: {
      titulo: "Histórico desde marzo de 2023",
      alt: "Precio P2P del USDT en Binance según P2P Army, diario: P2P Venta de 7,09 Bs el 17 de marzo de 2023 a un máximo de 17,90 Bs el 15 de mayo de 2025 y 11,65 Bs el 20 de agosto de 2026; P2P Compra casi igual, de 7,04 a 17,82 y 11,61 Bs.",
      fuente: "Fuente: P2P Army. Binance P2P, promedio de los mejores anuncios de seis métodos de pago a las 20:00 de cada día, del 17 de marzo de 2023 al 20 de agosto de 2026. Desde el 21 de agosto, la serie diaria de arriba.",
      imagen: (ancho) => `assets/historico/p2parmy-${ancho}.png`,
    },
    en: {
      titulo: "History since March 2023",
      alt: "Daily P2P price of USDT on Binance according to P2P Army: P2P Sell from 7.09 Bs on March 17, 2023 to a high of 17.90 Bs on May 15, 2025 and 11.65 Bs on August 20, 2026; P2P Buy almost the same, from 7.04 to 17.82 and 11.61 Bs.",
      fuente: "Source: P2P Army. Binance P2P, average of the best ads across six payment methods at 20:00 each day, from March 17, 2023 to August 20, 2026. From August 21 on, the daily series above.",
      imagen: (ancho) => `assets/historico/p2parmy-${ancho}-en.png`,
    },
  };

  const img = document.getElementById("historico-img");
  if (!img) return;
  const fuentes = [...img.closest("picture").querySelectorAll("source")];
  let sinIngles = false;
  let variante = "es";

  function aplicar() {
    const textos = HISTORICO_P2PARMY[idioma === "en" ? "en" : "es"];
    variante = idioma === "en" && !sinIngles ? "en" : "es";
    const imagen = HISTORICO_P2PARMY[variante].imagen;
    document.getElementById("historico-titulo").textContent = textos.titulo;
    document.getElementById("historico-fuente").textContent = textos.fuente;
    img.alt = textos.alt;
    fuentes.forEach((s) => { const ruta = imagen(s.dataset.ancho); if (s.getAttribute("srcset") !== ruta) s.setAttribute("srcset", ruta); });
    const ruta = imagen(img.dataset.ancho);
    if (img.getAttribute("src") !== ruta) img.setAttribute("src", ruta);
  }

  img.addEventListener("error", () => {
    if (variante !== "en") return;
    sinIngles = true;
    aplicar();
  });
  addEventListener("idiomachange", aplicar);
  aplicar();
})();
