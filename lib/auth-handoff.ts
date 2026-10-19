/**
 * When someone fills the sign-up form with an e-mail that already has an account, the sign-in
 * form should not make them type it again. The address travels through sessionStorage, never a
 * URL, and is read once.
 */
export const LOGIN_EMAIL_KEY = "nexo:login-email";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session = (): Store | undefined => (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

export function rememberLoginEmail(email: string, storage: Store | undefined = session()): void {
  const clean = email.trim().slice(0, 254);
  if (!EMAIL.test(clean)) return;
  try { storage?.setItem(LOGIN_EMAIL_KEY, clean); } catch { /* Private mode: the person types it again. */ }
}

/** The remembered address, once; anything that is not an e-mail is ignored. */
export function takeLoginEmail(storage: Store | undefined = session()): string {
  try {
    const value = storage?.getItem(LOGIN_EMAIL_KEY) ?? "";
    if (value) storage?.removeItem(LOGIN_EMAIL_KEY);
    return EMAIL.test(value) ? value : "";
  } catch { return ""; }
}
