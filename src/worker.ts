import app from '@tanstack/react-start/server-entry';

interface Env { DB: D1Database }

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env) {
    const legacyRetentionMs = 29 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(`
      UPDATE app_documents
      SET expires_at = CAST((julianday(json_extract(value, '$.createdAt')) - 2440587.5) * 86400000 AS INTEGER) + ?
      WHERE key GLOB 'job:*' AND expires_at IS NULL
        AND json_valid(value) AND json_extract(value, '$.createdAt') IS NOT NULL
    `).bind(legacyRetentionMs).run();
    await env.DB.prepare(`
      UPDATE app_documents
      SET expires_at = (
        SELECT job.expires_at FROM app_documents AS job
        WHERE job.user_id = app_documents.user_id
          AND job.key = 'job:' || CASE
            WHEN app_documents.key GLOB 'item:*' THEN substr(app_documents.key, 6, 36)
            ELSE substr(app_documents.key, 10, 36)
          END
      )
      WHERE expires_at IS NULL AND (key GLOB 'item:*' OR key GLOB 'expected:*')
        AND EXISTS (
          SELECT 1 FROM app_documents AS job
          WHERE job.user_id = app_documents.user_id
            AND job.key = 'job:' || CASE
              WHEN app_documents.key GLOB 'item:*' THEN substr(app_documents.key, 6, 36)
              ELSE substr(app_documents.key, 10, 36)
            END
            AND job.expires_at IS NOT NULL
        )
    `).run();
    await env.DB.prepare('DELETE FROM app_documents WHERE expires_at IS NOT NULL AND expires_at <= ?')
      .bind(Date.now())
      .run();
  },
};
