// #466: admin maintenance contracts shared by api/ and web/. Import only from shared/.

/** What a full data purge deleted. */
export interface PurgeResult {
  success: boolean;
  counts: {
    items: number;
    cellars: number;
    auditLogs: number;
  };
}

/** Body of POST /api/admin/maintenance/purge: the purge result plus the backup taken just before it (#489). */
export interface PurgeResponse extends PurgeResult {
  backupRunId: string;
}

/** Body of GET /api/admin/backups/health. */
export interface BackupHealth {
  /** Whether the API can write to its backups folder (#537). */
  directoryWritable: boolean;
  /** Whether the daily automatic backup is switched on (#756). Absent when it could not be read. */
  backupEnabled?: boolean;
  /** When the last successful backup ran, any trigger; null when none ever did, absent when it could not be read (#756). An ISO string on the wire. */
  lastSuccessAt?: string | Date | null;
}
