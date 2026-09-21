export interface EmailTemplatePreset {
  id: string;
  name: string;
  description: string;
  accent: string;
  subject: string;
  html: string;
}

export const EMAIL_TEMPLATES: EmailTemplatePreset[] = [
  {
    id: "corporativa",
    name: "Corporativa",
    description: "Logo superior, tarjeta contenedora, botón CTA y firma.",
    accent: "#0b1220",
    subject: "Propuesta de colaboración para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="background:#0b1220;padding:22px 28px;text-align:center;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">{{empresa_remitente}}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 28px;">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#0f172a;">Hola {{nombre}},</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
          En <strong>{{empresa_remitente}}</strong> acompañamos a organizaciones como <strong>{{empresa}}</strong> en {{ciudad}} a alcanzar sus objetivos con soluciones a medida.
        </p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;">
          Me gustaría coordinar una breve reunión para mostrarle cómo podemos generar valor en <strong>{{empresa}}</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:10px;background:#059669;">
              <a href="https://tudominio.com" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Agendar una reunión</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#334155;">Quedo atento a su respuesta.</p>
        <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Saludos cordiales,<br />
          <strong style="color:#0f172a;">{{remitente}}</strong><br />
          <a href="mailto:{{correo_remitente}}" style="color:#059669;text-decoration:none;">{{correo_remitente}}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:16px 28px;text-align:center;font-size:12px;color:#94a3b8;">
        {{empresa_remitente}} · Todos los derechos reservados
      </td>
    </tr>
  </table>
</div>`,
  },
  {
    id: "carta",
    name: "Carta Comercial",
    description: "Texto limpio y minimalista con firma profesional.",
    accent: "#1e293b",
    subject: "Una propuesta pensada para {{empresa}}",
    html: `<div style="margin:0;padding:24px;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#1e293b;">
  <div style="max-width:580px;margin:0 auto;font-size:16px;line-height:1.75;">
    <p style="margin:0 0 18px;color:#64748b;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;">{{ciudad}}</p>
    <p style="margin:0 0 18px;">Estimado/a {{nombre}}:</p>
    <p style="margin:0 0 18px;">
      Me dirijo a usted para presentarle nuestra propuesta de servicios, pensada especialmente para <strong>{{empresa}}</strong>. Creemos que podemos aportar una mejora concreta a su operación actual.
    </p>
    <p style="margin:0 0 18px;">
      El objetivo de esta carta es simplemente abrir la conversación: si lo considera oportuno, con gusto puedo compartirle más detalles y ejemplos de casos similares.
    </p>
    <p style="margin:0 0 18px;">Agradezco de antemano su tiempo y quedo a su entera disposición.</p>
    <p style="margin:28px 0 0;">Atentamente,</p>
    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">
      <strong style="font-size:16px;color:#0f172a;">{{remitente}}</strong><br />
      <span style="font-size:13px;color:#64748b;">{{empresa_remitente}}</span><br />
      <a href="mailto:{{correo_remitente}}" style="font-size:13px;color:#2563eb;text-decoration:none;">{{correo_remitente}}</a>
    </p>
  </div>
</div>`,
  },
  {
    id: "promocional",
    name: "Promocional",
    description: "Enfocada en conversión con bloque de beneficios.",
    accent: "#7c3aed",
    subject: "{{empresa}}: una oportunidad para crecer",
    html: `<div style="margin:0;padding:24px;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ddd6fe;">
    <tr>
      <td style="background:#7c3aed;padding:30px 28px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ddd6fe;">Propuesta de servicio</p>
        <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;">Potenciá {{empresa}} junto a {{empresa_remitente}}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px;">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
          Hola {{nombre}}, vimos que <strong>{{empresa}}</strong> está creciendo en {{ciudad}} y queremos acompañar ese proceso con una solución a tu medida.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">✅ &nbsp;Más alcance y nuevos clientes</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">⚡ &nbsp;Procesos más rápidos y ordenados</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:15px;line-height:1.6;color:#334155;">📈 &nbsp;Resultados medibles desde el primer mes</td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius:10px;background:#7c3aed;">
              <a href="https://tudominio.com" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Quiero más información</a>
            </td>
          </tr>
        </table>
        <p style="margin:26px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Un saludo,<br />
          <strong style="color:#1e1b4b;">{{remitente}}</strong><br />
          <a href="mailto:{{correo_remitente}}" style="color:#7c3aed;text-decoration:none;">{{correo_remitente}}</a>
        </p>
      </td>
    </tr>
  </table>
</div>`,
  },
];
