"""
Servicio oficial de despacho de correos electrónicos para el Hospital Nacional.
Gestiona el envío de comprobantes de cita vía SMTP seguro (Gmail / MINSA).
"""

import os
import smtplib
import ssl
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any

# Configuración SMTP
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER", "hospital.minsa.prot@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "iizd ghqh lsdy nplf")
SMTP_SENDER_NAME = os.environ.get("SMTP_SENDER_NAME", "Hospital Nacional - Sistema de Citas")

def generar_plantilla_html(cita: Dict[str, Any], reprogramada: bool = False, mensaje_reprogramada: str = "") -> str:
    """Genera la plantilla HTML responsive para el comprobante de cita."""
    codigo_cita = cita.get("codigo_cita", "CIT-0000")
    paciente = cita.get("paciente", "Paciente")
    dni = cita.get("dni", "00000000")
    especialidad = cita.get("especialidad", "Medicina General")
    consultorio = cita.get("consultorio", "Consultorio 101")
    medico = cita.get("medico", "Médico de Turno")
    seguro = cita.get("seguro", "SIS")
    fecha = cita.get("fecha", "")
    hora = cita.get("hora", "")
    turno = cita.get("numero_turno", "-")

    banner_reprogramada = ""
    if reprogramada:
        banner_reprogramada = f"""
        <div style="background-color: #fffbeb; border: 1px solid #fcd34d; color: #92400e; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; text-align: left;">
            <strong>Aviso de Reprogramación:</strong> {mensaje_reprogramada or 'Su cita anterior fue sustituida y se le ha asignado un nuevo turno al final de la cola.'}
        </div>
        """

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprobante Oficial de Cita</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
          
          <!-- Encabezado Institucional -->
          <tr>
            <td style="background-color: #0284c7; padding: 24px; text-align: center; color: #ffffff;">
              <div style="font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; opacity: 0.9;">Ministerio de Salud / EsSalud</div>
              <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #ffffff;">HOSPITAL NACIONAL</h1>
              <div style="font-size: 13px; opacity: 0.85; margin-top: 4px;">Sistema Integrado de Citas y Gestión de Espera</div>
            </td>
          </tr>

          <!-- Contenido Principal -->
          <tr>
            <td style="padding: 28px 24px;">
              
              {banner_reprogramada}

              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
                  Comprobante Oficial de Cita
                </span>
                <div style="font-size: 32px; font-weight: 800; color: #0284c7; letter-spacing: 1px; margin-top: 8px;">
                  {codigo_cita}
                </div>
                <div style="font-size: 13px; color: #64748b;">Presente este código al llegar al hospital</div>
              </div>

              <!-- Tarjeta de Detalles -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; border-collapse: separate;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; width: 40%; font-size: 13px; color: #64748b; font-weight: 600;">Paciente</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; font-weight: 700;">{paciente}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">DNI</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; font-weight: 600;">{dni}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">Especialidad</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0284c7; font-weight: 700;">{especialidad}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">Consultorio</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; font-weight: 600;">{consultorio}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">Médico Responsable</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; font-weight: 600;">{medico}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">Seguro Médico</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; font-weight: 600;">{seguro}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; font-weight: 600;">Fecha Programada</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0369a1; font-weight: 700;">{fecha}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600;">Hora de Atención</td>
                  <td style="padding: 12px 16px; font-size: 14px; color: #0369a1; font-weight: 700;">{hora}</td>
                </tr>
              </table>

              <!-- Destacado de Turno Asignado -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <div style="font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.5px;">Turno Asignado en Cola de Espera</div>
                    <div style="font-size: 12px; color: #065f46; margin-top: 2px;">Ingresado a la sala de espera en tiempo real</div>
                  </td>
                  <td align="right" style="padding: 14px 18px;">
                    <div style="font-size: 26px; font-weight: 900; color: #047857;">{turno}</div>
                  </td>
                </tr>
              </table>

              <!-- Indicaciones al Paciente -->
              <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 16px; border-radius: 4px; font-size: 13px; color: #475569; margin-bottom: 20px;">
                <strong style="color: #0f172a; display: block; margin-bottom: 6px;">Indicaciones para su atención:</strong>
                <ul style="margin: 0; padding-left: 18px; line-height: 1.6;">
                  <li>Presentarse con 15 minutos de anticipación en el consultorio indicado.</li>
                  <li>Portar su DNI físico y carné o constancia de seguro ({seguro}).</li>
                  <li>Puede mostrar este comprobante en su teléfono móvil o consultar su turno en los tótems del hospital.</li>
                </ul>
              </div>

            </td>
          </tr>

          <!-- Pie de Página Institucional -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">Hospital Nacional - Sistema Integrado de Salud</p>
              <p style="margin: 0;">Este es un mensaje automático generado por el sistema de citas hospitalarias. Por favor no responder a este correo.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return html

def generar_texto_plano(cita: Dict[str, Any], reprogramada: bool = False, mensaje_reprogramada: str = "") -> str:
    """Genera versión en texto plano para clientes de correo básicos."""
    codigo_cita = cita.get("codigo_cita", "CIT-0000")
    paciente = cita.get("paciente", "Paciente")
    dni = cita.get("dni", "00000000")
    especialidad = cita.get("especialidad", "Medicina General")
    consultorio = cita.get("consultorio", "Consultorio 101")
    medico = cita.get("medico", "Médico de Turno")
    seguro = cita.get("seguro", "SIS")
    fecha = cita.get("fecha", "")
    hora = cita.get("hora", "")
    turno = cita.get("numero_turno", "-")

    lineas = [
        "HOSPITAL NACIONAL - COMPROBANTE OFICIAL DE CITA",
        "Ministerio de Salud / EsSalud",
        "=" * 50,
        f"CODIGO DE CITA: {codigo_cita}",
        f"TURNO ASIGNADO: {turno}",
        "=" * 50,
        f"Paciente: {paciente}",
        f"DNI: {dni}",
        f"Especialidad: {especialidad}",
        f"Consultorio: {consultorio}",
        f"Médico Responsable: {medico}",
        f"Seguro: {seguro}",
        f"Fecha Programada: {fecha}",
        f"Hora de Atención: {hora}",
        "=" * 50,
    ]
    if reprogramada:
        lineas.append(f"AVISO: {mensaje_reprogramada}")
        lineas.append("=" * 50)

    lineas.extend([
        "INDICACIONES:",
        "- Presentarse con 15 minutos de anticipación.",
        "- Portar DNI físico y acreditación de seguro.",
        "- Puede presentar este comprobante digital desde su teléfono.",
        "=" * 50,
        "Hospital Nacional - Atención al Ciudadano"
    ])
    return "\n".join(lineas)

def enviar_comprobante_cita(cita: Dict[str, Any], destinatario: str, reprogramada: bool = False, mensaje_reprogramada: str = "") -> bool:
    """Envía el comprobante oficial por correo electrónico vía SMTP seguro."""
    destinatario = (destinatario or "").strip()
    if not destinatario or "@" not in destinatario:
        print(f"[EMAIL] Destinatario no válido: '{destinatario}'. No se envía correo.")
        return False

    codigo_cita = cita.get("codigo_cita", "CIT-0000")
    paciente = cita.get("paciente", "Paciente")

    asunto = f"Comprobante Oficial de Cita Médica - {codigo_cita} - Hospital Nacional"
    if reprogramada:
        asunto = f"Cita Reprogramada - {codigo_cita} - Hospital Nacional"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = asunto
    msg["From"] = f"{SMTP_SENDER_NAME} <{SMTP_USER}>"
    msg["To"] = destinatario

    # Adjuntar versiones texto y HTML
    texto = generar_texto_plano(cita, reprogramada, mensaje_reprogramada)
    html = generar_plantilla_html(cita, reprogramada, mensaje_reprogramada)

    msg.attach(MIMEText(texto, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context, timeout=15) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [destinatario], msg.as_string())
        print(f"[EMAIL] Comprobante de cita {codigo_cita} enviado con éxito a {destinatario} ({paciente})")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Error enviando comprobante a {destinatario}: {e}")
        return False

def enviar_comprobante_cita_async(cita: Dict[str, Any], destinatario: str, reprogramada: bool = False, mensaje_reprogramada: str = "") -> None:
    """Envía el correo en segundo plano para no bloquear la respuesta HTTP del servidor."""
    t = threading.Thread(
        target=enviar_comprobante_cita,
        args=(cita, destinatario, reprogramada, mensaje_reprogramada),
        daemon=True
    )
    t.start()

