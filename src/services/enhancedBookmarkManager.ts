import type {
  BookmarkFilter,
  BookmarkGroup,
  BookmarkOperation,
  BookmarkStatistics,
  BookmarkUsageStats,
  EnhancedBookmark,
} from '../types/bookmarks'
import * as path from 'node:path'
import * as vscode from 'vscode'
import {
  BookmarkPriority,
  BookmarkType,
  BookmarkViewMode,
} from '../types/bookmarks'
import { FrameworkType } from '../types/frontendSymbols'

/**
 * 增强的书签管理器
 * 提供智能分类、标签系统、使用统计和推荐功能
 */
export class EnhancedBookmarkManager {
  private bookmarks: Map<string, EnhancedBookmark> = new Map()
  private operations: BookmarkOperation[] = []
  private context: vscode.ExtensionContext
  private currentViewMode: BookmarkViewMode = BookmarkViewMode.ByType

  // 配置
  private maxOperationHistory = 1000
  private autoCleanupDays = 30
  private suggestionCooldown = 60 * 1000 // 1分钟

  // 缓存
  private groupsCache: Map<BookmarkViewMode, BookmarkGroup[]> = new Map()
  private lastSuggestionTime = 0

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.loadBookmarks()
    this.setupAutoCleanup()
  }

  /**
   * 加载书签数据
   */
  private async loadBookmarks(): Promise<void> {
    try {
      const saved = this.context.globalState.get<any[]>('CCoding.enhancedBookmarks', [])
      console.log(`[CCoding] 加载增强书签: ${saved.length} 个`)

      for (const data of saved) {
        if (this.isValidBookmarkData(data)) {
          const bookmark = this.deserializeBookmark(data)
          this.bookmarks.set(bookmark.id, bookmark)
        }
      }

      console.log(`[CCoding] 成功加载 ${this.bookmarks.size} 个增强书签`)
    }
    catch (error) {
      console.error('[CCoding] 加载增强书签失败:', error)
    }
  }

  /**
   * 保存书签数据
   */
  private async saveBookmarks(): Promise<void> {
    try {
      const serialized = Array.from(this.bookmarks.values()).map(bookmark =>
        this.serializeBookmark(bookmark),
      )

      await this.context.globalState.update('CCoding.enhancedBookmarks', serialized)
      console.log(`[CCoding] 保存增强书签: ${serialized.length} 个`)
    }
    catch (error) {
      console.error('[CCoding] 保存增强书签失败:', error)
      throw error
    }
  }

  /**
   * 创建书签
   */
  async createBookmark(
    uri: vscode.Uri,
    range: vscode.Range,
    options: {
      label?: string
      description?: string
      type?: BookmarkType
      priority?: BookmarkPriority
      tags?: string[]
      isTemporary?: boolean
    } = {},
  ): Promise<EnhancedBookmark> {
    const document = await vscode.workspace.openTextDocument(uri)
    const lineText = document.lineAt(range.start.line).text
    const codePreview = this.extractCodePreview(document, range)

    // 智能检测书签类型和标签
    const detectedInfo = await this.detectBookmarkInfo(document, range, lineText)

    const bookmark: EnhancedBookmark = {
      id: this.generateBookmarkId(),
      label: options.label || detectedInfo.suggestedLabel || `Bookmark at line ${range.start.line + 1}`,
      description: options.description,
      uri,
      range,

      type: options.type || detectedInfo.type || BookmarkType.General,
      priority: options.priority || detectedInfo.priority || BookmarkPriority.Medium,
      tags: [...(options.tags || []), ...detectedInfo.tags],
      category: detectedInfo.category,

      framework: this.detectFramework(document),
      projectPath: this.getProjectPath(uri),
      relativePath: vscode.workspace.asRelativePath(uri),

      symbolName: detectedInfo.symbolName,
      symbolType: detectedInfo.symbolType,
      codePreview,
      lineNumber: range.start.line + 1,

      stats: this.createInitialStats(),

      relatedFiles: [],
      relatedBookmarks: [],
      parentBookmark: undefined,
      childBookmarks: [],

      isShared: false,
      comments: [],

      isTemporary: options.isTemporary || false,
      isArchived: false,
      expiresAt: options.isTemporary ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,

      timestamp: Date.now(),
      version: 1,
      lastModified: new Date(),
    }

    // 查找相关书签
    bookmark.relatedBookmarks = this.findRelatedBookmarks(bookmark)

    this.bookmarks.set(bookmark.id, bookmark)
    await this.saveBookmarks()

    this.recordOperation('create', bookmark.id, { bookmark })

    console.log(`[CCoding] 创建增强书签: ${bookmark.label} (${bookmark.type})`)
    return bookmark
  }

  /**
   * 智能检测书签信息
   */
  private async detectBookmarkInfo(
    document: vscode.TextDocument,
    range: vscode.Range,
    lineText: string,
  ): Promise<{
    type: BookmarkType
    priority: BookmarkPriority
    tags: string[]
    category: string
    suggestedLabel: string
    symbolName?: string
    symbolType?: string
  }> {
    const content = lineText.trim()
    const fileName = path.basename(document.fileName).toLowerCase()

    let type = BookmarkType.General
    let priority = BookmarkPriority.Medium
    const tags: string[] = []
    let category = 'general'
    let suggestedLabel = content.length > 50 ? `${content.substring(0, 50)}...` : content
    let symbolName: string | undefined
    let symbolType: string | undefined

    // 检测组件定义
    if (content.includes('defineComponent') || content.includes('createComponent') || /^export\s+(?:default\s+)?function\s+[A-Z]/.test(content)) {
      type = BookmarkType.Component
      priority = BookmarkPriority.Critical
      tags.push('component')
      category = 'component'

      const match = content.match(/(?:function\s+|const\s+)([A-Z][a-zA-Z0-9]*)/)
      if (match) {
        symbolName = match[1]
        symbolType = 'component'
        suggestedLabel = `组件: ${symbolName}`
      }
    }

    // 检测 Hook
    else if (content.includes('use') && (content.includes('useState') || content.includes('useEffect') || /^export\s+function\s+use[A-Z]/.test(content))) {
      type = BookmarkType.Hook
      priority = BookmarkPriority.High
      tags.push('hook', 'react')
      category = 'hook'

      const match = content.match(/(?:function\s+|const\s+)(use[A-Z][a-zA-Z0-9]*)/)
      if (match) {
        symbolName = match[1]
        symbolType = 'hook'
        suggestedLabel = `Hook: ${symbolName}`
      }
    }

    // 检测事件处理器
    else if (/\b(?:on[A-Z]|handle[A-Z]|click|change|submit)\b/.test(content)) {
      type = BookmarkType.Event
      priority = BookmarkPriority.Medium
      tags.push('event', 'handler')
      category = 'event'

      const match = content.match(/\b(on[A-Z][a-zA-Z0-9]*|handle[A-Z][a-zA-Z0-9]*)\b/)
      if (match) {
        symbolName = match[1]
        symbolType = 'event-handler'
        suggestedLabel = `事件: ${symbolName}`
      }
    }

    // 检测 API 调用
    else if (content.includes('fetch') || content.includes('axios') || content.includes('api') || content.includes('request')) {
      type = BookmarkType.API
      priority = BookmarkPriority.High
      tags.push('api', 'network')
      category = 'api'
      suggestedLabel = 'API 调用'
    }

    // 检测路由
    else if (content.includes('router') || content.includes('route') || content.includes('navigate')) {
      type = BookmarkType.Route
      priority = BookmarkPriority.Medium
      tags.push('router', 'navigation')
      category = 'route'
      suggestedLabel = '路由'
    }

    // 检测状态管理
    else if (content.includes('store') || content.includes('state') || content.includes('redux') || content.includes('vuex')) {
      type = BookmarkType.State
      priority = BookmarkPriority.High
      tags.push('state', 'store')
      category = 'state'
      suggestedLabel = '状态管理'
    }

    // 检测样式
    else if (fileName.includes('.css') || fileName.includes('.scss') || fileName.includes('.less') || content.includes('styled')) {
      type = BookmarkType.Style
      priority = BookmarkPriority.Low
      tags.push('style', 'css')
      category = 'style'
      suggestedLabel = '样式'
    }

    // 检测配置
    else if (fileName.includes('config') || fileName.includes('.json') || content.includes('export default {')) {
      type = BookmarkType.Config
      priority = BookmarkPriority.Medium
      tags.push('config', 'settings')
      category = 'config'
      suggestedLabel = '配置'
    }

    // 检测 TODO 和 Bug
    if (content.toLowerCase().includes('todo') || content.toLowerCase().includes('fixme')) {
      type = BookmarkType.Todo
      priority = BookmarkPriority.Medium
      tags.push('todo')
      suggestedLabel = `TODO: ${content.replace(/\/\/|\/\*|\*\/|<!--|-->/g, '').trim()}`
    }

    if (content.toLowerCase().includes('bug') || content.toLowerCase().includes('fix')) {
      type = BookmarkType.Bug
      priority = BookmarkPriority.High
      tags.push('bug', 'fix')
      suggestedLabel = `Bug: ${content.replace(/\/\/|\/\*|\*\/|<!--|-->/g, '').trim()}`
    }

    // 根据框架添加标签
    const framework = this.detectFramework(document)
    if (framework !== FrameworkType.General) {
      tags.push(framework.toLowerCase())
    }

    // 根据优先级关键词调整优先级
    if (content.toLowerCase().includes('important') || content.toLowerCase().includes('critical')) {
      priority = BookmarkPriority.Critical
      tags.push('important')
    }

    return {
      type,
      priority,
      tags: [...new Set(tags)], // 去重
      category,
      suggestedLabel,
      symbolName,
      symbolType,
    }
  }

  /**
   * 检测框架类型
   */
  private detectFramework(document: vscode.TextDocument): FrameworkType {
    const fileName = document.fileName.toLowerCase()
    const content = document.getText()

    if (fileName.endsWith('.vue'))
      return FrameworkType.Vue
    if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx'))
      return FrameworkType.React

    if (content.includes('vue') || content.includes('@vue/'))
      return FrameworkType.Vue
    if (content.includes('react') || content.includes('@react/'))
      return FrameworkType.React

    return FrameworkType.General
  }

  /**
   * 提取代码预览
   */
  private extractCodePreview(document: vscode.TextDocument, range: vscode.Range): string {
    const startLine = Math.max(0, range.start.line - 1)
    const endLine = Math.min(document.lineCount - 1, range.end.line + 1)

    const lines: string[] = []
    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i).text
      const prefix = i === range.start.line ? '➤ ' : '  '
      lines.push(prefix + line)
    }

    return lines.join('\n')
  }

  /**
   * 创建初始使用统计
   */
  private createInitialStats(): BookmarkUsageStats {
    const now = new Date()
    return {
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      averageSessionTime: 0,
      daysSinceLastAccess: 0,
      accessFrequency: 0,
      isRecent: true,
      isFavorite: false,
    }
  }

  /**
   * 查找相关书签
   */
  private findRelatedBookmarks(bookmark: EnhancedBookmark): string[] {
    const related: string[] = []
    const sameFileBookmarks = this.getBookmarksByFile(bookmark.uri.toString())

    for (const other of sameFileBookmarks) {
      if (other.id !== bookmark.id) {
        // 同一文件的书签
        related.push(other.id)
      }
    }

    // 相同类型和标签的书签
    for (const [id, other] of this.bookmarks) {
      if (id !== bookmark.id) {
        if (other.type === bookmark.type
          || other.tags.some(tag => bookmark.tags.includes(tag))) {
          related.push(id)
        }
      }
    }

    return [...new Set(related)].slice(0, 10) // 最多10个相关书签
  }

  /**
   * 访问书签（更新统计信息）
   */
  async accessBookmark(bookmarkId: string): Promise<void> {
    const bookmark = this.bookmarks.get(bookmarkId)
    if (!bookmark)
      return

    const now = new Date()
    const sessionStart = Date.now()

    // 更新统计信息
    bookmark.stats.accessCount++
    bookmark.stats.lastAccessed = now
    bookmark.stats.daysSinceLastAccess = 0
    bookmark.stats.isRecent = true

    // 计算访问频率（简化版本）
    const daysSinceCreated = (now.getTime() - bookmark.stats.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    bookmark.stats.accessFrequency = bookmark.stats.accessCount / Math.max(1, daysSinceCreated)

    // 检查是否成为收藏
    if (bookmark.stats.accessCount >= 5 && bookmark.stats.accessFrequency > 0.1) {
      bookmark.stats.isFavorite = true
    }

    await this.saveBookmarks()
    this.recordOperation('access', bookmarkId, { timestamp: now })

    // 模拟会话时间计算（实际应该在失去焦点时计算）
    setTimeout(() => {
      const sessionTime = (Date.now() - sessionStart) / 1000
      bookmark.stats.averageSessionTime
        = (bookmark.stats.averageSessionTime * (bookmark.stats.accessCount - 1) + sessionTime) / bookmark.stats.accessCount
    }, 5000)
  }

  /**
   * 按视图模式获取分组的书签
   */
  getGroupedBookmarks(viewMode: BookmarkViewMode): Map<string, EnhancedBookmark[]> {
    this.currentViewMode = viewMode
    const groups = new Map<string, EnhancedBookmark[]>()
    const bookmarkArray = Array.from(this.bookmarks.values())

    switch (viewMode) {
      case BookmarkViewMode.ByType:
        this.groupByType(bookmarkArray, groups)
        break
      case BookmarkViewMode.ByFile:
        this.groupByFile(bookmarkArray, groups)
        break
      case BookmarkViewMode.ByPriority:
        this.groupByPriority(bookmarkArray, groups)
        break
      case BookmarkViewMode.ByFramework:
        this.groupByFramework(bookmarkArray, groups)
        break
      case BookmarkViewMode.Recent:
        this.groupRecent(bookmarkArray, groups)
        break
      case BookmarkViewMode.Favorites:
        this.groupFavorites(bookmarkArray, groups)
        break
      case BookmarkViewMode.Temporary:
        this.groupTemporary(bookmarkArray, groups)
        break
      default:
        this.groupByType(bookmarkArray, groups)
    }

    return groups
  }

  /**
   * 按类型分组
   */
  private groupByType(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    for (const bookmark of bookmarks) {
      const key = this.getTypeDisplayName(bookmark.type)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(bookmark)
    }

    // 排序每个分组
    for (const [_key, bookmarkList] of groups) {
      bookmarkList.sort((a, b) => {
        // 按优先级降序，然后按访问次数降序
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return b.stats.accessCount - a.stats.accessCount
      })
    }
  }

  /**
   * 按文件分组
   */
  private groupByFile(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    for (const bookmark of bookmarks) {
      const key = bookmark.relativePath
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(bookmark)
    }

    // 按行号排序
    for (const [_key, bookmarkList] of groups) {
      bookmarkList.sort((a, b) => a.lineNumber - b.lineNumber)
    }
  }

  /**
   * 按优先级分组
   */
  private groupByPriority(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    for (const bookmark of bookmarks) {
      const key = this.getPriorityDisplayName(bookmark.priority)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(bookmark)
    }
  }

  /**
   * 按框架分组
   */
  private groupByFramework(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    for (const bookmark of bookmarks) {
      const key = bookmark.framework === FrameworkType.General
        ? '通用'
        : bookmark.framework.toUpperCase()
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(bookmark)
    }
  }

  /**
   * 分组最近使用
   */
  private groupRecent(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    const recent = bookmarks
      .filter(b => b.stats.isRecent)
      .sort((a, b) => b.stats.lastAccessed.getTime() - a.stats.lastAccessed.getTime())
      .slice(0, 50)

    groups.set('最近使用', recent)
  }

  /**
   * 分组收藏夹
   */
  private groupFavorites(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    const favorites = bookmarks
      .filter(b => b.stats.isFavorite)
      .sort((a, b) => b.stats.accessFrequency - a.stats.accessFrequency)

    groups.set('收藏夹', favorites)
  }

  /**
   * 分组临时书签
   */
  private groupTemporary(bookmarks: EnhancedBookmark[], groups: Map<string, EnhancedBookmark[]>): void {
    const temporary = bookmarks
      .filter(b => b.isTemporary && !b.isArchived)
      .sort((a, b) => (b.expiresAt?.getTime() || 0) - (a.expiresAt?.getTime() || 0))

    groups.set('临时书签', temporary)
  }

  /**
   * 搜索书签
   */
  searchBookmarks(filter: BookmarkFilter): EnhancedBookmark[] {
    let results = Array.from(this.bookmarks.values())

    // 文本搜索
    if (filter.query) {
      const query = filter.query.toLowerCase()
      results = results.filter(bookmark =>
        bookmark.label.toLowerCase().includes(query)
        || bookmark.description?.toLowerCase().includes(query)
        || bookmark.tags.some(tag => tag.toLowerCase().includes(query))
        || bookmark.codePreview.toLowerCase().includes(query)
        || bookmark.relativePath.toLowerCase().includes(query),
      )
    }

    // 类型过滤
    if (filter.types && filter.types.length > 0) {
      results = results.filter(bookmark => filter.types!.includes(bookmark.type))
    }

    // 优先级过滤
    if (filter.priorities && filter.priorities.length > 0) {
      results = results.filter(bookmark => filter.priorities!.includes(bookmark.priority))
    }

    // 标签过滤
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(bookmark =>
        filter.tags!.some(tag => bookmark.tags.includes(tag)),
      )
    }

    // 框架过滤
    if (filter.frameworks && filter.frameworks.length > 0) {
      results = results.filter(bookmark => filter.frameworks!.includes(bookmark.framework))
    }

    // 使用频率过滤
    if (filter.usageThreshold !== undefined) {
      results = results.filter(bookmark => bookmark.stats.accessCount >= filter.usageThreshold!)
    }

    // 其他布尔过滤器
    if (filter.isRecent !== undefined) {
      results = results.filter(bookmark => bookmark.stats.isRecent === filter.isRecent)
    }

    if (filter.isFavorite !== undefined) {
      results = results.filter(bookmark => bookmark.stats.isFavorite === filter.isFavorite)
    }

    if (filter.isShared !== undefined) {
      results = results.filter(bookmark => bookmark.isShared === filter.isShared)
    }

    if (filter.isTemporary !== undefined) {
      results = results.filter(bookmark => bookmark.isTemporary === filter.isTemporary)
    }

    // 日期范围过滤
    if (filter.dateRange) {
      results = results.filter((bookmark) => {
        const bookmarkDate = new Date(bookmark.timestamp)
        return bookmarkDate >= filter.dateRange!.start && bookmarkDate <= filter.dateRange!.end
      })
    }

    return results
  }

  /**
   * 获取统计信息
   */
  getStatistics(): BookmarkStatistics {
    const bookmarks = Array.from(this.bookmarks.values())

    const byType: Record<BookmarkType, number> = {} as any
    const byPriority: Record<BookmarkPriority, number> = {} as any
    const byFramework: Record<FrameworkType, number> = {} as any

    let totalAccesses = 0

    for (const bookmark of bookmarks) {
      byType[bookmark.type] = (byType[bookmark.type] || 0) + 1
      byPriority[bookmark.priority] = (byPriority[bookmark.priority] || 0) + 1
      byFramework[bookmark.framework] = (byFramework[bookmark.framework] || 0) + 1
      totalAccesses += bookmark.stats.accessCount
    }

    const mostUsed = bookmarks
      .sort((a, b) => b.stats.accessCount - a.stats.accessCount)
      .slice(0, 10)

    const recentlyAdded = bookmarks
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)

    const oldest = bookmarks
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10)

    return {
      total: bookmarks.length,
      byType,
      byPriority,
      byFramework,
      totalAccesses,
      averageAccessesPerBookmark: totalAccesses / Math.max(1, bookmarks.length),
      mostUsedBookmarks: mostUsed,
      recentlyAddedBookmarks: recentlyAdded,
      oldestBookmarks: oldest,
      largestGroups: [],
      healthScore: this.calculateHealthScore(bookmarks),
    }
  }

  /**
   * 计算健康度评分
   */
  private calculateHealthScore(bookmarks: EnhancedBookmark[]): number {
    if (bookmarks.length === 0)
      return 100

    let score = 100
    const now = Date.now()
    let unusedCount = 0
    let outdatedCount = 0

    for (const bookmark of bookmarks) {
      // 长期未使用的书签减分
      const daysSinceAccess = (now - bookmark.stats.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceAccess > 30) {
        unusedCount++
      }

      // 过期的临时书签减分
      if (bookmark.isTemporary && bookmark.expiresAt && bookmark.expiresAt < new Date()) {
        outdatedCount++
      }
    }

    // 计算减分
    const unusedPenalty = (unusedCount / bookmarks.length) * 30
    const outdatedPenalty = (outdatedCount / bookmarks.length) * 20

    score -= unusedPenalty + outdatedPenalty

    return Math.max(0, Math.min(100, score))
  }

  // 辅助方法

  private generateBookmarkId(): string {
    return `bookmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getProjectPath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    return workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(uri.fsPath)
  }

  private getBookmarksByFile(fileUri: string): EnhancedBookmark[] {
    return Array.from(this.bookmarks.values()).filter(bookmark =>
      bookmark.uri.toString() === fileUri,
    )
  }

  private getTypeDisplayName(type: BookmarkType): string {
    const names: Record<BookmarkType, string> = {
      [BookmarkType.Component]: '🏗️ 组件',
      [BookmarkType.Function]: '⚙️ 函数',
      [BookmarkType.Hook]: '🪝 Hooks',
      [BookmarkType.Event]: '🎯 事件',
      [BookmarkType.API]: '🌐 API',
      [BookmarkType.Route]: '🛣️ 路由',
      [BookmarkType.State]: '📊 状态',
      [BookmarkType.Style]: '🎨 样式',
      [BookmarkType.Config]: '⚙️ 配置',
      [BookmarkType.Documentation]: '📚 文档',
      [BookmarkType.Bug]: '🐛 Bug',
      [BookmarkType.Todo]: '📝 TODO',
      [BookmarkType.Important]: '⭐ 重要',
      [BookmarkType.General]: '📋 一般',
    }
    return names[type] || '📋 一般'
  }

  private getPriorityDisplayName(priority: BookmarkPriority): string {
    const names: Record<BookmarkPriority, string> = {
      [BookmarkPriority.Critical]: '🔴 极重要',
      [BookmarkPriority.High]: '🟠 重要',
      [BookmarkPriority.Medium]: '🟡 中等',
      [BookmarkPriority.Low]: '🟢 较低',
      [BookmarkPriority.Minimal]: '⚪ 最低',
    }
    return names[priority]
  }

  private recordOperation(type: BookmarkOperation['type'], bookmarkId: string, details: any): void {
    const operation: BookmarkOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      bookmarkId,
      timestamp: new Date(),
      details,
      undoable: ['create', 'update', 'delete'].includes(type),
    }

    this.operations.push(operation)

    // 保持操作历史在限制内
    if (this.operations.length > this.maxOperationHistory) {
      this.operations = this.operations.slice(-this.maxOperationHistory)
    }
  }

  private isValidBookmarkData(data: any): boolean {
    return data
      && typeof data.id === 'string'
      && typeof data.label === 'string'
      && data.uri
      && data.range
      && data.type
      && data.priority !== undefined
  }

  private serializeBookmark(bookmark: EnhancedBookmark): any {
    return {
      ...bookmark,
      uri: bookmark.uri.toString(),
      range: {
        start: { line: bookmark.range.start.line, character: bookmark.range.start.character },
        end: { line: bookmark.range.end.line, character: bookmark.range.end.character },
      },
      stats: {
        ...bookmark.stats,
        lastAccessed: bookmark.stats.lastAccessed.toISOString(),
        createdAt: bookmark.stats.createdAt.toISOString(),
      },
      lastModified: bookmark.lastModified.toISOString(),
      expiresAt: bookmark.expiresAt?.toISOString(),
    }
  }

  private deserializeBookmark(data: any): EnhancedBookmark {
    return {
      ...data,
      uri: vscode.Uri.parse(data.uri),
      range: new vscode.Range(
        new vscode.Position(data.range.start.line, data.range.start.character),
        new vscode.Position(data.range.end.line, data.range.end.character),
      ),
      stats: {
        ...data.stats,
        lastAccessed: new Date(data.stats.lastAccessed),
        createdAt: new Date(data.stats.createdAt),
      },
      lastModified: new Date(data.lastModified),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    }
  }

  private setupAutoCleanup(): void {
    // 每小时检查一次过期的临时书签
    setInterval(() => {
      this.cleanupExpiredBookmarks()
    }, 60 * 60 * 1000)
  }

  private async cleanupExpiredBookmarks(): Promise<void> {
    const now = new Date()
    let cleaned = 0

    for (const [id, bookmark] of this.bookmarks) {
      if (bookmark.isTemporary && bookmark.expiresAt && bookmark.expiresAt < now) {
        this.bookmarks.delete(id)
        cleaned++
      }
    }

    if (cleaned > 0) {
      await this.saveBookmarks()
      console.log(`[CCoding] 清理过期临时书签: ${cleaned} 个`)
    }
  }
}
