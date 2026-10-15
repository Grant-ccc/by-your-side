CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE characters (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  profile_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE relationships (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii NOT NULL,
  character_id CHAR(36) CHARACTER SET ascii NOT NULL,
  settings JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_relationship (user_id, character_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (character_id) REFERENCES characters(id)
) ENGINE=InnoDB;

CREATE TABLE conversations (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  relationship_id CHAR(36) CHARACTER SET ascii NOT NULL,
  title VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (relationship_id) REFERENCES relationships(id),
  INDEX ix_conversation_relationship (relationship_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE messages (
  sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id CHAR(36) CHARACTER SET ascii NOT NULL,
  conversation_id CHAR(36) CHARACTER SET ascii NOT NULL,
  client_request_id CHAR(36) CHARACTER SET ascii NULL,
  role ENUM('user','assistant','system') NOT NULL,
  text TEXT NOT NULL,
  status ENUM('saved','waiting','failed') NOT NULL DEFAULT 'saved',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_message_id (id),
  UNIQUE KEY uq_message_request (conversation_id, client_request_id),
  INDEX ix_message_cursor (conversation_id, sequence),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE budget_periods (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii NOT NULL,
  period CHAR(7) CHARACTER SET ascii NOT NULL,
  limit_amount DECIMAL(12,6) NOT NULL,
  spent_amount DECIMAL(12,6) NOT NULL DEFAULT 0,
  reserved_amount DECIMAL(12,6) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  UNIQUE KEY uq_budget_period (user_id, period),
  FOREIGN KEY (user_id) REFERENCES users(id),
  CHECK (limit_amount >= 0 AND spent_amount >= 0 AND reserved_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE generation_runs (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  conversation_id CHAR(36) CHARACTER SET ascii NOT NULL,
  request_key VARCHAR(128) CHARACTER SET ascii NOT NULL,
  state ENUM('queued','running','succeeded','failed','cancelled') NOT NULL,
  model VARCHAR(128) NULL,
  reserved_cost DECIMAL(12,6) NOT NULL DEFAULT 0,
  actual_cost DECIMAL(12,6) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_generation_request (conversation_id, request_key),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
