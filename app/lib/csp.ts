import { CSP } from "../../.config/csp.config.mjs";

export function getLayoutCsp(): string {
  return process.env.NODE_ENV === "development" ? CSP.development : CSP.production;
}
