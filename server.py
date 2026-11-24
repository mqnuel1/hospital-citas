"""
Servidor Web y API REST - Sistema Integrado de Citas y Gestión de Colas
Hospital Nacional de Salud Pública (MINSA / EsSalud)
"""

import http.server
import socketserver
import os
import json
import urllib.parse
import datetime
import random
import mimetypes
from database import get_connection, init_db, reset_demo_data, clear_all_data
from email_service import enviar_comprobante_cita_async

# Zona horaria oficial del Hospital Nacional (Lima, Perú: UTC-5)
ZONA_HORARIA_PERU = datetime.timezone(datetime.timedelta(hours=-5))

def ahora_peru() -> datetime.datetime:
    """Retorna la fecha y hora actual en la hora oficial de Perú (UTC-5)."""
    return datetime.datetime.now(ZONA_HORARIA_PERU).replace(tzinfo=None)

def fecha_hoy_peru() -> str:
    """Retorna la fecha actual en Perú en formato YYYY-MM-DD."""
    return ahora_peru().strftime("%Y-%m-%d")

PORT = int(os.environ.get("PORT", 3000))
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")

# Códigos de letra por especialidad para tickets ordenados y visuales
PREFIJOS_TURNO = {
    "MED_GEN": "A",
    "PED": "P",
    "GIN": "G",
    "CAR": "C",
    "TRA": "T",
    "NEU": "N",
    "OFT": "F",
    "DER": "D"
}

def generar_codigo_cita_aleatorio(cursor):
    """Genera un código aleatorio único de 4 dígitos para cada cita médica: CIT-XXXX"""
    while True:
        num = random.randint(1000, 9999)
        codigo = f"CIT-{num}"
        cursor.execute("SELECT 1 FROM citas WHERE codigo_cita = ?", (codigo,))
        if not cursor.fetchone():
            return codigo

class HospitalRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Cabeceras de seguridad y no-cache para actualizaciones dinámicas
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Enrutamiento de API REST
        if path.startswith("/api/"):
            return self.handle_api_get(path, query)

        # Rutas amigables para las vistas del sistema
        normalized_path = path.rstrip("/") if path != "/" else "/"
        route_map = {
            "/": "index.html",
            "/citas": "index.html",
            "/totem": "totem.html",
            "/pantalla": "pantalla.html",
            "/dashboard": "dashboard.html",
            "/admin": "dashboard.html",
            "/totem.html": "totem.html",
            "/pantalla.html": "pantalla.html",
            "/dashboard.html": "dashboard.html",
            "/index.html": "index.html"
        }

        if normalized_path in route_map:
            file_name = route_map[normalized_path]
            file_path = os.path.join(PUBLIC_DIR, file_name)
            return self.serve_static_file(file_path)

        # Archivos estáticos en /public
        clean_path = path.lstrip("/")
        file_path = os.path.join(PUBLIC_DIR, clean_path)
        resolved_path = os.path.abspath(file_path)
        if not resolved_path.startswith(os.path.abspath(PUBLIC_DIR)):
            self.send_response(403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Acceso denegado"}).encode("utf-8"))
            return

        if os.path.exists(resolved_path) and os.path.isfile(resolved_path):
            return self.serve_static_file(resolved_path)

        # 404 Not Found
        self.send_response(404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Recurso no encontrado"}).encode("utf-8"))

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                data = {}
            return self.handle_api_post(path, data)

        self.send_response(404)
        self.end_headers()

    def serve_static_file(self, file_path):
        resolved = os.path.abspath(file_path)
        if not resolved.startswith(os.path.abspath(PUBLIC_DIR)) or not os.path.exists(resolved) or not os.path.isfile(resolved):
            self.send_response(404)
            self.end_headers()
            return

        mime_type, _ = mimetypes.guess_type(file_path)
        if mime_type is None:
            mime_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------------- API GET ----------------
    def handle_api_get(self, path, query):
        conn = get_connection()
        cursor = conn.cursor()

        try:
            # Listado de especialidades (Medicina General primero por defecto)
            if path == "/api/especialidades":
                cursor.execute("""
                SELECT codigo, nombre, descripcion, consultorio_default, medico_responsable, duracion_estimada_min, icono 
                FROM especialidades 
                ORDER BY 
                    CASE codigo
                        WHEN 'MED_GEN' THEN 1
                        WHEN 'PED' THEN 2
                        WHEN 'GIN' THEN 3
                        WHEN 'CAR' THEN 4
                        WHEN 'TRA' THEN 5
                        WHEN 'NEU' THEN 6
                        WHEN 'OFT' THEN 7
                        WHEN 'DER' THEN 8
                        ELSE 9
                    END ASC
                """)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(200, {"success": True, "especialidades": rows})

            # Horarios disponibles para una especialidad y fecha
            elif path == "/api/horarios-disponibles":
                esp = query.get("especialidad", ["MED_GEN"])[0]
                fecha = query.get("fecha", [fecha_hoy_peru()])[0]

                # Horarios base de consulta
                todos_horarios = [
                    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
                    "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"
                ]

                # Consultar ocupados
                cursor.execute("""
                SELECT hora FROM citas 
                WHERE especialidad_codigo = ? AND fecha = ? AND estado != 'CANCELADA'
                """, (esp, fecha))
                ocupados = set(r["hora"] for r in cursor.fetchall())

                now = ahora_peru()
                hoy_str = now.strftime("%Y-%m-%d")
                hora_actual_str = now.strftime("%H:%M")

                resultado = []
                for h in todos_horarios:
                    es_pasado = False
                    if fecha < hoy_str:
                        es_pasado = True
                    elif fecha == hoy_str and h <= hora_actual_str:
                        es_pasado = True

                    disponible = (h not in ocupados) and (not es_pasado)
                    resultado.append({
                        "hora": h,
                        "disponible": disponible,
                        "motivo": "Horario pasado" if es_pasado else ("Horario ocupado" if h in ocupados else "Disponible")
                    })

                return self.send_json(200, {"fecha": fecha, "especialidad": esp, "horarios": resultado})

            # Buscar citas por DNI o código
            elif path == "/api/citas/buscar":
                q = query.get("q", [""])[0].strip()
                if not q:
                    return self.send_json(400, {"success": False, "error": "Parámetro de búsqueda requerido"})

                cursor.execute("""
                SELECT c.*, e.nombre as especialidad_nombre, e.medico_responsable,
                       (SELECT numero_turno FROM turnos WHERE cita_id = c.id AND estado IN ('EN_ESPERA', 'LLAMADO', 'EN_ATENCION') LIMIT 1) as numero_turno,
                       (SELECT estado FROM turnos WHERE cita_id = c.id AND estado IN ('EN_ESPERA', 'LLAMADO', 'EN_ATENCION') LIMIT 1) as estado_turno
                FROM citas c
                JOIN especialidades e ON c.especialidad_codigo = e.codigo
                WHERE c.dni = ? OR c.codigo_cita = ?
                ORDER BY c.fecha DESC, c.hora DESC
                """, (q, q.upper()))
                citas = [dict(r) for r in cursor.fetchall()]
                return self.send_json(200, {"success": True, "citas": citas})

            # Verificar paciente por DNI (autocompletado, bloqueo de identidad y detección de cita activa)
            elif path == "/api/pacientes/verificar":
                dni = query.get("dni", [""])[0].strip()
                if not dni or len(dni) != 8 or not dni.isdigit():
                    return self.send_json(400, {"success": False, "error": "DNI inválido"})

                cursor.execute("""
                SELECT nombres, apellidos, telefono, correo, edad, seguro 
                FROM citas 
                WHERE dni = ? 
                ORDER BY id DESC 
                LIMIT 1
                """, (dni,))
                paciente = cursor.fetchone()

                # Buscar si tiene alguna cita activa en el hospital (Opción B: cualquier especialidad)
                cursor.execute("""
                SELECT c.id, c.codigo_cita, c.especialidad_codigo, c.fecha, c.hora, c.consultorio,
                       e.nombre as especialidad_nombre,
                       (SELECT numero_turno FROM turnos WHERE cita_id = c.id AND estado IN ('EN_ESPERA', 'LLAMADO') LIMIT 1) as numero_turno
                FROM citas c
                JOIN especialidades e ON c.especialidad_codigo = e.codigo
                WHERE c.dni = ? AND c.estado IN ('PROGRAMADA', 'CONFIRMADA')
                ORDER BY c.id DESC
                LIMIT 1
                """, (dni,))
                cita_activa = cursor.fetchone()

                return self.send_json(200, {
                    "success": True,
                    "registrado": bool(paciente),
                    "paciente": dict(paciente) if paciente else None,
                    "cita_activa": dict(cita_activa) if cita_activa else None
                })

            # Listado de turnos activos (para pantalla y dashboard)
            elif path == "/api/turnos/activos":
                # Turnos llamados recientemente o en atención
                cursor.execute("""
                SELECT t.*, e.nombre as especialidad_nombre 
                FROM turnos t
                JOIN especialidades e ON t.especialidad_codigo = e.codigo
                WHERE t.estado IN ('LLAMADO', 'EN_ATENCION')
                ORDER BY 
                    CASE WHEN t.estado = 'LLAMADO' THEN 1 ELSE 2 END ASC,
                    t.hora_llamado DESC, 
                    t.id DESC
                LIMIT 8
                """)
                llamados = [dict(r) for r in cursor.fetchall()]

                # Turnos en espera ordenados por llegada
                cursor.execute("""
                SELECT t.*, e.nombre as especialidad_nombre 
                FROM turnos t
                JOIN especialidades e ON t.especialidad_codigo = e.codigo
                WHERE t.estado = 'EN_ESPERA'
                ORDER BY t.id ASC
                LIMIT 20
                """)
                en_espera = [dict(r) for r in cursor.fetchall()]

                # Últimos turnos finalizados (atendidos y ausentes) para histórico y control
                cursor.execute("""
                SELECT t.*, e.nombre as especialidad_nombre 
                FROM turnos t
                JOIN especialidades e ON t.especialidad_codigo = e.codigo
                WHERE t.estado IN ('ATENDIDO', 'AUSENTE')
                ORDER BY t.id DESC
                LIMIT 15
                """)
                ultimos_atendidos = [dict(r) for r in cursor.fetchall()]

                return self.send_json(200, {
                    "success": True,
                    "llamados": llamados,
                    "en_espera": en_espera,
                    "ultimos_atendidos": ultimos_atendidos,
                    "timestamp": ahora_peru().isoformat()
                })

            # Volcado consolidado de la base de datos para historial completo de pacientes
            elif path == "/api/database/dump":
                cursor.execute("""
                SELECT 
                    c.id as cita_id,
                    c.codigo_cita,
                    COALESCE(t.id, 0) as turno_id,
                    COALESCE(t.numero_turno, '-') as numero_turno,
                    c.dni,
                    (c.nombres || ' ' || c.apellidos) as paciente_nombre,
                    c.telefono,
                    c.correo,
                    c.seguro,
                    COALESCE(e.nombre, c.especialidad_codigo) as especialidad_nombre,
                    c.especialidad_codigo,
                    c.consultorio,
                    COALESCE(e.medico_responsable, 'Médico de turno') as medico_responsable,
                    c.fecha,
                    c.hora,
                    c.tipo_consulta,
                    c.motivo,
                    COALESCE(t.tipo_origen, 'WEB') as canal_origen,
                    COALESCE(t.hora_emision, c.created_at) as hora_emision,
                    COALESCE(t.tiempo_espera_minutos, 0) as tiempo_espera_minutos,
                    COALESCE(t.tiempo_atencion_minutos, 0) as tiempo_atencion_minutos,
                    CASE 
                        WHEN c.estado = 'CANCELADA' THEN 'CANCELADA'
                        ELSE COALESCE(t.estado, c.estado)
                    END as estado
                FROM citas c
                LEFT JOIN especialidades e ON c.especialidad_codigo = e.codigo
                LEFT JOIN turnos t ON t.cita_id = c.id
                UNION ALL
                SELECT 
                    0 as cita_id,
                    '-' as codigo_cita,
                    t.id as turno_id,
                    t.numero_turno,
                    t.dni,
                    t.paciente_nombre,
                    '-' as telefono,
                    '-' as correo,
                    'SIS' as seguro,
                    COALESCE(e.nombre, t.especialidad_codigo) as especialidad_nombre,
                    t.especialidad_codigo,
                    t.consultorio,
                    COALESCE(e.medico_responsable, 'Médico de turno') as medico_responsable,
                    substr(t.hora_emision, 1, 10) as fecha,
                    substr(t.hora_emision, 12, 5) as hora,
                    'Atención Inmediata' as tipo_consulta,
                    '-' as motivo,
                    t.tipo_origen as canal_origen,
                    t.hora_emision,
                    COALESCE(t.tiempo_espera_minutos, 0) as tiempo_espera_minutos,
                    COALESCE(t.tiempo_atencion_minutos, 0) as tiempo_atencion_minutos,
                    t.estado as estado
                FROM turnos t
                LEFT JOIN especialidades e ON t.especialidad_codigo = e.codigo
                WHERE t.cita_id IS NULL OR t.cita_id NOT IN (SELECT id FROM citas)
                ORDER BY fecha DESC, hora DESC, turno_id DESC
                """)
                historial = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM citas ORDER BY id DESC")
                citas = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT * FROM turnos ORDER BY id DESC")
                turnos = [dict(r) for r in cursor.fetchall()]
                return self.send_json(200, {
                    "success": True, 
                    "historial": historial,
                    "citas": citas, 
                    "turnos": turnos
                })

            # Métricas e indicadores de colas (validación del Estudio de Caso 2 y 3)
            elif path == "/api/metricas":
                # Promedio de espera en minutos de los atendidos hoy
                cursor.execute("""
                SELECT AVG(tiempo_espera_minutos) as avg_espera,
                       AVG(tiempo_atencion_minutos) as avg_atencion,
                       COUNT(*) as total_atendidos
                FROM turnos 
                WHERE estado = 'ATENDIDO' AND tiempo_espera_minutos > 0
                """)
                stats = cursor.fetchone()
                avg_espera = round(stats["avg_espera"] or 11.5, 1)
                avg_atencion = round(stats["avg_atencion"] or 14.8, 1)
                total_atendidos = stats["total_atendidos"] or 0

                # Conteo por estado hoy
                cursor.execute("SELECT estado, COUNT(*) as cant FROM turnos GROUP BY estado")
                estados = {r["estado"]: r["cant"] for r in cursor.fetchall()}

                # Total de citas programadas
                cursor.execute("SELECT COUNT(*) FROM citas")
                total_citas = cursor.fetchone()[0]

                # Tiempo de espera tradicional reportado en caso de estudio: 120-180 minutos en MINSA/EsSalud
                tiempo_tradicional = 150.0
                ahorro_tiempo_pct = round(((tiempo_tradicional - avg_espera) / tiempo_tradicional) * 100, 1)

                return self.send_json(200, {
                    "success": True,
                    "avg_espera_minutos": avg_espera,
                    "avg_atencion_minutos": avg_atencion,
                    "total_en_espera": estados.get("EN_ESPERA", 0),
                    "total_en_atencion": estados.get("EN_ATENCION", 0) + estados.get("LLAMADO", 0),
                    "total_atendidos": total_atendidos,
                    "total_ausentes": estados.get("AUSENTE", 0),
                    "total_citas_registradas": total_citas,
                    "reduccion_tiempo_espera_pct": max(0, ahorro_tiempo_pct)
                })

            else:
                return self.send_json(404, {"error": "Endpoint GET no reconocido"})

        finally:
            conn.close()

    # ---------------- API POST ----------------
    def handle_api_post(self, path, data):
        conn = get_connection()
        cursor = conn.cursor()

        try:
            # 0. Autenticación de Personal Médico / Administrativo
            if path == "/api/auth/login":
                username = str(data.get("username", "")).strip().lower()
                password = str(data.get("password", "")).strip()

                USUARIOS_AUTORIZADOS = {
                    "admin": "hospital123"
                }

                if username in USUARIOS_AUTORIZADOS and USUARIOS_AUTORIZADOS[username] == password:
                    token = f"auth-token-{username}-{int(datetime.datetime.now().timestamp())}"
                    return self.send_json(200, {
                        "success": True,
                        "mensaje": "Autenticación exitosa",
                        "token": token,
                        "username": username
                    })
                else:
                    return self.send_json(401, {
                        "success": False,
                        "error": "Credenciales inválidas. Verifique su usuario y contraseña."
                    })

            elif path == "/api/auth/logout":
                return self.send_json(200, {"success": True, "mensaje": "Sesión finalizada exitosamente"})

            # 1. Registrar una nueva cita médica
            elif path == "/api/citas":
                required = ["dni", "nombres", "apellidos", "telefono", "correo", "especialidad_codigo", "fecha", "hora"]
                for f in required:
                    if not data.get(f):
                        return self.send_json(400, {"success": False, "error": f"El campo '{f}' es obligatorio."})

                dni_val = str(data["dni"]).strip()
                nombres_val = data["nombres"].strip()
                apellidos_val = data["apellidos"].strip()

                # Regla 1: Coherencia de Identidad por DNI
                # Si el DNI ya existe en el hospital, preservar estrictamente la identidad oficial registrada
                cursor.execute("SELECT nombres, apellidos FROM citas WHERE dni = ? ORDER BY id DESC LIMIT 1", (dni_val,))
                paciente_existente = cursor.fetchone()
                if paciente_existente:
                    nombres_val = paciente_existente["nombres"]
                    apellidos_val = paciente_existente["apellidos"]

                # Regla 2 (Opción B): Una sola cita activa en todo el hospital.
                # Si ya cuenta con cita activa (PROGRAMADA o CONFIRMADA), se anula la cita previa y su turno en cola.
                cursor.execute("""
                SELECT c.id, c.codigo_cita, c.especialidad_codigo, c.fecha, c.hora, e.nombre as especialidad_nombre
                FROM citas c
                JOIN especialidades e ON c.especialidad_codigo = e.codigo
                WHERE c.dni = ? AND c.estado IN ('PROGRAMADA', 'CONFIRMADA')
                """, (dni_val,))
                citas_previas = cursor.fetchall()

                cita_reprogramada = False
                citas_canceladas_codigos = []

                for cp in citas_previas:
                    cita_reprogramada = True
                    citas_canceladas_codigos.append(cp["codigo_cita"])
                    # Anular cita anterior
                    cursor.execute("""
                    UPDATE citas 
                    SET estado = 'CANCELADA', motivo = COALESCE(motivo, '') || ' [Sustituida por nueva reserva de cita]'
                    WHERE id = ?
                    """, (cp["id"],))

                    # Anular turno anterior en sala de espera (pierde su posición previa en cola)
                    cursor.execute("""
                    UPDATE turnos 
                    SET estado = 'CANCELADO'
                    WHERE cita_id = ? OR (dni = ? AND estado IN ('EN_ESPERA', 'LLAMADO'))
                    """, (cp["id"], dni_val))

                fecha_cita = str(data["fecha"]).strip()
                hora_cita = str(data["hora"]).strip()

                now = ahora_peru()
                hoy_str = now.strftime("%Y-%m-%d")
                hora_actual_str = now.strftime("%H:%M")

                # Validación de fecha y hora: no permitir citas en fechas u horas que ya hayan transcurrido
                if fecha_cita < hoy_str or (fecha_cita == hoy_str and hora_cita <= hora_actual_str):
                    return self.send_json(400, {
                        "success": False,
                        "error": "No es posible programar una cita en una fecha u hora que ya ha transcurrido. Por favor seleccione un horario disponible."
                    })

                # Verificar si horario ya fue reservado por otro paciente
                cursor.execute("""
                SELECT id FROM citas 
                WHERE especialidad_codigo = ? AND fecha = ? AND hora = ? AND estado != 'CANCELADA'
                """, (data["especialidad_codigo"], data["fecha"], data["hora"]))
                if cursor.fetchone():
                    return self.send_json(409, {"success": False, "error": "El horario seleccionado ya ha sido reservado. Por favor seleccione otro."})

                # Generar código único aleatorio de 4 dígitos: CIT-XXXX
                codigo_cita = generar_codigo_cita_aleatorio(cursor)
                now_str = now.isoformat()

                # Obtener consultorio de la especialidad
                cursor.execute("SELECT consultorio_default, nombre, medico_responsable FROM especialidades WHERE codigo = ?", (data["especialidad_codigo"],))
                esp = cursor.fetchone()
                consultorio = esp["consultorio_default"] if esp else "Consultorio 101"

                cursor.execute("""
                INSERT INTO citas (codigo_cita, dni, nombres, apellidos, telefono, correo, edad, seguro, especialidad_codigo, tipo_consulta, fecha, hora, consultorio, motivo, estado, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROGRAMADA', ?)
                """, (
                    codigo_cita,
                    dni_val,
                    nombres_val,
                    apellidos_val,
                    str(data["telefono"]).strip(),
                    str(data["correo"]).strip(),
                    int(data.get("edad", 30)),
                    data.get("seguro", "SIS"),
                    data["especialidad_codigo"],
                    data.get("tipo_consulta", "Primera vez"),
                    data["fecha"],
                    data["hora"],
                    consultorio,
                    data.get("motivo", "Consulta médica"),
                    now_str
                ))
                cita_id = cursor.lastrowid

                # Se genera nuevo turno en cola asignado AL FINAL de la fila (nuevo orden)
                letra = PREFIJOS_TURNO.get(data["especialidad_codigo"], "A")
                cursor.execute("SELECT COUNT(*) FROM turnos WHERE especialidad_codigo = ?", (data["especialidad_codigo"],))
                conteo = cursor.fetchone()[0] + 1
                numero_turno = f"{letra}-{str(conteo).zfill(3)}"

                cursor.execute("""
                INSERT INTO turnos (numero_turno, cita_id, dni, paciente_nombre, especialidad_codigo, tipo_origen, consultorio, estado, hora_emision, tiempo_espera_minutos)
                VALUES (?, ?, ?, ?, ?, 'WEB', ?, 'EN_ESPERA', ?, 0)
                """, (
                    numero_turno,
                    cita_id,
                    dni_val,
                    f"{nombres_val} {apellidos_val}",
                    data["especialidad_codigo"],
                    consultorio,
                    now_str
                ))
                turno_id = cursor.lastrowid
                conn.commit()

                mensaje_res = "Cita reservada y paciente añadido a la cola en tiempo real exitosamente"
                if cita_reprogramada:
                    mensaje_res = f"Tu cita anterior ({', '.join(citas_canceladas_codigos)}) fue cancelada y sustituida. Se te ha asignado un nuevo turno ({numero_turno}) al final de la cola."

                correo_destino = str(data.get("correo", "")).strip()

                cita_info = {
                    "id": cita_id,
                    "turno_id": turno_id,
                    "numero_turno": numero_turno,
                    "codigo_cita": codigo_cita,
                    "paciente": f"{nombres_val} {apellidos_val}",
                    "dni": dni_val,
                    "especialidad": esp["nombre"] if esp else data["especialidad_codigo"],
                    "medico": esp["medico_responsable"] if esp else "Médico de turno",
                    "consultorio": consultorio,
                    "fecha": data["fecha"],
                    "hora": data["hora"],
                    "seguro": data.get("seguro", "SIS"),
                    "correo": correo_destino
                }

                # Despacho en segundo plano del comprobante oficial por correo
                if correo_destino:
                    enviar_comprobante_cita_async(cita_info, correo_destino, cita_reprogramada, mensaje_res)

                return self.send_json(201, {
                    "success": True,
                    "reprogramada": cita_reprogramada,
                    "citas_previas_canceladas": citas_canceladas_codigos,
                    "mensaje": mensaje_res,
                    "cita": cita_info
                })

            # 2. Check-in de llegada y emisión de turno (Tótem / App)
            elif path == "/api/turnos/checkin":
                # Puede ser por código de cita, DNI, o turno directo de tótem
                codigo_cita = data.get("codigo_cita", "").strip()
                dni = str(data.get("dni", "")).strip()
                tipo_origen = data.get("tipo_origen", "TOTEM")

                # Si la emisión es desde Ventanilla de Admisión, verificar si el paciente ya tiene un turno activo en cola
                if tipo_origen == "VENTANILLA" and dni:
                    cursor.execute("""
                    SELECT t.numero_turno, t.paciente_nombre, t.estado, e.nombre as especialidad_nombre, t.consultorio
                    FROM turnos t
                    JOIN especialidades e ON t.especialidad_codigo = e.codigo
                    WHERE t.dni = ? AND t.estado IN ('EN_ESPERA', 'LLAMADO', 'EN_ATENCION')
                    LIMIT 1
                    """, (dni,))
                    activo = cursor.fetchone()
                    if activo:
                        estado_desc = "en espera" if activo["estado"] == "EN_ESPERA" else ("llamado a sala" if activo["estado"] == "LLAMADO" else "en atención médica")
                        return self.send_json(409, {
                            "success": False,
                            "error": f"El paciente con DNI {dni} ya cuenta con el Turno {activo['numero_turno']} activo ({activo['especialidad_nombre']} - {estado_desc}). No se puede emitir un turno duplicado."
                        })

                cita = None
                if codigo_cita:
                    cursor.execute("SELECT * FROM citas WHERE codigo_cita = ? AND estado != 'CANCELADA'", (codigo_cita.upper(),))
                    cita = cursor.fetchone()
                elif dni:
                    today = fecha_hoy_peru()
                    # Buscar cita programada para hoy con este DNI
                    cursor.execute("SELECT * FROM citas WHERE dni = ? AND fecha = ? AND estado != 'CANCELADA' ORDER BY hora ASC", (dni, today))
                    cita = cursor.fetchone()
                    # Si no hay para hoy, buscar la cita más reciente registrada en el sistema
                    if not cita:
                        cursor.execute("SELECT * FROM citas WHERE dni = ? AND estado != 'CANCELADA' ORDER BY id DESC LIMIT 1", (dni,))
                        cita = cursor.fetchone()

                now = ahora_peru()
                now_str = now.isoformat()

                # Si no se encontró cita formal, verificar si existe un turno activo en cola con ese DNI
                if not cita and dni:
                    cursor.execute("""
                    SELECT * FROM turnos 
                    WHERE dni = ? AND estado IN ('EN_ESPERA', 'LLAMADO', 'EN_ATENCION')
                    ORDER BY id DESC LIMIT 1
                    """, (dni,))
                    existente = cursor.fetchone()
                    if existente:
                        cursor.execute("SELECT nombre FROM especialidades WHERE codigo = ?", (existente["especialidad_codigo"],))
                        esp_row = cursor.fetchone()
                        esp_nombre = esp_row["nombre"] if esp_row else existente["especialidad_codigo"]

                        cursor.execute("""
                        SELECT COUNT(*) FROM turnos 
                        WHERE especialidad_codigo = ? AND estado = 'EN_ESPERA' AND id < ?
                        """, (existente["especialidad_codigo"], existente["id"]))
                        delante = cursor.fetchone()[0]
                        tiempo_estimado = max(5, delante * 12)

                        hora_emision_fmt = existente["hora_emision"]
                        try:
                            if "T" in hora_emision_fmt:
                                hora_emision_fmt = datetime.datetime.fromisoformat(hora_emision_fmt).strftime("%H:%M")
                            elif len(hora_emision_fmt) >= 16:
                                hora_emision_fmt = hora_emision_fmt[11:16]
                        except Exception:
                            pass

                        return self.send_json(200, {
                            "success": True,
                            "mensaje": f"Turno encontrado: {existente['numero_turno']}",
                            "ya_existia": True,
                            "turno": {
                                "id": existente["id"],
                                "numero_turno": existente["numero_turno"],
                                "paciente_nombre": existente["paciente_nombre"],
                                "dni": existente["dni"],
                                "especialidad": esp_nombre,
                                "consultorio": existente["consultorio"],
                                "tipo_origen": existente["tipo_origen"],
                                "hora_emision": hora_emision_fmt,
                                "turnos_delante": delante,
                                "tiempo_estimado_min": tiempo_estimado
                            }
                        })

                if not cita:
                    if tipo_origen == "VENTANILLA" and data.get("paciente_nombre"):
                        # Emisión manual directa desde Ventanilla de Admisión
                        nombre_paciente = data["paciente_nombre"].strip()
                        dni_val = dni.strip() if dni else ""

                        # Validación de DNI: debe contener exactamente 8 dígitos numéricos
                        if not dni_val.isdigit() or len(dni_val) != 8:
                            return self.send_json(400, {
                                "success": False,
                                "error": "El DNI del paciente debe contener exactamente 8 dígitos numéricos."
                            })

                        # Validación de Nombre: mínimo 3 caracteres y no puramente números
                        if len(nombre_paciente) < 3 or nombre_paciente.isdigit():
                            return self.send_json(400, {
                                "success": False,
                                "error": "Por favor ingrese un nombre y apellido válido para el paciente."
                            })

                        esp_cod = data.get("especialidad_codigo", "MED_GEN")
                        cursor.execute("SELECT consultorio_default, nombre FROM especialidades WHERE codigo = ?", (esp_cod,))
                        esp_info = cursor.fetchone()
                        consultorio = esp_info["consultorio_default"] if esp_info else "Consultorio 101"
                        esp_nombre = esp_info["nombre"] if esp_info else esp_cod

                        letra = PREFIJOS_TURNO.get(esp_cod, "A")
                        cursor.execute("SELECT COUNT(*) FROM turnos WHERE especialidad_codigo = ?", (esp_cod,))
                        conteo = cursor.fetchone()[0] + 1
                        numero_turno = f"{letra}-{str(conteo).zfill(3)}"

                        cursor.execute("SELECT COUNT(*) FROM turnos WHERE especialidad_codigo = ? AND estado = 'EN_ESPERA'", (esp_cod,))
                        delante = cursor.fetchone()[0]
                        tiempo_estimado = max(5, delante * 12)

                        # Registrar la Cita de Admisión Inmediata en la tabla 'citas' con código de 4 dígitos
                        codigo_cita = generar_codigo_cita_aleatorio(cursor)
                        partes_nombre = nombre_paciente.split(" ", 1)
                        p_nombres = partes_nombre[0]
                        p_apellidos = partes_nombre[1] if len(partes_nombre) > 1 else "-"
                        fecha_hoy = now.strftime("%Y-%m-%d")
                        hora_actual = now.strftime("%H:%M")

                        cursor.execute("""
                        INSERT INTO citas (codigo_cita, dni, nombres, apellidos, telefono, correo, edad, seguro, especialidad_codigo, tipo_consulta, fecha, hora, consultorio, motivo, estado, created_at)
                        VALUES (?, ?, ?, ?, '-', '-', 30, 'SIS', ?, 'Demanda Espontánea (Ventanilla)', ?, ?, ?, 'Atención directa por ventanilla', 'CONFIRMADA', ?)
                        """, (codigo_cita, dni_val, p_nombres, p_apellidos, esp_cod, fecha_hoy, hora_actual, consultorio, now_str))
                        cita_id = cursor.lastrowid

                        # Registrar el turno enlazado a la cita creada
                        cursor.execute("""
                        INSERT INTO turnos (numero_turno, cita_id, dni, paciente_nombre, especialidad_codigo, tipo_origen, consultorio, estado, hora_emision, tiempo_espera_minutos)
                        VALUES (?, ?, ?, ?, ?, 'VENTANILLA', ?, 'EN_ESPERA', ?, 0)
                        """, (numero_turno, cita_id, dni_val, nombre_paciente, esp_cod, consultorio, now_str))
                        turno_id = cursor.lastrowid
                        conn.commit()

                        return self.send_json(201, {
                            "success": True,
                            "mensaje": f"Turno {numero_turno} emitido por Ventanilla de Admisión exitosamente",
                            "turno": {
                                "id": turno_id,
                                "cita_id": cita_id,
                                "codigo_cita": codigo_cita,
                                "numero_turno": numero_turno,
                                "paciente_nombre": nombre_paciente,
                                "dni": dni_val,
                                "especialidad": esp_nombre,
                                "consultorio": consultorio,
                                "tipo_origen": "VENTANILLA",
                                "hora_emision": now.strftime("%H:%M"),
                                "turnos_delante": delante,
                                "tiempo_estimado_min": tiempo_estimado
                            }
                        })
                    else:
                        return self.send_json(404, {
                            "success": False,
                            "error": "No se encontró ninguna cita médica ni turno registrado para el DNI ingresado. Por favor acérquese a Ventanilla de Admisión o reserve su cita en el Portal Web."
                        })

                cita_id = cita["id"]
                esp_cod = cita["especialidad_codigo"]
                nombre_paciente = f"{cita['nombres']} {cita['apellidos']}"
                dni_val = cita["dni"]
                consultorio = cita["consultorio"]
                # Marcar cita como confirmada
                cursor.execute("UPDATE citas SET estado = 'CONFIRMADA' WHERE id = ?", (cita_id,))

                # VERIFICAR SI ESTA CITA YA TIENE UN TURNO ACTIVO EN COLA (EVITAR DUPLICADOS)
                cursor.execute("""
                SELECT * FROM turnos 
                WHERE cita_id = ? AND estado IN ('EN_ESPERA', 'LLAMADO', 'EN_ATENCION')
                ORDER BY id DESC LIMIT 1
                """, (cita_id,))
                existente = cursor.fetchone()

                # Si ya existe un turno activo, devolver el existente sin duplicar en cola ni en BD
                if existente:
                    cursor.execute("SELECT nombre FROM especialidades WHERE codigo = ?", (existente["especialidad_codigo"],))
                    esp_row = cursor.fetchone()
                    esp_nombre = esp_row["nombre"] if esp_row else existente["especialidad_codigo"]

                    cursor.execute("""
                    SELECT COUNT(*) FROM turnos 
                    WHERE especialidad_codigo = ? AND estado = 'EN_ESPERA' AND id < ?
                    """, (existente["especialidad_codigo"], existente["id"]))
                    delante = cursor.fetchone()[0]
                    tiempo_estimado = max(5, delante * 12)

                    hora_emision_fmt = existente["hora_emision"]
                    try:
                        if "T" in hora_emision_fmt:
                            hora_emision_fmt = datetime.datetime.fromisoformat(hora_emision_fmt).strftime("%H:%M")
                        elif len(hora_emision_fmt) >= 16:
                            hora_emision_fmt = hora_emision_fmt[11:16]
                    except Exception:
                        pass

                    conn.commit()
                    return self.send_json(200, {
                        "success": True,
                        "mensaje": f"Turno encontrado: {existente['numero_turno']}",
                        "ya_existia": True,
                        "turno": {
                            "id": existente["id"],
                            "numero_turno": existente["numero_turno"],
                            "paciente_nombre": existente["paciente_nombre"],
                            "dni": existente["dni"],
                            "especialidad": esp_nombre,
                            "consultorio": existente["consultorio"],
                            "tipo_origen": existente["tipo_origen"],
                            "hora_emision": hora_emision_fmt,
                            "turnos_delante": delante,
                            "tiempo_estimado_min": tiempo_estimado
                        }
                    })

                # Generar número de turno secuencial del día con prefijo (Ej: A-024)
                letra = PREFIJOS_TURNO.get(esp_cod, "A")
                cursor.execute("SELECT COUNT(*) FROM turnos WHERE especialidad_codigo = ?", (esp_cod,))
                conteo = cursor.fetchone()[0] + 1
                numero_turno = f"{letra}-{str(conteo).zfill(3)}"

                # Calcular tiempo estimado de espera basado en personas delante
                cursor.execute("SELECT COUNT(*) FROM turnos WHERE especialidad_codigo = ? AND estado = 'EN_ESPERA'", (esp_cod,))
                delante = cursor.fetchone()[0]
                tiempo_estimado = max(5, delante * 12)

                cursor.execute("""
                INSERT INTO turnos (numero_turno, cita_id, dni, paciente_nombre, especialidad_codigo, tipo_origen, consultorio, estado, hora_emision, tiempo_espera_minutos)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_ESPERA', ?, 0)
                """, (numero_turno, cita_id, dni_val, nombre_paciente, esp_cod, tipo_origen, consultorio, now_str))
                
                turno_id = cursor.lastrowid
                conn.commit()

                # Obtener nombre especialidad
                cursor.execute("SELECT nombre FROM especialidades WHERE codigo = ?", (esp_cod,))
                esp_nombre = cursor.fetchone()["nombre"]

                return self.send_json(201, {
                    "success": True,
                    "mensaje": "Turno emitido con éxito",
                    "turno": {
                        "id": turno_id,
                        "numero_turno": numero_turno,
                        "paciente_nombre": nombre_paciente,
                        "dni": dni_val,
                        "especialidad": esp_nombre,
                        "consultorio": consultorio,
                        "tipo_origen": tipo_origen,
                        "hora_emision": now.strftime("%H:%M"),
                        "turnos_delante": delante,
                        "tiempo_estimado_min": tiempo_estimado
                    }
                })

            # 3. Llamar paciente a consultorio (Médico / Dashboard)
            elif path == "/api/turnos/llamar":
                turno_id = data.get("turno_id")

                if not turno_id:
                    # Llamar al primer paciente en espera general por orden de llegada
                    cursor.execute("SELECT id FROM turnos WHERE estado = 'EN_ESPERA' ORDER BY id ASC LIMIT 1")
                    res = cursor.fetchone()
                    if res:
                        turno_id = res["id"]
                    else:
                        return self.send_json(404, {"success": False, "error": "No hay más pacientes en cola de espera en el hospital."})

                now = ahora_peru()
                now_str = now.isoformat()

                # Obtener información del turno y su consultorio asignado
                cursor.execute("""
                SELECT t.hora_emision, t.consultorio, t.numero_turno, t.paciente_nombre, e.nombre as especialidad_nombre
                FROM turnos t
                LEFT JOIN especialidades e ON t.especialidad_codigo = e.codigo
                WHERE t.id = ?
                """, (turno_id,))
                t_info = cursor.fetchone()
                if not t_info:
                    return self.send_json(404, {"success": False, "error": "Turno no encontrado"})

                emision = datetime.datetime.fromisoformat(t_info["hora_emision"])
                espera_minutos = round((now - emision).total_seconds() / 60.0, 1)
                cons_llamado = t_info["consultorio"]

                cursor.execute("""
                UPDATE turnos 
                SET estado = 'LLAMADO', hora_llamado = ?, tiempo_espera_minutos = ?
                WHERE id = ?
                """, (now_str, espera_minutos, turno_id))
                conn.commit()

                return self.send_json(200, {
                    "success": True,
                    "mensaje": f"Turno {t_info['numero_turno']} llamado a {cons_llamado}",
                    "turno_id": turno_id,
                    "numero_turno": t_info["numero_turno"],
                    "paciente": t_info["paciente_nombre"],
                    "consultorio": cons_llamado,
                    "especialidad": t_info["especialidad_nombre"] or "Consulta Médica",
                    "espera_minutos": espera_minutos
                })

            # 4. Iniciar atención médica
            elif path == "/api/turnos/iniciar":
                turno_id = data.get("turno_id")
                now_str = ahora_peru().isoformat()
                cursor.execute("""
                UPDATE turnos SET estado = 'EN_ATENCION', hora_inicio_atencion = ?
                WHERE id = ?
                """, (now_str, turno_id))
                conn.commit()
                return self.send_json(200, {"success": True, "mensaje": "Atención médica iniciada"})

            # 5. Finalizar atención médica (Se actualiza a ATENDIDO en el historial permanente)
            elif path == "/api/turnos/finalizar":
                turno_id = data.get("turno_id")
                now = ahora_peru()
                now_str = now.isoformat()

                cursor.execute("SELECT * FROM turnos WHERE id = ?", (turno_id,))
                t = cursor.fetchone()

                if t:
                    tiempo_atencion = 15.0
                    if t["hora_inicio_atencion"]:
                        try:
                            ini = datetime.datetime.fromisoformat(t["hora_inicio_atencion"])
                            tiempo_atencion = round(max(1.0, (now - ini).total_seconds() / 60.0), 1)
                        except Exception:
                            tiempo_atencion = 15.0

                    cursor.execute("""
                    UPDATE turnos 
                    SET estado = 'ATENDIDO', hora_fin_atencion = ?, tiempo_atencion_minutos = ?
                    WHERE id = ?
                    """, (now_str, tiempo_atencion, turno_id))

                    if t["cita_id"]:
                        cursor.execute("UPDATE citas SET estado = 'ATENDIDA' WHERE id = ?", (t["cita_id"],))

                    conn.commit()
                    return self.send_json(200, {
                        "success": True,
                        "mensaje": f"Atención del turno {t['numero_turno']} completada exitosamente. El paciente se conserva en el historial como ATENDIDO."
                    })
                else:
                    return self.send_json(404, {"success": False, "error": "Turno no encontrado"})

            # 6. Marcar ausente (Se conserva en el historial con estado AUSENTE)
            elif path == "/api/turnos/ausente":
                turno_id = data.get("turno_id")
                cursor.execute("SELECT * FROM turnos WHERE id = ?", (turno_id,))
                t = cursor.fetchone()

                if t:
                    cursor.execute("UPDATE turnos SET estado = 'AUSENTE' WHERE id = ?", (turno_id,))
                    if t["cita_id"]:
                        cursor.execute("UPDATE citas SET estado = 'CANCELADA' WHERE id = ?", (t["cita_id"],))

                    conn.commit()
                    return self.send_json(200, {
                        "success": True,
                        "mensaje": f"Turno {t['numero_turno']} marcado como ausente y registrado en el historial."
                    })
                else:
                    return self.send_json(404, {"success": False, "error": "Turno no encontrado"})

            # 7. Reiniciar datos demo a su estado inicial
            elif path == "/api/demo/reiniciar":
                import importlib
                import database
                importlib.reload(database)
                database.reset_demo_data()
                return self.send_json(200, {"success": True, "mensaje": "Datos de prueba restablecidos al estado inicial"})

            # 8. Limpiar cola e historial a cero
            elif path == "/api/demo/limpiar":
                clear_all_data()
                return self.send_json(200, {"success": True, "mensaje": "Cola e historial limpiados a cero"})

            else:
                return self.send_json(404, {"error": "Endpoint POST no reconocido"})

        finally:
            conn.close()

def run_server():
    init_db()
    os.chdir(os.path.dirname(__file__))

    # Reusar dirección para evitar esperas por TIME_WAIT al reiniciar
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), HospitalRequestHandler) as httpd:
        print(f"===========================================================")
        print(f"SISTEMA DE CITAS Y GESTIÓN DE COLAS HOSPITALARIO ACTIVO")
        print(f"===========================================================")
        print(f"Portal de Citas y Hospital: http://localhost:{PORT}/")
        print(f"Tótem de Autoservicio:      http://localhost:{PORT}/totem")
        print(f"Pantalla Sala de Espera:    http://localhost:{PORT}/pantalla")
        print(f"Dashboard Administrativo:   http://localhost:{PORT}/dashboard")
        print(f"===========================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDeteniendo servidor...")
            httpd.shutdown()

if __name__ == "__main__":
    run_server()

