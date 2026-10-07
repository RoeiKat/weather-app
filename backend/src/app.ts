import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import { AppError, logFailure } from './errors.js';
import { Passwords } from './passwords.js';
import { sessionUser, type Session, type Store } from './store.js';
import { canonicalLocation, credentialsSchema, parseWeatherQuery, preferenceSchema, validate } from './validation.js';
import type { OpenWeather } from './weather.js';

declare module 'express-serve-static-core' {
  interface Request { id: string; weatherSession: Session | null }
}

export const BODY_LIMIT = 16 * 1024;

function singleHeader(request: Request, name: string): string | undefined {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i]?.toLowerCase() === name) count++;
  }
  const value = request.headers[name];
  return count === 1 && typeof value === 'string' ? value : undefined;
}

function queryParams(request: Request): URLSearchParams {
  return new URL(request.originalUrl, 'http://backend.invalid').searchParams;
}

function noQuery(request: Request): void {
  if (queryParams(request).size) throw new AppError(400, 'VALIDATION_ERROR', 'This route accepts no query parameters.');
}

function noBody(request: Request): void {
  if (request.body !== undefined || Number(request.headers['content-length'] ?? 0) > 0 ||
      request.headers['transfer-encoding']) {
    throw new AppError(400, 'VALIDATION_ERROR', 'This route accepts no request body.');
  }
}

function jsonBody(request: Request): void {
  if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
}

function csrf(request: Request, config: Config): void {
  const origin = singleHeader(request, 'origin');
  const token = singleHeader(request, 'x-csrf-token');
  const expected = request.weatherSession?.csrf_token;
  if (!origin || !config.origins.includes(origin) || !token || !expected ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    throw new AppError(403, 'CSRF_FAILED', 'Refresh the session and try again.');
  }
}

function authenticated(request: Request): string {
  const id = request.weatherSession?.user_id;
  if (!id) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return id;
}

export async function createApp(config: Config, store: Store, weather: OpenWeather) {
  const passwords = await Passwords.create();
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', false);
  app.set('query parser', false);
  const cookieName = config.production ? '__Host-weather-session' : 'weather-session';
  const cookieOptions = {
    path: '/', httpOnly: true, secure: config.production, sameSite: 'lax' as const,
  };
  // The profile boundary precedes body/cookie parsing and dependency work.
  app.use((request, reply, next) => {
    request.id = `req_${randomUUID()}`;
    request.weatherSession = null;
    reply.set('Cache-Control', 'no-store');
    reply.set('X-Content-Type-Options', 'nosniff');
    reply.set('Referrer-Policy', 'no-referrer');
    reply.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (config.production) reply.set('Strict-Transport-Security', 'max-age=31536000');
    if (config.production && singleHeader(request, 'x-azure-fdid') !== config.FRONT_DOOR_ID) {
      throw new AppError(403, 'ORIGIN_FORBIDDEN', 'The request origin is not permitted.');
    }
    const origin = singleHeader(request, 'origin');
    if (origin && config.origins.includes(origin)) {
      reply.set('Access-Control-Allow-Origin', origin);
      reply.set('Access-Control-Allow-Credentials', 'true');
      reply.vary('Origin');
    }
    const hasBody = Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding'];
    if (['GET', 'DELETE'].includes(request.method) && hasBody) {
      throw new AppError(400, 'VALIDATION_ERROR', 'This route accepts no request body.');
    }
    if (request.method === 'HEAD') {
      throw new AppError(400, 'VALIDATION_ERROR', 'The API method is not supported.');
    }
    if (hasBody) jsonBody(request);
    next();
  });
  app.use(express.json({ limit: BODY_LIMIT, strict: true, inflate: false }));

  const bootstrap = async (request: Request, reply: Response): Promise<Session> => {
    if (request.weatherSession) return request.weatherSession;
    const created = await store.createSession(null);
    reply.cookie(cookieName, created.token, { ...cookieOptions, maxAge: 1_800_000 });
    request.weatherSession = created.session;
    return created.session;
  };
  const load: RequestHandler = async (request, _reply, next) => {
    const cookieHeader = singleHeader(request, 'cookie');
    const occurrences = cookieHeader?.split(';').filter((part) => part.trim().startsWith(`${cookieName}=`)).length ?? 0;
    const token = occurrences === 1 && cookieHeader ? parseCookie(cookieHeader)[cookieName] : undefined;
    request.weatherSession = await store.loadSession(token);
    next();
  };
  const unsafeAuth: RequestHandler[] = [load, (request, _reply, next) => {
    csrf(request, config);
    next();
  }];
  const protectedMutation: RequestHandler[] = [load, (request, _reply, next) => {
    authenticated(request);
    csrf(request, config);
    next();
  }];

  app.options(/^\/api\/v1\/.+$/, (request, reply) => {
    const origin = singleHeader(request, 'origin');
    const method = singleHeader(request, 'access-control-request-method');
    const requestedHeaders = singleHeader(request, 'access-control-request-headers');
    if (!origin || !config.origins.includes(origin) || !method || !['GET', 'POST', 'DELETE'].includes(method) ||
        (requestedHeaders && requestedHeaders.split(',').some(
          (value) => !['content-type', 'x-csrf-token'].includes(value.trim().toLowerCase()),
        ))) {
      throw new AppError(403, 'CSRF_FAILED', 'The request origin is not permitted.');
    }
    reply.set('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    reply.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    reply.status(204).end();
  });

  app.get('/api/v1/health', async (request, reply) => {
    noQuery(request); noBody(request);
    await store.ready();
    reply.json({ status: 'ok' });
  });
  app.get('/api/v1/auth/session', load, async (request, reply) => {
    noQuery(request); noBody(request);
    const session = await bootstrap(request, reply);
    reply.json({ user: sessionUser(session), csrfToken: session.csrf_token });
  });
  app.post('/api/v1/auth/register', unsafeAuth, async (request: Request, reply: Response) => {
    noQuery(request); jsonBody(request);
    const input = validate(credentialsSchema, request.body);
    await store.rateLimit(`register:${request.weatherSession!.token_hash}`, 10, 3600);
    const user = await store.register(input.email, await passwords.hash(input.password));
    reply.status(201).json({ user });
  });
  app.post('/api/v1/auth/login', unsafeAuth, async (request: Request, reply: Response) => {
    noQuery(request); jsonBody(request);
    const input = validate(credentialsSchema, request.body);
    await store.rateLimit(`login:${input.email}`, 5, 900);
    const account = await store.account(input.email);
    if (!await passwords.verify(account?.password_hash, input.password) || !account) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }
    const created = await store.createSession({ id: account.id, email: account.email }, request.weatherSession!);
    reply.cookie(cookieName, created.token, { ...cookieOptions, maxAge: 86_400_000 });
    reply.json({ user: sessionUser(created.session), csrfToken: created.session.csrf_token });
  });
  app.post('/api/v1/auth/logout', unsafeAuth, async (request: Request, reply: Response) => {
    noQuery(request); noBody(request);
    await store.revokeSession(request.weatherSession!);
    reply.clearCookie(cookieName, cookieOptions);
    reply.status(204).end();
  });
  app.get('/api/v1/weather', load, async (request, reply) => {
    noBody(request);
    const query = parseWeatherQuery(queryParams(request));
    const session = await bootstrap(request, reply);
    await store.rateLimit(`weather:${session.token_hash}`, 60, 60);
    reply.json(await weather.lookup(query));
  });
  app.get('/api/v1/preferences', load, async (request, reply) => {
    const userId = authenticated(request);
    noQuery(request); noBody(request);
    reply.json({ preferences: await store.preferences(userId) });
  });
  app.post('/api/v1/preferences', protectedMutation, async (request: Request, reply: Response) => {
    noQuery(request); jsonBody(request);
    const input = validate(preferenceSchema, request.body);
    const result = await store.savePreference(authenticated(request), canonicalLocation(input.location), input.snapshot);
    reply.status(result.created ? 201 : 200).json({ preference: result.preference });
  });
  app.delete('/api/v1/preferences/:preferenceId', protectedMutation, async (request: Request, reply: Response) => {
    noQuery(request); noBody(request);
    const id = request.params.preferenceId;
    if (typeof id !== 'string' || !id) throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid preference ID.');
    await store.deletePreference(authenticated(request), id);
    reply.status(204).end();
  });
  app.use(() => {
    throw new AppError(400, 'VALIDATION_ERROR', 'The API route or method is not supported.');
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, request, reply, next) => {
    if (reply.headersSent) { next(error); return; }
    let exposed: AppError;
    const type = error instanceof Error && 'type' in error ? error.type : undefined;
    if (error instanceof AppError) exposed = error;
    else if (type === 'entity.too.large') {
      exposed = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    } else if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
      exposed = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use uncompressed UTF-8 application/json.');
    } else if (type === 'entity.parse.failed' ||
        (error instanceof Error && 'status' in error && error.status === 400)) {
      exposed = new AppError(400, 'VALIDATION_ERROR', 'Check the submitted values.');
    } else {
      logFailure('unexpected_request_failure', request.id);
      exposed = new AppError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
    if (exposed.retryAfter !== undefined) reply.set('Retry-After', String(exposed.retryAfter));
    reply.status(exposed.status).json({
      error: {
        code: exposed.code, message: exposed.message, requestId: request.id,
        ...(exposed.fields ? { fields: exposed.fields } : {}),
      },
    });
  };
  app.use(errorHandler);
  return app;
}
