export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route based on pathname
    if (url.pathname.startsWith('/admin')) {
      return handleAdmin(request, env, ctx);
    } else {
      return handleRedirect(request, env, ctx);
    }
  },
};

// --- Redirect Handler ---
async function handleRedirect(request, env, ctx) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    // Maybe return a default page or instructions?
    return new Response('Missing key parameter. Usage: /?key=your_key', { status: 400 });
  }

  const targetUrl = await env.REDIRECT_KV.get(key);

  if (targetUrl) {
    // Log the redirect asynchronously
    ctx.waitUntil(logRedirect(env, key, targetUrl, request));
    // Perform the redirect
    return Response.redirect(targetUrl, 302); // Use 302 for temporary redirect
  } else {
    // Key not found in KV
    return new Response(`Key '${key}' not found.`, { status: 404 });
  }
}

async function logRedirect(env, key, targetUrl, request) {
  try {
    const ip = request.headers.get('cf-connecting-ip') || 'N/A';
    const userAgent = request.headers.get('user-agent') || 'N/A';
    const stmt = env.REDIRECT_DB.prepare(
      'INSERT INTO redirect_logs (redirect_key, target_url, ip_address, user_agent) VALUES (?, ?, ?, ?)'
    );
    // Use await with run() for D1 operations initiated from fetch handler
    await stmt.bind(key, targetUrl, ip, userAgent).run();
     console.log(`Logged redirect for key: ${key}`);
  } catch (e) {
    console.error('Failed to log redirect:', e);
    // Log errors, but don't block the redirect itself
  }
}

// --- Admin Handler ---
async function handleAdmin(request, env, ctx) {
  // Basic Authentication
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin Panel"',
      },
    });
  }

  // Admin Routing
  const url = new URL(request.url);
  if (url.pathname === '/admin' && request.method === 'GET') {
    return new Response(getAdminHTML(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  } else if (url.pathname.startsWith('/admin/api/')) {
    return handleAdminApi(request, env);
  } else {
    // Handle other /admin paths or return 404
    return new Response('Admin path not found', { status: 404 });
  }
}

function isAuthorized(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.substring(6);
    const credentials = atob(base64Credentials); // Decode base64
    const [username, password] = credentials.split(':');

    // Securely compare credentials from environment variables
    const expectedUser = env.ADMIN_USERNAME;
    const expectedPass = env.ADMIN_PASSWORD;

    // Basic constant-time comparison (good practice)
    const userMatch = constantTimeCompare(username, expectedUser);
    const passMatch = constantTimeCompare(password, expectedPass);

    return userMatch && passMatch;
  } catch (e) {
    // Error during decoding or splitting
    console.error('Auth error:', e);
    return false;
  }
}

// Simple constant-time string comparison
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
  }

  let mismatch = a.length === b.length ? 0 : 1;
  if (mismatch) {
    // Ensure comparison happens even if lengths differ, to obscure length info
    b = a;
  }

  for (let i = 0; i < a.length; ++i) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }

  return mismatch === 0;
}


// --- Admin API Handler ---
async function handleAdminApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // --- URL Management API ---
    // GET /admin/api/urls - List all URL mappings
    if (method === 'GET' && path === '/admin/api/urls') {
      const listResult = await env.REDIRECT_KV.list();
      const urlPromises = listResult.keys.map(async (key) => {
          const value = await env.REDIRECT_KV.get(key.name);
          return { key: key.name, url: value };
      });
      const urls = await Promise.all(urlPromises);
      return new Response(JSON.stringify(urls), { headers: { 'Content-Type': 'application/json' } });
    }
    // POST /admin/api/urls - Add or update a URL mapping
    else if (method === 'POST' && path === '/admin/api/urls') {
      let jsonData;
      try {
          jsonData = await request.json();
      } catch (e) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const { key, url: targetUrl } = jsonData;
      if (!key || typeof key !== 'string' || !targetUrl || typeof targetUrl !== 'string') {
          return new Response(JSON.stringify({ success: false, error: 'Missing or invalid key or url' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      // Basic URL validation
       try {
         new URL(targetUrl);
       } catch (_) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid target URL format' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
       }

      await env.REDIRECT_KV.put(key, targetUrl);
      return new Response(JSON.stringify({ success: true, key: key, url: targetUrl }), { headers: { 'Content-Type': 'application/json' } });
    }
    // DELETE /admin/api/urls/:key - Delete a URL mapping
    else if (method === 'DELETE' && path.startsWith('/admin/api/urls/')) {
        const key = decodeURIComponent(path.substring('/admin/api/urls/'.length));
        if (!key) {
            return new Response(JSON.stringify({ success: false, error: 'Missing key in path' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        await env.REDIRECT_KV.delete(key);
        // Return 204 No Content for successful deletion is also common
        return new Response(JSON.stringify({ success: true, key: key }), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- Stats API ---
    // GET /admin/api/stats - Get aggregated stats
    else if (method === 'GET' && path === '/admin/api/stats') {
        const stmt = env.REDIRECT_DB.prepare(
            'SELECT redirect_key, COUNT(*) as count, MAX(timestamp) as last_access FROM redirect_logs GROUP BY redirect_key ORDER BY count DESC'
        );
        const { results } = await stmt.all();
        return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
    }
    // GET /admin/api/stats/:key - Get detailed stats for a specific key
    else if (method === 'GET' && path.startsWith('/admin/api/stats/')) {
        const key = decodeURIComponent(path.substring('/admin/api/stats/'.length));
        if (!key) {
             return new Response(JSON.stringify({ success: false, error: 'Missing key in path' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const stmt = env.REDIRECT_DB.prepare(
            'SELECT timestamp, ip_address, user_agent FROM redirect_logs WHERE redirect_key = ? ORDER BY timestamp DESC LIMIT 100' // Limit results
        );
        const { results } = await stmt.bind(key).all();
        return new Response(JSON.stringify(results || []), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- API Not Found ---
    else {
      return new Response(JSON.stringify({ error: 'API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
      console.error('API handler failed:', e);
      return new Response(JSON.stringify({ success: false, error: 'Internal Server Error: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}


// --- Admin Panel HTML & Embedded JS ---
function getAdminHTML() {
  // Returns the full HTML for the admin panel
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>重定向管理面板</title>
    <style>
        :root {
            --primary-color: #007bff;
            --danger-color: #dc3545;
            --success-color: #28a745;
            --info-color: #17a2b8;
            --light-gray: #f8f9fa;
            --medium-gray: #dee2e6;
            --dark-gray: #343a40;
            --text-color: #212529;
            --white: #fff;
            --border-radius: 0.25rem;
        }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6; 
            padding: 20px; 
            max-width: 1200px; 
            margin: 20px auto; 
            background-color: var(--light-gray);
            color: var(--text-color);
        }
        h1, h2 { 
            color: var(--dark-gray); 
            border-bottom: 2px solid var(--medium-gray);
            padding-bottom: 10px; 
            margin-bottom: 20px;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 20px; 
            background-color: var(--white);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-radius: var(--border-radius);
            overflow: hidden; /* Ensures border-radius applies to table */
        }
        th, td { 
            padding: 12px 15px; 
            text-align: left; 
            border-bottom: 1px solid var(--medium-gray); 
        }
        th { 
            background-color: var(--light-gray);
            font-weight: 600;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:hover { 
            background-color: #f1f1f1; 
        }
        a {
            color: var(--primary-color);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        form { 
            background-color: var(--white);
            padding: 25px;
            border-radius: var(--border-radius);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 600; 
        }
        input[type="text"], 
        input[type="url"] { 
            width: calc(100% - 24px); /* Account for padding */
            padding: 10px 12px;
            margin-bottom: 15px; 
            border: 1px solid var(--medium-gray);
            border-radius: var(--border-radius);
            font-size: 1rem;
        }
        input:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }
        button {
            padding: 10px 20px;
            color: var(--white);
            border: none;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-size: 1rem;
            transition: background-color 0.2s ease;
        }
        button[type="submit"] {
             background-color: var(--success-color);
        }
        button[type="submit"]:hover {
             background-color: #218838; 
        }
        .btn {
             margin-left: 5px;
             font-size: 0.9rem; /* Smaller buttons for table actions */
             padding: 6px 12px;
        }
        .btn-danger { background-color: var(--danger-color); }        
        .btn-danger:hover { background-color: #c82333; }
        .btn-info { background-color: var(--info-color); }
        .btn-info:hover { background-color: #138496; }
        
        #statsDetail pre {
             background-color: #e9ecef; 
             padding: 15px;
             border: 1px solid var(--medium-gray);
             border-radius: var(--border-radius); 
             max-height: 350px; 
             overflow-y: auto; 
             white-space: pre-wrap; /* Wrap long lines */
             word-wrap: break-word;
             font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
             font-size: 0.9em;
         }
        .error {
             color: var(--danger-color);
             background-color: #f8d7da;
             border: 1px solid #f5c6cb;
             padding: 10px 15px;
             border-radius: var(--border-radius);
             margin-bottom: 15px; 
        }
        .loading {
             text-align: center; 
             padding: 30px;
             color: #6c757d;
        }
        .hidden { display: none; }
    </style>
</head>
<body>
    <h1>重定向管理面板</h1>

    <section>
        <h2>添加/更新 URL 映射</h2>
        <form id="addUrlForm">
            <div id="formError" class="error hidden"></div>
            <div>
                <label for="key">Key (短链接标识):</label>
                <input type="text" id="key" name="key" required placeholder="例如: google">
            </div>
            <div>
                <label for="url">目标 URL (完整链接):</label>
                <input type="url" id="url" name="url" required placeholder="例如: https://www.google.com">
            </div>
            <button type="submit">保存映射</button>
        </form>
    </section>

    <section>
        <h2>现有 URL 映射</h2>
        <div id="urlsLoading" class="loading">加载中...</div>
        <div id="urlsError" class="error hidden"></div>
        <table id="urlsTable" class="hidden">
            <thead>
                <tr>
                    <th>Key</th>
                    <th>目标 URL</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody id="urlsTableBody"></tbody>
        </table>
    </section>

    <section>
        <h2>汇总统计</h2>
        <div id="statsLoading" class="loading">加载中...</div>
        <div id="statsError" class="error hidden"></div>
        <table id="statsTable" class="hidden">
            <thead>
                <tr>
                    <th>Key</th>
                    <th>访问次数</th>
                    <th>最近访问时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody id="statsTableBody"></tbody>
        </table>
    </section>
    
    <section id="statsDetailSection" class="hidden">
        <h2>详细统计日志: <span id="statsDetailKey" style="font-weight: normal;"></span></h2>
        <div id="statsDetailLoading" class="loading hidden">加载中...</div>
        <div id="statsDetailError" class="error hidden"></div>
        <div id="statsDetail" class="hidden"><pre></pre></div>
    </section>

    <script>
        // Simple debounce function
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // --- DOM Elements Cache ---
        const ui = {
            addUrlForm: document.getElementById('addUrlForm'),
            formError: document.getElementById('formError'),
            keyInput: document.getElementById('key'),
            urlInput: document.getElementById('url'),
            urlsTable: document.getElementById('urlsTable'),
            urlsTableBody: document.getElementById('urlsTableBody'),
            urlsLoading: document.getElementById('urlsLoading'),
            urlsError: document.getElementById('urlsError'),
            statsTable: document.getElementById('statsTable'),
            statsTableBody: document.getElementById('statsTableBody'),
            statsLoading: document.getElementById('statsLoading'),
            statsError: document.getElementById('statsError'),
            statsDetailSection: document.getElementById('statsDetailSection'),
            statsDetailKey: document.getElementById('statsDetailKey'),
            statsDetailLoading: document.getElementById('statsDetailLoading'),
            statsDetailError: document.getElementById('statsDetailError'),
            statsDetailDiv: document.getElementById('statsDetail'),
            statsDetailPre: document.getElementById('statsDetail').querySelector('pre'),
        };

        // --- API Call Abstraction ---
        async function apiRequest(path, options = {}) {
            ui.formError.classList.add('hidden'); // Hide form error on new request
            try {
                const response = await fetch(`/admin/api${path}`, options);
                const responseData = response.status === 204 ? null : await response.json(); // Handle No Content
                
                if (!response.ok) {
                    const errorMsg = responseData?.error || `HTTP Error ${response.status}`;
                    throw new Error(errorMsg);
                }
                return responseData || { success: true }; // Return success for 204
            } catch (error) {
                console.error('API Request Error:', path, options, error);
                // Display error appropriately, maybe not always in formError
                showError(ui.formError, `API Error: ${error.message}`); 
                return { success: false, error: error.message }; 
            }
        }

        // --- UI Update Functions ---
        function renderUrlsTable(urls) {
            ui.urlsTableBody.innerHTML = ''; // Clear existing rows
            if (!urls || urls.length === 0) {
                ui.urlsTableBody.innerHTML = '<tr><td colspan="3">还没有添加任何 URL 映射。</td></tr>';
                return;
            }
            urls.sort((a, b) => a.key.localeCompare(b.key)); // Sort by key
            urls.forEach(item => {
                const row = ui.urlsTableBody.insertRow();
                const targetUrlEscaped = escapeHTML(item.url);
                const keyEscaped = escapeHTML(item.key);
                row.innerHTML = `
                    <td>${keyEscaped}</td>
                    <td><a href="${targetUrlEscaped}" target="_blank" title="${targetUrlEscaped}">${limitString(targetUrlEscaped, 80)}</a></td>
                    <td>
                        <button class="btn btn-danger delete-btn" data-key="${keyEscaped}">删除</button>
                    </td>
                `;
            });
        }

        function renderStatsTable(stats) {
            ui.statsTableBody.innerHTML = '';
            if (!stats || stats.length === 0) {
                ui.statsTableBody.innerHTML = '<tr><td colspan="4">暂无统计数据。</td></tr>';
                return;
            }
            // stats are pre-sorted by count DESC from API
            stats.forEach(item => {
                const row = ui.statsTableBody.insertRow();
                const keyEscaped = escapeHTML(item.redirect_key);
                const lastAccess = item.last_access ? new Date(item.last_access).toLocaleString() : '从未';
                row.innerHTML = `
                    <td>${keyEscaped}</td>
                    <td>${item.count}</td>
                    <td>${lastAccess}</td>
                    <td>
                        <button class="btn btn-info stats-detail-btn" data-key="${keyEscaped}">查看日志</button>
                    </td>
                `;
            });
        }

        function renderStatsDetail(key, logs) {
            ui.statsDetailSection.classList.remove('hidden');
            ui.statsDetailKey.textContent = escapeHTML(key);
            ui.statsDetailLoading.classList.add('hidden');
            ui.statsDetailError.classList.add('hidden');
            ui.statsDetailDiv.classList.remove('hidden');

            if (!logs || logs.length === 0) {
                 ui.statsDetailPre.textContent = '此 Key 暂无详细访问日志。';
                 return;
            }
            // Format logs for readability
            const formattedLogs = logs.map(log => (
              `时间: ${new Date(log.timestamp).toLocaleString()}\n IP: ${escapeHTML(log.ip_address)}\n User Agent: ${escapeHTML(log.user_agent)}`
            )).join('\n\n------------------------------------\n\n');
            ui.statsDetailPre.textContent = formattedLogs;
        }

        function showLoading(element) { element.classList.remove('hidden'); }
        function hideLoading(element) { element.classList.add('hidden'); }
        function showTable(element) { element.classList.remove('hidden'); }
        function hideTable(element) { element.classList.add('hidden'); }
        function showError(element, message) {
            element.textContent = message;
            element.classList.remove('hidden');
        }
        function hideError(element) {
             element.textContent = '';
             element.classList.add('hidden');
        }

        // --- Data Loading Functions ---
        async function loadUrls() {
            showLoading(ui.urlsLoading);
            hideTable(ui.urlsTable);
            hideError(ui.urlsError);
            const result = await apiRequest('/urls');
            hideLoading(ui.urlsLoading);
            if (result && Array.isArray(result)) {
                renderUrlsTable(result);
                showTable(ui.urlsTable);
            } else {
                showError(ui.urlsError, result?.error || '加载 URL 列表失败');
            }
        }

        async function loadStats() {
            showLoading(ui.statsLoading);
            hideTable(ui.statsTable);
            hideError(ui.statsError);
            const result = await apiRequest('/stats');
            hideLoading(ui.statsLoading);
            if (result && Array.isArray(result)) {
                renderStatsTable(result);
                showTable(ui.statsTable);
            } else {
                 showError(ui.statsError, result?.error || '加载统计数据失败');
            }
        }

        async function loadStatsDetail(key) {
            ui.statsDetailSection.classList.remove('hidden');
            ui.statsDetailKey.textContent = escapeHTML(key);
            showLoading(ui.statsDetailLoading);
            hideError(ui.statsDetailError);
            hideError(ui.statsDetailDiv);

            const result = await apiRequest(`/stats/${encodeURIComponent(key)}`);
            hideLoading(ui.statsDetailLoading);
            if (result && Array.isArray(result)) {
                 renderStatsDetail(key, result);
            } else {
                 showError(ui.statsDetailError, result?.error || `加载 Key '${escapeHTML(key)}' 的详细日志失败`);
                 hideError(ui.statsDetailDiv); // Hide the pre area if error
            }
        }
        
        // --- Event Handlers ---
        const handleAddUrlSubmit = async (e) => {
            e.preventDefault();
            hideError(ui.formError);
            const key = ui.keyInput.value.trim();
            const targetUrl = ui.urlInput.value.trim();

            if (!key || !targetUrl) {
                showError(ui.formError, 'Key 和目标 URL 不能为空。');
                return;
            }
            try {
                 new URL(targetUrl);
            } catch (_) {
                showError(ui.formError, '目标 URL 格式无效。');
                return;
            }

            const result = await apiRequest('/urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, url: targetUrl }),
            });

            if (result.success) {
                ui.addUrlForm.reset();
                await loadUrls(); // Refresh URL list
                await loadStats(); // Refresh stats (might include the new key)
            } else {
                 // API request function already shows error in formError
            }
        };

        const handleUrlsTableClick = async (e) => {
            if (e.target.classList.contains('delete-btn')) {
                const key = e.target.dataset.key;
                if (!key) return;
                
                if (confirm(`确定要删除 Key '${escapeHTML(key)}' 吗？此操作不可恢复。`)) {
                    const result = await apiRequest(`/urls/${encodeURIComponent(key)}`, { method: 'DELETE' });
                    if (result.success) {
                        await loadUrls(); // Refresh URL list
                        await loadStats(); // Refresh stats
                        // Hide detail view if the deleted key was shown
                        if (!ui.statsDetailSection.classList.contains('hidden') && ui.statsDetailKey.textContent === key) {
                           ui.statsDetailSection.classList.add('hidden');
                        }
                    } else {
                         // Error shown by apiRequest
                         alert(`删除失败: ${result.error}`); // Fallback alert
                    }
                }
            }
        };

         const handleStatsTableClick = (e) => {
            if (e.target.classList.contains('stats-detail-btn')) {
                const key = e.target.dataset.key;
                if (!key) return;
                loadStatsDetail(key);
                 // Scroll to detail section smoothly
                ui.statsDetailSection.scrollIntoView({ behavior: 'smooth' });
            }
        };

        // --- Utility Functions ---
        function escapeHTML(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/[&<>'"/]/g, (s) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;',
                '"': '&quot;', "'": '&#39;', '/': '&#x2F;'
            }[s]));
        }
        
        function limitString(str, maxLength) {
             if (typeof str !== 'string') return '';
             return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
        }

        // --- Initial Load ---
        function initializeAdminPanel() {
             loadUrls();
             loadStats();

             // Attach event listeners
             ui.addUrlForm.addEventListener('submit', handleAddUrlSubmit);
             ui.urlsTableBody.addEventListener('click', handleUrlsTableClick);
             ui.statsTableBody.addEventListener('click', handleStatsTableClick);
        }

        // Run initialization when the script loads
        initializeAdminPanel();

    </script>
</body>
</html>
  `;
}
 