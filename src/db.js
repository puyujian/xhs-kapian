// 数据库操作模块
class Database {
  constructor(db) {
    this.db = db;
  }

  // 根据key获取重定向URL
  async getRedirectByKey(key) {
    return await this.db.prepare(
      "SELECT * FROM redirects WHERE key = ?"
    ).bind(key).first();
  }

  // 添加访问记录
  async addVisit(redirectId, requestInfo) {
    const { ip, userAgent, referer, country } = requestInfo;
    
    return await this.db.prepare(
      "INSERT INTO visits (redirect_id, ip, user_agent, referer, country) VALUES (?, ?, ?, ?, ?)"
    ).bind(redirectId, ip, userAgent, referer, country).run();
  }

  // 添加新的重定向
  async addRedirect(key, url) {
    return await this.db.prepare(
      "INSERT INTO redirects (key, url) VALUES (?, ?)"
    ).bind(key, url).run();
  }

  // 更新重定向URL
  async updateRedirect(id, key, url) {
    return await this.db.prepare(
      "UPDATE redirects SET key = ?, url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(key, url, id).run();
  }

  // 删除重定向
  async deleteRedirect(id) {
    // 删除相关的访问记录
    await this.db.prepare(
      "DELETE FROM visits WHERE redirect_id = ?"
    ).bind(id).run();
    
    // 删除重定向记录
    return await this.db.prepare(
      "DELETE FROM redirects WHERE id = ?"
    ).bind(id).run();
  }

  // 获取所有重定向
  async getAllRedirects() {
    return await this.db.prepare(
      "SELECT * FROM redirects ORDER BY created_at DESC"
    ).all();
  }

  // 获取重定向访问统计
  async getRedirectStats() {
    return await this.db.prepare(`
      SELECT 
        r.id, 
        r.key, 
        r.url, 
        COUNT(v.id) as visit_count,
        MAX(v.timestamp) as last_visit
      FROM 
        redirects r
      LEFT JOIN 
        visits v ON r.id = v.redirect_id
      GROUP BY 
        r.id
      ORDER BY 
        visit_count DESC
    `).all();
  }

  // 获取特定重定向的详细访问数据
  async getRedirectVisits(redirectId) {
    return await this.db.prepare(`
      SELECT * FROM visits
      WHERE redirect_id = ?
      ORDER BY timestamp DESC
    `).bind(redirectId).all();
  }

  // 获取按国家/地区统计的访问数据
  async getVisitsByCountry() {
    return await this.db.prepare(`
      SELECT 
        country, 
        COUNT(*) as count
      FROM 
        visits
      WHERE 
        country IS NOT NULL
      GROUP BY 
        country
      ORDER BY 
        count DESC
    `).all();
  }

  // 验证用户凭据
  async validateUser(username, passwordHash) {
    return await this.db.prepare(
      "SELECT * FROM users WHERE username = ? AND password_hash = ?"
    ).bind(username, passwordHash).first();
  }

  // 获取用户信息（不含密码）
  async getUserByUsername(username) {
    return await this.db.prepare(
      "SELECT id, username, created_at FROM users WHERE username = ?"
    ).bind(username).first();
  }
}

module.exports = Database; 