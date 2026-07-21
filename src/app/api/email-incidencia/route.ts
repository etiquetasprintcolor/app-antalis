import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const {
      material,
      gramaje,
      formatoLibro,
      cantidadLibros,
      paginasPorLibro,
      hojasGastadas,
      costeEstimado,
      motivo,
      observaciones,
      numeroPedido
    } = data;

    // Validate required fields
    if (!material || !cantidadLibros || !paginasPorLibro || !motivo) {
      return NextResponse.json(
        { message: 'Faltan campos obligatorios para enviar el email' },
        { status: 400 }
      );
    }

    // Check if email credentials are provided
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('EMAIL_USER or EMAIL_PASS not configured. Skipping email notification.');
      return NextResponse.json(
        { message: 'Notificaciones por email deshabilitadas (falta configuración)' },
        { status: 200 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 24px; color: #ffffff;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">⚠️</span>
            <h2 style="margin: 0; font-size: 20px; font-weight: 700; tracking-wide: -0.025em;">Notificación de Incidencia Interna</h2>
          </div>
          <p style="margin: 4px 0 0 0; color: #fee2e2; font-size: 14px; opacity: 0.9;">Se ha registrado una repetición de trabajo en taller.</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px; background-color: #ffffff;">
          <p style="margin-top: 0; color: #374151; font-size: 15px; line-height: 1.5;">
            Se ha registrado una incidencia interna que requiere volver a imprimir y consumir papel. A continuación se detallan los datos:
          </p>

          <!-- Main Stats -->
          <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Número de Pedido:</td>
                <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${numeroPedido || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Motivo de Incidencia:</td>
                <td style="padding: 6px 0; color: #dc2626; font-weight: 700; text-align: right;">${motivo}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Cantidad a repetir:</td>
                <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${cantidadLibros} libros</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Páginas por libro:</td>
                <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${paginasPorLibro} págs</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Formato del Libro:</td>
                <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${formatoLibro}</td>
              </tr>
            </table>
          </div>

          <!-- Paper Details & Impact -->
          <h3 style="color: #1f2937; font-size: 14px; font-weight: 700; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">Papel y Consumo Estimado</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; margin-bottom: 24px;">
            <thead>
              <tr style="border-bottom: 2px solid #f3f4f6;">
                <th style="padding: 8px 0; color: #4b5563; font-weight: 600;">Descripción del Papel</th>
                <th style="padding: 8px 0; color: #4b5563; font-weight: 600; text-align: right;">Papel gastado</th>
                <th style="padding: 8px 0; color: #4b5563; font-weight: 600; text-align: right;">Coste pérdida</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                  <strong style="color: #111827;">${material}</strong><br>
                  <span style="color: #6b7280; font-size: 12px;">${gramaje}g/m²</span>
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #dc2626; font-weight: 600;">
                  ${Math.ceil(hojasGastadas).toLocaleString('es-ES')} hojas
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #111827; font-weight: 600;">
                  ${Number(costeEstimado).toFixed(2)} €
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Observations -->
          ${observaciones ? `
            <div style="margin-top: 16px; padding: 12px 16px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">
              <h4 style="margin: 0 0 6px 0; color: #b45309; font-size: 13px; font-weight: 700; text-transform: uppercase;">Observaciones / Notas adicionales:</h4>
              <p style="margin: 0; color: #78350f; font-size: 13px; line-height: 1.4; white-space: pre-line;">${observaciones}</p>
            </div>
          ` : ''}
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">Generado de forma automática desde la App Papel Printcolor.</p>
          <p style="margin: 4px 0 0 0;"><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://printcolor-app-antalis.vercel.app'}/incidencias" style="color: #2563eb; text-decoration: none; font-weight: 500;">Ver historial de incidencias</a></p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Printcolor App — Incidencias" <${process.env.EMAIL_USER}>`,
      to: 'archivos@printcolorweb.com',
      subject: `⚠️ Incidencia Interna — ${motivo}${numeroPedido ? ` (Pedido: ${numeroPedido})` : ''}`,
      html: htmlContent,
    });

    console.log('Incident notification email sent: %s', info.messageId);
    return NextResponse.json({ message: 'Email de incidencia enviado correctamente' }, { status: 200 });

  } catch (error) {
    console.error('Error sending incident email:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor al enviar el email de la incidencia' },
      { status: 500 }
    );
  }
}
