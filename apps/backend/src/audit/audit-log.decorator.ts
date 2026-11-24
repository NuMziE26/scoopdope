import { SetMetadata, CustomDecorator } from '@nestjs/common';

/**
 * Metadata key used by the audit interceptor to read the action name
 * (and optional resource type) attached to a route handler.
 */
export const AUDIT_LOG_KEY = 'audit_log';

/**
 * Shape of the metadata attached to a route handler by the @AuditLog decorator.
 */
export interface AuditLogMetadata {
  /** The action name recorded in the audit log (e.g. "user.delete"). */
  action: string;
  /** Optional resource type the action operates on (e.g. "user", "course"). */
  resource?: string;
}

/**
 * Declaratively marks a route handler as an auditable admin action.
 *
 * The audit interceptor reads the attached metadata and writes an entry
 * to the audit log containing the actor, action, target, and timestamp.
 *
 * @param action The action name to record (e.g. "user.delete").
 * @param resource Optional resource type the action operates on.
 *
 * @example
 * ```ts
 * @AuditLog('user.delete', 'user')
 * @Delete(':id')
 * remove(@Param('id') id: string) { ... }
 * ```
 */
export function AuditLog(action: string, resource?: string): CustomDecorator<string> {
  const metadata: AuditLogMetadata = { action, resource };
  return SetMetadata(AUDIT_LOG_KEY, metadata);
}

/**
 * Reads the audit log metadata attached to a route handler or controller.
 *
 * @param target The handler function or controller class to inspect.
 * @returns The attached metadata, or `undefined` if none is present.
 */
export function getAuditLogMetadata(
  target: object | Function,
): AuditLogMetadata | undefined {
  if (target == null) {
    return undefined;
  }

  const metadata = Reflect.getMetadata(AUDIT_LOG_KEY, target) as
    | AuditLogMetadata
    | undefined;

  return metadata;
}