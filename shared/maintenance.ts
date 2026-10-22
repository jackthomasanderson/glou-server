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
