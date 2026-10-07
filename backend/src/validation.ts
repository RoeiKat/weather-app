import countries from 'i18n-iso-countries';
import { z } from 'zod';
import { AppError } from './errors.js';

export const countryCode = z.string().toUpperCase().refine(
  (value) => /^[A-Z]{2}$/.test(value) && countries.isValid(value),
  'Enter a valid two-letter country code.',
);
export const latitude = z.number().finite().min(-90).max(90);
export const longitude = z.number().finite().min(-180).max(180);
export const displayText = (max: number) => z.string().trim().min(1).max(max)
  .refine((text) => !/[<>]/.test(text) &&
    Array.from(text).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));
export const locationSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  countryCode: countryCode.nullable(),
  latitude,
  longitude,
});
export type Location = z.infer<typeof locationSchema>;
export const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().refine(
    (value) => Array.from(value).length >= 12 && Array.from(value).length <= 128,
    'Use 12-128 Unicode code points.',
  ),
});
export const snapshotSchema = z.strictObject({
  forecastAt: z.iso.datetime().transform((value) => new Date(value).toISOString()),
  temperatureC: z.number().finite(),
  description: displayText(200),
});
export type ForecastSnapshot = z.infer<typeof snapshotSchema>;
export const preferenceSchema = z.strictObject({ location: locationSchema, snapshot: snapshotSchema });

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.flatMap((issue) => {
      if (issue.code === 'unrecognized_keys') return issue.keys.map((key) => ({
        field: [...issue.path, key].map(String).join('.'), message: 'Remove unknown fields.',
      }));
      return issue.path.length ? [{
        field: issue.path.map(String).join('.'), message: 'Enter a valid value.',
      }] : [];
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'Check the submitted values.', fields.length ? fields : undefined);
  }
  return result.data;
}

export function canonicalCoordinate(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function canonicalLocation(value: Location): Location {
  return {
    ...value,
    latitude: canonicalCoordinate(value.latitude),
    longitude: canonicalCoordinate(value.longitude),
  };
}

const decimal = z.string().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/)
  .transform(Number);
const cityQuery = z.strictObject({ q: z.string().trim().min(1).max(100), countryCode: countryCode.optional() });
const coordinateQuery = z.strictObject({ latitude: decimal.pipe(latitude), longitude: decimal.pipe(longitude) });
export type WeatherQuery = z.infer<typeof cityQuery> | z.infer<typeof coordinateQuery>;

export function parseWeatherQuery(params: URLSearchParams): WeatherQuery {
  const input: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in input) throw new AppError(400, 'VALIDATION_ERROR', 'Use each query parameter only once.');
    input[key] = value;
  }
  return 'q' in input ? validate(cityQuery, input) : validate(coordinateQuery, input);
}
