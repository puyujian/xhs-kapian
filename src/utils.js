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

module.exports = {
  getClientInfo,
  formatDateTime,
  generateRandomString,
  escapeHtml
}; 