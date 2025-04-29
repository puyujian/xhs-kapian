/**
 * Cloudflare Worker URL重定向服务
 * 使用D1 SQL数据库存储和查询重定向规则和访问统计
 */

// ES模块格式 - 导出fetch函数作为默认处理入口
export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env);
  }
};

/**
 * 初始化数据库表结构
 * 只需在首次部署或表结构变更时执行
 */
async function initDatabase(env) {
  try {
    // 创建重定向表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS redirects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 创建访问日志表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS visit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        target_url TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ip_hash TEXT,
        user_agent TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        referer TEXT,
        browser TEXT,
        os TEXT,
        device TEXT
      )
    `).run();

    // 创建每日统计表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(redirect_key, date)
      )
    `).run();

    // 创建地理位置统计表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS geo_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        country TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(redirect_key, country)
      )
    `).run();

    // 创建设备类型统计表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS device_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        device_type TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(redirect_key, device_type)
      )
    `).run();

    // 创建浏览器统计表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS browser_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        browser TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(redirect_key, browser)
      )
    `).run();

    // 创建操作系统统计表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS os_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redirect_key TEXT NOT NULL,
        os TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        UNIQUE(redirect_key, os)
      )
    `).run();

    return { success: true, message: "数据库初始化成功" };
  } catch (error) {
    return { success: false, message: `数据库初始化失败: ${error.message}` };
  }
}

/**
 * 从KV数据存储迁移数据到D1数据库
 * 仅在首次迁移时执行
 */
async function migrateFromKV(env) {
  try {
    // 此函数仅作为参考，实际使用时需要确保URL_REDIRECTS仍然可用
    // 如果存在KV绑定，需要从env中访问
    const URL_REDIRECTS = env.URL_REDIRECTS;
    
    // 检查URL_REDIRECTS是否存在
    if (!URL_REDIRECTS) {
      return { success: false, message: "URL_REDIRECTS绑定不存在，无法迁移" };
    }
    
    // 迁移重定向规则
    const keys = await URL_REDIRECTS.list();
    let migratedRedirects = 0;
    let migratedStats = 0;
    let migratedLogs = 0;

    // 迁移重定向规则
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      
      // 跳过特殊键（统计和日志）
      if (key.startsWith('stats:') || key.startsWith('log:')) {
        continue;
      }
      
      const url = await URL_REDIRECTS.get(key);
      if (url) {
        // 插入到redirects表
        await env.DB.prepare(`
          INSERT OR IGNORE INTO redirects (key, url)
          VALUES (?, ?)
        `).bind(key, url).run();
        migratedRedirects++;
      }
    }

    // 迁移统计数据 - 总计数
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      if (key.startsWith('stats:total:')) {
        const redirectKey = key.replace('stats:total:', '');
        const count = parseInt(await URL_REDIRECTS.get(key) || '0', 10);
        
        // 插入或更新总计数
        // 注意：在SQL结构中，总计数可以通过查询visit_logs表获得
        migratedStats++;
      }
    }

    // 迁移每日统计
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      if (key.startsWith('stats:daily:')) {
        const parts = key.split(':');
        if (parts.length === 4) {
          const redirectKey = parts[2];
          const dateStr = parts[3];
          const count = parseInt(await URL_REDIRECTS.get(key) || '0', 10);
          
          // 插入每日统计
          await env.DB.prepare(`
            INSERT OR IGNORE INTO daily_stats (redirect_key, date, count)
            VALUES (?, ?, ?)
          `).bind(redirectKey, dateStr, count).run();
          migratedStats++;
        }
      }
    }

    // 迁移地理位置统计
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      if (key.startsWith('stats:geo:')) {
        const redirectKey = key.replace('stats:geo:', '');
        const geoStatsStr = await URL_REDIRECTS.get(key);
        
        if (geoStatsStr) {
          try {
            const geoStats = JSON.parse(geoStatsStr);
            for (const country in geoStats) {
              if (Object.prototype.hasOwnProperty.call(geoStats, country)) {
                // 插入地理位置统计
                await env.DB.prepare(`
                  INSERT OR IGNORE INTO geo_stats (redirect_key, country, count)
                  VALUES (?, ?, ?)
                `).bind(redirectKey, country, geoStats[country]).run();
                migratedStats++;
              }
            }
          } catch (e) {
            console.error(`解析地理统计数据失败: ${e.message}`);
          }
        }
      }
    }

    // 类似地，迁移设备、浏览器和操作系统统计
    // 这里省略具体实现，原理与地理位置统计类似

    // 迁移访问日志
    for (const keyObj of keys.keys) {
      const key = keyObj.name;
      if (key.startsWith('log:')) {
        const logData = await URL_REDIRECTS.get(key);
        if (logData) {
          try {
            const log = JSON.parse(logData);
            // 插入访问日志
            await env.DB.prepare(`
              INSERT INTO visit_logs (
                redirect_key, target_url, timestamp, ip_hash, 
                user_agent, country, region, city, 
                referer, browser, os, device
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              log.key, log.targetUrl, log.timestamp, log.ip,
              log.userAgent, log.country, log.region, log.city,
              log.referer, log.browser, log.os, log.device
            ).run();
            migratedLogs++;
          } catch (e) {
            console.error(`解析日志数据失败: ${e.message}`);
          }
        }
      }
    }

    return { 
      success: true, 
      message: `迁移成功: ${migratedRedirects}个重定向规则, ${migratedStats}条统计记录, ${migratedLogs}条日志` 
    };
  } catch (error) {
    return { success: false, message: `迁移失败: ${error.message}` };
  }
}

/**
 * 处理请求的主函数
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 响应
 */
async function handleRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 检查是否为管理面板请求
  if (path.startsWith('/admin')) {
    return handleAdminRequest(request, env)
  }
  
  // 处理API请求
  if (path.startsWith('/api/')) {
    // 此处省略具体实现
    // ...
  }
  
  // 处理常规重定向请求
  return handleRedirectRequest(request, env)
}

/**
 * 处理重定向请求
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 重定向响应或错误页面
 */
async function handleRedirectRequest(request, env) {
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
    // 从数据库中查询重定向URL
    const stmt = env.DB.prepare(`
      SELECT url FROM redirects WHERE key = ? LIMIT 1
    `);
    const result = await stmt.bind(key).first();
    const redirectUrl = result ? result.url : null;
    
    // 如果找到对应URL，记录访问日志并执行重定向
    if (redirectUrl) {
      // 异步记录访问日志，不等待其完成
      recordVisit(request, key, redirectUrl).catch(console.error)
      
      // 执行重定向
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
    console.error('重定向查询错误:', error);
    return new Response('服务器错误: ' + error.message, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}

/**
 * 记录访问日志
 * @param {Request} request 客户端请求
 * @param {string} key 重定向key
 * @param {string} targetUrl 目标URL
 */
async function recordVisit(request, key, targetUrl) {
  try {
    // 获取当前时间
    const now = new Date()
    const timestamp = now.toISOString()
    const dateKey = now.toISOString().split('T')[0] // YYYY-MM-DD格式
    
    // 从请求中提取信息
    const cf = request.cf || {} // Cloudflare特有信息
    const headers = request.headers
    const ip = headers.get('CF-Connecting-IP') || 'unknown'
    const userAgent = headers.get('User-Agent') || 'unknown'
    const referer = headers.get('Referer') || 'direct'
    const country = cf.country || headers.get('CF-IPCountry') || 'unknown'
    const region = cf.region || 'unknown'
    const city = cf.city || 'unknown'
    const browser = parseUserAgent(userAgent).browser
    const os = parseUserAgent(userAgent).os
    const device = parseUserAgent(userAgent).device
    
    // 哈希化IP地址以保护隐私
    const hashedIp = await hashIP(ip)
    
    // 记录详细访问日志
    await env.DB.prepare(`
      INSERT INTO visit_logs (
        redirect_key, target_url, timestamp, ip_hash,
        user_agent, country, region, city,
        referer, browser, os, device
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      key, targetUrl, timestamp, hashedIp,
      userAgent, country, region, city,
      referer, browser, os, device
    ).run();
    
    // 更新每日计数器
    await updateDailyCounter(key, dateKey)
    
    // 更新地理位置统计
    if (country !== 'unknown') {
      await updateGeoStats(key, country)
    }
    
    // 更新设备类型统计
    await updateDeviceStats(key, device, browser, os)
    
  } catch (error) {
    // 记录错误但不影响用户体验
    console.error('记录访问日志失败:', error)
  }
}

/**
 * 更新每日访问计数器
 * @param {string} key 重定向key
 * @param {string} dateKey 日期键 (YYYY-MM-DD)
 */
async function updateDailyCounter(key, dateKey) {
  try {
    // 尝试更新现有记录
    const updateResult = await env.DB.prepare(`
      UPDATE daily_stats
      SET count = count + 1
      WHERE redirect_key = ? AND date = ?
    `).bind(key, dateKey).run();
    
    // 如果没有更新任何记录，说明不存在，则插入新记录
    if (!updateResult.success || updateResult.meta.changes === 0) {
      await env.DB.prepare(`
        INSERT INTO daily_stats (redirect_key, date, count)
        VALUES (?, ?, 1)
      `).bind(key, dateKey).run();
    }
  } catch (error) {
    console.error('更新每日计数器失败:', error);
  }
}

/**
 * 更新地理位置统计
 * @param {string} key 重定向key
 * @param {string} country 国家代码
 */
async function updateGeoStats(key, country) {
  try {
    // 尝试更新现有记录
    const updateResult = await env.DB.prepare(`
      UPDATE geo_stats
      SET count = count + 1
      WHERE redirect_key = ? AND country = ?
    `).bind(key, country).run();
    
    // 如果没有更新任何记录，说明不存在，则插入新记录
    if (!updateResult.success || updateResult.meta.changes === 0) {
      await env.DB.prepare(`
        INSERT INTO geo_stats (redirect_key, country, count)
        VALUES (?, ?, 1)
      `).bind(key, country).run();
    }
  } catch (error) {
    console.error('更新地理位置统计失败:', error);
  }
}

/**
 * 更新设备统计
 * @param {string} key 重定向key
 * @param {string} device 设备类型
 * @param {string} browser 浏览器
 * @param {string} os 操作系统
 */
async function updateDeviceStats(key, device, browser, os) {
  try {
    // 更新设备类型统计
    await updateSingleStat('device_stats', key, 'device_type', device);
    
    // 更新浏览器统计
    await updateSingleStat('browser_stats', key, 'browser', browser);
    
    // 更新操作系统统计
    await updateSingleStat('os_stats', key, 'os', os);
  } catch (error) {
    console.error('更新设备统计失败:', error);
  }
}

/**
 * 通用的统计更新函数
 * @param {string} table 表名
 * @param {string} key 重定向key
 * @param {string} field 字段名
 * @param {string} value 字段值
 */
async function updateSingleStat(table, key, field, value) {
  try {
    // 尝试更新现有记录
    const updateQuery = `
      UPDATE ${table}
      SET count = count + 1
      WHERE redirect_key = ? AND ${field} = ?
    `;
    const updateResult = await env.DB.prepare(updateQuery).bind(key, value).run();
    
    // 如果没有更新任何记录，说明不存在，则插入新记录
    if (!updateResult.success || updateResult.meta.changes === 0) {
      const insertQuery = `
        INSERT INTO ${table} (redirect_key, ${field}, count)
        VALUES (?, ?, 1)
      `;
      await env.DB.prepare(insertQuery).bind(key, value).run();
    }
  } catch (error) {
    console.error(`更新 ${table} 统计失败:`, error);
  }
}

/**
 * 简化的UserAgent解析函数
 * @param {string} ua 用户代理字符串
 * @returns {Object} 解析结果
 */
function parseUserAgent(ua) {
  // 初始默认值
  const result = {
    browser: 'unknown',
    os: 'unknown',
    device: 'unknown'
  }
  
  // 简化的UserAgent解析逻辑
  ua = ua.toLowerCase()
  
  // 设备类型检测
  if (ua.includes('mobile')) {
    result.device = 'mobile'
  } else if (ua.includes('tablet')) {
    result.device = 'tablet'
  } else {
    result.device = 'desktop'
  }
  
  // 操作系统检测
  if (ua.includes('windows')) {
    result.os = 'windows'
  } else if (ua.includes('mac os') || ua.includes('macos')) {
    result.os = 'macos'
  } else if (ua.includes('android')) {
    result.os = 'android'
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    result.os = 'ios'
  } else if (ua.includes('linux')) {
    result.os = 'linux'
  }
  
  // 浏览器检测
  if (ua.includes('chrome') && !ua.includes('edg')) {
    result.browser = 'chrome'
  } else if (ua.includes('firefox')) {
    result.browser = 'firefox'
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    result.browser = 'safari'
  } else if (ua.includes('edg')) {
    result.browser = 'edge'
  } else if (ua.includes('opera') || ua.includes('opr')) {
    result.browser = 'opera'
  } else if (ua.includes('msie') || ua.includes('trident')) {
    result.browser = 'ie'
  }
  
  return result
}

/**
 * 对IP地址进行哈希处理以保护隐私
 * @param {string} ip IP地址
 * @returns {string} 哈希值
 */
async function hashIP(ip) {
  // 在实际应用中，可以使用更安全的方法，这里简化处理
  // 例如，可以只保留IP的前两段，或使用加盐哈希
  const ipParts = ip.split('.')
  if (ipParts.length === 4) {
    return `${ipParts[0]}.${ipParts[1]}.*.*`
  }
  return 'unknown'
}

/**
 * 处理管理面板请求
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 管理面板响应
 */
async function handleAdminRequest(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // 登录页面
  if (path === '/admin' || path === '/admin/') {
    return serveLoginPage(request, env)
  }
  
  // 验证会话
  const isAuthenticated = await verifySession(request, env)
  if (!isAuthenticated) {
    return Response.redirect(`${url.origin}/admin`, 302)
  }
  
  // 根据不同路径提供不同功能
  if (path === '/admin/dashboard') {
    return serveDashboard(request, env)
  } else if (path === '/admin/statistics') {
    return serveStatisticsPage(request, env)
  } else if (path === '/admin/api/redirects' && request.method === 'GET') {
    return serveAllRedirects(request, env)
  } else if (path === '/admin/api/redirects' && request.method === 'POST') {
    return handleCreateRedirect(request, env)
  } else if (path === '/admin/api/redirects' && request.method === 'PUT') {
    return handleUpdateRedirect(request, env)
  } else if (path === '/admin/api/redirects' && request.method === 'DELETE') {
    return handleDeleteRedirect(request, env)
  } else if (path === '/admin/login' && request.method === 'POST') {
    return handleLogin(request, env)
  } else if (path === '/admin/logout') {
    return handleLogout(request, env)
  } else if (path === '/admin/api/stats/summary') {
    return getStatsSummary(request, env)
  } else if (path === '/admin/api/stats/daily') {
    return getDailyStats(request, env) 
  } else if (path === '/admin/api/stats/geo') {
    return getGeoStats(request, env)
  } else if (path === '/admin/api/stats/devices') {
    return getDeviceStats(request, env)
  } else if (path === '/admin/api/stats/browsers') {
    return getBrowserStats(request, env)
  } else if (path === '/admin/api/stats/os') {
    return getOsStats(request, env)
  } else if (path === '/admin/api/stats/logs') {
    return getDetailedLogs(request, env)
  }
  
  // 不支持的路径返回404
  return new Response('Not Found', { status: 404 })
}

/**
 * 验证用户会话
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {boolean} 是否已认证
 */
async function verifySession(request, env) {
  // 简单的会话验证，检查Cookie中的token
  const cookieHeader = request.headers.get('Cookie') || '';
  console.log('Cookie header:', cookieHeader);
  
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies['admin_session'];
  
  console.log('Session token found:', sessionToken ? '是' : '否');
  
  if (!sessionToken) {
    return false;
  }
  
  // 这里使用一个非常简单的会话验证方式
  // 实际生产环境建议使用更安全的会话管理
  const expectedToken = await generateSessionToken(ADMIN_PASSWORD);
  const tokenMatches = sessionToken === expectedToken;
  
  console.log('Token验证:', tokenMatches ? '成功' : '失败');
  return tokenMatches;
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
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 登录页面
 */
function serveLoginPage(request, env) {
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
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const password = document.getElementById('password').value;
      const errorElement = document.getElementById('error-message');
      
      // 清除之前的错误消息
      errorElement.textContent = '登录中...';
      
      // 发送登录请求
      fetch('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ password }),
        credentials: 'same-origin'
      })
      .then(function(response) {
        console.log('收到响应:', response.status);
        
        if (response.ok) {
          // 登录成功
          return response.json().then(function(data) {
            errorElement.textContent = '登录成功，正在跳转...';
            console.log('登录成功');
            
            // 使用延迟确保Cookie已被保存
            setTimeout(function() {
              const redirectUrl = data.redirect || '/admin/dashboard';
              window.location.href = redirectUrl;
            }, 1000);
          })
          .catch(function() {
            // JSON解析错误，仍然尝试重定向
            errorElement.textContent = '登录成功，正在跳转...';
            setTimeout(function() {
              window.location.href = '/admin/dashboard';
            }, 1000);
          });
        } else {
          // 登录失败
          return response.json()
            .then(function(errorData) {
              errorElement.textContent = errorData.error || '登录失败，请重试';
              console.error('登录失败:', errorData);
            })
            .catch(function() {
              errorElement.textContent = '登录失败 (' + response.status + ')';
            });
        }
      })
      .catch(function(error) {
        errorElement.textContent = '网络错误，请检查连接后重试';
        console.error('登录请求错误:', error);
      });
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
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 登录响应
 */
async function handleLogin(request, env) {
  // 获取请求数据
  const data = await request.json();
  const { password } = data;
  
  // 验证密码
  if (password === ADMIN_PASSWORD) {
    // 生成会话token
    const sessionToken = await generateSessionToken(ADMIN_PASSWORD);
    
    // 前端请求使用Accept头区分API调用和直接访问
    const acceptHeader = request.headers.get('Accept') || '';
    
    // 如果是API调用（JSON请求），返回JSON响应
    if (acceptHeader.includes('application/json')) {
      return new Response(JSON.stringify({ success: true, redirect: '/admin/dashboard' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `admin_session=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`,
        }
      });
    } 
    // 否则直接重定向
    else {
      return new Response('Login successful', {
        status: 302,
        headers: {
          'Location': '/admin/dashboard',
          'Set-Cookie': `admin_session=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`,
        }
      });
    }
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
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 注销响应
 */
function handleLogout(request, env) {
  return new Response('Logged out', {
    status: 302,
    headers: {
      'Location': '/admin',
      'Set-Cookie': 'admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    }
  });
}

/**
 * 提供仪表板页面
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 仪表板响应
 */
function serveDashboard(request, env) {
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
    .nav-links {
      display: flex;
      gap: 1rem;
    }
    .nav-link {
      color: white;
      text-decoration: none;
      padding: 0.5rem;
      border-radius: 4px;
    }
    .nav-link:hover {
      background-color: rgba(255, 255, 255, 0.2);
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
    .add-btn-container {
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
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
  </style>
</head>
<body>
  <header>
    <h1>URL重定向管理面板</h1>
    <div class="nav-links">
      <a href="/admin/dashboard" class="nav-link">重定向管理</a>
      <a href="/admin/statistics" class="nav-link">统计分析</a>
      <a href="/admin/logout" class="nav-link">注销</a>
    </div>
  </header>
  
  <div class="container">
    <div class="add-btn-container">
      <h2>重定向规则管理</h2>
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
    async function fetchRedirects(env) {
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
            <a href="/admin/statistics?key=\${redirect.key}" class="btn btn-primary">统计</a>
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
        fetchRedirects(env);
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
        fetchRedirects(env);
      } catch (error) {
        console.error('Error:', error);
        alert('发生错误，请重试');
      }
    }
    
    // 事件监听器
    document.addEventListener('DOMContentLoaded', function() {
      fetchRedirects(env);
      
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

async function serveAllRedirects(request, env) {
  try {
    // 使用SQL查询获取所有重定向规则
    const results = await env.DB.prepare(`
      SELECT key, url, created_at 
      FROM redirects 
      ORDER BY created_at DESC
    `).all();
    
    // 格式化结果
    const redirects = results.results.map(row => ({
      key: row.key,
      url: row.url,
      createdAt: row.created_at
    }));
    
    // 返回重定向规则数组
    return new Response(JSON.stringify(redirects), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    console.error('获取重定向规则失败:', error);
    return new Response(JSON.stringify({ error: '获取重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleCreateRedirect(request, env) {
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
    const existingCheck = await env.DB.prepare(`
      SELECT key FROM redirects WHERE key = ? LIMIT 1
    `).bind(key).first();
    
    if (existingCheck) {
      return new Response(JSON.stringify({ error: '此key已存在' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 添加新规则
    await env.DB.prepare(`
      INSERT INTO redirects (key, url) VALUES (?, ?)
    `).bind(key, url).run();
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    console.error('添加重定向规则失败:', error);
    return new Response(JSON.stringify({ error: '添加重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleUpdateRedirect(request, env) {
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
    
    // 开始数据库事务
    // 注意：D1数据库目前不支持完整的事务API，这里模拟事务逻辑
    
    // 检查原始key是否存在
    const existingCheck = await env.DB.prepare(`
      SELECT key FROM redirects WHERE key = ? LIMIT 1
    `).bind(originalKey).first();
    
    if (!existingCheck) {
      return new Response(JSON.stringify({ error: '原始key不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 如果key已更改，检查新key是否已存在（如果新key不是原始key）
    if (key !== originalKey) {
      const newKeyCheck = await env.DB.prepare(`
        SELECT key FROM redirects WHERE key = ? LIMIT 1
      `).bind(key).first();
      
      if (newKeyCheck) {
        return new Response(JSON.stringify({ error: '新key已存在' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 如果key已更改且不存在冲突，执行更新（删除旧记录，创建新记录）
      await env.DB.prepare(`
        DELETE FROM redirects WHERE key = ?
      `).bind(originalKey).run();
      
      await env.DB.prepare(`
        INSERT INTO redirects (key, url) VALUES (?, ?)
      `).bind(key, url).run();
      
      // 更新所有相关统计数据的redirect_key
      // 更新每日统计
      await env.DB.prepare(`
        UPDATE daily_stats SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
      
      // 更新地理位置统计
      await env.DB.prepare(`
        UPDATE geo_stats SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
      
      // 更新设备统计
      await env.DB.prepare(`
        UPDATE device_stats SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
      
      // 更新浏览器统计
      await env.DB.prepare(`
        UPDATE browser_stats SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
      
      // 更新操作系统统计
      await env.DB.prepare(`
        UPDATE os_stats SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
      
      // 更新访问日志
      await env.DB.prepare(`
        UPDATE visit_logs SET redirect_key = ? WHERE redirect_key = ?
      `).bind(key, originalKey).run();
    } else {
      // 如果key未更改，只更新url
      await env.DB.prepare(`
        UPDATE redirects SET url = ? WHERE key = ?
      `).bind(url, key).run();
    }
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    console.error('更新重定向规则失败:', error);
    return new Response(JSON.stringify({ error: '更新重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleDeleteRedirect(request, env) {
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
    const existingCheck = await env.DB.prepare(`
      SELECT key FROM redirects WHERE key = ? LIMIT 1
    `).bind(key).first();
    
    if (!existingCheck) {
      return new Response(JSON.stringify({ error: '此key不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 删除规则
    await env.DB.prepare(`
      DELETE FROM redirects WHERE key = ?
    `).bind(key).run();
    
    // 可选：是否一并删除统计数据和日志（取决于业务需求）
    // 以下代码会删除与该重定向规则相关的所有统计数据
    // 如果希望保留历史数据，可以注释掉这些代码
    await env.DB.prepare(`DELETE FROM daily_stats WHERE redirect_key = ?`).bind(key).run();
    await env.DB.prepare(`DELETE FROM geo_stats WHERE redirect_key = ?`).bind(key).run();
    await env.DB.prepare(`DELETE FROM device_stats WHERE redirect_key = ?`).bind(key).run();
    await env.DB.prepare(`DELETE FROM browser_stats WHERE redirect_key = ?`).bind(key).run();
    await env.DB.prepare(`DELETE FROM os_stats WHERE redirect_key = ?`).bind(key).run();
    await env.DB.prepare(`DELETE FROM visit_logs WHERE redirect_key = ?`).bind(key).run();
    
    // 返回成功响应
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // 处理错误
    console.error('删除重定向规则失败:', error);
    return new Response(JSON.stringify({ error: '删除重定向规则失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 获取统计摘要
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 统计摘要数据
 */
async function getStatsSummary(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 检查重定向规则是否存在
    const redirect = await env.DB.prepare(`
      SELECT key, url FROM redirects WHERE key = ? LIMIT 1
    `).bind(key).first();
    
    if (!redirect) {
      return new Response(JSON.stringify({ error: '未找到此重定向规则' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 获取总访问次数
    const totalVisits = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM visit_logs WHERE redirect_key = ?
    `).bind(key).first();
    
    // 获取最近30天的访问次数
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
    
    const recentVisits = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM visit_logs 
      WHERE redirect_key = ? AND timestamp >= ?
    `).bind(key, thirtyDaysAgoStr).first();
    
    // 获取今日访问次数
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = await env.DB.prepare(`
      SELECT count FROM daily_stats 
      WHERE redirect_key = ? AND date = ?
    `).bind(key, today).first();
    
    // 获取国家分布前5名
    const countries = await env.DB.prepare(`
      SELECT country, count FROM geo_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC LIMIT 5
    `).bind(key).all();
    
    // 获取设备分布
    const devices = await env.DB.prepare(`
      SELECT device_type, count FROM device_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC
    `).bind(key).all();
    
    // 获取浏览器分布前5名
    const browsers = await env.DB.prepare(`
      SELECT browser, count FROM browser_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC LIMIT 5
    `).bind(key).all();
    
    // 获取操作系统分布前5名
    const operatingSystems = await env.DB.prepare(`
      SELECT os, count FROM os_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC LIMIT 5
    `).bind(key).all();
    
    // 构建响应数据
    const summary = {
      key: redirect.key,
      url: redirect.url,
      totalVisits: totalVisits ? totalVisits.count : 0,
      last30DaysVisits: recentVisits ? recentVisits.count : 0,
      todayVisits: todayVisits ? todayVisits.count : 0,
      topCountries: countries ? countries.results : [],
      deviceTypes: devices ? devices.results : [],
      topBrowsers: browsers ? browsers.results : [],
      topOperatingSystems: operatingSystems ? operatingSystems.results : []
    }
    
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取统计摘要失败:', error);
    return new Response(JSON.stringify({ error: '获取统计摘要失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取每日统计数据
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 每日统计数据
 */
async function getDailyStats(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    const days = parseInt(url.searchParams.get('days') || '30', 10)
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 生成日期范围
    const dailyCounts = []
    const today = new Date()
    
    // 查询指定日期范围内的所有记录
    const datesToQuery = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(today.getDate() - i)
      const dateKey = date.toISOString().split('T')[0]
      datesToQuery.push(dateKey);
    }
    
    // 构建日期条件的IN子句
    const placeholders = datesToQuery.map(() => '?').join(', ');
    
    // 使用单个查询获取所有日期的统计数据
    const query = `
      SELECT date, count 
      FROM daily_stats 
      WHERE redirect_key = ? AND date IN (${placeholders})
      ORDER BY date ASC
    `;
    
    // 创建绑定数组 [key, ...dates]
    const bindings = [key, ...datesToQuery];
    
    const results = await env.DB.prepare(query).bind(...bindings).all();
    
    // 将结果转换为Map以方便查找
    const statsMap = new Map();
    if (results && results.results) {
      results.results.forEach(row => {
        statsMap.set(row.date, row.count);
      });
    }
    
    // 生成完整的日期列表，包括没有记录的日期
    for (const dateKey of datesToQuery) {
      dailyCounts.push({
        date: dateKey,
        count: statsMap.has(dateKey) ? statsMap.get(dateKey) : 0
      });
    }
    
    return new Response(JSON.stringify({
      key,
      days,
      dailyCounts
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取每日统计失败:', error);
    return new Response(JSON.stringify({ error: '获取每日统计失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取地理位置统计数据
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 地理位置统计数据
 */
async function getGeoStats(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 使用SQL查询获取地理位置统计
    const results = await env.DB.prepare(`
      SELECT country, count 
      FROM geo_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC
    `).bind(key).all();
    
    // 将结果格式化为原来的对象格式
    const geoStats = {};
    if (results && results.results) {
      results.results.forEach(row => {
        geoStats[row.country] = row.count;
      });
    }
    
    return new Response(JSON.stringify(geoStats), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取地理位置统计失败:', error);
    return new Response(JSON.stringify({ error: '获取地理位置统计失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取设备类型统计数据
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 设备类型统计数据
 */
async function getDeviceStats(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 使用SQL查询获取设备类型统计
    const results = await env.DB.prepare(`
      SELECT device_type, count 
      FROM device_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC
    `).bind(key).all();
    
    // 将结果格式化为原来的对象格式
    const deviceStats = {};
    if (results && results.results) {
      results.results.forEach(row => {
        deviceStats[row.device_type] = row.count;
      });
    }
    
    return new Response(JSON.stringify(deviceStats), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取设备类型统计失败:', error);
    return new Response(JSON.stringify({ error: '获取设备类型统计失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取浏览器统计数据
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 浏览器统计数据
 */
async function getBrowserStats(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 使用SQL查询获取浏览器统计
    const results = await env.DB.prepare(`
      SELECT browser, count 
      FROM browser_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC
    `).bind(key).all();
    
    // 将结果格式化为原来的对象格式
    const browserStats = {};
    if (results && results.results) {
      results.results.forEach(row => {
        browserStats[row.browser] = row.count;
      });
    }
    
    return new Response(JSON.stringify(browserStats), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取浏览器统计失败:', error);
    return new Response(JSON.stringify({ error: '获取浏览器统计失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取操作系统统计数据
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 操作系统统计数据
 */
async function getOsStats(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 使用SQL查询获取操作系统统计
    const results = await env.DB.prepare(`
      SELECT os, count 
      FROM os_stats 
      WHERE redirect_key = ? 
      ORDER BY count DESC
    `).bind(key).all();
    
    // 将结果格式化为原来的对象格式
    const osStats = {};
    if (results && results.results) {
      results.results.forEach(row => {
        osStats[row.os] = row.count;
      });
    }
    
    return new Response(JSON.stringify(osStats), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取操作系统统计失败:', error);
    return new Response(JSON.stringify({ error: '获取操作系统统计失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 获取详细访问日志
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 访问日志数据
 */
async function getDetailedLogs(request, env) {
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    
    if (!key) {
      return new Response(JSON.stringify({ error: '需要提供key参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 使用SQL查询获取访问日志
    const results = await env.DB.prepare(`
      SELECT * FROM visit_logs 
      WHERE redirect_key = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).bind(key, limit).all();
    
    // 返回日志数据
    return new Response(JSON.stringify({
      key,
      logs: results ? results.results : []
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('获取访问日志失败:', error);
    return new Response(JSON.stringify({ error: '获取访问日志失败: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * 提供统计页面
 * @param {Request} request 客户端请求
 * @param {Object} env 环境变量和绑定
 * @returns {Response} 统计页面响应
 */
function serveStatisticsPage(request, env) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URL重定向服务 - 访问统计</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/luxon@2.3.1/build/global/luxon.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.1.0/dist/chartjs-adapter-luxon.min.js"></script>
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
    h1, h2, h3 {
      margin: 0;
    }
    .nav-links {
      display: flex;
      gap: 1rem;
    }
    .nav-link {
      color: white;
      text-decoration: none;
      padding: 0.5rem;
      border-radius: 4px;
    }
    .nav-link:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    .card {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .stats-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .stats-select {
      padding: 0.5rem;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stat-box {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      padding: 1rem;
      text-align: center;
    }
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      margin: 0.5rem 0;
      color: #0070f3;
    }
    .stat-label {
      color: #666;
      font-size: 0.9rem;
    }
    .chart-container {
      position: relative;
      height: 300px;
      margin-bottom: 1.5rem;
    }
    .chart-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 768px) {
      .chart-row {
        grid-template-columns: 1fr;
      }
    }
    .table-container {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
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
    .tab-container {
      margin-bottom: 1.5rem;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid #ddd;
      margin-bottom: 1rem;
    }
    .tab {
      padding: 0.8rem 1.5rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab.active {
      border-bottom: 2px solid #0070f3;
      color: #0070f3;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .loading {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
  </style>
</head>
<body>
  <header>
    <h1>URL重定向统计分析</h1>
    <div class="nav-links">
      <a href="/admin/dashboard" class="nav-link">重定向管理</a>
      <a href="/admin/statistics" class="nav-link">统计分析</a>
      <a href="/admin/logout" class="nav-link">注销</a>
    </div>
  </header>
  
  <div class="container">
    <div class="stats-header">
      <h2>访问数据分析</h2>
      <select id="key-select" class="stats-select">
        <option value="">正在加载...</option>
      </select>
    </div>
    
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">总访问量</div>
        <div id="total-visits" class="stat-number">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">今日访问量</div>
        <div id="today-visits" class="stat-number">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">本周访问量</div>
        <div id="weekly-visits" class="stat-number">-</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">日均访问量</div>
        <div id="daily-avg" class="stat-number">-</div>
      </div>
    </div>
    
    <div class="tab-container">
      <div class="tabs">
        <div class="tab active" data-tab="trends">访问趋势</div>
        <div class="tab" data-tab="geo">地理分布</div>
        <div class="tab" data-tab="devices">设备分析</div>
        <div class="tab" data-tab="details">详细日志</div>
      </div>
      
      <!-- 访问趋势 -->
      <div id="trends-tab" class="tab-content active">
        <div class="card">
          <h3>每日访问量趋势</h3>
          <div class="chart-container">
            <canvas id="daily-chart"></canvas>
          </div>
        </div>
      </div>
      
      <!-- 地理分布 -->
      <div id="geo-tab" class="tab-content">
        <div class="card">
          <h3>访问者地理分布</h3>
          <div class="chart-container">
            <canvas id="geo-chart"></canvas>
          </div>
        </div>
      </div>
      
      <!-- 设备分析 -->
      <div id="devices-tab" class="tab-content">
        <div class="chart-row">
          <div class="card">
            <h3>设备类型分布</h3>
            <div class="chart-container">
              <canvas id="device-chart"></canvas>
            </div>
          </div>
          <div class="card">
            <h3>浏览器分布</h3>
            <div class="chart-container">
              <canvas id="browser-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>操作系统分布</h3>
          <div class="chart-container">
            <canvas id="os-chart"></canvas>
          </div>
        </div>
      </div>
      
      <!-- 详细日志 -->
      <div id="details-tab" class="tab-content">
        <div class="card">
          <h3>最近100条访问记录</h3>
          <div class="table-container">
            <table id="logs-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>IP地址</th>
                  <th>国家/地区</th>
                  <th>设备</th>
                  <th>浏览器</th>
                  <th>操作系统</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody id="logs-body">
                <tr>
                  <td colspan="7" class="loading">加载中...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // 颜色配置
    const colors = [
      '#4285F4', '#EA4335', '#FBBC05', '#34A853', 
      '#FF6D01', '#46BDC6', '#7B61FF', '#1CA45C',
      '#5F6368', '#E94235', '#2AB673', '#5C2D91'
    ];
    
    // 格式化日期
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN');
    }
    
    // 格式化时间
    function formatDateTime(dateTimeStr) {
      const date = new Date(dateTimeStr);
      return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN');
    }
    
    // 生成随机颜色
    function getRandomColors(count) {
      const result = [];
      for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
      }
      return result;
    }
    
    // 加载所有重定向key
    async function loadRedirectKeys(env) {
      try {
        const response = await fetch('/admin/api/redirects');
        if (!response.ok) throw new Error('获取重定向记录失败');
        
        const redirects = await response.json();
        const keySelect = document.getElementById('key-select');
        
        keySelect.innerHTML = '';
        if (redirects.length === 0) {
          keySelect.innerHTML = '<option value="">无重定向记录</option>';
          return;
        }
        
        redirects.forEach(redirect => {
          const option = document.createElement('option');
          option.value = redirect.key;
          option.textContent = redirect.key;
          keySelect.appendChild(option);
        });
        
        // 加载第一个key的数据
        if (redirects.length > 0) {
          loadStatistics(redirects[0].key, env);
        }
      } catch (error) {
        console.error('加载重定向记录失败:', error);
        document.getElementById('key-select').innerHTML = 
          '<option value="">加载失败</option>';
      }
    }
    
    // 加载统计数据
    async function loadStatistics(key, env) {
      loadSummary(key, env);
      loadDailyStats(key, env);
      loadGeoStats(key, env);
      loadDeviceStats(key, env);
      loadBrowserStats(key, env);
      loadOsStats(key, env);
      loadDetailedLogs(key, env);
    }
    
    // 加载摘要数据
    async function loadSummary(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/summary?key=\${key}\`);
        if (!response.ok) throw new Error('获取统计摘要失败');
        
        const data = await response.json();
        
        // 更新摘要卡片
        document.getElementById('total-visits').textContent = data.totalCount;
        
        // 计算今日访问量
        const today = data.dailyCounts[data.dailyCounts.length - 1].count;
        document.getElementById('today-visits').textContent = today;
        
        // 计算本周访问量
        const weeklyVisits = data.dailyCounts.reduce((sum, day) => sum + day.count, 0);
        document.getElementById('weekly-visits').textContent = weeklyVisits;
        
        // 计算日均访问量
        const dailyAvg = Math.round(weeklyVisits / 7);
        document.getElementById('daily-avg').textContent = dailyAvg;
        
      } catch (error) {
        console.error('加载统计摘要失败:', error);
        document.getElementById('total-visits').textContent = '-';
        document.getElementById('today-visits').textContent = '-';
        document.getElementById('weekly-visits').textContent = '-';
        document.getElementById('daily-avg').textContent = '-';
      }
    }
    
    // 加载每日统计数据
    async function loadDailyStats(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/daily?key=\${key}&days=30\`);
        if (!response.ok) throw new Error('获取每日统计失败');
        
        const data = await response.json();
        
        // 渲染每日趋势图
        const ctx = document.getElementById('daily-chart').getContext('2d');
        
        // 销毁已存在的图表
        if (window.dailyChart) {
          window.dailyChart.destroy();
        }
        
        window.dailyChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.dailyCounts.map(day => day.date),
            datasets: [{
              label: '每日访问量',
              data: data.dailyCounts.map(day => day.count),
              borderColor: '#0070f3',
              backgroundColor: 'rgba(0, 112, 243, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0
                }
              },
              x: {
                ticks: {
                  callback: function(value, index, values) {
                    return formatDate(data.dailyCounts[index].date);
                  }
                }
              }
            },
            plugins: {
              tooltip: {
                callbacks: {
                  title: function(tooltipItems) {
                    return formatDate(tooltipItems[0].label);
                  }
                }
              }
            }
          }
        });
        
      } catch (error) {
        console.error('加载每日统计失败:', error);
        document.getElementById('daily-chart').innerHTML = 
          '<div class="loading">加载数据失败</div>';
      }
    }
    
    // 加载地理统计数据
    async function loadGeoStats(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/geo?key=\${key}\`);
        if (!response.ok) throw new Error('获取地理位置统计失败');
        
        const data = await response.json();
        
        // 准备图表数据
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        // 渲染地理分布图表
        const ctx = document.getElementById('geo-chart').getContext('2d');
        
        // 销毁已存在的图表
        if (window.geoChart) {
          window.geoChart.destroy();
        }
        
        window.geoChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: '访问量',
              data: values,
              backgroundColor: getRandomColors(labels.length),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0
                }
              }
            }
          }
        });
        
      } catch (error) {
        console.error('加载地理位置统计失败:', error);
      }
    }
    
    // 加载设备类型统计数据
    async function loadDeviceStats(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/devices?key=\${key}\`);
        if (!response.ok) throw new Error('获取设备类型统计失败');
        
        const data = await response.json();
        
        // 准备图表数据
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        // 渲染设备类型图表
        const ctx = document.getElementById('device-chart').getContext('2d');
        
        // 销毁已存在的图表
        if (window.deviceChart) {
          window.deviceChart.destroy();
        }
        
        window.deviceChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              label: '访问量',
              data: values,
              backgroundColor: getRandomColors(labels.length),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right'
              }
            }
          }
        });
        
      } catch (error) {
        console.error('加载设备类型统计失败:', error);
      }
    }
    
    // 加载浏览器统计数据
    async function loadBrowserStats(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/browsers?key=\${key}\`);
        if (!response.ok) throw new Error('获取浏览器统计失败');
        
        const data = await response.json();
        
        // 准备图表数据
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        // 渲染浏览器图表
        const ctx = document.getElementById('browser-chart').getContext('2d');
        
        // 销毁已存在的图表
        if (window.browserChart) {
          window.browserChart.destroy();
        }
        
        window.browserChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              label: '访问量',
              data: values,
              backgroundColor: getRandomColors(labels.length),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right'
              }
            }
          }
        });
        
      } catch (error) {
        console.error('加载浏览器统计失败:', error);
      }
    }
    
    // 加载操作系统统计数据
    async function loadOsStats(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/os?key=\${key}\`);
        if (!response.ok) throw new Error('获取操作系统统计失败');
        
        const data = await response.json();
        
        // 准备图表数据
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        // 渲染操作系统图表
        const ctx = document.getElementById('os-chart').getContext('2d');
        
        // 销毁已存在的图表
        if (window.osChart) {
          window.osChart.destroy();
        }
        
        window.osChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: '访问量',
              data: values,
              backgroundColor: getRandomColors(labels.length),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  precision: 0
                }
              }
            }
          }
        });
        
      } catch (error) {
        console.error('加载操作系统统计失败:', error);
      }
    }
    
    // 加载详细访问日志
    async function loadDetailedLogs(key, env) {
      try {
        const response = await fetch(\`/admin/api/stats/logs?key=\${key}&limit=100\`);
        if (!response.ok) throw new Error('获取访问日志失败');
        
        const data = await response.json();
        const tbody = document.getElementById('logs-body');
        
        tbody.innerHTML = '';
        
        if (data.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="loading">暂无访问记录</td></tr>';
          return;
        }
        
        data.logs.forEach(log => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td>\${formatDateTime(log.timestamp)}</td>
            <td>\${log.ip}</td>
            <td>\${log.country}</td>
            <td>\${log.device}</td>
            <td>\${log.browser}</td>
            <td>\${log.os}</td>
            <td>\${log.referer}</td>
          \`;
          tbody.appendChild(row);
        });
        
      } catch (error) {
        console.error('加载访问日志失败:', error);
        document.getElementById('logs-body').innerHTML = 
          '<tr><td colspan="7" class="loading">加载数据失败</td></tr>';
      }
    }
    
    // 标签页切换
    function setupTabs() {
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // 移除所有active类
          tabs.forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          
          // 添加active类到当前标签
          tab.classList.add('active');
          const tabId = tab.dataset.tab;
          document.getElementById(\`\${tabId}-tab\`).classList.add('active');
        });
      });
    }
    
    // 初始化
    document.addEventListener('DOMContentLoaded', () => {
      setupTabs();
      loadRedirectKeys(env);
      
      // 监听key选择变化
      document.getElementById('key-select').addEventListener('change', (e) => {
        const key = e.target.value;
        if (key) {
          loadStatistics(key, env);
        }
      });
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
} 