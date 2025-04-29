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
    return jsonResponse({ redirects: redirects });
  }
  
  // 获取重定向统计
  if (path === '/admin/api/stats' && request.method === 'GET') {
    const stats = await db.getRedirectStats();
    return jsonResponse({ stats: stats });
  }
  
  // 获取特定重定向的访问数据
  if (path.match(/^\/admin\/api\/redirects\/\d+\/visits$/) && request.method === 'GET') {
    const id = parseInt(path.split('/')[3], 10);
    const visits = await db.getRedirectVisits(id);
    return jsonResponse({ visits: visits });
  }
  
  // 获取按国家统计的访问数据
  if (path === '/admin/api/stats/countries' && request.method === 'GET') {
    const countries = await db.getVisitsByCountry();
    return jsonResponse({ countries: countries });
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
      console.error('更新重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
    }
  }
  
  // 删除重定向
  if (path.match(/^\/admin\/api\/redirects\/\d+$/) && request.method === 'DELETE') {
    try {
      const id = parseInt(path.split('/')[3], 10);
      await db.deleteRedirect(id);
      return jsonResponse({ success: true });
    } catch (e) {
      console.error('删除重定向错误:', e);
      return jsonResponse({ error: '无效的请求: ' + e.message }, 400);
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
      
      const redirect = redirects.find(item => item.id === id);
      if (!redirect) {
        debugLog('错误: 找不到ID为' + id + '的重定向');
        return;
      }
      
      // 填充表单
      document.getElementById('url-id').value = redirect.id;
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
      debugLog('保存URL数据', { id, key, url });
      
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          debugLog('未检测到认证令牌，重定向到登录页面');
          window.location.href = '/admin/login';
          return false;
        }
        
        let savePromise;
        
        // 更新或创建
        if (id) {
          // 更新现有记录
          debugLog('发送更新请求');
          savePromise = fetch('/admin/api/redirects/' + id, {
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
          
          const id = document.getElementById('url-id').value;
          const key = document.getElementById('url-key').value.trim();
          const url = document.getElementById('url-target').value.trim();
          
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

// 统计页面
function getStatsPage() {
  const content = `
    <h2>访问统计</h2>
    
    <div id="stats-container">
      <div id="loading-message">正在加载统计数据...</div>
      
      <div id="summary-stats" style="display: none; margin-bottom: 30px;">
        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
          <div style="flex: 1; min-width: 200px; background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="margin-top: 0; color: #3498db;">总访问量</h3>
            <p id="total-visits" style="font-size: 24px; font-weight: bold;">0</p>
          </div>
          
          <div style="flex: 1; min-width: 200px; background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="margin-top: 0; color: #3498db;">活跃链接</h3>
            <p id="active-urls" style="font-size: 24px; font-weight: bold;">0</p>
          </div>
          
          <div style="flex: 1; min-width: 200px; background-color: #f8f9fa; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="margin-top: 0; color: #3498db;">最近活动</h3>
            <p id="last-activity" style="font-size: 16px;">无活动</p>
          </div>
        </div>
      </div>
      
      <div id="stats-tabs" style="display: none; margin-bottom: 20px;">
        <div style="border-bottom: 1px solid #ddd;">
          <button id="tab-urls" class="tab-button active" style="background: none; border: none; padding: 10px 15px; cursor: pointer; font-size: 16px; border-bottom: 2px solid #3498db;">按URL统计</button>
          <button id="tab-countries" class="tab-button" style="background: none; border: none; padding: 10px 15px; cursor: pointer; font-size: 16px;">按国家/地区统计</button>
        </div>
      </div>
      
      <div id="url-stats" class="tab-content" style="display: none;">
        <h3>URL访问统计</h3>
        <table>
          <thead>
            <tr>
              <th>URL键值</th>
              <th>目标URL</th>
              <th>访问次数</th>
              <th>最后访问时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="url-stats-list">
            <!-- 数据将通过JavaScript动态加载 -->
          </tbody>
        </table>
      </div>
      
      <div id="country-stats" class="tab-content" style="display: none;">
        <h3>按国家/地区统计</h3>
        <table>
          <thead>
            <tr>
              <th>国家/地区</th>
              <th>访问次数</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody id="country-stats-list">
            <!-- 数据将通过JavaScript动态加载 -->
          </tbody>
        </table>
      </div>
      
      <div id="visit-details" style="display: none; margin-top: 30px;">
        <h3>访问详情 - <span id="detail-url-key"></span></h3>
        <button id="back-to-stats" style="margin-bottom: 15px;">返回统计概览</button>
        <table>
          <thead>
            <tr>
              <th>访问时间</th>
              <th>IP地址</th>
              <th>国家/地区</th>
              <th>User Agent</th>
              <th>引荐来源</th>
            </tr>
          </thead>
          <tbody id="visit-details-list">
            <!-- 数据将通过JavaScript动态加载 -->
          </tbody>
        </table>
      </div>
      
      <div id="no-stats-message" style="display: none; text-align: center; padding: 20px;">
        没有找到任何访问数据。创建一些URL并生成一些访问来查看统计信息。
      </div>
    </div>
  `;
  
  const scripts = `
    // 格式化日期时间
    function formatDate(dateString) {
      if (!dateString) return '无数据';
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN');
    }
    
    // 计算时间差（友好显示）
    function timeAgo(dateString) {
      if (!dateString) return '无数据';
      
      const date = new Date(dateString);
      const now = new Date();
      const seconds = Math.floor((now - date) / 1000);
      
      if (seconds < 60) {
        return '刚刚';
      }
      
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        return minutes + '分钟前';
      }
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return hours + '小时前';
      }
      
      const days = Math.floor(hours / 24);
      if (days < 30) {
        return days + '天前';
      }
      
      const months = Math.floor(days / 30);
      if (months < 12) {
        return months + '个月前';
      }
      
      return Math.floor(months / 12) + '年前';
    }
    
    // 加载统计数据
    async function loadStats() {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        // 获取URL统计
        const statsResponse = await fetch('/admin/api/stats', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if (!statsResponse.ok) {
          throw new Error('无法加载URL统计数据');
        }
        
        const statsData = await statsResponse.json();
        const stats = statsData.stats || [];
        
        // 获取国家统计
        const countriesResponse = await fetch('/admin/api/stats/countries', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if (!countriesResponse.ok) {
          throw new Error('无法加载国家统计数据');
        }
        
        const countriesData = await countriesResponse.json();
        const countries = countriesData.countries || [];
        
        // 更新UI
        updateStatsUI(stats, countries);
      } catch (error) {
        console.error('加载统计数据错误:', error);
        document.getElementById('loading-message').textContent = '加载统计数据失败，请刷新页面重试';
      }
    }
    
    // 更新统计UI
    function updateStatsUI(stats, countries) {
      // 隐藏加载消息
      document.getElementById('loading-message').style.display = 'none';
      
      if (stats.length === 0) {
        document.getElementById('no-stats-message').style.display = 'block';
        return;
      }
      
      // 显示统计区域
      document.getElementById('summary-stats').style.display = 'block';
      document.getElementById('stats-tabs').style.display = 'block';
      document.getElementById('url-stats').style.display = 'block';
      
      // 计算总访问量
      const totalVisits = stats.reduce((sum, item) => sum + (parseInt(item.visit_count) || 0), 0);
      
      // 查找最近活动时间
      let lastActivity = null;
      stats.forEach(item => {
        if (item.last_visit) {
          const visitDate = new Date(item.last_visit);
          if (!lastActivity || visitDate > new Date(lastActivity)) {
            lastActivity = item.last_visit;
          }
        }
      });
      
      // 更新汇总统计
      document.getElementById('total-visits').textContent = totalVisits;
      document.getElementById('active-urls').textContent = stats.length;
      document.getElementById('last-activity').textContent = lastActivity ? timeAgo(lastActivity) : '无活动';
      
      // 填充URL统计表
      const urlStatsList = document.getElementById('url-stats-list');
      urlStatsList.innerHTML = '';
      
      stats.forEach(stat => {
        const row = document.createElement('tr');
        
        // 键列
        const keyCell = document.createElement('td');
        keyCell.textContent = stat.key;
        
        // URL列
        const urlCell = document.createElement('td');
        const shortUrl = stat.url.length > 50 ? stat.url.substring(0, 47) + '...' : stat.url;
        urlCell.textContent = shortUrl;
        urlCell.title = stat.url;
        
        // 访问次数列
        const visitsCell = document.createElement('td');
        visitsCell.textContent = stat.visit_count || 0;
        
        // 最后访问时间列
        const lastVisitCell = document.createElement('td');
        lastVisitCell.textContent = stat.last_visit ? timeAgo(stat.last_visit) : '无访问';
        
        // 操作列
        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = 
          '<button class="view-details-btn" data-id="' + stat.id + '" data-key="' + stat.key + '" 
            style="background: none; border: none; color: #3498db; cursor: pointer;">查看详情</button>';
        
        // 添加所有单元格到行
        row.appendChild(keyCell);
        row.appendChild(urlCell);
        row.appendChild(visitsCell);
        row.appendChild(lastVisitCell);
        row.appendChild(actionsCell);
        
        // 添加行到表格
        urlStatsList.appendChild(row);
      });
      
      // 填充国家统计表
      const countryStatsList = document.getElementById('country-stats-list');
      countryStatsList.innerHTML = '';
      
      // 计算总访问量（用于百分比）
      const totalCountryVisits = countries.reduce((sum, item) => sum + parseInt(item.count), 0);
      
      countries.forEach(country => {
        const row = document.createElement('tr');
        
        // 国家列
        const countryCell = document.createElement('td');
        countryCell.textContent = country.country || '未知';
        
        // 访问次数列
        const visitsCell = document.createElement('td');
        visitsCell.textContent = country.count;
        
        // 占比列
        const percentCell = document.createElement('td');
        const percent = totalCountryVisits > 0 ? 
          (parseInt(country.count) / totalCountryVisits * 100).toFixed(2) + '%' : '0%';
        percentCell.textContent = percent;
        
        // 添加所有单元格到行
        row.appendChild(countryCell);
        row.appendChild(visitsCell);
        row.appendChild(percentCell);
        
        // 添加行到表格
        countryStatsList.appendChild(row);
      });
      
      // 添加详情按钮事件
      document.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const id = this.getAttribute('data-id');
          const key = this.getAttribute('data-key');
          loadVisitDetails(id, key);
        });
      });
    }
    
    // 加载访问详情
    async function loadVisitDetails(id, key) {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        // 显示加载中
        document.getElementById('visit-details-list').innerHTML = '<tr><td colspan="5">加载中...</td></tr>';
        
        // 更新标题
        document.getElementById('detail-url-key').textContent = key;
        
        // 隐藏其他内容，显示详情
        document.getElementById('url-stats').style.display = 'none';
        document.getElementById('country-stats').style.display = 'none';
        document.getElementById('stats-tabs').style.display = 'none';
        document.getElementById('visit-details').style.display = 'block';
        
        // 获取访问详情
        const response = await fetch('/admin/api/redirects/' + id + '/visits', {
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if (!response.ok) {
          throw new Error('无法加载访问详情');
        }
        
        const data = await response.json();
        const visits = data.visits || [];
        
        const visitDetailsList = document.getElementById('visit-details-list');
        visitDetailsList.innerHTML = '';
        
        if (visits.length === 0) {
          visitDetailsList.innerHTML = '<tr><td colspan="5">暂无访问记录</td></tr>';
          return;
        }
        
        visits.forEach(visit => {
          const row = document.createElement('tr');
          
          // 时间列
          const timeCell = document.createElement('td');
          timeCell.textContent = formatDate(visit.timestamp);
          
          // IP列
          const ipCell = document.createElement('td');
          ipCell.textContent = visit.ip || '未知';
          
          // 国家列
          const countryCell = document.createElement('td');
          countryCell.textContent = visit.country || '未知';
          
          // User Agent列
          const uaCell = document.createElement('td');
          const ua = visit.user_agent || '未知';
          uaCell.textContent = ua.length > 50 ? ua.substring(0, 47) + '...' : ua;
          uaCell.title = ua;
          
          // 引荐来源列
          const refererCell = document.createElement('td');
          const referer = visit.referer || '直接访问';
          refererCell.textContent = referer.length > 50 ? referer.substring(0, 47) + '...' : referer;
          refererCell.title = referer;
          
          // 添加所有单元格到行
          row.appendChild(timeCell);
          row.appendChild(ipCell);
          row.appendChild(countryCell);
          row.appendChild(uaCell);
          row.appendChild(refererCell);
          
          // 添加行到表格
          visitDetailsList.appendChild(row);
        });
      } catch (error) {
        console.error('加载访问详情错误:', error);
        document.getElementById('visit-details-list').innerHTML = 
          '<tr><td colspan="5">加载详情失败，请重试</td></tr>';
      }
    }
    
    // 切换标签页
    function switchTab(tabId) {
      // 更新按钮状态
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.borderBottom = 'none';
      });
      
      document.getElementById(tabId).classList.add('active');
      document.getElementById(tabId).style.borderBottom = '2px solid #3498db';
      
      // 更新内容显示
      document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
      });
      
      if (tabId === 'tab-urls') {
        document.getElementById('url-stats').style.display = 'block';
      } else if (tabId === 'tab-countries') {
        document.getElementById('country-stats').style.display = 'block';
      }
    }
    
    // 初始化页面
    document.addEventListener('DOMContentLoaded', function() {
      // 加载统计数据
      loadStats();
      
      // 标签页切换事件
      document.getElementById('tab-urls').addEventListener('click', function() {
        switchTab('tab-urls');
      });
      
      document.getElementById('tab-countries').addEventListener('click', function() {
        switchTab('tab-countries');
      });
      
      // 返回按钮事件
      document.getElementById('back-to-stats').addEventListener('click', function() {
        document.getElementById('visit-details').style.display = 'none';
        document.getElementById('stats-tabs').style.display = 'block';
        switchTab('tab-urls');
      });
    });
  `;
  
  return getBasePage('访问统计', content, scripts);
}

module.exports = {
  handleAdmin
};