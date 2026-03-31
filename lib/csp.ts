import { CSP } from "../csp.config.mjs";

export function getLayoutCsp(): string {
  return process.env.NODE_ENV === "development" ? CSP.development : CSP.production;
}
