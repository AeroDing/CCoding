import type {
  BookmarkFilter,
  EnhancedBookmark,
} from '../types/bookmarks'
import * as vscode from 'vscode'
import { EnhancedBookmarkManager } from '../services/enhancedBookmarkManager'
import {
  BookmarkPriority,
  BookmarkType,
  BookmarkViewMode,
} from '../types/bookmarks'

/**
 * 增强书签提供器
 * 提供智能分类、多种视图模式和高级功能
 */
export class EnhancedBookmarkProvider implements vscode.TreeDataProvider<EnhancedBookmarkItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<EnhancedBookmarkItem | undefined | null | void>
    = new vscode.EventEmitter<EnhancedBookmarkItem | undefined | null | void>()

  readonly onDidChangeTreeData: vscode.Event<EnhancedBookmarkItem | undefined | null | void>
    = this._onDidChangeTreeData.event

  private bookmarkManager: EnhancedBookmarkManager
  private currentViewMode: BookmarkViewMode = BookmarkViewMode.ByType
  private rootItems: EnhancedBookmarkItem[] = []

  // 状态
  private searchQuery: string = ''
  private activeFilter: BookmarkFilter = {}
  private showStatistics: boolean = false

  constructor(context: vscode.ExtensionContext) {
    this.bookmarkManager = new EnhancedBookmarkManager(context)
    this.refresh()
  }

  /**
   * 刷新书签树
   */
  refresh(): void {
    this.buildTreeStructure()
    this._onDidChangeTreeData.fire()
  }

  /**
   * 构建树形结构
   */
  private buildTreeStructure(): void {
    this.rootItems = []

    // 如果显示统计信息，添加统计项
    if (this.showStatistics) {
      this.rootItems.push(this.createStatisticsItem())
    }

    // 获取过滤后的书签（当前未使用，为将来的增强功能保留）
    // const _filteredBookmarks = this.getFilteredBookmarks()

    // 按当前视图模式分组
    const groupedBookmarks = this.bookmarkManager.getGroupedBookmarks(this.currentViewMode)

    // 创建分组项
    for (const [groupName, bookmarks] of groupedBookmarks) {
      if (bookmarks.length > 0) {
        const groupItem = this.createGroupItem(groupName, bookmarks)
        this.rootItems.push(groupItem)
      }
    }

    // 如果没有书签，显示提示项
    if (this.rootItems.length === 0 || (this.rootItems.length === 1 && this.showStatistics)) {
      this.rootItems.push(this.createEmptyStateItem())
    }
  }

  /**
   * 获取过滤后的书签
   */
  private getFilteredBookmarks(): EnhancedBookmark[] {
    const filter = { ...this.activeFilter }

    // 添加搜索查询
    if (this.searchQuery) {
      filter.query = this.searchQuery
    }

    return this.bookmarkManager.searchBookmarks(filter)
  }

  /**
   * 创建统计信息项
   */
  private createStatisticsItem(): EnhancedBookmarkItem {
    const stats = this.bookmarkManager.getStatistics()
    const item = new EnhancedBookmarkItem(
      `📊 统计信息 (${stats.total} 个书签)`,
      undefined,
      'statistics',
    )

    item.tooltip = this.buildStatisticsTooltip(stats)
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed

    // 创建统计子项
    item.children = [
      new EnhancedBookmarkItem(`总数: ${stats.total}`, undefined, 'stat-item'),
      new EnhancedBookmarkItem(`总访问: ${stats.totalAccesses} 次`, undefined, 'stat-item'),
      new EnhancedBookmarkItem(`平均访问: ${stats.averageAccessesPerBookmark.toFixed(1)} 次/书签`, undefined, 'stat-item'),
      new EnhancedBookmarkItem(`健康度: ${stats.healthScore.toFixed(0)}%`, undefined, 'stat-item'),
    ]

    return item
  }

  /**
   * 创建分组项
   */
  private createGroupItem(groupName: string, bookmarks: EnhancedBookmark[]): EnhancedBookmarkItem {
    const item = new EnhancedBookmarkItem(
      `${groupName} (${bookmarks.length})`,
      undefined,
      'group',
    )

    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    item.iconPath = this.getGroupIcon(groupName)
    item.tooltip = `${groupName} - ${bookmarks.length} 个书签`

    // 创建书签子项
    item.children = bookmarks.map(bookmark => this.createBookmarkItem(bookmark))

    return item
  }

  /**
   * 创建书签项
   */
  private createBookmarkItem(bookmark: EnhancedBookmark): EnhancedBookmarkItem {
    const item = new EnhancedBookmarkItem(bookmark.label, bookmark, 'bookmark')

    // 设置显示信息
    item.description = this.buildBookmarkDescription(bookmark)
    item.tooltip = this.buildBookmarkTooltip(bookmark)
    item.iconPath = this.getBookmarkIcon(bookmark)

    // 设置命令
    item.command = {
      command: 'CCoding.openBookmark',
      title: 'Open Bookmark',
      arguments: [bookmark.id],
    }

    // 如果有子书签，设置为可展开
    if (bookmark.childBookmarks.length > 0) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
      // 这里可以加载子书签...
    }

    return item
  }

  /**
   * 创建空状态项
   */
  private createEmptyStateItem(): EnhancedBookmarkItem {
    const message = this.searchQuery || Object.keys(this.activeFilter).length > 0
      ? '📭 没有找到匹配的书签'
      : '📚 还没有书签，开始添加第一个吧！'

    const item = new EnhancedBookmarkItem(message, undefined, 'empty-state')
    item.tooltip = '点击添加书签按钮或使用快捷键创建第一个书签'
    return item
  }

  /**
   * 构建书签描述
   */
  private buildBookmarkDescription(bookmark: EnhancedBookmark): string {
    const parts: string[] = []

    // 行号
    parts.push(`L${bookmark.lineNumber}`)

    // 优先级指示器
    const priorityIcon = this.getPriorityIcon(bookmark.priority)
    if (priorityIcon) {
      parts.push(priorityIcon)
    }

    // 使用频率
    if (bookmark.stats.accessCount > 0) {
      parts.push(`${bookmark.stats.accessCount}次`)
    }

    // 收藏标记
    if (bookmark.stats.isFavorite) {
      parts.push('⭐')
    }

    // 临时标记
    if (bookmark.isTemporary) {
      parts.push('⏱️')
    }

    // 共享标记
    if (bookmark.isShared) {
      parts.push('👥')
    }

    return parts.join(' · ')
  }

  /**
   * 构建书签提示信息
   */
  private buildBookmarkTooltip(bookmark: EnhancedBookmark): string {
    const lines: string[] = []

    // 基本信息
    lines.push(`📚 ${bookmark.label}`)
    if (bookmark.description) {
      lines.push(`📝 ${bookmark.description}`)
    }

    // 位置信息
    lines.push(`📍 ${bookmark.relativePath}:${bookmark.lineNumber}`)

    // 类型和优先级
    lines.push(`🏷️ 类型: ${this.getTypeDisplayName(bookmark.type)}`)
    lines.push(`⭐ 优先级: ${this.getPriorityDisplayName(bookmark.priority)}`)

    // 框架信息
    if (bookmark.framework !== 'general') {
      lines.push(`⚛️ 框架: ${bookmark.framework.toUpperCase()}`)
    }

    // 统计信息
    lines.push('')
    lines.push(`📊 统计信息:`)
    lines.push(`  访问次数: ${bookmark.stats.accessCount}`)
    if (bookmark.stats.accessCount > 0) {
      lines.push(`  最后访问: ${this.formatDate(bookmark.stats.lastAccessed)}`)
      lines.push(`  平均会话: ${bookmark.stats.averageSessionTime.toFixed(1)}秒`)
    }
    lines.push(`  创建时间: ${this.formatDate(bookmark.stats.createdAt)}`)

    // 标签
    if (bookmark.tags.length > 0) {
      lines.push('')
      lines.push(`🏷️ 标签: ${bookmark.tags.join(', ')}`)
    }

    // 代码预览
    if (bookmark.codePreview) {
      lines.push('')
      lines.push('📄 代码预览:')
      lines.push(bookmark.codePreview)
    }

    // 相关信息
    if (bookmark.relatedBookmarks.length > 0) {
      lines.push('')
      lines.push(`🔗 相关书签: ${bookmark.relatedBookmarks.length} 个`)
    }

    return lines.join('\n')
  }

  /**
   * 构建统计信息提示
   */
  private buildStatisticsTooltip(stats: any): string {
    const lines: string[] = []

    lines.push('📊 书签统计信息')
    lines.push('')
    lines.push(`总书签数: ${stats.total}`)
    lines.push(`总访问数: ${stats.totalAccesses}`)
    lines.push(`平均访问: ${stats.averageAccessesPerBookmark.toFixed(1)} 次/书签`)
    lines.push(`健康度评分: ${stats.healthScore.toFixed(0)}%`)

    // 按类型统计
    lines.push('')
    lines.push('按类型分布:')
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > 0) {
        lines.push(`  ${this.getTypeDisplayName(type as BookmarkType)}: ${count}`)
      }
    }

    // 最常用书签
    if (stats.mostUsedBookmarks.length > 0) {
      lines.push('')
      lines.push('最常用书签:')
      stats.mostUsedBookmarks.slice(0, 5).forEach((bookmark: EnhancedBookmark) => {
        lines.push(`  ${bookmark.label} (${bookmark.stats.accessCount}次)`)
      })
    }

    return lines.join('\n')
  }

  /**
   * 获取分组图标
   */
  private getGroupIcon(groupName: string): vscode.ThemeIcon {
    if (groupName.includes('组件'))
      return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('charts.green'))
    if (groupName.includes('函数'))
      return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('charts.blue'))
    if (groupName.includes('Hook'))
      return new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('charts.purple'))
    if (groupName.includes('事件'))
      return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.orange'))
    if (groupName.includes('API'))
      return new vscode.ThemeIcon('globe', new vscode.ThemeColor('charts.green'))
    if (groupName.includes('路由'))
      return new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.yellow'))
    if (groupName.includes('状态'))
      return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.red'))
    if (groupName.includes('样式'))
      return new vscode.ThemeIcon('symbol-color', new vscode.ThemeColor('charts.purple'))
    if (groupName.includes('配置'))
      return new vscode.ThemeIcon('gear', new vscode.ThemeColor('charts.blue'))
    if (groupName.includes('收藏'))
      return new vscode.ThemeIcon('star', new vscode.ThemeColor('charts.yellow'))
    if (groupName.includes('最近'))
      return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.green'))
    if (groupName.includes('临时'))
      return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.orange'))

    return new vscode.ThemeIcon('folder')
  }

  /**
   * 获取书签图标
   */
  private getBookmarkIcon(bookmark: EnhancedBookmark): vscode.ThemeIcon {
    const iconMap: Record<BookmarkType, { icon: string, color: string }> = {
      [BookmarkType.Component]: { icon: 'symbol-class', color: 'charts.green' },
      [BookmarkType.Function]: { icon: 'symbol-function', color: 'charts.blue' },
      [BookmarkType.Hook]: { icon: 'symbol-event', color: 'charts.purple' },
      [BookmarkType.Event]: { icon: 'symbol-method', color: 'charts.orange' },
      [BookmarkType.API]: { icon: 'globe', color: 'charts.green' },
      [BookmarkType.Route]: { icon: 'symbol-namespace', color: 'charts.yellow' },
      [BookmarkType.State]: { icon: 'database', color: 'charts.red' },
      [BookmarkType.Style]: { icon: 'symbol-color', color: 'charts.purple' },
      [BookmarkType.Config]: { icon: 'gear', color: 'charts.blue' },
      [BookmarkType.Documentation]: { icon: 'book', color: 'charts.blue' },
      [BookmarkType.Bug]: { icon: 'bug', color: 'charts.red' },
      [BookmarkType.Todo]: { icon: 'check', color: 'charts.yellow' },
      [BookmarkType.Important]: { icon: 'star', color: 'charts.yellow' },
      [BookmarkType.General]: { icon: 'bookmark', color: 'foreground' },
    }

    const typeIcon = iconMap[bookmark.type] || iconMap[BookmarkType.General]
    return new vscode.ThemeIcon(typeIcon.icon, new vscode.ThemeColor(typeIcon.color))
  }

  /**
   * 获取优先级图标
   */
  private getPriorityIcon(priority: BookmarkPriority): string {
    switch (priority) {
      case BookmarkPriority.Critical: return '🔴'
      case BookmarkPriority.High: return '🟠'
      case BookmarkPriority.Medium: return '🟡'
      case BookmarkPriority.Low: return '🟢'
      case BookmarkPriority.Minimal: return '⚪'
      default: return ''
    }
  }

  /**
   * 获取类型显示名称
   */
  private getTypeDisplayName(type: BookmarkType | string): string {
    const names: Record<string, string> = {
      [BookmarkType.Component]: '组件',
      [BookmarkType.Function]: '函数',
      [BookmarkType.Hook]: 'Hook',
      [BookmarkType.Event]: '事件',
      [BookmarkType.API]: 'API',
      [BookmarkType.Route]: '路由',
      [BookmarkType.State]: '状态',
      [BookmarkType.Style]: '样式',
      [BookmarkType.Config]: '配置',
      [BookmarkType.Documentation]: '文档',
      [BookmarkType.Bug]: 'Bug',
      [BookmarkType.Todo]: 'TODO',
      [BookmarkType.Important]: '重要',
      [BookmarkType.General]: '一般',
    }
    return names[type] || '一般'
  }

  /**
   * 获取优先级显示名称
   */
  private getPriorityDisplayName(priority: BookmarkPriority): string {
    const names: Record<BookmarkPriority, string> = {
      [BookmarkPriority.Critical]: '极重要',
      [BookmarkPriority.High]: '重要',
      [BookmarkPriority.Medium]: '中等',
      [BookmarkPriority.Low]: '较低',
      [BookmarkPriority.Minimal]: '最低',
    }
    return names[priority]
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60))
        return `${minutes}分钟前`
      }
      return `${hours}小时前`
    }
    else if (days < 7) {
      return `${days}天前`
    }
    else {
      return date.toLocaleDateString('zh-CN')
    }
  }

  // TreeDataProvider 接口实现
  getTreeItem(element: EnhancedBookmarkItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: EnhancedBookmarkItem): Thenable<EnhancedBookmarkItem[]> {
    if (!element) {
      return Promise.resolve(this.rootItems)
    }

    if (element.children) {
      return Promise.resolve(element.children)
    }

    return Promise.resolve([])
  }

  // 公共方法

  /**
   * 切换视图模式
   */
  setViewMode(mode: BookmarkViewMode): void {
    if (this.currentViewMode !== mode) {
      this.currentViewMode = mode
      this.refresh()
    }
  }

  /**
   * 搜索书签
   */
  searchBookmarks(query: string): void {
    this.searchQuery = query.trim()
    this.refresh()
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    if (this.searchQuery) {
      this.searchQuery = ''
      this.refresh()
    }
  }

  /**
   * 应用过滤器
   */
  applyFilter(filter: BookmarkFilter): void {
    this.activeFilter = filter
    this.refresh()
  }

  /**
   * 清除过滤器
   */
  clearFilter(): void {
    this.activeFilter = {}
    this.refresh()
  }

  /**
   * 切换统计信息显示
   */
  toggleStatistics(): void {
    this.showStatistics = !this.showStatistics
    this.refresh()
  }

  /**
   * 添加书签
   */
  async addBookmark(uri?: vscode.Uri, range?: vscode.Range): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor && !uri) {
      vscode.window.showErrorMessage('没有活动的编辑器')
      return
    }

    const targetUri = uri || editor!.document.uri
    const targetRange = range || editor!.selection

    try {
      const bookmark = await this.bookmarkManager.createBookmark(targetUri, targetRange)
      this.refresh()
      vscode.window.showInformationMessage(`书签 "${bookmark.label}" 已创建`)
    }
    catch (error) {
      vscode.window.showErrorMessage(`创建书签失败: ${error}`)
    }
  }

  /**
   * 打开书签
   */
  async openBookmark(bookmarkId: string): Promise<void> {
    try {
      await this.bookmarkManager.accessBookmark(bookmarkId)
      // 这里可以添加实际的打开逻辑
      this.refresh() // 刷新以更新统计信息
    }
    catch (error) {
      vscode.window.showErrorMessage(`打开书签失败: ${error}`)
    }
  }

  /**
   * 获取书签管理器
   */
  getBookmarkManager(): EnhancedBookmarkManager {
    return this.bookmarkManager
  }
}

/**
 * 增强书签项
 */
export class EnhancedBookmarkItem extends vscode.TreeItem {
  public children?: EnhancedBookmarkItem[]
  public bookmark?: EnhancedBookmark
  public itemType: 'bookmark' | 'group' | 'statistics' | 'stat-item' | 'empty-state'

  constructor(
    label: string,
    bookmark?: EnhancedBookmark,
    itemType: 'bookmark' | 'group' | 'statistics' | 'stat-item' | 'empty-state' = 'bookmark',
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)

    this.bookmark = bookmark
    this.itemType = itemType
    this.contextValue = `enhancedBookmark-${itemType}`

    // 设置基本属性
    if (bookmark) {
      this.resourceUri = bookmark.uri
    }
  }
}
