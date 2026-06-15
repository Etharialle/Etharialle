import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = process.env.SUPPERSTACK_BILLING_DB_PATH || '/data/billing.sqlite';
const STARTER_IMPORTS = Number(process.env.SUPPERSTACK_STARTER_IMPORTS || 5);

const PRODUCTS = {
  supperstack_imports_50: {
    productId: 'supperstack_imports_50',
    title: '50 recipe imports',
    kind: 'pack',
    imports: 50,
    displayPrice: '$1.00'
  },
  supperstack_imports_200: {
    productId: 'supperstack_imports_200',
    title: '200 recipe imports',
    kind: 'pack',
    imports: 200,
    displayPrice: '$3.00'
  },
  supperstack_monthly_100: {
    productId: 'supperstack_monthly_100',
    title: 'Supperstack Monthly',
    kind: 'subscription',
    imports: 100,
    interval: 'month',
    displayPrice: '$1.00/month'
  }
};

export function createBillingStore(dbPath = DEFAULT_DB_PATH, options = {}) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  const now = options.now || (() => new Date());

  db.exec(`
    CREATE TABLE IF NOT EXISTS import_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      tester_id TEXT NOT NULL,
      source_host TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      tester_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      purchase_token TEXT NOT NULL,
      kind TEXT NOT NULL,
      imports INTEGER NOT NULL,
      interval TEXT NOT NULL DEFAULT '',
      period_start TEXT NOT NULL DEFAULT '',
      period_end TEXT NOT NULL DEFAULT '',
      UNIQUE(tester_id, purchase_token)
    );
    CREATE INDEX IF NOT EXISTS idx_import_usage_tester_id ON import_usage(tester_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_tester_id ON purchases(tester_id);
  `);

  const usageCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM import_usage
    WHERE tester_id = ?
  `);
  const packImportTotal = db.prepare(`
    SELECT COALESCE(SUM(imports), 0) AS count
    FROM purchases
    WHERE tester_id = ?
      AND kind = 'pack'
  `);
  const activeSubscriptions = db.prepare(`
    SELECT product_id AS productId, imports, interval, period_start AS periodStart, period_end AS periodEnd
    FROM purchases
    WHERE tester_id = ?
      AND kind = 'subscription'
      AND period_start <= ?
      AND period_end > ?
    ORDER BY created_at DESC
  `);
  const insertUsage = db.prepare(`
    INSERT INTO import_usage (created_at, tester_id, source_host)
    VALUES (?, ?, ?)
  `);
  const insertPurchase = db.prepare(`
    INSERT OR IGNORE INTO purchases (
      created_at,
      tester_id,
      product_id,
      purchase_token,
      kind,
      imports,
      interval,
      period_start,
      period_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    products: Object.values(PRODUCTS),
    productById(productId) {
      return PRODUCTS[productId] || null;
    },
    status(testerId) {
      return entitlementStatus(db, usageCount, packImportTotal, activeSubscriptions, normalizeTesterId(testerId), now());
    },
    canImport(testerId) {
      return entitlementStatus(db, usageCount, packImportTotal, activeSubscriptions, normalizeTesterId(testerId), now()).importsRemaining > 0;
    },
    recordImport({ testerId, sourceHost }) {
      insertUsage.run(now().toISOString(), normalizeTesterId(testerId), normalizeText(sourceHost, ''));
    },
    recordPurchase({ testerId, productId, purchaseToken }) {
      const product = PRODUCTS[productId];
      if (!product) {
        throw httpError('Unknown recipe import product.', 400);
      }

      const period = product.kind === 'subscription' ? subscriptionPeriod(now(), product.interval) : { start: '', end: '' };
      insertPurchase.run(
        now().toISOString(),
        normalizeTesterId(testerId),
        product.productId,
        normalizeText(purchaseToken, ''),
        product.kind,
        product.imports,
        product.interval || '',
        period.start,
        period.end
      );

      return entitlementStatus(db, usageCount, packImportTotal, activeSubscriptions, normalizeTesterId(testerId), now());
    },
    close() {
      db.close();
    }
  };
}

function entitlementStatus(db, usageCount, packImportTotal, activeSubscriptions, testerId, at) {
  const nowIso = at.toISOString();
  const used = Number(usageCount.get(testerId)?.count || 0);
  const packImports = Number(packImportTotal.get(testerId)?.count || 0);
  const subscriptions = activeSubscriptions.all(testerId, nowIso, nowIso);
  const subscription = subscriptions[0] || null;
  const subscriptionAllowance = subscription ? Number(subscription.imports || 0) : 0;
  const totalAllowance = STARTER_IMPORTS + packImports + subscriptionAllowance;
  const importsRemaining = Math.max(totalAllowance - used, 0);

  return {
    starterImports: STARTER_IMPORTS,
    packImports,
    subscriptionImports: subscriptionAllowance,
    importsUsed: used,
    importsRemaining,
    subscription: subscription ? {
      productId: subscription.productId,
      imports: subscriptionAllowance,
      interval: subscription.interval,
      resetAt: subscription.periodEnd
    } : null,
    products: Object.values(PRODUCTS)
  };
}

function subscriptionPeriod(at, interval) {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0));
  const end = new Date(start);

  if (interval === 'week') {
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (interval === 'day') {
    end.setUTCDate(end.getUTCDate() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeTesterId(value) {
  return normalizeText(value, 'unknown');
}

function normalizeText(value, fallback) {
  return String(value || fallback).trim().slice(0, 200);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
