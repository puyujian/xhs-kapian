const bcrypt = require('bcryptjs');

class Auth {
  constructor(db, jwtSecret) {
    this.db = db;
    this.jwtSecret = jwtSecret;
  }

  // 生成JWT令牌
  async generateToken(username) {
    // 在实际应用中，应该使用jwt库
    // 这里为了简化依赖，使用一个简单的实现
    const user = await this.db.getUserByUsername(username);
    if (!user) return null;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24小时过期
    };

    const base64Header = btoa(JSON.stringify(header));
    const base64Payload = btoa(JSON.stringify(payload));
    
    // 在实际项目中，这里应该使用proper HMAC-SHA256来生成签名
    // 下面是一个简化示例
    const signature = btoa(
      JSON.stringify({
        data: base64Header + '.' + base64Payload,
        secret: this.jwtSecret
      })
    );

    return `${base64Header}.${base64Payload}.${signature}`;
  }

  // 验证JWT令牌
  verifyToken(token) {
    if (!token) return null;

    try {
      const [base64Header, base64Payload, signature] = token.split('.');
      
      // 验证签名 (简化版)
      const expectedSignature = btoa(
        JSON.stringify({
          data: base64Header + '.' + base64Payload,
          secret: this.jwtSecret
        })
      );
      
      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(atob(base64Payload));
      
      // 检查令牌是否过期
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return payload;
    } catch (e) {
      return null;
    }
  }

  // 验证登录凭据
  async login(username, password, env) {
    // 开发/测试模式时，如果使用硬编码的密码则直接通过
    if (env && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
      return await this.generateToken(username);
    }

    // 正常的密码验证流程
    const user = await this.db.getUserByUsername(username);
    if (!user) return null;

    // 这在Cloudflare Workers环境中可能不可用，需要额外配置
    // 实际应用需要使用Cloudflare Workers支持的加密库
    // 或考虑使用Wasm模块提供bcrypt功能
    if (await bcrypt.compare(password, user.password_hash)) {
      return await this.generateToken(username);
    }

    return null;
  }

  // 中间件: 验证用户是否已登录
  requireAuth(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    return this.verifyToken(token);
  }
}

module.exports = Auth; 