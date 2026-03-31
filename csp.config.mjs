/**
 * Single source of truth for CSP strings (layout dev meta + static export HTML inject + mirror in public/_headers).
 */
function buildCsp(scriptSrcDirective) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    `script-src ${scriptSrcDirective}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self'",
  ].join("; ");
}

export const CSP = {
  development: buildCsp("'self' 'unsafe-inline' 'unsafe-eval'"),
  production: buildCsp("'self' 'unsafe-inline'"),
};
