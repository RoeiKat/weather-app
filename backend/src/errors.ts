export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { field: string; message: string }[],
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const unavailable = () =>
  new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.');

export function logFailure(event: string, requestId?: string): void {
  console.error(JSON.stringify({ level: 'error', event, ...(requestId ? { requestId } : {}) }));
}
