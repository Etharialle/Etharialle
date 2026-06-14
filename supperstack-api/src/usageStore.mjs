import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = process.env.SUPPERSTACK_USAGE_DB_PATH || '/data/usage.sqlite';

export function createUsageStore(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,
      month TEXT NOT NULL,
      tester_id TEXT NOT NULL,
      source_host TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      error_type TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_usage_events_day ON usage_events(day);
    CREATE INDEX IF NOT EXISTS idx_usage_events_month ON usage_events(month);
    CREATE INDEX IF NOT EXISTS idx_usage_events_tester_id ON usage_events(tester_id);
  `);

  const insertEvent = db.prepare(`
    INSERT INTO usage_events (
      created_at,
      day,
      month,
      tester_id,
      source_host,
      status_code,
      error_type,
      input_tokens,
      output_tokens,
      total_tokens
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const dailySummary = db.prepare(`
    SELECT
      day,
      tester_id AS testerId,
      status_code AS statusCode,
      error_type AS errorType,
      COUNT(*) AS requests,
      SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(total_tokens) AS totalTokens
    FROM usage_events
    WHERE day >= date('now', '-30 days')
    GROUP BY day, tester_id, status_code, error_type
    ORDER BY day DESC, tester_id ASC, status_code ASC, error_type ASC
  `);

  const monthlySummary = db.prepare(`
    SELECT
      month,
      tester_id AS testerId,
      status_code AS statusCode,
      error_type AS errorType,
      COUNT(*) AS requests,
      SUM(input_tokens) AS inputTokens,
      SUM(output_tokens) AS outputTokens,
      SUM(total_tokens) AS totalTokens
    FROM usage_events
    GROUP BY month, tester_id, status_code, error_type
    ORDER BY month DESC, tester_id ASC, status_code ASC, error_type ASC
  `);

  const recentEvents = db.prepare(`
    SELECT
      created_at AS createdAt,
      tester_id AS testerId,
      source_host AS sourceHost,
      status_code AS statusCode,
      error_type AS errorType,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      total_tokens AS totalTokens
    FROM usage_events
    ORDER BY id DESC
    LIMIT 50
  `);

  return {
    record(event) {
      const createdAt = event.createdAt || new Date().toISOString();
      insertEvent.run(
        createdAt,
        createdAt.slice(0, 10),
        createdAt.slice(0, 7),
        normalizeText(event.testerId, 'unknown'),
        normalizeText(event.sourceHost, ''),
        Number(event.statusCode || 0),
        normalizeText(event.errorType, 'none'),
        Number(event.inputTokens || 0),
        Number(event.outputTokens || 0),
        Number(event.totalTokens || 0)
      );
    },
    summary() {
      return {
        daily: dailySummary.all(),
        monthly: monthlySummary.all(),
        recent: recentEvents.all()
      };
    }
  };
}

function normalizeText(value, fallback) {
  return String(value || fallback).trim().slice(0, 160);
}
