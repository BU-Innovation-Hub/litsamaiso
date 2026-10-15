export class AppError extends Error {
  statusCode: number;
  // Machine-readable reason, for clients that react to one specific failure
  code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

export default AppError;
