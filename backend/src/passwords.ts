import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

const options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export class Passwords {
  private active = 0;
  private constructor(private readonly dummyHash: string) {}

  static async create(): Promise<Passwords> {
    return new Passwords(await argon2.hash(randomBytes(32), options));
  }

  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 4) throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', undefined, 1);
    this.active++;
    try { return await operation(); } finally { this.active--; }
  }

  hash(password: string): Promise<string> {
    return this.bounded(() => argon2.hash(password, options));
  }

  verify(hash: string | undefined, password: string): Promise<boolean> {
    return this.bounded(async () => {
      const valid = await argon2.verify(hash ?? this.dummyHash, password);
      return hash !== undefined && valid;
    });
  }
}
