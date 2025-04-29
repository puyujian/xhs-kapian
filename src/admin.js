const path = require('path');

// 管理面板请求处理
async function handleAdmin(request, env, ctx, db, auth) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 管理主页
  if (pathname === '/admin' || pathname === '/admin/') {
    return serveAdminPage('index');
  }
  
  // 管理页面路由
  if (pathname === '/admin/login') {
    return serveAdminPage('login');
  }
  
  if (pathname === '/admin/urls') {
    return serveAdminPage('urls');
  }
  
  if (pathname === '/admin/stats') {
    return serveAdminPage('stats');
  }
  
  // 管理API端点
  if (pathname.startsWith('/admin/api/')) {
    return await handleAdminApi(request, env, db, auth);
  }
  
  // 404 Not Found
  return new Response('Not Found', { status: 404 });
}

// 管理面板API处理
async function handleAdminApi(request, env, db, auth) {
  const url = new URL(request.url);
  const path = url.pathname;
  
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
  
  // 获取所有重定向
  if (path === '/admin/api/redirects' && request.method === 'GET') {
    const redirects = await db.getAllRedirects();
    return jsonResponse({ redirects: redirects.results });
  }
  
  // 获取重定向统计
  if (path === '/admin/api/stats' && request.method === 'GET') {
    const stats = await db.getRedirectStats();
    return jsonResponse({ stats: stats.results });
  }
  
  // 获取特定重定向的访问数据
  if (path.match(/^\/admin\/api\/redirects\/\d+\/visits$/) && request.method === 'GET') {
    const id = parseInt(path.split('/')[3], 10);
    const visits = await db.getRedirectVisits(id);
    return jsonResponse({ visits: visits.results });
  }
  
  // 获取按国家统计的访问数据
  if (path === '/admin/api/stats/countries' && request.method === 'GET') {
    const countries = await db.getVisitsByCountry();
    return jsonResponse({ countries: countries.results });
  }
  
  // 创建新的重定向
  if (path === '/admin/api/redirects' && request.method === 'POST') {
    try {
      const { key, url } = await request.json();
      
      if (!key || !url) {
        return jsonResponse({ error: '键和URL都是必需的' }, 400);
      }
      
      // 检查键是否已存在
      const existing = await db.getRedirectByKey(key);
      if (existing) {
        return jsonResponse({ error: '此键已被使用' }, 409);
      }
      
      const result = await db.addRedirect(key, url);
      return jsonResponse({ success: true, id: result.id });
    } catch (e) {
      return jsonResponse({ error: '无效的请求' }, 400);
    }
  }
  
  // 更新重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'PUT') {
    try {
      const id = parseInt(path.split('/')[3], 10);
      const { key, url } = await request.json();
      
      if (!key || !url) {
        return jsonResponse({ error: '键和URL都是必需的' }, 400);
      }
      
      // 检查键是否已存在且不是当前项
      const existing = await db.getRedirectByKey(key);
      if (existing && existing.id !== id) {
        return jsonResponse({ error: '此键已被使用' }, 409);
      }
      
      await db.updateRedirect(id, key, url);
      return jsonResponse({ success: true });
    } catch (e) {
      return jsonResponse({ error: '无效的请求' }, 400);
    }
  }
  
  // 删除重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'DELETE') {
    try {
      const id = parseInt(path.split('/')[3], 10);
      await db.deleteRedirect(id);
      return jsonResponse({ success: true });
    } catch (e) {
      return jsonResponse({ error: '无效的请求' }, 400);
    }
  }
  
  // 404 Not Found
  return jsonResponse({ error: 'API Not Found' }, 404);
}

// 提供管理页面
function serveAdminPage(page) {
  let content = '';
  
  // 根据页面提供相应的HTML
  switch (page) {
    case 'login':
      content = getLoginPage();
      break;
    case 'index':
      content = getAdminIndexPage();
      break;
    case 'urls':
      content = getUrlsPage();
      break;
    case 'stats':
      content = getStatsPage();
      break;
    default:
      return new Response('Not Found', { status: 404 });
  }
  
  return new Response(content, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
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

// 这里还需要添加其他页面的HTML生成函数
// getLoginPage(), getAdminIndexPage(), getUrlsPage(), getStatsPage()

module.exports = {
  handleAdmin
};