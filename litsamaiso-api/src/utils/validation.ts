import { Types } from "mongoose";
import AppError from "./errors.js";

export const requireString = (
  value: unknown,
  field: string,
  options?: { min?: number; max?: number },
): string => {
  if (value === undefined || value === null) {
    throw new AppError(`${field} is required`);
  }
  const str = String(value).trim();
  if (!str) {
    throw new AppError(`${field} is required`);
  }
  if (options?.min !== undefined && str.length < options.min) {
    throw new AppError(`${field} must be at least ${options.min} chars`);
  }
  if (options?.max !== undefined && str.length > options.max) {
    throw new AppError(`${field} must be at most ${options.max} chars`);
  }
  return str;
};

export const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

export const requireBoolean = (value: unknown, field: string): boolean => {
  if (value === undefined || value === null) {
    throw new AppError(`${field} is required`);
  }
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase().trim();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  throw new AppError(`${field} must be a boolean`);
};

export const requireDate = (value: unknown, field: string): Date => {
  if (value === undefined || value === null) {
    throw new AppError(`${field} is required`);
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${field} must be a valid date`);
  }
  return date;
};

export const requireObjectId = (value: unknown, field: string): Types.ObjectId => {
  if (value === undefined || value === null) {
    throw new AppError(`${field} is required`);
  }
  const id = String(value).trim();
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(`${field} must be a valid ObjectId`);
  }
  return new Types.ObjectId(id);
};

export const requireNumber = (
  value: unknown,
  field: string,
  options?: { min?: number; max?: number },
): number => {
  if (value === undefined || value === null || value === "") {
    throw new AppError(`${field} is required`);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new AppError(`${field} must be a number`);
  }
  if (options?.min !== undefined && num < options.min) {
    throw new AppError(`${field} must be at least ${options.min}`);
  }
  if (options?.max !== undefined && num > options.max) {
    throw new AppError(`${field} must be at most ${options.max}`);
  }
  return num;
};
