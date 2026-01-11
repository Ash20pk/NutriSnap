-- Migration 006: Foods Ingestion Queue
-- Enables async enrichment of user-requested foods that aren't in the catalog yet

CREATE TABLE IF NOT EXISTS foods_ingestion_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id uuid NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    query text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempt_count int NOT NULL DEFAULT 0,
    last_error text NULL,
    next_attempt_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queue processing (status + retry scheduling)
CREATE INDEX IF NOT EXISTS idx_queue_status_next_attempt 
  ON foods_ingestion_queue(status, next_attempt_at);

-- Unique constraint: one queue entry per food
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_food_id 
  ON foods_ingestion_queue(food_id);

-- Index for query deduplication (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_queue_query_lower 
  ON foods_ingestion_queue(lower(query));

COMMENT ON TABLE foods_ingestion_queue IS 'Queue for async enrichment of user-requested foods via USDA/external APIs';
COMMENT ON COLUMN foods_ingestion_queue.query IS 'Normalized food name used for external API search';
COMMENT ON COLUMN foods_ingestion_queue.status IS 'pending|ready|processing|error (successful items are deleted)';
COMMENT ON COLUMN foods_ingestion_queue.next_attempt_at IS 'For exponential backoff on errors';
