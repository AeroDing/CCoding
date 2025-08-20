import type { EnhancedFunctionListProvider } from '../providers/enhancedFunctionListProvider'
import type {
  QuickAccessContext,
  QuickAccessEvent,
  QuickAccessGroup,
  QuickAccessItem,
  QuickAccessPanelConfig,
  QuickAccessStatistics,
} from '../types/quickAccess'
import type { EnhancedBookmarkManager } from './enhancedBookmarkManager'
// import type { EnhancedPinnedSymbolManager } from './enhancedPinnedSymbolManager' // Removed
import * as vscode from 'vscode'
import {
  QuickAccessItemType,
} from '../types/quickAccess'

/**
 * 快速访问管理器
 * 统一管理符号、书签、文件等的快速访问功能
 */
export class QuickAccessManager {
  private items: Map<string, QuickAccessItem> = new Map()
  private groups: QuickAccessGroup[] = []
  private events: QuickAccessEvent[] = []
  private context: vscode.ExtensionContext

  // 依赖的管理器
  private bookmarkManager?: EnhancedBookmarkManager
  // private pinnedSymbolManager?: EnhancedPinnedSymbolManager // Removed
  private functionListProvider?: EnhancedFunctionListProvider

  // 配置
  private config: QuickAccessPanelConfig
  private maxItems = 50
  private maxHistory = 1000

  // 状态
  private isVisible = false
  private currentQuery = ''
  private selectedFilter = 'all'
  private currentGroup = 'recent'

  // 事件发射器
  private _onItemsChanged = new vscode.EventEmitter<void>()
  readonly onItemsChanged = this._onItemsChanged.event

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.config = this.loadConfig()

    this.initializeGroups()
    this.loadItems()
    this.setupEventListeners()
  }

  /**
   * 设置依赖的管理器
   */
  setManagers(
    bookmarkManager: EnhancedBookmarkManager,
    pinnedSymbolManager: EnhancedPinnedSymbolManager,
    functionListProvider: EnhancedFunctionListProvider,
  ): void {
    this.bookmarkManager = bookmarkManager
    this.pinnedSymbolManager = pinnedSymbolManager
    this.functionListProvider = functionListProvider

    this.refreshItems()
  }

  /**
   * 加载配置
   */
  private loadConfig(): QuickAccessPanelConfig {
    const config = vscode.workspace.getConfiguration('CCoding.quickAccess')

    return {
      layout: config.get('layout', 'vertical'),
      columns: config.get('columns', 2),
      itemHeight: config.get('itemHeight', 40),

      enableSearch: config.get('enableSearch', true),
      fuzzySearch: config.get('fuzzySearch', true),
      searchPlaceholder: config.get('searchPlaceholder', '搜索符号、书签、文件...'),

      enableFilters: config.get('enableFilters', true),
      defaultFilters: config.get('defaultFilters', ['all', 'symbols', 'bookmarks', 'files']),
      customFilters: config.get('customFilters', []),

      enableGrouping: config.get('enableGrouping', true),
      defaultGroupBy: config.get('defaultGroupBy', 'recent'),

      enablePreview: config.get('enablePreview', true),
      previewPosition: config.get('previewPosition', 'right'),
      previewSize: config.get('previewSize', 300),

      enableKeyboardNavigation: config.get('enableKeyboardNavigation', true),
      keyboardShortcuts: config.get('keyboardShortcuts', {}),

      rememberSize: config.get('rememberSize', true),
      rememberFilters: config.get('rememberFilters', true),
      rememberGrouping: config.get('rememberGrouping', true),
    }
  }

  /**
   * 初始化分组
   */
  private initializeGroups(): void {
    this.groups = [
      {
        id: 'recent',
        name: '🕒 最近使用',
        icon: 'history',
        defaultExpanded: true,
        maxItems: 10,
        showCount: true,
        priority: 10,
        filter: (item) => {
          const hoursSinceAccess = (Date.now() - item.lastAccessed.getTime()) / (1000 * 60 * 60)
          return hoursSinceAccess <= 24
        },
        sorter: (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime(),
      },
      {
        id: 'pinned',
        name: '📌 置顶符号',
        icon: 'pin',
        defaultExpanded: true,
        maxItems: 15,
        showCount: true,
        priority: 9,
        filter: item => item.type === QuickAccessItemType.PinnedSymbol,
        sorter: (a, b) => b.priority - a.priority,
      },
      {
        id: 'bookmarks',
        name: '📚 书签',
        icon: 'bookmark',
        defaultExpanded: true,
        maxItems: 15,
        showCount: true,
        priority: 8,
        filter: item => item.type === QuickAccessItemType.Bookmark,
        sorter: (a, b) => b.accessCount - a.accessCount,
      },
      {
        id: 'symbols',
        name: '🔍 符号',
        icon: 'symbol-function',
        defaultExpanded: false,
        maxItems: 20,
        showCount: true,
        priority: 7,
        filter: item => item.type === QuickAccessItemType.Symbol,
        sorter: (a, b) => b.score - a.score,
      },
      {
        id: 'files',
        name: '📁 文件',
        icon: 'file',
        defaultExpanded: false,
        maxItems: 10,
        showCount: true,
        priority: 6,
        filter: item => [
          QuickAccessItemType.RecentFile,
          QuickAccessItemType.FrequentFile,
          QuickAccessItemType.RelatedFile,
        ].includes(item.type),
        sorter: (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime(),
      },
      {
        id: 'commands',
        name: '⚡ 命令',
        icon: 'terminal',
        defaultExpanded: false,
        maxItems: 8,
        showCount: true,
        priority: 5,
        filter: item => item.type === QuickAccessItemType.Command,
        sorter: (a, b) => b.accessCount - a.accessCount,
      },
      {
        id: 'suggestions',
        name: '💡 智能推荐',
        icon: 'lightbulb',
        defaultExpanded: false,
        maxItems: 5,
        showCount: true,
        priority: 4,
        filter: item => item.type === QuickAccessItemType.Suggestion,
        sorter: (a, b) => (b.confidence || 0) - (a.confidence || 0),
      },
    ]
  }

  /**
   * 刷新所有项目
   */
  async refreshItems(): Promise<void> {
    console.log('[CCoding] 刷新快速访问项目...')

    try {
      // 清空现有项目
      this.items.clear()

      // 从各个管理器收集项目
      await this.collectPinnedSymbols()
      await this.collectBookmarks()
      await this.collectRecentFiles()
      await this.collectCommands()
      await this.collectSuggestions()

      // 保存项目
      await this.saveItems()

      // 触发更新事件
      this._onItemsChanged.fire()

      console.log(`[CCoding] 快速访问项目刷新完成: ${this.items.size} 个项目`)
    }
    catch (error) {
      console.error('[CCoding] 刷新快速访问项目失败:', error)
    }
  }

  /**
   * 收集置顶符号
   */
  private async collectPinnedSymbols(): Promise<void> {
    if (!this.pinnedSymbolManager)
      return

    const pinnedSymbols = this.pinnedSymbolManager.getPinnedSymbols()

    for (const pinnedSymbol of pinnedSymbols) {
      const item: QuickAccessItem = {
        id: `pinned_${pinnedSymbol.id}`,
        type: QuickAccessItemType.PinnedSymbol,
        title: pinnedSymbol.displayName,
        description: `📌 ${pinnedSymbol.relativePath}:${pinnedSymbol.range.start.line + 1}`,
        detail: pinnedSymbol.note,

        icon: this.getSymbolIcon(pinnedSymbol.category),
        iconColor: this.getSymbolColor(pinnedSymbol.framework),
        badge: pinnedSymbol.stats.accessCount.toString(),
        tooltip: `置顶符号 - 访问 ${pinnedSymbol.stats.accessCount} 次`,

        command: 'CCoding.openPinnedSymbol',
        args: [pinnedSymbol.id],

        priority: pinnedSymbol.priority,
        score: this.calculatePinnedSymbolScore(pinnedSymbol),

        category: pinnedSymbol.category,
        tags: pinnedSymbol.tags,
        uri: pinnedSymbol.uri,
        range: pinnedSymbol.range,

        accessCount: pinnedSymbol.stats.accessCount,
        lastAccessed: pinnedSymbol.lastAccessed,
        timeSaved: pinnedSymbol.stats.totalViewTime,

        isVisible: pinnedSymbol.isVisible,
        showInQuickPick: pinnedSymbol.showInQuickAccess,
        showInHover: true,
        showInStatusBar: pinnedSymbol.showInStatusBar,

        hotkeyIndex: this.getHotkeyIndex(pinnedSymbol.order),

        metadata: {
          pinnedSymbol,
          productivityScore: pinnedSymbol.stats.productivityScore,
        },
      }

      this.items.set(item.id, item)
    }
  }

  /**
   * 收集书签
   */
  private async collectBookmarks(): Promise<void> {
    if (!this.bookmarkManager)
      return

    const bookmarks = this.bookmarkManager.searchBookmarks({})

    for (const bookmark of bookmarks) {
      const item: QuickAccessItem = {
        id: `bookmark_${bookmark.id}`,
        type: QuickAccessItemType.Bookmark,
        title: bookmark.label,
        description: `📚 ${bookmark.relativePath}:${bookmark.lineNumber}`,
        detail: bookmark.description,

        icon: this.getBookmarkIcon(bookmark.type),
        iconColor: this.getBookmarkColor(bookmark.priority),
        badge: bookmark.stats.accessCount > 0 ? bookmark.stats.accessCount.toString() : undefined,
        tooltip: `书签 - ${this.getBookmarkTypeDisplayName(bookmark.type)}`,

        command: 'CCoding.openBookmark',
        args: [bookmark.id],

        priority: bookmark.priority,
        score: this.calculateBookmarkScore(bookmark),

        category: bookmark.category,
        tags: bookmark.tags,
        uri: bookmark.uri,
        range: bookmark.range,

        accessCount: bookmark.stats.accessCount,
        lastAccessed: bookmark.stats.lastAccessed,
        timeSaved: 0,

        isVisible: !bookmark.isArchived,
        showInQuickPick: true,
        showInHover: true,
        showInStatusBar: bookmark.priority >= 4,

        metadata: {
          bookmark,
          type: bookmark.type,
          framework: bookmark.framework,
        },
      }

      this.items.set(item.id, item)
    }
  }

  /**
   * 收集最近文件
   */
  private async collectRecentFiles(): Promise<void> {
    const recentFiles = await this.getRecentFiles()

    for (const file of recentFiles.slice(0, 10)) {
      const item: QuickAccessItem = {
        id: `file_${file.uri.toString()}`,
        type: QuickAccessItemType.RecentFile,
        title: file.name,
        description: `📁 ${file.relativePath}`,
        detail: `最后打开: ${this.formatDate(file.lastAccessed)}`,

        icon: this.getFileIcon(file.extension),
        tooltip: `最近文件 - ${file.relativePath}`,

        command: 'vscode.open',
        args: [file.uri],

        priority: 2,
        score: file.accessCount,

        category: 'file',
        tags: [file.extension, file.framework || 'general'],
        uri: file.uri,

        accessCount: file.accessCount,
        lastAccessed: file.lastAccessed,
        timeSaved: 0,

        isVisible: true,
        showInQuickPick: true,
        showInHover: false,
        showInStatusBar: false,

        metadata: {
          extension: file.extension,
          framework: file.framework,
        },
      }

      this.items.set(item.id, item)
    }
  }

  /**
   * 收集常用命令
   */
  private async collectCommands(): Promise<void> {
    const commands = [
      {
        id: 'CCoding.showFunctionList',
        title: '显示函数列表',
        icon: 'symbol-function',
        category: 'navigation',
      },
      {
        id: 'CCoding.addBookmark',
        title: '添加书签',
        icon: 'bookmark',
        category: 'bookmark',
      },
      {
        id: 'CCoding.pinSymbol',
        title: '置顶符号',
        icon: 'pin',
        category: 'symbol',
      },
      {
        id: 'CCoding.searchKeywords',
        title: '搜索关键词',
        icon: 'search',
        category: 'search',
      },
      {
        id: 'CCoding.showTimeline',
        title: '显示时间线',
        icon: 'history',
        category: 'navigation',
      },
    ]

    for (const cmd of commands) {
      const item: QuickAccessItem = {
        id: `command_${cmd.id}`,
        type: QuickAccessItemType.Command,
        title: cmd.title,
        description: '⚡ CCoding 命令',

        icon: cmd.icon,
        tooltip: `执行命令: ${cmd.title}`,

        command: cmd.id,

        priority: 3,
        score: 0,

        category: cmd.category,
        tags: ['command', cmd.category],

        accessCount: 0,
        lastAccessed: new Date(),
        timeSaved: 0,

        isVisible: true,
        showInQuickPick: true,
        showInHover: false,
        showInStatusBar: false,

        metadata: {
          commandId: cmd.id,
        },
      }

      this.items.set(item.id, item)
    }
  }

  /**
   * 收集智能推荐
   */
  private async collectSuggestions(): Promise<void> {
    // 这里可以基于用户行为生成智能推荐
    const suggestions = await this.generateSmartSuggestions()

    for (const suggestion of suggestions) {
      const item: QuickAccessItem = {
        id: `suggestion_${suggestion.id}`,
        type: QuickAccessItemType.Suggestion,
        title: suggestion.title,
        description: `💡 ${suggestion.reason}`,
        detail: suggestion.explanation,

        icon: 'lightbulb',
        iconColor: 'charts.yellow',
        tooltip: `智能推荐 - 置信度: ${(suggestion.confidence * 100).toFixed(0)}%`,

        command: suggestion.command,
        args: suggestion.args,

        priority: 1,
        score: suggestion.confidence * 100,
        confidence: suggestion.confidence,

        category: suggestion.category,
        tags: ['suggestion', suggestion.category],

        accessCount: 0,
        lastAccessed: new Date(),
        timeSaved: 0,

        isVisible: true,
        showInQuickPick: true,
        showInHover: true,
        showInStatusBar: false,

        metadata: {
          suggestion,
          confidence: suggestion.confidence,
        },
      }

      this.items.set(item.id, item)
    }
  }

  /**
   * 获取分组的项目
   */
  getGroupedItems(): Map<string, QuickAccessItem[]> {
    const grouped = new Map<string, QuickAccessItem[]>()

    // 按查询过滤项目
    const filteredItems = this.getFilteredItems()

    // 按分组分类
    for (const group of this.groups) {
      const groupItems = filteredItems.filter(group.filter)

      if (groupItems.length > 0) {
        // 排序并限制数量
        groupItems.sort(group.sorter)
        const limitedItems = groupItems.slice(0, group.maxItems)
        grouped.set(group.id, limitedItems)
      }
    }

    return grouped
  }

  /**
   * 获取过滤后的项目
   */
  getFilteredItems(): QuickAccessItem[] {
    let items = Array.from(this.items.values()).filter(item => item.isVisible)

    // 应用搜索查询
    if (this.currentQuery) {
      items = this.searchItems(items, this.currentQuery)
    }

    // 应用类型过滤
    if (this.selectedFilter !== 'all') {
      items = items.filter(item => this.matchesFilter(item, this.selectedFilter))
    }

    return items
  }

  /**
   * 搜索项目
   */
  private searchItems(items: QuickAccessItem[], query: string): QuickAccessItem[] {
    const normalizedQuery = query.toLowerCase()

    return items.filter((item) => {
      // 搜索标题
      if (item.title.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      // 搜索描述
      if (item.description && item.description.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      // 搜索标签
      if (item.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))) {
        return true
      }

      // 搜索类别
      if (item.category.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      return false
    })
  }

  /**
   * 检查项目是否匹配过滤器
   */
  private matchesFilter(item: QuickAccessItem, filter: string): boolean {
    switch (filter) {
      case 'symbols':
        return item.type === QuickAccessItemType.Symbol || item.type === QuickAccessItemType.PinnedSymbol
      case 'bookmarks':
        return item.type === QuickAccessItemType.Bookmark
      case 'files':
        return [
          QuickAccessItemType.RecentFile,
          QuickAccessItemType.FrequentFile,
          QuickAccessItemType.RelatedFile,
        ].includes(item.type)
      case 'commands':
        return item.type === QuickAccessItemType.Command
      case 'suggestions':
        return item.type === QuickAccessItemType.Suggestion
      default:
        return true
    }
  }

  /**
   * 访问项目
   */
  async accessItem(itemId: string): Promise<void> {
    const item = this.items.get(itemId)
    if (!item)
      return

    // 更新访问统计
    item.accessCount++
    item.lastAccessed = new Date()

    // 执行命令
    try {
      await vscode.commands.executeCommand(item.command, ...(item.args || []))
    }
    catch (error) {
      console.error(`[CCoding] 执行命令失败: ${item.command}`, error)
      vscode.window.showErrorMessage(`执行命令失败: ${item.title}`)
      return
    }

    // 记录事件
    this.recordEvent({
      type: 'item-accessed',
      item,
      timestamp: new Date(),
      context: this.getCurrentContext(),
    })

    // 保存更新
    await this.saveItems()

    console.log(`[CCoding] 访问快速访问项目: ${item.title}`)
  }

  /**
   * 搜索
   */
  search(query: string): void {
    this.currentQuery = query

    this.recordEvent({
      type: 'search',
      query,
      timestamp: new Date(),
      context: this.getCurrentContext(),
    })

    this._onItemsChanged.fire()
  }

  /**
   * 应用过滤器
   */
  applyFilter(filter: string): void {
    this.selectedFilter = filter

    this.recordEvent({
      type: 'filter',
      filter,
      timestamp: new Date(),
      context: this.getCurrentContext(),
    })

    this._onItemsChanged.fire()
  }

  /**
   * 切换分组
   */
  setGroup(groupId: string): void {
    this.currentGroup = groupId

    this.recordEvent({
      type: 'group-changed',
      group: groupId,
      timestamp: new Date(),
      context: this.getCurrentContext(),
    })

    this._onItemsChanged.fire()
  }

  /**
   * 获取统计信息
   */
  getStatistics(): QuickAccessStatistics {
    const items = Array.from(this.items.values())

    const byType: Record<QuickAccessItemType, number> = {} as any
    const byCategory: Record<string, number> = {}

    let totalAccesses = 0

    for (const item of items) {
      byType[item.type] = (byType[item.type] || 0) + 1
      byCategory[item.category] = (byCategory[item.category] || 0) + 1
      totalAccesses += item.accessCount
    }

    const mostAccessed = items
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10)

    const recentlyAdded = items
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
      .slice(0, 10)

    return {
      totalAccesses,
      uniqueItems: items.length,
      averageAccessTime: 0, // 需要实际测量

      byType,
      byCategory,

      accessByHour: Array.from({ length: 24 }).fill(0), // 需要从事件中计算
      accessByDay: Array.from({ length: 7 }).fill(0), // 需要从事件中计算
      accessTrend: [], // 需要从事件中计算

      timeSaved: items.reduce((sum, item) => sum + item.timeSaved, 0),
      clicksSaved: totalAccesses * 2, // 假设每次访问节省2次点击
      averageSearchTime: 0, // 需要实际测量

      mostAccessed,
      recentlyAdded,
      trending: [], // 需要趋势分析

      searchQueries: [], // 需要从事件中提取
      searchSuccessRate: 0, // 需要计算
      averageResultsCount: 0, // 需要计算

      preferredAccessMethod: 'keyboard', // 需要分析
      averageSessionDuration: 0, // 需要会话跟踪
      itemsPerSession: 0, // 需要会话跟踪
    }
  }

  // 私有辅助方法

  private calculatePinnedSymbolScore(pinnedSymbol: any): number {
    return pinnedSymbol.stats.productivityScore + pinnedSymbol.stats.accessCount
  }

  private calculateBookmarkScore(bookmark: any): number {
    let score = bookmark.priority * 20
    score += bookmark.stats.accessCount * 10

    // 最近访问加分
    const daysSinceAccess = (Date.now() - bookmark.stats.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceAccess <= 1)
      score += 30
    else if (daysSinceAccess <= 7)
      score += 10

    return score
  }

  private getSymbolIcon(category: string): string {
    const iconMap: Record<string, string> = {
      component: 'symbol-class',
      hook: 'symbol-event',
      function: 'symbol-function',
      method: 'symbol-method',
      event: 'symbol-method',
      api: 'globe',
      style: 'symbol-color',
    }
    return iconMap[category] || 'symbol-function'
  }

  private getSymbolColor(framework: string): string {
    const colorMap: Record<string, string> = {
      vue: 'charts.green',
      react: 'charts.blue',
      angular: 'charts.red',
    }
    return colorMap[framework] || 'foreground'
  }

  private getBookmarkIcon(_type: string): string {
    return 'bookmark' // 简化版本
  }

  private getBookmarkColor(priority: number): string {
    if (priority >= 5)
      return 'charts.red'
    if (priority >= 4)
      return 'charts.orange'
    if (priority >= 3)
      return 'charts.yellow'
    return 'charts.green'
  }

  private getBookmarkTypeDisplayName(type: string): string {
    return type // 简化版本
  }

  private getFileIcon(extension: string): string {
    const iconMap: Record<string, string> = {
      '.js': 'file-code',
      '.ts': 'file-code',
      '.vue': 'file-code',
      '.jsx': 'file-code',
      '.tsx': 'file-code',
      '.css': 'symbol-color',
      '.scss': 'symbol-color',
      '.json': 'json',
      '.md': 'markdown',
    }
    return iconMap[extension] || 'file'
  }

  private getHotkeyIndex(order: number): number | undefined {
    return order <= 9 ? order : undefined
  }

  private async getRecentFiles(): Promise<Array<{
    uri: vscode.Uri
    name: string
    relativePath: string
    extension: string
    framework?: string
    accessCount: number
    lastAccessed: Date
  }>> {
    // 简化版本 - 实际实现需要跟踪文件访问历史
    return []
  }

  private async generateSmartSuggestions(): Promise<Array<{
    id: string
    title: string
    reason: string
    explanation: string
    command: string
    args?: any[]
    confidence: number
    category: string
  }>> {
    // 简化版本 - 实际实现需要分析用户行为模式
    return []
  }

  private getCurrentContext(): QuickAccessContext {
    const editor = vscode.window.activeTextEditor
    const now = new Date()

    return {
      activeEditor: editor,
      activeDocument: editor?.document,
      cursorPosition: editor?.selection.start,
      selection: editor?.selection,

      workspaceFolder: editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri) : undefined,
      relativePath: editor ? vscode.workspace.asRelativePath(editor.document.uri) : undefined,

      timestamp: now.getTime(),
      timeOfDay: this.getTimeOfDay(now),
      dayOfWeek: now.getDay(),

      sessionDuration: now.getTime() - this.context.globalState.get('sessionStart', now.getTime()),
      actionsInSession: this.events.length,
      filesOpenedInSession: 0, // 需要跟踪
    }
  }

  private getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = date.getHours()
    if (hour < 6)
      return 'night'
    if (hour < 12)
      return 'morning'
    if (hour < 18)
      return 'afternoon'
    if (hour < 22)
      return 'evening'
    return 'night'
  }

  private formatDate(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))

    if (hours < 1)
      return '刚刚'
    if (hours < 24)
      return `${hours}小时前`

    const days = Math.floor(hours / 24)
    if (days < 7)
      return `${days}天前`

    return date.toLocaleDateString('zh-CN')
  }

  private recordEvent(event: QuickAccessEvent): void {
    this.events.push(event)

    // 保持事件历史在限制内
    if (this.events.length > this.maxHistory) {
      this.events = this.events.slice(-this.maxHistory)
    }
  }

  private async loadItems(): Promise<void> {
    try {
      const saved = this.context.globalState.get<any[]>('CCoding.quickAccessItems', [])
      // 实现加载逻辑
      console.log(`[CCoding] 加载快速访问项目: ${saved.length} 个`)
    }
    catch (error) {
      console.error('[CCoding] 加载快速访问项目失败:', error)
    }
  }

  private async saveItems(): Promise<void> {
    try {
      const serialized = Array.from(this.items.values()).map(item => ({
        ...item,
        uri: item.uri?.toString(),
        range: item.range
          ? {
              start: { line: item.range.start.line, character: item.range.start.character },
              end: { line: item.range.end.line, character: item.range.end.character },
            }
          : undefined,
        lastAccessed: item.lastAccessed.toISOString(),
      }))

      await this.context.globalState.update('CCoding.quickAccessItems', serialized)
      console.log(`[CCoding] 保存快速访问项目: ${serialized.length} 个`)
    }
    catch (error) {
      console.error('[CCoding] 保存快速访问项目失败:', error)
    }
  }

  private setupEventListeners(): void {
    // 监听文档打开事件
    vscode.workspace.onDidOpenTextDocument((document) => {
      this.handleDocumentOpen(document)
    })

    // 监听编辑器变化事件
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.handleEditorChange(editor)
    })
  }

  private handleDocumentOpen(_document: vscode.TextDocument): void {
    // 更新最近文件列表
    // 实现逻辑...
  }

  private handleEditorChange(_editor: vscode.TextEditor | undefined): void {
    // 更新上下文相关的推荐
    // 实现逻辑...
  }

  /**
   * 获取快速访问符号（用于数字键快速访问）
   */
  getQuickAccessSymbols(): QuickAccessItem[] {
    const groupedItems = this.getGroupedItems()
    const quickAccessItems: QuickAccessItem[] = []

    // 从各个分组中收集快速访问项目
    for (const [groupId, items] of groupedItems) {
      const group = this.groups.find(g => g.id === groupId)
      if (group && group.priority >= 8) { // 高优先级分组
        quickAccessItems.push(...items.slice(0, Math.min(3, items.length)))
      }
    }

    // 按评分排序并分配快捷键索引
    quickAccessItems.sort((a, b) => b.score - a.score)

    // 为前9个项目分配数字键索引
    quickAccessItems.forEach((item, index) => {
      if (index < 9) {
        item.hotkeyIndex = index + 1
      }
    })

    return quickAccessItems.slice(0, 10) // 最多10个快速访问
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    this.saveItems()
  }
}
