let timeSeriesChart = null; // 用于存储 Chart.js 实例
let currentPeriodDays = 7; // 默认时间范围

// API 请求辅助函数
async function fetchStatsData(endpoint, params = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    console.error('认证令牌未找到');
    window.location.href = '/admin/login';
    return null;
  }

  const url = new URL(endpoint, window.location.origin);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/admin/login'; // 重定向到登录
        return null;
      }
      const errorData = await response.json().catch(() => ({ error: 'API 请求失败，状态码: ' + response.status }));
      throw new Error(errorData.error || '未知 API 错误');
    }
    return await response.json();
  } catch (error) {
    // 修改: 使用字符串拼接而不是模板字符串
    const errorEndpointMsg = '请求 ' + endpoint + ' 出错:';
    const errorLoadingMsg = '加载数据出错: ' + error.message;
    console.error(errorEndpointMsg, error);
    showError(errorLoadingMsg);
    return null;
  }
}

// 显示错误消息
function showError(message) {
  const errorElement = document.getElementById('stats-error');
  const loadingElement = document.getElementById('stats-loading');
  const contentElement = document.getElementById('stats-content');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
  if (loadingElement) loadingElement.style.display = 'none';
  if (contentElement) contentElement.style.display = 'none';
}

// 显示加载状态
function showLoading() {
  const errorElement = document.getElementById('stats-error');
  const loadingElement = document.getElementById('stats-loading');
  const contentElement = document.getElementById('stats-content');
  if (errorElement) errorElement.style.display = 'none';
  if (loadingElement) loadingElement.style.display = 'block';
  if (contentElement) contentElement.style.display = 'none';
}

// 显示内容
function showContent() {
  const errorElement = document.getElementById('stats-error');
  const loadingElement = document.getElementById('stats-loading');
  const contentElement = document.getElementById('stats-content');
  if (errorElement) errorElement.style.display = 'none';
  if (loadingElement) loadingElement.style.display = 'none';
  if (contentElement) contentElement.style.display = 'block';
}

// 更新摘要卡片
function updateSummaryCards(summaryData) {
  if (!summaryData || !summaryData.summary) {
    console.warn('无效的摘要数据', summaryData);
    // 可以设置默认值或显示错误
    document.getElementById('summary-total-visits').textContent = 'N/A';
    document.getElementById('summary-active-redirects').textContent = 'N/A';
    document.getElementById('summary-total-redirects').textContent = 'N/A';
    return;
  }
  const summary = summaryData.summary;
  document.getElementById('summary-total-visits').textContent = summary.totalVisits || 0;
  document.getElementById('summary-active-redirects').textContent = summary.activeRedirects || 0;
  document.getElementById('summary-total-redirects').textContent = summary.totalRedirects || 0;
}

// 渲染时间序列图表
function renderTimeSeriesChart(timeSeriesData) {
  if (!timeSeriesData || !timeSeriesData.timeseries) {
    console.warn('无效的时间序列数据', timeSeriesData);
    // 可以显示提示信息
    return;
  }
  const ctx = document.getElementById('visits-timeseries-chart').getContext('2d');
  const labels = timeSeriesData.timeseries.map(item => item.date);
  const dataCounts = timeSeriesData.timeseries.map(item => item.count);

  if (timeSeriesChart) {
    timeSeriesChart.destroy(); // 销毁旧图表实例
  }

  timeSeriesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '访问次数',
        data: dataCounts,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          display: false // 可以隐藏图例如果不需要
        }
      }
    }
  });
}

// 填充 Top N 列表 (通用函数)
function populateTopList(listId, emptyId, tableId, data, columns) {
  const listBody = document.getElementById(listId);
  const emptyMessage = document.getElementById(emptyId);
  const tableElement = document.getElementById(tableId);

  if (!listBody || !emptyMessage || !tableElement) {
    // 修改: 使用字符串拼接而不是模板字符串
    const listUpdateErrorMsg = '更新列表 ' + listId + ' 失败: 找不到元素';
    console.error(listUpdateErrorMsg);
    return;
  }

  listBody.innerHTML = ''; // 清空旧数据

  if (!data || data.length === 0) {
    tableElement.style.display = 'none';
    emptyMessage.style.display = 'block';
  } else {
    tableElement.style.display = 'table';
    emptyMessage.style.display = 'none';
    data.forEach(item => {
      const row = listBody.insertRow();
      columns.forEach(col => {
        const cell = row.insertCell();
        let value = item[col.key] !== null && item[col.key] !== undefined ? item[col.key] : 'N/A';
        // 特殊处理 URL 截断
        if (col.truncate && typeof value === 'string' && value.length > col.truncate) {
          cell.textContent = value.substring(0, col.truncate - 3) + '...';
          cell.title = value; // 悬停显示完整内容
        } else {
          cell.textContent = value;
        }
        if (col.align) {
          cell.style.textAlign = col.align;
        }
      });
    });
  }
}

// 加载所有统计数据
async function loadAllStats(days) {
  // 修改: 使用字符串拼接而不是模板字符串
  const loadingMsg = '开始加载 ' + days + ' 天的统计数据...';
  console.log(loadingMsg);
  showLoading();
  currentPeriodDays = days; // 更新当前时间范围

  const params = { days };
  const limitParams = { days, limit: 10 }; // Top N 列表参数

  console.log('Initiating Promise.all to fetch stats data...'); // 添加日志
  // 并行获取所有数据
  const [summaryData, timeSeriesData, topUrlsData, topCountriesData, topReferersData, topUserAgentsData] = await Promise.all([
    fetchStatsData('/admin/api/stats/summary', params),
    fetchStatsData('/admin/api/stats/timeseries', params),
    fetchStatsData('/admin/api/stats/top-urls', limitParams),
    fetchStatsData('/admin/api/stats/top-countries', limitParams),
    fetchStatsData('/admin/api/stats/top-referers', limitParams),
    fetchStatsData('/admin/api/stats/top-user-agents', limitParams)
  ]);
  
  // 添加日志: 打印接收到的数据
  console.log('Promise.all finished. Received data:', { summaryData, timeSeriesData, topUrlsData, topCountriesData, topReferersData, topUserAgentsData });

  // 检查是否有任何请求失败 (fetchStatsData 内部会调用 showError)
  if (!summaryData || !timeSeriesData || !topUrlsData || !topCountriesData || !topReferersData || !topUserAgentsData) {
    console.error("部分或全部统计数据加载失败。");
    // showError 已经在 fetchStatsData 中调用，这里不再重复调用
    return; 
  }
  
  console.log("所有统计数据加载成功");

  // 更新 UI
  console.log('Updating summary cards...'); // 添加日志
  updateSummaryCards(summaryData);
  console.log('Summary cards updated.'); // 添加日志

  console.log('Rendering time series chart...'); // 添加日志
  renderTimeSeriesChart(timeSeriesData);
  console.log('Time series chart rendered.'); // 添加日志
  
  console.log('Populating top URLs list...'); // 添加日志
  populateTopList('top-urls-list', 'top-urls-empty', 'top-urls-table', topUrlsData?.topUrls || [], [
    { key: 'key', truncate: 30 }, 
    { key: 'url', truncate: 50 }, 
    { key: 'total_visits', align: 'right' }
  ]);
  console.log('Top URLs list populated.'); // 添加日志
  
  console.log('Populating top referers list...'); // 添加日志
  populateTopList('top-referers-list', 'top-referers-empty', 'top-referers-table', topReferersData?.topReferers || [], [
    { key: 'referer_domain', truncate: 50 }, 
    { key: 'count', align: 'right' }
  ]);
  console.log('Top referers list populated.'); // 添加日志
  
  console.log('Populating top countries list...'); // 添加日志
  populateTopList('top-countries-list', 'top-countries-empty', 'top-countries-table', topCountriesData?.topCountries || [], [
    { key: 'country' }, 
    { key: 'count', align: 'right' }
  ]);
  console.log('Top countries list populated.'); // 添加日志
  
  console.log('Populating top user agents list...'); // 添加日志
  populateTopList('top-user-agents-list', 'top-user-agents-empty', 'top-user-agents-table', topUserAgentsData?.topUserAgents || [], [
    { key: 'browser' }, 
    { key: 'os' }, 
    { key: 'count', align: 'right' }
  ]);
  console.log('Top user agents list populated.'); // 添加日志

  console.log('All UI updates complete. Calling showContent...'); // 添加日志
  showContent(); // 显示内容区域
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 获取周期选择器并添加事件监听器
  const periodSelector = document.getElementById('stats-period');
  if (periodSelector) {
    periodSelector.addEventListener('change', function() {
      const days = parseInt(this.value, 10);
      loadAllStats(days);
    });
    
    // 初始加载
    const initialDays = parseInt(periodSelector.value, 10);
    loadAllStats(initialDays);
  } else {
    console.error('找不到周期选择器元素');
    showError('界面初始化错误：找不到周期选择器');
  }
}); 