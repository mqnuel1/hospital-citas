/**
 * Lógica del Tótem de Autoservicio
 * Kiosco interactivo de confirmación de citas programadas
 */

let dniBuffer = "";
let autoResetTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  iniciarReloj();
  inicializarInputDni();
  volverAlDni();
});

function iniciarReloj() {
  const clockEl = document.getElementById("totem-clock");
  if (!clockEl) return;
  setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("es-PE", { hour12: false });
  }, 1000);
}

function cambiarVista(vistaId) {
  clearTimeout(autoResetTimer);
  const viewDni = document.getElementById("totem-view-dni");
  const viewTicket = document.getElementById("totem-view-ticket");

  if (viewDni) viewDni.style.display = "none";
  if (viewTicket) viewTicket.style.display = "none";

  const target = document.getElementById(vistaId);
  if (target) {
    target.style.display = "block";
  }

  // Si está en la pantalla de ticket, volver automáticamente a la pantalla de DNI en 15 segundos
  if (vistaId === "totem-view-ticket") {
    autoResetTimer = setTimeout(() => {
      volverAlDni();
    }, 15000);
  }
}

function volverAlDni() {
  limpiarDniInput();
  cambiarVista("totem-view-dni");
  setTimeout(() => {
    const input = document.getElementById("totem-dni-input");
    if (input) input.focus();
  }, 120);
}

function inicializarInputDni() {
  const input = document.getElementById("totem-dni-input");
  if (!input) return;

  // Filtrar estrictamente solo números en cualquier evento de entrada
  input.addEventListener("input", (e) => {
    let cleanVal = e.target.value.replace(/\D/g, "");
    if (cleanVal.length > 8) {
      cleanVal = cleanVal.slice(0, 8);
    }
    e.target.value = cleanVal;
    dniBuffer = cleanVal;
    actualizarEstadoDni(cleanVal);
  });

  // Prevenir caracteres no numéricos al presionar teclas en laptop/desktop
  input.addEventListener("keydown", (e) => {
    const allowedKeys = ["Backspace", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "Delete"];
    if (allowedKeys.includes(e.key)) {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmarDniTotem();
      }
      return;
    }
    // Permitir atajos con Ctrl/Cmd (copiar, pegar, seleccionar)
    if (e.ctrlKey || e.metaKey) return;

    // Si no es un dígito del 0 al 9, bloquearlo
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  });

  // Controlar pegado (paste) asegurando solo números de hasta 8 dígitos
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const cleanDigits = pasted.replace(/\D/g, "").slice(0, 8);
    input.value = cleanDigits;
    dniBuffer = cleanDigits;
    actualizarEstadoDni(cleanDigits);
  });
}

function actualizarEstadoDni(val) {
  const counter = document.getElementById("dni-counter");
  const helper = document.getElementById("dni-validation-msg");
  const clearBtn = document.getElementById("btn-limpiar-dni");
  const input = document.getElementById("totem-dni-input");
  const alertBox = document.getElementById("totem-alert-box");

  if (alertBox) {
    alertBox.style.display = "none";
  }

  if (clearBtn) {
    clearBtn.style.display = val.length > 0 ? "block" : "none";
  }

  if (counter) {
    if (val.length === 8) {
      counter.textContent = "8 / 8 dígitos completos";
      counter.className = "dni-counter-badge complete";
    } else {
      counter.textContent = `${val.length} / 8 dígitos`;
      counter.className = "dni-counter-badge";
    }
  }

  if (helper) {
    if (val.length === 0) {
      helper.textContent = "Ingrese los 8 números de su DNI registrado.";
      helper.className = "formal-helper-text";
      if (input) input.classList.remove("input-error");
    } else if (val.length < 8) {
      helper.textContent = `Faltan ${8 - val.length} dígito(s) para completar el DNI.`;
      helper.className = "formal-helper-text";
      if (input) input.classList.remove("input-error");
    } else {
      helper.textContent = "Documento completo. Presione 'Consultar Turno / Reimprimir Ticket' o presione Enter.";
      helper.className = "formal-helper-text";
      helper.style.color = "#059669";
      if (input) input.classList.remove("input-error");
    }
  }
}

function limpiarDniInput() {
  const input = document.getElementById("totem-dni-input");
  const alertBox = document.getElementById("totem-alert-box");
  if (alertBox) alertBox.style.display = "none";
  if (input) {
    input.value = "";
    input.classList.remove("input-error");
    input.focus();
  }
  dniBuffer = "";
  actualizarEstadoDni("");
}

async function confirmarDniTotem() {
  const input = document.getElementById("totem-dni-input");
  const dniVal = input ? input.value.trim() : dniBuffer.trim();

  const helper = document.getElementById("dni-validation-msg");
  const btnSubmit = document.getElementById("btn-confirmar-totem-dni");
  const alertBox = document.getElementById("totem-alert-box");
  const alertText = document.getElementById("totem-alert-text");

  if (alertBox) alertBox.style.display = "none";

  if (dniVal.length !== 8) {
    if (helper) {
      helper.textContent = "El DNI debe contener exactamente 8 dígitos numéricos.";
      helper.className = "formal-helper-text error";
    }
    if (input) {
      input.classList.add("input-error");
      input.focus();
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Buscando turno en sistema...";
  }

  try {
    const res = await fetch("/api/turnos/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dni: dniVal, tipo_origen: "TOTEM" })
    });

    const data = await res.json();
    if (data.success && data.turno) {
      if (alertBox) alertBox.style.display = "none";
      mostrarTicketTotem(data.turno);
    } else {
      const errorTexto = data.error || "No se encontró ninguna cita médica ni turno registrado para el DNI ingresado. Por favor acérquese a Ventanilla de Admisión o reserve su cita en el Portal Web.";
      if (alertBox && alertText) {
        alertText.textContent = errorTexto;
        alertBox.style.display = "block";
      }
      if (helper) {
        helper.textContent = errorTexto;
        helper.className = "formal-helper-text error";
      }
      if (input) {
        input.classList.add("input-error");
        input.focus();
      }
    }
  } catch (err) {
    console.error(err);
    const errConexion = "Error de conexión con el servidor. Intente nuevamente.";
    if (alertBox && alertText) {
      alertText.textContent = errConexion;
      alertBox.style.display = "block";
    }
    if (helper) {
      helper.textContent = errConexion;
      helper.className = "formal-helper-text error";
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Consultar Turno / Reimprimir Ticket";
    }
  }
}

function mostrarTicketTotem(turno) {
  document.getElementById("totem-res-turno").textContent = turno.numero_turno;
  document.getElementById("totem-res-consultorio").textContent = `${turno.consultorio} (${turno.especialidad})`;
  document.getElementById("totem-res-nombre").textContent = turno.paciente_nombre;
  document.getElementById("totem-res-dni").textContent = turno.dni;
  document.getElementById("totem-res-hora").textContent = turno.hora_emision;
  document.getElementById("totem-res-tiempo").textContent = `~${turno.tiempo_estimado_min} Minutos (${turno.turnos_delante} pacientes delante)`;

  cambiarVista("totem-view-ticket");
}
