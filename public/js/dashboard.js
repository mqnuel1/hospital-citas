/**
 * Lógica del Dashboard Administrativo y Clínico
 * Control de Flujos, Métricas y Gestión de Colas
 */

let turnosTotales = [];
let turnoEnCurso = null;
let filtroEstadoActual = 'ACTIVOS'; // 'ACTIVOS' (espera/atención), 'ATENDIDO' o 'TODOS'
let intervalDashboard = null;

document.addEventListener("DOMContentLoaded", () => {
  verificarSesion();
});

// Control de Autenticación y Sesión de Personal de Salud
function verificarSesion() {
  const token = sessionStorage.getItem("hospital_auth_token");
  const loginScreen = document.getElementById("login-screen");
  const dashboardApp = document.getElementById("dashboard-app");

  if (!token) {
    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboardApp) dashboardApp.style.display = "none";
    if (intervalDashboard) {
      clearInterval(intervalDashboard);
      intervalDashboard = null;
    }
  } else {
    if (loginScreen) loginScreen.style.display = "none";
    if (dashboardApp) dashboardApp.style.display = "block";

    actualizarDashboard();
    if (!intervalDashboard) {
      intervalDashboard = setInterval(actualizarDashboard, 3000); // Polling cada 3s
    }
  }
}

async function iniciarSesion(e) {
  if (e) e.preventDefault();
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const errorMsg = document.getElementById("login-error-msg");
  const submitBtn = document.getElementById("btn-login-submit");

  const username = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!username || !password) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando...";
  }
  if (errorMsg) errorMsg.style.display = "none";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.setItem("hospital_auth_token", data.token);
      verificarSesion();
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || "Credenciales incorrectas.";
        errorMsg.style.display = "block";
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = "Error de conexión con el servidor.";
      errorMsg.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Ingresar al Panel";
    }
  }
}

function cerrarSesion() {
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  sessionStorage.removeItem("hospital_auth_token");
  verificarSesion();
}

function cambiarFiltroEstado(nuevoEstado) {
  filtroEstadoActual = nuevoEstado;

  // Actualizar estilo visual de los botones de pestaña
  const btnActivos = document.getElementById("tab-activos");
  const btnAtendidos = document.getElementById("tab-atendidos");
  const btnTodos = document.getElementById("tab-todos");

  if (btnActivos) btnActivos.className = `btn ${nuevoEstado === 'ACTIVOS' ? 'btn-primary' : 'btn-outline'}`;
  if (btnAtendidos) btnAtendidos.className = `btn ${nuevoEstado === 'ATENDIDO' ? 'btn-primary' : 'btn-outline'}`;
  if (btnTodos) btnTodos.className = `btn ${nuevoEstado === 'TODOS' ? 'btn-primary' : 'btn-outline'}`;

  renderizarTablaTurnos();
}

function cambiarConsultorioActivo() {
  turnoEnCurso = null;
  actualizarDashboard();
}

async function actualizarDashboard() {
  await Promise.all([cargarMetricas(), cargarTurnos()]);
  verificarEstadoConsultorio();
}

async function cargarMetricas() {
  try {
    const res = await fetch("/api/metricas");
    const data = await res.json();
    if (!data.success) return;

    document.getElementById("met-en-espera").textContent = data.total_en_espera;
    document.getElementById("met-en-atencion").textContent = data.total_en_atencion;
    document.getElementById("met-atendidos").textContent = data.total_atendidos;
    document.getElementById("met-tiempo-espera").textContent = `${data.avg_espera_minutos} min`;
    document.getElementById("met-tiempo-atencion").textContent = `${data.avg_atencion_minutos} min`;

    const elAhorro = document.getElementById("met-ahorro-tiempo");
    if (elAhorro) {
      elAhorro.textContent = `-${data.reduccion_tiempo_espera_pct}% vs sistema manual (150 min)`;
    }
  } catch (err) {
    console.error("Error al cargar métricas:", err);
  }
}

async function cargarTurnos() {
  try {
    const res = await fetch("/api/turnos/activos");
    const data = await res.json();
    if (!data.success) return;

    turnosTotales = [
      ...(data.llamados || []),
      ...(data.en_espera || []),
      ...(data.ultimos_atendidos || [])
    ];

    renderizarTablaTurnos();
  } catch (err) {
    console.error("Error al cargar turnos:", err);
  }
}

function renderizarTablaTurnos() {
  const tbody = document.getElementById("tabla-turnos-body");
  const filtroTexto = document.getElementById("filtro-busqueda-tabla")?.value.toLowerCase().trim() || "";
  if (!tbody) return;

  const listaFiltrada = turnosTotales.filter(t => {
    // 1. Filtro por estado activo vs atendido
    if (filtroEstadoActual === 'ACTIVOS') {
      if (t.estado === 'ATENDIDO' || t.estado === 'AUSENTE') return false;
    } else if (filtroEstadoActual === 'ATENDIDO') {
      if (t.estado !== 'ATENDIDO') return false;
    }

    // 2. Filtro por texto de búsqueda
    return (
      t.numero_turno.toLowerCase().includes(filtroTexto) ||
      t.paciente_nombre.toLowerCase().includes(filtroTexto) ||
      t.dni.includes(filtroTexto) ||
      t.consultorio.toLowerCase().includes(filtroTexto) ||
      t.especialidad_nombre.toLowerCase().includes(filtroTexto)
    );
  });

  if (listaFiltrada.length === 0) {
    const mensajeVacio = filtroEstadoActual === 'ACTIVOS' 
      ? 'No hay pacientes esperando en cola en este momento.'
      : 'No hay registros en esta sección.';
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem; font-weight: 500;">${mensajeVacio}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  listaFiltrada.forEach(t => {
    const tr = document.createElement("tr");

    let accionBtn = "";
    if (t.estado === "EN_ESPERA") {
      accionBtn = `
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="llamarTurnoEspecifico(${t.id})">
          Llamar
        </button>
      `;
    } else if (t.estado === "LLAMADO") {
      accionBtn = `
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="iniciarTurnoEspecifico(${t.id})">
            Atender
          </button>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem; color: #dc2626; border-color: #fca5a5;" onclick="marcarAusenteEspecifico(${t.id})">
            Ausente
          </button>
        </div>
      `;
    } else if (t.estado === "EN_ATENCION") {
      accionBtn = `
        <button class="btn btn-accent" style="padding: 4px 10px; font-size: 0.8rem;" onclick="finalizarTurnoEspecifico(${t.id})">
          Finalizar
        </button>
      `;
    } else {
      accionBtn = `<span style="color: var(--text-muted); font-size: 0.8rem;">Completado</span>`;
    }

    const horaEmi = t.hora_emision ? new Date(t.hora_emision).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--";
    const esperaMin = t.tiempo_espera_minutos > 0 ? `${t.tiempo_espera_minutos} min` : "En espera";

    tr.innerHTML = `
      <td><strong style="font-size: 1.1rem; color: #0284c7;">${t.numero_turno}</strong></td>
      <td><strong>${t.paciente_nombre}</strong></td>
      <td>${t.dni}</td>
      <td>${t.especialidad_nombre}<br><small style="color: var(--text-muted);">${t.consultorio}</small></td>
      <td><span style="font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${t.tipo_origen}</span></td>
      <td>${horaEmi}</td>
      <td style="color: ${t.tiempo_espera_minutos > 20 ? 'var(--danger)' : 'var(--accent)'}; font-weight: 600;">${esperaMin}</td>
      <td><span class="status-badge status-${t.estado}">${t.estado}</span></td>
      <td>${accionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filtrarTabla() {
  renderizarTablaTurnos();
}

function verificarEstadoConsultorio() {
  const banner = document.getElementById("banner-paciente-actual");
  const btnLlamar = document.getElementById("btn-llamar-siguiente");
  const btnIniciar = document.getElementById("btn-iniciar-consulta");
  const btnFinalizar = document.getElementById("btn-finalizar-consulta");
  const btnAusente = document.getElementById("btn-marcar-ausente");

  // Identificar el paciente actualmente activo en el hospital (prioridad a LLAMADO, luego EN_ATENCION)
  const pacienteActivo = turnosTotales.find(t => t.estado === "LLAMADO") ||
                         turnosTotales.find(t => t.estado === "EN_ATENCION") ||
                         null;

  turnoEnCurso = pacienteActivo;

  if (turnoEnCurso) {
    if (banner) banner.style.display = "flex";
    const elTitulo = document.getElementById("paciente-actual-titulo");
    if (elTitulo) elTitulo.textContent = `Turno ${turnoEnCurso.numero_turno}: ${turnoEnCurso.paciente_nombre}`;
    
    const elDetalle = document.getElementById("paciente-actual-detalle");
    if (elDetalle) {
      elDetalle.textContent = `${turnoEnCurso.especialidad_nombre || 'Consulta'} (${turnoEnCurso.consultorio}) | DNI: ${turnoEnCurso.dni} | Tiempo en sala: ${turnoEnCurso.tiempo_espera_minutos} min | Origen: ${turnoEnCurso.tipo_origen}`;
    }

    const badge = document.getElementById("badge-estado-atencion");
    if (badge) {
      badge.className = `status-badge status-${turnoEnCurso.estado}`;
      badge.textContent = turnoEnCurso.estado.replace("_", " ");
    }

    if (turnoEnCurso.estado === "LLAMADO") {
      if (btnLlamar) {
        btnLlamar.disabled = false;
        btnLlamar.textContent = "Re-llamar";
      }
      if (btnIniciar) btnIniciar.disabled = false;
      if (btnFinalizar) btnFinalizar.disabled = true;
      if (btnAusente) btnAusente.disabled = false;
    } else if (turnoEnCurso.estado === "EN_ATENCION") {
      if (btnLlamar) {
        btnLlamar.disabled = true;
        btnLlamar.textContent = "Llamar Siguiente";
      }
      if (btnIniciar) btnIniciar.disabled = true;
      if (btnFinalizar) btnFinalizar.disabled = false;
      if (btnAusente) btnAusente.disabled = true;
    }
  } else {
    if (banner) banner.style.display = "none";
    if (btnLlamar) {
      btnLlamar.disabled = false;
      btnLlamar.textContent = "Llamar Siguiente";
    }
    if (btnIniciar) btnIniciar.disabled = true;
    if (btnFinalizar) btnFinalizar.disabled = true;
    if (btnAusente) btnAusente.disabled = true;
  }
}

// Notificación no intrusiva (Toast) que reemplaza los alert() y confirm() bloqueantes
function mostrarNotificacion(mensaje, tipo = "info") {
  let container = document.getElementById("toast-hospital-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-hospital-container";
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const colores = {
    success: { bg: "#0284c7", border: "#0369a1" },
    ok: { bg: "#059669", border: "#047857" },
    warning: { bg: "#d97706", border: "#b45309" },
    error: { bg: "#dc2626", border: "#b91c1c" }
  };
  const estiloColor = colores[tipo] || colores.success;

  toast.style.cssText = `
    background: ${estiloColor.bg};
    border: 1px solid ${estiloColor.border};
    color: #ffffff;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 600;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    opacity: 0;
    transform: translateY(-8px);
    transition: all 0.22s ease-out;
    max-width: 420px;
    line-height: 1.4;
    letter-spacing: -0.01em;
  `;
  toast.textContent = mensaje;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }, 2600);
}

async function llamarSiguientePaciente() {
  let turnoIdALlamar = null;

  // Si ya hay un paciente en estado LLAMADO y el botón dice "Re-llamar", se re-llama al mismo paciente
  if (turnoEnCurso && turnoEnCurso.estado === "LLAMADO") {
    turnoIdALlamar = turnoEnCurso.id;
  }

  try {
    const payload = turnoIdALlamar ? { turno_id: turnoIdALlamar } : {};
    const res = await fetch("/api/turnos/llamar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      actualizarDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function llamarTurnoEspecifico(turnoId) {
  try {
    const res = await fetch("/api/turnos/llamar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turno_id: turnoId })
    });
    const data = await res.json();
    if (data.success) {
      actualizarDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function iniciarConsulta() {
  if (!turnoEnCurso) return;
  iniciarTurnoEspecifico(turnoEnCurso.id);
}

async function iniciarTurnoEspecifico(turnoId) {
  try {
    const res = await fetch("/api/turnos/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turno_id: turnoId })
    });
    const data = await res.json();
    if (data.success) {
      actualizarDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function finalizarConsulta() {
  if (!turnoEnCurso) return;
  finalizarTurnoEspecifico(turnoEnCurso.id);
}

async function finalizarTurnoEspecifico(turnoId) {
  try {
    const res = await fetch("/api/turnos/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turno_id: turnoId })
    });
    const data = await res.json();
    if (data.success) {
      actualizarDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function marcarAusente() {
  if (!turnoEnCurso) return;
  marcarAusenteEspecifico(turnoEnCurso.id);
}

async function marcarAusenteEspecifico(turnoId) {
  try {
    const res = await fetch("/api/turnos/ausente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turno_id: turnoId })
    });
    const data = await res.json();
    if (data.success) {
      turnoEnCurso = null;
      actualizarDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

function abrirModalNuevoTurno() {
  const errDiv = document.getElementById("modal-nuevo-turno-error");
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.textContent = "";
  }
  document.getElementById("modal-nuevo-turno").classList.add("active");
}

function cerrarModalNuevoTurno() {
  const errDiv = document.getElementById("modal-nuevo-turno-error");
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.textContent = "";
  }
  document.getElementById("modal-nuevo-turno").classList.remove("active");
}

async function guardarNuevoTurnoModal() {
  const dniInput = document.getElementById("modal-dni");
  const nombreInput = document.getElementById("modal-nombre");
  const dni = dniInput ? dniInput.value.trim() : "";
  const nombre = nombreInput ? nombreInput.value.trim() : "";
  const esp = document.getElementById("modal-especialidad").value;
  const origen = document.getElementById("modal-origen") ? document.getElementById("modal-origen").value : "VENTANILLA";
  const errDiv = document.getElementById("modal-nuevo-turno-error");

  const mostrarErrorModal = (msg) => {
    if (errDiv) {
      errDiv.textContent = msg;
      errDiv.style.display = "block";
    }
  };

  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.textContent = "";
  }

  // Validación estricta de DNI peruano (8 dígitos numéricos)
  if (!/^\d{8}$/.test(dni)) {
    mostrarErrorModal("El DNI debe contener exactamente 8 dígitos numéricos.");
    if (dniInput) dniInput.focus();
    return;
  }

  // Validación de nombre del paciente (mínimo 3 caracteres, alfabético)
  if (nombre.length < 3 || /^\d+$/.test(nombre)) {
    mostrarErrorModal("Por favor ingrese un nombre y apellido válido para el paciente.");
    if (nombreInput) nombreInput.focus();
    return;
  }

  // Validación de turno duplicado: verificar si el paciente ya tiene un turno activo en cola
  const turnoActivo = turnosTotales.find(t => 
    t.dni === dni && (t.estado === "EN_ESPERA" || t.estado === "LLAMADO" || t.estado === "EN_ATENCION")
  );
  if (turnoActivo) {
    const estadoDesc = turnoActivo.estado === "EN_ESPERA" ? "en espera" : (turnoActivo.estado === "LLAMADO" ? "llamado" : "en atención médica");
    mostrarErrorModal(`El paciente con DNI ${dni} ya cuenta con el Turno ${turnoActivo.numero_turno} activo (${turnoActivo.especialidad_nombre || ''} - ${estadoDesc}). No se puede emitir un turno duplicado.`);
    return;
  }

  try {
    const res = await fetch("/api/turnos/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dni: dni,
        paciente_nombre: nombre,
        especialidad_codigo: esp,
        tipo_origen: origen
      })
    });

    const data = await res.json();
    if (data.success && !data.ya_existia) {
      cerrarModalNuevoTurno();
      if (nombreInput) nombreInput.value = "";
      if (dniInput) dniInput.value = "";
      actualizarDashboard();
    } else {
      mostrarErrorModal(data.error || `El paciente con DNI ${dni} ya cuenta con un turno activo en cola.`);
    }
  } catch (err) {
    console.error(err);
    mostrarErrorModal("Error al contactar al servidor para emitir el turno.");
  }
}

async function reiniciarDatosDemo() {
  try {
    const res = await fetch("/api/demo/reiniciar", { method: "POST" });
    const data = await res.json();
    actualizarDashboard();
  } catch (err) {
    console.error(err);
  }
}

async function limpiarColaCero() {
  try {
    const res = await fetch("/api/demo/limpiar", { method: "POST" });
    const data = await res.json();
    actualizarDashboard();
  } catch (err) {
    console.error(err);
  }
}

// Visualizador de Base de Datos en Vivo - Historial General de Pacientes
let historialPacientesDB = [];

async function abrirModalBaseDatos() {
  const modal = document.getElementById("modal-base-datos");
  if (!modal) return;
  modal.classList.add("active");
  const inputFiltro = document.getElementById("filtro-db-input");
  if (inputFiltro) inputFiltro.value = "";
  await cargarDatosBaseDatos();
}

function cerrarModalBaseDatos() {
  const modal = document.getElementById("modal-base-datos");
  if (modal) modal.classList.remove("active");
}

async function cargarDatosBaseDatos() {
  const contenedor = document.getElementById("contenedor-tabla-db");
  const badgeTotal = document.getElementById("badge-total-db");
  if (!contenedor) return;
  contenedor.innerHTML = "<div style='color: var(--text-muted); text-align: center; padding: 2rem;'>Cargando registros desde la base de datos SQLite...</div>";

  try {
    const res = await fetch("/api/database/dump");
    const data = await res.json();
    if (data.success) {
      historialPacientesDB = data.historial || [];
      if (badgeTotal) {
        badgeTotal.textContent = `Total: ${historialPacientesDB.length} pacientes`;
      }
      renderizarTablaDB(historialPacientesDB);
    }
  } catch (err) {
    console.error(err);
    contenedor.innerHTML = "<div style='color: var(--danger); text-align: center;'>Error al conectar con la base de datos.</div>";
  }
}

function filtrarTablaDB() {
  const query = document.getElementById("filtro-db-input")?.value.toLowerCase().trim() || "";
  const badgeTotal = document.getElementById("badge-total-db");

  if (!query) {
    if (badgeTotal) badgeTotal.textContent = `Total: ${historialPacientesDB.length} pacientes`;
    renderizarTablaDB(historialPacientesDB);
    return;
  }

  const filtrados = historialPacientesDB.filter(r => {
    return (
      (r.codigo_cita && r.codigo_cita.toLowerCase().includes(query)) ||
      (r.numero_turno && r.numero_turno.toLowerCase().includes(query)) ||
      (r.dni && r.dni.toLowerCase().includes(query)) ||
      (r.paciente_nombre && r.paciente_nombre.toLowerCase().includes(query)) ||
      (r.especialidad_nombre && r.especialidad_nombre.toLowerCase().includes(query)) ||
      (r.consultorio && r.consultorio.toLowerCase().includes(query)) ||
      (r.estado && r.estado.toLowerCase().includes(query)) ||
      (r.seguro && r.seguro.toLowerCase().includes(query))
    );
  });

  if (badgeTotal) {
    badgeTotal.textContent = `Filtrados: ${filtrados.length} de ${historialPacientesDB.length}`;
  }
  renderizarTablaDB(filtrados);
}

function renderizarTablaDB(registros) {
  const contenedor = document.getElementById("contenedor-tabla-db");
  if (!contenedor) return;

  if (!registros || registros.length === 0) {
    contenedor.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.5rem; color: #475569;">No se encontraron registros en la Base de Datos</p>
        <span style="font-size: 0.85rem;">Todos los pacientes atendidos, en cola o programados aparecerán aquí permanentemente.</span>
      </div>
    `;
    return;
  }

  let html = `
    <table class="data-table" style="font-size: 0.82rem; width: 100%; white-space: nowrap;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="padding: 10px 12px;">Código Cita</th>
          <th style="padding: 10px 12px;">Turno</th>
          <th style="padding: 10px 12px;">DNI</th>
          <th style="padding: 10px 12px;">Paciente</th>
          <th style="padding: 10px 12px;">Especialidad</th>
          <th style="padding: 10px 12px;">Consultorio / Médico</th>
          <th style="padding: 10px 12px;">Canal / Origen</th>
          <th style="padding: 10px 12px;">Seguro</th>
          <th style="padding: 10px 12px;">Fecha y Hora</th>
          <th style="padding: 10px 12px;">Espera</th>
          <th style="padding: 10px 12px;">Estado</th>
        </tr>
      </thead>
      <tbody>
  `;

  registros.forEach(r => {
    let estadoTexto = r.estado;
    let badgeStyle = "display: inline-block; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.75rem; text-transform: uppercase;";

    if (r.estado === "ATENDIDO" || r.estado === "ATENDIDA") {
      badgeStyle += " background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;";
      estadoTexto = "ATENDIDO";
    } else if (r.estado === "EN_ATENCION") {
      badgeStyle += " background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;";
      estadoTexto = "EN ATENCIÓN";
    } else if (r.estado === "LLAMADO") {
      badgeStyle += " background: #fef3c7; color: #b45309; border: 1px solid #fde68a;";
      estadoTexto = "LLAMADO";
    } else if (r.estado === "EN_ESPERA") {
      badgeStyle += " background: #fffbeb; color: #d97706; border: 1px solid #fde68a;";
      estadoTexto = "EN ESPERA";
    } else if (r.estado === "PROGRAMADA" || r.estado === "CONFIRMADA") {
      badgeStyle += " background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;";
      estadoTexto = r.estado;
    } else if (r.estado === "AUSENTE" || r.estado === "CANCELADA" || r.estado === "CANCELADO") {
      badgeStyle += " background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;";
      estadoTexto = r.estado;
    } else {
      badgeStyle += " background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;";
    }

    const codigoDisplay = (r.codigo_cita && r.codigo_cita !== '-') ? `<strong style="color: #0369a1;">${r.codigo_cita}</strong>` : `<span style="color: var(--text-muted);">-</span>`;
    const turnoDisplay = (r.numero_turno && r.numero_turno !== '-') ? `<strong style="color: #0284c7; background: #f0f9ff; padding: 2px 6px; border-radius: 4px;">${r.numero_turno}</strong>` : `<span style="color: var(--text-muted);">-</span>`;
    const fechaHora = r.fecha && r.hora ? `${r.fecha} ${r.hora}` : (r.fecha || '--');
    const espera = r.tiempo_espera_minutos > 0 ? `${r.tiempo_espera_minutos} min` : (r.estado === "ATENDIDO" ? "Completado" : "0 min");
    const canal = r.canal_origen || 'WEB';
    const canalColor = canal === 'VENTANILLA' ? 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;' :
                       canal === 'TOTEM' ? 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;' :
                       'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;';

    html += `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px 12px;">${codigoDisplay}</td>
        <td style="padding: 10px 12px;">${turnoDisplay}</td>
        <td style="padding: 10px 12px; font-weight: 600;">${r.dni}</td>
        <td style="padding: 10px 12px; font-weight: 700; color: #1e293b;">${r.paciente_nombre}</td>
        <td style="padding: 10px 12px;">${r.especialidad_nombre}</td>
        <td style="padding: 10px 12px;">
          <strong>${r.consultorio}</strong><br>
          <small style="color: var(--text-muted);">${r.medico_responsable || ''}</small>
        </td>
        <td style="padding: 10px 12px;">
          <span style="font-size: 0.76rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; ${canalColor}">
            ${canal}
          </span>
        </td>
        <td style="padding: 10px 12px;"><span style="font-size: 0.78rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${r.seguro || 'SIS'}</span></td>
        <td style="padding: 10px 12px; color: var(--text-muted);">${fechaHora}</td>
        <td style="padding: 10px 12px; font-weight: 600;">${espera}</td>
        <td style="padding: 10px 12px;"><span style="${badgeStyle}">${estadoTexto}</span></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  contenedor.innerHTML = html;
}
