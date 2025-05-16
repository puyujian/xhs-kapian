let timeSeriesChart = null; // 用于存储 Chart.js 实例
let currentPeriodDays = 7; // 默认时间范围

// DOM 元素缓存
const statsErrorElement = document.getElementById('stats-error');
const statsLoadingElement = document.getElementById('stats-loading');
const statsContentElement = document.getElementById('stats-content');
const summaryTotalVisitsElement = document.getElementById('summary-total-visits');
const summaryActiveRedirectsElement = document.getElementById('summary-active-redirects');
const summaryTotalRedirectsElement = document.getElementById('summary-total-redirects');
const visitsTimeseriesChartElement = document.getElementById('visits-timeseries-chart');
const statsPeriodSelector = document.getElementById('stats-period');


// API 请求辅助函数
async function fetchStatsData(endpoint, params = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    // console.error('认证令牌未找到'); // Keep this as it's a critical error, but for now, as per instruction, removing logs.
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
        // console.warn('认证失败，重定向到登录页面');
        window.location.href = '/admin/login'; // 重定向到登录
        return null;
      }
      // 处理其他错误状态码
      const errorData = await response.json().catch(() => ({ error: 'API 请求失败，状态码: ' + response.status }));
      const errorMessage = errorData.error || ('请求 ' + endpoint + ' 失败，状态码: ' + response.status);
      console.error('API Error:', errorMessage, 'Endpoint:', endpoint); // Keep critical API errors
      showError(errorMessage); // 调用 showError
      return null; // 返回 null
    }
    return await response.json();
  } catch (error) { // 这个 catch 主要捕获网络错误或 response.json() 解析错误
    // 修改: 使用字符串拼接而不是模板字符串
    const errorEndpointMsg = '请求 ' + endpoint + ' 时发生意外错误:';
    const errorLoadingMsg = '加载数据出错: ' + error.message;
    console.error(errorEndpointMsg, error); // Keep critical network/parse errors
    showError(errorLoadingMsg);
    return null;
  }
}

// 显示错误消息
function showError(message) {
  if (statsErrorElement) {
    statsErrorElement.textContent = message;
    statsErrorElement.classList.remove('is-hidden');
  }
  if (statsLoadingElement) statsLoadingElement.classList.add('is-hidden');
  if (statsContentElement) statsContentElement.classList.add('is-hidden');
}

// 显示加载状态
function showLoading() {
  if (statsErrorElement) statsErrorElement.classList.add('is-hidden');
  if (statsLoadingElement) statsLoadingElement.classList.remove('is-hidden');
  if (statsContentElement) statsContentElement.classList.add('is-hidden');
}

// 显示内容
function showContent() {
  if (statsErrorElement) statsErrorElement.classList.add('is-hidden');
  if (statsLoadingElement) statsLoadingElement.classList.add('is-hidden');
  if (statsContentElement) statsContentElement.classList.remove('is-hidden');
}

// 更新摘要卡片
function updateSummaryCards(summaryData) {
  if (!summaryData || !summaryData.summary) {
    // console.warn('无效的摘要数据', summaryData);
    // 可以设置默认值或显示错误
    if (summaryTotalVisitsElement) summaryTotalVisitsElement.textContent = 'N/A';
    if (summaryActiveRedirectsElement) summaryActiveRedirectsElement.textContent = 'N/A';
    if (summaryTotalRedirectsElement) summaryTotalRedirectsElement.textContent = 'N/A';
    return;
  }
  const summary = summaryData.summary;
  if (summaryTotalVisitsElement) summaryTotalVisitsElement.textContent = summary.totalVisits || 0;
  if (summaryActiveRedirectsElement) summaryActiveRedirectsElement.textContent = summary.activeRedirects || 0;
  if (summaryTotalRedirectsElement) summaryTotalRedirectsElement.textContent = summary.totalRedirects || 0;
}

// 渲染时间序列图表
function renderTimeSeriesChart(timeSeriesData) {
  if (!timeSeriesData || !timeSeriesData.timeseries) {
    // console.warn('无效的时间序列数据', timeSeriesData);
    // 可以显示提示信息
    return;
  }
  if (!visitsTimeseriesChartElement) {
    console.error('找不到图表元素: visits-timeseries-chart');
    return;
  }
  const ctx = visitsTimeseriesChartElement.getContext('2d');
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
    tableElement.classList.add('is-hidden');
    emptyMessage.classList.remove('is-hidden');
  } else {
    tableElement.classList.remove('is-hidden');
    emptyMessage.classList.add('is-hidden');
    const fragment = document.createDocumentFragment();
    data.forEach(item => {
      const row = document.createElement('tr'); // 使用 createElement 创建 tr
      columns.forEach(col => {
        const cell = document.createElement('td'); // 使用 createElement 创建 td
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
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    listBody.appendChild(fragment);
  }
}

// 加载所有统计数据
async function loadAllStats(days) {
  // 修改: 使用字符串拼接而不是模板字符串
  // const loadingMsg = '开始加载 ' + days + ' 天的统计数据...';
  // console.log(loadingMsg);
  showLoading();
  currentPeriodDays = days; // 更新当前时间范围

  const params = { days };
  const limitParams = { days, limit: 10 }; // Top N 列表参数

  // console.log('Initiating Promise.all to fetch stats data...'); // 添加日志
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
  // console.log('Promise.all finished. Received data:', { summaryData, timeSeriesData, topUrlsData, topCountriesData, topReferersData, topUserAgentsData });

  // 检查是否有任何请求失败 (fetchStatsData 内部会调用 showError)
  if (!summaryData || !timeSeriesData || !topUrlsData || !topCountriesData || !topReferersData || !topUserAgentsData) {
    console.error("部分或全部统计数据加载失败。"); // Keep critical error
    // showError 已经在 fetchStatsData 中调用，这里不再重复调用
    return;
  }
  
  // console.log("所有统计数据加载成功");

  // 更新 UI
  // console.log('Updating summary cards...'); // 添加日志
  updateSummaryCards(summaryData);
  // console.log('Summary cards updated.'); // 添加日志

  // console.log('Rendering time series chart...'); // 添加日志
  renderTimeSeriesChart(timeSeriesData);
  // console.log('Time series chart rendered.'); // 添加日志
  
  // console.log('Populating top URLs list...'); // 添加日志
  populateTopList('top-urls-list', 'top-urls-empty', 'top-urls-table', topUrlsData?.topUrls || [], [
    { key: 'key', truncate: 30 },
    { key: 'url', truncate: 50 },
    { key: 'total_visits', align: 'right' }
  ]);
  // console.log('Top URLs list populated.'); // 添加日志
  
  // console.log('Populating top referers list...'); // 添加日志
  populateTopList('top-referers-list', 'top-referers-empty', 'top-referers-table', topReferersData?.topReferers || [], [
    { key: 'referer_domain', truncate: 50 },
    { key: 'count', align: 'right' }
  ]);
  // console.log('Top referers list populated.'); // 添加日志
  
  // console.log('Populating top countries list...'); // 添加日志
  populateTopList('top-countries-list', 'top-countries-empty', 'top-countries-table', topCountriesData?.topCountries || [], [
    { key: 'country' },
    { key: 'count', align: 'right' }
  ]);
  // console.log('Top countries list populated.'); // 添加日志
  
  // console.log('Populating top user agents list...'); // 添加日志
  populateTopList('top-user-agents-list', 'top-user-agents-empty', 'top-user-agents-table', topUserAgentsData?.topUserAgents || [], [
    { key: 'browser' },
    { key: 'os' },
    { key: 'count', align: 'right' }
  ]);
  // console.log('Top user agents list populated.'); // 添加日志

  // console.log('All UI updates complete. Calling showContent...'); // 添加日志
  showContent(); // 显示内容区域
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 获取周期选择器并添加事件监听器
  if (statsPeriodSelector) {
    statsPeriodSelector.addEventListener('change', function() {
      const days = parseInt(this.value, 10);
      loadAllStats(days);
    });
    
    // 初始加载
    const initialDays = parseInt(statsPeriodSelector.value, 10);
    loadAllStats(initialDays);
  } else {
    console.error('找不到周期选择器元素');
    showError('界面初始化错误：找不到周期选择器');
  }
}); 