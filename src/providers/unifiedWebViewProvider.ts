import type * as vscode from 'vscode'
import type { FilterType, UnifiedItem } from './unifiedListProvider'

/**
 * 统一WebView Provider - 整合搜索、筛选和列表显示
 */
export class UnifiedWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'CCoding.unifiedView'
  private _view?: vscode.WebviewView
  private currentFilter: FilterType = 'all'
  private stats = { total: 0, symbols: 0, bookmarks: 0, todos: 0, pinned: 0 }
  private items: UnifiedItem[] = []
  private searchQuery = ''

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private onFilterChanged: (filter: FilterType) => void,
    private onSearchPerformed: (query: string) => void,
    private onItemClicked: (item: UnifiedItem) => void,
    private onPinToggled: (item: UnifiedItem) => void,
    private onDataRequested?: () => void,
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

    // WebView初始化后立即请求数据
    if (this.onDataRequested) {
      // 稍微延迟确保WebView完全加载
      setTimeout(() => {
        console.log('[UnifiedWebViewProvider] 请求初始数据')
        this.onDataRequested?.()
      }, 200)
    }

    // 如果已经有数据，立即更新显示
    if (this.items.length > 0) {
      console.log('[UnifiedWebViewProvider] 已有数据，立即更新显示')
      setTimeout(() => {
        this._updateDisplay()
      }, 100)
    }

    // 处理来自webview的消息
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case 'filterChanged':
            this.currentFilter = message.filter
            this.onFilterChanged(message.filter)
            this._updateDisplay()
            break
          case 'search':
            this.searchQuery = message.query
            this.onSearchPerformed(message.query)
            this._updateDisplay()
            break
          case 'itemClicked': {
            const item = this.items.find(i => i.id === message.itemId)
            if (item) {
              this.onItemClicked(item)
            }
            break
          }
          case 'pinToggled': {
            const toggleItem = this.items.find(i => i.id === message.itemId)
            if (toggleItem) {
              this.onPinToggled(toggleItem)
            }
            break
          }
        }
      },
      undefined,
      [],
    )
  }

  /**
   * 更新统计信息和项目列表
   */
  public updateData(items: UnifiedItem[], stats: { [key: string]: number }): void {
    console.log('[UnifiedWebViewProvider] updateData called with', items.length, 'items')
    this.items = items
    this.stats = {
      total: stats.total || 0,
      symbols: stats.symbols || 0,
      bookmarks: stats.bookmarks || 0,
      todos: stats.todos || 0,
      pinned: stats.pinned || 0,
    }

    // 如果WebView还没准备好，延迟更新
    if (!this._view) {
      console.log('[UnifiedWebViewProvider] WebView not ready, will update when ready')
      return
    }

    this._updateDisplay()
  }

  /**
   * 清除搜索
   */
  public clearSearch(): void {
    this.searchQuery = ''
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

  private _updateDisplay(): void {
    console.log('[UnifiedWebViewProvider] _updateDisplay called')
    if (!this._view) {
      console.log('[UnifiedWebViewProvider] View not ready, skipping update')
      return
    }

    console.log('[UnifiedWebViewProvider] Raw items count:', this.items.length)
    console.log('[UnifiedWebViewProvider] Current filter:', this.currentFilter)
    console.log('[UnifiedWebViewProvider] Search query:', this.searchQuery)

    // 应用搜索和筛选
    let filteredItems = [...this.items]

    // 应用搜索过滤
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase()
      filteredItems = filteredItems.filter(item =>
        item.label.toLowerCase().includes(query)
        || (item.description && item.description.toLowerCase().includes(query))
        || (item.bookmarkNote && item.bookmarkNote.toLowerCase().includes(query)),
      )
    }

    // 应用类型过滤
    if (this.currentFilter !== 'all') {
      filteredItems = filteredItems.filter(item =>
        item.type === this.currentFilter || (this.currentFilter === 'pinned' && item.isPinned),
      )
    }

    // 排序：置顶项在前，然后按行号排序
    filteredItems.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1
      }
      return a.location.line - b.location.line
    })

    console.log('[UnifiedWebViewProvider] Filtered items count:', filteredItems.length)
    console.log('[UnifiedWebViewProvider] Sending updateData message to WebView')

    this._view.webview.postMessage({
      type: 'updateData',
      stats: this.stats,
      items: filteredItems,
      currentFilter: this.currentFilter,
      searchQuery: this.searchQuery,
    })
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCoding 代码导航</title>
    <style>
        body {
            padding: 8px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            box-sizing: border-box;
            overflow-x: hidden;
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
            margin-bottom: 12px;
        }
        
        .filter-buttons {
            display: flex;
            gap: 2px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }
        
        .filter-button {
            flex: 1;
            min-width: 0;
            padding: 4px 6px;
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
        }
        
        .filter-button.active .count {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-weight: 700;
        }
        
        /* 列表区域 */
        .items-container {
            flex: 1;
            overflow-y: auto;
        }
        
        .item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            margin-bottom: 1px;
            border-radius: 3px;
            cursor: pointer;
            transition: background-color 0.2s;
            min-height: 22px;
        }
        
        .item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .item.pinned {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        
        .item-icon {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
            margin-right: 6px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .item-content {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 1px;
        }
        
        .item-label {
            font-size: 13px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .item-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .item-actions {
            flex-shrink: 0;
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .item:hover .item-actions {
            opacity: 1;
        }
        
        .action-button {
            padding: 2px 4px;
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
            line-height: 1;
        }
        
        .action-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        
        .empty-message {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
            font-size: 13px;
        }
        
        /* 图标样式 */
        .icon-symbol-method { color: #B180D7; }
        .icon-symbol-class { color: #EE9D28; }
        .icon-symbol-variable { color: #75BEFF; }
        .icon-bookmark { color: #007ACC; }
        .icon-todo { color: #89D185; }
        .icon-fixme { color: #F14C4C; }
        .icon-note { color: #007ACC; }
        .icon-bug { color: #F14C4C; }
        .icon-hack { color: #FFCC02; }
        .icon-pinned { color: #FF8C00; }
        
        /* 置顶指示器 */
        .pinned-indicator {
            color: var(--vscode-charts-orange);
            font-size: 10px;
            margin-right: 2px;
        }
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
            <button class="filter-button" data-filter="pinned" id="filterPinned">
                <span class="pinned-indicator">📌</span> <span class="count" id="countPinned">0</span>
            </button>
        </div>
    </div>
    
    <div class="items-container" id="itemsContainer">
        <div class="empty-message">正在加载...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // 元素引用
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        const itemsContainer = document.getElementById('itemsContainer');
        
        // 状态
        let currentFilter = 'all';
        let searchTimeout = null;
        let currentItems = [];
        
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
            console.log('[WebView] Received message:', event.data);
            const message = event.data;
            switch (message.type) {
                case 'updateData':
                    console.log('[WebView] Processing updateData, items count:', message.items?.length);
                    console.log('[WebView] Stats:', message.stats);
                    updateStatsDisplay(message.stats);
                    updateItemsList(message.items);
                    currentItems = message.items;
                    break;
                case 'clearSearch':
                    console.log('[WebView] Clearing search');
                    searchInput.value = '';
                    searchClear.classList.remove('show');
                    break;
                case 'focusSearch':
                    console.log('[WebView] Focusing search');
                    searchInput.focus();
                    break;
                default:
                    console.log('[WebView] Unknown message type:', message.type);
            }
        });
        
        // 更新统计显示
        function updateStatsDisplay(stats) {
            document.getElementById('countAll').textContent = stats.total || 0;
            document.getElementById('countSymbols').textContent = stats.symbols || 0;
            document.getElementById('countBookmarks').textContent = stats.bookmarks || 0;
            document.getElementById('countTodos').textContent = stats.todos || 0;
            document.getElementById('countPinned').textContent = stats.pinned || 0;
            
            // 更新筛选按钮状态
            const buttons = {
                'symbol': { element: document.getElementById('filterSymbol'), count: stats.symbols || 0 },
                'bookmark': { element: document.getElementById('filterBookmark'), count: stats.bookmarks || 0 },
                'todo': { element: document.getElementById('filterTodo'), count: stats.todos || 0 },
                'pinned': { element: document.getElementById('filterPinned'), count: stats.pinned || 0 }
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
        
        // 更新项目列表
        function updateItemsList(items) {
            console.log('[WebView] updateItemsList called with:', items);
            console.log('[WebView] Items length:', items?.length);
            
            if (!items || items.length === 0) {
                console.log('[WebView] No items, showing empty message');
                itemsContainer.innerHTML = '<div class="empty-message">没有找到匹配的项目</div>';
                return;
            }
            
            console.log('[WebView] Creating HTML for', items.length, 'items');
            try {
                const htmlContent = items.map(item => {
                    console.log('[WebView] Processing item:', item.label, 'type:', item.type);
                    return createItemHtml(item);
                }).join('');
                
                console.log('[WebView] Setting innerHTML');
                itemsContainer.innerHTML = htmlContent;
                console.log('[WebView] HTML content set successfully');
                
                // 绑定点击事件
                const itemElements = itemsContainer.querySelectorAll('.item');
                console.log('[WebView] Found', itemElements.length, 'item elements for event binding');
                
                itemElements.forEach(itemEl => {
                    const itemId = itemEl.getAttribute('data-item-id');
                    
                    itemEl.addEventListener('click', (e) => {
                        if (e.target.classList.contains('action-button')) return;
                        console.log('[WebView] Item clicked:', itemId);
                        vscode.postMessage({
                            type: 'itemClicked',
                            itemId: itemId
                        });
                    });
                    
                    const pinButton = itemEl.querySelector('.pin-button');
                    if (pinButton) {
                        pinButton.addEventListener('click', (e) => {
                            e.stopPropagation();
                            console.log('[WebView] Pin button clicked:', itemId);
                            vscode.postMessage({
                                type: 'pinToggled',
                                itemId: itemId
                            });
                        });
                    }
                });
                
                console.log('[WebView] Event binding completed');
            } catch (error) {
                console.error('[WebView] Error in updateItemsList:', error);
                itemsContainer.innerHTML = '<div class="empty-message">显示项目时出错</div>';
            }
        }
        
        // 创建项目HTML
        function createItemHtml(item) {
            const iconClass = getIconClass(item);
            const pinButton = item.isPinned ? 
                '<button class="action-button pin-button" title="取消置顶">📌</button>' :
                '<button class="action-button pin-button" title="置顶">📌</button>';
            
            return \`
                <div class="item \${item.isPinned ? 'pinned' : ''}" data-item-id="\${item.id}">
                    <div class="item-icon \${iconClass}">
                        \${getIconSymbol(item)}
                    </div>
                    <div class="item-content">
                        <div class="item-label">\${escapeHtml(item.label)}</div>
                        <div class="item-description">
                            \${item.description ? escapeHtml(item.description) : ''} · L:\${item.location.line + 1}
                        </div>
                    </div>
                    <div class="item-actions">
                        \${pinButton}
                    </div>
                </div>
            \`;
        }
        
        // 获取图标类名
        function getIconClass(item) {
            if (item.isPinned) return 'icon-pinned';
            
            switch (item.type) {
                case 'symbol':
                    // symbolKind 是数字，需要转换为字符串
                    const symbolKindStr = getSymbolKindString(item.symbolKind);
                    return \`icon-symbol-\${symbolKindStr.toLowerCase()}\`;
                case 'bookmark':
                    return 'icon-bookmark';
                case 'todo':
                    return \`icon-\${(item.todoType || 'todo').toLowerCase()}\`;
                default:
                    return '';
            }
        }
        
        // 将 VSCode SymbolKind 数字转换为字符串
        function getSymbolKindString(symbolKind) {
            const kindMap = {
                1: 'file',
                2: 'module', 
                3: 'namespace',
                4: 'package',
                5: 'class',
                6: 'method',
                7: 'property',
                8: 'field',
                9: 'constructor',
                10: 'enum',
                11: 'interface',
                12: 'function',
                13: 'variable',
                14: 'constant',
                15: 'string',
                16: 'number',
                17: 'boolean',
                18: 'array',
                19: 'object',
                20: 'key',
                21: 'null',
                22: 'enumMember',
                23: 'struct',
                24: 'event',
                25: 'operator',
                26: 'typeParameter'
            };
            return kindMap[symbolKind] || 'misc';
        }
        
        // 获取图标符号
        function getIconSymbol(item) {
            if (item.isPinned) return '📌';
            
            switch (item.type) {
                case 'symbol':
                    const kindMap = {
                        'function': '⚡',
                        'method': '⚡',
                        'class': '🏛️',
                        'variable': '📦',
                        'constant': '🔒',
                        'interface': '🔌'
                    };
                    // 使用 getSymbolKindString 函数获取字符串形式的 symbolKind
                    const symbolKindStr = getSymbolKindString(item.symbolKind);
                    return kindMap[symbolKindStr.toLowerCase()] || '○';
                case 'bookmark':
                    return '🔖';
                case 'todo':
                    const todoMap = {
                        'TODO': '✅',
                        'FIXME': '⚠️',
                        'NOTE': '📝',
                        'BUG': '🐛',
                        'HACK': '🔧'
                    };
                    return todoMap[item.todoType || 'TODO'] || '✅';
                default:
                    return '○';
            }
        }
        
        // HTML转义
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`
  }
}
