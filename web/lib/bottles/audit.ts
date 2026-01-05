import { Pool } from "pg";

export interface AuditLogEntry {
  userId: string;
  action: string;
  resourceId?: string;
  resourceType?: string;
  ip: string;
  status: "success" | "error" | "validation_error" | "not_found";
  details?: Record<string, unknown>;
}

let pool: Pool | null = null;

export const initAuditPool = (dbPool: Pool | null) => {
  pool = dbPool;
};

export const ensureAuditSchema = async (dbPool: Pool) => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_id TEXT,
      resource_type TEXT,
      ip TEXT NOT NULL,
      status TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);
};

export const auditLog = async (entry: AuditLogEntry) => {
  if (!pool) {
    console.warn("[AuditLogger] No DB pool, skipping audit log");
    return;
  }

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_id, resource_type, ip, status, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [entry.userId, entry.action, entry.resourceId || null, entry.resourceType || "bottle", entry.ip, entry.status, entry.details ? JSON.stringify(entry.details) : null]
    );
  } catch (err) {
    console.error("[AuditLogger] Failed to insert audit log", err);
  }
};

export const purgeOldAuditLogs = async (daysRetention: number = 90) => {
  if (!pool) {
    console.warn("[AuditLogger] No DB pool, skipping audit log purge");
    return;
  }

  try {
    const result = await pool.query(`DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '${daysRetention} days'`);
    console.info(`[AuditLogger] Purged ${result.rowCount} old audit logs (>= ${daysRetention} days)`);
  } catch (err) {
    console.error("[AuditLogger] Failed to purge audit logs", err);
  }
};
