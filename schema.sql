-- 重定向表，存储短键和目标URL的映射
CREATE TABLE redirects (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  visit_count INTEGER DEFAULT 0 NOT NULL,
  last_visit_at DATETIME,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 访问记录表，存储访问统计信息
CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  redirect_id INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (redirect_id) REFERENCES redirects(id)
);

-- 每日访问聚合表
CREATE TABLE daily_visits_summary (
  date DATE NOT NULL,
  redirect_id INTEGER NOT NULL,
  country TEXT,
  referer_domain TEXT,
  browser TEXT,
  os TEXT,
  visit_count INTEGER DEFAULT 1 NOT NULL,
  PRIMARY KEY (date, redirect_id, country, referer_domain, browser, os),
  FOREIGN KEY (redirect_id) REFERENCES redirects(id)
);

-- 用户表，存储管理员账户
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_redirects_created_at ON redirects(created_at);
CREATE INDEX idx_visits_redirect_id ON visits(redirect_id);
CREATE INDEX idx_visits_timestamp ON visits(timestamp);
CREATE INDEX idx_daily_visits_summary_date ON daily_visits_summary(date);

INSERT INTO users (username, password_hash)
VALUES ('admin', '$2a$10$zXEv7BxnJ2oNMFYoV9OGLu5oNE9XJqeS8CdJxMbC5vvNBYPYjxrau');