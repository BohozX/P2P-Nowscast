const FLECHA_DESPLEGABLE = '<svg class="flecha" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9.5 6 6 6-6"/></svg>';
const DESPLEGABLES = [];

const escaparHtml = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function armarDesplegable(contenedor, opciones, leer, escribir) {
  const cara = document.createElement("button");
  const lista = document.createElement("div");
  cara.type = "button";
  cara.className = "sel-cara";
  cara.setAttribute("aria-haspopup", "listbox");
  cara.setAttribute("aria-expanded", "false");
  lista.className = "sel-lista";
  lista.setAttribute("role", "listbox");
  lista.hidden = true;
  contenedor.replaceChildren(cara, lista);

  const cerrar = () => {
    lista.hidden = true;
    cara.setAttribute("aria-expanded", "false");
  };
  const abrir = () => {
    DESPLEGABLES.forEach((d) => d.cerrar());
    lista.hidden = false;
    cara.setAttribute("aria-expanded", "true");
    (lista.querySelector('[aria-selected="true"]') || lista.firstElementChild)?.focus();
  };

  cara.addEventListener("click", (evento) => {
    evento.stopPropagation();
    if (lista.hidden) abrir(); else cerrar();
  });
  lista.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button[data-k]");
    if (!boton) return;
    evento.stopPropagation();
    cerrar();
    cara.focus();
    escribir(boton.dataset.k);
  });
  contenedor.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      cerrar();
      cara.focus();
      return;
    }
    if (lista.hidden) return;
    const botones = [...lista.querySelectorAll("button")];
    const i = botones.indexOf(document.activeElement);
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      botones[Math.min(i + 1, botones.length - 1)].focus();
    }
    if (evento.key === "ArrowUp") {
      evento.preventDefault();
      botones[Math.max(i - 1, 0)].focus();
    }
  });

  const sinc = () => {
    const actual = String(leer());
    let elegida = "";
    lista.innerHTML = opciones().map(([clave, texto, icono]) => {
      const es = String(clave) === actual;
      const cuerpo = `${icono ? `<span class="sel-ic">${icono}</span>` : ""}<span class="sel-txt">${escaparHtml(texto)}</span>`;
      if (es) elegida = cuerpo;
      return `<button type="button" role="option" data-k="${escaparHtml(clave)}" aria-selected="${es}">${cuerpo}</button>`;
    }).join("");
    cara.innerHTML = (elegida || '<span class="sel-txt">—</span>') + FLECHA_DESPLEGABLE;
  };

  const api = { cerrar, sinc };
  DESPLEGABLES.push(api);
  sinc();
  return api;
}

addEventListener("click", () => DESPLEGABLES.forEach((d) => d.cerrar()));
