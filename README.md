# URL重定向服务 - Cloudflare Workers实现

这是一个基于Cloudflare Workers和KV存储的URL重定向服务，可以根据请求中的`key`参数查询对应的目标URL并执行重定向。服务还包含一个管理面板，用于便捷地管理重定向规则。

## 功能特点

- 轻量级无服务器架构
- 全球分布式部署，低延迟
- 基于KV存储的键值映射
- 简单易用的API
- 管理面板支持CRUD操作
- 密码保护的管理界面

## 前置需求

- [Cloudflare账户](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/cli-wrangler/install-update)
- Node.js环境 (用于运行Wrangler)

## 部署步骤

### 1. 准备环境

1. 安装Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. 登录Cloudflare账户:
   ```bash
   wrangler login
   ```

### 2. 创建KV命名空间

1. 执行以下命令创建KV命名空间:
   ```bash
   wrangler kv:namespace create "URL_REDIRECTS"
   ```

2. 命令执行后会返回KV命名空间ID，复制此ID。

3. 编辑项目中的`wrangler.toml`文件，将`YOUR_KV_NAMESPACE_ID`替换为上一步获得的ID。

### 3. 配置管理员密码

1. 编辑`wrangler.toml`文件中的环境变量配置：
   
   ```toml
   [vars]
   ADMIN_PASSWORD = "your_secure_password"
   ```

   将`your_secure_password`替换为您希望设置的安全密码。

2. 如果需要在生产环境使用不同的密码，还可以配置：
   
   ```toml
   [env.production.vars]
   ADMIN_PASSWORD = "your_production_secure_password"
   ```

### 4. 添加重定向记录

使用以下命令添加重定向键值对:

```bash
wrangler kv:key put --binding=URL_REDIRECTS "example-key" "https://example.com"
```

可以添加多个键值对:

```bash
wrangler kv:key put --binding=URL_REDIRECTS "google" "https://google.com"
wrangler kv:key put --binding=URL_REDIRECTS "baidu" "https://baidu.com"
```

**注意：** 部署后，您也可以通过管理面板添加、编辑和删除重定向规则。

### 5. 部署Worker

在项目根目录执行:

```bash
wrangler publish
```

部署完成后，Wrangler会显示Worker的URL，类似于:
`https://url-redirect.your-subdomain.workers.dev`

### 6. 测试重定向

访问以下URL测试重定向功能:

```
https://url-redirect.your-subdomain.workers.dev/?key=example-key
```

如果一切正常，浏览器应该会重定向到对应的URL。

### 7. 访问管理面板

管理面板路径为：

```
https://url-redirect.your-subdomain.workers.dev/admin
```

输入您在`wrangler.toml`中配置的管理员密码登录。

## 自定义域名 (可选)

如果需要使用自定义域名，请按照以下步骤操作:

1. 确保域名已添加到您的Cloudflare账户

2. 编辑`wrangler.toml`文件，取消routes部分的注释并修改为您的域名

3. 重新部署Worker:
   ```bash
   wrangler publish
   ```

## 使用方法

### 重定向服务

服务部署完成后，可以通过以下格式的URL使用:

```
https://your-worker-url/?key=YOUR_KEY
```

当用户访问此URL时，系统会:
1. 提取`key`参数值
2. 在KV存储中查找对应的目标URL
3. 如果找到，执行302重定向到目标URL
4. 如果未找到，返回404错误页面

### 管理面板

管理面板提供以下功能：

1. **查看所有重定向规则**：登录后可以查看当前配置的所有重定向规则
2. **添加新规则**：点击"添加新重定向"按钮，填写key和目标URL
3. **编辑现有规则**：点击规则旁的"编辑"按钮修改key或目标URL
4. **删除规则**：点击规则旁的"删除"按钮删除不需要的规则

## 维护与管理

除了使用管理面板外，您也可以通过Wrangler CLI管理重定向规则：

### 添加新的重定向规则

```bash
wrangler kv:key put --binding=URL_REDIRECTS "new-key" "https://new-destination.com"
```

### 修改现有重定向规则

```bash
wrangler kv:key put --binding=URL_REDIRECTS "existing-key" "https://updated-destination.com"
```

### 删除重定向规则

```bash
wrangler kv:key delete --binding=URL_REDIRECTS "key-to-delete"
```

### 查看现有规则

```bash
wrangler kv:key list --binding=URL_REDIRECTS
```

## 安全注意事项

- 管理面板通过密码保护，密码存储在环境变量中
- 请设置强密码并定期更改
- 管理会话有1小时的超时时间，之后需要重新登录
- 所有API请求都需要通过会话验证

## 注意事项

- 该服务使用Cloudflare Workers免费计划，每天有10万次请求限制
- KV存储在免费计划中有存储量和操作次数的限制
- 如果需要处理大量请求，请考虑升级到付费计划 