// 工具函数

// 从请求中获取客户端信息
function getClientInfo(request) {
  // 获取用户IP
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For') || 
             request.headers.get('X-Real-IP') || 
             '未知';
  
  // 获取用户代理
  const userAgent = request.headers.get('User-Agent') || '未知';
  
  // 获取引荐来源
  const referer = request.headers.get('Referer') || '直接访问';
  
  // 获取国家/地区（Cloudflare提供）
  const country = request.headers.get('CF-IPCountry') || '未知';
  
  return { 
    ip, 
    userAgent, 
    referer,
    country
  };
}

// 格式化日期时间
function formatDateTime(date) {
  if (!date) return '';
  
  const d = new Date(date);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 生成随机字符串
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// 安全的HTML编码
function escapeHtml(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 解析User Agent字符串
function parseUserAgent(uaString) {
  if (!uaString || uaString === '未知') {
    return { browser: 'Unknown', os: 'Unknown' };
  }
  
  let browser = 'Unknown';
  let os = 'Unknown';

  // 简单的浏览器检测规则
  if (/Edg/i.test(uaString)) {
    browser = 'Edge';
  } else if (/Chrome/i.test(uaString) && !/Chromium/i.test(uaString)) {
    browser = 'Chrome';
  } else if (/Firefox/i.test(uaString)) {
    browser = 'Firefox';
  } else if (/Safari/i.test(uaString) && !/Chrome/i.test(uaString)) {
    browser = 'Safari';
  } else if (/MSIE|Trident/i.test(uaString)) {
    browser = 'Internet Explorer';
  }

  // 简单的操作系统检测规则
  if (/Windows NT 10.0/i.test(uaString)) {
    os = 'Windows 10/11';
  } else if (/Windows NT 6.3/i.test(uaString)) {
    os = 'Windows 8.1';
  } else if (/Windows NT 6.2/i.test(uaString)) {
    os = 'Windows 8';
  } else if (/Windows NT 6.1/i.test(uaString)) {
    os = 'Windows 7';
  } else if (/Macintosh|Mac OS X/i.test(uaString)) {
    os = 'macOS';
  } else if (/Linux/i.test(uaString) && !/Android/i.test(uaString)) {
    os = 'Linux';
  } else if (/Android/i.test(uaString)) {
    os = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(uaString)) {
    os = 'iOS';
  }

  return { browser, os };
}

// 获取Referer的主域名
function getRefererDomain(refererUrl) {
  if (!refererUrl || refererUrl === '直接访问' || refererUrl === '未知') {
    return 'Direct/Unknown';
  }
  try {
    const url = new URL(refererUrl);
    // 返回主机名，例如 'www.google.com', 'baidu.com'
    // 对于搜索引擎，可能需要进一步处理以获得更简洁的名称，但暂时先返回域名
    return url.hostname;
  } catch (e) {
    // 如果 URL 无效，则返回原始字符串或标记为无效
    return 'Invalid Referer';
  }
}

// 导出所有工具函数
module.exports = {
  getClientInfo,
  formatDateTime,
  generateRandomString,
  escapeHtml,
  parseUserAgent,
  getRefererDomain
}; 