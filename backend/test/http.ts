import request from 'supertest';
import type { Express } from 'express';

export async function send(api: Express, options: {
  method?: 'GET' | 'POST' | 'DELETE' | 'OPTIONS';
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  payload?: string | object;
}) {
  const client = request(api);
  const test = options.method === 'POST' ? client.post(options.url)
    : options.method === 'DELETE' ? client.delete(options.url)
      : options.method === 'OPTIONS' ? client.options(options.url) : client.get(options.url);
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined) test.set({ [key]: value });
  }
  if (options.payload !== undefined) test.send(options.payload);
  const response = await test;
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies) && cookies.length === 1) response.headers['set-cookie'] = cookies[0];
  return response;
}

export async function waitFor(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 2000;
  for (;;) {
    try { assertion(); return; }
    catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
