// 管理面板API处理
async function handleAdminApi(request, env, db, auth) {
  const url = new URL(request.url);
  const path = url.pathname;
  const params = url.searchParams; // 获取查询参数

  // 处理登录请求
  if (path === '/admin/api/login' && request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      
      if (!username || !password) {
        return jsonResponse({ error: '用户名和密码不能为空' }, 400);
      }
      
      const token = await auth.login(username, password, env);
      
      if (token) {
        return jsonResponse({ token, username });
      }
      
      return jsonResponse({ error: '用户名或密码错误' }, 401);
    } catch (e) {
      return jsonResponse({ error: '无效的请求' }, 400);
    }
  }
  
  // 需要身份验证的API
  const user = auth.requireAuth(request);
  if (!user) {
    return jsonResponse({ error: '未授权' }, 401);
  }
  
  // --- 重定向管理 API (不变) ---
  // 获取所有重定向
  if (path === '/admin/api/redirects' && request.method === 'GET') {
     const redirects = await db.getAllRedirects();
     return jsonResponse({ redirects: redirects });
  }
  // 创建新的重定向
  if (path === '/admin/api/redirects' && request.method === 'POST') {
    try {
      const { key, url: targetUrl } = await request.json(); // Renamed url to targetUrl to avoid conflict
      
      if (!key || !targetUrl) {
        return jsonResponse({ error: '键和URL都是必需的' }, 400);
      }
      
      const existing = await db.getRedirectByKey(key);
      if (existing) {
        return jsonResponse({ error: '此键已被使用' }, 409);
      }
      
      const result = await db.addRedirect(key, targetUrl);
      return jsonResponse({ success: true, id: result.id });
    } catch (e) {
      console.error('创建重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
    }
  }
  // 更新重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'PUT') {
    try {
      const id = parseInt(path.split('/')[4], 10);
      const { key, url: targetUrl } = await request.json(); // Renamed url to targetUrl
      
      console.log('更新重定向请求', { id, key, url: targetUrl });
      
      if (!key || !targetUrl) {
        return jsonResponse({ error: '键和URL都是必需的' }, 400);
      }
      
      const existing = await db.getRedirectByKey(key);
      if (existing) {
        const existingId = parseInt(existing.id, 10);
        const currentId = parseInt(id, 10);
        if (isNaN(existingId) || isNaN(currentId)) {
          console.error('错误: 无效的记录 ID', { existingId, currentId });
          return jsonResponse({ error: '无效的记录 ID，无法完成更新' }, 400);
        }
        if (existingId !== currentId) {
          return jsonResponse({ error: '此键已被使用' }, 409);
        }
      }
      
      await db.updateRedirect(id, key, targetUrl);
      return jsonResponse({ success: true });
    } catch (e) {
      console.error('更新重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
    }
  }
  // 删除重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'DELETE') {
    try {
      const id = parseInt(path.split('/')[4], 10);
      await db.deleteRedirect(id);
      return jsonResponse({ success: true });
    } catch (e) {
      console.error('删除重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
    }
  }
  // 获取特定重定向的详细访问数据
  if (path.match(/^\/admin\/api\/redirects\/\d+\/visits$/) && request.method === 'GET') {
    const id = parseInt(path.split('/')[4], 10);
    const visits = await db.getRedirectVisits(id);
    return jsonResponse({ visits: visits?.results || [] });
  }

  // --- 统计 API (重构) ---
  if (path === '/admin/api/stats/summary' && request.method === 'GET') {
    const days = parseInt(params.get('days') || '1', 10);
    const summary = await db.getStatsSummary(days);
    return jsonResponse({ summary });
  }
  if (path === '/admin/api/stats/timeseries' && request.method === 'GET') {
    const days = parseInt(params.get('days') || '7', 10);
    const timeseries = await db.getTimeSeriesStats(days);
    return jsonResponse({ timeseries });
  }
  if (path === '/admin/api/stats/top-urls' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const days = parseInt(params.get('days') || '7', 10);
    const topUrls = await db.getTopUrlsByVisit(limit, days);
    return jsonResponse({ topUrls });
  }
  if (path === '/admin/api/stats/top-countries' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const days = parseInt(params.get('days') || '7', 10);
    const topCountries = await db.getTopCountries(limit, days);
    return jsonResponse({ topCountries });
  }
  if (path === '/admin/api/stats/top-referers' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const days = parseInt(params.get('days') || '7', 10);
    const topReferers = await db.getTopReferers(limit, days);
    return jsonResponse({ topReferers });
  }
  if (path === '/admin/api/stats/top-user-agents' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const days = parseInt(params.get('days') || '7', 10);
    const topUserAgents = await db.getTopUserAgents(limit, days);
    return jsonResponse({ topUserAgents });
  }
  if (path === '/admin/api/aggregate' && request.method === 'POST') {
    try {
      const requestData = await request.json();
      const dateStr = requestData.date;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return jsonResponse({ success: false, error: '无效的日期格式，请使用YYYY-MM-DD格式' }, 400);
      }
      console.log(`管理员 ${user.username} 手动触发聚合，日期: ${dateStr}`);
      const result = await db.aggregateDailyVisits(dateStr);
      return jsonResponse({ success: true, result, message: result.success ? '数据聚合成功' : '数据聚合失败' });
    } catch (error) {
      console.error('手动触发聚合出错:', error);
      return jsonResponse({ success: false, error: '聚合处理出错: ' + error.message }, 500);
    }
  }

  // 404 Not Found for other admin API routes
  return jsonResponse({ error: 'API Endpoint Not Found' }, 404);
}

// JSON响应辅助函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// 主处理函数，现在只处理API请求
async function handleAdmin(request, env, ctx, db, auth) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 所有 /admin/api/* 请求都由 handleAdminApi 处理
  if (pathname.startsWith('/admin/api/')) {
    return await handleAdminApi(request, env, db, auth);
  }
  
  // 如果请求到达这里，说明路由配置可能有问题，因为静态资源应该由 index.js 处理
  // 或者这是一个不应到达此处的 /admin/ 非 API 请求
  console.warn(`[admin.js] Unexpected request to non-API path: ${pathname}`);
  return new Response('Not Found (Invalid Admin Path)', { status: 404 });
}

module.exports = {
  handleAdmin
};