-- Migration: Add current_value to wines and create tobacco_alerts table
-- Date: 2025-12-25
-- Description: Adds current_value column for ROI calculation and tobacco alerts support

-- Add current_value column to wines table
ALTER TABLE wines ADD COLUMN current_value REAL;

-- Create tobacco_alerts table
CREATE TABLE IF NOT EXISTS tobacco_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tobacco_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    dismissed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tobacco_id) REFERENCES tobaccos(id) ON DELETE CASCADE
);

-- Create index for faster tobacco alert queries
CREATE INDEX IF NOT EXISTS idx_tobacco_alerts_status ON tobacco_alerts(status);
CREATE INDEX IF NOT EXISTS idx_tobacco_alerts_tobacco_id ON tobacco_alerts(tobacco_id);
