import type { Conta, Plataforma } from "../types";
import { adaptadorDemo } from "./demo";
import { adaptadorGoogle } from "./google";
import { adaptadorLinkedIn } from "./linkedin";
import { adaptadorMeta } from "./meta";
import { adaptadorTikTok } from "./tiktok";
import type { AdaptadorPlataforma } from "./types";

const REAIS: Record<Plataforma, AdaptadorPlataforma> = {
  meta: adaptadorMeta,
  google: adaptadorGoogle,
  tiktok: adaptadorTikTok,
  linkedin: adaptadorLinkedIn,
};

export function modoDemo(conta?: Conta): boolean {
  if (conta?.config?.demo === true) return true;
  return process.env.GESTOR_MODO === "demo";
}

/** Escolhe o adaptador: demo quando a conta/ambiente pede, senão o real. */
export function adaptador(plataforma: Plataforma, conta?: Conta): AdaptadorPlataforma {
  if (modoDemo(conta)) return adaptadorDemo(plataforma);
  return REAIS[plataforma];
}

export function adaptadorReal(plataforma: Plataforma): AdaptadorPlataforma {
  return REAIS[plataforma];
}

export * from "./types";
