const Database = require('./db');
const Auth = require('./auth');
// 注意：handleAdmin 可能不再需要，除非有非静态的 /admin 端点不由 R2 处理
// const { handleAdmin } = require('./admin');
const { getClientInfo } = require('./utils');

// 辅助函数：根据文件扩展名猜测 Content-Type
function getContentType(key) {
    const extension = key.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'html': return 'text/html;charset=UTF-8';
        case 'css': return 'text/css;charset=UTF-8';
        case 'js': return 'application/javascript;charset=UTF-8';
        case 'json': return 'application/json';
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'svg': return 'image/svg+xml';
        case 'ico': return 'image/x-icon';
        default: return 'application/octet-stream'; // 默认类型
    }
}

// 应用对象
const app = {
  // 处理请求的主函数
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 创建数据库实例
    const db = new Database(env.DB);

    // 创建认证实例
    const auth = new Auth(db, env.JWT_SECRET);

    // 阻止通过特殊重定向域名访问管理后台或API (此逻辑可能需要根据新需求调整或移除)
    const isPotentialSpecialDomain = url.hostname.endsWith('.pei.ee');
    const isAdminOrApiPath = path.startsWith('/admin') || path.startsWith('/api');

    // 修改：允许通过特殊域名访问管理页面和API (保持不变)
    if (isPotentialSpecialDomain && isAdminOrApiPath) {
        const isSpecialRedirectDomain = (url.hostname.includes('xiaohongshu') || url.hostname.includes('xhs'));
        if (isSpecialRedirectDomain) {
            console.log(`允许通过特殊域名 ${url.hostname} 访问路径 ${path}`);
        }
    }

    // --- 新增：处理 /admin 路径下的静态文件请求 (从 R2) ---
    if (path.startsWith('/admin')) {
      // 检查 MY_R2_BUCKET 是否已绑定
      if (!env.MY_R2_BUCKET) {
        console.error('Error: MY_R2_BUCKET binding not found.');
        return new Response('Internal Server Error: R2 bucket not configured.', { status: 500 });
      }

      try {
        // 提取 R2 对象键 (移除开头的 '/')
        // e.g., '/admin/index.html' -> 'admin/index.html'
        // e.g., '/admin/' -> 'admin/index.html' (需要处理根路径)
        let objectKey = path.substring(1);
        if (objectKey.endsWith('/')) {
            objectKey += 'index.html'; // 假设目录请求应提供 index.html
        }

        console.log(`Attempting to get object from R2: ${objectKey}`);
        const object = await env.MY_R2_BUCKET.get(objectKey);

        if (object === null) {
          console.log(`Object not found in R2: ${objectKey}`);
          // 如果 R2 中找不到，返回 404
          return new Response('Not Found', { status: 404 });
        }

        console.log(`Object found in R2: ${objectKey}, Size: ${object.size}`);

        // 构建响应头
        const headers = new Headers();
        // 复制 R2 的 HTTP 元数据 (Content-Type, Cache-Control, ETag etc.)
        // 如果上传时设置了 httpMetadata，这会包含 Content-Type
        object.writeHttpMetadata(headers);
        // 确保 ETag 被设置 (R2 对象总是有 etag)
        headers.set('etag', object.httpEtag);

        // 如果 R2 没有 Content-Type (例如上传时未指定)，尝试猜测
        if (!headers.has('content-type') || headers.get('content-type') === 'application/octet-stream') {
            const guessedContentType = getContentType(objectKey);
            if (guessedContentType) {
                headers.set('content-type', guessedContentType);
                console.log(`Guessed Content-Type for ${objectKey}: ${guessedContentType}`);
            } else {
                console.warn(`Could not guess Content-Type for ${objectKey}`);
                // 保留 R2 可能提供的 application/octet-stream 或不设置
            }
        }

        // 返回 R2 对象内容
        return new Response(object.body, {
          headers,
          status: 200 // R2 get 成功默认为 200
        });

      } catch (e) {
        console.error(`Error getting object from R2 (${path}):`, e);
        // 检查是否是 R2 特定的错误类型，可以提供更具体的错误信息
        if (e instanceof Error && e.message.includes('binding')) {
             return new Response('Internal Server Error: R2 bucket binding issue.', { status: 500 });
        }
        return new Response('Internal Server Error while fetching from R2', { status: 500 });
      }
    }
    // --- 结束 /admin R2 处理 ---

    // 处理API请求
    else if (path.startsWith('/api/')) { // 使用 else if
      return await handleApi(request, env, db, auth);
    }

    // 首页处理
    else if ((path === '/' || path === '') && !url.searchParams.has('key')) { // 使用 else if
       return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>URL重定向系统</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            h1 { color: #0070f3; }
            /* 链接到新的 R2 托管的管理页面 */
            a { color: #0070f3; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>URL重定向系统</h1>
          <p>请使用特定key访问。管理员可<a href="/admin/">登录管理面板</a>。</p>
        </body>
        </html>`,
        {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
          },
        }
      );
    }

    // 处理重定向 (作为默认行为)
    else { // 使用 else
      // 添加详细的调试日志
      console.log('处理重定向请求:', {
        url: request.url,
        hostname: url.hostname,
        path: path,
        query: Object.fromEntries(url.searchParams)
      });

      // 小红书特殊URL处理逻辑 - 针对 xiaohongshu.com.pei.ee 这样的格式
      if (url.hostname.endsWith('pei.ee') &&
         (url.hostname.includes('xiaohongshu') ||
          url.hostname.includes('xhs'))) {
        console.log('检测到小红书特定格式URL: *.xiaohongshu.*.pei.ee 或 *.xhs.*.pei.ee');

        const queryKey = url.searchParams.get('key');
        if (queryKey) {
          const key = queryKey;
          console.log('从小红书特定URL格式提取key:', key);

          const redirect = await db.getRedirectByKey(key);

          if (redirect) {
            const clientInfo = getClientInfo(request);
            ctx.waitUntil(db.addVisit(redirect.id, clientInfo)); // 使用 waitUntil 异步记录

            console.log('找到重定向目标:', redirect.url);
            return Response.redirect(redirect.url, 302);
          } else {
            console.log('未找到与key匹配的重定向:', key);
            return new Response(
              JSON.stringify({ error: `链接已不存在，请联系管理，key：${key}` }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
              }
            );
          }
        } else {
          console.log('小红书特定URL格式中未找到key参数');
          return new Response(
            JSON.stringify({ error: '未提供key参数' }),
            {
              status: 400, // Bad Request
              headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            }
          );
        }
      }
      // 处理其他小红书相关URL或一般的pei.ee域名 (此逻辑可能与上面重叠，需要审视)
      // 简化：如果不是特殊格式，则按通用逻辑处理
      /*
      else if (url.hostname.includes('xiaohongshu') || url.hostname.includes('pei.ee')) {
        // ... (原有逻辑，但可能已被上面或下面的通用逻辑覆盖) ...
      }
      */
      else {
        // 按照原来的流程处理普通URL格式
        let key = path.substring(1); // 从路径获取 key
        console.log('从路径提取key:', key);

        // 如果路径中没有key，尝试从查询参数中获取
        if (!key || key === '') {
          const queryKey = url.searchParams.get('key');
          if (queryKey) {
            key = queryKey;
            console.log('从查询参数提取key:', key);
          }
        }

        // 域名格式提取逻辑 (保持不变)
        if ((!key || key === '') && url.hostname) {
          console.log('尝试从域名格式中提取key, 主机名:', url.hostname);
          const hostParts = url.hostname.split('.');
          console.log('域名部分:', hostParts);
          if (hostParts.length >= 2) {
            const domainCheck = hostParts.join('.');
            console.log('检查域名结构:', domainCheck);
            if (domainCheck.includes('.pei.ee')) {
              const queryKey = url.searchParams.get('key');
              if (queryKey) {
                key = queryKey;
                console.log('从特殊域名结构的查询参数中提取key:', key);
              }
            }
          }
        }

        console.log('最终使用的key:', key);

        if (key) {
          const redirect = await db.getRedirectByKey(key);

          if (redirect) {
            const clientInfo = getClientInfo(request);
            ctx.waitUntil(db.addVisit(redirect.id, clientInfo)); // 使用 waitUntil

            console.log('找到重定向目标:', redirect.url);
            return Response.redirect(redirect.url, 302);
          } else {
            console.log('未找到与key匹配的重定向:', key);
            return new Response(
              JSON.stringify({ error: `链接已不存在，请联系管理，key：${key}` }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
              }
            );
          }
        } else {
           // 如果最终没有 key，返回 404 或首页？当前逻辑是返回 404
           console.log('没有有效的 key 用于重定向');
           return new Response(
             JSON.stringify({ error: '请求的资源未找到或无效' }),
             {
               status: 404,
               headers: { 'Content-Type': 'application/json;charset=UTF-8' },
             }
           );
        }
      }
    } // 结束重定向处理 else 块

    // 如果所有路由都未匹配 (理论上不应到达这里，因为最后的 else 块处理所有其他情况)
    // return new Response('Not Found', { status: 404 });

  }, // 结束 fetch 方法

  /**
   * 处理 Cloudflare Cron Triggers 调度事件
   * @param {ScheduledEvent} event - 调度事件对象
   * @param {object} env - 环境变量
   * @param {ExecutionContext} ctx - 执行上下文
   */
  async scheduled(event, env, ctx) {
    console.log(`Cron Trigger 事件触发: ${event.cron}`);

    // 实例化数据库
    const db = new Database(env.DB);

    // 计算昨天的日期 (YYYY-MM-DD)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateToAggregate = yesterday.toISOString().split('T')[0];

    // 执行聚合任务
    try {
      ctx.waitUntil(
        (async () => {
          const result = await db.aggregateDailyVisits(dateToAggregate);
          if (result.success) {
            console.log(`日期 ${dateToAggregate} 聚合成功。聚合记录: ${result.aggregatedCount}, 写入操作: ${result.writeOperations}`);
          } else {
            console.error(`日期 ${dateToAggregate} 聚合失败:`, result.error);
          }
        })()
      );
      console.log(`已启动日期 ${dateToAggregate} 的聚合任务。`);
    } catch (error) {
      console.error('启动聚合任务时发生异常:', error);
    }
  } // 结束 scheduled 方法
}; // 结束 app 对象

// 处理API请求 (保持不变)
async function handleApi(request, env, db, auth) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 健康检查端点
  if (path === '/api/health') {
    return new Response(
      JSON.stringify({ status: 'ok' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 登录 API (不需要预先验证，因为它本身就是验证过程)
  if (path === '/api/login' && request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      // 注意：Auth 实例需要在这里创建或传递进来
      const localAuth = new Auth(db, env.JWT_SECRET); // 在这里创建实例
      const token = await localAuth.login(username, password, env);

      if (token) {
        return new Response(
          JSON.stringify({ token, username }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: '用户名或密码错误' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error("Login API error:", e);
      // 检查是否是 JSON 解析错误
      if (e instanceof SyntaxError) {
          return new Response(
            JSON.stringify({ error: '无效的请求体，请确保发送 JSON 格式的数据' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
      }
      return new Response(
        JSON.stringify({ error: '登录过程中发生错误' }), // 更通用的错误
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // --- 其他需要认证的 API 端点 ---
  // 注意：auth 实例是从 fetch 传递过来的，但 handleApi 是独立调用的
  // 需要重新获取或确保 auth 实例可用
  const localAuthForProtected = new Auth(db, env.JWT_SECRET); // 再次创建实例
  const user = await localAuthForProtected.requireAuth(request); // 改为 await
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 在这里添加其他需要认证的 API 端点
  // 例如: /api/stats, /api/redirects 等
  if (path === '/api/admin/stats' && request.method === 'GET') {
      // 假设 db 实例也需要传递或重新创建
      const localDb = new Database(env.DB);
      // 调用获取统计数据的方法...
      // const stats = await localDb.getAdminStats();
      return new Response(JSON.stringify({ message: 'Stats endpoint reached (implement me)' }), { headers: { 'Content-Type': 'application/json' } });
  }


  // 如果没有匹配的 API 路由
  return new Response(
    JSON.stringify({ error: 'API Not Found' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}

// 导出Worker
export default app;