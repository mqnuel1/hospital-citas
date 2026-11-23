/**
 * Lógica del Portal del Paciente - Hospital Nacional
 * Gestión de Citas y Colas Virtuales
 */

// Desactivar de forma definitiva cualquier popup nativo alert() del navegador ("localhost dice")
window.alert = function(msg) {
  console.warn("Aviso bloqueado para evitar popup:", msg);
};

let especialidadesDisponibles = [];
let especialidadSeleccionada = null;
let horarioSeleccionado = null;
let citaConfirmadaActual = null;

document.addEventListener("DOMContentLoaded", () => {
  inicializarFecha();
  cargarEspecialidades();
  cargarMetricasHero();
  inicializarFiltrosNumericos();
  inicializarLimpiezaErroresEnInputs();
  inicializarNavegacionNavbar();
});

function inicializarNavegacionNavbar() {
  const enlaces = document.querySelectorAll(".nav-links a[href^='#'], .brand[href^='#'], .hero a[href^='#'], .footer-col a[href^='#']");
  const navbar = document.querySelector("header.navbar");

  enlaces.forEach(link => {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;

      // Si es Inicio o marca del hospital, llevar al tope absoluto de la página
      if (targetId === "#inicio") {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });

        document.querySelectorAll(".nav-links a").forEach(l => l.classList.remove("active"));
        const navMatch = document.querySelector(".nav-links a[href='#inicio']");
        if (navMatch) navMatch.classList.add("active");

        if (window.history && window.history.pushState) {
          window.history.pushState(null, null, "#inicio");
        }
        return;
      }

      if (targetId === "#sacar-cita" && citaConfirmadaActual) {
        reiniciarFormulario();
      }

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const navHeight = navbar ? navbar.offsetHeight : 62;
        const targetPos = targetEl.getBoundingClientRect().top + window.pageYOffset - navHeight - 15;

        window.scrollTo({
          top: Math.max(0, targetPos),
          behavior: "smooth"
        });

        document.querySelectorAll(".nav-links a").forEach(l => l.classList.remove("active"));
        const navMatch = document.querySelector(`.nav-links a[href='${targetId}']`);
        if (navMatch) navMatch.classList.add("active");

        if (window.history && window.history.pushState) {
          window.history.pushState(null, null, targetId);
        }
      }
    });
  });

  const secciones = document.querySelectorAll("section[id]");
  window.addEventListener("scroll", () => {
    // Si el usuario está en la parte superior, activar Inicio
    if (window.pageYOffset < 150) {
      document.querySelectorAll(".nav-links a").forEach(l => l.classList.remove("active"));
      const inicioLink = document.querySelector(".nav-links a[href='#inicio']");
      if (inicioLink) inicioLink.classList.add("active");
      return;
    }

    const navbarHeight = navbar ? navbar.offsetHeight : 62;
    const scrollPos = window.pageYOffset + navbarHeight + 80;

    secciones.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute("id");

      if (id !== "hero" && id !== "inicio" && scrollPos >= top && scrollPos < top + height) {
        document.querySelectorAll(".nav-links a").forEach(l => l.classList.remove("active"));
        const activeLink = document.querySelector(`.nav-links a[href='#${id}']`);
        if (activeLink) activeLink.classList.add("active");
      }
    });
  }, { passive: true });
}

function marcarCampoInvalido(inputElement, mensajeError) {
  if (!inputElement) return;
  inputElement.classList.add("input-error");

  // Forzar reinicio de animación de vibración (shake)
  inputElement.classList.remove("field-shake");
  void inputElement.offsetWidth;
  inputElement.classList.add("field-shake");

  // Crear o actualizar mensaje de error debajo del input
  let msgContainer = inputElement.parentElement.querySelector(".field-error-msg");
  if (!msgContainer) {
    msgContainer = document.createElement("span");
    msgContainer.className = "field-error-msg";
    inputElement.parentElement.appendChild(msgContainer);
  }
  msgContainer.textContent = mensajeError;
  msgContainer.style.display = "block";

  // Ocultar texto de ayuda secundario para evitar saturar el espacio
  const helpText = inputElement.parentElement.querySelector(".help-text");
  if (helpText) helpText.style.display = "none";
}

function limpiarCampoInvalido(inputElement) {
  if (!inputElement) return;
  inputElement.classList.remove("input-error", "field-shake");
  const msgContainer = inputElement.parentElement.querySelector(".field-error-msg");
  if (msgContainer) msgContainer.style.display = "none";
  const helpText = inputElement.parentElement.querySelector(".help-text");
  if (helpText) helpText.style.display = "block";
}

function inicializarLimpiezaErroresEnInputs() {
  const campos = ["paciente-dni", "paciente-nombres", "paciente-apellidos", "paciente-telefono", "paciente-correo", "cita-fecha"];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => limpiarCampoInvalido(el));
      el.addEventListener("change", () => limpiarCampoInvalido(el));
    }
  });
}

let pacienteRegistradoActual = null;
let citaActivaDetectada = null;

async function verificarDniPaciente(dni) {
  const avisoBox = document.getElementById("paciente-dni-aviso");
  try {
    const res = await fetch(`/api/pacientes/verificar?dni=${dni}`);
    const data = await res.json();
    if (!data.success) return;

    const nombresInput = document.getElementById("paciente-nombres");
    const apellidosInput = document.getElementById("paciente-apellidos");
    const telInput = document.getElementById("paciente-telefono");
    const correoInput = document.getElementById("paciente-correo");
    const edadInput = document.getElementById("paciente-edad");
    const seguroInput = document.getElementById("paciente-seguro");

    if (data.registrado && data.paciente) {
      pacienteRegistradoActual = data.paciente;
      if (nombresInput) {
        nombresInput.value = data.paciente.nombres;
        nombresInput.readOnly = true;
        nombresInput.style.backgroundColor = "#f1f5f9";
        nombresInput.style.cursor = "not-allowed";
        limpiarCampoInvalido(nombresInput);
      }
      if (apellidosInput) {
        apellidosInput.value = data.paciente.apellidos;
        apellidosInput.readOnly = true;
        apellidosInput.style.backgroundColor = "#f1f5f9";
        apellidosInput.style.cursor = "not-allowed";
        limpiarCampoInvalido(apellidosInput);
      }
      if (telInput && !telInput.value) telInput.value = data.paciente.telefono || "";
      if (correoInput && !correoInput.value) correoInput.value = data.paciente.correo || "";
      if (edadInput && data.paciente.edad) edadInput.value = data.paciente.edad;
      if (seguroInput && data.paciente.seguro) seguroInput.value = data.paciente.seguro;
    } else {
      restablecerCamposPacienteSiCambiaDni();
    }

    if (avisoBox) {
      if (data.cita_activa) {
        citaActivaDetectada = data.cita_activa;
        const c = data.cita_activa;
        avisoBox.style.display = "block";
        avisoBox.style.background = "#fffbeb";
        avisoBox.style.border = "1px solid #fcd34d";
        avisoBox.style.color = "#92400e";
        avisoBox.style.padding = "12px 16px";
        avisoBox.style.borderRadius = "10px";
        avisoBox.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 4px;">Cita activa detectada en el hospital:</div>
          <div>Cuentas con una cita de <strong>${c.especialidad_nombre}</strong> (${c.codigo_cita}) programada para el <strong>${c.fecha} a las ${c.hora}</strong> en <strong>${c.consultorio}</strong> ${c.numero_turno ? `(Turno: <strong>${c.numero_turno}</strong>)` : ""}.</div>
          <div style="margin-top: 6px; font-size: 0.82rem; color: #78350f;">
            Al confirmar esta nueva reserva, tu cita anterior quedará <strong>anulada automáticamente</strong> y pasarás a esperar con un <strong>nuevo turno al final de la cola</strong>.
          </div>
        `;
      } else if (data.registrado) {
        avisoBox.style.display = "block";
        avisoBox.style.background = "#f0fdf4";
        avisoBox.style.border = "1px solid #bbf7d0";
        avisoBox.style.color = "#166534";
        avisoBox.style.padding = "10px 14px";
        avisoBox.style.borderRadius = "10px";
        avisoBox.innerHTML = `
          <strong>Titular Registrado:</strong> Datos de identidad asociados al DNI ${dni} validados en el sistema.
        `;
      } else {
        avisoBox.style.display = "none";
        avisoBox.innerHTML = "";
      }
    }
  } catch (err) {
    console.warn("Error al verificar DNI:", err);
  }
}

function restablecerCamposPacienteSiCambiaDni() {
  pacienteRegistradoActual = null;
  citaActivaDetectada = null;
  const nombresInput = document.getElementById("paciente-nombres");
  const apellidosInput = document.getElementById("paciente-apellidos");
  if (nombresInput && nombresInput.readOnly) {
    nombresInput.readOnly = false;
    nombresInput.style.backgroundColor = "";
    nombresInput.style.cursor = "";
  }
  if (apellidosInput && apellidosInput.readOnly) {
    apellidosInput.readOnly = false;
    apellidosInput.style.backgroundColor = "";
    apellidosInput.style.cursor = "";
  }
  const avisoBox = document.getElementById("paciente-dni-aviso");
  if (avisoBox) {
    avisoBox.style.display = "none";
    avisoBox.innerHTML = "";
  }
}

function inicializarFiltrosNumericos() {
  const dniInput = document.getElementById("paciente-dni");
  if (dniInput) {
    dniInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
      if (e.target.value.length === 8) {
        verificarDniPaciente(e.target.value);
      } else {
        restablecerCamposPacienteSiCambiaDni();
      }
    });
    dniInput.addEventListener("change", (e) => {
      if (e.target.value.length === 8) {
        verificarDniPaciente(e.target.value);
      }
    });
  }
  const telInput = document.getElementById("paciente-telefono");
  if (telInput) {
    telInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 9);
    });
  }
}

// Inicializar selector de fecha con fecha mínima hoy en hora local
function inicializarFecha() {
  const inputFecha = document.getElementById("cita-fecha");
  if (!inputFecha) return;
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hoy = `${year}-${month}-${day}`;
  inputFecha.min = hoy;
  inputFecha.value = hoy;
}

// Cargar métricas en vivo en la cabecera
async function cargarMetricasHero() {
  try {
    const res = await fetch("/api/metricas");
    const data = await res.json();
    if (data.success) {
      const elRed = document.getElementById("stat-reduccion");
      const elAtend = document.getElementById("stat-atendidos");
      if (elRed) elRed.textContent = `-${data.reduccion_tiempo_espera_pct}%`;
      if (elAtend) elAtend.textContent = `${data.total_atendidos + 150}+`;
    }
  } catch (err) {
    console.warn("No se pudieron cargar métricas de cabecera:", err);
  }
}

// Cargar especialidades desde la API
async function cargarEspecialidades() {
  try {
    const res = await fetch("/api/especialidades");
    const data = await res.json();
    if (data.success && data.especialidades.length > 0) {
      especialidadesDisponibles = data.especialidades;
      renderizarEspecialidades();
    }
  } catch (err) {
    console.error("Error al obtener especialidades:", err);
  }
}

function renderizarEspecialidades() {
  const container = document.getElementById("specialties-container");
  if (!container) return;
  container.innerHTML = "";

  // Orden oficial hospitalario con Medicina General siempre al inicio
  const ordenDeseado = ["MED_GEN", "PED", "GIN", "CAR", "TRA", "NEU", "OFT", "DER"];
  especialidadesDisponibles.sort((a, b) => {
    let idxA = ordenDeseado.indexOf(a.codigo);
    let idxB = ordenDeseado.indexOf(b.codigo);
    if (idxA === -1) idxA = 99;
    if (idxB === -1) idxB = 99;
    return idxA - idxB;
  });

  especialidadesDisponibles.forEach((esp, idx) => {
    const card = document.createElement("div");
    card.className = `spec-option ${idx === 0 ? "selected" : ""}`;
    card.onclick = () => seleccionarEspecialidad(esp.codigo, card);
    card.innerHTML = `
      <h4>${esp.nombre}</h4>
      <p>${esp.descripcion}</p>
      <div class="doc-name">Responsable: ${esp.medico_responsable}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Ubicación: ${esp.consultorio_default} | Estimado: ~${esp.duracion_estimada_min} min</div>
    `;
    container.appendChild(card);

    if (idx === 0) {
      especialidadSeleccionada = esp;
    }
  });

  actualizarLabelEspecialidad();
}

function seleccionarEspecialidad(codigo, cardElement) {
  document.querySelectorAll(".spec-option").forEach(el => el.classList.remove("selected"));
  cardElement.classList.add("selected");
  especialidadSeleccionada = especialidadesDisponibles.find(e => e.codigo === codigo);
  actualizarLabelEspecialidad();
  cargarHorariosDisponibles();
}

function actualizarLabelEspecialidad() {
  const lbl = document.getElementById("label-especialidad-seleccionada");
  if (lbl && especialidadSeleccionada) {
    lbl.textContent = `Especialidad: ${especialidadSeleccionada.nombre} (${especialidadSeleccionada.consultorio_default})`;
  }
}

// Cargar los horarios disponibles para la especialidad y fecha
async function cargarHorariosDisponibles() {
  const fecha = document.getElementById("cita-fecha")?.value;
  const espCod = especialidadSeleccionada ? especialidadSeleccionada.codigo : "MED_GEN";
  const container = document.getElementById("slots-container");
  if (!container || !fecha) return;

  container.innerHTML = "<div style='color: var(--text-muted); padding: 1rem;'>Consultando disponibilidad...</div>";

  try {
    const res = await fetch(`/api/horarios-disponibles?especialidad=${espCod}&fecha=${fecha}`);
    const data = await res.json();
    container.innerHTML = "";
    horarioSeleccionado = null;

    if (!data.horarios || data.horarios.length === 0) {
      container.innerHTML = "<p style='color: var(--danger);'>No hay horarios configurados en la fecha seleccionada.</p>";
      return;
    }

    let hayDisponibles = false;
    data.horarios.forEach((item) => {
      const slot = document.createElement("div");
      slot.className = `time-slot ${!item.disponible ? "disabled" : ""}`;
      slot.textContent = item.hora;
      if (!item.disponible && item.motivo) {
        slot.title = item.motivo;
      }

      if (item.disponible) {
        hayDisponibles = true;
        slot.onclick = () => {
          document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
          slot.classList.add("selected");
          horarioSeleccionado = item.hora;
        };
        // Preseleccionar automáticamente el primer horario futuro disponible
        if (!horarioSeleccionado) {
          slot.classList.add("selected");
          horarioSeleccionado = item.hora;
        }
      }

      container.appendChild(slot);
    });

    if (!hayDisponibles) {
      container.innerHTML = "<p style='color: var(--danger); padding: 0.75rem; background: #fee2e2; border-radius: 8px;'>No quedan horarios disponibles para la fecha seleccionada (los horarios ya han transcurrido o están reservados). Por favor seleccione otra fecha.</p>";
    }
  } catch (err) {
    console.error("Error al cargar horarios:", err);
    container.innerHTML = "<p style='color: var(--danger);'>Error al consultar los horarios con el servidor.</p>";
  }
}

// Navegación entre pasos del Wizard
function irPaso(numero) {
  // Validación interactiva al salir del paso 1
  if (numero === 2) {
    let primerInvalido = null;
    let hayErrores = false;

    // 1. DNI (Exactamente 8 dígitos numéricos)
    const dniInput = document.getElementById("paciente-dni");
    const dniVal = dniInput?.value.trim() || "";
    if (!dniVal) {
      marcarCampoInvalido(dniInput, "Este campo es obligatorio. Ingrese su DNI.");
      if (!primerInvalido) primerInvalido = dniInput;
      hayErrores = true;
    } else if (dniVal.length < 8) {
      marcarCampoInvalido(dniInput, "El DNI debe contener exactamente 8 dígitos.");
      if (!primerInvalido) primerInvalido = dniInput;
      hayErrores = true;
    } else {
      limpiarCampoInvalido(dniInput);
    }

    // 2. Nombres
    const nombresInput = document.getElementById("paciente-nombres");
    const nombresVal = nombresInput?.value.trim() || "";
    if (!nombresVal) {
      marcarCampoInvalido(nombresInput, "Ingrese los nombres del paciente.");
      if (!primerInvalido) primerInvalido = nombresInput;
      hayErrores = true;
    } else {
      limpiarCampoInvalido(nombresInput);
    }

    // 3. Apellidos
    const apellidosInput = document.getElementById("paciente-apellidos");
    const apellidosVal = apellidosInput?.value.trim() || "";
    if (!apellidosVal) {
      marcarCampoInvalido(apellidosInput, "Ingrese los apellidos del paciente.");
      if (!primerInvalido) primerInvalido = apellidosInput;
      hayErrores = true;
    } else {
      limpiarCampoInvalido(apellidosInput);
    }

    // 4. Teléfono (9 dígitos numéricos)
    const telInput = document.getElementById("paciente-telefono");
    const telVal = telInput?.value.trim() || "";
    if (!telVal) {
      marcarCampoInvalido(telInput, "Ingrese un número celular de contacto.");
      if (!primerInvalido) primerInvalido = telInput;
      hayErrores = true;
    } else if (telVal.length < 9) {
      marcarCampoInvalido(telInput, "El número celular debe contener 9 dígitos.");
      if (!primerInvalido) primerInvalido = telInput;
      hayErrores = true;
    } else {
      limpiarCampoInvalido(telInput);
    }

    // 5. Correo electrónico
    const correoInput = document.getElementById("paciente-correo");
    const correoVal = correoInput?.value.trim() || "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correoVal) {
      marcarCampoInvalido(correoInput, "Ingrese un correo electrónico.");
      if (!primerInvalido) primerInvalido = correoInput;
      hayErrores = true;
    } else if (!emailRegex.test(correoVal)) {
      marcarCampoInvalido(correoInput, "Ingrese un formato de correo válido (ej: paciente@email.com).");
      if (!primerInvalido) primerInvalido = correoInput;
      hayErrores = true;
    } else {
      limpiarCampoInvalido(correoInput);
    }

    if (hayErrores) {
      if (primerInvalido) {
        primerInvalido.focus();
        primerInvalido.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
  }

  // Cargar horarios al entrar al paso 3
  if (numero === 3) {
    cargarHorariosDisponibles();
  }

  // Actualizar indicadores visuales
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById(`step-ind-${i}`);
    const pane = document.getElementById(`pane-${i}`);
    if (ind && pane) {
      ind.classList.remove("active", "completed");
      pane.classList.remove("active");

      if (i < numero) {
        ind.classList.add("completed");
      } else if (i === numero) {
        ind.classList.add("active");
        pane.classList.add("active");
      }
    }
  }

  // Scroll al inicio del formulario con margen adecuado respecto al navbar
  const secCita = document.getElementById("sacar-cita");
  if (secCita) {
    const navHeight = document.querySelector("header.navbar")?.offsetHeight || 62;
    const targetPos = secCita.getBoundingClientRect().top + window.pageYOffset - navHeight - 15;
    window.scrollTo({ top: Math.max(0, targetPos), behavior: "smooth" });
  }
}

// Confirmar y registrar la cita en el Backend
async function confirmarYGuardarCita() {
  const containerSlots = document.getElementById("slots-container");
  if (!horarioSeleccionado) {
    if (containerSlots) {
      containerSlots.classList.remove("field-shake");
      void containerSlots.offsetWidth;
      containerSlots.classList.add("field-shake");
      let msg = document.getElementById("slot-error-msg");
      if (!msg) {
        msg = document.createElement("div");
        msg.id = "slot-error-msg";
        msg.className = "field-error-msg";
        msg.style.padding = "10px 14px";
        msg.style.background = "#fee2e2";
        msg.style.border = "1px solid #fca5a5";
        msg.style.borderRadius = "8px";
        msg.style.marginTop = "12px";
        containerSlots.parentElement.appendChild(msg);
      }
      msg.textContent = "Por favor seleccione un horario disponible para registrar su cita.";
      msg.style.display = "block";
    }
    return;
  }
  const msgErr = document.getElementById("slot-error-msg");
  if (msgErr) msgErr.style.display = "none";

  const btnSubmit = document.getElementById("btn-confirmar-cita");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Registrando Cita...";
  }

  const payload = {
    dni: document.getElementById("paciente-dni").value.trim(),
    nombres: document.getElementById("paciente-nombres").value.trim(),
    apellidos: document.getElementById("paciente-apellidos").value.trim(),
    telefono: document.getElementById("paciente-telefono").value.trim(),
    correo: document.getElementById("paciente-correo").value.trim(),
    edad: parseInt(document.getElementById("paciente-edad").value || 30, 10),
    seguro: document.getElementById("paciente-seguro").value,
    tipo_consulta: document.getElementById("paciente-tipo-consulta").value,
    especialidad_codigo: especialidadSeleccionada ? especialidadSeleccionada.codigo : "MED_GEN",
    motivo: document.getElementById("paciente-motivo")?.value.trim() || "Consulta estándar",
    fecha: document.getElementById("cita-fecha").value,
    hora: horarioSeleccionado
  };

  try {
    const res = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      let errBox = document.getElementById("booking-error-banner");
      if (!errBox) {
        errBox = document.createElement("div");
        errBox.id = "booking-error-banner";
        errBox.className = "field-error-msg";
        errBox.style.padding = "10px 14px";
        errBox.style.background = "#fee2e2";
        errBox.style.border = "1px solid #fca5a5";
        errBox.style.borderRadius = "8px";
        errBox.style.margin = "10px 0";
        document.getElementById("pane-3")?.prepend(errBox);
      }
      errBox.textContent = "Error al programar la cita: " + (result.error || "Ocurrió un error inesperado.");
      errBox.style.display = "block";

      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Confirmar y Registrar Cita";
      }
      return;
    }

    citaConfirmadaActual = result.cita;
    mostrarComprobante(result.cita, result);
    irPaso(4);
  } catch (err) {
    console.error("Error al registrar cita:", err);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Confirmar y Registrar Cita";
    }
  }
}

// Mostrar los datos en el ticket de confirmación
function mostrarComprobante(cita, result) {
  document.getElementById("res-codigo-cita").textContent = cita.codigo_cita;
  document.getElementById("res-paciente").textContent = cita.paciente;
  document.getElementById("res-dni").textContent = cita.dni;
  document.getElementById("res-especialidad").textContent = cita.especialidad;
  document.getElementById("res-consultorio").textContent = cita.consultorio;
  document.getElementById("res-medico").textContent = cita.medico;
  document.getElementById("res-seguro").textContent = cita.seguro;
  document.getElementById("res-fecha").textContent = cita.fecha;
  document.getElementById("res-hora").textContent = cita.hora;

  // Mostrar aviso de reprogramación si correspondía a sobrescritura de cita
  const reprogramadaBanner = document.getElementById("res-reprogramada-banner");
  const tituloConf = document.getElementById("res-titulo-confirmacion");
  const subtituloConf = document.getElementById("res-subtitulo-confirmacion");
  const correoBanner = document.getElementById("res-correo-banner");

  if (correoBanner) {
    if (cita.correo) {
      correoBanner.innerHTML = `Comprobante oficial enviado a: <strong>${cita.correo}</strong>`;
      correoBanner.style.display = "block";
    } else {
      correoBanner.style.display = "none";
    }
  }

  if (result && result.reprogramada) {
    if (reprogramadaBanner) {
      reprogramadaBanner.style.display = "block";
      reprogramadaBanner.innerHTML = `<strong>Aviso de Reprogramación:</strong> ${result.mensaje}`;
    }
    if (tituloConf) tituloConf.textContent = "Cita Reprogramada con Éxito";
    if (subtituloConf) subtituloConf.textContent = "Tu cita anterior ha sido sustituida y se te ha asignado un nuevo turno al final de la cola de espera.";
  } else {
    if (reprogramadaBanner) {
      reprogramadaBanner.style.display = "none";
      reprogramadaBanner.textContent = "";
    }
    if (tituloConf) tituloConf.textContent = "Cita Médica Registrada con Éxito";
    if (subtituloConf) subtituloConf.textContent = "Su reserva ha quedado guardada en la base de datos hospitalaria y asignada a la cola.";
  }

  // Mostrar el turno asignado
  const turnoEl = document.getElementById("res-turno-asignado");
  if (turnoEl) {
    turnoEl.textContent = cita.numero_turno || "Asignado";
  }

  // Deshabilitar botón de check-in manual ya que la cita ingresa automáticamente a cola
  const btnTurno = document.getElementById("btn-generar-turno-inmediato");
  if (btnTurno) {
    if (cita.numero_turno) {
      btnTurno.disabled = true;
      btnTurno.textContent = `Turno Asignado: ${cita.numero_turno} (En Cola de Espera)`;
      btnTurno.style.background = "#059669";
      btnTurno.style.borderColor = "#059669";
      btnTurno.style.color = "#ffffff";
      btnTurno.style.cursor = "default";
      btnTurno.style.opacity = "1";
    } else {
      btnTurno.disabled = false;
      btnTurno.textContent = "Hacer Check-In / Entrar a Cola Virtual";
      btnTurno.style.background = "";
      btnTurno.style.borderColor = "";
      btnTurno.style.color = "";
      btnTurno.style.cursor = "pointer";
    }
  }
}

// Check-in directo desde la cita recién creada
async function hacerCheckInDesdeCita() {
  if (!citaConfirmadaActual) return;

  try {
    const res = await fetch("/api/turnos/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo_cita: citaConfirmadaActual.codigo_cita,
        tipo_origen: "WEB"
      })
    });

    const data = await res.json();
    const btn = document.getElementById("btn-generar-turno-inmediato");
    let checkinBox = document.getElementById("checkin-status-banner");
    if (!checkinBox) {
      checkinBox = document.createElement("div");
      checkinBox.id = "checkin-status-banner";
      checkinBox.style.padding = "12px 18px";
      checkinBox.style.borderRadius = "10px";
      checkinBox.style.marginTop = "1.25rem";
      checkinBox.style.textAlign = "center";
      checkinBox.style.fontSize = "0.92rem";
      checkinBox.style.fontWeight = "600";
      document.getElementById("ticket-confirmacion")?.after(checkinBox);
    }

    if (data.success) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = `Turno Asignado: ${data.turno.numero_turno} (En Cola)`;
        btn.style.background = "#059669";
        btn.style.borderColor = "#059669";
        btn.style.color = "#ffffff";
        btn.style.cursor = "default";
      }
      checkinBox.style.background = "#ecfdf5";
      checkinBox.style.border = "1px solid #a7f3d0";
      checkinBox.style.color = "#065f46";
      checkinBox.innerHTML = `Turno en Sala de Espera confirmado: <strong>${data.turno.numero_turno}</strong> | Consultorio: <strong>${data.turno.consultorio}</strong> | Tiempo estimado: ~${data.turno.tiempo_estimado_min} min.`;
      checkinBox.style.display = "block";
    } else {
      checkinBox.style.background = "#fee2e2";
      checkinBox.style.border = "1px solid #fca5a5";
      checkinBox.style.color = "#991b1b";
      checkinBox.textContent = "Aviso: " + (data.error || "No se pudo actualizar el turno");
      checkinBox.style.display = "block";
    }
  } catch (err) {
    console.error("Error al hacer checkin:", err);
  }
}

// Reiniciar formulario para una nueva cita
function reiniciarFormulario() {
  document.getElementById("booking-form")?.reset();
  inicializarFecha();
  citaConfirmadaActual = null;
  horarioSeleccionado = null;
  restablecerCamposPacienteSiCambiaDni();

  // Restablecer especialidad siempre a Medicina General por defecto
  if (especialidadesDisponibles && especialidadesDisponibles.length > 0) {
    const medGen = especialidadesDisponibles.find(e => e.codigo === "MED_GEN") || especialidadesDisponibles[0];
    especialidadSeleccionada = medGen;
    const cards = document.querySelectorAll(".spec-option");
    cards.forEach((card, idx) => {
      if (idx === 0) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
    });
    actualizarLabelEspecialidad();
  }

  const reprogramadaBanner = document.getElementById("res-reprogramada-banner");
  if (reprogramadaBanner) {
    reprogramadaBanner.style.display = "none";
    reprogramadaBanner.innerHTML = "";
  }
  const correoBanner = document.getElementById("res-correo-banner");
  if (correoBanner) {
    correoBanner.style.display = "none";
    correoBanner.innerHTML = "";
  }
  const tituloConf = document.getElementById("res-titulo-confirmacion");
  if (tituloConf) tituloConf.textContent = "Cita Médica Registrada con Éxito";
  const subtituloConf = document.getElementById("res-subtitulo-confirmacion");
  if (subtituloConf) subtituloConf.textContent = "Su reserva ha quedado guardada en la base de datos hospitalaria y asignada a la cola.";

  const btnTurno = document.getElementById("btn-generar-turno-inmediato");
  if (btnTurno) {
    btnTurno.disabled = false;
    btnTurno.textContent = "Hacer Check-In / Entrar a Cola Virtual";
    btnTurno.style.background = "";
    btnTurno.style.borderColor = "";
    btnTurno.style.color = "";
    btnTurno.style.cursor = "pointer";
  }

  const btnSubmit = document.getElementById("btn-confirmar-cita");
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Confirmar y Registrar Cita";
  }

  irPaso(1);
}

// Buscar citas de un paciente por DNI o código
async function buscarCitaPaciente() {
  const query = document.getElementById("input-buscar-cita")?.value.trim();
  const resContainer = document.getElementById("resultado-busqueda");
  if (!query || !resContainer) return;

  resContainer.innerHTML = "<p style='color: var(--text-muted);'>Buscando registros...</p>";

  try {
    const res = await fetch(`/api/citas/buscar?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success || data.citas.length === 0) {
      resContainer.innerHTML = `
        <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 2rem; text-align: center;">
          <p style="color: var(--danger); font-weight: 600;">No se encontraron citas con el documento o código ingresado.</p>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Verifique que el número de DNI o código esté escrito correctamente.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div style="background: white; border: 1px solid var(--border); border-radius: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: var(--shadow-sm);">
        <table class="data-table" style="min-width: 540px; width: 100%;">
          <thead>
            <tr>
              <th>Código Cita</th>
              <th>Paciente / DNI</th>
              <th>Especialidad</th>
              <th>Fecha y Hora</th>
              <th>Consultorio</th>
              <th>Estado Cita</th>
            </tr>
          </thead>
          <tbody>
    `;

    data.citas.forEach(c => {
      html += `
        <tr>
          <td><strong style="color: #0369a1;">${c.codigo_cita}</strong></td>
          <td>${c.nombres} ${c.apellidos}<br><small style="color: var(--text-muted);">${c.dni}</small></td>
          <td>${c.especialidad_nombre}</td>
          <td>${c.fecha} - <strong>${c.hora}</strong></td>
          <td>${c.consultorio}</td>
          <td><span class="status-badge status-${c.estado}">${c.estado}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    resContainer.innerHTML = html;

  } catch (err) {
    console.error("Error buscando cita:", err);
    resContainer.innerHTML = "<p style='color: var(--danger);'>Error al conectar con la base de datos.</p>";
  }
}

async function checkinDesdeBusqueda(codigoCita) {
  try {
    const res = await fetch("/api/turnos/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo_cita: codigoCita, tipo_origen: "WEB" })
    });
    const data = await res.json();
    if (data.success) {
      buscarCitaPaciente();
    } else {
      const resContainer = document.getElementById("resultado-busqueda");
      if (resContainer) {
        let errDiv = document.getElementById("busqueda-error-banner");
        if (!errDiv) {
          errDiv = document.createElement("div");
          errDiv.id = "busqueda-error-banner";
          errDiv.style.background = "#fee2e2";
          errDiv.style.color = "#991b1b";
          errDiv.style.padding = "10px 14px";
          errDiv.style.borderRadius = "8px";
          errDiv.style.marginBottom = "10px";
          errDiv.style.fontWeight = "600";
          resContainer.prepend(errDiv);
        }
        errDiv.textContent = "Aviso: " + (data.error || "No se pudo realizar el check-in");
        errDiv.style.display = "block";
      }
    }
  } catch (err) {
    console.error("Error al hacer checkin desde busqueda:", err);
  }
}
