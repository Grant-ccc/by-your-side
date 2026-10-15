ALTER TABLE messages
  ADD COLUMN reply_to_message_id CHAR(36) CHARACTER SET ascii NULL,
  ADD UNIQUE KEY uq_message_reply (reply_to_message_id);

ALTER TABLE generation_runs
  ADD COLUMN source_message_id CHAR(36) CHARACTER SET ascii NULL,
  ADD COLUMN attempt INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN budget_period_id CHAR(36) CHARACTER SET ascii NULL,
  ADD COLUMN prompt_tokens INT UNSIGNED NULL,
  ADD COLUMN completion_tokens INT UNSIGNED NULL,
  ADD COLUMN error_code VARCHAR(64) CHARACTER SET ascii NULL,
  ADD COLUMN finished_at DATETIME(3) NULL,
  ADD UNIQUE KEY uq_generation_attempt (source_message_id, attempt),
  ADD FOREIGN KEY (budget_period_id) REFERENCES budget_periods(id);
