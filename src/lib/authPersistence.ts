const KEY = "metrica.remember-login";

/** Guarda a preferencia de "manter conectado" escolhida na tela de login. */
export function setAuthPersistence(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, remember ? "1" : "0");
  } catch {
    /* armazenamento indisponivel */
  }
}

export function getAuthPersistence(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
