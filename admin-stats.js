async function fetchStatsData(endpoint, params = {}) {
    try {
        // ... existing code ...
    } catch (error) {
        console.error(`请求 ${endpoint} 出错:`, error);
        showError(`加载数据出错: ${error.message}`);
        return null;
    }
}

function populateTopList(listId, emptyId, tableId, data, columns) {
    const listBody = document.getElementById(listId);
    const emptyMessage = document.getElementById(emptyId);
    const tableElement = document.getElementById(tableId);
    if (!listBody || !emptyMessage || !tableElement) {
        console.error(`更新列表 ${listId} 失败: 找不到元素`);
        return;
    }
    // ... existing code ...
}

async function loadAllStats(days) {
    console.log(`开始加载 ${days} 天的统计数据...`);
    showLoading();
    currentPeriodDays = days; // 更新当前时间范围
    // ... existing code ...
} 