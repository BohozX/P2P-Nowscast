const MODO_DATOS = "produccion";

const RUTAS_DATOS = {
  prueba: {
    p2p: (activo, lado, frecuencia) => `data/${activo}/${lado}/${frecuencia}.json`,
    plataforma: (activo, lado, plataforma, frecuencia) => `data/${activo}/${lado}/plataformas/${plataforma}/${frecuencia}.json`,
    mediana: (activo, frecuencia, mes) => mes ? `data/${activo}/mediana/${frecuencia}/${mes}.json` : `data/${activo}/mediana/${frecuencia}.json`,
    participacion: (activo) => `data/${activo}/participacion.json`,
    top5: () => "datos-mc/top5.json",
    operaciones: () => "datos-mc/bancos_bcb.json",
    reservas: () => "datos-mc/reservas.json",
    noticias: () => "datos-mc/cambiario.json",
    tco: () => "https://raw.githubusercontent.com/BohozX/TCO-BCB/main/datos/tco.csv",
    bancos: () => "https://raw.githubusercontent.com/BohozX/TC-BANCOS/main/ultimos_30_dias.csv",
  },
  produccion: {
    p2p: (activo, lado, frecuencia) => `data/${activo}/${lado}/${frecuencia}.json`,
    plataforma: (activo, lado, plataforma, frecuencia) => `data/${activo}/${lado}/plataformas/${plataforma}/${frecuencia}.json`,
    mediana: (activo, frecuencia, mes) => mes ? `data/${activo}/mediana/${frecuencia}/${mes}.json` : `data/${activo}/mediana/${frecuencia}.json`,
    participacion: (activo) => `data/${activo}/participacion.json`,
    top5: () => "data/USDT/observado/top5.json",
    operaciones: () => "https://bohozx.github.io/Mercado-Cambiario/bancos_bcb.json",
    reservas: () => "https://bohozx.github.io/Mercado-Cambiario/reservas.json",
    noticias: () => "https://raw.githubusercontent.com/BohozX/Indices-de-Incertidumbre/main/cambiario.json",
    tco: () => "https://raw.githubusercontent.com/BohozX/TCO-BCB/main/datos/tco.csv",
    bancos: () => "https://raw.githubusercontent.com/BohozX/TC-BANCOS/main/ultimos_30_dias.csv",
  },
};

const rutaDatos = (nombre, ...partes) => RUTAS_DATOS[MODO_DATOS][nombre](...partes);

async function cargarDatos(nombre, partes = [], formato = "json") {
  const respuesta = await fetch(`${rutaDatos(nombre, ...partes)}?v=${Date.now()}`, { cache: "no-store" });
  if (!respuesta.ok) throw Object.assign(new Error(nombre), { estado: respuesta.status });
  return formato === "texto" ? respuesta.text() : respuesta.json();
}
