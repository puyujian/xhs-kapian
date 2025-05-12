// 数据库操作模块
const { parseUserAgent, getRefererDomain } = require('./utils'); // 导入解析函数

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
        r.created_at,
        (SELECT COUNT(*) FROM visits v WHERE v.redirect_id = r.id) as visit_count, -- 实时计数，可能慢
        (SELECT MAX(v.timestamp) FROM visits v WHERE v.redirect_id = r.id) as last_visit -- 实时最后访问，可能慢
      FROM 
        redirects r
      ORDER BY 
        r.created_at DESC
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

  // --- 新增聚合统计相关函数 ---

  /**
   * 聚合指定日期的访问数据到 daily_visits_summary 表
   * @param {string} dateString - 要聚合的日期，格式 'YYYY-MM-DD'
   */
  async aggregateDailyVisits(dateString) {
    console.log(`开始聚合日期 ${dateString} 的访问数据...`);

    try {
      // 1. 查询指定日期的原始访问数据
      const startTime = `${dateString} 00:00:00`;
      const endTime = `${dateString} 23:59:59`;

      const visitsResult = await this.db.prepare(
        `SELECT redirect_id, country, referer, user_agent 
         FROM visits 
         WHERE timestamp >= ? AND timestamp <= ?`
      ).bind(startTime, endTime).all();

      if (!visitsResult.results || visitsResult.results.length === 0) {
        console.log(`日期 ${dateString} 没有访问数据可聚合。`);
        return { success: true, message: 'No data to aggregate' };
      }

      console.log(`获取到 ${visitsResult.results.length} 条原始访问记录进行聚合。`);

      // 2. 在内存中聚合数据
      const aggregatedData = new Map();

      for (const visit of visitsResult.results) {
        const { browser, os } = parseUserAgent(visit.user_agent);
        const refererDomain = getRefererDomain(visit.referer);
        const country = visit.country || 'Unknown'; // 处理 NULL 国家
        const redirectId = visit.redirect_id;

        // 创建唯一的聚合键
        const key = `${dateString}-${redirectId}-${country}-${refererDomain}-${browser}-${os}`;

        // 更新聚合计数
        aggregatedData.set(key, (aggregatedData.get(key) || 0) + 1);
      }

      console.log(`聚合后得到 ${aggregatedData.size} 条不同的维度组合。`);

      // 3. 准备批量写入 D1
      const statements = [];
      const sql = `
        INSERT INTO daily_visits_summary (date, redirect_id, country, referer_domain, browser, os, visit_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, redirect_id, country, referer_domain, browser, os)
        DO UPDATE SET visit_count = visit_count + excluded.visit_count;
      `;

      for (const [key, count] of aggregatedData.entries()) {
        const parts = key.split('-');
        // parts 结构: [date, redirectId, country, refererDomain, browser, os]
        // 注意：refererDomain, browser, os 可能包含 '-', 所以需要合并回去
        const date = parts[0];
        const redirectId = parseInt(parts[1], 10);
        const country = parts[2];
        const refererDomain = parts[3]; 
        const browser = parts[4];
        const os = parts.slice(5).join('-'); // os 可能包含 '-'
        
        statements.push(this.db.prepare(sql).bind(date, redirectId, country, refererDomain, browser, os, count));
      }

      // 4. 执行批量写入
      console.log(`准备批量写入 ${statements.length} 条聚合数据...`);
      const batchResults = await this.db.batch(statements);
      console.log(`批量写入完成。`, batchResults);

      // 检查批量写入结果 (D1 batch 目前可能不提供详细的单条成功/失败信息)
      // 这里我们假设如果没抛出异常就算成功
      // TODO: 根据 Cloudflare D1 batch 的未来发展，可能需要更精细的错误处理

      console.log(`日期 ${dateString} 的访问数据聚合成功。`);
      return { success: true, aggregatedCount: aggregatedData.size, writeOperations: statements.length };

    } catch (error) {
      console.error(`聚合日期 ${dateString} 的访问数据时出错:`, error);
      return { success: false, error: error.message };
    }
  }

  // --- 新增查询聚合数据的函数 ---

  /**
   * 获取全局统计摘要
   * @param {number} days - 统计最近 N 天的数据，例如 1 表示今天，7 表示最近7天
   */
  async getStatsSummary(days = 1) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1); // 计算起始日期
    const startDate = dateCutoff.toISOString().split('T')[0]; // YYYY-MM-DD

    // 注意：D1 的 SQL 功能可能有限，复杂的窗口函数或子查询可能不支持
    // 我们使用简单的聚合查询
    const results = await this.db.prepare(
      `SELECT 
         SUM(visit_count) as totalVisits, 
         COUNT(DISTINCT redirect_id) as activeRedirects
       FROM daily_visits_summary 
       WHERE date >= ?`
    ).bind(startDate).first();

    // 获取总链接数（从 redirects 表）
    const totalRedirectsResult = await this.db.prepare(
      `SELECT COUNT(*) as count FROM redirects`
    ).first();

    // 检查聚合数据是否为空，若为空则回退到原始visits表查询
    if (!results?.totalVisits) {
      console.log(`聚合表中没有 ${startDate} 之后的数据，回退到 visits 表查询`);
      const visitsResults = await this.db.prepare(
        `SELECT 
           COUNT(*) as totalVisits,
           COUNT(DISTINCT redirect_id) as activeRedirects
         FROM visits
         WHERE timestamp >= ?`
      ).bind(`${startDate} 00:00:00`).first();

      return {
        totalVisits: visitsResults?.totalVisits || 0,
        activeRedirects: visitsResults?.activeRedirects || 0,
        totalRedirects: totalRedirectsResult?.count || 0,
        periodDays: days,
        source: 'visits_table' // 标记数据来源
      };
    }

    return {
      totalVisits: results?.totalVisits || 0,
      activeRedirects: results?.activeRedirects || 0,
      totalRedirects: totalRedirectsResult?.count || 0,
      periodDays: days,
      source: 'summary_table' // 标记数据来源
    };
  }

  /**
   * 获取时间序列统计数据
   * @param {number} days - 获取最近 N 天的数据
   */
  async getTimeSeriesStats(days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT date, SUM(visit_count) as count 
       FROM daily_visits_summary 
       WHERE date >= ? 
       GROUP BY date 
       ORDER BY date ASC`
    ).bind(startDate).all();

    // 检查是否有数据
    if (!results.results || results.results.length === 0) {
      console.log(`聚合表中没有时间序列数据，回退到 visits 表查询`);
      
      // 从visits表生成时间序列数据
      // 需要按日期分组统计访问量
      const visitsResults = await this.db.prepare(
        `SELECT 
           date(timestamp) as date, 
           COUNT(*) as count
         FROM visits
         WHERE timestamp >= ?
         GROUP BY date(timestamp)
         ORDER BY date ASC`
      ).bind(`${startDate} 00:00:00`).all();
      
      return visitsResults.results || [];
    }

    return results.results || [];
  }

  /**
   * 获取 Top N Referer 域名
   * @param {number} limit - 返回 Top N 条记录
   * @param {number} days - 统计最近 N 天的数据
   */
  async getTopReferers(limit = 10, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT referer_domain, SUM(visit_count) as count 
       FROM daily_visits_summary 
       WHERE date >= ? AND referer_domain IS NOT NULL AND referer_domain != 'Direct/Unknown' AND referer_domain != 'Invalid Referer'
       GROUP BY referer_domain 
       ORDER BY count DESC 
       LIMIT ?`
    ).bind(startDate, limit).all();

    // 检查是否有数据
    if (!results.results || results.results.length === 0) {
      console.log(`聚合表中没有Referer数据，回退到 visits 表查询`);
      
      // 从visits表获取Referer数据
      // 注意：这里无法在SQL中直接使用getRefererDomain函数
      // 我们需要获取所有referer然后在JavaScript中处理
      const visitsResults = await this.db.prepare(
        `SELECT 
           referer, 
           COUNT(*) as count
         FROM visits
         WHERE timestamp >= ? AND referer IS NOT NULL AND referer != '直接访问' AND referer != '未知'
         GROUP BY referer
         ORDER BY count DESC
         LIMIT 50` // 获取更多数据，以便后续聚合
      ).bind(`${startDate} 00:00:00`).all();
      
      if (!visitsResults.results || visitsResults.results.length === 0) {
        return [];
      }
      
      // 导入处理函数
      const { getRefererDomain } = require('./utils');
      
      // 按域名重新聚合
      const domainMap = new Map();
      
      for (const visit of visitsResults.results) {
        const domain = getRefererDomain(visit.referer);
        if (domain && domain !== 'Direct/Unknown' && domain !== 'Invalid Referer') {
          const currentCount = domainMap.get(domain) || 0;
          domainMap.set(domain, currentCount + visit.count);
        }
      }
      
      // 转换为数组并排序
      const topReferers = Array.from(domainMap.entries())
        .map(([referer_domain, count]) => ({ referer_domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      
      return topReferers;
    }
    
    return results.results || [];
  }

  /**
   * 获取 Top N User Agents (浏览器/OS)
   * @param {number} limit - 返回 Top N 条记录
   * @param {number} days - 统计最近 N 天的数据
   */
  async getTopUserAgents(limit = 10, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT browser, os, SUM(visit_count) as count 
       FROM daily_visits_summary 
       WHERE date >= ? AND browser IS NOT NULL AND os IS NOT NULL AND browser != 'Unknown' AND os != 'Unknown'
       GROUP BY browser, os 
       ORDER BY count DESC 
       LIMIT ?`
    ).bind(startDate, limit).all();

    // 检查是否有数据
    if (!results.results || results.results.length === 0) {
      console.log(`聚合表中没有UserAgent数据，回退到 visits 表查询`);
      
      // 从visits表获取UserAgent数据
      const visitsResults = await this.db.prepare(
        `SELECT 
           user_agent, 
           COUNT(*) as count
         FROM visits
         WHERE timestamp >= ? AND user_agent IS NOT NULL AND user_agent != '未知'
         GROUP BY user_agent
         ORDER BY count DESC
         LIMIT 50` // 获取更多数据，以便后续处理
      ).bind(`${startDate} 00:00:00`).all();
      
      if (!visitsResults.results || visitsResults.results.length === 0) {
        return [];
      }
      
      // 导入处理函数
      const { parseUserAgent } = require('./utils');
      
      // 按浏览器和操作系统重新聚合
      const uaMap = new Map();
      
      for (const visit of visitsResults.results) {
        const { browser, os } = parseUserAgent(visit.user_agent);
        if (browser !== 'Unknown' && os !== 'Unknown') {
          const key = `${browser}|${os}`;
          const currentCount = uaMap.get(key) || 0;
          uaMap.set(key, currentCount + visit.count);
        }
      }
      
      // 转换为数组并排序
      const topUserAgents = Array.from(uaMap.entries())
        .map(([key, count]) => {
          const [browser, os] = key.split('|');
          return { browser, os, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      
      return topUserAgents;
    }
    
    return results.results || [];
  }

  /**
   * 获取 Top N 国家
   * @param {number} limit - 返回 Top N 条记录
   * @param {number} days - 统计最近 N 天的数据
   */
  async getTopCountries(limit = 10, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT country, SUM(visit_count) as count 
       FROM daily_visits_summary 
       WHERE date >= ? AND country IS NOT NULL AND country != 'Unknown'
       GROUP BY country 
       ORDER BY count DESC 
       LIMIT ?`
    ).bind(startDate, limit).all();

    // 检查是否有数据
    if (!results.results || results.results.length === 0) {
      console.log(`聚合表中没有国家分布数据，回退到 visits 表查询`);
      
      // 从visits表获取国家分布数据
      const visitsResults = await this.db.prepare(
        `SELECT 
           country, 
           COUNT(*) as count
         FROM visits
         WHERE timestamp >= ? AND country IS NOT NULL AND country != 'Unknown'
         GROUP BY country
         ORDER BY count DESC
         LIMIT ?`
      ).bind(`${startDate} 00:00:00`, limit).all();
      
      return visitsResults.results || [];
    }
    
    return results.results || [];
  }
  
  /**
   * 获取 Top N 访问量的 URL (基于聚合数据)
   * @param {number} limit - 返回 Top N 条记录
   * @param {number} days - 统计最近 N 天的数据
   */
  async getTopUrlsByVisit(limit = 10, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT 
         s.redirect_id, 
         r.key, 
         r.url,
         SUM(s.visit_count) as total_visits
       FROM daily_visits_summary s
       JOIN redirects r ON s.redirect_id = r.id
       WHERE s.date >= ? 
       GROUP BY s.redirect_id, r.key, r.url 
       ORDER BY total_visits DESC 
       LIMIT ?`
    ).bind(startDate, limit).all();
    
    // 检查是否有数据
    if (!results.results || results.results.length === 0) {
      console.log(`聚合表中没有访问量 URL 数据，回退到 visits 表查询`);
      
      // 从visits表获取 Top URLs
      const visitsResults = await this.db.prepare(
        `SELECT 
           v.redirect_id, 
           r.key, 
           r.url, 
           COUNT(*) as total_visits
         FROM visits v
         JOIN redirects r ON v.redirect_id = r.id
         WHERE v.timestamp >= ?
         GROUP BY v.redirect_id, r.key, r.url
         ORDER BY total_visits DESC
         LIMIT ?`
      ).bind(`${startDate} 00:00:00`, limit).all();
      
      return visitsResults.results || [];
    }
    
    return results.results || [];
  }

  // --- 特定 Redirect ID 的统计查询 ---

  /**
   * 获取特定 Redirect ID 的统计摘要
   * @param {number} redirectId
   * @param {number} days - 统计最近 N 天的数据
   */
  async getRedirectStatsSummary(redirectId, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT SUM(visit_count) as totalVisits 
       FROM daily_visits_summary 
       WHERE redirect_id = ? AND date >= ?`
    ).bind(redirectId, startDate).first();

    // 获取该 redirect 的信息
    const redirectInfo = await this.db.prepare(
      `SELECT key, url, created_at FROM redirects WHERE id = ?`
    ).bind(redirectId).first(); 

    return {
      redirectId,
      key: redirectInfo?.key,
      url: redirectInfo?.url,
      createdAt: redirectInfo?.created_at,
      totalVisits: results?.totalVisits || 0,
      periodDays: days
    };
  }

  /**
   * 获取特定 Redirect ID 的时间序列统计
   * @param {number} redirectId
   * @param {number} days - 获取最近 N 天的数据
   */
  async getRedirectTimeSeriesStats(redirectId, days = 7) {
    const dateCutoff = new Date();
    dateCutoff.setDate(dateCutoff.getDate() - days + 1);
    const startDate = dateCutoff.toISOString().split('T')[0];

    const results = await this.db.prepare(
      `SELECT date, SUM(visit_count) as count 
       FROM daily_visits_summary 
       WHERE redirect_id = ? AND date >= ? 
       GROUP BY date 
       ORDER BY date ASC`
    ).bind(redirectId, startDate).all();

    return results.results || [];
  }
}

module.exports = Database; 