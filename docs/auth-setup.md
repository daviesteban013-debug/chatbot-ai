# Acceso con Google y correo de Nexo.ai

El código incluye Google, contraseña, reenvío de confirmación y entrada directa a Jarvis.
La plantilla de correo está en `supabase/templates/confirmation.html`. No se activa solo por subir el archivo a Vercel.

## Google

1. En Google Cloud → Google Auth Platform, configura la marca y el consentimiento para tu proyecto. Solicita únicamente identidad (email/profile/openid).
2. Crea un cliente OAuth de tipo **Aplicación web**.
3. Origen autorizado: `https://chatbot-ai-gold-two.vercel.app`.
4. URI de redirección de Google: `https://hdrjzcxlhpzpayhrjafk.supabase.co/auth/v1/callback`.
5. En Supabase → Authentication → Sign In / Providers → Google, introduce Client ID y Client Secret, activa Google y guarda. No actives “Skip nonce checks” ni “Allow users without an email”.
6. En modo Testing, añade las cuentas de prueba autorizadas. Para otros usuarios, publica el consentimiento según lo que Google pida.

No pegues secretos en Git, en capturas ni en el chat. No se necesita una clave de Google en el navegador ni en `.env.local` para este flujo.

## Destinos de autenticación

Supabase → Authentication → URL Configuration:

- Site URL: `https://chatbot-ai-gold-two.vercel.app`.
- Redirect URL: `https://chatbot-ai-gold-two.vercel.app/auth/callback`.

Usa destinos exactos de producción, sin comodines. Los enlaces anteriores emitidos hacia localhost deben reenviarse después del cambio.

## Envío real de correo

El SMTP predeterminado de Supabase restringe destinatarios a miembros del equipo y tiene un límite muy bajo. No sirve para registros públicos. Este proyecto Free necesita **custom SMTP** para modificar la plantilla.

1. Crea/configura un proveedor de correo y verifica el remitente/dominio según sus instrucciones (por ejemplo Resend o Brevo).
2. Copia sus ajustes SMTP directamente en Supabase → Authentication → Emails → SMTP Settings: host, puerto, usuario, contraseña SMTP, dirección y nombre del remitente. Usa **Nexo.ai · Jarvis** como nombre.
3. En Emails → Confirm sign up, asunto: **Tu Jarvis te espera — confirma tu correo**. Copia el HTML de `supabase/templates/confirmation.html` y guarda.
4. Conserva **Confirm email** activado. Desactiva el seguimiento de clics del proveedor para que no altere los enlaces de autenticación.
5. Prueba crear una cuenta con un correo ajeno al equipo, recibir el mensaje, confirmar, entrar a Jarvis y reenviar un enlace expirado.

La nueva plantilla abre `/auth/confirm` y verifica el token solo al pulsar el botón (POST). Una visita de un escáner de correo no consume la confirmación. También permite confirmar en otro navegador sin depender del verificador PKCE del registro original. Los correos antiguos siguen usando `/auth/callback`; abre esos enlaces en el navegador donde te registraste o solicita un correo nuevo después de activar la plantilla.

Un Gmail personal no equivale a tener un proveedor SMTP configurado. Si eliges Gmail SMTP, requiere verificación en dos pasos y una contraseña de aplicación, introducida por el propietario directamente en Supabase. No uses tu contraseña normal; sus cuotas y límites no son adecuados para un volumen grande de registros.

Documentación: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates).
