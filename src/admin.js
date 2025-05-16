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
     // 注意： getAllRedirects 现在返回的数据结构可能已改变
     // 如果 getRedirectStats 被修改为不返回 count 和 last_visit
     // 可能需要调整这里的数据处理或调用另一个函数
     // 暂时假设 getAllRedirects 仍返回基础列表
     return jsonResponse({ redirects: redirects });
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
      console.error('创建重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
    }
  }
  // 更新重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'PUT') {
    try {
      const id = parseInt(path.split('/')[4], 10);
      const { key, url } = await request.json();
      
      console.log('更新重定向请求', { id, key, url });
      
      if (!key || !url) {
        return jsonResponse({ error: '键和URL都是必需的' }, 400);
      }
      
      // 检查键是否已存在且不是当前项
      const existing = await db.getRedirectByKey(key);
      console.log('更新重定向 - 检查键是否存在:', { 
        key, 
        id, 
        existingId: existing?.id, 
        idType: typeof id, 
        existingIdType: typeof existing?.id,
        existingIdNum: parseInt(existing?.id, 10),
        idNum: parseInt(id, 10),
        isEqual: parseInt(existing?.id, 10) === parseInt(id, 10)
      });
      
      // 改进比较逻辑，先确保existing存在，再进行数字ID比较
      if (existing) {
        const existingId = parseInt(existing.id, 10);
        const currentId = parseInt(id, 10);
        
        console.log('ID比较详情:', {
          existingId,
          currentId,
          existingIdType: typeof existingId,
          currentIdType: typeof currentId,
          isEqual: existingId === currentId
        });
        
        // 严格验证 ID 是否为有效数字
        if (isNaN(existingId) || isNaN(currentId)) {
          console.error('错误: 无效的记录 ID', { existingId, currentId });
          return jsonResponse({ error: '无效的记录 ID，无法完成更新' }, 400);
        }
        
        // 仅在 ID 有效时进行数字比较
        if (existingId !== currentId) {
          // 数字比较 - 只有当非当前项目的键相同时，才报错
          return jsonResponse({ error: '此键已被使用' }, 409);
        }
      }
      
      await db.updateRedirect(id, key, url);
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
  // 获取特定重定向的详细访问数据 (保留，可能用于查看原始日志)
  if (path.match(/^\/admin\/api\/redirects\/\d+\/visits$/) && request.method === 'GET') {
    const id = parseInt(path.split('/')[4], 10);
    const visits = await db.getRedirectVisits(id);
    return jsonResponse({ visits: visits?.results || [] }); // 确保返回数组
  }

  // --- 统计 API (重构) ---

  // 获取全局统计摘要
  if (path === '/admin/api/stats/summary' && request.method === 'GET') {
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let summary;
    if (startDate && endDate) {
      summary = await db.getStatsSummary(null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '1', 10); // 默认为 1 天
      summary = await db.getStatsSummary(days);
    }
    return jsonResponse({ summary });
  }

  // 获取时间序列统计
  if (path === '/admin/api/stats/timeseries' && request.method === 'GET') {
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let timeseries;
    if (startDate && endDate) {
      timeseries = await db.getTimeSeriesStats(null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '7', 10); // 默认为 7 天
      timeseries = await db.getTimeSeriesStats(days);
    }
    return jsonResponse({ timeseries });
  }
  
  // 获取 Top URLs (替代原 /admin/api/stats)
  if (path === '/admin/api/stats/top-urls' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let topUrls;
    if (startDate && endDate) {
      topUrls = await db.getTopUrlsByVisit(limit, null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '7', 10); // 默认最近 7 天
      topUrls = await db.getTopUrlsByVisit(limit, days);
    }
    return jsonResponse({ topUrls });
  }

  // 获取 Top 国家 (替代原 /admin/api/stats/countries)
  if (path === '/admin/api/stats/top-countries' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let topCountries;
    if (startDate && endDate) {
      topCountries = await db.getTopCountries(limit, null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '7', 10);
      topCountries = await db.getTopCountries(limit, days);
    }
    return jsonResponse({ topCountries });
  }

  // 获取 Top Referers
  if (path === '/admin/api/stats/top-referers' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let topReferers;
    if (startDate && endDate) {
      topReferers = await db.getTopReferers(limit, null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '7', 10);
      topReferers = await db.getTopReferers(limit, days);
    }
    return jsonResponse({ topReferers });
  }

  // 获取 Top User Agents
  if (path === '/admin/api/stats/top-user-agents' && request.method === 'GET') {
    const limit = parseInt(params.get('limit') || '10', 10);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    let topUserAgents;
    if (startDate && endDate) {
      topUserAgents = await db.getTopUserAgents(limit, null, startDate, endDate);
    } else {
      const days = parseInt(params.get('days') || '7', 10);
      topUserAgents = await db.getTopUserAgents(limit, days);
    }
    return jsonResponse({ topUserAgents });
  }

  // 手动触发数据聚合
  if (path === '/admin/api/aggregate' && request.method === 'POST') {
    try {
      const requestData = await request.json();
      const dateStr = requestData.date; // 指定日期，格式：YYYY-MM-DD
      
      // 验证日期格式
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return jsonResponse({
          success: false,
          error: '无效的日期格式，请使用YYYY-MM-DD格式'
        }, 400);
      }
      
      console.log(`管理员 ${user.username} 手动触发聚合，日期: ${dateStr}`);
      
      // 执行聚合
      const result = await db.aggregateDailyVisits(dateStr);
      
      return jsonResponse({ 
        success: true, 
        result,
        message: result.success ? '数据聚合成功' : '数据聚合失败' 
      });
    } catch (error) {
      console.error('手动触发聚合出错:', error);
      return jsonResponse({
        success: false,
        error: '聚合处理出错: ' + error.message
      }, 500);
    }
  }

  // 404 Not Found for other admin API routes
  return jsonResponse({ error: 'API Endpoint Not Found' }, 404);
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

// 这里实现页面的HTML生成函数
// getLoginPage(), getAdminIndexPage(), getUrlsPage(), getStatsPage()

// 基础HTML模板函数，用于生成页面骨架
function getBasePage(title, content, scripts = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - URL重定向系统</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    header {
      background-color: #fff;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    h1 {
      color: #2c3e50;
      margin: 0;
    }
    .nav {
      margin-top: 15px;
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
    }
    .nav a {
      color: #3498db;
      text-decoration: none;
      padding: 5px 10px;
      border-radius: 3px;
      transition: background-color 0.3s;
    }
    .nav a:hover {
      background-color: #eaf2f8;
    }
    .nav a.active {
      background-color: #3498db;
      color: white;
    }
    .main-content {
      background-color: #fff;
      padding: 25px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    input[type="text"], 
    input[type="password"],
    input[type="url"] {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 3px;
      font-size: 16px;
      box-sizing: border-box;
    }
    button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 16px;
      transition: background-color 0.3s;
    }
    button:hover {
      background-color: #2980b9;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f8f9fa;
    }
    tr:hover {
      background-color: #f1f1f1;
    }
    .error {
      color: #e74c3c;
      margin-top: 5px;
    }
    .success {
      color: #2ecc71;
      margin-top: 5px;
    }
    @media (max-width: 768px) {
      .nav {
        flex-direction: column;
        gap: 5px;
      }
      th, td {
        padding: 8px 10px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>URL重定向系统</h1>
    <div class="nav">
      <a href="/admin/" class="${title === '管理面板' ? 'active' : ''}">首页</a>
      <a href="/admin/urls" class="${title === 'URL管理' ? 'active' : ''}">URL管理</a>
      <a href="/admin/stats" class="${title === '访问统计' ? 'active' : ''}">访问统计</a>
      <a href="/" target="_blank">访问前台</a>
      <a href="#" id="logout" style="margin-left: auto;">退出登录</a>
    </div>
  </header>
  
  <div class="main-content">
    ${content}
  </div>

  <script>
    // 检查登录状态函数
    function checkAuth() {
      // 如果页面不是登录页面，且没有找到token，则重定向到登录页
      if (window.location.pathname !== '/admin/login' && !localStorage.getItem('token')) {
        window.location.href = '/admin/login';
      }
    }
    
    // 退出登录
    document.getElementById('logout')?.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/admin/login';
    });
    
    // 检查认证状态
    checkAuth();
    
    ${scripts}
  </script>
</body>
</html>`;
}

// 登录页面
function getLoginPage() {
  // 登录页面不需要导航栏，使用特殊布局
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理员登录 - URL重定向系统</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      background-color: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .login-container {
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      color: #2c3e50;
      text-align: center;
      margin-top: 0;
      margin-bottom: 25px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }
    input[type="text"], 
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 16px;
      box-sizing: border-box;
    }
    button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 12px 0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      width: 100%;
      transition: background-color 0.3s;
    }
    button:hover {
      background-color: #2980b9;
    }
    .error {
      color: #e74c3c;
      text-align: center;
      margin-top: 15px;
    }
    .home-link {
      display: block;
      text-align: center;
      margin-top: 20px;
      color: #7f8c8d;
      text-decoration: none;
    }
    .home-link:hover {
      color: #3498db;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>管理员登录</h1>
    <form id="login-form">
      <div class="form-group">
        <label for="username">用户名</label>
        <input type="text" id="username" name="username" required>
      </div>
      <div class="form-group">
        <label for="password">密码</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit">登录</button>
      <div id="error-message" class="error"></div>
    </form>
    <a href="/" class="home-link">返回首页</a>
  </div>

  <script>
    // 检查是否已登录，如果已登录则跳转到管理面板
    if (localStorage.getItem('token')) {
      window.location.href = '/admin/';
    }

    document.getElementById('login-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const errorElement = document.getElementById('error-message');
      
      // 清空错误信息
      errorElement.textContent = '';
      
      try {
        const response = await fetch('/admin/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // 登录成功，保存令牌
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
          
          // 跳转到管理面板
          window.location.href = '/admin/';
        } else {
          // 显示错误信息
          errorElement.textContent = data.error || '登录失败，请重试';
        }
      } catch (error) {
        errorElement.textContent = '网络错误，请稍后重试';
        console.error('登录请求错误:', error);
      }
    });
  </script>
</body>
</html>`;
}

// 管理面板主页
function getAdminIndexPage() {
  const content = `
    <h2>欢迎使用URL重定向系统</h2>
    <p>请从上方导航选择所需功能:</p>
    
    <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 30px;">
      <div style="flex: 1; min-width: 250px; background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0; color: #3498db;">URL管理</h3>
        <p>添加、编辑或删除重定向链接。</p>
        <a href="/admin/urls" style="display: inline-block; margin-top: 10px; text-decoration: none; color: #3498db;">前往 URL 管理 &rarr;</a>
      </div>
      
      <div style="flex: 1; min-width: 250px; background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0; color: #3498db;">访问统计</h3>
        <p>查看访问数据和统计信息。</p>
        <a href="/admin/stats" style="display: inline-block; margin-top: 10px; text-decoration: none; color: #3498db;">查看统计数据 &rarr;</a>
      </div>
    </div>
    
    <div id="system-info" style="margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
      <h3 style="margin-top: 0;">系统信息</h3>
      <p id="redirect-count">正在加载重定向数量...</p>
      <p id="visit-count">正在加载访问统计...</p>
      <p id="admin-info">当前登录用户: <span id="username">加载中...</span></p>
    </div>
  `;
  
  const scripts = `
    // 显示登录用户名
    document.getElementById('username').textContent = localStorage.getItem('username') || '未知';
    
    // 获取系统数据
    async function fetchSystemData() {
      try {
        // 获取认证token
        const token = localStorage.getItem('token');
        if (!token) {
          return;
        }
        
        // 获取所有重定向
        const redirectsResponse = await fetch('/admin/api/redirects', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if (redirectsResponse.ok) {
          const redirectsData = await redirectsResponse.json();
          redirects = redirectsData.redirects.results || [];
          document.getElementById('redirect-count').textContent = 
            '系统中共有 ' + redirects.length + ' 个重定向链接';
        }
        
        // 获取访问统计
        const statsResponse = await fetch('/admin/api/stats', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          let totalVisits = 0;
          
          if (statsData.stats && statsData.stats.length > 0) {
            // 计算总访问量
            totalVisits = statsData.stats.reduce((sum, item) => sum + (item.visit_count || 0), 0);
          }
          
          document.getElementById('visit-count').textContent = 
            '总访问量: ' + totalVisits + ' 次';
        }
      } catch (error) {
        console.error('获取系统数据出错:', error);
      }
    }
    
    // 加载系统数据
    fetchSystemData();
  `;
  
  return getBasePage('管理面板', content, scripts);
}

// URL管理页面
function getUrlsPage() {
  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0;">URL管理</h2>
      <button id="add-url-btn">添加新URL</button>
    </div>
    
    <div id="url-form-container" style="display: none; background-color: #f8f9fa; padding: 20px; margin-bottom: 20px; border-radius: 5px;">
      <h3 id="form-title">添加新URL</h3>
      <form id="url-form">
        <input type="hidden" id="url-id" value="">
        <div class="form-group">
          <label for="url-key">短链接键值 (key)</label>
          <input type="text" id="url-key" name="key" required placeholder="例如: abc123">
          <div id="key-error" class="error"></div>
        </div>
        <div class="form-group">
          <label for="url-target">目标URL</label>
          <input type="url" id="url-target" name="url" required placeholder="例如: https://example.com/some/long/path">
          <div id="url-error" class="error"></div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="submit" id="save-url-btn">保存</button>
          <button type="button" id="cancel-url-btn">取消</button>
        </div>
        <div id="form-message" style="margin-top: 10px;"></div>
      </form>
    </div>
    
    <div id="urls-table-container">
      <div id="loading-message">正在加载URL数据...</div>
      <div id="error-message" style="display: none; color: red; margin-bottom: 15px;"></div>
      <table id="urls-table" style="display: none;">
        <thead>
          <tr>
            <th>短链接</th>
            <th>目标URL</th>
            <th>创建时间</th>
            <th>访问次数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="urls-list">
          <!-- 数据将通过JavaScript动态加载 -->
        </tbody>
      </table>
      <div id="no-urls-message" style="display: none; text-align: center; padding: 20px;">
        没有找到任何URL记录。点击"添加新URL"按钮创建第一个重定向链接。
      </div>
      <button id="retry-load-btn" style="display: none; margin-top: 10px;">重试加载</button>
    </div>
  `;
  
  const scripts = `
    // 全局变量定义
    let redirects = [];
    let stats = {};
    let isLoadingData = false;
    let apiTimeout = 15000; // 15秒API超时
    
    // 调试工具
    function debugLog(message, data) {
      console.log('[URL管理]', message, data || '');
    }
    
    // 检查用户认证状态
    function checkAuth() {
      const token = localStorage.getItem('token');
      if (!token) {
        debugLog('未检测到认证令牌，重定向到登录页面');
        window.location.href = '/admin/login';
        return false;
      }
      return true;
    }
    
    // 工具函数：格式化日期
    function formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN');
    }
    
    // 显示/隐藏表单
    function toggleForm(show, isEdit = false) {
      debugLog('切换表单显示', { show, isEdit });
      const container = document.getElementById('url-form-container');
      if (!container) {
        debugLog('错误: 找不到表单容器元素');
        return;
      }
      
      container.style.display = show ? 'block' : 'none';
      
      if (show) {
        document.getElementById('form-title').textContent = isEdit ? '编辑URL' : '添加新URL';
        if (!isEdit) {
          // 清空表单
          document.getElementById('url-id').value = '';
          document.getElementById('url-key').value = '';
          document.getElementById('url-target').value = '';
        }
        // 清除任何错误消息
        document.getElementById('key-error').textContent = '';
        document.getElementById('url-error').textContent = '';
        document.getElementById('form-message').textContent = '';
      }
    }
    
    // 显示错误消息
    function showError(message) {
      const errorElement = document.getElementById('error-message');
      if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        // 添加样式使消息更突出
        errorElement.style.padding = '10px';
        errorElement.style.backgroundColor = '#ffecec';
        errorElement.style.border = '1px solid #f5c6cb';
        errorElement.style.borderRadius = '4px';
      }
      
      const loadingElement = document.getElementById('loading-message');
      if (loadingElement) {
        loadingElement.style.display = 'none';
      }
      
      const retryButton = document.getElementById('retry-load-btn');
      if (retryButton) {
        retryButton.style.display = 'block';
        // 使重试按钮更突出
        retryButton.style.marginTop = '15px';
        retryButton.style.padding = '8px 15px';
      }
      
      // 控制台输出错误
      console.error('URL管理错误:', message);
    }
    
    // 加载URL数据
    async function loadUrlData() {
      debugLog('开始加载URL数据');
      
      if (isLoadingData) {
        debugLog('已有加载请求正在进行中，跳过');
        return;
      }
      
      if (!checkAuth()) return;
      
      isLoadingData = true;
      
      try {
        const token = localStorage.getItem('token');
        
        // 隐藏错误消息，显示加载消息
        const errorElement = document.getElementById('error-message');
        if (errorElement) errorElement.style.display = 'none';
        
        const loadingElement = document.getElementById('loading-message');
        if (loadingElement) loadingElement.style.display = 'block';
        
        const retryButton = document.getElementById('retry-load-btn');
        if (retryButton) retryButton.style.display = 'none';
        
        // 获取所有重定向，添加超时处理
        debugLog('发送获取重定向请求');
        const redirectsPromise = fetch('/admin/api/redirects', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        // 添加超时处理
        const redirectsTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('获取重定向数据超时')), apiTimeout)
        );
        
        const redirectsResponse = await Promise.race([redirectsPromise, redirectsTimeout]);
        
        if (!redirectsResponse.ok) {
          // 检查是否是认证问题
          if (redirectsResponse.status === 401) {
            debugLog('认证失败，重定向到登录页面');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/admin/login';
            return;
          }
          
          const errorText = await redirectsResponse.text();
          debugLog('API响应错误', { status: redirectsResponse.status, body: errorText });
          throw new Error('API响应错误: ' + redirectsResponse.status + ' - ' + errorText);
        }
        
        const redirectsData = await redirectsResponse.json();
        // 修改点：确保 redirects 总是数组，并从正确的位置获取数据
        redirects = redirectsData.redirects.results || []; 
        debugLog('成功获取重定向数据', redirects);
        
        // 获取统计数据（如果需要的话，可以并行或串行获取）
        // debugLog('发送获取统计数据请求');
        // const statsPromise = fetch('/admin/api/stats', { ... });
        // ... 处理 stats ...
        
        // 渲染表格
        renderTable();
        
      } catch (error) {
        debugLog('加载URL数据时出错', error);
        showError('加载URL数据失败: ' + error.message);
      } finally {
        isLoadingData = false;
        const loadingElement = document.getElementById('loading-message');
        if (loadingElement) loadingElement.style.display = 'none';
        debugLog('URL数据加载完成');
      }
    }
    
    // 渲染表格
    function renderTable() {
      debugLog('开始渲染表格', { redirectsCount: redirects.length });
      const tableBody = document.getElementById('urls-list');
      const table = document.getElementById('urls-table');
      const noUrlsMessage = document.getElementById('no-urls-message');
      const errorMessage = document.getElementById('error-message');
      
      if (!tableBody || !table || !noUrlsMessage || !errorMessage) {
         debugLog('错误: 渲染表格所需的元素未找到');
         showError('无法渲染表格，页面结构可能已损坏。');
         return;
      }
      
      // 清空现有表格内容
      tableBody.innerHTML = ''; 
      errorMessage.style.display = 'none'; // 隐藏之前的错误
      
      if (redirects.length === 0) {
        debugLog('没有重定向数据，显示空消息');
        table.style.display = 'none';
        noUrlsMessage.style.display = 'block';
        return;
      }
      
      // 显示表格，隐藏空消息
      table.style.display = 'table'; // 使用'table'确保正确显示
      noUrlsMessage.style.display = 'none';
      
      redirects.forEach(item => {
        const row = tableBody.insertRow();
        
        // 添加调试信息
        debugLog('渲染行', item); 
        
        // 短链接键
        const keyCell = row.insertCell();
        keyCell.textContent = item.key;
        
        // 目标URL
        const urlCell = row.insertCell();
        // 为了防止非常长的URL破坏布局，可以考虑截断或添加title属性
        urlCell.textContent = item.url.length > 60 ? item.url.substring(0, 57) + '...' : item.url;
        urlCell.title = item.url; // 鼠标悬停时显示完整URL
        
        // 创建时间
        const createdCell = row.insertCell();
        // 修改点：直接使用API返回的格式化时间字符串
        createdCell.textContent = item.created_at; 
        // 如果需要客户端格式化：formatDate(item.created_at); 但API已提供格式化好的

        // 访问次数 - 注意：当前API不直接返回此数据，留空或显示0
        const visitsCell = row.insertCell();
        visitsCell.textContent = stats[item.id]?.visit_count || 0; // 尝试从 stats 获取，默认为0
        
        // 操作按钮
        const actionsCell = row.insertCell();
        actionsCell.style.whiteSpace = 'nowrap'; // 防止按钮换行
        
        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.classList.add('edit-btn'); // 添加类以便样式化
        editButton.style.marginRight = '5px'; // 添加间距
        editButton.dataset.id = item.id;
        editButton.addEventListener('click', handleEditClick);
        actionsCell.appendChild(editButton);
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.classList.add('delete-btn'); // 添加类以便样式化
        deleteButton.dataset.id = item.id;
        deleteButton.dataset.key = item.key;
        deleteButton.addEventListener('click', (event) => {
          const button = event.target;
          const id = button.dataset.id;
          if (id) {
            // 确认 id 是有效的数字才调用 deleteRedirect
            const numericId = parseInt(id, 10);
            if (!isNaN(numericId)) {
               // 调用异步删除函数，但注意 addEventListener 的回调通常不是 async
               // 因此我们不需要 await，让 deleteRedirect 在后台执行
               deleteRedirect(numericId); 
            } else {
               console.error('无效的删除 ID:', id);
               showMessage('无法删除：无效的 ID', true); // 假设 showMessage 函数可用
            }
          } else {
             console.error('未在删除按钮上找到 ID');
             showMessage('无法删除：缺少 ID', true); // 假设 showMessage 函数可用
          }
        });
        actionsCell.appendChild(deleteButton);
      });
      
      debugLog('表格渲染完成');
    }
    
    // 处理编辑按钮点击事件
    function handleEditClick(event) {
      const button = event.target;
      const id = button.dataset.id;
      debugLog('编辑按钮点击', { id }); // 记录原始ID（字符串）
      if (id) {
        try {
          const numericId = parseInt(id, 10); // 转换为数字
          if (!isNaN(numericId)) {
            editRedirect(numericId); // 调用编辑函数
          } else {
            debugLog('错误: 无效的数字ID', { id });
            showMessage('无法编辑：无效的 ID', true);
          }
        } catch (error) {
           debugLog('处理编辑点击时出错', { error });
           showMessage('编辑操作失败', true);
        }
      } else {
        debugLog('错误: 未在按钮上找到 ID');
        showMessage('无法编辑：缺少 ID', true);
      }
    }

    // 编辑重定向
    function editRedirect(id) {
      debugLog('编辑重定向', { id });
      
      const redirect = redirects.find(item => parseInt(item.id, 10) === id);
      if (!redirect) {
        debugLog('错误: 找不到ID为' + id + '的重定向');
        return;
      }
      
      // 填充表单
      document.getElementById('url-id').value = id; // 使用数字ID
      document.getElementById('url-key').value = redirect.key;
      document.getElementById('url-target').value = redirect.url;
      
      // 显示表单
      toggleForm(true, true);
      
      // 确保滚动到表单位置
      document.getElementById('url-form-container').scrollIntoView({ behavior: 'smooth' });
    }
    
    // 删除重定向
    async function deleteRedirect(id) {
      debugLog('删除重定向', { id });
      
      if (!confirm('确定要删除这个URL重定向吗？所有相关的访问记录也将被删除。')) {
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          debugLog('未检测到认证令牌，重定向到登录页面');
          window.location.href = '/admin/login';
          return;
        }
        
        const deletePromise = fetch('/admin/api/redirects/' + id, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        // 添加超时处理
        const deleteTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('删除操作超时')), apiTimeout)
        );
        
        const response = await Promise.race([deletePromise, deleteTimeout]);
        
        if (!response.ok) {
          // 检查是否是认证问题
          if (response.status === 401) {
            debugLog('认证失败，重定向到登录页面');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/admin/login';
            return;
          }
          
          const error = await response.json();
          showMessage(error.error || '删除失败，请重试', true);
          return;
        }
        
        // 重新加载数据
        await loadUrlData();
        showMessage('URL已成功删除', false);
      } catch (error) {
        console.error('删除URL错误:', error);
        showMessage('删除失败: ' + (error.message || '未知错误'), true);
      }
    }
    
    // 显示消息
    function showMessage(message, isError) {
      const messageElement = document.getElementById('form-message');
      if (!messageElement) {
        debugLog('错误: 找不到消息元素');
        return;
      }
      
      messageElement.textContent = message;
      messageElement.className = isError ? 'error' : 'success';
      messageElement.style.color = isError ? 'red' : 'green';
      
      // 3秒后清除消息
      setTimeout(() => {
        messageElement.textContent = '';
        messageElement.className = '';
        messageElement.style.color = '';
      }, 3000);
    }
    
    // 保存URL数据
    async function saveUrlData(id, key, url) {
      // 确保ID是数字
      const numericId = id ? parseInt(id, 10) : null;
      debugLog('保存URL数据', { id, numericId, key, url });
      
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          debugLog('未检测到认证令牌，重定向到登录页面');
          window.location.href = '/admin/login';
          return false;
        }
        
        let savePromise;
        
        // 更新或创建
        if (numericId) {
          // 更新现有记录
          debugLog('发送更新请求');
          savePromise = fetch('/admin/api/redirects/' + numericId, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, url })
          });
        } else {
          // 创建新记录
          debugLog('发送创建请求');
          savePromise = fetch('/admin/api/redirects', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, url })
          });
        }
        
        // 添加超时处理
        const saveTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('保存操作超时')), apiTimeout)
        );
        
        const response = await Promise.race([savePromise, saveTimeout]);
        
        // 检查HTTP状态码
        if (!response.ok) {
          const errorText = await response.text();
          debugLog('保存请求失败', { status: response.status, body: errorText });
          
          // 尝试解析JSON响应
          let errorMessage = '未知错误';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || '保存失败，请重试';
          } catch {
            errorMessage = '保存失败: ' + response.status + ' ' + response.statusText;
          }
          
          // 检查是否是认证问题
          if (response.status === 401) {
            debugLog('认证失败，重定向到登录页面');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/admin/login';
            return false;
          }
          
          // 显示API返回的错误
          showMessage(errorMessage, true);
          return false;
        }
        
        const data = await response.json();
        debugLog('保存请求响应', data);
        
        // 成功保存
        showMessage(id ? 'URL已成功更新' : 'URL已成功添加', false);
        toggleForm(false); // 关闭表单
        await loadUrlData(); // 重新加载数据
        return true;
      } catch (error) {
        console.error('保存URL错误:', error);
        showMessage('保存失败: ' + (error.message || '未知错误'), true);
        return false;
      }
    }
    
    // 初始化事件处理函数
    function initEventListeners() {
      debugLog('初始化事件监听器');
      
      // 添加URL按钮事件
      const addUrlBtn = document.getElementById('add-url-btn');
      if (addUrlBtn) {
        addUrlBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          debugLog('点击了添加URL按钮');
          toggleForm(true, false);
        });
      } else {
        debugLog('错误: 找不到添加URL按钮元素');
      }
      
      // 取消按钮事件
      const cancelUrlBtn = document.getElementById('cancel-url-btn');
      if (cancelUrlBtn) {
        cancelUrlBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          debugLog('点击了取消按钮');
          toggleForm(false);
        });
      } else {
        debugLog('错误: 找不到取消按钮元素');
      }
      
      // 重试加载按钮事件
      const retryLoadBtn = document.getElementById('retry-load-btn');
      if (retryLoadBtn) {
        retryLoadBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          debugLog('点击了重试加载按钮');
          loadUrlData();
        });
      } else {
        debugLog('错误: 找不到重试按钮');
      }
      
      // 表单提交事件
      const urlForm = document.getElementById('url-form');
      if (urlForm) {
        urlForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          debugLog('提交了URL表单');
          
          // 防止重复提交
          const saveButton = document.getElementById('save-url-btn');
          if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = '正在保存...';
          }
          
          const idValue = document.getElementById('url-id').value;
          const id = idValue ? parseInt(idValue, 10) : '';
          const key = document.getElementById('url-key').value.trim();
          const url = document.getElementById('url-target').value.trim();
          
          // 对ID的值进行控制台输出
          debugLog('表单数据', { idValue, id, key, url });
          
          if (!key || !url) {
            showMessage('键和URL不能为空', true);
            if (!key) document.getElementById('key-error').textContent = '键不能为空';
            if (!url) document.getElementById('url-error').textContent = 'URL不能为空';
            if (saveButton) {
              saveButton.disabled = false;
              saveButton.textContent = '保存';
            }
            return;
          }
          
          await saveUrlData(id, key, url);
          
          // 恢复按钮状态
          if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '保存';
          }
        });
      } else {
        debugLog('错误: 找不到表单或保存按钮');
      }
    }
    
    // 检查页面加载状态并初始化
    function checkReadyState() {
      if (document.readyState === 'loading') {
        // 文档仍在加载中，等待 DOMContentLoaded 事件
        document.addEventListener('DOMContentLoaded', initPage);
      } else {
        // 文档已加载完成，直接初始化
        initPage();
      }
    }
    
    // 页面初始化函数
    function initPage() {
      debugLog('初始化页面');
      
      // 检查认证
      if (!checkAuth()) return;
      
      // 初始化事件监听
      initEventListeners();
      
      // 加载URL数据
      loadUrlData();
      
      // 设置全局错误处理
      window.addEventListener('error', function(event) {
        console.error('全局错误:', event.error);
        if (!isLoadingData) {
          showError('发生错误: ' + (event.error?.message || '未知错误'));
        }
      });
    }
    
    // 启动初始化
    checkReadyState();
  `;
  
  return getBasePage('URL管理', content, scripts);
}

// 统计页面 (重构)
function getStatsPage() {
  // HTML 结构 (来自上一步骤)
  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0;">访问统计</h2>
      <div>
        <label for="stats-period" style="margin-right: 5px;">时间范围:</label>
        <select id="stats-period">
          <option value="1">今天</option>
          <option value="7" selected>过去 7 天</option>
          <option value="30">过去 30 天</option>
        </select>
      </div>
    </div>
    
    <div id="stats-loading" style="text-align: center; padding: 30px;">正在加载统计数据...</div>
    <div id="stats-error" style="display: none; color: red; border: 1px solid red; padding: 10px; margin-bottom: 20px; border-radius: 4px;">加载数据时出错。</div>
    
    <div id="stats-content" style="display: none;">
      <!-- 全局摘要 -->
      <div id="summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 30px;">
        <div class="summary-card" style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center;">
          <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #555;">总访问量</h3>
          <p id="summary-total-visits" style="font-size: 28px; font-weight: bold; margin: 0;">...</p>
        </div>
        <div class="summary-card" style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center;">
          <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #555;">活跃链接数</h3>
          <p id="summary-active-redirects" style="font-size: 28px; font-weight: bold; margin: 0;">...</p>
        </div>
         <div class="summary-card" style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center;">
          <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #555;">总链接数</h3>
          <p id="summary-total-redirects" style="font-size: 28px; font-weight: bold; margin: 0;">...</p>
        </div>
      </div>

      <!-- 时间序列图表 -->
      <div style="margin-bottom: 40px;">
        <h3 style="margin-bottom: 15px;">访问量趋势</h3>
        <canvas id="visits-timeseries-chart" height="100"></canvas>
      </div>

      <!-- Top N 列表区域 -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
        
        <div>
          <h3 style="margin-bottom: 15px;">Top URLs (按访问量)</h3>
          <table id="top-urls-table">
            <thead><tr><th>短链接</th><th>目标 URL</th><th>访问次数</th></tr></thead>
            <tbody id="top-urls-list"></tbody>
          </table>
           <div id="top-urls-empty" style="display: none; color: #777;">暂无数据</div>
        </div>

        <div>
          <h3 style="margin-bottom: 15px;">Top 来源 (Referers)</h3>
          <table id="top-referers-table">
            <thead><tr><th>来源域名</th><th>访问次数</th></tr></thead>
            <tbody id="top-referers-list"></tbody>
          </table>
          <div id="top-referers-empty" style="display: none; color: #777;">暂无数据</div>
        </div>

        <div>
          <h3 style="margin-bottom: 15px;">Top 国家/地区</h3>
           <table id="top-countries-table">
            <thead><tr><th>国家/地区</th><th>访问次数</th></tr></thead>
            <tbody id="top-countries-list"></tbody>
          </table>
           <div id="top-countries-empty" style="display: none; color: #777;">暂无数据</div>
        </div>
        
        <div>
          <h3 style="margin-bottom: 15px;">Top 浏览器/系统</h3>
           <table id="top-user-agents-table">
            <thead><tr><th>浏览器</th><th>操作系统</th><th>访问次数</th></tr></thead>
            <tbody id="top-user-agents-list"></tbody>
          </table>
           <div id="top-user-agents-empty" style="display: none; color: #777;">暂无数据</div>
        </div>

      </div>
      
      <!-- 数据聚合管理面板 -->
      <div style="margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
        <h3>数据聚合管理</h3>
        <p>当统计数据显示为空时，可以通过此功能手动触发数据聚合。</p>
        
        <div style="display: flex; gap: 10px; margin-top: 15px;">
          <input type="date" id="aggregate-date" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <button id="trigger-aggregate" style="padding: 8px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            触发数据聚合
          </button>
        </div>
        
        <div id="aggregate-status" style="margin-top: 10px; display: none;"></div>
      </div>
    </div>
  `;

  // 引入 Chart.js CDN和外部统计JS文件
  const chartJsScript = '<script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>';
  const statsScript = '<script src="/js/admin-stats.js"></script>';
  
  // 添加手动聚合的JavaScript
  const aggregateScript = `
    <script>
    // 手动聚合功能
    document.addEventListener('DOMContentLoaded', function() {
      const aggregateButton = document.getElementById('trigger-aggregate');
      if (aggregateButton) {
        aggregateButton.addEventListener('click', async function() {
          const dateInput = document.getElementById('aggregate-date');
          const statusElement = document.getElementById('aggregate-status');
          
          if (!dateInput.value) {
            statusElement.textContent = '请选择日期';
            statusElement.style.display = 'block';
            statusElement.style.color = 'red';
            return;
          }
          
          // 显示处理中状态
          statusElement.textContent = '正在处理聚合请求...';
          statusElement.style.display = 'block';
          statusElement.style.color = '#007bff';
          
          try {
            const token = localStorage.getItem('token');
            const response = await fetch('/admin/api/aggregate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({ date: dateInput.value })
            });
            
            const result = await response.json();
            
            if (result.success) {
              statusElement.textContent = '数据聚合成功，请刷新页面查看最新统计。';
              statusElement.style.color = 'green';
              
              // 3秒后自动刷新页面
              setTimeout(() => {
                window.location.reload();
              }, 3000);
            } else {
              statusElement.textContent = '聚合失败: ' + (result.error || '未知错误');
              statusElement.style.color = 'red';
            }
          } catch (error) {
            statusElement.textContent = '处理请求时出错: ' + error.message;
            statusElement.style.color = 'red';
          }
        });
      }
      
      // 设置日期选择器默认值为昨天
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateInput = document.getElementById('aggregate-date');
      if (dateInput) {
        dateInput.valueAsDate = yesterday;
      }
    });
    </script>
  `;

  // 将脚本传递给基础页面模板
  return getBasePage('访问统计', content, chartJsScript + statsScript + aggregateScript);
}

module.exports = {
  handleAdmin
};