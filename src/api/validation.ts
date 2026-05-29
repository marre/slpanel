import { ApiError } from './errors';
import type {
  CreateDisplayInput,
  DeparturesQuery,
  UpdateDisplayInput,
} from './types';

const OWNER_ID_PATTERN = /^[A-Za-z0-9]{8}$/;
const DISPLAY_RESOURCE_ID_PATTERN = /^[A-Za-z0-9]{8}-[A-Za-z0-9]{12}$/;
const SITE_ID_PATTERN = /^\d+$/;

export function validateOwnerId(value: string): string {
  if (!OWNER_ID_PATTERN.test(value)) {
    throw new ApiError(
      400,
      'validation_error',
      'owner_id must be 8 alphanumeric characters.',
    );
  }

  return value;
}

export function validateDisplayResourceId(value: string): string {
  if (!DISPLAY_RESOURCE_ID_PATTERN.test(value)) {
    throw new ApiError(
      400,
      'validation_error',
      'display id must match <owner-id>-<display-id>.',
    );
  }

  return value;
}

export function parseOwnerQuery(value: string | undefined): string {
  return validateOwnerId(readRequiredString(value, 'owner'));
}

export function parseStopsSearchQuery(value: string | undefined): string {
  const query = readRequiredString(value, 'q');

  if (query.length < 2) {
    throw new ApiError(
      400,
      'validation_error',
      'q must be at least 2 characters long.',
    );
  }

  return query;
}

export function parseDisplayCreateInput(value: unknown): CreateDisplayInput {
  const input = readObject(value, 'request body');
  const ownerId = validateOwnerId(
    readRequiredString(input.owner_id, 'owner_id'),
  );
  const siteId = readOptionalNullableString(input.site_id, 'site_id');
  const siteName = readOptionalNullableString(input.site_name, 'site_name');

  if (siteName && !siteId) {
    throw new ApiError(400, 'validation_error', 'site_name requires site_id.');
  }

  return {
    owner_id: ownerId,
    name: readOptionalString(input.name, 'name') ?? '',
    site_id: siteId ?? null,
    site_name: siteId === null ? null : (siteName ?? null),
    refresh_interval:
      readOptionalPositiveInteger(input.refresh_interval, 'refresh_interval') ??
      30,
    line_numbers:
      readOptionalStringArray(input.line_numbers, 'line_numbers') ?? [],
    directions: readOptionalStringArray(input.directions, 'directions') ?? [],
    modes:
      readOptionalStringArray(input.modes, 'modes', { uppercase: true }) ?? [],
  };
}

export function parseDisplayUpdateInput(value: unknown): UpdateDisplayInput {
  const input = readObject(value, 'request body');

  if ('owner_id' in input || 'display_id' in input || 'id' in input) {
    throw new ApiError(
      400,
      'validation_error',
      'owner_id, display_id, and id are immutable.',
    );
  }

  const siteId = readOptionalNullableString(input.site_id, 'site_id');
  const siteName = readOptionalNullableString(input.site_name, 'site_name');

  if (siteName && siteId === undefined) {
    throw new ApiError(
      400,
      'validation_error',
      'site_name updates require site_id to be included.',
    );
  }

  if (siteName && siteId === null) {
    throw new ApiError(
      400,
      'validation_error',
      'site_name cannot be set when site_id is null.',
    );
  }

  const result: UpdateDisplayInput = {};

  if ('name' in input) {
    result.name = readOptionalString(input.name, 'name') ?? '';
  }

  if ('site_id' in input) {
    result.site_id = siteId ?? null;
  }

  if ('site_name' in input) {
    result.site_name = siteName ?? null;
  }

  if ('refresh_interval' in input) {
    result.refresh_interval = readOptionalPositiveInteger(
      input.refresh_interval,
      'refresh_interval',
    );
  }

  if ('line_numbers' in input) {
    result.line_numbers =
      readOptionalStringArray(input.line_numbers, 'line_numbers') ?? [];
  }

  if ('directions' in input) {
    result.directions =
      readOptionalStringArray(input.directions, 'directions') ?? [];
  }

  if ('modes' in input) {
    result.modes =
      readOptionalStringArray(input.modes, 'modes', { uppercase: true }) ?? [];
  }

  return result;
}

export function parseDeparturesQuery(
  siteId: string,
  searchParams: URLSearchParams,
): DeparturesQuery {
  const parsedSiteId = readRequiredString(siteId, 'siteId');

  if (!SITE_ID_PATTERN.test(parsedSiteId)) {
    throw new ApiError(400, 'validation_error', 'siteId must be numeric.');
  }

  const forecastRaw = searchParams.get('forecast');
  const forecast = forecastRaw
    ? readOptionalPositiveInteger(forecastRaw, 'forecast')
    : 30;

  if (forecast === undefined || forecast > 240) {
    throw new ApiError(
      400,
      'validation_error',
      'forecast must be between 1 and 240 minutes.',
    );
  }

  return {
    site_id: parsedSiteId,
    lines: readQueryArray(searchParams, ['line', 'line_number']),
    directions: readQueryArray(searchParams, ['direction']),
    modes: readQueryArray(searchParams, ['mode', 'transport_mode'], {
      uppercase: true,
    }),
    forecast,
  };
}

function readObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(
      400,
      'validation_error',
      `${fieldName} must be a JSON object.`,
    );
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ApiError(
      400,
      'validation_error',
      `${fieldName} must be a string.`,
    );
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ApiError(
      400,
      'validation_error',
      `${fieldName} must not be empty.`,
    );
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredString(value, fieldName);
}

function readOptionalNullableString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return readRequiredString(value, fieldName);
}

function readOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsedValue =
    typeof value === 'number'
      ? value
      : Number(readRequiredString(value, fieldName));

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new ApiError(
      400,
      'validation_error',
      `${fieldName} must be a positive integer.`,
    );
  }

  return parsedValue;
}

function readOptionalStringArray(
  value: unknown,
  fieldName: string,
  options?: { uppercase?: boolean },
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(
      400,
      'validation_error',
      `${fieldName} must be an array of strings.`,
    );
  }

  const normalized = value.map((entry) => {
    const trimmed = readRequiredString(entry, fieldName);

    return options?.uppercase ? trimmed.toUpperCase() : trimmed;
  });

  return unique(normalized);
}

function readQueryArray(
  searchParams: URLSearchParams,
  keys: string[],
  options?: { uppercase?: boolean },
): string[] {
  const values = keys.flatMap((key) => searchParams.getAll(key));

  if (values.length === 0) {
    return [];
  }

  const exploded = values.flatMap((value) => value.split(','));

  return unique(
    exploded
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (options?.uppercase ? value.toUpperCase() : value)),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
