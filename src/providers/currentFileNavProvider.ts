import type * as vscode from 'vscode'
import type { DataAdapter } from './dataAdapter'
import type { UnifiedItem } from './unifiedListProvider'

/**
 * 智能导航面板 - 当前文件的一站式导航
 * 支持Tab切换：符号/书签/TODO
 */
export class CurrentFileNavProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'CCoding.currentFileNav'
  private _view?: vscode.WebviewView
  private searchQuery = ''
  private activeTab: 'symbols' | 'bookmarks' | 'todos' = 'symbols'

  // 各类型数据缓存
  private symbolItems: UnifiedItem[] = []
  private bookmarkItems: UnifiedItem[] = []
  private todoItems: UnifiedItem[] = []
  // private pinnedItems: UnifiedItem[] = [] // Removed

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly dataAdapter: DataAdapter,
    private onItemClicked: (item: UnifiedItem) => void,
    private onPinToggled: (item: UnifiedItem) => void,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // 监听消息
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case 'tabChanged':
            this.activeTab = message.tab
            this.updateDisplay()
            break
          case 'search':
            this.searchQuery = message.query
            this.updateDisplay()
            break
          case 'itemClicked': {
            const item = this.findItemById(this.getCurrentTabItems(), message.itemId)
            if (item) {
              this.onItemClicked(item)
            }
            break
          }
          // case 'pinToggled': { // Removed
          //   const toggleItem = this.findItemById(this.getCurrentTabItems(), message.itemId)
          //   if (toggleItem) {
          //     this.onPinToggled(toggleItem)
          //   }
          //   break
          // }
        }
      },
      undefined,
      [],
    )

    // 初始加载
    this.refresh()
  }

  /**
   * 递归查找项目
   */
  private findItemById(items: UnifiedItem[], itemId: string): UnifiedItem | undefined {
    for (const item of items) {
      if (item.id === itemId) {
        return item
      }
      if (item.children) {
        const found = this.findItemById(item.children, itemId)
        if (found)
          return found
      }
    }
    return undefined
  }

  /**
   * 获取当前激活Tab的数据
   */
  private getCurrentTabItems(): UnifiedItem[] {
    switch (this.activeTab) {
      case 'symbols': return this.symbolItems
      case 'bookmarks': return this.bookmarkItems
      case 'todos': return this.todoItems
      // case 'pinned': return this.pinnedItems // Removed
      default: return []
    }
  }

  /**
   * 刷新所有当前文件数据
   */
  public async refresh(): Promise<void> {
    console.log('[CurrentFileNavProvider] 刷新智能导航面板')

    if (!this._view) {
      return
    }

    try {
      // 移除置顶数据获取
      const [symbols, bookmarks, todos] = await Promise.all([
        this.dataAdapter.getSymbolItems(), // 当前文件符号
        this.dataAdapter.getCurrentFileBookmarks(), // 当前文件书签
        this.dataAdapter.getCurrentFileTodos(), // 当前文件TODO
        // this.dataAdapter.getCurrentFilePinned(), // Removed
      ])

      this.symbolItems = symbols
      this.bookmarkItems = bookmarks
      this.todoItems = todos
      // this.pinnedItems = pinned // Removed

      console.log(`[CurrentFileNavProvider] 数据更新完成:`, {
        symbols: this.symbolItems.length,
        bookmarks: this.bookmarkItems.length,
        todos: this.todoItems.length,
        // pinned: this.pinnedItems.length, // Removed
      })

      this.updateDisplay()
    }
    catch (error) {
      console.error('[CurrentFileNavProvider] 刷新失败:', error)
    }
  }

  /**
   * 更新显示
   */
  private updateDisplay(): void {
    if (!this._view)
      return

    // 获取当前Tab的数据
    let currentItems = this.getCurrentTabItems()

    // 应用搜索过滤
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase()
      currentItems = currentItems.filter(item =>
        item.label.toLowerCase().includes(query)
        || (item.description && item.description.toLowerCase().includes(query))
        || (item.chineseType && item.chineseType.toLowerCase().includes(query))
        || (item.bookmarkNote && item.bookmarkNote.toLowerCase().includes(query)),
      )
    }

    // 计算各Tab统计
    const stats = {
      symbols: this.symbolItems.length,
      bookmarks: this.bookmarkItems.length,
      todos: this.todoItems.length,
      // pinned: this.pinnedItems.length, // Removed
    }

    this._view.webview.postMessage({
      type: 'updateData',
      items: currentItems,
      stats,
      activeTab: this.activeTab,
      searchQuery: this.searchQuery,
    })
  }

  /**
   * 切换Tab
   */
  public switchTab(tab: 'symbols' | 'bookmarks' | 'todos'): void {
    this.activeTab = tab
    this.updateDisplay()
  }

  /**
   * 清除搜索
   */
  public clearSearch(): void {
    this.searchQuery = ''
    if (this._view) {
      this._view.webview.postMessage({ type: 'clearSearch' })
      this.updateDisplay()
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
    <title>智能导航</title>
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

        /* Tab导航区域 */
        .tab-container {
            margin-bottom: 12px;
        }

        .tab-buttons {
            display: flex;
            gap: 1px;
            margin-bottom: 8px;
            border-radius: 4px;
            overflow: hidden;
            background-color: var(--vscode-widget-border);
        }

        .tab-button {
            flex: 1;
            padding: 6px 8px;
            border: none;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 12px;
            text-align: center;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .tab-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .tab-button.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-weight: 600;
        }

        .tab-button .count {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            padding: 1px 6px;
            font-size: 10px;
            font-weight: 600;
            line-height: 1.2;
            min-width: 16px;
            text-align: center;
        }

        .tab-button.active .count {
            background-color: var(--vscode-activityBarBadge-background);
            color: var(--vscode-activityBarBadge-foreground);
        }

        /* 列表区域 */
        .items-container {
            flex: 1;
            overflow-y: auto;
        }

        /* 分组样式 */
        .group-item {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            margin-bottom: 2px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            background-color: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-widget-border);
        }

        .group-item:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .group-item .expand-icon {
            margin-right: 6px;
            font-size: 10px;
            transition: transform 0.2s;
        }

        .group-item.expanded .expand-icon {
            transform: rotate(90deg);
        }

        .group-children {
            margin-left: 16px;
            border-left: 1px solid var(--vscode-widget-border);
            padding-left: 8px;
            margin-bottom: 4px;
        }

        .group-children.collapsed {
            display: none;
        }

        .group-children .item {
            margin-left: 8px;
            padding: 3px 8px;
            margin-bottom: 1px;
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

        /* 移除置顶项样式
        .item.pinned {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        */

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

        /* 图标颜色 */
        .icon-function { color: #B180D7; }
        .icon-method { color: #B180D7; }
        .icon-class { color: #EE9D28; }
        .icon-variable { color: #75BEFF; }
        .icon-computed { color: #4CAF50; }
        .icon-reactive { color: #2196F3; }
        .icon-bookmark { color: #007ACC; }
        .icon-todo { color: #89D185; }
        .icon-fixme { color: #F14C4C; }
        .icon-note { color: #007ACC; }
        .icon-bug { color: #F14C4C; }
        .icon-hack { color: #FFCC02; }
        /* .icon-pinned { color: #FF8C00; } Removed */
    </style>
</head>
<body>
    <div class="search-container">
        <div class="search-input-wrapper">
            <input type="text" class="search-input" id="searchInput" placeholder="搜索当前文件..." />
            <button class="search-clear" id="searchClear" title="清除搜索">✕</button>
        </div>
    </div>

    <div class="tab-container">
        <div class="tab-buttons">
            <button class="tab-button active" data-tab="symbols" id="tabSymbols">
                ⚡ <span class="count" id="countSymbols">0</span>
            </button>
            <button class="tab-button" data-tab="bookmarks" id="tabBookmarks">
                📖 <span class="count" id="countBookmarks">0</span>
            </button>
            <button class="tab-button" data-tab="todos" id="tabTodos">
                ✅ <span class="count" id="countTodos">0</span>
            </button>
            <!-- 移除置顶tab按钮
            <button class="tab-button" data-tab="pinned" id="tabPinned">
                📌 <span class="count" id="countPinned">0</span>
            </button>
            -->
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
        let searchTimeout = null;
        let currentItems = [];
        let activeTab = 'symbols';

        // Tab切换
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.currentTarget.getAttribute('data-tab');

                // 更新按钮状态
                document.querySelectorAll('.tab-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.currentTarget.classList.add('active');

                activeTab = tab;
                vscode.postMessage({
                    type: 'tabChanged',
                    tab: tab
                });
            });
        });

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

        // 处理扩展消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateData':
                    updateStatsDisplay(message.stats);
                    updateItemsList(message.items);
                    activeTab = message.activeTab;
                    updateActiveTab();
                    currentItems = message.items;
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
            document.getElementById('countSymbols').textContent = stats.symbols || 0;
            document.getElementById('countBookmarks').textContent = stats.bookmarks || 0;
            document.getElementById('countTodos').textContent = stats.todos || 0;
            // document.getElementById('countPinned').textContent = stats.pinned || 0; // Removed
        }

        // 更新激活Tab
        function updateActiveTab() {
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeButton = document.querySelector(\`[data-tab="\${activeTab}"]\`);
            if (activeButton) {
                activeButton.classList.add('active');
            }
        }

        // 更新项目列表
        function updateItemsList(items) {
            if (!items || items.length === 0) {
                itemsContainer.innerHTML = getEmptyMessage();
                return;
            }

            const htmlContent = items.map(item => createItemHtml(item)).join('');
            itemsContainer.innerHTML = htmlContent;

            // 绑定事件
            bindItemEvents();
        }

        // 获取空状态消息
        function getEmptyMessage() {
            const messages = {
                symbols: '当前文件没有符号',
                bookmarks: '当前文件没有书签',
                todos: '当前文件没有待办事项',
                pinned: '当前文件没有置顶符号'
            };
            return \`<div class="empty-message">\${messages[activeTab] || '没有数据'}</div>\`;
        }

        // 绑定项目事件
        function bindItemEvents() {
          // 绑定分组展开/折叠事件
          const groupItems = itemsContainer.querySelectorAll('.group-item')
          groupItems.forEach((groupEl) => {
            const groupId = groupEl.getAttribute('data-group-id')
            groupEl.addEventListener('click', (e) => {
              e.stopPropagation()
              toggleGroup(groupId)
            })
          })

          // 绑定所有项目点击事件（包括嵌套的子项）
          const allItems = itemsContainer.querySelectorAll('[data-item-id]')
          allItems.forEach((itemEl) => {
            // 只绑定非分组项
            if (!itemEl.classList.contains('group-item')) {
              const itemId = itemEl.getAttribute('data-item-id')
              itemEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('action-button'))
                  return
                e.stopPropagation() // 防止事件冒泡到父元素
                vscode.postMessage({
                  type: 'itemClicked',
                  itemId,
                })
              })

              const pinButton = itemEl.querySelector('.pin-button')
              if (pinButton) {
                pinButton.addEventListener('click', (e) => {
                  e.stopPropagation()
                  vscode.postMessage({
                    type: 'pinToggled',
                    itemId,
                  })
                })
              }
            }
          })
        }

        // 切换分组展开/折叠状态
        function toggleGroup(groupId) {
            const groupElement = document.querySelector(\`[data-group-id="\${groupId}"]\`);
            const childrenElement = document.querySelector(\`[data-group-children="\${groupId}"]\`);

            if (groupElement && childrenElement) {
                const isExpanded = !childrenElement.classList.contains('collapsed');

                if (isExpanded) {
                    // 折叠
                    childrenElement.classList.add('collapsed');
                    groupElement.classList.remove('expanded');
                } else {
                    // 展开
                    childrenElement.classList.remove('collapsed');
                    groupElement.classList.add('expanded');
                }
            }
        }

        // 创建项目HTML
        function createItemHtml(item) {
            // 如果是分组项目
            if (item.isGroup && item.children) {
                return createGroupHtml(item);
            }

            // 普通项目
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
                            \${getItemDescription(item)}
                        </div>
                    </div>
                    <div class="item-actions">
                        \${pinButton}
                    </div>
                </div>
            \`;
        }

        // 获取项目描述
        function getItemDescription(item) {
            let desc = '';
            if (item.chineseType) {
                desc = item.chineseType;
            } else if (item.description) {
                desc = item.description;
            } else if (item.type === 'todo' && item.todoType) {
                desc = item.todoType;
            }

            if (item.location) {
                desc += \` · L:\${item.location.line + 1}\`;
            }

            return desc;
        }

        // 创建分组HTML
        function createGroupHtml(group) {
          const groupId = group.id
          const isExpanded = group.isExpanded !== false
          const childrenHtml = group.children ? group.children.map(child =>
            createItemHtml(child) // 直接使用，不要额外包装
          ).join('') : ''

          return \`
                <div class="group-item \${isExpanded ? 'expanded' : ''}" data-group-id="\${groupId}">
                    <span class="expand-icon">▶</span>
                    <div class="item-icon">
                        \${getGroupIconSymbol(group.groupName)}
                    </div>
                    <div class="item-content">
                        <div class="item-label">\${escapeHtml(group.label)}</div>
                        <div class="item-description">\${group.description || ''}</div>
                    </div>
                </div>
                <div class="group-children \${isExpanded ? '' : 'collapsed'}" data-group-children="\${groupId}">
                    \${childrenHtml}
                </div>
            \`
        }

        // 获取分组图标符号
        function getGroupIconSymbol(groupName) {
            const iconMap = {
                '🎨 模板结构': '🎨',
                '🏛️ 类定义': '🏛️',
                '⚡ 函数方法': '⚡',
                '📊 变量常量': '📊',
                '🔧 其他': '🔧',
                '📦 响应式数据': '📦',
                '⚙️ 计算属性': '⚙️',
                '⚡ 方法函数': '⚡',
                '📨 组件属性': '📨',
                '🔄 生命周期': '🔄',
                '🔧 Setup函数': '🔧',
                '🪝 React Hooks': '🪝',
                '⚡ 事件处理': '⚡',
                '📋 组件属性': '📋',
            };
            return iconMap[groupName] || '📁';
        }

        // 获取图标类名
        function getIconClass(item) {
            if (item.isPinned) return 'icon-pinned';

            switch (item.type) {
                case 'symbol':
                    if (item.chineseType) {
                        if (item.chineseType.includes('计算属性')) return 'icon-computed';
                        if (item.chineseType.includes('响应式')) return 'icon-reactive';
                    }
                    if (item.symbolKind === 12) return 'icon-function'; // Function
                    if (item.symbolKind === 6) return 'icon-method';   // Method
                    if (item.symbolKind === 5) return 'icon-class';    // Class
                    if (item.symbolKind === 13) return 'icon-variable'; // Variable
                    break;
                case 'bookmark':
                    return 'icon-bookmark';
                case 'todo':
                    return \`icon-\${(item.todoType || 'todo').toLowerCase()}\`;
                default:
                    return '';
            }
            return '';
        }

        // 获取图标符号
        function getIconSymbol(item) {
            if (item.isPinned) return '📌';

            switch (item.type) {
                case 'symbol':
                    if (item.chineseType) {
                        if (item.chineseType.includes('计算属性')) return '⚙️';
                        if (item.chineseType.includes('响应式')) return '📦';
                        if (item.chineseType.includes('方法') || item.chineseType.includes('函数')) return '⚡';
                    }
                    if (item.symbolKind === 12) return '⚡'; // Function
                    if (item.symbolKind === 6) return '⚡';  // Method
                    if (item.symbolKind === 5) return '🏛️'; // Class
                    if (item.symbolKind === 13) return '📦'; // Variable
                    return '○';
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
