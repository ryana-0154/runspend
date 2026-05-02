export class RunspendError extends Error {
  readonly code: string;
  override readonly cause?: unknown;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class ConfigError extends RunspendError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("config_error", message, options);
  }
}

export class AuthError extends RunspendError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("auth_error", message, options);
  }
}

export class NotFoundError extends RunspendError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("not_found", message, options);
  }
}
