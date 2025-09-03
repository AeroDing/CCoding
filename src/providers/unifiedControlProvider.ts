import type * as vscode from 'vscode'
import type { FilterType } from './unifiedListProvider.js'

/**
 * 统一控制面板Provider - 管理搜索和筛选功能
 */
export class UnifiedControlProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'CCoding.unifiedControl'
  private _view?: vscode.WebviewView
  private currentFilter: FilterType = 'all'
  private stats = { total: 0, symbols: 0, bookmarks: 0, todos: 0 } // Removed pinned

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private onFilterChanged: (filter: FilterType) => void,
    private onSearchPerformed: (query: string) => void,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
      ],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // 处理来自webview的消息
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case 'filterChanged':
            this.currentFilter = message.filter
            this.onFilterChanged(message.filter)
            this.updateStats()
            break
          case 'sortChanged':
            this.currentSort = message.sort
            this.onSortChanged(message.sort)
            break
          case 'search':
            this.onSearchPerformed(message.query)
            break
        }
      },
      undefined,
      [],
    )
  }

  /**
   * 更新统计信息
   */
  public updateStats(stats: { [key: string]: number }): void {
    this.stats = {
      total: stats.total || 0,
      symbols: stats.symbols || 0,
      bookmarks: stats.bookmarks || 0,
      todos: stats.todos || 0,
      // pinned: 0, // Removed
    }

    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateStats',
        stats: this.stats,
      })
    }
  }

  /**
   * 清除搜索
   */
  public clearSearch(): void {
    if (this._view) {
      this._view.webview.postMessage({ type: 'clearSearch' })
    }
  }

  /**
   * 聚焦搜索框
   */
  public focusSearch(): void {
    if (this._view) {
      this._view.webview.postMessage({ type: 'focusSearch' })
    }
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCoding 统一控制面板</title>
    <style>
        body {
            padding: 6px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            min-height: 60px;
            box-sizing: border-box;
        }
        
        /* 搜索区域 */
        .search-container {
            margin-bottom: 8px;
        }
        
        .search-input-wrapper {
            position: relative;
            display: flex;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            overflow: hidden;
            background-color: var(--vscode-input-background);
            transition: border-color 0.2s;
        }
        
        .search-input-wrapper:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        
        .search-input {
            flex: 1;
            padding: 6px 8px;
            border: none;
            background-color: transparent;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            outline: none;
        }
        
        .search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        
        .search-clear {
            padding: 4px 6px;
            border: none;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            display: none;
            font-size: 16px;
            line-height: 1;
        }
        
        .search-clear:hover {
            color: var(--vscode-foreground);
        }
        
        .search-clear.show {
            display: block;
        }
        
        /* 筛选按钮区域 */
        .filter-container {
            margin-bottom: 6px;
        }
        
        .filter-buttons {
            display: flex;
            gap: 2px;
            margin-bottom: 6px;
            flex-wrap: wrap;
        }
        
        .filter-button {
            flex: 1;
            min-width: 0;
            padding: 3px 5px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            border-radius: 3px;
            font-size: 11px;
            text-align: center;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
            overflow: hidden;
            white-space: nowrap;
        }
        
        .filter-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .filter-button.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .filter-button .count {
            background-color: var(--vscode-activityBarBadge-background);
            color: var(--vscode-activityBarBadge-foreground);
            border-radius: 10px;
            padding: 1px 5px;
            font-size: 10px;
            font-weight: 600;
            line-height: 1.2;
            min-width: 18px;
            text-align: center;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        .filter-button.active .count {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-weight: 700;
        }
        
        /* 响应式布局 */
        @media (max-width: 250px) {
            .filter-buttons {
                flex-direction: column;
            }
            
            .filter-button {
                flex: none;
            }
        }
        
        /* 移除置顶项标识
        .pinned-indicator {
            color: var(--vscode-charts-orange);
            font-size: 10px;
        }
        */
    </style>
</head>
<body>
    <div class="search-container">
        <div class="search-input-wrapper">
            <input type="text" class="search-input" id="searchInput" placeholder="搜索所有内容..." />
            <button class="search-clear" id="searchClear" title="清除搜索">✕</button>
        </div>
    </div>
    
    <div class="filter-container">
        <div class="filter-buttons">
            <button class="filter-button active" data-filter="all" id="filterAll">
                全部 <span class="count" id="countAll">0</span>
            </button>
            <button class="filter-button" data-filter="symbol" id="filterSymbol">
                符号 <span class="count" id="countSymbols">0</span>
            </button>
            <button class="filter-button" data-filter="bookmark" id="filterBookmark">
                书签 <span class="count" id="countBookmarks">0</span>
            </button>
            <button class="filter-button" data-filter="todo" id="filterTodo">
                待办 <span class="count" id="countTodos">0</span>
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // 元素引用
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        
        // 状态
        let currentFilter = 'all';
        let searchTimeout = null;
        
        // 搜索功能
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // 显示/隐藏清除按钮
            if (query) {
                searchClear.classList.add('show');
            } else {
                searchClear.classList.remove('show');
            }
            
            // 防抖搜索
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            searchTimeout = setTimeout(() => {
                vscode.postMessage({
                    type: 'search',
                    query: query
                });
            }, 300);
        });
        
        // 清除搜索
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.classList.remove('show');
            vscode.postMessage({
                type: 'search',
                query: ''
            });
        });
        
        // 筛选按钮
        document.querySelectorAll('.filter-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const filter = e.currentTarget.getAttribute('data-filter');
                
                // 更新按钮状态
                document.querySelectorAll('.filter-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.currentTarget.classList.add('active');
                
                currentFilter = filter;
                vscode.postMessage({
                    type: 'filterChanged',
                    filter: filter
                });
            });
        });
        
        // 处理扩展消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateStats':
                    updateStatsDisplay(message.stats);
                    break;
                case 'clearSearch':
                    searchInput.value = '';
                    searchClear.classList.remove('show');
                    break;
                case 'focusSearch':
                    searchInput.focus();
                    break;
            }
        });
        
        // 更新统计显示
        function updateStatsDisplay(stats) {
            // 更新计数
            document.getElementById('countAll').textContent = stats.total || 0;
            document.getElementById('countSymbols').textContent = stats.symbols || 0;
            document.getElementById('countBookmarks').textContent = stats.bookmarks || 0;
            document.getElementById('countTodos').textContent = stats.todos || 0;
            // document.getElementById('countPinned').textContent = stats.pinned || 0; // Removed
            
            // 更新筛选按钮状态
            updateFilterButtonStates(stats);
        }
        
        // 更新筛选按钮状态
        function updateFilterButtonStates(stats) {
            const buttons = {
                'symbol': { element: document.getElementById('filterSymbol'), count: stats.symbols || 0 },
                'bookmark': { element: document.getElementById('filterBookmark'), count: stats.bookmarks || 0 },
                'todo': { element: document.getElementById('filterTodo'), count: stats.todos || 0 },
                // 'pinned': { element: document.getElementById('filterPinned'), count: stats.pinned || 0 } // Removed
            };
            
            Object.keys(buttons).forEach(type => {
                const { element, count } = buttons[type];
                if (count === 0) {
                    element.style.opacity = '0.6';
                } else {
                    element.style.opacity = '1';
                }
            });
        }
        
        // 初始化
        vscode.postMessage({
            type: 'filterChanged',
            filter: currentFilter
        });
    </script>
</body>
</html>`
  }
}
