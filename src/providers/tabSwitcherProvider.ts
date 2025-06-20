import * as vscode from 'vscode';

/**
 * Tab切换器Provider - 使用WebView实现固定的搜索框和切换按钮
 */
export class TabSwitcherProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'CCoding.tabSwitcher';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private onTabSwitched: (tab: 'current' | 'all') => void,
        private onSearchPerformed: (query: string, scope: 'current' | 'all', searchType: string) => void
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'tabSwitch':
                        this.onTabSwitched(message.tab);
                        break;
                    case 'search':
                        this.onSearchPerformed(message.query, message.scope, message.searchType);
                        break;
                }
            },
            undefined,
            []
        );
    }

    public updateCurrentTab(tab: 'current' | 'all') {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateTab', tab: tab });
        }
    }

    public clearSearch() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearSearch' });
        }
    }

    public focusSearchInput() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'focusSearch' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCoding Control</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            min-height: 120px;
            box-sizing: border-box;
        }
        
        .search-container {
            margin-bottom: 12px;
        }
        
        .search-combo-container {
            display: flex;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            overflow: hidden;
            background-color: var(--vscode-input-background);
            margin-bottom: 8px;
            transition: border-color 0.2s;
        }
        
        .search-combo-container:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        
        .search-type-select {
            min-width: 85px;
            padding: 6px 8px;
            border: none;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            font-size: 12px;
            cursor: pointer;
            border-right: 1px solid var(--vscode-input-border);
        }
        
        .search-type-select:focus {
            outline: none;
            background-color: var(--vscode-dropdown-listBackground);
        }
        
        .search-input-container {
            position: relative;
            flex: 1;
        }
        
        .search-input {
            width: 100%;
            padding: 6px 8px;
            border: none;
            background-color: transparent;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            box-sizing: border-box;
        }
        
        .search-input:focus {
            outline: none;
        }
        
        .search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        
        .tab-container {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }
        
        .tab-button {
            flex: 1;
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
            text-align: center;
            transition: all 0.2s;
        }
        
        .tab-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .tab-button.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .search-info {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            padding-left: 2px;
        }
        
        .search-indicator {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .search-indicator.searching {
            opacity: 1;
            color: var(--vscode-progressBar-background);
        }
    </style>
</head>
<body>
    <div class="search-container">
        <div class="search-combo-container">
            <select class="search-type-select" id="searchTypeSelect">
                <option value="all">全部</option>
                <option value="bookmarks">书签</option>
                <option value="todos">待办</option>
                <option value="pinnedSymbols">置顶</option>
                <option value="functions">函数</option>
            </select>
            <div class="search-input-container">
                <input type="text" class="search-input" id="searchInput" placeholder="输入关键字搜索...">
                <span class="search-indicator" id="searchIndicator">🔍</span>
            </div>
        </div>
        <div class="search-info" id="searchInfo">在当前文件的所有内容中搜索</div>
    </div>
    
    <div class="tab-container">
        <button class="tab-button active" id="currentTab" data-tab="current">当前</button>
        <button class="tab-button" id="allTab" data-tab="all">所有</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentActiveTab = 'current';
        let currentSearchType = 'all';
        
        // Tab切换逻辑
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.target.getAttribute('data-tab');
                switchTab(tab);
                vscode.postMessage({
                    type: 'tabSwitch',
                    tab: tab
                });
                
                // 如果有搜索内容，切换Tab后立即搜索
                const query = searchInput.value.trim();
                if (query) {
                    showSearchIndicator();
                    vscode.postMessage({
                        type: 'search',
                        query: query,
                        scope: tab,
                        searchType: currentSearchType
                    });
                    setTimeout(() => {
                        hideSearchIndicator();
                    }, 100);
                }
            });
        });
        
        // 搜索类型选择逻辑
        const searchTypeSelect = document.getElementById('searchTypeSelect');
        searchTypeSelect.addEventListener('change', (e) => {
            currentSearchType = e.target.value;
            updateSearchInfo();
            
            // 如果有搜索内容，立即使用新的搜索类型进行搜索
            const query = searchInput.value.trim();
            if (query) {
                showSearchIndicator();
                vscode.postMessage({
                    type: 'search',
                    query: query,
                    scope: currentActiveTab,
                    searchType: currentSearchType
                });
                setTimeout(() => {
                    hideSearchIndicator();
                }, 100);
            }
        });
        
        // 搜索逻辑
        const searchInput = document.getElementById('searchInput');
        const searchInfo = document.getElementById('searchInfo');
        const searchIndicator = document.getElementById('searchIndicator');
        let searchTimeout;
        
        // 显示搜索指示器
        function showSearchIndicator() {
            searchIndicator.classList.add('searching');
        }
        
        // 隐藏搜索指示器
        function hideSearchIndicator() {
            searchIndicator.classList.remove('searching');
        }
        
        // 实时搜索（防抖）
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // 清除之前的定时器
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            if (query) {
                showSearchIndicator();
                // 设置防抖延迟
                searchTimeout = setTimeout(() => {
                    vscode.postMessage({
                        type: 'search',
                        query: query,
                        scope: currentActiveTab,
                        searchType: currentSearchType
                    });
                    hideSearchIndicator();
                }, 300); // 300ms防抖延迟
            } else {
                // 如果搜索内容为空，立即搜索（清除搜索结果）
                vscode.postMessage({
                    type: 'search',
                    query: '',
                    scope: currentActiveTab,
                    searchType: currentSearchType
                });
                hideSearchIndicator();
            }
        });
        
        // 回车键立即搜索
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // 清除防抖定时器
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                const query = searchInput.value.trim();
                if (query) {
                    showSearchIndicator();
                }
                
                vscode.postMessage({
                    type: 'search',
                    query: query,
                    scope: currentActiveTab,
                    searchType: currentSearchType
                });
                
                // 延迟隐藏指示器
                setTimeout(() => {
                    hideSearchIndicator();
                }, 100);
            }
        });
        
        // 接收来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateTab':
                    switchTab(message.tab);
                    break;
                case 'clearSearch':
                    searchInput.value = '';
                    hideSearchIndicator();
                    break;
                case 'focusSearch':
                    searchInput.focus();
                    break;
            }
        });
        
        function switchTab(tab) {
            currentActiveTab = tab;
            
            // 更新按钮状态  
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(tab + 'Tab').classList.add('active');
            
            // 更新搜索提示文本
            updateSearchInfo();
        }
        
        function updateSearchInfo() {
            const scopeText = currentActiveTab === 'current' ? '当前文件' : '整个项目';
            const typeText = getSearchTypeText(currentSearchType);
            searchInfo.textContent = '在' + scopeText + '的' + typeText + '中搜索';
        }
        
        function getSearchTypeText(searchType) {
            const typeMap = {
                'all': '所有内容',
                'bookmarks': '书签',
                'todos': '待办事项',
                'pinnedSymbols': '置顶符号',
                'functions': '函数'
            };
            return typeMap[searchType] || '所有内容';
        }
        
        // 初始化搜索信息
        updateSearchInfo();
    </script>
</body>
</html>`;
    }
} 
