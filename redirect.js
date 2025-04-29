/**
 * Cloudflare Worker URL重定向服务
 * 根据URL参数'key'查询KV数据库并重定向到对应URL
 * 包含管理面板功能
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * 处理请求的主函数
 * @param {Request} request 客户端请求
 * @returns {Response} 响应
 */
async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 检查是否为管理面板请求
  if (path.startsWith('/admin')) {
    return handleAdminRequest(request)
  }
  
  // 处理重定向请求
  return handleRedirectRequest(request)
}

/**
 * 处理重定向请求
 * @param {Request} request 客户端请求
 * @returns {Response} 重定向响应或错误页面
 */
async function handleRedirectRequest(request) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  
  // 如果没有提供key参数，返回错误页面
  if (!key) {
    return new Response('需要提供key参数', {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
  
  try {
    // 从KV存储中查询重定向URL
    const redirectUrl = await URL_REDIRECTS.get(key)
    
    // 如果找到对应URL，执行重定向
    if (redirectUrl) {
      return Response.redirect(redirectUrl, 302)
    } else {
      // 如果未找到对应key，返回404页面
      return new Response(`未找到key: ${key} 对应的跳转地址`, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }
  } catch (error) {
    // 处理可能的错误
    return new Response('服务器错误: ' + error.message, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}

/**
 * 处理管理面板请求
 * @param {Request} request 客户端请求
 * @returns {Response} 管理面板响应
 */
async function handleAdminRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 登录页面
  if (path === '/admin' || path === '/admin/') {
    return serveLoginPage(request)
  }
  
  // 验证会话
  const isAuthenticated = await verifySession(request)
  if (!isAuthenticated) {
    return Response.redirect(`${url.origin}/admin`, 302)
  }
  
  // 根据不同路径提供不同功能
  if (path === '/admin/dashboard') {
    return serveDashboard(request)
  } else if (path === '/admin/api/redirects' && request.method === 'GET') {
    return serveAllRedirects(request)
  } else if (path === '/admin/api/redirects' && request.method === 'POST') {
    return handleCreateRedirect(request)
  } else if (path === '/admin/api/redirects' && request.method === 'PUT') {
    return handleUpdateRedirect(request)
  } else if (path === '/admin/api/redirects' && request.method === 'DELETE') {
    return handleDeleteRedirect(request)
  } else if (path === '/admin/login' && request.method === 'POST') {
    return handleLogin(request)
  } else if (path === '/admin/logout') {
    return handleLogout(request)
  }
  
  // 不支持的路径返回404
  return new Response('Not Found', { status: 404 })
}

/**
 * 验证用户会话
 * @param {Request} request 客户端请求
 * @returns {boolean} 是否已认证
 */
async function verifySession(request) {
  // 简单的会话验证，检查Cookie中的token
  const cookies = parseCookies(request.headers.get('Cookie') || '')
  const sessionToken = cookies['admin_session']
  
  if (!sessionToken) {
    return false
  }
  
  // 这里使用一个非常简单的会话验证方式
  // 实际生产环境建议使用更安全的会话管理
  const expectedToken = await generateSessionToken(ADMIN_PASSWORD)
  return sessionToken === expectedToken
}

/**
 * 生成会话token
 * @param {string} password 管理员密码
 * @returns {string} 会话token
 */
async function generateSessionToken(password) {
  // 注意：这是一个简化的生成方式，实际应用中应使用更安全的方法
  const encoder = new TextEncoder()
  const data = encoder.encode(password + '-session-key')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 解析Cookie
 * @param {string} cookieString Cookie字符串
 * @returns {Object} Cookie对象
 */
function parseCookies(cookieString) {
  const cookies = {}
  cookieString.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name) cookies[name] = value
  })
  return cookies
}

/**
 * 提供登录页面
 * @param {Request} request 客户端请求
 * @returns {Response} 登录页面
 */
function serveLoginPage(request) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URL重定向服务 - 管理员登录</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: #f5f5f5;
    }
    .login-container {
      background-color: white;
      padding: 2rem;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      text-align: center;
      margin-bottom: 1.5rem;
      color: #333;
    }
    form {
      display: flex;
      flex-direction: column;
    }
    label {
      margin-bottom: 0.5rem;
      color: #666;
    }
    input {
      padding: 0.8rem;
      margin-bottom: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    button {
      padding: 0.8rem;
      background-color: #0070f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }
    button:hover {
      background-color: #0051a8;
    }
    .error {
      color: red;
      margin-bottom: 1rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>管理员登录</h1>
    <div id="error-message" class="error"></div>
    <form id="login-form">
      <label for="password">管理员密码</label>
      <input type="password" id="password" name="password" required>
      <button type="submit">登录</button>
    </form>
  </div>

  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const errorElement = document.getElementById('error-message');
      
      try {
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        
        if (response.ok) {
          window.location.href = '/admin/dashboard';
        } else {
          const data = await response.json();
          errorElement.textContent = data.error || '登录失败，请重试';
        }
      } catch (error) {
        errorElement.textContent = '发生错误，请重试';
        console.error('登录错误:', error);
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/**
 * 处理登录请求
 * @param {Request} request 客户端请求
 * @returns {Response} 登录响应
 */
async function handleLogin(request) {
  // 获取请求数据
  const data = await request.json();
  const { password } = data;
  
  // 验证密码
  if (password === ADMIN_PASSWORD) {
    // 生成会话token
    const sessionToken = await generateSessionToken(ADMIN_PASSWORD);
    
    // 设置Cookie并重定向到仪表板
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_session=${sessionToken}; HttpOnly; Path=/admin; Max-Age=3600`,
      }
    });
  }
  
  // 密码错误
  return new Response(JSON.stringify({ error: '密码错误' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * 处理注销请求
 * @param {Request} request 客户端请求
 * @returns {Response} 注销响应
 */
function handleLogout(request) {
  return new Response('Logged out', {
    status: 302,
    headers: {
      'Location': '/admin',
      'Set-Cookie': 'admin_session=; HttpOnly; Path=/admin; Max-Age=0',
    }
  });
}

/**
 * 提供仪表板页面
 * @param {Request} request 客户端请求
 * @returns {Response} 仪表板响应
 */
function serveDashboard(request) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URL重定向服务 - 管理面板</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    header {
      background-color: #0070f3;
      color: white;
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1rem;
    }
    h1 {
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      background-color: white;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    th, td {
      padding: 0.8rem;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    tr:hover {
      background-color: #f9f9f9;
    }
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      text-decoration: none;
      display: inline-block;
    }
    .btn-primary {
      background-color: #0070f3;
      color: white;
    }
    .btn-danger {
      background-color: #ff0000;
      color: white;
    }
    .btn-secondary {
      background-color: #6c757d;
      color: white;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
    }
    .logout {
      color: white;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      background-color: rgba(255, 255, 255, 0.1);
    }
    .logout:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 1;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
    }
    .modal-content {
      background-color: white;
      margin: 10% auto;
      padding: 1.5rem;
      border-radius: 5px;
      width: 50%;
      max-width: 500px;
    }
    .close {
      color: #aaa;
      float: right;
      font-size: 1.5rem;
      font-weight: bold;
      cursor: pointer;
    }
    .close:hover {
      color: black;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
    }
    input[type="text"] {
      width: 100%;
      padding: 0.8rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .add-btn-container {
      margin-bottom: 1rem;
      display: flex;
      justify-content: flex-end;
    }
  </style>
</head>
<body>
  <header>
    <h1>URL重定向管理面板</h1>
    <a href="/admin/logout" class="logout">注销</a>
  </header>
  
  <div class="container">
    <div class="add-btn-container">
      <button class="btn btn-primary" id="add-redirect-btn">添加新重定向</button>
    </div>
    
    <table id="redirects-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>目标URL</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="redirects-body">
        <tr>
          <td colspan="3">加载中...</td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <!-- 添加/编辑重定向的模态框 -->
  <div id="redirect-modal" class="modal">
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2 id="modal-title">添加重定向</h2>
      <form id="redirect-form">
        <input type="hidden" id="form-mode" value="add">
        <input type="hidden" id="original-key" value="">
        
        <div class="form-group">
          <label for="key">Key</label>
          <input type="text" id="key" name="key" required>
        </div>
        
        <div class="form-group">
          <label for="url">目标URL</label>
          <input type="text" id="url" name="url" required>
        </div>
        
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>
  
  <!-- 删除确认模态框 -->
  <div id="delete-modal" class="modal">
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2>确认删除</h2>
      <p>确定要删除重定向 <span id="delete-key"></span> 吗？此操作无法撤销。</p>
      <button id="confirm-delete" class="btn btn-danger">删除</button>
      <button id="cancel-delete" class="btn btn-secondary">取消</button>
    </div>
  </div>

  <script>
    // 获取所有重定向
    async function fetchRedirects() {
      try {
        const response = await fetch('/admin/api/redirects');
        if (!response.ok) {
          throw new Error('获取重定向失败');
        }
        const redirects = await response.json();
        displayRedirects(redirects);
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('redirects-body').innerHTML = 
          '<tr><td colspan="3">加载失败，请刷新页面重试</td></tr>';
      }
    }
    
    // 显示重定向列表
    function displayRedirects(redirects) {
      const tbody = document.getElementById('redirects-body');
      if (redirects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">暂无重定向记录</td></tr>';
        return;
      }
      
      tbody.innerHTML = '';
      redirects.forEach(redirect => {
        const row = document.createElement('tr');
        row.innerHTML = \`
          <td>\${redirect.key}</td>
          <td>\${redirect.url}</td>
          <td class="actions">
            <button class="btn btn-secondary edit-btn" data-key="\${redirect.key}" data-url="\${redirect.url}">编辑</button>
            <button class="btn btn-danger delete-btn" data-key="\${redirect.key}">删除</button>
          </td>
        \`;
        tbody.appendChild(row);
      });
      
      // 添加事件监听器
      document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          openEditModal(this.dataset.key, this.dataset.url);
        });
      });
      
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          openDeleteModal(this.dataset.key);
        });
      });
    }
    
    // 打开添加模态框
    function openAddModal() {
      document.getElementById('modal-title').textContent = '添加重定向';
      document.getElementById('form-mode').value = 'add';
      document.getElementById('key').value = '';
      document.getElementById('url').value = '';
      document.getElementById('original-key').value = '';
      document.getElementById('key').disabled = false;
      document.getElementById('redirect-modal').style.display = 'block';
    }
    
    // 打开编辑模态框
    function openEditModal(key, url) {
      document.getElementById('modal-title').textContent = '编辑重定向';
      document.getElementById('form-mode').value = 'edit';
      document.getElementById('key').value = key;
      document.getElementById('url').value = url;
      document.getElementById('original-key').value = key;
      document.getElementById('key').disabled = false;
      document.getElementById('redirect-modal').style.display = 'block';
    }
    
    // 打开删除确认模态框
    function openDeleteModal(key) {
      document.getElementById('delete-key').textContent = key;
      document.getElementById('delete-modal').style.display = 'block';
    }
    
    // 提交表单
    async function submitForm(event) {
      event.preventDefault();
      const mode = document.getElementById('form-mode').value;
      const key = document.getElementById('key').value;
      const url = document.getElementById('url').value;
      const originalKey = document.getElementById('original-key').value;
      
      try {
        let response;
        if (mode === 'add') {
          response = await fetch('/admin/api/redirects', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, url })
          });
        } else {
          response = await fetch('/admin/api/redirects', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, url, originalKey })
          });
        }
        
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || '操作失败');
          return;
        }
        
        document.getElementById('redirect-modal').style.display = 'none';
        fetchRedirects();
      } catch (error) {
        console.error('Error:', error);
        alert('发生错误，请重试');
      }
    }
    
    // 删除重定向
    async function deleteRedirect() {
      const key = document.getElementById('delete-key').textContent;
      try {
        const response = await fetch('/admin/api/redirects', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key })
        });
        
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || '删除失败');
          return;
        }
        
        document.getElementById('delete-modal').style.display = 'none';
        fetchRedirects();
      } catch (error) {
        console.error('Error:', error);
        alert('发生错误，请重试');
      }
    }
    
    // 事件监听器
    document.addEventListener('DOMContentLoaded', function() {
      fetchRedirects();
      
      // 添加重定向按钮
      document.getElementById('add-redirect-btn').addEventListener('click', openAddModal);
      
      // 表单提交
      document.getElementById('redirect-form').addEventListener('submit', submitForm);
      
      // 关闭模态框
      document.querySelectorAll('.close').forEach(elem => {
        elem.addEventListener('click', function() {
          this.closest('.modal').style.display = 'none';
        });
      });
      
      // 点击模态框外部关闭
      window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
          event.target.style.display = 'none';
        }
      });
      
      // 删除确认
      document.getElementById('confirm-delete').addEventListener('click', deleteRedirect);
      document.getElementById('cancel-delete').addEventListener('click', function() {
        document.getElementById('delete-modal').style.display = 'none';
      });
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function serveAllRedirects(request) {
  try {
    // 获取KV中的所有键值对
    // 注意：Cloudflare KV没有直接列出所有键值对的API
    // 这里使用列出所有键的方法，然后获取每个键对应的值
    const keys = await URL_REDIRECTS.list();
    
    // 如果没有键，返回空数组
    if (!keys || !keys.keys || keys.keys.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取每个键对应的值
    const redirects = [];
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      const url = await URL_REDIRECTS.get(key);
      if (url) {
        redirects.push({ key, url });
      }
    }
    
    // 返回重定向规则数组
    return new Response(JSON.stringify(redirects), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    return new Response(JSON.stringify({ error: '获取重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleCreateRedirect(request) {
  try {
    // 获取请求数据
    const data = await request.json();
    const { key, url } = data;
    
    // 验证数据
    if (!key || !url) {
      return new Response(JSON.stringify({ error: 'key和url都是必需的' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证URL格式
    try {
      new URL(url);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'URL格式无效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查key是否已存在
    const existingUrl = await URL_REDIRECTS.get(key);
    if (existingUrl) {
      return new Response(JSON.stringify({ error: '此key已存在' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 添加新规则
    await URL_REDIRECTS.put(key, url);
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    return new Response(JSON.stringify({ error: '添加重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleUpdateRedirect(request) {
  try {
    // 获取请求数据
    const data = await request.json();
    const { key, url, originalKey } = data;
    
    // 验证数据
    if (!key || !url || !originalKey) {
      return new Response(JSON.stringify({ error: 'key、url和originalKey都是必需的' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证URL格式
    try {
      new URL(url);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'URL格式无效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查原始key是否存在
    const existingUrl = await URL_REDIRECTS.get(originalKey);
    if (!existingUrl) {
      return new Response(JSON.stringify({ error: '原始key不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 如果key已更改，检查新key是否已存在（如果新key不是原始key）
    if (key !== originalKey) {
      const newKeyExists = await URL_REDIRECTS.get(key);
      if (newKeyExists) {
        return new Response(JSON.stringify({ error: '新key已存在' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 如果key已更改，删除旧key
      await URL_REDIRECTS.delete(originalKey);
    }
    
    // 更新规则
    await URL_REDIRECTS.put(key, url);
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    return new Response(JSON.stringify({ error: '更新重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleDeleteRedirect(request) {
  try {
    // 获取请求数据
    const data = await request.json();
    const { key } = data;
    
    // 验证数据
    if (!key) {
      return new Response(JSON.stringify({ error: 'key是必需的' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查key是否存在
    const existingUrl = await URL_REDIRECTS.get(key);
    if (!existingUrl) {
      return new Response(JSON.stringify({ error: '此key不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 删除规则
    await URL_REDIRECTS.delete(key);
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    return new Response(JSON.stringify({ error: '删除重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 