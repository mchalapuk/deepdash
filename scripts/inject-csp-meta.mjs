#!/usr/bin/env node
/**
 * After `next build`, insert Content-Security-Policy as the first child of <head>
 * and strip any duplicate CSP meta tags emitted later (Next merges head late for ours).
 */
import fs from "node:fs";
import path from "node:path";
import { CSP } from "../csp.config.mjs";

const OUT = path.join(import.meta.dirname, "..", "out");
const CSP_META_RE =
  /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*(?:\/>|>)/gi;

function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function injectFirstInHead(html, csp) {
  const stripped = html.replace(CSP_META_RE, "");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}" />`;
  return stripped.replace(/<head(\b[^>]*)>/i, `<head$1>${meta}`);
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.warn("inject-csp-meta: out/ missing, skipping");
    process.exit(0);
  }

  const files = ["index.html", "404.html", "_not-found.html"];
  const csp = CSP.production;

  for (const name of files) {
    const filePath = path.join(OUT, name);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, "utf8");
    if (!/<head(\b[^>]*)>/i.test(html)) continue;
    fs.writeFileSync(filePath, injectFirstInHead(html, csp), "utf8");
  }
}

main();
