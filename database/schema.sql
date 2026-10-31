-- ════════════════════════════════════════════════
--  Student Time Management — MySQL + JWT Schema
-- ════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS student_planner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_planner;

-- ── ผู้ใช้งาน ────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                INT           AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(255)  NOT NULL UNIQUE,
  password_hash     VARCHAR(255)  NOT NULL,          -- bcrypt hash
  display_name      VARCHAR(255)  NOT NULL DEFAULT '',
  rest_target_hours FLOAT         NOT NULL DEFAULT 2,
  lead_minutes      INT           NOT NULL DEFAULT 15,
  created_at        BIGINT        NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  updated_at        BIGINT        NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),

  INDEX idx_users_email (email)
);

-- ── ตารางเรียน/งาน ──────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id          INT     AUTO_INCREMENT PRIMARY KEY,
  user_id     INT     NOT NULL,
  type        ENUM('class','work') NOT NULL,
  name        VARCHAR(255) NOT NULL,
  day         TINYINT NOT NULL CHECK (day BETWEEN 0 AND 6),
  start_time  TIME    NOT NULL,
  end_time    TIME    NOT NULL,
  created_at  BIGINT  NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  updated_at  BIGINT  NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_items_user (user_id),
  INDEX idx_items_day  (user_id, day)
);

-- ── กิจกรรมพิเศษรายปี ───────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          INT     AUTO_INCREMENT PRIMARY KEY,
  user_id     INT     NOT NULL,
  event_date  DATE    NOT NULL,
  type        ENUM('exam','holiday','deadline','activity') NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  BIGINT  NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_events_user_date (user_id, event_date)
);
