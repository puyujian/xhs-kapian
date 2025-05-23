# URL重定向系统

基于Cloudflare Workers的URL重定向系统，支持自定义短链接和访问统计。

## 部署说明

本项目使用Cloudflare Workers部署，请确保您拥有Cloudflare账户并已创建Workers应用。

### 本地开发

1. 安装依赖：
```bash
npm install
```

2. 启动本地开发服务器：
```bash
npm run dev
```

### 部署到Cloudflare

1. 使用命令行部署：
```bash
npm run publish
```
或直接使用：
```bash
npx wrangler deploy
```

2. 通过GitHub Actions自动部署：
   - 在GitHub仓库设置中添加`CLOUDFLARE_API_TOKEN`密钥
   - 推送代码到main分支即可触发自动部署

## 环境变量配置

在`wrangler.toml`文件中配置以下变量：

- `JWT_SECRET`: 用于JWT令牌加密的密钥
- `ADMIN_PASSWORD`: 管理员登录密码

## 数据库配置

本项目使用Cloudflare D1数据库，需要在`wrangler.toml`中配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "xhs"
database_id = "your-database-id"  # 替换为实际的数据库ID
```

## 表结构

使用`schema.sql`文件初始化数据库：

```sql
CREATE TABLE redirects (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  redirect_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  FOREIGN KEY (redirect_id) REFERENCES redirects (id)
);

CREATE INDEX visits_redirect_id ON visits (redirect_id);
```

## 特殊URL格式支持

除了标准的短链接格式（如 `https://your-domain.com/shortkey`），本系统还支持以下特殊格式：

### 查询参数形式

通过查询参数传递key：
```
https://your-domain.com/?key=shortkey
```

### 小红书类型URL格式

支持形如以下格式的URL：
```
https://www.xiaohongshu.com.pei.ee/?key=shortkey&from=xhsapp
https://xhs.com.pei.ee/?key=shortkey
```

或更复杂的子域名结构：
```
https://any-subdomain.xiaohongshu.com.pei.ee/?key=shortkey
```

这种格式专为需要伪装成小红书域名结构的应用场景设计，系统会优先识别域名中的`xiaohongshu`或`xhs`标识，并从查询参数中提取`key`值进行重定向。 