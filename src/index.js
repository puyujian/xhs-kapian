const Database = require('./db');
const Auth = require('./auth');
const { handleAdmin } = require('./admin');
const { getClientInfo } = require('./utils');

// 应用对象
const app = {
  // 处理请求的主函数
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 处理 Cloudflare 特定路径
    if (path.startsWith('/cdn-cgi/')) {
      // 处理 Cloudflare 的预加载和 RUM 请求
      if (path.startsWith('/cdn-cgi/speculation') || path.startsWith('/cdn-cgi/rum')) {
        return new Response('', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=3600'
          }
        });
      }
    }
    
    // 创建数据库实例
    const db = new Database(env.DB);
    
    // 创建认证实例
    const auth = new Auth(db, env.JWT_SECRET);

    // 阻止通过特殊重定向域名 (e.g., *.xiaohongshu.com.pei.ee) 访问管理后台或API
    // 使用与重定向逻辑相似的域名判断
    const isPotentialSpecialDomain = url.hostname.endsWith('.pei.ee'); // Basic check, adjust if needed
    const isAdminOrApiPath = path.startsWith('/admin') || path.startsWith('/api');

    // 修改：完全允许通过特殊域名访问管理页面和API
    if (isPotentialSpecialDomain && isAdminOrApiPath) {
        // More specific check based on lines 81-83:
        const isSpecialRedirectDomain = (url.hostname.includes('xiaohongshu') || url.hostname.includes('xhs'));
        if (isSpecialRedirectDomain) {
            // 允许通过特殊域名访问管理页面和API
            console.log(`允许通过特殊域名 ${url.hostname} 访问路径 ${path}`);
        }
    }

    // 处理静态资源
    if ((path === '/' || path === '') && !url.searchParams.has('key')) {
      // 首页
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
          </style>
        </head>
        <body>
          <h1>URL重定向系统</h1>
          <p>请使用特定key访问。管理员可<a href="/admin">登录管理面板</a>。</p>
        </body>
        </html>`,
        {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
          },
        }
      );
    }
    
    // 处理管理面板请求
    if (path.startsWith('/admin')) {
      return handleAdmin(request, env, ctx, db, auth);
    }
    
    // 处理API请求
    if (path.startsWith('/api/')) {
      return await handleApi(request, env, db, auth);
    }
    
    // 处理重定向
    // 添加详细的调试日志
    console.log('处理重定向请求:', {
      url: request.url,
      hostname: url.hostname,
      path: path,
      query: Object.fromEntries(url.searchParams)
    });
    
    // 小红书特殊URL处理逻辑 - 针对 xiaohongshu.com.pei.ee 这样的格式
    // 优先处理这种格式，提取查询参数中的key
    if (url.hostname.endsWith('pei.ee') && 
       (url.hostname.includes('xiaohongshu') || 
        url.hostname.includes('xhs'))) {
      console.log('检测到小红书特定格式URL: *.xiaohongshu.*.pei.ee 或 *.xhs.*.pei.ee');
      
      // 直接从查询参数获取key
      const queryKey = url.searchParams.get('key');
      if (queryKey) {
        const key = queryKey;
        console.log('从小红书特定URL格式提取key:', key);
        
        // 使用key进行重定向
        const redirect = await db.getRedirectByKey(key);
        
        if (redirect) {
          // 记录访问
          const clientInfo = getClientInfo(request);
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          // 重定向到目标URL
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
        }
      } else {
        console.log('小红书特定URL格式中未找到key参数');
      }
    }
    // 处理其他小红书相关URL或一般的pei.ee域名
    else if (url.hostname.includes('xiaohongshu') || url.hostname.includes('pei.ee')) {
      console.log('检测到一般小红书相关URL格式');
      
      // 始终优先从查询参数获取key
      const queryKey = url.searchParams.get('key');
      if (queryKey) {
        let key = queryKey;
        console.log('从小红书URL查询参数提取key:', key);
        
        // 使用key进行重定向
        const redirect = await db.getRedirectByKey(key);
        
        if (redirect) {
          // 记录访问
          const clientInfo = getClientInfo(request);
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          // 重定向到目标URL
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
        }
      } else {
        console.log('小红书URL中未找到key参数');
      }
    } else {
      // 按照原来的流程处理普通URL格式
      // 首先从路径中获取key（移除开头的"/"）
      let key = path.substring(1);
      console.log('从路径提取key:', key);
      
      // 如果路径中没有key，尝试从查询参数中获取
      if (!key || key === '') {
        // 尝试从查询参数中获取key
        const queryKey = url.searchParams.get('key');
        if (queryKey) {
          key = queryKey;
          console.log('从查询参数提取key:', key);
        }
      }
      
      // 处理形如 xiaohongshu.com.pei.ee 的域名格式
      // 检查主域名是否包含可能的重定向key
      if ((!key || key === '') && url.hostname) {
        console.log('尝试从域名格式中提取key, 主机名:', url.hostname);
        // 尝试解析类似 xiaohongshu.com.pei.ee 格式的域名
        const hostParts = url.hostname.split('.');
        console.log('域名部分:', hostParts);
        // 如果域名格式正确，查找可能的键
        if (hostParts.length >= 2) {
          // 检查域名中是否包含我们的目标域名结构
          const domainCheck = hostParts.join('.');
          console.log('检查域名结构:', domainCheck);
          if (domainCheck.includes('.pei.ee')) {
            // 从查询参数获取key
            const queryKey = url.searchParams.get('key');
            if (queryKey) {
              key = queryKey;
              console.log('从特殊域名结构的查询参数中提取key:', key);
            }
          }
        }
      }
      
      console.log('最终使用的key:', key);
      
      // 使用key进行重定向
      if (key) {
        const redirect = await db.getRedirectByKey(key);
        
        if (redirect) {
          // 记录访问
          const clientInfo = getClientInfo(request);
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          // 重定向到目标URL
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
        }
      }
    }
    
    // 404 Not Found
    return new Response(
      JSON.stringify({ error: 'Not Found' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  },

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
      // 使用 waitUntil 确保聚合任务在 Worker 返回响应前完成
      // 或者至少有足够的时间运行
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
  }
};

// 处理API请求
async function handleApi(request, env, db, auth) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 检查API请求类型
  if (path === '/api/health') {
    // 健康检查端点
    return new Response(
      JSON.stringify({ status: 'ok' }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
  
  // 其他API端点需要身份验证
  const user = auth.requireAuth(request);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
  
  // 登录验证
  if (path === '/api/login' && request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      const token = await auth.login(username, password, env);
      
      if (token) {
        return new Response(
          JSON.stringify({ token, username }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ error: '用户名或密码错误' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: '无效的请求' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }
  
  // 404 Not Found
  return new Response(
    JSON.stringify({ error: 'API Not Found' }),
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

// 导出Worker
export default app; 