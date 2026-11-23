"""
Módulo de Base de Datos para el Sistema Integrado de Citas y Gestión de Colas
Hospital Nacional - Innovación en Salud Pública
"""

import sqlite3
import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "hospital.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Tabla de Especialidades y Consultorios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS especialidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        consultorio_default TEXT NOT NULL,
        medico_responsable TEXT NOT NULL,
        duracion_estimada_min INTEGER DEFAULT 15,
        icono TEXT DEFAULT 'stethoscope'
    );
    """)

    # Tabla de Citas Médicas
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS citas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_cita TEXT UNIQUE NOT NULL,
        dni TEXT NOT NULL,
        nombres TEXT NOT NULL,
        apellidos TEXT NOT NULL,
        telefono TEXT NOT NULL,
        correo TEXT NOT NULL,
        edad INTEGER,
        seguro TEXT NOT NULL,
        especialidad_codigo TEXT NOT NULL,
        tipo_consulta TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        consultorio TEXT NOT NULL,
        motivo TEXT,
        estado TEXT DEFAULT 'PROGRAMADA',
        created_at TEXT NOT NULL
    );
    """)

    # Tabla de Turnos / Cola Virtual
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_turno TEXT UNIQUE NOT NULL,
        cita_id INTEGER,
        dni TEXT NOT NULL,
        paciente_nombre TEXT NOT NULL,
        especialidad_codigo TEXT NOT NULL,
        tipo_origen TEXT DEFAULT 'WEB',
        consultorio TEXT NOT NULL,
        estado TEXT DEFAULT 'EN_ESPERA',
        hora_emision TEXT NOT NULL,
        hora_llamado TEXT,
        hora_inicio_atencion TEXT,
        hora_fin_atencion TEXT,
        tiempo_espera_minutos REAL DEFAULT 0,
        tiempo_atencion_minutos REAL DEFAULT 0,
        FOREIGN KEY (cita_id) REFERENCES citas (id)
    );
    """)

    # Tabla de Auditoría / Registros de tiempos para validación
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS metricas_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER,
        evento TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        detalle TEXT
    );
    """)

    # Sembrar o actualizar catálogo a 8 especialidades completas
    cursor.execute("SELECT COUNT(*) FROM especialidades WHERE codigo = 'ODO'")
    if cursor.fetchone()[0] > 0:
        cursor.execute("DELETE FROM especialidades WHERE codigo = 'ODO'")
        cursor.execute("UPDATE citas SET especialidad_codigo = 'NEU', motivo = 'Evaluación neurológica y migrañas' WHERE especialidad_codigo = 'ODO'")
        cursor.execute("UPDATE turnos SET especialidad_codigo = 'NEU', numero_turno = 'N-001' WHERE especialidad_codigo = 'ODO'")

    cursor.execute("SELECT COUNT(*) FROM especialidades")
    if cursor.fetchone()[0] < 8:
        cursor.execute("DELETE FROM especialidades")
        seed_especialidades(cursor)

    # Asegurar que ningún turno inicie en atención ni llamado al arrancar el sistema
    cursor.execute("UPDATE turnos SET estado = 'EN_ESPERA', hora_llamado = NULL, hora_inicio_atencion = NULL WHERE estado IN ('EN_ATENCION', 'LLAMADO')")
    cursor.execute("UPDATE turnos SET numero_turno = 'A-021' WHERE numero_turno = 'A-022'")

    conn.commit()
    conn.close()
    print("Base de datos inicializada correctamente.")

def reset_demo_data():
    conn = get_connection()
    cursor = conn.cursor()
    # Limpiar tablas operativas
    cursor.execute("DELETE FROM turnos")
    cursor.execute("DELETE FROM citas")
    cursor.execute("DELETE FROM metricas_log")
    # Resetear secuencias de autoincrement
    cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('turnos', 'citas', 'metricas_log')")
    # Re-sembrar datos limpios iniciales
    seed_demo_data(cursor)
    conn.commit()
    conn.close()
    print("Base de datos restablecida exitosamente a su estado de demostración inicial.")

def clear_all_data():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM turnos")
    cursor.execute("DELETE FROM citas")
    cursor.execute("DELETE FROM metricas_log")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('turnos', 'citas', 'metricas_log')")
    conn.commit()
    conn.close()
    print("Base de datos (citas y turnos) limpiada completamente a cero.")

def seed_especialidades(cursor):
    especialidades = [
        ("MED_GEN", "Medicina General", "Atención integral primaria y preventiva", "Consultorio 101", "Dr. Carlos Mendoza P.", 15, "user-md"),
        ("PED", "Pediatría", "Salud y desarrollo de niños y adolescentes", "Consultorio 102", "Dra. Elena Ramos V.", 20, "baby"),
        ("GIN", "Ginecología y Obstetricia", "Salud integral de la mujer y maternidad", "Consultorio 103", "Dra. Sofía Alarcón S.", 20, "female"),
        ("CAR", "Cardiología", "Prevención y diagnóstico de salud cardiovascular", "Consultorio 201", "Dr. Roberto Vargas T.", 25, "heartbeat"),
        ("TRA", "Traumatología", "Atención del sistema músculo-esquelético", "Consultorio 202", "Dr. Javier Navarro L.", 20, "bone"),
        ("NEU", "Neurología", "Diagnóstico del sistema nervioso y cefaleas", "Consultorio 203", "Dr. Alejandro Vega R.", 25, "brain"),
        ("OFT", "Oftalmología", "Salud ocular y evaluación de visión", "Consultorio 301", "Dr. Fernando Ruiz B.", 15, "eye"),
        ("DER", "Dermatología", "Salud de la piel, alergias y cuidado cutáneo", "Consultorio 302", "Dra. Patricia Campos M.", 20, "shield")
    ]
    cursor.executemany("""
    INSERT INTO especialidades (codigo, nombre, descripcion, consultorio_default, medico_responsable, duracion_estimada_min, icono)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, especialidades)

def seed_demo_data(cursor):
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now()

    # Citas médicas programadas (representación completa del flujo hospitalario)
    citas_demo = [
        # Atendidos
        ("CIT-4821", "45879632", "Rosa María", "Quispe Flores", "987654321", "rosa.quispe@email.com", 45, "SIS", "MED_GEN", "Control", today, "08:00", "Consultorio 101", "Control de hipertensión", "ATENDIDA", now.isoformat()),
        ("CIT-7392", "73456789", "Camila Andrea", "Gómez Soto", "933221100", "camila.gomez@email.com", 26, "Particular", "NEU", "Primera vez", today, "08:15", "Consultorio 203", "Evaluación neurológica y migrañas", "ATENDIDA", now.isoformat()),
        # Ausente
        ("CIT-2654", "70123456", "Carmen Rosa", "Mendoza Ruiz", "966554433", "carmen.mendoza@email.com", 32, "EsSalud", "GIN", "Control prenatal", today, "08:30", "Consultorio 103", "Monitoreo ecográfico", "AUSENTE", now.isoformat()),
        # Cita anterior sustituida / cancelada al reprogramar (Patricio Anthony Miranda Zubieta)
        ("CIT-5192", "78945612", "Patricio Anthony", "Miranda Zubieta", "922110099", "patricio.miranda@email.com", 35, "SIS", "TRA", "Primera vez", today, "08:30", "Consultorio 202", "Evaluación de esguince [Sustituida por nueva reserva de cita]", "CANCELADA", (now - datetime.timedelta(minutes=65)).isoformat()),
        # En Espera (el primero Manuel Andrés listo para ser llamado en la demostración)
        ("CIT-8149", "41526374", "Manuel Andrés", "Alejo Narrea", "911223344", "manuel.alejo@email.com", 22, "SIS", "MED_GEN", "Primera vez", today, "08:45", "Consultorio 101", "Evaluación general médica", "CONFIRMADA", now.isoformat()),
        ("CIT-5936", "60987654", "Lucía Esperanza", "Castillo Ríos", "955443322", "lucia.castillo@email.com", 8, "SIS", "PED", "Primera vez", today, "09:00", "Consultorio 102", "Cuadro febril y tos", "CONFIRMADA", now.isoformat()),
        ("CIT-3718", "08765432", "Jorge Luis", "Morales Vera", "944332211", "jorge.morales@email.com", 62, "EsSalud", "CAR", "Lectura de resultados", today, "09:15", "Consultorio 201", "Electrocardiograma de rutina", "CONFIRMADA", now.isoformat()),
        # Cita nueva activa tras reprogramar (Patricio Anthony Miranda Zubieta con nuevo turno al final de la cola)
        ("CIT-6285", "78945612", "Patricio Anthony", "Miranda Zubieta", "922110099", "patricio.miranda@email.com", 35, "SIS", "TRA", "Control", today, "09:30", "Consultorio 202", "Revisión de esguince de tobillo", "CONFIRMADA", now.isoformat())
    ]

    cursor.executemany("""
    INSERT INTO citas (codigo_cita, dni, nombres, apellidos, telefono, correo, edad, seguro, especialidad_codigo, tipo_consulta, fecha, hora, consultorio, motivo, estado, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, citas_demo)

    # Tiempos simulados
    t_ate1_emision = (now - datetime.timedelta(minutes=50)).isoformat()
    t_ate1_llamado = (now - datetime.timedelta(minutes=42)).isoformat()
    t_ate1_inicio = (now - datetime.timedelta(minutes=40)).isoformat()
    t_ate1_fin = (now - datetime.timedelta(minutes=25)).isoformat()

    t_ate2_emision = (now - datetime.timedelta(minutes=45)).isoformat()
    t_ate2_llamado = (now - datetime.timedelta(minutes=35)).isoformat()
    t_ate2_inicio = (now - datetime.timedelta(minutes=33)).isoformat()
    t_ate2_fin = (now - datetime.timedelta(minutes=18)).isoformat()

    t_aus_emision = (now - datetime.timedelta(minutes=35)).isoformat()
    t_aus_llamado = (now - datetime.timedelta(minutes=22)).isoformat()
    t_aus_fin = (now - datetime.timedelta(minutes=15)).isoformat()

    t_reprog_emision = (now - datetime.timedelta(minutes=65)).isoformat()
    t_esp1 = (now - datetime.timedelta(minutes=14)).isoformat()
    t_esp2 = (now - datetime.timedelta(minutes=10)).isoformat()
    t_esp3 = (now - datetime.timedelta(minutes=6)).isoformat()
    t_esp4 = (now - datetime.timedelta(minutes=3)).isoformat()

    turnos_demo = [
        # 1. Atendido (Medicina General - Consultorio 101)
        ("A-020", 1, "45879632", "Rosa María Quispe Flores", "MED_GEN", "WEB", "Consultorio 101", "ATENDIDO", t_ate1_emision, t_ate1_llamado, t_ate1_inicio, t_ate1_fin, 8.0, 15.0),
        # 2. Atendido (Neurología - Consultorio 203)
        ("N-001", 2, "73456789", "Camila Andrea Gómez Soto", "NEU", "WEB", "Consultorio 203", "ATENDIDO", t_ate2_emision, t_ate2_llamado, t_ate2_inicio, t_ate2_fin, 10.0, 15.0),
        # 3. Ausente (Ginecología y Obstetricia - Consultorio 103)
        ("G-001", 3, "70123456", "Carmen Rosa Mendoza Ruiz", "GIN", "WEB", "Consultorio 103", "AUSENTE", t_aus_emision, t_aus_llamado, None, t_aus_fin, 13.0, 0),
        # 4. Turno anterior anulado por reprogramación (Traumatología - Consultorio 202)
        ("T-001", 4, "78945612", "Patricio Anthony Miranda Zubieta", "TRA", "WEB", "Consultorio 202", "CANCELADO", t_reprog_emision, None, None, None, 0, 0),
        # 5. En Espera (Medicina General - Consultorio 101) - EL PRIMERO A SER LLAMADO
        ("A-021", 5, "41526374", "Manuel Andrés Alejo Narrea", "MED_GEN", "WEB", "Consultorio 101", "EN_ESPERA", t_esp1, None, None, None, 14.0, 0),
        # 6. En Espera (Pediatría - Consultorio 102)
        ("P-001", 6, "60987654", "Lucía Esperanza Castillo Ríos", "PED", "WEB", "Consultorio 102", "EN_ESPERA", t_esp2, None, None, None, 10.0, 0),
        # 7. En Espera (Cardiología - Consultorio 201)
        ("C-001", 7, "08765432", "Jorge Luis Morales Vera", "CAR", "WEB", "Consultorio 201", "EN_ESPERA", t_esp3, None, None, None, 6.0, 0),
        # 8. En Espera (Traumatología - Consultorio 202) - CITA REPROGRAMADA CON NUEVO TURNO
        ("T-002", 8, "78945612", "Patricio Anthony Miranda Zubieta", "TRA", "WEB", "Consultorio 202", "EN_ESPERA", t_esp4, None, None, None, 3.0, 0)
    ]

    cursor.executemany("""
    INSERT INTO turnos (numero_turno, cita_id, dni, paciente_nombre, especialidad_codigo, tipo_origen, consultorio, estado, hora_emision, hora_llamado, hora_inicio_atencion, hora_fin_atencion, tiempo_espera_minutos, tiempo_atencion_minutos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, turnos_demo)

    # Auditoría / Métricas log
    logs_demo = [
        (1, "EMISION_TURNO", t_ate1_emision, "Turno A-020 emitido por WEB"),
        (1, "LLAMADO_PACIENTE", t_ate1_llamado, "Llamado a Consultorio 101"),
        (1, "INICIO_ATENCION", t_ate1_inicio, "Inicio atención clínica"),
        (1, "FIN_ATENCION", t_ate1_fin, "Atención completada con éxito"),
        (2, "EMISION_TURNO", t_ate2_emision, "Turno N-001 emitido por WEB"),
        (2, "LLAMADO_PACIENTE", t_ate2_llamado, "Llamado a Consultorio 203"),
        (2, "INICIO_ATENCION", t_ate2_inicio, "Inicio atención clínica"),
        (2, "FIN_ATENCION", t_ate2_fin, "Atención completada con éxito"),
        (3, "EMISION_TURNO", t_aus_emision, "Turno G-001 emitido por WEB"),
        (3, "LLAMADO_PACIENTE", t_aus_llamado, "Llamado a Consultorio 103"),
        (3, "MARCADO_AUSENTE", t_aus_fin, "Paciente ausente tras llamado"),
        (4, "CANCELACION_REPROGRAMACION", t_reprog_emision, "Turno T-001 cancelado al reprogramar cita para las 09:30"),
        (5, "EMISION_TURNO", t_esp1, "Turno A-021 emitido por WEB"),
        (6, "EMISION_TURNO", t_esp2, "Turno P-001 emitido por WEB"),
        (7, "EMISION_TURNO", t_esp3, "Turno C-001 emitido por WEB"),
        (8, "EMISION_TURNO", t_esp4, "Turno T-002 emitido por WEB (Reprogramación)")
    ]
    cursor.executemany("""
    INSERT INTO metricas_log (turno_id, evento, timestamp, detalle)
    VALUES (?, ?, ?, ?)
    """, logs_demo)

if __name__ == "__main__":
    init_db()

