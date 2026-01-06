/**
 * Bottles Error Codes & i18n Mapping
 * All error responses use codes that map to i18n keys
 */

export enum BottlesErrorCode {
  // Resource errors
  BOTTLE_NOT_FOUND = "BOTTLE_NOT_FOUND",
  CELLAR_NOT_FOUND = "CELLAR_NOT_FOUND",
  
  // Input validation
  INVALID_INPUT = "INVALID_INPUT",
  INVALID_CATEGORY = "INVALID_CATEGORY",
  INVALID_VINTAGE = "INVALID_VINTAGE",
  INVALID_CELLAR_ID = "INVALID_CELLAR_ID",
  INVALID_FILL_LEVEL = "INVALID_FILL_LEVEL",
  INVALID_ABV = "INVALID_ABV",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  
  // Server errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  LIST_FAILED = "LIST_FAILED",
  LIST_CELLAR_FAILED = "LIST_CELLAR_FAILED",
  GET_FAILED = "GET_FAILED",
  CREATE_FAILED = "CREATE_FAILED",
  UPDATE_FAILED = "UPDATE_FAILED",
  DELETE_FAILED = "DELETE_FAILED",
}

/**
 * Map error codes to i18n keys for frontend translation
 * Keys follow format: errors.bottles.{code}
 */
export const ErrorCodeToI18nKey: Record<BottlesErrorCode, string> = {
  [BottlesErrorCode.BOTTLE_NOT_FOUND]: "errors.bottles.notFound",
  [BottlesErrorCode.CELLAR_NOT_FOUND]: "errors.bottles.cellarNotFound",
  [BottlesErrorCode.INVALID_INPUT]: "errors.bottles.invalidInput",
  [BottlesErrorCode.INVALID_CATEGORY]: "errors.bottles.invalidCategory",
  [BottlesErrorCode.INVALID_VINTAGE]: "errors.bottles.invalidVintage",
  [BottlesErrorCode.INVALID_CELLAR_ID]: "errors.bottles.invalidCellarId",
  [BottlesErrorCode.INVALID_FILL_LEVEL]: "errors.bottles.invalidFillLevel",
  [BottlesErrorCode.INVALID_ABV]: "errors.bottles.invalidAbv",
  [BottlesErrorCode.MISSING_REQUIRED_FIELD]: "errors.bottles.missingRequiredField",
  [BottlesErrorCode.UNAUTHORIZED]: "errors.auth.unauthorized",
  [BottlesErrorCode.FORBIDDEN]: "errors.auth.forbidden",
  [BottlesErrorCode.INTERNAL_ERROR]: "errors.common.internalError",
  [BottlesErrorCode.DATABASE_ERROR]: "errors.common.databaseError",
  [BottlesErrorCode.LIST_FAILED]: "errors.bottles.listFailed",
  [BottlesErrorCode.LIST_CELLAR_FAILED]: "errors.bottles.listCellarFailed",
  [BottlesErrorCode.GET_FAILED]: "errors.bottles.getFailed",
  [BottlesErrorCode.CREATE_FAILED]: "errors.bottles.createFailed",
  [BottlesErrorCode.UPDATE_FAILED]: "errors.bottles.updateFailed",
  [BottlesErrorCode.DELETE_FAILED]: "errors.bottles.deleteFailed",
};

/**
 * Error response format for API
 */
export interface ErrorResponse {
  error: string; // i18n key
  code: BottlesErrorCode;
  details?: string;
}

export function createErrorResponse(
  code: BottlesErrorCode,
  details?: string
): ErrorResponse {
  return {
    error: ErrorCodeToI18nKey[code],
    code,
    details,
  };
}
