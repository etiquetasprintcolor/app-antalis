import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { pedidos } = data; // Expects an array of orders

    // Validate required fields
    if (!pedidos || !Array.isArray(pedidos) || pedidos.length === 0) {
      return NextResponse.json(
        { message: 'Faltan datos de pedidos para enviar el email' },
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

    // Calculate total cost
    const totalCost = pedidos.reduce((acc, p) => acc + Number(p.precioTotal), 0);

    // Generate table rows for each order
    const tableRows = pedidos.map(p => `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #111827; font-weight: 500;">
          ${p.referencia}
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 13px;">
          ${p.material} (${p.gramaje}g)<br>
          <span style="font-size: 11px; color: #9ca3af;">${p.formato || 'N/A'}</span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 13px;">
          ${p.cantidad}<br>
          <span style="font-size: 11px; color: #9ca3af;">(${p.tipoCompra})</span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #f3f4f6; color: #111827; font-weight: 600; text-align: right;">
          ${Number(p.precioTotal).toFixed(2)} €
        </td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #f7f9fa; padding: 20px; border-bottom: 1px solid #eaeaea;">
          <h2 style="margin: 0; color: #111827;">${pedidos.length > 1 ? 'Nuevos pedidos registrados' : 'Nuevo pedido registrado'}</h2>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Generado desde la App de Printcolor</p>
        </div>
        
        <div style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr>
                <th style="padding: 8px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-weight: 600; font-size: 13px; text-transform: uppercase;">Ref.</th>
                <th style="padding: 8px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-weight: 600; font-size: 13px; text-transform: uppercase;">Papel</th>
                <th style="padding: 8px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-weight: 600; font-size: 13px; text-transform: uppercase;">Cantidad</th>
                <th style="padding: 8px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-weight: 600; font-size: 13px; text-transform: uppercase; text-align: right;">Coste</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 16px 8px 8px 8px; text-align: right; color: #6b7280; font-weight: bold; font-size: 14px;">Total Estimado:</td>
                <td style="padding: 16px 8px 8px 8px; text-align: right; color: #111827; font-weight: bold; font-size: 18px;">${totalCost.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <div style="background-color: #f7f9fa; padding: 16px; text-align: center; border-top: 1px solid #eaeaea; color: #9ca3af; font-size: 12px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://printcolor-app-antalis.vercel.app'}" style="color: #3b82f6; text-decoration: none;">Ver en el Historial</a>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"Printcolor App" <${process.env.EMAIL_USER}>`,
      to: "leo.merino@printcolorweb.com",
      subject: pedidos.length > 1
        ? `Nuevos pedidos de papel (${pedidos.length} items)`
        : `Nuevo pedido de papel: ${pedidos[0].referencia}`,
      html: htmlContent,
    });

    console.log('Message sent: %s', info.messageId);

    return NextResponse.json({ message: 'Email enviado correctamente' }, { status: 200 });

  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor al enviar el email' },
      { status: 500 }
    );
  }
}
