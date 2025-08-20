import type { HotkeyManager } from '../services/hotkeyManager'
import { Buffer } from 'node:buffer'
import * as vscode from 'vscode'

/**
 * 快捷键帮助提供器
 * 显示所有可用的快捷键和帮助信息
 */
export class HotkeyHelpProvider implements vscode.TreeDataProvider<HotkeyHelpItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HotkeyHelpItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private hotkeyManager?: HotkeyManager
  private categories: HotkeyCategory[] = []

  constructor() {
    this.initializeCategories()
  }

  /**
   * 设置快捷键管理器
   */
  setHotkeyManager(hotkeyManager: HotkeyManager): void {
    this.hotkeyManager = hotkeyManager
    this.refresh()
  }

  /**
   * 初始化分类
   */
  private initializeCategories(): void {
    this.categories = [
      {
        id: 'global',
        name: '🌍 全局快捷键',
        description: '随时可用的全局快捷键',
        expanded: true,
        items: [
          {
            id: 'showQuickAccess',
            name: '显示快速访问',
            hotkey: 'Ctrl+Shift+Q',
            description: '打开快速访问面板，快速导航到符号、书签和文件',
            command: 'CCoding.showQuickAccess',
            category: 'global',
          },
          {
            id: 'showFloatingToolbar',
            name: '显示悬浮工具栏',
            hotkey: 'Ctrl+Shift+F',
            description: '显示悬浮的快速访问工具栏',
            command: 'CCoding.showFloatingToolbar',
            category: 'global',
          },
          {
            id: 'togglePanel',
            name: '切换面板',
            hotkey: 'Ctrl+Shift+P',
            description: '显示或隐藏 CCoding 侧边栏面板',
            command: 'CCoding.togglePanel',
            category: 'global',
          },
        ],
      },
      {
        id: 'navigation',
        name: '🔄 导航快捷键',
        description: '在面板和列表中导航',
        expanded: true,
        items: [
          {
            id: 'nextItem',
            name: '下一项',
            hotkey: '↓',
            description: '在列表中选择下一项',
            command: 'CCoding.nextItem',
            category: 'navigation',
          },
          {
            id: 'prevItem',
            name: '上一项',
            hotkey: '↑',
            description: '在列表中选择上一项',
            command: 'CCoding.prevItem',
            category: 'navigation',
          },
          {
            id: 'firstItem',
            name: '第一项',
            hotkey: 'Home',
            description: '跳转到列表第一项',
            command: 'CCoding.firstItem',
            category: 'navigation',
          },
          {
            id: 'lastItem',
            name: '最后一项',
            hotkey: 'End',
            description: '跳转到列表最后一项',
            command: 'CCoding.lastItem',
            category: 'navigation',
          },
        ],
      },
      {
        id: 'search',
        name: '🔍 搜索快捷键',
        description: '搜索和过滤功能',
        expanded: true,
        items: [
          {
            id: 'focusSearch',
            name: '聚焦搜索',
            hotkey: 'Ctrl+F',
            description: '将焦点移到搜索框',
            command: 'CCoding.focusSearch',
            category: 'search',
          },
          {
            id: 'clearSearch',
            name: '清除搜索',
            hotkey: 'Esc',
            description: '清除搜索内容并返回',
            command: 'CCoding.clearSearch',
            category: 'search',
          },
        ],
      },
      {
        id: 'filters',
        name: '🔎 过滤器快捷键',
        description: '快速切换过滤器',
        expanded: false,
        items: [
          {
            id: 'showAll',
            name: '显示全部',
            hotkey: 'Ctrl+1',
            description: '显示所有类型的项目',
            command: 'CCoding.showAll',
            category: 'filters',
          },
          {
            id: 'showSymbols',
            name: '显示符号',
            hotkey: 'Ctrl+2',
            description: '只显示符号和置顶符号',
            command: 'CCoding.showSymbols',
            category: 'filters',
          },
          {
            id: 'showBookmarks',
            name: '显示书签',
            hotkey: 'Ctrl+3',
            description: '只显示书签',
            command: 'CCoding.showBookmarks',
            category: 'filters',
          },
          {
            id: 'showFiles',
            name: '显示文件',
            hotkey: 'Ctrl+4',
            description: '只显示最近文件',
            command: 'CCoding.showFiles',
            category: 'filters',
          },
        ],
      },
      {
        id: 'numberKeys',
        name: '🔢 数字键快速访问',
        description: '使用数字键 1-9 快速访问常用项目',
        expanded: true,
        items: [
          {
            id: 'numberKey1',
            name: '快速访问 1',
            hotkey: '1',
            description: '访问第1个快速访问项目',
            command: 'CCoding.numberKey1',
            category: 'numberKeys',
          },
          {
            id: 'numberKey2',
            name: '快速访问 2',
            hotkey: '2',
            description: '访问第2个快速访问项目',
            command: 'CCoding.numberKey2',
            category: 'numberKeys',
          },
          {
            id: 'numberKey3',
            name: '快速访问 3',
            hotkey: '3',
            description: '访问第3个快速访问项目',
            command: 'CCoding.numberKey3',
            category: 'numberKeys',
          },
          {
            id: 'numberKeysInfo',
            name: '数字键说明',
            hotkey: '1-9',
            description: '数字键 1-9 会动态映射到最常用的置顶符号和书签',
            command: '',
            category: 'numberKeys',
          },
        ],
      },
      {
        id: 'functions',
        name: '⚡ 功能快捷键',
        description: '执行特定功能的快捷键',
        expanded: false,
        items: [
          {
            id: 'addBookmark',
            name: '添加书签',
            hotkey: 'Ctrl+Shift+B',
            description: '在当前光标位置添加书签',
            command: 'CCoding.addBookmarkHotkey',
            category: 'functions',
          },
          {
            id: 'pinSymbol',
            name: '置顶符号',
            hotkey: 'Ctrl+Shift+Enter',
            description: '置顶当前光标位置的符号',
            command: 'CCoding.pinSymbolHotkey',
            category: 'functions',
          },
          {
            id: 'unpinSymbol',
            name: '取消置顶',
            hotkey: 'Ctrl+Shift+Delete',
            description: '取消置顶当前位置的符号',
            command: 'CCoding.unpinSymbolHotkey',
            category: 'functions',
          },
          {
            id: 'toggleFavorite',
            name: '切换收藏',
            hotkey: 'Ctrl+Shift+S',
            description: '切换当前项目的收藏状态',
            command: 'CCoding.toggleFavorite',
            category: 'functions',
          },
        ],
      },
      {
        id: 'panel',
        name: '📋 面板控制',
        description: '控制面板显示和布局',
        expanded: false,
        items: [
          {
            id: 'togglePreview',
            name: '切换预览',
            hotkey: 'Ctrl+Shift+V',
            description: '显示或隐藏代码预览面板',
            command: 'CCoding.togglePreview',
            category: 'panel',
          },
          {
            id: 'toggleGrouping',
            name: '切换分组',
            hotkey: 'Ctrl+Shift+G',
            description: '启用或禁用项目分组显示',
            command: 'CCoding.toggleGrouping',
            category: 'panel',
          },
          {
            id: 'cycleLayout',
            name: '切换布局',
            hotkey: 'Ctrl+Shift+L',
            description: '在不同的布局模式间切换',
            command: 'CCoding.cycleLayout',
            category: 'panel',
          },
        ],
      },
    ]
  }

  /**
   * 刷新数据
   */
  refresh(): void {
    // 如果有快捷键管理器，更新实际的快捷键配置
    if (this.hotkeyManager) {
      this.updateHotkeysFromConfig()
    }
    this._onDidChangeTreeData.fire(undefined)
  }

  /**
   * 从配置更新快捷键
   */
  private updateHotkeysFromConfig(): void {
    if (!this.hotkeyManager)
      return

    const help = this.hotkeyManager.getHotkeyHelp()
    const hotkeyMap = new Map(help.map(item => [item.action, item.hotkey]))

    // 更新快捷键显示
    for (const category of this.categories) {
      for (const item of category.items) {
        const configHotkey = hotkeyMap.get(item.id)
        if (configHotkey) {
          item.hotkey = configHotkey
        }
      }
    }
  }

  /**
   * 获取树项
   */
  getTreeItem(element: HotkeyHelpItem): vscode.TreeItem {
    if (element.type === 'category') {
      const category = element as any as HotkeyCategory
      const item = new vscode.TreeItem(
        category.name,
        category.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
      )
      item.tooltip = category.description
      item.contextValue = 'hotkeyCategory'
      return item
    }
    else {
      const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None)
      item.description = element.hotkey
      item.tooltip = new vscode.MarkdownString(`**${element.name}**\n\n${element.description}\n\n快捷键: \`${element.hotkey}\``)
      item.contextValue = 'hotkeyItem'

      if (element.command) {
        item.command = {
          command: element.command,
          title: element.name,
        }
      }

      // 根据分类设置图标
      item.iconPath = this.getIconForCategory(element.category)

      return item
    }
  }

  /**
   * 获取子项
   */
  getChildren(element?: HotkeyHelpItem): Thenable<HotkeyHelpItem[]> {
    if (!element) {
      // 返回分类
      return Promise.resolve(this.categories.map(cat => ({
        ...cat,
        type: 'category',
      } as any)))
    }

    if (element.type === 'category') {
      const category = element as any as HotkeyCategory
      return Promise.resolve(category.items)
    }

    return Promise.resolve([])
  }

  /**
   * 获取分类图标
   */
  private getIconForCategory(category: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      global: 'globe',
      navigation: 'arrow-both',
      search: 'search',
      filters: 'filter',
      numberKeys: 'symbol-numeric',
      functions: 'zap',
      panel: 'layout',
    }

    return new vscode.ThemeIcon(iconMap[category] || 'circle')
  }

  /**
   * 显示快捷键配置面板
   */
  async showConfigurationPanel(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'ccodingHotkeyConfig',
      'CCoding 快捷键配置',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    panel.webview.html = this.generateConfigurationHTML()

    // 处理来自 webview 的消息
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'updateHotkey':
          await this.updateHotkeyConfiguration(message.key, message.value)
          break
        case 'resetToDefaults':
          await this.resetHotkeyConfiguration()
          break
        case 'exportConfiguration':
          await this.exportHotkeyConfiguration()
          break
      }
    })
  }

  /**
   * 生成配置 HTML
   */
  private generateConfigurationHTML(): string {
    const categories = this.categories.map(cat => `
      <div class="category">
        <h3>${cat.name}</h3>
        <p class="description">${cat.description}</p>
        <div class="items">
          ${cat.items.map(item => `
            <div class="hotkey-item">
              <label for="${item.id}">${item.name}</label>
              <input type="text" id="${item.id}" value="${item.hotkey}" placeholder="输入快捷键">
              <span class="description">${item.description}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCoding 快捷键配置</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
        }
        
        .header {
            margin-bottom: 30px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
        }
        
        .category {
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-editor-widget-background);
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .category h3 {
            margin: 0 0 10px 0;
            color: var(--vscode-textLink-foreground);
        }
        
        .category .description {
            margin: 0 0 20px 0;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        
        .hotkey-item {
            display: grid;
            grid-template-columns: 200px 150px 1fr;
            gap: 15px;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            background: var(--vscode-input-background);
            border-radius: 4px;
        }
        
        .hotkey-item label {
            font-weight: 500;
        }
        
        .hotkey-item input {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            padding: 6px 10px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .hotkey-item .description {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
        }
        
        .actions {
            margin-top: 30px;
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            margin: 0 10px;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 CCoding 快捷键配置</h1>
        <p>自定义您的快捷键设置，提升开发效率。修改后会自动保存。</p>
    </div>
    
    ${categories}
    
    <div class="actions">
        <button onclick="resetToDefaults()">恢复默认设置</button>
        <button onclick="exportConfiguration()" class="secondary">导出配置</button>
        <button onclick="importConfiguration()" class="secondary">导入配置</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        // 监听输入变化
        document.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT') {
                vscode.postMessage({
                    type: 'updateHotkey',
                    key: e.target.id,
                    value: e.target.value
                });
            }
        });
        
        function resetToDefaults() {
            if (confirm('确定要恢复默认快捷键设置吗？')) {
                vscode.postMessage({ type: 'resetToDefaults' });
            }
        }
        
        function exportConfiguration() {
            vscode.postMessage({ type: 'exportConfiguration' });
        }
        
        function importConfiguration() {
            vscode.postMessage({ type: 'importConfiguration' });
        }
    </script>
</body>
</html>
    `
  }

  /**
   * 更新快捷键配置
   */
  private async updateHotkeyConfiguration(key: string, value: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('CCoding.hotkeys')
    await config.update(key, value, vscode.ConfigurationTarget.Global)
  }

  /**
   * 重置快捷键配置
   */
  private async resetHotkeyConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration('CCoding.hotkeys')
    const inspect = config.inspect('')

    if (inspect?.globalValue) {
      await config.update('', undefined, vscode.ConfigurationTarget.Global)
    }

    vscode.window.showInformationMessage('快捷键配置已重置为默认值')
  }

  /**
   * 导出快捷键配置
   */
  private async exportHotkeyConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration('CCoding.hotkeys')
    const configData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      hotkeys: config,
    }

    const content = JSON.stringify(configData, null, 2)

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('ccoding-hotkeys.json'),
      filters: {
        'JSON Files': ['json'],
      },
    })

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))
      vscode.window.showInformationMessage(`快捷键配置已导出到 ${uri.fsPath}`)
    }
  }
}

/**
 * 快捷键帮助项
 */
interface HotkeyHelpItem {
  id: string
  name: string
  hotkey: string
  description: string
  command: string
  category: string
  type?: 'category' | 'item'
}

/**
 * 快捷键分类
 */
interface HotkeyCategory {
  id: string
  name: string
  description: string
  expanded: boolean
  items: HotkeyHelpItem[]
}
