/**
 * Traducción de mensajes de error de Supabase Auth a español.
 * Módulo compartido y sin dependencias del servidor: puede importarse desde
 * Client Components (login/signup) y desde Server Components.
 */

/** Convierte el mensaje técnico de Supabase Auth en un mensaje legible (es). */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("business_provision_failed")) {
    return "Tu cuenta está verificada, pero no pudimos preparar tu negocio. Intenta entrar de nuevo.";
  }

  if (m.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (m.includes("email not confirmed")) {
    return "Debes confirmar tu correo antes de iniciar sesión.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Ya existe una cuenta con este correo.";
  }
  if (m.includes("password should be at least")) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (m.includes("unable to validate email")) {
    return "El correo no es válido.";
  }
  if (m.includes("email rate limit")) {
    return "Se alcanzó el límite de correos enviados. Intenta más tarde.";
  }
  if (m.includes("email address not authorized")) {
    return "El envío de correos aún no está disponible para esta dirección. Contacta con soporte.";
  }
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "El acceso con Google todavía no está disponible. Puedes entrar con tu correo.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Demasiados intentos. Espera un momento y vuelve a probar.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "No pudimos conectar. Revisa tu conexión e intenta de nuevo.";
  }

  return "No pudimos completar la operación. Intenta de nuevo.";
}

/** Mensajes de error provenientes del callback (`/login?error=...`). */
export function callbackErrorMessage(code: string): string {
  if (code === "auth_callback_error") {
    return "No pudimos verificar tu sesión. Intenta iniciar de nuevo.";
  }
  if (code === "otp_expired") {
    return "El enlace expiró o ya se usó. Intenta entrar con tu contraseña o solicita otro correo de confirmación.";
  }
  if (code === "access_denied") {
    return "El acceso se canceló. Puedes intentarlo de nuevo o entrar con tu correo.";
  }
  return authErrorMessage(code);
}
