export const ASSET_TYPES = ["GITHUB_ORG", "CLOUD_ACCOUNT", "DOMAIN", "SOCIAL_ACCOUNT", "AD_ACCOUNT", "BANK_ACCOUNT", "SAAS_APP", "OTHER"] as const;
export const ASSET_PROVIDERS = ["GITHUB", "AWS", "AZURE", "GCP", "CLOUDFLARE", "GODADDY", "GOOGLE_WORKSPACE", "MICROSOFT_365", "ACTIVE_DIRECTORY", "META", "LINKEDIN", "X", "BANK", "SLACK", "OTHER"] as const;
export const ASSET_CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const ASSET_MANAGED_MODES = ["INVENTORY_ONLY", "API_INTEGRATED"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetProvider = (typeof ASSET_PROVIDERS)[number];
export type AssetCriticality = (typeof ASSET_CRITICALITIES)[number];
export type AssetManagedModeInput = (typeof ASSET_MANAGED_MODES)[number];

export type AssetErrorCode =
  | "invalid_request"
  | "invalid_name"
  | "invalid_type"
  | "invalid_provider"
  | "invalid_criticality"
  | "invalid_managed_mode"
  | "managed_mode_not_enforced"
  | "invalid_field"
  | "unsupported_content_type"
  | "forbidden"
  | "not_found"
  | "critical_asset_requires_quorum"
  | "payload_too_large";

const STATUS: Record<AssetErrorCode, number> = {
  invalid_request: 400,
  invalid_name: 400,
  invalid_type: 400,
  invalid_provider: 400,
  invalid_criticality: 400,
  invalid_managed_mode: 400,
  managed_mode_not_enforced: 400,
  invalid_field: 400,
  unsupported_content_type: 415,
  forbidden: 403,
  not_found: 404,
  critical_asset_requires_quorum: 409,
  payload_too_large: 413,
};

export const ASSET_ERROR_MESSAGES: Partial<Record<AssetErrorCode, string>> = {
  managed_mode_not_enforced: "CRYPTOGRAPHICALLY_GATED is not available: BusinessVault does not enforce provider admin rights yet. Use INVENTORY_ONLY.",
  critical_asset_requires_quorum: "Critical assets cannot be deleted by a single owner. Deleting a critical asset is a quorum operation; lower its criticality through review first.",
};

export class AssetError extends Error {
  readonly status: number;
  constructor(readonly code: AssetErrorCode, readonly field?: string) {
    super(ASSET_ERROR_MESSAGES[code] ?? code);
    this.status = STATUS[code];
  }
}

export type AssetInput = {
  name: string;
  type: AssetType;
  provider: AssetProvider;
  externalResourceId: string | null;
  sensitivity: string | null;
  managedMode: AssetManagedModeInput;
  criticality: AssetCriticality;
  businessOwner: string | null;
  custodians: string[];
  adminContacts: string[];
  reviewDate: Date | null;
  recoveryPlan: string | null;
  notes: string | null;
};

const FIELDS = ["name", "type", "provider", "externalResourceId", "sensitivity", "managedMode", "criticality", "businessOwner", "custodians", "adminContacts", "reviewDate", "recoveryPlan", "notes"] as const;
type Field = (typeof FIELDS)[number];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new AssetError("invalid_field", field);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new AssetError("invalid_field", field);
  return trimmed.length ? trimmed : null;
}

function contactList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new AssetError("invalid_field", field);
  return value.map(entry => {
    if (typeof entry !== "string") throw new AssetError("invalid_field", field);
    const trimmed = entry.trim();
    if (trimmed.length < 1 || trimmed.length > 200) throw new AssetError("invalid_field", field);
    return trimmed;
  });
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], code: AssetErrorCode): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new AssetError(code);
  return value as T;
}

function parseField(field: Field, value: unknown): unknown {
  switch (field) {
    case "name": {
      if (typeof value !== "string") throw new AssetError("invalid_name");
      const name = value.trim();
      if (name.length < 2 || name.length > 120) throw new AssetError("invalid_name");
      return name;
    }
    case "type":
      return oneOf(value, ASSET_TYPES, "invalid_type");
    case "provider":
      return oneOf(value, ASSET_PROVIDERS, "invalid_provider");
    case "criticality":
      return oneOf(value, ASSET_CRITICALITIES, "invalid_criticality");
    case "managedMode":
      if (value === "CRYPTOGRAPHICALLY_GATED") throw new AssetError("managed_mode_not_enforced");
      return oneOf(value, ASSET_MANAGED_MODES, "invalid_managed_mode");
    case "externalResourceId":
      return optionalText(value, field, 300);
    case "sensitivity":
      return optionalText(value, field, 60);
    case "businessOwner":
      return optionalText(value, field, 200);
    case "recoveryPlan":
    case "notes":
      return optionalText(value, field, 4000);
    case "custodians":
    case "adminContacts":
      return contactList(value, field);
    case "reviewDate": {
      if (value === undefined || value === null || value === "") return null;
      if (typeof value !== "string") throw new AssetError("invalid_field", field);
      const date = new Date(value);
      if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new AssetError("invalid_field", field);
      return date;
    }
  }
}

function rejectUnknown(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) if (!(FIELDS as readonly string[]).includes(key)) throw new AssetError("invalid_field", key);
}

export function parseAssetCreate(body: unknown): AssetInput {
  if (!isObject(body)) throw new AssetError("invalid_request");
  rejectUnknown(body);
  const result: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (field === "managedMode" && body.managedMode === undefined) result.managedMode = "INVENTORY_ONLY";
    else if (field === "criticality" && body.criticality === undefined) result.criticality = "MEDIUM";
    else result[field] = parseField(field, body[field]);
  }
  return result as AssetInput;
}

export function parseAssetUpdate(body: unknown): Partial<AssetInput> {
  if (!isObject(body)) throw new AssetError("invalid_request");
  rejectUnknown(body);
  const result: Record<string, unknown> = {};
  for (const field of FIELDS) if (field in body) result[field] = parseField(field, body[field]);
  if (Object.keys(result).length === 0) throw new AssetError("invalid_request");
  return result as Partial<AssetInput>;
}

export function isReviewOverdue(reviewDate: Date | string | null | undefined, now = new Date()): boolean {
  if (!reviewDate) return false;
  return new Date(reviewDate).getTime() < now.getTime();
}
