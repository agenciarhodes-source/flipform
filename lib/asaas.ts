const DEFAULT_ASAAS_BASE_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_SANDBOX_HOSTS = new Set([
  "sandbox.asaas.com",
  "api-sandbox.asaas.com",
]);
const ASAAS_PRODUCTION_HOSTS = new Set(["api.asaas.com", "www.asaas.com"]);

export type AsaasEnvironment = "sandbox" | "production" | "unknown";

type AsaasConfig = {
  apiKey: string | null;
  baseUrl: string;
  webhookToken: string | null;
  nextPublicBaseUrl: string | null;
  publicSiteUrl: string | null;
  environment: AsaasEnvironment;
  explicitEnvironment: string | null;
  warnings: string[];
};

export class AsaasConfigError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "ASAAS_CONFIG_INVALID", status = 503) {
    super(message);
    this.name = "AsaasConfigError";
    this.code = code;
    this.status = status;
  }
}

export type AsaasProviderErrorItem = {
  code?: string;
  description?: string;
  message?: string;
};

export class AsaasProviderError extends Error {
  code: string;
  status: number;
  endpoint: string;
  errors: AsaasProviderErrorItem[];

  constructor(params: {
    message: string;
    status: number;
    endpoint: string;
    errors?: AsaasProviderErrorItem[];
  }) {
    super(params.message);
    this.name = "AsaasProviderError";
    this.code = "ASAAS_PROVIDER_ERROR";
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.errors = params.errors || [];
  }
}

function clean(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBaseUrl(value?: string | null) {
  const raw = clean(value) || DEFAULT_ASAAS_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function detectEnvironmentFromBaseUrl(baseUrl: string): AsaasEnvironment {
  const host = hostFromUrl(baseUrl);
  if (!host) return "unknown";
  if (ASAAS_SANDBOX_HOSTS.has(host) || host.includes("sandbox.asaas.com"))
    return "sandbox";
  if (ASAAS_PRODUCTION_HOSTS.has(host)) return "production";
  return "unknown";
}

function normalizeExplicitEnvironment(
  value?: string | null,
): AsaasEnvironment | null {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return null;
  if (["prod", "production"].includes(normalized)) return "production";
  if (["sandbox", "test", "testing"].includes(normalized)) return "sandbox";
  return "unknown";
}

function isProductionRuntime() {
  const appUrl = clean(
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL,
  );
  return (
    process.env.VERCEL_ENV === "production" ||
    appUrl === "https://app.flipform.com.br" ||
    appUrl === "https://www.app.flipform.com.br"
  );
}

export function getAsaasConfig(): AsaasConfig {
  const baseUrl = normalizeBaseUrl(process.env.ASAAS_BASE_URL);
  const explicit = normalizeExplicitEnvironment(process.env.ASAAS_ENV);
  const detected = detectEnvironmentFromBaseUrl(baseUrl);
  const warnings: string[] = [];

  if (detected === "unknown")
    warnings.push(
      "ASAAS_BASE_URL não corresponde aos hosts conhecidos do Asaas.",
    );
  if (explicit === "unknown")
    warnings.push("ASAAS_ENV inválido; use sandbox ou production.");
  if (
    explicit &&
    explicit !== "unknown" &&
    detected !== "unknown" &&
    explicit !== detected
  ) {
    warnings.push(
      "ASAAS_ENV não corresponde ao ambiente detectado pela ASAAS_BASE_URL.",
    );
  }
  if (
    isProductionRuntime() &&
    detected === "sandbox" &&
    process.env.ALLOW_SANDBOX_ASAAS_IN_PRODUCTION !== "true"
  ) {
    warnings.push("Runtime de produção está apontando para o Asaas Sandbox.");
  }
  if (
    !isProductionRuntime() &&
    explicit === "sandbox" &&
    detected === "production"
  ) {
    warnings.push(
      "ASAAS_ENV=sandbox está apontando para URL de produção do Asaas.",
    );
  }

  return {
    apiKey: clean(process.env.ASAAS_API_KEY),
    baseUrl,
    webhookToken: clean(process.env.ASAAS_WEBHOOK_TOKEN),
    nextPublicBaseUrl: clean(process.env.NEXT_PUBLIC_BASE_URL),
    publicSiteUrl: clean(process.env.PUBLIC_SITE_URL),
    environment: explicit && explicit !== "unknown" ? explicit : detected,
    explicitEnvironment: clean(process.env.ASAAS_ENV),
    warnings,
  };
}

export function getAsaasHealthStatus() {
  const config = getAsaasConfig();
  const missing = [
    ["ASAAS_API_KEY", !config.apiKey],
    ["ASAAS_BASE_URL", !clean(process.env.ASAAS_BASE_URL)],
    ["ASAAS_WEBHOOK_TOKEN", !config.webhookToken],
    ["NEXT_PUBLIC_BASE_URL", !config.nextPublicBaseUrl],
    ["PUBLIC_SITE_URL", !config.publicSiteUrl],
  ]
    .filter(([, isMissing]) => isMissing)
    .map(([name]) => name as string);

  return {
    apiKeyConfigured: Boolean(config.apiKey),
    environment: config.environment,
    baseUrl: config.baseUrl,
    webhookTokenConfigured: Boolean(config.webhookToken),
    nextPublicBaseUrlConfigured: Boolean(config.nextPublicBaseUrl),
    publicSiteUrlConfigured: Boolean(config.publicSiteUrl),
    warnings: config.warnings,
    missing,
    status:
      missing.length === 0 && config.warnings.length === 0
        ? "ready"
        : "not_ready",
  };
}

export function assertAsaasConfig(
  options: { requireWebhookToken?: boolean; requirePublicUrls?: boolean } = {},
): AsaasConfig & { apiKey: string } {
  const config = getAsaasConfig();
  if (!config.apiKey) {
    throw new AsaasConfigError(
      "ASAAS_API_KEY não configurada.",
      "ASAAS_API_KEY_MISSING",
    );
  }
  if (!clean(process.env.ASAAS_BASE_URL)) {
    throw new AsaasConfigError(
      "ASAAS_BASE_URL não configurada.",
      "ASAAS_BASE_URL_MISSING",
    );
  }
  if (!hostFromUrl(config.baseUrl)) {
    throw new AsaasConfigError(
      "ASAAS_BASE_URL inválida.",
      "ASAAS_BASE_URL_INVALID",
    );
  }
  if (options.requireWebhookToken && !config.webhookToken) {
    throw new AsaasConfigError(
      "ASAAS_WEBHOOK_TOKEN não configurado.",
      "ASAAS_WEBHOOK_TOKEN_MISSING",
    );
  }
  if (options.requirePublicUrls) {
    if (!config.nextPublicBaseUrl) {
      throw new AsaasConfigError(
        "NEXT_PUBLIC_BASE_URL não configurada.",
        "NEXT_PUBLIC_BASE_URL_MISSING",
      );
    }
    if (!config.publicSiteUrl) {
      throw new AsaasConfigError(
        "PUBLIC_SITE_URL não configurada.",
        "PUBLIC_SITE_URL_MISSING",
      );
    }
  }
  if (config.warnings.length > 0) {
    throw new AsaasConfigError(
      config.warnings[0],
      "ASAAS_ENVIRONMENT_MISMATCH",
    );
  }
  return { ...config, apiKey: config.apiKey };
}

function sanitizeAsaasErrorText(value: unknown) {
  return String(value || "")
    .replace(/access_token\s*[:=]\s*[^\s,}]+/gi, "access_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function sanitizeAsaasErrors(body: unknown): AsaasProviderErrorItem[] {
  const rawErrors = Array.isArray((body as any)?.errors)
    ? (body as any).errors
    : [];
  return rawErrors.slice(0, 10).map((item: any) => ({
    code: item?.code ? sanitizeAsaasErrorText(item.code) : undefined,
    description: item?.description
      ? sanitizeAsaasErrorText(item.description)
      : undefined,
    message: item?.message ? sanitizeAsaasErrorText(item.message) : undefined,
  }));
}

function sanitizeAsaasErrorMessage(body: unknown, fallback: string) {
  const errors = sanitizeAsaasErrors(body);
  const first = errors[0];
  return (
    first?.description ||
    first?.message ||
    sanitizeAsaasErrorText((body as any)?.message) ||
    fallback
  );
}

async function readAsaasResponseBody(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: sanitizeAsaasErrorText(text) };
  }
}

async function asaasFetch(path: string, init: RequestInit) {
  const config = assertAsaasConfig();
  const endpoint = `${String(init.method || "GET").toUpperCase()} ${path}`;
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
      ...(init.headers || {}),
    },
  });

  const body = await readAsaasResponseBody(res);
  if (!res.ok) {
    throw new AsaasProviderError({
      message: sanitizeAsaasErrorMessage(body, "Asaas request failed"),
      status: res.status,
      endpoint,
      errors: sanitizeAsaasErrors(body),
    });
  }
  return body;
}

export async function createCustomer(payload: any) {
  return asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export async function createSubscription(payload: any) {
  return asaasFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export async function listPaymentsBySubscription(subscriptionId: string) {
  return asaasFetch(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=10`,
    { method: "GET" },
  );
}
export async function getPayment(id: string) {
  return asaasFetch(`/payments/${id}`, { method: "GET" });
}
export async function getSubscription(id: string) {
  return asaasFetch(`/subscriptions/${id}`, { method: "GET" });
}
export async function cancelSubscription(id: string) {
  return asaasFetch(`/subscriptions/${id}`, { method: "DELETE" });
}

export function mapAsaasPaymentStatus(status: string) {
  const s = String(status || "").toUpperCase();
  if (s.includes("RECEIVED") || s.includes("CONFIRMED")) return "received";
  if (s.includes("CHARGEBACK")) return "refunded";
  if (s.includes("OVERDUE")) return "overdue";
  if (s.includes("REFUND")) return "refunded";
  if (s.includes("DELET") || s.includes("CANCEL")) return "failed";
  return "pending";
}

export const mapPaymentStatus = mapAsaasPaymentStatus;

export function validateWebhookToken(req: Request) {
  const configuredToken = clean(process.env.ASAAS_WEBHOOK_TOKEN);
  const token = clean(
    req.headers.get("asaas-access-token") || req.headers.get("x-asaas-token"),
  );
  return Boolean(configuredToken && token && token === configuredToken);
}
