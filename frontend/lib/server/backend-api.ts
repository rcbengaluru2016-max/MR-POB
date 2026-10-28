import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, CHALLENGE_COOKIE, backendFetch, backendUser } from "./backend-client";
import { approvedBackendProfile } from "./backend-profile";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>; // JSON from the backend contract.
const kinds = ["customer", "company", "patient"];
const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
const destination = (role: string) => role === "super_admin" ? "/super-admin/dashboard" : role === "admin" ? "/admin/dashboard" : role === "company" ? "/company/dashboard" : "/portal";
const status = (value: string) => value === "PENDING" ? "pending_verification" : value.toLowerCase();

function json(body: unknown, code = 200) {
  const response = NextResponse.json(body, { status: code });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
function challengeKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Session secret is missing");
  return createHash("sha256").update(secret).digest();
}
function seal(value: Data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", challengeKey(), iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64url");
}
function unseal(value?: string): Data | null {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", challengeKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
    return data.expires > Date.now() ? data : null;
  } catch { return null; }
}
function clear(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, CHALLENGE_COOKIE, "zenex_session", "zenex_mfa_pending"]) response.cookies.set(name, "", { ...options, maxAge: 0 });
  return response;
}
async function responseData(response: Response): Promise<Data> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data.messages) ? data.messages.join("; ") : data.message ?? data.error ?? "Backend request failed";
    throw Object.assign(new Error(typeof message === "string" ? message : "Backend request failed"), { status: response.status, code: data.code });
  }
  return data;
}
async function call(path: string, token?: string, init?: RequestInit) {
  const bounded = init?.method && init.method !== 'GET' && path.startsWith('/super-admin/accounts') ? { ...init, signal: init.signal ?? AbortSignal.timeout(60000) } : init;
  return responseData(await backendFetch(path, token, bounded));
}
const bodyInit = (body: unknown, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function finishLogin(data: Data) {
  if (data.challengeName) {
    if (!["SOFTWARE_TOKEN_MFA", "SMS_MFA", "MFA_SETUP", "NEW_PASSWORD_REQUIRED"].includes(data.challengeName) || !data.session || !data.username) throw new Error("Unsupported authentication challenge");
    const value = seal({ username: data.username, session: data.session, challengeName: data.challengeName, expires: Date.now() + 5 * 60000 });
    if (value.length > 3800) throw new Error("Authentication challenge is too large");
    const response = clear(json({ requiresMfa: true, passwordChangeRequired: data.challengeName === 'NEW_PASSWORD_REQUIRED', mfaSetup: data.challengeName === "MFA_SETUP", secretCode: data.secretCode, mfaMethod: data.challengeName }));
    response.cookies.set(CHALLENGE_COOKIE, value, { ...options, maxAge: 300 });
    return response;
  }
  if (typeof data.accessToken !== "string" || !data.user?.userType || !Number.isFinite(data.expiresIn)) throw new Error("Invalid authentication response");
  const response = clear(json({ user: data.user, redirectTo: destination(data.user.userType) }));
  response.cookies.set(ACCESS_COOKIE, data.accessToken, { ...options, maxAge: Math.max(1, Math.min(data.expiresIn, 3600)) });
  return response;
}
function record(value: Data) {
  return { ...value, status: status(value.status), files: Object.fromEntries(Object.entries(value.files ?? {}).map(([slot, item]) => {
    const file = item as Data;
    return [slot, { name: file.name, type: file.type, size: file.size, dataUrl: `/api/documents/${encodeURIComponent(file.id)}`, downloadUrl: `/api/documents/${encodeURIComponent(file.id)}?download=1` }];
  })) };
}
async function list(token: string, kind: string, query = new URLSearchParams(), all = false, endpoint = "/admin/registrations") {
  const params = new URLSearchParams(query);
  params.set("kind", kind);
  if (params.get("status")) params.set("status", params.get("status") === "pending_verification" ? "PENDING" : params.get("status")!.toUpperCase());
  if (all) params.set("pageSize", "100");
  const data = await call(`${endpoint}?${params}`, token);
  const items = [...data.items];
  if (all) for (let page = 2; items.length < data.total; page++) {
    params.set("page", String(page));
    const next = await call(`${endpoint}?${params}`, token);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return { ...data, items: items.map((item: Data) => ({ ...item, status: status(item.status) })) };
}

// Backend authority handles authentication and registration. Company operations
// reuse their existing handlers after resolving the approved backend owner.
export async function backendApi(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const method = request.method;
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  try {
    if (!["GET", "HEAD"].includes(method)) {
      const expected = new URL(process.env.FRONTEND_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
      if (request.headers.get("origin") !== expected) return json({ error: "Request origin is not allowed" }, 403);
    }
    if (path === "/api/auth/login" && method === "POST") return await finishLogin(await call("/auth/login", undefined, bodyInit(await request.json())));
    if (path === "/api/auth/mfa" && method === "POST") {
      const pending = unseal(request.cookies.get(CHALLENGE_COOKIE)?.value);
      if (!pending) return json({ error: "Your verification expired. Please sign in again." }, 401);
      const { code, password } = await request.json();
      return await finishLogin(await call("/auth/challenge", undefined, bodyInit({ username: pending.username, session: pending.session, challengeName: pending.challengeName, ...(pending.challengeName === 'NEW_PASSWORD_REQUIRED' ? { password } : { code }) })));
    }
    if (path === "/api/auth/logout" && method === "POST") {
      if (token) await backendFetch("/auth/logout", token, { method: "POST" }).catch(() => undefined);
      return clear(json({ ok: true }));
    }
    if (path === "/api/auth/me" && method === "GET") {
      const user = await backendUser(token);
      if (!user) return json({ user: null }, 401);
      if (["customer", "company", "patient"].includes(user.userType)) {
        const profiles = await call("/registrations/me", token);
        const profile = profiles.items?.find((item: Data) => item.kind === user.userType && typeof item.masterCode === "string");
        return json({ user: { ...user, masterCode: profile?.masterCode ?? null } });
      }
      return json({ user });
    }
    if (path === "/api/auth/reset-password" && method === "POST") return clear(json(await call('/auth/password-reset/complete', undefined, bodyInit(await request.json()))));
    if (path === "/api/auth/password-reset/validate" && method === "POST") return json(await call('/auth/password-reset/validate', undefined, bodyInit(await request.json())));
    if (path === "/api/auth/forgot-password") return json({ error: "Contact your administrator to request a reset link." }, 501);
    if (path.startsWith("/api/customer-activation/")) return json({ error: "Account activation is not available yet. Contact your administrator." }, 501);
    const registration = path.match(/^\/api\/register\/(customer|company|patient)$/);
    if (registration && method === "POST") {
      const form = await request.formData();
      const headers: Record<string, string> = {};
      const key = request.headers.get("idempotency-key");
      if (key) headers["Idempotency-Key"] = key;
      const data = await call(`/registrations/${registration[1] === "company" ? "companies" : registration[1] + "s"}`, undefined, { method: "POST", body: form, headers, signal: AbortSignal.timeout(125000) });
      return json({ ...data, status: status(data.status) }, 201);
    }
    const user = await backendUser(token);
    if (!user || !token) return json({ error: "Sign in to continue" }, 401);
    if (path.startsWith("/api/company/") && user.userType === "company") {
      if (path === "/api/company/account/change-password") return json({ error: "Contact your administrator to change your backend account password." }, 501);
      return NextResponse.next();
    }
    const document = path.match(/^\/api\/documents\/([a-f0-9-]+)$/i);
    if (document && method === "GET") {
      const suffix = request.nextUrl.searchParams.get("download") === "1" ? "" : "/preview";
      const data = await call(`/documents/${encodeURIComponent(document[1])}${suffix}`, token);
      if (request.nextUrl.searchParams.get("metadata") === "1") return json({ url: data.url });
      const response = NextResponse.redirect(data.url, 307);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
    if (!["admin", "super_admin"].includes(user.userType)) return json({ error: "Administrator access required" }, 403);
    if (['/api/account/me', '/api/account/me/security'].includes(path) && method === 'GET') return json(await call(path.slice(4), token));
    if (['/api/account/me/change-password/challenge', '/api/account/me/change-password/verify', '/api/account/me/change-password'].includes(path) && method === 'POST') {
      const data = await call(path.slice(4), token, bodyInit(await request.json()));
      return path === '/api/account/me/change-password' ? clear(json(data)) : json(data);
    }
    if (path.startsWith('/api/auth/step-up/') && method === 'POST') {
      if (user.userType !== 'super_admin') return json({ error: 'Super Admin access required' }, 403);
      const operation = path.split('/').pop();
      if (!['challenge', 'verify'].includes(operation!)) return json({ error: 'Not found' }, 404);
      return json(await call(`/auth/step-up/${operation}`, token, bodyInit(await request.json())));
    }
    if (path === "/api/super-admin/accounts") {
      if (user.userType !== "super_admin") return json({ error: "Super Admin access required" }, 403);
      if (method === "GET") {
        const accounts = await call(`/super-admin/accounts?${request.nextUrl.searchParams}`, token);
        return json({ ...accounts, items: accounts.items.map((item: Data) => ({ ...item, role: item.role.toLowerCase(), status: item.state === "ACTIVE" ? "active" : "inactive", isCurrentUser: item.username === user.username })) });
      }
      if (method === "POST") {
        const body = await request.json();
        if (body.action === "create") {
          if (!['admin', 'super_admin'].includes(body.role)) return json({ error: 'Invalid account role' }, 400);
          const data = await call("/super-admin/accounts", token, bodyInit({ name: body.name, email: body.email, password: body.password, role: body.role.toUpperCase(), state: body.initialStatus === "locked" ? "INACTIVE" : "ACTIVE", ...(body.stepUpProof ? { stepUpProof: body.stepUpProof } : {}) }));
          return json(data, 201);
        }
        if (typeof body.id !== 'string') return json({ error: 'Account identifier is required' }, 400);
        const account = { id: encodeURIComponent(body.id) };
        if (body.action === "status" && ["locked", "unlocked"].includes(body.status)) return json(await call(`/super-admin/accounts/${account.id}/state`, token, bodyInit({ state: body.status === "locked" ? "INACTIVE" : "ACTIVE" }, "PATCH")));
        if (body.action === "reset-password") return json(await call(`/super-admin/accounts/${account.id}/password-reset`, token, bodyInit({ password: body.password, confirmPassword: body.confirmPassword })));
        if (body.action === "reset") return json(await call(`/super-admin/accounts/${account.id}/password-reset-link`, token, bodyInit({ stepUpProof: body.stepUpProof })));
        if (body.action === 'delete') return json(await call(`/super-admin/accounts/${account.id}`, token, { method: 'DELETE' }));
        return json({ error: "Invalid account action." }, 400);
      }
    }
    if (path === "/api/super-admin/analytics" && method === "GET") return json(await call(`/admin/registrations/analytics?${request.nextUrl.searchParams}`, token));
    if (path === "/api/super-admin/approvals" && method === "GET") {
      const results = await Promise.all(kinds.map(kind => list(token, kind, new URLSearchParams(), true)));
      const summaries = await Promise.all(kinds.map(kind => call(`/admin/registrations/summary?kind=${kind}`, token)));
      return json({ items: results.flatMap(result => result.items), summary: Object.fromEntries(kinds.map((kind, i) => [kind, summaries[i]])) });
    }
    if (["/api/admin/registrations", "/api/super-admin/registrations"].includes(path) && method === "GET") {
      const query = new URLSearchParams(request.nextUrl.searchParams);
      if (path.includes("super-admin")) query.set("status", "approved");
      const kind = query.get("kind");
      if (kind && !kinds.includes(kind)) return json({ error: "Invalid registration type" }, 400);
      if (kind) return json(await list(token, kind, query, !query.has("page")));
      return json({ items: (await Promise.all(kinds.map(value => list(token, value, query, true)))).flatMap(value => value.items) });
    }
    if (path === "/api/admin/summary" && method === "GET") {
      const kind = request.nextUrl.searchParams.get("kind");
      if (!kind || !kinds.includes(kind)) return json({ error: "Registration type is required" }, 400);
      return json(await call(`/admin/registrations/summary?kind=${kind}`, token));
    }
    if (path === "/api/admin/masters" && method === "GET") {
      const kind = request.nextUrl.searchParams.get("kind");
      if (kind && !kinds.includes(kind)) return json({ error: "Invalid registration type" }, 400);
      const groups = await Promise.all((kind ? [kind] : kinds).map((value) => list(token, value, new URLSearchParams(), true, "/admin/registrations/approved")));
      return json({ items: groups.flatMap((group) => group.items).filter((item: Data) => item.masterCode).map((item: Data) => approvedBackendProfile(record(item)).master) });
    }
    const detail = path.match(/^\/api\/admin\/registrations\/([^/]+)$/);
    if (detail) {
      if (method === "GET") return json({ record: record((await call(`/admin/registrations/${encodeURIComponent(detail[1])}`, token)).record) });
      if (method === "POST") {
        const body = await request.json();
        return json(await call(`/admin/registrations/${encodeURIComponent(detail[1])}/decision`, token, bodyInit(body.action === "approve" ? { action: "approve" } : body)), 201);
      }
    }
    const approvedDetail = path.match(/^\/api\/super-admin\/registrations\/([^/]+)$/);
    if (approvedDetail && method === "GET") {
      const data = await call(`/admin/registrations/${encodeURIComponent(approvedDetail[1])}`, token);
      if (data.record.status !== "APPROVED") return json({ error: "Approved registration not found" }, 404);
      const registration = record(data.record);
      const profile = approvedBackendProfile(registration);
      const account = profile.account ? { username: profile.account.username, displayName: profile.account.displayName, email: profile.account.email, userType: profile.account.userType, status: profile.account.status, createdAt: profile.account.createdAt } : null;
      return json({ registration, activationPending: data.record.activationPending, master: profile.master, account, notificationStatus: data.record.notificationStatus, activationMessage: null });
    }
    if (path === "/api/super-admin/registrations/single" && method === "POST") {
      const form = await request.formData();
      return json(await call('/imports/single', token, { method: 'POST', body: form, headers: { 'Idempotency-Key': request.headers.get('idempotency-key') ?? '' }, signal: AbortSignal.timeout(360000) }), 201);
    }
    if (path.startsWith('/api/super-admin/registration-imports/')) {
      const suffix = path.slice('/api/super-admin/registration-imports/'.length);
      let target: string;
      if (suffix === 'bulk' && method === 'GET') target = `/imports/templates/${encodeURIComponent(request.nextUrl.searchParams.get('kind') ?? '')}`;
      else if (suffix === 'bulk' && method === 'POST') target = '/imports/bulk/validate';
      else if (suffix === 'uploads') target = `/imports${request.nextUrl.search}`;
      else if (/^uploads\/[a-f0-9-]+\/file$/i.test(suffix)) target = `/imports/${suffix.split('/')[1]}/download`;
      else if (/^[a-f0-9-]+(?:\/(?:confirm|preview|progress|download|errors))?$/i.test(suffix)) target = `/imports/${suffix}`;
      else return json({ error: 'Import endpoint not found' }, 404);
      const headers: Record<string, string> = {};
      const key = request.headers.get('idempotency-key'); if (key) headers['Idempotency-Key'] = key;
      const upstream = await backendFetch(target, token, { method, headers, ...(method === 'POST' ? { body: await request.formData() } : {}), signal: AbortSignal.timeout(360000) });
      if (!upstream.ok) return json(await upstream.json(), upstream.status);
      if (upstream.headers.get('content-type')?.includes('spreadsheetml')) return new NextResponse(upstream.body, { headers: { 'Content-Type': upstream.headers.get('content-type')!, 'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment', 'Cache-Control': 'private, no-store' } });
      return json(await upstream.json(), upstream.status);
    }
    return json({ error: "This operation is not available yet." }, 501);
  } catch (error) {
    const failure = error as Error & { status?: number; code?: string };
    if (failure.status === 403 && failure.code === 'ACCOUNT_INACTIVE') return clear(json({ code: 'ACCOUNT_INACTIVE', error: 'Your account is currently inactive. Please contact the Super Admin to activate your account.', redirectTo: '/account-inactive' }, 403));
    if (failure.status === 503 && failure.code === 'ACCOUNT_AWS_CREDENTIALS_UNAVAILABLE') return json({ error: 'The backend AWS session has expired or is unavailable. In the backend terminal, run aws login --profile zenex-dev, restart the backend, then retry Create Account with the same details.' }, 503);
    return json({ error: failure instanceof SyntaxError ? "Invalid request body" : failure.status && failure.status < 500 ? failure.message : "The service is temporarily unavailable. Please try again." }, failure instanceof SyntaxError ? 400 : failure.status ?? 503);
  }
}
