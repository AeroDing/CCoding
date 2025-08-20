import type { HotkeyManager } from './hotkeyManager'
import type { QuickAccessManager } from './quickAccessManager'
import * as vscode from 'vscode'

/**
 * 状态栏配置
 */
interface StatusBarConfig {
  // 显示内容
  showPinnedCount: boolean
  showBookmarkCount: boolean
  showCurrentSymbol: boolean
  showProjectInfo: boolean
  showQuickActions: boolean
  showHotkeyHints: boolean

  // 交互
  enableClick: boolean
  enableHover: boolean
  clickAction: 'quick-pick' | 'panel' | 'floating-toolbar'

  // 样式
  priority: number
  alignment: vscode.StatusBarAlignment
  color?: string
  backgroundColor?: string

  // 文本格式
  textFormat: string
  separator: string
  maxLength: number

  // 快捷键提示
  showNumberKeyHints: boolean
  hintDuration: number
  autoHideHints: boolean
}

/**
 * 状态栏项信息
 */
interface _StatusBarItemInfo {
  id: string
  text: string
  tooltip: string
  command?: string
  args?: any[]
  color?: string
  backgroundColor?: string
  priority: number
}

/**
 * 状态栏管理器
 * 在状态栏显示快速访问信息和快捷键提示
 */
export class StatusBarManager {
  private context: vscode.ExtensionContext
  private config: StatusBarConfig
  private statusBarItems: Map<string, vscode.StatusBarItem> = new Map()

  // 依赖的管理器
  private quickAccessManager?: QuickAccessManager
  private hotkeyManager?: HotkeyManager

  // 状态
  private currentSymbol?: string
  private pinnedCount = 0
  private bookmarkCount = 0
  private numberKeyHints: Map<number, string> = new Map()

  // 定时器
  private updateTimer?: NodeJS.Timeout
  private hintTimer?: NodeJS.Timeout

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.config = this.loadConfig()

    this.createStatusBarItems()
    this.setupEventListeners()
    this.startPeriodicUpdate()
  }

  /**
   * 设置依赖的管理器
   */
  setManagers(quickAccessManager: QuickAccessManager, hotkeyManager: HotkeyManager): void {
    this.quickAccessManager = quickAccessManager
    this.hotkeyManager = hotkeyManager

    this.updateAllItems()
    this.updateNumberKeyHints()
  }

  /**
   * 加载配置
   */
  private loadConfig(): StatusBarConfig {
    const config = vscode.workspace.getConfiguration('CCoding.statusBar')

    return {
      showPinnedCount: config.get('showPinnedCount', true),
      showBookmarkCount: config.get('showBookmarkCount', true),
      showCurrentSymbol: config.get('showCurrentSymbol', true),
      showProjectInfo: config.get('showProjectInfo', false),
      showQuickActions: config.get('showQuickActions', true),
      showHotkeyHints: config.get('showHotkeyHints', true),

      enableClick: config.get('enableClick', true),
      enableHover: config.get('enableHover', true),
      clickAction: config.get('clickAction', 'quick-pick'),

      priority: config.get('priority', 100),
      alignment: config.get('alignment', vscode.StatusBarAlignment.Right),
      color: config.get('color'),
      backgroundColor: config.get('backgroundColor'),

      textFormat: config.get('textFormat', '$(pin) {pinned} $(bookmark) {bookmarks}'),
      separator: config.get('separator', ' '),
      maxLength: config.get('maxLength', 50),

      showNumberKeyHints: config.get('showNumberKeyHints', true),
      hintDuration: config.get('hintDuration', 3000),
      autoHideHints: config.get('autoHideHints', true),
    }
  }

  /**
   * 创建状态栏项
   */
  private createStatusBarItems(): void {
    // 主状态栏项
    const mainItem = vscode.window.createStatusBarItem(
      'ccoding-main',
      this.config.alignment,
      this.config.priority,
    )
    this.statusBarItems.set('main', mainItem)

    // 快捷键提示项
    if (this.config.showHotkeyHints) {
      const hintItem = vscode.window.createStatusBarItem(
        'ccoding-hints',
        this.config.alignment,
        this.config.priority - 1,
      )
      this.statusBarItems.set('hints', hintItem)
    }

    // 项目信息项
    if (this.config.showProjectInfo) {
      const projectItem = vscode.window.createStatusBarItem(
        'ccoding-project',
        this.config.alignment,
        this.config.priority - 2,
      )
      this.statusBarItems.set('project', projectItem)
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听编辑器变化
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.updateCurrentSymbol(editor)
      this.updateAllItems()
    })

    // 监听选择变化
    vscode.window.onDidChangeTextEditorSelection((event) => {
      this.updateCurrentSymbol(event.textEditor)
      this.updateCurrentSymbolItem()
    })

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('CCoding.statusBar')) {
        this.config = this.loadConfig()
        this.recreateStatusBarItems()
      }
    })

    // 监听快速访问变化
    if (this.quickAccessManager) {
      this.quickAccessManager.onItemsChanged(() => {
        this.updateNumberKeyHints()
        this.updateMainItem()
      })
    }
  }

  /**
   * 开始定期更新
   */
  private startPeriodicUpdate(): void {
    this.updateTimer = setInterval(() => {
      this.updateAllItems()
    }, 30000) // 每30秒更新一次
  }

  /**
   * 更新所有状态栏项
   */
  private updateAllItems(): void {
    this.updateMainItem()
    this.updateProjectItem()
    this.updateCurrentSymbolItem()
  }

  /**
   * 更新主状态栏项
   */
  private updateMainItem(): void {
    const mainItem = this.statusBarItems.get('main')
    if (!mainItem)
      return

    const items: string[] = []

    if (this.config.showPinnedCount) {
      items.push(`$(pin) ${this.pinnedCount}`)
    }

    if (this.config.showBookmarkCount) {
      items.push(`$(bookmark) ${this.bookmarkCount}`)
    }

    if (this.config.showQuickActions) {
      items.push(`$(zap)`)
    }

    mainItem.text = items.join(this.config.separator)
    mainItem.tooltip = this.generateMainTooltip()

    if (this.config.enableClick) {
      mainItem.command = this.getClickCommand()
    }

    if (this.config.color) {
      mainItem.color = new vscode.ThemeColor(this.config.color)
    }

    if (this.config.backgroundColor) {
      mainItem.backgroundColor = new vscode.ThemeColor(this.config.backgroundColor)
    }

    mainItem.show()
  }

  /**
   * 更新项目信息项
   */
  private updateProjectItem(): void {
    if (!this.config.showProjectInfo)
      return

    const projectItem = this.statusBarItems.get('project')
    if (!projectItem)
      return

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (workspaceFolder) {
      const projectName = workspaceFolder.name
      const framework = this.detectFramework()

      projectItem.text = `$(folder) ${projectName}${framework ? ` (${framework})` : ''}`
      projectItem.tooltip = `项目: ${projectName}\n工作区: ${workspaceFolder.uri.fsPath}`
      projectItem.show()
    }
    else {
      projectItem.hide()
    }
  }

  /**
   * 更新当前符号项
   */
  private updateCurrentSymbolItem(): void {
    if (!this.config.showCurrentSymbol || !vscode.window.activeTextEditor) {
      // 这里可以显示当前符号信息
      // 暂时简化实现
      // TODO: 实现当前符号显示逻辑
    }
  }

  /**
   * 更新数字键提示
   */
  private updateNumberKeyHints(): void {
    if (!this.config.showNumberKeyHints || !this.quickAccessManager) {
      return
    }

    const quickAccessItems = this.quickAccessManager.getQuickAccessSymbols()
    this.numberKeyHints.clear()

    quickAccessItems.forEach((item, index) => {
      if (index < 9) {
        this.numberKeyHints.set(index + 1, item.title)
      }
    })
  }

  /**
   * 显示快捷键提示
   */
  showHotkeyHints(): void {
    if (!this.config.showHotkeyHints)
      return

    const hintItem = this.statusBarItems.get('hints')
    if (!hintItem)
      return

    if (this.numberKeyHints.size > 0) {
      const hints: string[] = []
      for (let i = 1; i <= Math.min(3, this.numberKeyHints.size); i++) {
        const title = this.numberKeyHints.get(i)
        if (title) {
          hints.push(`${i}:${title.substring(0, 8)}`)
        }
      }

      if (hints.length > 0) {
        hintItem.text = `$(keyboard) ${hints.join(' ')}`
        hintItem.tooltip = this.generateHintTooltip()
        hintItem.show()

        // 自动隐藏
        if (this.config.autoHideHints) {
          if (this.hintTimer) {
            clearTimeout(this.hintTimer)
          }
          this.hintTimer = setTimeout(() => {
            hintItem.hide()
          }, this.config.hintDuration)
        }
      }
    }
  }

  /**
   * 隐藏快捷键提示
   */
  hideHotkeyHints(): void {
    const hintItem = this.statusBarItems.get('hints')
    if (hintItem) {
      hintItem.hide()
    }

    if (this.hintTimer) {
      clearTimeout(this.hintTimer)
      this.hintTimer = undefined
    }
  }

  /**
   * 切换快捷键提示
   */
  toggleHotkeyHints(): void {
    const hintItem = this.statusBarItems.get('hints')
    if (hintItem) {
      if (hintItem.text) {
        this.hideHotkeyHints()
      }
      else {
        this.showHotkeyHints()
      }
    }
  }

  /**
   * 更新计数
   */
  updateCounts(pinnedCount: number, bookmarkCount: number): void {
    this.pinnedCount = pinnedCount
    this.bookmarkCount = bookmarkCount
    this.updateMainItem()
  }

  /**
   * 更新当前符号
   */
  private updateCurrentSymbol(editor?: vscode.TextEditor): void {
    if (!editor) {
      this.currentSymbol = undefined
      return
    }

    // 这里可以获取当前位置的符号名称
    // 暂时简化实现
    this.currentSymbol = `${editor.document.fileName.split('/').pop()}:${editor.selection.start.line + 1}`
  }

  /**
   * 检测项目框架
   */
  private detectFramework(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder)
      return undefined

    // 简化的框架检测
    // 实际实现应该检查 package.json 等文件
    return undefined
  }

  /**
   * 生成主工具提示
   */
  private generateMainTooltip(): string {
    const lines: string[] = [
      'CCoding 快速访问',
      '',
    ]

    if (this.config.showPinnedCount) {
      lines.push(`📌 置顶符号: ${this.pinnedCount}`)
    }

    if (this.config.showBookmarkCount) {
      lines.push(`📚 书签: ${this.bookmarkCount}`)
    }

    lines.push('', '点击打开快速访问面板')

    if (this.hotkeyManager) {
      const help = this.hotkeyManager.getHotkeyHelp()
      const quickAccessHotkey = help.find(h => h.action === 'showQuickAccess')?.hotkey
      if (quickAccessHotkey) {
        lines.push(`快捷键: ${quickAccessHotkey}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * 生成提示工具提示
   */
  private generateHintTooltip(): string {
    const lines: string[] = [
      '数字键快速访问',
      '',
    ]

    for (let i = 1; i <= this.numberKeyHints.size; i++) {
      const title = this.numberKeyHints.get(i)
      if (title) {
        lines.push(`${i}: ${title}`)
      }
    }

    lines.push('', '按数字键 1-9 快速访问')

    return lines.join('\n')
  }

  /**
   * 获取点击命令
   */
  private getClickCommand(): string {
    switch (this.config.clickAction) {
      case 'panel':
        return 'CCoding.togglePanel'
      case 'floating-toolbar':
        return 'CCoding.showFloatingToolbar'
      case 'quick-pick':
      default:
        return 'CCoding.showQuickAccess'
    }
  }

  /**
   * 重新创建状态栏项
   */
  private recreateStatusBarItems(): void {
    // 清理现有项
    for (const item of this.statusBarItems.values()) {
      item.dispose()
    }
    this.statusBarItems.clear()

    // 重新创建
    this.createStatusBarItems()
    this.updateAllItems()
  }

  /**
   * 获取状态栏信息
   */
  getStatusBarInfo(): any {
    return {
      config: this.config,
      pinnedCount: this.pinnedCount,
      bookmarkCount: this.bookmarkCount,
      currentSymbol: this.currentSymbol,
      numberKeyHints: Object.fromEntries(this.numberKeyHints),
      activeItems: Array.from(this.statusBarItems.keys()),
    }
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
    }

    if (this.hintTimer) {
      clearTimeout(this.hintTimer)
    }

    for (const item of this.statusBarItems.values()) {
      item.dispose()
    }
    this.statusBarItems.clear()
  }
}
