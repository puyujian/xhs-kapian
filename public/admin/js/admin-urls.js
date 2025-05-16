// --- Base Page Scripts ---
const usernamePlaceholderElement = document.getElementById('usernamePlaceholder');
const logoutButtonElement = document.getElementById('logoutBtn');

function updateUsernameDisplay() {
  const username = localStorage.getItem('username');
  if (username && usernamePlaceholderElement) {
    usernamePlaceholderElement.textContent = username;
  }
}

function checkAuth() {
  const token = localStorage.getItem('token');
  if (window.location.pathname !== '/admin/login.html' && !token) {
    // console.log('未检测到认证令牌，重定向到登录页面'); // Removed debug log
    window.location.href = '/admin/login.html';
    return false;
  }
  updateUsernameDisplay(); // Update username on successful auth check
  return true;
}

if (logoutButtonElement) {
    logoutButtonElement.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/admin/login.html';
    });
}

// --- URL Management Page Scripts ---
// DOM Element Cache
const urlFormContainerElement = document.getElementById('url-form-container');
const formTitleElement = document.getElementById('form-title');
const urlIdElement = document.getElementById('url-id');
const urlKeyElement = document.getElementById('url-key');
const urlTargetElement = document.getElementById('url-target');
const keyErrorElement = document.getElementById('key-error');
const urlErrorElement = document.getElementById('url-error');
const formMessageElement = document.getElementById('form-message');
const errorMessageElement = document.getElementById('error-message');
const loadingMessageElement = document.getElementById('loading-message');
const retryLoadBtnElement = document.getElementById('retry-load-btn');
const urlsTableElement = document.getElementById('urls-table');
const urlsListBodyElement = document.getElementById('urls-list'); // tbody for table
const noUrlsMessageElement = document.getElementById('no-urls-message');
const addUrlBtnElement = document.getElementById('add-url-btn');
const cancelUrlBtnElement = document.getElementById('cancel-url-btn');
const urlFormElement = document.getElementById('url-form');
const saveUrlBtnElement = document.getElementById('save-url-btn');


let redirects = [];
let isLoadingData = false;
let apiTimeout = 15000;

// function debugLog(message, data) { // Removed debugLog function
//  console.log('[URL管理]', message, data || '');
// }

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return dateString;
    }
    return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return dateString;
  }
}

function toggleForm(show, isEdit = false) {
  // debugLog('切换表单显示', { show, isEdit });
  if (!urlFormContainerElement) {
    // debugLog('错误: 找不到表单容器元素');
    return;
  }
  if (show) {
    urlFormContainerElement.classList.remove('is-hidden');
  } else {
    urlFormContainerElement.classList.add('is-hidden');
  }
  // urlFormContainerElement.style.display = show ? 'block' : 'none'; // Old way
  if (show) {
    if (formTitleElement) formTitleElement.textContent = isEdit ? '编辑URL' : '添加新URL';
    if (urlKeyElement) urlKeyElement.classList.remove('is-invalid');
    if (urlTargetElement) urlTargetElement.classList.remove('is-invalid');
    if (!isEdit) {
      if (urlIdElement) urlIdElement.value = '';
      if (urlKeyElement) urlKeyElement.value = '';
      if (urlTargetElement) urlTargetElement.value = '';
    }
    if (keyErrorElement) keyErrorElement.textContent = '';
    if (urlErrorElement) urlErrorElement.textContent = '';
    if (formMessageElement) {
        formMessageElement.textContent = '';
        formMessageElement.className = 'mt-3 small';
    }
  }
}

function showListError(message) {
  if (errorMessageElement) {
    errorMessageElement.textContent = message;
    errorMessageElement.classList.remove('is-hidden');
  }
  if (loadingMessageElement) loadingMessageElement.classList.add('is-hidden');
  if (retryLoadBtnElement) retryLoadBtnElement.classList.remove('is-hidden');
  if (urlsTableElement) urlsTableElement.classList.add('is-hidden');
  if (noUrlsMessageElement) noUrlsMessageElement.classList.add('is-hidden');
  console.error('URL管理错误:', message);
}

function showFormMessage(message, isError) {
  if (!formMessageElement) {
    // debugLog('错误: 找不到表单消息元素');
    return;
  }
  formMessageElement.textContent = message;
  formMessageElement.className = `mt-3 small alert ${isError ? 'alert-danger' : 'alert-success'}`;
  setTimeout(() => {
    if (formMessageElement.textContent === message) {
        formMessageElement.textContent = '';
        formMessageElement.className = 'mt-3 small';
    }
  }, 3000);
}

async function loadUrlData() {
  // debugLog('开始加载URL数据');
  if (isLoadingData) {
    // debugLog('已有加载请求正在进行中，跳过');
    return;
  }
  if (!checkAuth()) return;
  isLoadingData = true;

  if (errorMessageElement) errorMessageElement.classList.add('is-hidden');
  if (loadingMessageElement) loadingMessageElement.classList.remove('is-hidden');
  if (retryLoadBtnElement) retryLoadBtnElement.classList.add('is-hidden');
  if (urlsTableElement) urlsTableElement.classList.add('is-hidden');
  if (noUrlsMessageElement) noUrlsMessageElement.classList.add('is-hidden');

  try {
    const token = localStorage.getItem('token');
    // debugLog('发送获取重定向请求 to /admin/api/redirects');
    const redirectsPromise = fetch('/admin/api/redirects', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const redirectsTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('获取重定向数据超时')), apiTimeout)
    );
    const redirectsResponse = await Promise.race([redirectsPromise, redirectsTimeout]);

    if (!redirectsResponse.ok) {
      if (redirectsResponse.status === 401) {
        // debugLog('认证失败，重定向到登录页面');
        checkAuth();
        return;
      }
      const errorText = await redirectsResponse.text();
      // debugLog('API响应错误', { status: redirectsResponse.status, body: errorText });
      throw new Error(`API响应错误: ${redirectsResponse.status} - ${errorText}`);
    }
    const redirectsData = await redirectsResponse.json();
    redirects = redirectsData.redirects?.results || redirectsData.redirects || [];
    if (!Array.isArray(redirects)) {
        console.error("Received non-array data for redirects:", redirectsData);
        redirects = [];
        throw new Error("从API接收到的重定向数据格式无效。");
    }
    // debugLog('成功获取重定向数据', redirects);
    renderTable();
  } catch (error) {
    // debugLog('加载URL数据时出错', error);
    showListError('加载URL数据失败: ' + error.message);
  } finally {
    isLoadingData = false;
    if (loadingMessageElement) loadingMessageElement.classList.add('is-hidden');
    // debugLog('URL数据加载完成');
  }
}

function renderTable() {
  // debugLog('开始渲染表格', { redirectsCount: redirects.length });
  // urlsListBodyElement, urlsTableElement, noUrlsMessageElement, errorMessageElement are cached
  if (!urlsListBodyElement || !urlsTableElement || !noUrlsMessageElement || !errorMessageElement) {
    // debugLog('错误: 渲染表格所需的元素未找到');
     showListError('无法渲染表格，页面结构可能已损坏。');
     return;
  }
  urlsListBodyElement.innerHTML = ''; // 清空
  errorMessageElement.classList.add('is-hidden');

  if (redirects.length === 0) {
    // debugLog('没有重定向数据，显示空消息');
    urlsTableElement.classList.add('is-hidden');
    noUrlsMessageElement.classList.remove('is-hidden');
    return;
  }
  urlsTableElement.classList.remove('is-hidden');
  noUrlsMessageElement.classList.add('is-hidden');

  const fragment = document.createDocumentFragment();
  redirects.forEach(item => {
    const row = document.createElement('tr'); // 使用 createElement 创建 tr

    const keyCell = document.createElement('td');
    keyCell.textContent = item.key;
    row.appendChild(keyCell);

    const urlCell = document.createElement('td');
    urlCell.textContent = item.url;
    urlCell.title = item.url;
    urlCell.style.maxWidth = '300px';
    urlCell.style.overflow = 'hidden';
    urlCell.style.textOverflow = 'ellipsis';
    urlCell.style.whiteSpace = 'nowrap';
    row.appendChild(urlCell);

    const createdAtCell = document.createElement('td');
    createdAtCell.textContent = item.created_at ? formatDate(item.created_at) : 'N/A';
    row.appendChild(createdAtCell);

    const actionsCell = document.createElement('td');
    actionsCell.style.whiteSpace = 'nowrap';

    const editButton = document.createElement('button');
    editButton.innerHTML = '<i class="fas fa-edit me-1"></i> 编辑';
    editButton.classList.add('btn', 'btn-sm', 'btn-outline-primary', 'me-1', 'edit-action-class'); // 添加 edit-action-class
    editButton.dataset.id = item.id;
    // editButton.addEventListener('click', handleEditClick); // 事件监听器将通过事件委托处理
    actionsCell.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '<i class="fas fa-trash-alt me-1"></i> 删除';
    deleteButton.classList.add('btn', 'btn-sm', 'btn-outline-danger', 'delete-action-class'); // 添加 delete-action-class
    deleteButton.dataset.id = item.id;
    // deleteButton.addEventListener('click', handleDeleteClick); // 事件监听器将通过事件委托处理
    actionsCell.appendChild(deleteButton);

    row.appendChild(actionsCell);
    fragment.appendChild(row);
  });
  urlsListBodyElement.appendChild(fragment);
  // debugLog('表格渲染完成');
}

// handleEditClick 和 handleDeleteClick 现在将由事件委托调用，
// event.target 将是实际点击的元素，我们需要找到按钮并获取其 data-id
function handleEditAction(id) {
    // debugLog('编辑操作触发', { id });
    try {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
            editRedirect(numericId);
        } else {
            // debugLog('错误: 无效的数字ID', { id });
            showFormMessage('无法编辑：无效的 ID', true);
        }
    } catch (error) {
        // debugLog('处理编辑操作时出错', { error });
        showFormMessage('编辑操作失败', true);
    }
}

function handleDeleteAction(id) {
    // debugLog('删除操作触发', { id });
    try {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
            deleteRedirect(numericId);
        } else {
            // debugLog('错误: 无效的数字ID', { id });
            showFormMessage('无法删除：无效的 ID', true);
        }
    } catch (error) {
        // debugLog('处理删除操作时出错', { error });
        showFormMessage('删除操作失败', true);
    }
}


function editRedirect(id) {
  // debugLog('编辑重定向', { id });
  const redirect = redirects.find(item => parseInt(item.id, 10) === id);
  if (!redirect) {
    // debugLog('错误: 找不到ID为' + id + '的重定向');
    showFormMessage('找不到要编辑的URL记录', true);
    return;
  }
  if (urlIdElement) urlIdElement.value = id;
  if (urlKeyElement) urlKeyElement.value = redirect.key;
  if (urlTargetElement) urlTargetElement.value = redirect.url;
  toggleForm(true, true);
  if (urlFormContainerElement) {
      urlFormContainerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function deleteRedirect(id) {
  // debugLog('删除重定向', { id });
  if (!confirm(`确定要删除这个URL重定向 (ID: ${id}) 吗？此操作无法撤销。`)) {
    return;
  }
  try {
    const token = localStorage.getItem('token');
    if (!checkAuth()) return;
    const deletePromise = fetch('/admin/api/redirects/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const deleteTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('删除操作超时')), apiTimeout)
    );
    const response = await Promise.race([deletePromise, deleteTimeout]);
    if (!response.ok) {
      if (response.status === 401) {
        // debugLog('认证失败，重定向到登录页面');
        checkAuth();
        return;
      }
      let errorMsg = '删除失败，请重试';
      try {
          const error = await response.json();
          errorMsg = error.error || errorMsg;
      } catch (e) { /* Ignore */ }
      showFormMessage(errorMsg, true);
      return;
    }
    showFormMessage('URL已成功删除', false);
    await loadUrlData();
  } catch (error) {
    console.error('删除URL错误:', error);
    showFormMessage('删除失败: ' + (error.message || '未知错误'), true);
  }
}

async function saveUrlData(id, key, url) {
  const numericId = id ? parseInt(id, 10) : null;
  // debugLog('保存URL数据', { id, numericId, key, url });

  if (keyErrorElement) keyErrorElement.textContent = '';
  if (urlErrorElement) urlErrorElement.textContent = '';
  if (urlKeyElement) urlKeyElement.classList.remove('is-invalid');
  if (urlTargetElement) urlTargetElement.classList.remove('is-invalid');
  let isValid = true;
  if (!key) {
      if (keyErrorElement) keyErrorElement.textContent = '键不能为空';
      if (urlKeyElement) urlKeyElement.classList.add('is-invalid');
      isValid = false;
  }
  if (!url) {
      if (urlErrorElement) urlErrorElement.textContent = 'URL不能为空';
      if (urlTargetElement) urlTargetElement.classList.add('is-invalid');
      isValid = false;
  } else {
      try {
          new URL(url);
      } catch (_) {
          if (urlErrorElement) urlErrorElement.textContent = 'URL格式无效';
          if (urlTargetElement) urlTargetElement.classList.add('is-invalid');
          isValid = false;
      }
  }
  if (!isValid) return false;

  try {
    const token = localStorage.getItem('token');
    if (!checkAuth()) return false;
    let savePromise;
    const apiUrl = numericId ? `/admin/api/redirects/${numericId}` : '/admin/api/redirects';
    const method = numericId ? 'PUT' : 'POST';
    // debugLog(`发送 ${method} 请求到 ${apiUrl}`);
    savePromise = fetch(apiUrl, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ key, url })
    });
    const saveTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('保存操作超时')), apiTimeout)
    );
    const response = await Promise.race([savePromise, saveTimeout]);

    if (!response.ok) {
      const errorText = await response.text();
      // debugLog('保存请求失败', { status: response.status, body: errorText });
      let errorMessage = '保存失败，请重试';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = `保存失败: ${response.status} ${response.statusText}`;
      }
      if (response.status === 401) {
        // debugLog('认证失败，重定向到登录页面');
        checkAuth();
        return false;
      }
      if (response.status === 409) {
          if (keyErrorElement) keyErrorElement.textContent = errorMessage;
          if (urlKeyElement) urlKeyElement.classList.add('is-invalid');
      } else {
          showFormMessage(errorMessage, true);
      }
      return false;
    }
    const data = await response.json();
    // debugLog('保存请求响应', data);
    showFormMessage(numericId ? 'URL已成功更新' : 'URL已成功添加', false);
    toggleForm(false);
    await loadUrlData();
    return true;
  } catch (error) {
    console.error('保存URL错误:', error);
    showFormMessage('保存失败: ' + (error.message || '未知错误'), true);
    return false;
  }
}

function initEventListeners() {
  // debugLog('初始化事件监听器');
  if (addUrlBtnElement) {
    addUrlBtnElement.addEventListener('click', function(e) {
      e.preventDefault();
      // debugLog('点击了添加URL按钮');
      toggleForm(true, false);
      if (urlFormContainerElement) {
          urlFormContainerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  } else { console.error('错误: 找不到添加URL按钮元素'); } // Keep important errors

  if (cancelUrlBtnElement) {
    cancelUrlBtnElement.addEventListener('click', function(e) {
      e.preventDefault();
      // debugLog('点击了取消按钮');
      toggleForm(false);
    });
  } else { console.error('错误: 找不到取消按钮元素'); } // Keep important errors

  if (retryLoadBtnElement) {
    retryLoadBtnElement.addEventListener('click', function(e) {
      e.preventDefault();
      // debugLog('点击了重试加载按钮');
      loadUrlData();
    });
  } else { console.error('错误: 找不到重试按钮'); } // Keep important errors

  if (urlFormElement) {
    urlFormElement.addEventListener('submit', async function(e) {
      e.preventDefault();
      // debugLog('提交了URL表单');
      if (saveUrlBtnElement) {
        saveUrlBtnElement.disabled = true;
        saveUrlBtnElement.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 正在保存...';
      }
      const idValue = urlIdElement ? urlIdElement.value : '';
      const id = idValue ? parseInt(idValue, 10) : '';
      const key = urlKeyElement ? urlKeyElement.value.trim() : '';
      const url = urlTargetElement ? urlTargetElement.value.trim() : '';
      // debugLog('表单数据', { idValue, id, key, url });
      await saveUrlData(id, key, url);
      if (saveUrlBtnElement) {
        saveUrlBtnElement.disabled = false;
        saveUrlBtnElement.innerHTML = '<i class="fas fa-save me-1"></i> 保存';
      }
    });
  } else { console.error('错误: 找不到表单或保存按钮'); } // Keep important errors

  // 事件委托 for urls-list
  if (urlsListBodyElement) {
    urlsListBodyElement.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button && button.dataset.id) {
        const id = button.dataset.id;
        if (button.classList.contains('edit-action-class')) {
          // debugLog('事件委托: 编辑按钮点击', { id });
          handleEditAction(id);
        } else if (button.classList.contains('delete-action-class')) {
          // debugLog('事件委托: 删除按钮点击', { id });
          handleDeleteAction(id);
        }
      }
    });
  } else { console.error('错误: 找不到 urls-list (tbody) 元素进行事件委托'); } // Keep important errors
}

function initPage() {
  // debugLog('初始化页面');
  if (!checkAuth()) return;
  initEventListeners();
  loadUrlData();
  window.addEventListener('error', function(event) {
    console.error('全局错误:', event.error);
  });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}