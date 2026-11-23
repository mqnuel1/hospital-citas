/**
 * Lógica de la Pantalla de Sala de Espera (Turnero en Vivo)
 * Con sintetizador de voz y actualización continua
 */

let ultimaClaveLlamado = "";
let inicializado = false;
let audioHabilitado = true;
let audioCtx = null;

document.addEventListener("DOMContentLoaded", () => {
  iniciarReloj();
  actualizarPantalla();
  setInterval(actualizarPantalla, 2500); // Polling cada 2.5 segundos
});

function iniciarReloj() {
  const clockEl = document.getElementById("tv-clock");
  const dateEl = document.getElementById("tv-date");

  const actualizar = () => {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString("es-PE", { hour12: false });
    }
    if (dateEl) {
      const opciones = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
      dateEl.textContent = now.toLocaleDateString("es-PE", opciones);
    }
  };

  actualizar();
  setInterval(actualizar, 1000);
}

function toggleAudio() {
  audioHabilitado = !audioHabilitado;
  const btn = document.getElementById("btn-audio");
  if (btn) {
    btn.textContent = audioHabilitado ? "Audio: Activo (Voz)" : "Audio: Silenciado";
    btn.style.opacity = audioHabilitado ? "1" : "0.6";
  }
}

// Reproducir tono de campana sutil usando Web Audio API sin archivos externos
function sonarCampana() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  } catch (e) {
    console.warn("Audio chime no disponible:", e);
  }
}

// Llamar al paciente por voz
function anunciarPorVoz(numeroTurno, consultorio) {
  if (!audioHabilitado) return;

  sonarCampana();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();

    setTimeout(() => {
      const partes = numeroTurno.split("-");
      let pronunciacionTurno = numeroTurno;
      if (partes.length === 2) {
        const digitos = partes[1].split("").join(" ");
        pronunciacionTurno = `Turno ${partes[0]}, ${digitos}`;
      }

      const texto = `${pronunciacionTurno}, pasar a ${consultorio}`;
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = "es-ES";
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    }, 450);
  }
}

async function actualizarPantalla() {
  try {
    const res = await fetch("/api/turnos/activos");
    const data = await res.json();
    if (!data.success) return;

    // Actualizar Turno Actual Llamado
    if (data.llamados && data.llamados.length > 0) {
      const actual = data.llamados[0];
      const box = document.getElementById("called-box");

      document.getElementById("screen-ticket-actual").textContent = actual.numero_turno;
      document.getElementById("screen-consultorio-actual").textContent = actual.consultorio;
      document.getElementById("screen-especialidad-actual").textContent = actual.especialidad_nombre;
      document.getElementById("screen-paciente-actual").textContent = `Paciente: ${actual.paciente_nombre}`;

      const claveActual = `${actual.id}_${actual.hora_llamado || ''}`;

      if (!inicializado) {
        // En la primera carga de la página, solo registrar el estado inicial sin emitir alarma
        inicializado = true;
        ultimaClaveLlamado = claveActual;
      } else if (claveActual !== ultimaClaveLlamado) {
        // Se detecta nuevo llamado o re-llamado (cambio de timestamp)
        ultimaClaveLlamado = claveActual;
        if (box) {
          box.classList.remove("anim-flash");
          void box.offsetWidth;
          box.classList.add("anim-flash");
        }
        anunciarPorVoz(actual.numero_turno, actual.consultorio);
      }
    } else {
      // Sala sin llamados activos (esperando llamado manual del médico)
      inicializado = true;
      ultimaClaveLlamado = "";
      document.getElementById("screen-ticket-actual").textContent = "---";
      document.getElementById("screen-consultorio-actual").textContent = "Sala en Espera";
      document.getElementById("screen-especialidad-actual").textContent = "Atención Activa";
      document.getElementById("screen-paciente-actual").textContent = "Esperando siguiente llamado";
    }

    // Actualizar Lista de Turnos en Espera
    const listContainer = document.getElementById("screen-waiting-list");
    const countEl = document.getElementById("screen-count-espera");
    if (listContainer && data.en_espera) {
      countEl.textContent = `${data.en_espera.length} pacientes`;

      if (data.en_espera.length === 0) {
        listContainer.innerHTML = "<div style='color: #64748b; padding: 1rem; text-align: center;'>No hay pacientes en cola de espera en este momento.</div>";
      } else {
        listContainer.innerHTML = "";
        data.en_espera.slice(0, 7).forEach((t, index) => {
          const item = document.createElement("div");
          item.className = "waiting-item";
          const tiempoEst = Math.max(5, (index + 1) * 12);
          item.innerHTML = `
            <div>
              <div class="item-ticket">${t.numero_turno}</div>
              <div class="item-spec">${t.especialidad_nombre} (${t.consultorio})</div>
            </div>
            <div style="text-align: right;">
              <span class="item-time">~${tiempoEst} min</span>
              <div style="font-size: 0.75rem; color: #64748b;">${t.tipo_origen}</div>
            </div>
          `;
          listContainer.appendChild(item);
        });
      }
    }

  } catch (err) {
    console.error("Error al actualizar pantalla:", err);
  }
}
