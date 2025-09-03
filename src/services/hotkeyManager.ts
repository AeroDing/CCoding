import type { EnhancedBookmarkManager } from './enhancedBookmarkManager.js'
import type { QuickAccessManager } from './quickAccessManager.js'
import * as vscode from 'vscode'

/**
 * 快捷键配置接口
 */
interface HotkeyConfig {
  // 全局快捷键
  showQuickAccess: string
  showFloatingToolbar: string
  togglePanel: string

  // 导航快捷键
  nextItem: string
  prevItem: string
  firstItem: string
  lastItem: string

  // 搜索快捷键
  focusSearch: string
  clearSearch: string

  // 过滤快捷键
  showAll: string
  showSymbols: string
  showBookmarks: string
  showFiles: string

  // 数字快捷键
  enableNumberKeys: boolean
  numberKeyPrefix: string

  // 功能快捷键
  addBookmark: string
  pinSymbol: string
  unpinSymbol: string
  toggleFavorite: string

  // 面板控制
  togglePreview: string
  toggleGrouping: string
  cycleLayout: string
}

/**
 * 快捷键操作类型
 */
enum HotkeyAction {
  ShowQuickAccess = 'show-quick-access',
  ShowFloatingToolbar = 'show-floating-toolbar',
  TogglePanel = 'toggle-panel',

  NextItem = 'next-item',
  PrevItem = 'prev-item',
  FirstItem = 'first-item',
  LastItem = 'last-item',

  FocusSearch = 'focus-search',
  ClearSearch = 'clear-search',

  ShowAll = 'show-all',
  ShowSymbols = 'show-symbols',
  ShowBookmarks = 'show-bookmarks',
  ShowFiles = 'show-files',

  NumberKey = 'number-key',

  AddBookmark = 'add-bookmark',
  PinSymbol = 'pin-symbol',
  UnpinSymbol = 'unpin-symbol',
  ToggleFavorite = 'toggle-favorite',

  TogglePreview = 'toggle-preview',
  ToggleGrouping = 'toggle-grouping',
  CycleLayout = 'cycle-layout',
}

/**
 * 快捷键上下文
 */
interface HotkeyContext {
  activeEditor?: vscode.TextEditor
  selection?: vscode.Selection
  quickAccessVisible: boolean
  panelVisible: boolean
  searchFocused: boolean
  currentFilter: string
  selectedIndex: number
  totalItems: number
}

/**
 * 快捷键管理器
 * 统一管理所有快捷键操作和数字键快速访问
 */
export class HotkeyManager {
  private context: vscode.ExtensionContext
  private config: HotkeyConfig
  private disposables: vscode.Disposable[] = []

  // 状态管理
  private currentContext: HotkeyContext = {
    quickAccessVisible: false,
    panelVisible: false,
    searchFocused: false,
    currentFilter: 'all',
    selectedIndex: 0,
    totalItems: 0,
  }

  // 依赖的管理器
  private quickAccessManager?: QuickAccessManager
  private bookmarkManager?: EnhancedBookmarkManager
  // private pinnedSymbolManager?: EnhancedPinnedSymbolManager // Removed

  // 快捷键状态
  private isListening = false
  private keySequence: string[] = []
  private sequenceTimeout?: NodeJS.Timeout

  // 数字键映射
  private numberKeyMappings: Map<number, string> = new Map()

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.config = this.loadConfig()

    this.setupGlobalKeyboardListener()
    this.registerCommands()
    this.setupEventListeners()
  }

  /**
   * 设置依赖的管理器
   */
  setManagers(
    quickAccessManager: QuickAccessManager,
    bookmarkManager: EnhancedBookmarkManager,
    // pinnedSymbolManager: EnhancedPinnedSymbolManager, // Removed
  ): void {
    this.quickAccessManager = quickAccessManager
    this.bookmarkManager = bookmarkManager
    // this.pinnedSymbolManager = pinnedSymbolManager // Removed

    this.updateNumberKeyMappings()
  }

  /**
   * 加载配置
   */
  private loadConfig(): HotkeyConfig {
    const config = vscode.workspace.getConfiguration('CCoding.hotkeys')

    return {
      showQuickAccess: config.get('showQuickAccess', 'ctrl+shift+q'),
      showFloatingToolbar: config.get('showFloatingToolbar', 'ctrl+shift+f'),
      togglePanel: config.get('togglePanel', 'ctrl+shift+p'),

      nextItem: config.get('nextItem', 'down'),
      prevItem: config.get('prevItem', 'up'),
      firstItem: config.get('firstItem', 'home'),
      lastItem: config.get('lastItem', 'end'),

      focusSearch: config.get('focusSearch', 'ctrl+f'),
      clearSearch: config.get('clearSearch', 'escape'),

      showAll: config.get('showAll', 'ctrl+1'),
      showSymbols: config.get('showSymbols', 'ctrl+2'),
      showBookmarks: config.get('showBookmarks', 'ctrl+3'),
      showFiles: config.get('showFiles', 'ctrl+4'),

      enableNumberKeys: config.get('enableNumberKeys', true),
      numberKeyPrefix: config.get('numberKeyPrefix', ''),

      addBookmark: config.get('addBookmark', 'ctrl+shift+b'),
      pinSymbol: config.get('pinSymbol', 'ctrl+shift+enter'),
      unpinSymbol: config.get('unpinSymbol', 'ctrl+shift+delete'),
      toggleFavorite: config.get('toggleFavorite', 'ctrl+shift+s'),

      togglePreview: config.get('togglePreview', 'ctrl+shift+v'),
      toggleGrouping: config.get('toggleGrouping', 'ctrl+shift+g'),
      cycleLayout: config.get('cycleLayout', 'ctrl+shift+l'),
    }
  }

  /**
   * 注册 VSCode 命令
   */
  private registerCommands(): void {
    const commands = [
      vscode.commands.registerCommand('CCoding.showQuickAccess', () => this.executeAction(HotkeyAction.ShowQuickAccess)),
      vscode.commands.registerCommand('CCoding.showFloatingToolbar', () => this.executeAction(HotkeyAction.ShowFloatingToolbar)),
      vscode.commands.registerCommand('CCoding.togglePanel', () => this.executeAction(HotkeyAction.TogglePanel)),

      vscode.commands.registerCommand('CCoding.nextItem', () => this.executeAction(HotkeyAction.NextItem)),
      vscode.commands.registerCommand('CCoding.prevItem', () => this.executeAction(HotkeyAction.PrevItem)),
      vscode.commands.registerCommand('CCoding.firstItem', () => this.executeAction(HotkeyAction.FirstItem)),
      vscode.commands.registerCommand('CCoding.lastItem', () => this.executeAction(HotkeyAction.LastItem)),

      vscode.commands.registerCommand('CCoding.focusSearch', () => this.executeAction(HotkeyAction.FocusSearch)),
      vscode.commands.registerCommand('CCoding.clearSearch', () => this.executeAction(HotkeyAction.ClearSearch)),

      vscode.commands.registerCommand('CCoding.showAll', () => this.executeAction(HotkeyAction.ShowAll)),
      vscode.commands.registerCommand('CCoding.showSymbols', () => this.executeAction(HotkeyAction.ShowSymbols)),
      vscode.commands.registerCommand('CCoding.showBookmarks', () => this.executeAction(HotkeyAction.ShowBookmarks)),
      vscode.commands.registerCommand('CCoding.showFiles', () => this.executeAction(HotkeyAction.ShowFiles)),

      vscode.commands.registerCommand('CCoding.addBookmarkHotkey', () => this.executeAction(HotkeyAction.AddBookmark)),
      vscode.commands.registerCommand('CCoding.pinSymbolHotkey', () => this.executeAction(HotkeyAction.PinSymbol)),
      vscode.commands.registerCommand('CCoding.unpinSymbolHotkey', () => this.executeAction(HotkeyAction.UnpinSymbol)),
      vscode.commands.registerCommand('CCoding.toggleFavorite', () => this.executeAction(HotkeyAction.ToggleFavorite)),

      vscode.commands.registerCommand('CCoding.togglePreview', () => this.executeAction(HotkeyAction.TogglePreview)),
      vscode.commands.registerCommand('CCoding.toggleGrouping', () => this.executeAction(HotkeyAction.ToggleGrouping)),
      vscode.commands.registerCommand('CCoding.cycleLayout', () => this.executeAction(HotkeyAction.CycleLayout)),

      // 数字键命令 (1-9)
      ...Array.from({ length: 9 }, (_, i) =>
        vscode.commands.registerCommand(`CCoding.numberKey${i + 1}`, () => this.executeNumberKey(i + 1))),
    ]

    this.disposables.push(...commands)
  }

  /**
   * 设置全局键盘监听器
   */
  private setupGlobalKeyboardListener(): void {
    // 监听编辑器键盘事件
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateContext({ activeEditor: editor, selection: editor?.selection })
      }),
    )

    // 监听选择变化
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.updateContext({ selection: event.selections[0] })
      }),
    )
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听配置变化
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('CCoding.hotkeys')) {
          this.config = this.loadConfig()
          this.updateNumberKeyMappings()
        }
      }),
    )
  }

  /**
   * 执行快捷键操作
   */
  private async executeAction(action: HotkeyAction): Promise<void> {
    console.log(`[CCoding] 执行快捷键操作: ${action}`)

    switch (action) {
      case HotkeyAction.ShowQuickAccess:
        await this.showQuickAccess()
        break

      case HotkeyAction.ShowFloatingToolbar:
        await this.showFloatingToolbar()
        break

      case HotkeyAction.TogglePanel:
        await this.togglePanel()
        break

      case HotkeyAction.NextItem:
        await this.navigateItems(1)
        break

      case HotkeyAction.PrevItem:
        await this.navigateItems(-1)
        break

      case HotkeyAction.FirstItem:
        await this.navigateToFirst()
        break

      case HotkeyAction.LastItem:
        await this.navigateToLast()
        break

      case HotkeyAction.FocusSearch:
        await this.focusSearch()
        break

      case HotkeyAction.ClearSearch:
        await this.clearSearch()
        break

      case HotkeyAction.ShowAll:
        await this.applyFilter('all')
        break

      case HotkeyAction.ShowSymbols:
        await this.applyFilter('symbols')
        break

      case HotkeyAction.ShowBookmarks:
        await this.applyFilter('bookmarks')
        break

      case HotkeyAction.ShowFiles:
        await this.applyFilter('files')
        break

      case HotkeyAction.AddBookmark:
        await this.addBookmarkAtCursor()
        break

      case HotkeyAction.PinSymbol:
        await this.pinSymbolAtCursor()
        break

      case HotkeyAction.UnpinSymbol:
        await this.unpinSymbolAtCursor()
        break

      case HotkeyAction.ToggleFavorite:
        await this.toggleFavoriteAtCursor()
        break

      case HotkeyAction.TogglePreview:
        await this.togglePreview()
        break

      case HotkeyAction.ToggleGrouping:
        await this.toggleGrouping()
        break

      case HotkeyAction.CycleLayout:
        await this.cycleLayout()
        break
    }
  }

  /**
   * 执行数字键快捷访问
   */
  private async executeNumberKey(number: number): Promise<void> {
    if (!this.config.enableNumberKeys) {
      return
    }

    const itemId = this.numberKeyMappings.get(number)
    if (!itemId) {
      vscode.window.showInformationMessage(`没有为数字键 ${number} 分配项目`)
      return
    }

    console.log(`[CCoding] 数字键快速访问: ${number} -> ${itemId}`)

    // 执行快速访问
    if (this.quickAccessManager) {
      await this.quickAccessManager.accessItem(itemId)
    }

    // 显示通知
    vscode.window.setStatusBarMessage(`✓ 快速访问 ${number}`, 1000)
  }

  /**
   * 更新数字键映射
   */
  private updateNumberKeyMappings(): void {
    this.numberKeyMappings.clear()

    if (!this.quickAccessManager) {
      return
    }

    // 获取快速访问项目
    const quickAccessItems = this.quickAccessManager.getQuickAccessSymbols()

    // 为前9个项目分配数字键
    for (let i = 0; i < Math.min(9, quickAccessItems.length); i++) {
      const item = quickAccessItems[i]
      this.numberKeyMappings.set(i + 1, item.id)
    }

    console.log(`[CCoding] 更新数字键映射: ${this.numberKeyMappings.size} 个映射`)
  }

  /**
   * 更新上下文
   */
  private updateContext(updates: Partial<HotkeyContext>): void {
    this.currentContext = { ...this.currentContext, ...updates }
  }

  // 具体的操作实现

  private async showQuickAccess(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.showQuickAccessPanel')
    this.updateContext({ quickAccessVisible: true })
  }

  private async showFloatingToolbar(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.showFloatingToolbar')
  }

  private async togglePanel(): Promise<void> {
    const newState = !this.currentContext.panelVisible
    this.updateContext({ panelVisible: newState })

    if (newState) {
      await vscode.commands.executeCommand('CCoding.showQuickAccessPanel')
    }
    else {
      await vscode.commands.executeCommand('CCoding.hideQuickAccessPanel')
    }
  }

  private async navigateItems(direction: number): Promise<void> {
    if (!this.currentContext.quickAccessVisible) {
      return
    }

    const newIndex = Math.max(0, Math.min(
      this.currentContext.totalItems - 1,
      this.currentContext.selectedIndex + direction,
    ))

    this.updateContext({ selectedIndex: newIndex })
    await vscode.commands.executeCommand('CCoding.selectQuickAccessItem', newIndex)
  }

  private async navigateToFirst(): Promise<void> {
    if (!this.currentContext.quickAccessVisible) {
      return
    }

    this.updateContext({ selectedIndex: 0 })
    await vscode.commands.executeCommand('CCoding.selectQuickAccessItem', 0)
  }

  private async navigateToLast(): Promise<void> {
    if (!this.currentContext.quickAccessVisible) {
      return
    }

    const lastIndex = this.currentContext.totalItems - 1
    this.updateContext({ selectedIndex: lastIndex })
    await vscode.commands.executeCommand('CCoding.selectQuickAccessItem', lastIndex)
  }

  private async focusSearch(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.focusQuickAccessSearch')
    this.updateContext({ searchFocused: true })
  }

  private async clearSearch(): Promise<void> {
    if (this.quickAccessManager) {
      this.quickAccessManager.search('')
    }
    await vscode.commands.executeCommand('CCoding.clearQuickAccessSearch')
    this.updateContext({ searchFocused: false })
  }

  private async applyFilter(filter: string): Promise<void> {
    if (this.quickAccessManager) {
      this.quickAccessManager.applyFilter(filter)
    }
    this.updateContext({ currentFilter: filter })

    vscode.window.setStatusBarMessage(`✓ 过滤器: ${filter}`, 1000)
  }

  private async addBookmarkAtCursor(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor || !this.bookmarkManager) {
      vscode.window.showWarningMessage('没有活动编辑器或书签管理器未初始化')
      return
    }

    const position = editor.selection.start
    const document = editor.document

    try {
      await this.bookmarkManager.addBookmark({
        uri: document.uri,
        lineNumber: position.line + 1,
        label: `书签 ${position.line + 1}`,
        description: '通过快捷键添加',
      })

      vscode.window.setStatusBarMessage('✓ 书签已添加', 2000)
    }
    catch {
      vscode.window.showErrorMessage('添加书签失败')
    }
  }

  private async pinSymbolAtCursor(): Promise<void> {
    // PinnedSymbolProvider已被移除
    vscode.window.showWarningMessage('置顶符号功能已被移除')
  }

  private async unpinSymbolAtCursor(): Promise<void> {
    // PinnedSymbolProvider已被移除
    vscode.window.showWarningMessage('置顶符号功能已被移除')
  }

  private async toggleFavoriteAtCursor(): Promise<void> {
    // 这里需要根据当前位置切换书签或置顶符号的收藏状态
    vscode.window.showInformationMessage('收藏功能待实现')
  }

  private async togglePreview(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.toggleQuickAccessPreview')
    vscode.window.setStatusBarMessage('✓ 预览模式已切换', 1000)
  }

  private async toggleGrouping(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.toggleQuickAccessGrouping')
    vscode.window.setStatusBarMessage('✓ 分组模式已切换', 1000)
  }

  private async cycleLayout(): Promise<void> {
    await vscode.commands.executeCommand('CCoding.cycleQuickAccessLayout')
    vscode.window.setStatusBarMessage('✓ 布局已切换', 1000)
  }

  /**
   * 在符号列表中查找指定位置的符号
   */
  private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | undefined {
    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        // 先检查子符号
        if (symbol.children.length > 0) {
          const childSymbol = this.findSymbolAtPosition(symbol.children, position)
          if (childSymbol) {
            return childSymbol
          }
        }
        return symbol
      }
    }
    return undefined
  }

  /**
   * 转换为前端符号信息
   */
  private convertToFrontendSymbol(symbol: vscode.DocumentSymbol, uri: vscode.Uri): any {
    return {
      id: `${uri.toString()}_${symbol.name}_${symbol.range.start.line}`,
      name: symbol.name,
      uri,
      range: symbol.range,
      kind: symbol.kind,
      category: this.getSymbolCategory(symbol.kind),
      framework: 'unknown' as any,
      priority: 3,
      tags: [],
      importance: 1,
      isExported: true,
      dependencies: [],
      usageCount: 0,
      lastAccessed: new Date(),
      metadata: {},
    }
  }

  /**
   * 根据符号类型获取分类
   */
  private getSymbolCategory(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.Function:
      case vscode.SymbolKind.Method:
        return 'function'
      case vscode.SymbolKind.Class:
        return 'component'
      case vscode.SymbolKind.Variable:
      case vscode.SymbolKind.Property:
        return 'variable'
      case vscode.SymbolKind.Constant:
        return 'constant'
      default:
        return 'other'
    }
  }

  /**
   * 获取当前快捷键状态
   */
  getHotkeyStatus(): any {
    return {
      context: this.currentContext,
      config: this.config,
      numberKeyMappings: Object.fromEntries(this.numberKeyMappings),
      isListening: this.isListening,
    }
  }

  /**
   * 获取快捷键帮助信息
   */
  getHotkeyHelp(): Array<{ action: string, hotkey: string, description: string }> {
    return [
      { action: 'showQuickAccess', hotkey: this.config.showQuickAccess, description: '显示快速访问面板' },
      { action: 'showFloatingToolbar', hotkey: this.config.showFloatingToolbar, description: '显示悬浮工具栏' },
      { action: 'addBookmark', hotkey: this.config.addBookmark, description: '在当前位置添加书签' },
      { action: 'pinSymbol', hotkey: this.config.pinSymbol, description: '置顶当前符号' },
      { action: 'numberKeys', hotkey: '1-9', description: '数字键快速访问' },
      { action: 'navigation', hotkey: '↑↓ Home End', description: '在面板中导航' },
      { action: 'filters', hotkey: 'Ctrl+1-4', description: '切换过滤器' },
    ]
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose()
    }
    this.disposables = []

    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout)
    }
  }
}
