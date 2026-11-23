# Sistema Integrado de Citas y Gestión de Colas Hospitalario

Solución de ingeniería desarrollada para optimizar los flujos de atención y erradicar los cuellos de botella en la salud pública (MINSA / EsSalud), basada en los **Estudios de Caso N°2 y N°3** de la Universidad de Lima (_Introducción a la Ingeniería_).

---

## Arquitectura y Módulos Desarrollados

El sistema implementa una arquitectura desacoplada y modular con cuatro componentes principales:

### 1. Portal Web del Paciente (`/`)

- **Navegación Unificada:** Acceso directo a Inicio, Especialidades, Sacar Cita, Buscar Mi Cita, Nosotros y Ticket de Turno.
- **Módulo de Reserva de Citas (Wizard Interactivo):**
  - **Paso 1:** Datos personales (DNI de 8 dígitos con validación estricta, Nombres, Apellidos, Teléfono de 9 dígitos, Correo electrónico, Edad, Seguro: SIS / EsSalud / Particular, Tipo de consulta).
  - **Paso 2:** Selección de Especialidad Médica (Medicina General, Pediatría Integral, Cardiología, Traumatología, Odontología, Oftalmología) con asignación automática de médico y consultorio.
  - **Paso 3:** Selector de fecha (a partir de la fecha actual) y slots de horarios disponibles en tiempo real.
  - **Paso 4:** Confirmación y emisión de Comprobante Oficial de Cita con código único (`CIT-XXXX`), botón de impresión y generación directa de turno en sala.
- **Módulo Buscar Mi Cita:** Búsqueda rápida por DNI o Código de cita, visualización de estado en tiempo real, confirmación de llegada (check-in) y cancelación de cita para liberación de cupos.

### 2. Tótem de Autoservicio Hospitalario (`/totem`)

- Kiosco interactivo táctil optimizado para la recepción o ingreso de la sede hospitalaria.
- Teclado numérico interactivo en pantalla para digitación asistida del DNI (8 dígitos).
- Consulta inmediata de consultorio asignado, médico responsable y cantidad de pacientes en espera por delante.
- Reimpresión de ticket físico de turno (código alfanumérico según especialidad, ej: `M-001`, `P-002`).

### 3. Pantalla Informativa de Sala de Espera (`/pantalla`)

- Monitor digital de alta visibilidad para salas de espera y zonas de admisión.
- Indicador en gran formato del **Turno Actual en Atención**, Consultorio, Médico y Especialidad.
- **Sintetizador de voz integrado** (Web Speech API) y señal acústica al llamar o re-llamar pacientes.
- Tabla dinámica de turnos en espera con orden de atención y cálculo automático de tiempos estimados.

### 4. Dashboard Administrativo y Estación Médica (`/dashboard`)

- Panel de control restringido para personal médico y de admisión.
- **Control de Acceso:** Usuario `admin` | Contraseña `hospital123`
- **Ventanilla de Admisión Presencial:** Emisión directa de turnos con validación de DNI (8 dígitos), nombres completos y prevención de emisión duplicada para pacientes con turno activo en cola.
- **Control de Flujo Clínico:** Botones de acción rápida: _Llamar Siguiente_, _Iniciar Atención_, _Finalizar Atención_, _Marcar Ausente_ y _Re-llamar_.
- **Operación Directa e Inmediata:** Interacciones de botones fluidas y directas (llamado, atención y finalización de turnos) con actualización en tiempo real y sin avisos emergentes que interrumpan el flujo de trabajo.
- **Visor de Base de Datos:** Modal integrado para inspeccionar tablas de SQLite (`citas`, `turnos`, `especialidades`, `consultorios`, `logs_atencion`) con exportación a formato CSV.
- **Métricas Operativas:** Porcentaje de reducción de tiempos de espera en comparación con el modelo analógico tradicional, total de atendidos y tiempos promedio de consulta.

---

## Modelo de Base de Datos (`hospital.db`)

El sistema utiliza persistencia relacional en SQLite con cinco tablas estructuradas:

1. **`especialidades`:** Catálogo clínico con código, nombre, prefijo de turno y consultorio predeterminado.
2. **`consultorios`:** Ambientes físicos, especialidad asignada, médico responsable y estado de disponibilidad.
3. **`citas`:** Registro oficial de citas médicas programadas por la web o ventanilla (`CIT-XXXX`).
4. **`turnos`:** Turnos de atención en cola (`EN_ESPERA`, `LLAMADO`, `EN_ATENCION`, `ATENDIDO`, `AUSENTE`, `CANCELADO`) vinculados a citas y consultorios.
5. **`logs_atencion`:** Trazabilidad de tiempos de espera y atención médica para métricas de ingeniería.

---

## Ejecución del Sistema

El servidor web y la API REST están implementados en Python nativo (sin dependencias externas pesadas) utilizando `http.server` y `sqlite3`.

### Iniciar el servidor:

```bash
./start.sh
```

O directamente mediante Python:

```bash
python3 server.py
```

### URLs del Sistema:

- **Portal Principal y Reserva de Citas:** [http://localhost:3000/](http://localhost:3000/)
- **Tótem de Autoservicio:** [http://localhost:3000/totem](http://localhost:3000/totem)
- **Pantalla de Sala de Espera:** [http://localhost:3000/pantalla](http://localhost:3000/pantalla)
- **Dashboard Administrativo / Personal de Salud:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

### Credenciales de Acceso al Dashboard:

| Usuario | Contraseña    | Perfil de Acceso                          |
| :------ | :------------ | :---------------------------------------- |
| `admin` | `hospital123` | Estación Central / Administración Clínica |
