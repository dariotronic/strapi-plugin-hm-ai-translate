import { Core } from '@strapi/strapi';
import crypto from 'crypto';

export function generateCorrelationId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function logWithPrefix(
  strapi: Core.Strapi,
  meta: { correlationId?: string; phase?: string; durationMs?: number; [key: string]: any },
  level: 'info' | 'warn' | 'error',
  message: string,
  error?: any
) {
  const prefix = '[hm-ai-strapi-translate]';
  const corr = meta.correlationId ? `[CorrID:${meta.correlationId}]` : '';
  const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
  
  if (error) {
    strapi.log[level](`${prefix} ${corr} ${message} ${metaStr}`, error);
  } else {
    strapi.log[level](`${prefix} ${corr} ${message} ${metaStr}`);
  }
}
