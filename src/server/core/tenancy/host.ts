// Pure, so it runs in the proxy and in server code alike.
export type HostKind =
  | { kind: "platform" }
  | { kind: "tenant"; subdomain: string }
  | { kind: "root" }
  | { kind: "unknown" };

export interface HostConfig {
  // e.g. the product domain (not decided yet, O15), or "localhost:3000" in dev.
  baseDomain: string;
  // e.g. "admin.<domain>".
  platformHost: string;
}

export const RESERVED_SUBDOMAINS = new Set([
  "admin", "platform", "www", "api", "app", "mail", "static", "assets", "cdn", "support", "help", "status",
  // Other products under the brand's domain, e.g. the LMS at lms.<domain>.
  "lms",
]);

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export function isValidTenantSubdomain(subdomain: string): boolean {
  return subdomain.length >= 3 && SUBDOMAIN_RE.test(subdomain) && !RESERVED_SUBDOMAINS.has(subdomain);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.(?=:|$)/, ""); // strip a trailing dot
}

export function classifyHost(rawHost: string | null | undefined, config: HostConfig): HostKind {
  if (!rawHost) return { kind: "unknown" };
  const host = normalizeHost(rawHost);
  const base = normalizeHost(config.baseDomain);

  if (host === normalizeHost(config.platformHost)) return { kind: "platform" };
  if (host === base) return { kind: "root" };

  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return { kind: "unknown" };
  const subdomain = host.slice(0, -suffix.length);

  // One level only: "a.b.<domain>" is never a tenant.
  if (subdomain.includes(".") || !isValidTenantSubdomain(subdomain)) return { kind: "unknown" };
  return { kind: "tenant", subdomain };
}

export function hostConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HostConfig {
  const baseDomain = env.APP_BASE_DOMAIN;
  const platformHost = env.PLATFORM_HOST;
  if (!baseDomain || !platformHost) {
    throw new Error("APP_BASE_DOMAIN and PLATFORM_HOST must be set (see .env.example)");
  }
  return { baseDomain, platformHost };
}
