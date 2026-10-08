import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const apiVersion = "2025-07-01";

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export function azureCommand(
  args,
  platform = process.platform,
  searchPath = process.env.PATH ?? "",
) {
  if (platform !== "win32") return { executable: "az", args: [...args] };
  for (const entry of searchPath.split(";").filter(Boolean)) {
    const directory = resolve(entry.replace(/^"(.*)"$/, "$1"));
    const native = join(directory, "az.exe");
    if (existsSync(native)) return { executable: native, args: [...args] };
    if (!existsSync(join(directory, "az.cmd"))) continue;
    // The Windows CLI launcher runs this bundled interpreter, without a shell.
    const python = resolve(directory, "..", "python.exe");
    if (!existsSync(python)) {
      throw new Error("Azure CLI az.cmd has no companion python.exe; use the official Windows CLI installation.");
    }
    return { executable: python, args: ["-IBm", "azure.cli", ...args] };
  }
  throw new Error("Azure CLI was not found on PATH; install the official Windows CLI.");
}

function bodyStrings(value) {
  if (typeof value === "string") return value ? [value] : [];
  if (value && typeof value === "object") return Object.values(value).flatMap(bodyStrings);
  return [];
}

function cliDiagnostic(stderr, redactions) {
  if (!stderr) return "Azure CLI returned no diagnostic on stderr.";
  const lines = String(stderr).split(/\r?\n/);
  const line = lines.find((item) => /^ERROR:\s*/.test(item)) ?? lines[0];
  const jsonStart = line.indexOf("{");
  let detail = "";
  if (jsonStart !== -1) {
    try {
      const document = JSON.parse(line.slice(jsonStart).replace(/\)\s*$/, ""));
      const error = document.error;
      if (typeof error?.code === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,100}$/.test(error.code)) {
        detail = ` ${error.code}: ${typeof error.message === "string" ? error.message : ""}`;
      } else if (typeof document.title === "string" && document.errors && typeof document.errors === "object") {
        const messages = Object.values(document.errors).flat().filter((value) => typeof value === "string").slice(0, 3);
        detail = ` ${document.title} ${messages.join("; ")}`;
      }
    } catch {
      detail = " (structured stderr omitted)";
    }
  }
  // Project the error summary before redaction, excluding all other JSON fields.
  let text = (line.slice(0, jsonStart === -1 ? undefined : jsonStart).replace(/\($/, "") + detail)
    .split(/[\r\n{[]|request body|response body|request headers|response headers/i)[0];
  const privateValues = [
    ...redactions,
    ...Object.entries(process.env)
      .filter(([name]) => /secret|token|password|credential|connection|pgadmin|key/i.test(name))
      .map(([, value]) => value),
  ].filter(Boolean);
  for (const value of [...new Set(privateValues)].sort((a, b) => b.length - a.length)) {
    text = text.split(value).join("[REDACTED]");
    text = text.split(JSON.stringify(value).slice(1, -1)).join("[REDACTED]");
  }
  text = text
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]");
  // Only the summary is exposed, never echoed JSON, headers, bodies or stdout.
  return text
    .replace(/\b(authorization|password|access[_-]?token|token|secret|connection[_-]?string)\s*[:=].*$/gi, "$1: [REDACTED]")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 1000).trim() || "Azure CLI diagnostic omitted because it contained only structured data.";
}

export function az(args, { operation = "", redactions = [] } = {}) {
  const name = args[0] === "rest" ? `rest ${args[args.indexOf("--method") + 1]}` : args.slice(0, 2).join(" ");
  const label = `Azure command failed: ${name}${operation ? ` (${operation})` : ""}`;
  // Do not echo command bodies, Azure responses, credentials or application config.
  const command = azureCommand([...args, "--only-show-errors", "--output", "json"]);
  let result;
  try {
    result = execFileSync(command.executable, command.args, {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `${label} (code ${error.code ?? "unknown"}, status ${error.status ?? "none"}, signal ${error.signal ?? "none"}). ` +
        cliDiagnostic(error.stderr, [...redactions, ...args.filter((arg) => arg.startsWith("@"))]),
    );
  }
  try {
    return result.trim() ? JSON.parse(result) : null;
  } catch {
    throw new Error(`${label}. Azure CLI returned invalid JSON; response withheld.`);
  }
}

export function resourceUrl(id, suffix = "") {
  return `https://management.azure.com${id}${suffix}?api-version=${apiVersion}`;
}

export function rest(method, id, body, suffix = "", operation = "") {
  const args = ["rest", "--method", method, "--url", resourceUrl(id, suffix)];

  if (!body) {
    return az(args, { operation });
  }

  const json = JSON.stringify(body);
  const directory = mkdtempSync(join(tmpdir(), "weather-az-rest-"));
  const bodyFile = join(directory, "body.json");

  try {
    writeFileSync(bodyFile, json, { encoding: "utf8", mode: 0o600 });

    return az([...args, "--body", `@${bodyFile}`], {
      operation, redactions: [json, ...bodyStrings(body)],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function list(id, suffix, operation = "") {
  const result = [];
  let url = resourceUrl(id, suffix);
  for (let page = 0; page < 100; page++) {
    const response = az(["rest", "--method", "get", "--url", url], { operation });
    if (!Array.isArray(response.value))
      throw new Error("Azure list returned an invalid shape.");
    result.push(...response.value);
    if (!response.nextLink) return result;
    if (new URL(response.nextLink).origin !== "https://management.azure.com")
      throw new Error("Unexpected Azure pagination origin.");
    url = response.nextLink;
  }
  throw new Error("Azure pagination exceeded the bounded page limit.");
}

export function findResource(id) {
  const match =
    /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/Microsoft\.App\/(containerApps|jobs)\/([^/]+)$/.exec(
      id,
    );
  if (!match) throw new Error("Invalid Container Apps resource ID.");
  const [, subscription, group, collection, name] = match;
  const exists = az([
    "group",
    "exists",
    "--subscription",
    subscription,
    "--name",
    group,
  ]);
  if (exists === false) return null;
  if (exists !== true)
    throw new Error("Invalid resource-group existence response.");
  const base = id.slice(0, id.lastIndexOf(`/${collection}/`));
  return (
    list(base, `/${collection}`).find((item) => item.name === name) ?? null
  );
}

export async function waitFor(
  description,
  check,
  timeoutMs = 600_000,
  intervalMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await check();
    if (result) return result;
    await delay(intervalMs);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

export function immutableImage(value, host) {
  if (
    !/^[a-z0-9]+\.azurecr\.io\/weather-backend@sha256:[a-f0-9]{64}$/.test(
      value,
    ) ||
    !value.startsWith(`${host}/weather-backend@`)
  ) {
    throw new Error(
      "Release must use this registry and an immutable backend digest.",
    );
  }
  return value;
}

export function productionTraffic(app) {
  const traffic = app.properties.configuration.ingress.traffic;
  if (
    !Array.isArray(traffic) ||
    traffic.some((item) => item.latestRevision || !item.revisionName) ||
    traffic.reduce((sum, item) => sum + item.weight, 0) !== 100
  ) {
    throw new Error("Traffic must use named revisions and total exactly 100%.");
  }
  const serving = traffic.filter((item) => item.weight > 0);
  if (serving.length !== 1 || serving[0].weight !== 100) {
    throw new Error(
      "This bounded release flow requires one known-good 100% serving revision.",
    );
  }
  return structuredClone(traffic);
}

export function candidateTraffic(previous, revision) {
  const result = previous
    .filter((item) => item.revisionName !== revision)
    .map((item) => {
      const copy = { ...item };
      if (copy.label === "candidate") delete copy.label;
      return copy;
    });
  result.push({
    revisionName: revision,
    weight: 0,
    latestRevision: false,
    label: "candidate",
  });
  return result;
}

export function promotedTraffic(traffic, revision) {
  if (!traffic.some((item) => item.revisionName === revision))
    throw new Error("Candidate missing from traffic.");
  return traffic.map((item) => ({
    ...item,
    weight: item.revisionName === revision ? 100 : 0,
    latestRevision: false,
  }));
}

export async function smoke(baseUrl, candidate = false) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.origin !== baseUrl)
    throw new Error("Smoke URL must be the canonical HTTPS origin.");
  const headers = candidate ? { "X-Weather-Release-Target": "candidate" } : {};
  for (const path of ["/api/v1/health", "/api/v1/auth/session"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (
      response.status !== 200 ||
      !response.headers.get("cache-control")?.includes("no-store") ||
      (candidate &&
        response.headers.get("x-weather-release-target") !== "candidate")
    ) {
      await response.body?.cancel();
      throw new Error(`Smoke status/cache/target check failed for ${path}`);
    }
    const body = await response.json();
    if (
      path.endsWith("/health")
        ? body.status !== "ok"
        : body.user !== null ||
          typeof body.csrfToken !== "string" ||
          !body.csrfToken
    ) {
      throw new Error(`Smoke response shape failed for ${path}`);
    }
    // Session values and response bodies deliberately stay out of release evidence.
  }
}
