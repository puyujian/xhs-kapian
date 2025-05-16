const Database = require('./db');
const Auth = require('./auth');
const { handleAdmin } = require('./admin');
const { getClientInfo } = require('./utils');

// 辅助函数：根据文件扩展名获取 MIME 类型
function getMimeType(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  switch (extension) {
    case 'html':
      return 'text/html;charset=UTF-8';
    case 'js':
      return 'application/javascript;charset=UTF-8';
    case 'css':
      return 'text/css;charset=UTF-8';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'ico':
      return 'image/x-icon';
    case 'svg':
      return 'image/svg+xml';
    case 'json':
      return 'application/json;charset=UTF-8';
    default:
      return 'application/octet-stream'; // 默认类型
  }
}

// 辅助函数：从 R2 提供静态资源
async function serveStaticAssetFromR2(request, env, path) {
  if (!env.STATIC_ASSETS) {
    console.error("[ERROR] R2 binding 'STATIC_ASSETS' is not available.");
    return new Response("Static asset serving misconfigured.", { status: 500 });
  }

  let objectKey = path.startsWith('/') ? path.substring(1) : path;

  // 智能处理 admin 目录下的 HTML 文件请求
  if (objectKey === 'admin' || objectKey === 'admin/') {
    objectKey = 'admin/index.html';
  } else if (objectKey.startsWith('admin/')) {
    // 路径类似于 'admin/something' 或 'admin/something.ext'
    // 需要检查 'something' 是否需要附加 '.html'
    const parts = objectKey.split('/');
    const lastPart = parts[parts.length - 1];

    // 如果 lastPart 存在且不包含 '.', 例如 'urls', 'stats', 'login', 'index'
    if (lastPart && !lastPart.includes('.')) {
      objectKey += '.html';
    }
    // 如果 lastPart 包含 '.', 例如 'script.js' 或 'urls.html', 则保持不变
  }
  // 对于其他顶级静态资源，如 'favicon.ico', objectKey 已经正确

  console.log(`[DEBUG] Attempting to serve static asset from R2. Original Path: ${path}, Final ObjectKey: ${objectKey}`);

  try {
    const object = await env.STATIC_ASSETS.get(objectKey);

    if (object === null) {
      console.log(`[DEBUG] Asset not found in R2: ${objectKey}`);
      return new Response('Not Found', { status: 404 });
    }

    console.log(`[DEBUG] Asset found in R2: ${objectKey}`);
    const headers = new Headers();
    
    // 优先使用 R2 对象元数据中的 contentType，否则根据 objectKey 推断
    let contentType = (object.httpMetadata && object.httpMetadata.contentType) ||
                      (object.customMetadata && object.customMetadata.contentType) ||
                      getMimeType(objectKey);
    headers.set('Content-Type', contentType);

    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag);
    }
    if (object.uploaded) {
      headers.set('Last-Modified', object.uploaded.toUTCString());
    }
    
    // 其他可能的缓存头部，例如 Cache-Control
    // headers.set('Cache-Control', 'public, max-age=3600'); // 示例：缓存1小时

    return new Response(object.body, { headers });
  } catch (e) {
    console.error(`[ERROR] Error fetching asset from R2 (${objectKey}):`, e);
    return new Response('Error fetching static asset', { status: 500 });
  }
}


// 应用对象
const app = {
  // 处理请求的主函数
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`[DEBUG] Incoming request URL: ${request.url}`);
    console.log(`[DEBUG] Parsed path: ${path}`);
    console.log(`[DEBUG] Parsed hostname: ${url.hostname}`);
    
    // 处理 Cloudflare 特定路径
    if (path.startsWith('/cdn-cgi/')) {
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
    
    const db = new Database(env.DB);
    const auth = new Auth(db, env.JWT_SECRET);

    // 静态资源处理逻辑 (使用 R2)
    const staticAssetPaths = ['/favicon.ico', '/robots.txt']; // 可以扩展此列表
    // 处理 /admin, /admin/* (非API), 以及其他顶层静态资源
    if (path === '/admin' || path.startsWith('/admin/') || staticAssetPaths.includes(path)) {
        if (path.startsWith('/admin/api/')) {
             // API 调用，将由后续的 handleAdmin 处理
        } else {
            // 此处处理 /admin, /admin/, /admin/urls, /admin/urls.html, /admin/js/script.js 等
            // 以及 /favicon.ico
            console.log(`[DEBUG] Routing to serveStaticAssetFromR2 for path: ${path}`);
            return serveStaticAssetFromR2(request, env, path);
        }
    }

    // 阻止通过特殊重定向域名 (e.g., *.xiaohongshu.com.pei.ee) 访问管理后台或API
    const isPotentialSpecialDomain = url.hostname.endsWith('.pei.ee');
    const isAdminOrApiPath = path.startsWith('/admin') || path.startsWith('/api');

    if (isPotentialSpecialDomain && isAdminOrApiPath) {
        const isSpecialRedirectDomain = (url.hostname.includes('xiaohongshu') || url.hostname.includes('xhs'));
        if (isSpecialRedirectDomain) {
            console.log(`允许通过特殊域名 ${url.hostname} 访问路径 ${path}`);
        }
    }

    // 首页处理
    if ((path === '/' || path === '') && !url.searchParams.has('key')) {
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
    
    // 处理管理面板API请求
    if (path.startsWith('/admin/api/')) {
       return handleAdmin(request, env, ctx, db, auth);
    }
    
    // 处理API请求
    if (path.startsWith('/api/')) {
      return await handleApi(request, env, db, auth);
    }
    
    // 处理重定向
    console.log('处理重定向请求:', {
      url: request.url,
      hostname: url.hostname,
      path: path,
      query: Object.fromEntries(url.searchParams)
    });
    
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
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
          return new Response(
            JSON.stringify({ error: `链接已不存在，请联系管理，key：${key}` }),
            {
              status: 404,
              headers: {
                'Content-Type': 'application/json;charset=UTF-8',
              },
            }
          );
        }
      } else {
        console.log('小红书特定URL格式中未找到key参数');
        return new Response(
          JSON.stringify({ error: '未提供key参数' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
            },
          }
        );
      }
    }
    else if (url.hostname.includes('xiaohongshu') || url.hostname.includes('pei.ee')) {
      console.log('检测到一般小红书相关URL格式');
      
      const queryKey = url.searchParams.get('key');
      if (queryKey) {
        let key = queryKey;
        console.log('从小红书URL查询参数提取key:', key);
        
        const redirect = await db.getRedirectByKey(key);
        
        if (redirect) {
          const clientInfo = getClientInfo(request);
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
          return new Response(
            JSON.stringify({ error: `链接已不存在，请联系管理，key：${key}` }),
            {
              status: 404,
              headers: {
                'Content-Type': 'application/json;charset=UTF-8',
              },
            }
          );
        }
      } else {
        console.log('小红书URL中未找到key参数');
        return new Response(
          JSON.stringify({ error: '未提供key参数' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
            },
          }
        );
      }
    } else {
      let key = path.substring(1);
      console.log('从路径提取key:', key);
      
      if (!key || key === '') {
        const queryKey = url.searchParams.get('key');
        if (queryKey) {
          key = queryKey;
          console.log('从查询参数提取key:', key);
        }
      }
      
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
          await db.addVisit(redirect.id, clientInfo);
          
          console.log('找到重定向目标:', redirect.url);
          return Response.redirect(redirect.url, 302);
        } else {
          console.log('未找到与key匹配的重定向:', key);
          return new Response(
            JSON.stringify({ error: `链接已不存在，请联系管理，key：${key}` }),
            {
              status: 404,
              headers: {
                'Content-Type': 'application/json;charset=UTF-8',
              },
            }
          );
        }
      }
    }
    
    return new Response(
      JSON.stringify({ error: '请求的资源未找到或无效' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
      }
    );
  },

  async scheduled(event, env, ctx) {
    console.log(`Cron Trigger 事件触发: ${event.cron}`);
    
    const db = new Database(env.DB);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateToAggregate = yesterday.toISOString().split('T')[0];

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
  }
};

// 处理API请求 (这个函数保持不变，但调用它的地方可能调整了)
async function handleApi(request, env, db, auth) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path === '/api/health') {
    return new Response(
      JSON.stringify({ status: 'ok' }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
  
  // 其他API端点需要身份验证 (注意: /api/login 是特例)
  if (path !== '/api/login') { // login 接口本身不需要预先验证token
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
  }
  
  if (path === '/api/login' && request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      // 注意：auth.login 内部会处理密码验证和JWT生成
      const token = await auth.login(username, password, env); 
      
      if (token) {
        return new Response(
          JSON.stringify({ token, username }), // 返回 token 和 username
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
      console.error("Login API error:", e);
      return new Response(
        JSON.stringify({ error: '无效的请求或服务器内部错误' }),
        {
          status: e.message === 'Invalid JSON' ? 400 : 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }
  
  // 如果没有匹配的 API 路由
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

export default app;