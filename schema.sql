-- 重定向表，存储短键和目标URL的映射
CREATE TABLE redirects (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 访问记录表，存储访问统计信息
CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  redirect_id INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,  -- 国家/地区
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (redirect_id) REFERENCES redirects(id)
);

-- 用户表，存储管理员账户
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始管理员账户，密码为"admin"（实际环境请使用更强的密码）
-- 注意: 这里使用的是bcrypt哈希值，实际部署时应替换
INSERT INTO users (username, password_hash) 
VALUES ('admin', '$2a$10$zXEv7BxnJ2oNMFYoV9OGLu5oNE9XJqeS8CdJxMbC5vvNBYPYjxrau'); 