import type {
  FrontendSymbolInfo,
  QuickFilter,
} from '../types/frontendSymbols'
import * as vscode from 'vscode'
import { FrontendSymbolDetector } from '../services/frontendSymbolDetector'
import { SymbolGroupManager } from '../services/symbolGroupManager'
import {
  FrameworkType,
  SymbolPriority,
} from '../types/frontendSymbols'

/**
 * 增强版函数列表提供器
 * 使用新的前端符号检测和分组系统
 */
export class EnhancedFunctionListProvider implements vscode.TreeDataProvider<EnhancedFunctionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<EnhancedFunctionItem | undefined | null | void>
    = new vscode.EventEmitter<EnhancedFunctionItem | undefined | null | void>()

  readonly onDidChangeTreeData: vscode.Event<EnhancedFunctionItem | undefined | null | void>
    = this._onDidChangeTreeData.event

  private symbols: FrontendSymbolInfo[] = []
  private groupedSymbols: Map<string, FrontendSymbolInfo[]> = new Map()
  private rootItems: EnhancedFunctionItem[] = []
  private groupManager: SymbolGroupManager
  private currentFramework: FrameworkType = FrameworkType.General

  // 状态管理
  private isRefreshing: boolean = false
  private refreshTimeout: NodeJS.Timeout | undefined
  private currentDocument: vscode.TextDocument | undefined

  // 过滤和搜索
  private searchQuery: string = ''
  private activeQuickFilter: string | undefined
  private showOnlyImportant: boolean = false
  private showOnlyUsedInTemplate: boolean = false

  constructor() {
    this.groupManager = new SymbolGroupManager()
    this.refresh()
  }

  /**
   * 销毁提供器
   */
  dispose(): void {
    console.log('[CCoding] 清理Enhanced Function Provider资源')
    this.stopRefresh()
    this.clearAllState()
  }

  /**
   * 停止刷新
   */
  private stopRefresh(): void {
    this.isRefreshing = false
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = undefined
    }
  }

  /**
   * 刷新符号列表
   */
  refresh(): void {
    if (this.isRefreshing) {
      console.log('[CCoding] Enhanced Function解析已在进行中，跳过此次刷新')
      return
    }

    this.stopRefresh()

    // 防抖处理
    this.refreshTimeout = setTimeout(() => {
      this.performRefresh()
    }, 200)
  }

  /**
   * 执行刷新
   */
  private async performRefresh(): Promise<void> {
    if (this.isRefreshing)
      return

    this.isRefreshing = true
    try {
      console.log('[CCoding] 开始Enhanced Function解析...')
      await this.analyzeCurrentDocument()
      this.buildTreeStructure()
      this._onDidChangeTreeData.fire()
      console.log('[CCoding] Enhanced Function解析完成')
    }
    catch (error) {
      console.error('[CCoding] Enhanced Function解析错误:', error)
      this.clearAllState()
      this._onDidChangeTreeData.fire()
    }
    finally {
      this.isRefreshing = false
    }
  }

  /**
   * 分析当前文档
   */
  private async analyzeCurrentDocument(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      this.clearAllState()
      return
    }

    this.currentDocument = editor.document

    // 获取 VSCode 原生符号
    const vscodeSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      this.currentDocument.uri,
    )

    if (!vscodeSymbols || vscodeSymbols.length === 0) {
      console.log('[CCoding] 没有找到VSCode符号')
      this.clearAllState()
      return
    }

    // 使用前端符号检测器分析
    const detector = new FrontendSymbolDetector(this.currentDocument)
    this.symbols = await detector.analyzeSymbols(vscodeSymbols)
    this.currentFramework = this.detectFramework()

    console.log(`[CCoding] 检测到 ${this.symbols.length} 个前端符号，框架: ${this.currentFramework}`)
  }

  /**
   * 检测当前文件的框架类型
   */
  private detectFramework(): FrameworkType {
    if (!this.currentDocument)
      return FrameworkType.General

    const fileName = this.currentDocument.fileName.toLowerCase()
    if (fileName.endsWith('.vue'))
      return FrameworkType.Vue
    if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx'))
      return FrameworkType.React

    // 通过符号内容检测
    const hasVueSymbols = this.symbols.some(s => s.framework === FrameworkType.Vue)
    const hasReactSymbols = this.symbols.some(s => s.framework === FrameworkType.React)

    if (hasVueSymbols)
      return FrameworkType.Vue
    if (hasReactSymbols)
      return FrameworkType.React

    return FrameworkType.General
  }

  /**
   * 构建树形结构
   */
  private buildTreeStructure(): void {
    const filteredSymbols = this.applyFilters(this.symbols)

    // 应用分组
    this.groupedSymbols = this.groupManager.groupSymbols(filteredSymbols, this.currentFramework)

    // 构建根项目
    this.rootItems = this.createGroupItems()
  }

  /**
   * 应用过滤器
   */
  private applyFilters(symbols: FrontendSymbolInfo[]): FrontendSymbolInfo[] {
    let filtered = symbols

    // 应用搜索过滤
    if (this.searchQuery) {
      filtered = this.groupManager.searchSymbols(filtered, this.searchQuery)
    }

    // 应用快速过滤器
    if (this.activeQuickFilter) {
      filtered = this.groupManager.applyQuickFilter(filtered, this.activeQuickFilter)
    }

    // 应用重要性过滤
    if (this.showOnlyImportant) {
      filtered = this.filterByPriority(filtered, SymbolPriority.High)
    }

    // 应用模板使用过滤
    if (this.showOnlyUsedInTemplate) {
      filtered = this.filterByTemplateUsage(filtered)
    }

    return filtered
  }

  /**
   * 按优先级过滤
   */
  private filterByPriority(symbols: FrontendSymbolInfo[], minPriority: SymbolPriority): FrontendSymbolInfo[] {
    return symbols.filter(symbol => symbol.priority >= minPriority)
  }

  /**
   * 按模板使用情况过滤
   */
  private filterByTemplateUsage(symbols: FrontendSymbolInfo[]): FrontendSymbolInfo[] {
    return symbols.filter(symbol => symbol.context.usedInTemplate)
  }

  /**
   * 创建分组项目
   */
  private createGroupItems(): EnhancedFunctionItem[] {
    const items: EnhancedFunctionItem[] = []
    const config = this.groupManager.getGroupConfig(this.currentFramework)

    if (!config)
      return items

    // 按优先级排序分组
    const sortedGroups = [...config.groups].sort((a, b) => b.priority - a.priority)

    for (const group of sortedGroups) {
      const groupSymbols = this.groupedSymbols.get(group.id)
      if (groupSymbols && groupSymbols.length > 0) {
        const groupItem = new EnhancedFunctionItem(
          `${group.name} (${groupSymbols.length})`,
          undefined,
          true,
          group,
        )

        // 创建子项目
        groupItem.children = groupSymbols.map(symbol =>
          this.createSymbolItem(symbol, groupItem),
        )

        // 设置折叠状态
        groupItem.collapsibleState = group.defaultExpanded || this.hasSearchQuery()
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed

        items.push(groupItem)
      }
    }

    return items
  }

  /**
   * 创建符号项目
   */
  private createSymbolItem(symbol: FrontendSymbolInfo, parent?: EnhancedFunctionItem): EnhancedFunctionItem {
    const item = new EnhancedFunctionItem(
      symbol.name,
      symbol,
      false,
      undefined,
      parent,
    )

    // 递归创建子项目
    if (symbol.children && symbol.children.length > 0) {
      item.children = symbol.children.map(child => this.createSymbolItem(child, item))
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
    else {
      item.collapsibleState = vscode.TreeItemCollapsibleState.None
    }

    return item
  }

  /**
   * 是否有搜索查询
   */
  private hasSearchQuery(): boolean {
    return this.searchQuery.trim().length > 0
  }

  /**
   * 清理所有状态
   */
  private clearAllState(): void {
    this.symbols = []
    this.groupedSymbols.clear()
    this.rootItems = []
    this.currentDocument = undefined
  }

  // TreeDataProvider 接口实现
  getTreeItem(element: EnhancedFunctionItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: EnhancedFunctionItem): Thenable<EnhancedFunctionItem[]> {
    if (!element) {
      // 返回根项目，应用搜索过滤
      const items = this.hasSearchQuery()
        ? this.rootItems.filter(item => this.itemMatchesSearch(item))
        : this.rootItems

      return Promise.resolve(items)
    }

    // 返回子项目
    if (element.children) {
      const items = this.hasSearchQuery()
        ? element.children.filter(item => this.itemMatchesSearch(item))
        : element.children

      return Promise.resolve(items)
    }

    return Promise.resolve([])
  }

  /**
   * 检查项目是否匹配搜索
   */
  private itemMatchesSearch(item: EnhancedFunctionItem): boolean {
    if (!this.hasSearchQuery())
      return true

    // 分组项目：检查是否有匹配的子项
    if (item.isGroup && item.children) {
      return item.children.some(child => this.itemMatchesSearch(child))
    }

    // 符号项目：检查符号是否匹配
    if (item.symbol) {
      return this.symbolMatchesSearch(item.symbol)
    }

    return false
  }

  /**
   * 检查符号是否匹配搜索
   */
  private symbolMatchesSearch(symbol: FrontendSymbolInfo): boolean {
    const query = this.searchQuery.toLowerCase()

    return symbol.name.toLowerCase().includes(query)
      || symbol.frontendKind.toLowerCase().includes(query)
      || symbol.category.toLowerCase().includes(query)
      || symbol.tags.some(tag => tag.toLowerCase().includes(query))
      || (symbol.signature && symbol.signature.toLowerCase().includes(query))
  }

  // 公共方法

  /**
   * 搜索符号
   */
  async searchSymbols(query: string): Promise<void> {
    console.log(`[CCoding] Enhanced 符号搜索: "${query}"`)
    this.searchQuery = query.trim()
    this.buildTreeStructure()
    this._onDidChangeTreeData.fire()
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    if (this.searchQuery) {
      console.log('[CCoding] 清除Enhanced符号搜索')
      this.searchQuery = ''
      this.buildTreeStructure()
      this._onDidChangeTreeData.fire()
    }
  }

  /**
   * 应用快速过滤器
   */
  applyQuickFilter(filterId: string): void {
    console.log(`[CCoding] 应用快速过滤器: ${filterId}`)
    this.activeQuickFilter = this.activeQuickFilter === filterId ? undefined : filterId
    this.buildTreeStructure()
    this._onDidChangeTreeData.fire()
  }

  /**
   * 切换重要性过滤
   */
  toggleImportantFilter(): void {
    this.showOnlyImportant = !this.showOnlyImportant
    console.log(`[CCoding] 重要性过滤: ${this.showOnlyImportant ? '开启' : '关闭'}`)
    this.buildTreeStructure()
    this._onDidChangeTreeData.fire()
  }

  /**
   * 切换模板使用过滤
   */
  toggleTemplateUsageFilter(): void {
    this.showOnlyUsedInTemplate = !this.showOnlyUsedInTemplate
    console.log(`[CCoding] 模板使用过滤: ${this.showOnlyUsedInTemplate ? '开启' : '关闭'}`)
    this.buildTreeStructure()
    this._onDidChangeTreeData.fire()
  }

  /**
   * 获取当前框架类型
   */
  getCurrentFramework(): FrameworkType {
    return this.currentFramework
  }

  /**
   * 获取可用的快速过滤器
   */
  getQuickFilters(): QuickFilter[] {
    return this.groupManager.getQuickFilters()
  }

  /**
   * 获取符号统计信息
   */
  getSymbolStats(): {
    total: number
    byCategory: Record<string, number>
    byPriority: Record<string, number>
    framework: FrameworkType
  } {
    const stats = {
      total: this.symbols.length,
      byCategory: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      framework: this.currentFramework,
    }

    this.symbols.forEach((symbol) => {
      // 按分类统计
      stats.byCategory[symbol.category] = (stats.byCategory[symbol.category] || 0) + 1

      // 按优先级统计
      const priorityName = this.getPriorityName(symbol.priority)
      stats.byPriority[priorityName] = (stats.byPriority[priorityName] || 0) + 1
    })

    return stats
  }

  /**
   * 获取优先级名称
   */
  private getPriorityName(priority: SymbolPriority): string {
    switch (priority) {
      case SymbolPriority.Critical: return '极高'
      case SymbolPriority.High: return '高'
      case SymbolPriority.Medium: return '中'
      case SymbolPriority.Low: return '低'
      case SymbolPriority.Minimal: return '极低'
      default: return '未知'
    }
  }
}

/**
 * 增强版函数项目
 */
export class EnhancedFunctionItem extends vscode.TreeItem {
  public children?: EnhancedFunctionItem[]
  public symbol?: FrontendSymbolInfo
  public isGroup: boolean
  public groupInfo?: any
  public parent?: EnhancedFunctionItem

  constructor(
    label: string,
    symbol?: FrontendSymbolInfo,
    isGroup: boolean = false,
    groupInfo?: any,
    parent?: EnhancedFunctionItem,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)

    this.symbol = symbol
    this.isGroup = isGroup
    this.groupInfo = groupInfo
    this.parent = parent

    if (isGroup) {
      this.setupGroupItem()
    }
    else if (symbol) {
      this.setupSymbolItem(symbol)
    }
  }

  /**
   * 设置分组项目
   */
  private setupGroupItem(): void {
    this.contextValue = 'enhancedFunctionGroup'
    this.tooltip = `${this.label} - 点击展开/折叠`

    if (this.groupInfo) {
      this.iconPath = new vscode.ThemeIcon(
        this.groupInfo.icon,
        new vscode.ThemeColor(this.groupInfo.color),
      )
    }
    else {
      this.iconPath = new vscode.ThemeIcon('folder')
    }
  }

  /**
   * 设置符号项目
   */
  private setupSymbolItem(symbol: FrontendSymbolInfo): void {
    const groupManager = new SymbolGroupManager()
    const displayInfo = groupManager.getSymbolDisplayInfo(symbol)

    this.label = displayInfo.label
    this.description = displayInfo.description
    this.tooltip = displayInfo.tooltip
    this.iconPath = new vscode.ThemeIcon(displayInfo.icon, new vscode.ThemeColor(displayInfo.color))

    // 设置命令
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [symbol.uri, {
        selection: new vscode.Range(
          symbol.range.start.line,
          symbol.range.start.character,
          symbol.range.start.line,
          Math.max(symbol.range.start.character, symbol.range.end.character),
        ),
      }],
    }

    this.contextValue = 'enhancedFunctionItem'

    // 添加资源URI用于文件信息显示
    this.resourceUri = symbol.uri
  }
}
