let timeSeriesChart = null; // 用于存储 Chart.js 实例
let topUrlsChartInstance = null; // 用于存储最常访问 URL 图表的 Chart.js 实例
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
async function fetchStatsData(endpoint, params = {}, useDateRange = false, startDate = null, endDate = null) {
  const token = localStorage.getItem('token');
  if (!token) {
    // console.error('认证令牌未找到'); // Keep this as it's a critical error, but for now, as per instruction, removing logs.
    window.location.href = '/admin/login';
    return null;
  }

  const url = new URL(endpoint, window.location.origin);
  if (useDateRange && startDate && endDate) {
    url.searchParams.append('startDate', startDate);
    url.searchParams.append('endDate', endDate);
  } else {
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  }

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
<<<<<<< HEAD
  const errorElement = document.getElementById('stats-error');
  const loadingElement = document.getElementById('stats-loading');
  const contentElement = document.getElementById('stats-content');
  const topUrlsChartLoading = document.getElementById('topUrlsChart-loading');
  const topUrlsChartCanvas = document.getElementById('topUrlsChart');
  const topUrlsChartEmpty = document.getElementById('topUrlsChart-empty');

  if (errorElement) errorElement.style.display = 'none';
  if (loadingElement) loadingElement.style.display = 'block';
  if (contentElement) contentElement.style.display = 'none';
  if (topUrlsChartLoading) topUrlsChartLoading.style.display = 'block';
  if (topUrlsChartCanvas) topUrlsChartCanvas.style.display = 'none';
  if (topUrlsChartEmpty) topUrlsChartEmpty.style.display = 'none';
=======
  if (statsErrorElement) statsErrorElement.classList.add('is-hidden');
  if (statsLoadingElement) statsLoadingElement.classList.remove('is-hidden');
  if (statsContentElement) statsContentElement.classList.add('is-hidden');
>>>>>>> 1c33e2e4c55d9477bb880777bce701499d092739
}

// 显示内容
function showContent() {
<<<<<<< HEAD
  const errorElement = document.getElementById('stats-error');
  const loadingElement = document.getElementById('stats-loading');
  const contentElement = document.getElementById('stats-content');
  // topUrlsChart 相关的元素显隐在 renderTopUrlsChart 中处理，这里只关注主要内容区域
  if (errorElement) errorElement.style.display = 'none';
  if (loadingElement) loadingElement.style.display = 'none';
  if (contentElement) contentElement.style.display = 'block';
=======
  if (statsErrorElement) statsErrorElement.classList.add('is-hidden');
  if (statsLoadingElement) statsLoadingElement.classList.add('is-hidden');
  if (statsContentElement) statsContentElement.classList.remove('is-hidden');
>>>>>>> 1c33e2e4c55d9477bb880777bce701499d092739
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
<<<<<<< HEAD
  const canvasElement = document.getElementById('visits-timeseries-chart');
  const loadingElement = document.getElementById('timeSeriesChart-loading');
  const emptyElement = document.getElementById('timeSeriesChart-empty');

  if (!canvasElement || !loadingElement || !emptyElement) {
    console.error('找不到时间序列图表相关的 DOM 元素。');
    if (loadingElement) loadingElement.style.display = 'none';
    if (emptyElement) emptyElement.style.display = 'block';
    return;
  }

  if (loadingElement) loadingElement.style.display = 'none';

  if (!timeSeriesData || !timeSeriesData.timeseries || timeSeriesData.timeseries.length === 0) {
    console.warn('无时间序列数据可供渲染', timeSeriesData);
    if (emptyElement) emptyElement.style.display = 'block';
    if (canvasElement) canvasElement.style.display = 'none';
    if (timeSeriesChart) {
      timeSeriesChart.destroy();
      timeSeriesChart = null;
    }
    return;
  }

  if (emptyElement) emptyElement.style.display = 'none';
  if (canvasElement) canvasElement.style.display = 'block';

  const ctx = canvasElement.getContext('2d');
  const labels = timeSeriesData.timeseries.map(item => {
    // 格式化日期，例如 'YYYY-MM-DD' -> 'MM-DD' 或根据需要调整
    const date = new Date(item.date);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
=======
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
>>>>>>> 1c33e2e4c55d9477bb880777bce701499d092739
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
        borderColor: '#3498db', // 主色
        backgroundColor: 'rgba(52, 152, 219, 0.2)', // 主色带透明度
        tension: 0.2, // 平滑曲线
        fill: true,
        pointBackgroundColor: '#3498db', // 数据点颜色
        pointBorderColor: '#fff', // 数据点边框
        pointHoverBackgroundColor: '#fff', // 悬停时数据点背景
        pointHoverBorderColor: '#2980b9' // 悬停时数据点边框 (主色加深)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#555', // 坐标轴字体颜色
            font: {
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            }
          },
          grid: {
            color: '#eee' // 网格线颜色
          }
        },
        x: {
          ticks: {
            color: '#555',
            font: {
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            }
          },
          grid: {
            display: false // X轴通常不需要网格线
          }
        }
      },
      plugins: {
        legend: {
          display: false // 单数据集通常不需要图例
        },
        tooltip: {
          backgroundColor: '#333', // 工具提示背景色
          titleColor: '#fff', // 工具提示标题颜色
          bodyColor: '#fff', // 工具提示内容颜色
          borderColor: '#3498db', // 工具提示边框颜色
          borderWidth: 1,
          titleFont: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
          },
          bodyFont: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y;
              }
              // 可以在这里添加更多信息，例如完整日期
              const originalDate = timeSeriesData.timeseries[context.dataIndex].date;
              return [label, `日期: ${originalDate}`];
            }
          }
        }
      },
      hover: {
        mode: 'index', // 在X轴上找到最近的点
        intersect: false
      },
      interaction: {
        mode: 'index',
        intersect: false,
      }
    }
  });
}

// 渲染最常访问的 URL 图表
function renderTopUrlsChart(topUrlsData) {
  const canvasElement = document.getElementById('topUrlsChart');
  const loadingElement = document.getElementById('topUrlsChart-loading');
  const emptyElement = document.getElementById('topUrlsChart-empty');

  if (!canvasElement || !loadingElement || !emptyElement) {
    console.error('找不到 Top URLs 图表相关的 DOM 元素。');
    if (loadingElement) loadingElement.style.display = 'none';
    if (emptyElement) emptyElement.style.display = 'block'; // 显示空状态或错误提示
    return;
  }

  if (loadingElement) loadingElement.style.display = 'none'; // 隐藏加载提示

  if (!topUrlsData || !topUrlsData.topUrls || topUrlsData.topUrls.length === 0) {
    console.warn('无最常访问 URL 数据可供渲染', topUrlsData);
    if (emptyElement) emptyElement.style.display = 'block';
    if (canvasElement) canvasElement.style.display = 'none';
    if (topUrlsChartInstance) {
      topUrlsChartInstance.destroy();
      topUrlsChartInstance = null;
    }
    return;
  }

  if (emptyElement) emptyElement.style.display = 'none';
  if (canvasElement) canvasElement.style.display = 'block';

  const ctx = canvasElement.getContext('2d');
  const urls = topUrlsData.topUrls.map(item => {
    // 截断长 URL 以适应图表
    const maxLength = 40; // 可根据需要调整
    return item.url.length > maxLength ? item.url.substring(0, maxLength - 3) + '...' : item.url;
  });
  const counts = topUrlsData.topUrls.map(item => item.total_visits || item.count); // 兼容不同可能的字段名

  if (topUrlsChartInstance) {
    topUrlsChartInstance.destroy();
  }

  topUrlsChartInstance = new Chart(ctx, {
    type: 'bar', // 水平条形图
    data: {
      labels: urls,
      datasets: [{
        label: '访问次数',
        data: counts,
        backgroundColor: '#3498db', // 主色
        borderColor: '#2980b9', // 主色加深
        borderWidth: 1,
        hoverBackgroundColor: '#2980b9' // 悬停背景色
      }]
    },
    options: {
      indexAxis: 'y', // 设置为水平条形图
      responsive: true,
      maintainAspectRatio: false, // 允许图表高度自适应容器
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: '#555', // 字体颜色
            font: {
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            }
          },
          grid: {
            color: '#eee' // 网格线颜色
          }
        },
        y: {
          ticks: {
            color: '#555', // 字体颜色
            font: {
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            }
          },
          grid: {
            display: false // 可以隐藏 Y 轴网格线
          }
        }
      },
      plugins: {
        legend: {
          display: false // 通常条形图的图例不是很有用，除非有多个数据集
        },
        tooltip: {
          backgroundColor: '#333',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#3498db',
          borderWidth: 1,
          titleFont: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
          },
          bodyFont: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
          },
          callbacks: {
            // 完整 URL 显示在 tooltip 中
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.x !== null) {
                label += context.parsed.x;
              }
              // 原始数据中获取完整 URL
              const originalUrl = topUrlsData.topUrls[context.dataIndex].url;
              return [label, `URL: ${originalUrl}`];
            }
          }
        }
      },
      hover: {
        mode: 'index',
        intersect: false
      },
      interaction: {
        mode: 'index',
        intersect: false,
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

// 加载所有统计数据 (按天数)
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
<<<<<<< HEAD
  console.log('Time series chart rendered.'); // 添加日志

  console.log('Rendering Top URLs chart...'); // 添加日志
  renderTopUrlsChart(topUrlsData);
  console.log('Top URLs chart rendered.'); // 添加日志
  
  // 保留原有的 Top URLs 列表的填充逻辑，如果需要的话
  // console.log('Populating top URLs list...');
  // populateTopList('top-urls-list', 'top-urls-empty', 'top-urls-table', topUrlsData?.topUrls || [], [
  //   { key: 'key', truncate: 30 },
  //   { key: 'url', truncate: 50 },
  //   { key: 'total_visits', align: 'right' }
  // ]);
  // console.log('Top URLs list populated.');
=======
  // console.log('Time series chart rendered.'); // 添加日志
  
  // console.log('Populating top URLs list...'); // 添加日志
  populateTopList('top-urls-list', 'top-urls-empty', 'top-urls-table', topUrlsData?.topUrls || [], [
    { key: 'key', truncate: 30 },
    { key: 'url', truncate: 50 },
    { key: 'total_visits', align: 'right' }
  ]);
  // console.log('Top URLs list populated.'); // 添加日志
>>>>>>> 1c33e2e4c55d9477bb880777bce701499d092739
  
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

// 按日期范围加载统计数据
async function loadStatsByDateRange(startDate, endDate) {
  const loadingMsg = '开始加载从 ' + startDate + ' 到 ' + endDate + ' 的统计数据...';
  console.log(loadingMsg);
  showLoading();

  // 对于按日期范围的请求，我们将修改后端API以接受 startDate 和 endDate
  // 我们将使用一个新的基础端点或修改现有端点。这里假设修改现有端点，并通过 fetchStatsData 的新参数传递日期
  const limit = 10; // Top N 列表的通用限制

  console.log('Initiating Promise.all to fetch stats data by date range...');
  const [summaryData, timeSeriesData, topUrlsData, topCountriesData, topReferersData, topUserAgentsData] = await Promise.all([
    fetchStatsData('/admin/api/stats/summary', {}, true, startDate, endDate),
    fetchStatsData('/admin/api/stats/timeseries', {}, true, startDate, endDate),
    fetchStatsData('/admin/api/stats/top-urls', { limit }, true, startDate, endDate),
    fetchStatsData('/admin/api/stats/top-countries', { limit }, true, startDate, endDate),
    fetchStatsData('/admin/api/stats/top-referers', { limit }, true, startDate, endDate),
    fetchStatsData('/admin/api/stats/top-user-agents', { limit }, true, startDate, endDate)
  ]);
  
  console.log('Promise.all finished for date range. Received data:', { summaryData, timeSeriesData, topUrlsData, topCountriesData, topReferersData, topUserAgentsData });

  if (!summaryData || !timeSeriesData || !topUrlsData || !topCountriesData || !topReferersData || !topUserAgentsData) {
    console.error("部分或全部按日期范围统计数据加载失败。");
    // showError 已经在 fetchStatsData 中调用
    return;
  }
  
  console.log("所有按日期范围统计数据加载成功");

  updateSummaryCards(summaryData);
  renderTimeSeriesChart(timeSeriesData);
  
  console.log('Rendering Top URLs chart for date range...');
  renderTopUrlsChart(topUrlsData);
  console.log('Top URLs chart for date range rendered.');

  // 保留原有的 Top URLs 列表的填充逻辑，如果需要的话
  // populateTopList('top-urls-list', 'top-urls-empty', 'top-urls-table', topUrlsData?.topUrls || [], [
  //   { key: 'key', truncate: 30 },
  //   { key: 'url', truncate: 50 },
  //   { key: 'total_visits', align: 'right' }
  // ]);

  populateTopList('top-referers-list', 'top-referers-empty', 'top-referers-table', topReferersData?.topReferers || [], [
    { key: 'referer_domain', truncate: 50 },
    { key: 'count', align: 'right' }
  ]);
  populateTopList('top-countries-list', 'top-countries-empty', 'top-countries-table', topCountriesData?.topCountries || [], [
    { key: 'country' },
    { key: 'count', align: 'right' }
  ]);
  populateTopList('top-user-agents-list', 'top-user-agents-empty', 'top-user-agents-table', topUserAgentsData?.topUserAgents || [], [
    { key: 'browser' },
    { key: 'os' },
    { key: 'count', align: 'right' }
  ]);

  console.log('All UI updates for date range complete. Calling showContent...');
  showContent();
}


// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 获取周期选择器并添加事件监听器
  if (statsPeriodSelector) {
    statsPeriodSelector.addEventListener('change', function() {
      const days = parseInt(this.value, 10);
      // 清空日期选择器的值，如果通过周期选择器加载
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      loadAllStats(days);
    });
    
<<<<<<< HEAD
    // 初始加载 (默认按周期)
    const initialDays = parseInt(periodSelector.value, 10);
=======
    // 初始加载
    const initialDays = parseInt(statsPeriodSelector.value, 10);
>>>>>>> 1c33e2e4c55d9477bb880777bce701499d092739
    loadAllStats(initialDays);
  } else {
    console.warn('找不到周期选择器元素 #stats-period。如果不需要周期选择，请忽略此消息。');
    // 如果没有周期选择器，尝试直接加载一个默认范围或等待日期筛选
    // loadAllStats(7); // 例如，默认加载7天，但这取决于 stats.html 是否有此元素
  }

  // 获取日期筛选元素
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const filterButton = document.getElementById('filterButton');

  if (startDateInput && endDateInput && filterButton) {
    filterButton.addEventListener('click', () => {
      const startDate = startDateInput.value;
      const endDate = endDateInput.value;

      if (!startDate || !endDate) {
        showError('请选择起始日期和结束日期。');
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        showError('结束日期不能早于起始日期。');
        return;
      }
      
      // 如果通过日期筛选加载，可以考虑禁用或重置周期选择器
      if(periodSelector) periodSelector.value = periodSelector.options[0].value; // 重置为默认选项

      loadStatsByDateRange(startDate, endDate);
    });
  } else {
    console.error('找不到日期筛选相关的HTML元素 (startDate, endDate, filterButton)。');
    showError('界面初始化错误：找不到日期筛选组件。');
  }
});