export function renderUsageDashboard(summary) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SupperStack Usage</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f5ef; color: #17221b; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 48px; }
    h1 { margin: 0 0 4px; font-size: 30px; }
    h2 { margin-top: 32px; font-size: 20px; }
    p { color: #56665c; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; background: #fffdf7; border: 1px solid #d9ded7; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e8e2; text-align: left; font-size: 14px; }
    th { background: #eef3ef; color: #26352c; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    td.number, th.number { text-align: right; font-variant-numeric: tabular-nums; }
    tr.moderation-flagged { background: #fff7df; }
    tr.moderation-blocked { background: #ffe8e5; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge-ok { background: #e7efe8; color: #28603a; }
    .badge-flagged { background: #fff0bf; color: #8a5a00; }
    .badge-blocked { background: #ffd6d1; color: #9d1f1f; }
    .empty { padding: 18px; background: #fffdf7; border: 1px solid #d9ded7; color: #56665c; }
  </style>
</head>
<body>
  <main>
    <h1>SupperStack Usage</h1>
    <p>Internal extraction usage. Full recipe URLs and tester keys are not shown.</p>
    <p>Moderation flags are safety signals from OpenAI. Observe-mode flags are not automatically blocked.</p>
    ${renderTable('Daily Summary', summary.daily, ['day', 'testerId', 'statusCode', 'errorType', 'requests', 'inputTokens', 'outputTokens', 'totalTokens', 'moderationFlagged', 'moderationBlocked'])}
    ${renderTable('Monthly Summary', summary.monthly, ['month', 'testerId', 'statusCode', 'errorType', 'requests', 'inputTokens', 'outputTokens', 'totalTokens', 'moderationFlagged', 'moderationBlocked'])}
    ${renderTable('Recent Events', summary.recent, ['createdAt', 'testerId', 'sourceHost', 'statusCode', 'errorType', 'inputTokens', 'outputTokens', 'totalTokens', 'moderationFlagged', 'moderationBlocked', 'moderationCategories', 'moderationMaxScore', 'moderationMode'])}
  </main>
</body>
</html>`;
}

function renderTable(title, rows, columns) {
  if (!rows.length) {
    return `<section><h2>${escapeHtml(title)}</h2><div class="empty">No usage events recorded yet.</div></section>`;
  }

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${columns.map((column) => `<th class="${isNumberColumn(column) ? 'number' : ''}">${escapeHtml(labelForColumn(column))}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr class="${rowClass(row)}">${columns.map((column) => `<td class="${isNumberColumn(column) ? 'number' : ''}">${renderCell(row, column)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

function labelForColumn(column) {
  return column.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function isNumberColumn(column) {
  return ['statusCode', 'requests', 'inputTokens', 'outputTokens', 'totalTokens', 'moderationFlagged', 'moderationBlocked', 'moderationMaxScore'].includes(column);
}

function rowClass(row) {
  if (Number(row.moderationBlocked || 0) > 0) return 'moderation-blocked';
  if (Number(row.moderationFlagged || 0) > 0) return 'moderation-flagged';
  return '';
}

function renderCell(row, column) {
  if (column === 'moderationBlocked') {
    return Number(row[column] || 0) > 0
      ? `<span class="badge badge-blocked">Blocked ${escapeHtml(row[column])}</span>`
      : '<span class="badge badge-ok">No</span>';
  }

  if (column === 'moderationFlagged') {
    return Number(row[column] || 0) > 0
      ? `<span class="badge badge-flagged">Flagged ${escapeHtml(row[column])}</span>`
      : '<span class="badge badge-ok">No</span>';
  }

  return escapeHtml(row[column]);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
