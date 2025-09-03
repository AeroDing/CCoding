import type { SearchResult as UnifiedSearchResult } from '../services/unifiedSearchService.js'
import type { TimelineProvider } from './timelineProvider.js'
import * as vscode from 'vscode'
import { SearchType, UnifiedSearchService } from '../services/unifiedSearchService.js'

/**
 * 快速访问面板 Provider
 * 整合时间线、关键词搜索、最近文件等常用功能
 */
export class QuickAccessProvider implements vscode.TreeDataProvider<QuickAccessTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<QuickAccessTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private searchResults: UnifiedSearchResult[] = []
  private recentFiles: string[] = []
  private recentSymbols: any[] = []
  private searchService: UnifiedSearchService
  private searchType: SearchType = SearchType.ALL

  constructor(
    private context: vscode.ExtensionContext,
    private timelineProvider: TimelineProvider,
  ) {
    this.loadRecentData()
    this.searchService = UnifiedSearchService.getInstance()
  }

  getTreeItem(element: QuickAccessTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: QuickAccessTreeItem): Promise<QuickAccessTreeItem[]> {
    if (!element) {
      return this.getRootItems()
    }

    if (element.isGroup) {
      return element.children || []
    }

    return []
  }

  private async getRootItems(): Promise<QuickAccessTreeItem[]> {
    const items: QuickAccessTreeItem[] = []

    // 1. 最近文件分组
    if (this.recentFiles.length > 0) {
      const recentFileItems = this.recentFiles.slice(0, 10).map(filePath =>
        this.createRecentFileItem(filePath),
      )

      items.push(new QuickAccessTreeItem(
        `📁 最近文件 (${recentFileItems.length})`,
        true,
        recentFileItems,
        new vscode.ThemeIcon('history'),
        vscode.TreeItemCollapsibleState.Expanded,
      ))
    }

    // 2. 最近符号分组
    if (this.recentSymbols.length > 0) {
      const recentSymbolItems = this.recentSymbols.slice(0, 10).map(symbol =>
        this.createRecentSymbolItem(symbol),
      )

      items.push(new QuickAccessTreeItem(
        `🎯 最近符号 (${recentSymbolItems.length})`,
        true,
        recentSymbolItems,
        new vscode.ThemeIcon('symbol-misc'),
        vscode.TreeItemCollapsibleState.Expanded,
      ))
    }

    // 3. 时间线分组
    const timelineItems = await this.getTimelineItems()
    if (timelineItems.length > 0) {
      items.push(new QuickAccessTreeItem(
        `🕐 时间线 (${timelineItems.length})`,
        true,
        timelineItems,
        new vscode.ThemeIcon('clock'),
        vscode.TreeItemCollapsibleState.Collapsed,
      ))
    }

    // 4. 搜索结果分组
    if (this.searchResults.length > 0) {
      const searchItems = this.searchResults.map(result =>
        this.createUnifiedSearchResultItem(result),
      )

      items.push(new QuickAccessTreeItem(
        `🔍 搜索结果 (${searchItems.length}) - ${this.getSearchTypeLabel()}`,
        true,
        searchItems,
        new vscode.ThemeIcon('search'),
        vscode.TreeItemCollapsibleState.Expanded,
      ))
    }

    // 5. 快捷操作分组
    const quickActions = this.getQuickActions()
    items.push(new QuickAccessTreeItem(
      `⚡ 快捷操作`,
      true,
      quickActions,
      new vscode.ThemeIcon('zap'),
      vscode.TreeItemCollapsibleState.Expanded,
    ))

    return items
  }

  private createRecentFileItem(filePath: string): QuickAccessTreeItem {
    const fileName = filePath.split('/').pop() || filePath
    const relativePath = this.getRelativePath(filePath)

    const item = new QuickAccessTreeItem(
      fileName,
      false,
      [],
      new vscode.ThemeIcon('file'),
      vscode.TreeItemCollapsibleState.None,
    )

    item.description = relativePath
    item.tooltip = `最近打开: ${relativePath}`

    // 设置点击命令
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(filePath)],
    }

    return item
  }

  private createRecentSymbolItem(symbol: any): QuickAccessTreeItem {
    const item = new QuickAccessTreeItem(
      symbol.name,
      false,
      [],
      this.getSymbolIcon(symbol.kind),
      vscode.TreeItemCollapsibleState.None,
    )

    item.description = `${symbol.fileName}:${symbol.line + 1}`
    item.tooltip = `${vscode.SymbolKind[symbol.kind]} · ${symbol.fileName}`

    // 设置点击命令
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        symbol.uri,
        {
          selection: new vscode.Range(
            symbol.line,
            symbol.character,
            symbol.line,
            symbol.character,
          ),
        },
      ],
    }

    return item
  }

  private async getTimelineItems(): Promise<QuickAccessTreeItem[]> {
    try {
      // 获取时间线数据 - 这里需要根据实际的TimelineProvider实现调整
      const timelineData = await this.getTimelineData()

      return timelineData.slice(0, 15).map((entry) => {
        const item = new QuickAccessTreeItem(
          entry.label,
          false,
          [],
          new vscode.ThemeIcon(entry.iconId || 'history'),
          vscode.TreeItemCollapsibleState.None,
        )

        item.description = this.formatTimestamp(entry.timestamp)
        item.tooltip = entry.description || entry.label

        // 如果有位置信息，设置点击命令
        if (entry.uri && entry.range) {
          item.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [entry.uri, { selection: entry.range }],
          }
        }

        return item
      })
    }
    catch (error) {
      console.warn('[QuickAccessProvider] 获取时间线数据失败:', error)
      return []
    }
  }

  private getQuickActions(): QuickAccessTreeItem[] {
    const actions = [
      {
        label: '🔍 统一搜索',
        command: 'CCoding.unifiedSearch',
        description: '在项目中搜索文件、符号、待办等',
        iconId: 'search',
      },
      {
        label: '🔍 搜索类型',
        command: 'CCoding.selectSearchType',
        description: '选择搜索类型：全部/文件/符号/待办/书签',
        iconId: 'filter',
      },
      {
        label: '📖 添加书签',
        command: 'CCoding.addBookmark',
        description: '为当前位置添加书签',
        iconId: 'bookmark',
      },
      {
        label: '📌 置顶符号',
        command: 'CCoding.pinSymbol',
        description: '置顶当前符号',
        iconId: 'pin',
      },
      {
        label: '🔧 修复数据',
        command: 'CCoding.repairData',
        description: '修复损坏的插件数据',
        iconId: 'tools',
      },
      {
        label: '📊 项目索引',
        command: 'CCoding.projectStartIndexing',
        description: '重新索引项目符号',
        iconId: 'sync',
      },
    ]

    return actions.map((action) => {
      const item = new QuickAccessTreeItem(
        action.label,
        false,
        [],
        new vscode.ThemeIcon(action.iconId),
        vscode.TreeItemCollapsibleState.None,
      )

      item.description = action.description
      item.command = {
        command: action.command,
        title: action.label,
      }

      return item
    })
  }

  /**
   * 执行关键词搜索
   */
  public async performKeywordSearch(query: string, searchType?: SearchType): Promise<void> {
    console.log(`[QuickAccessProvider] 执行统一搜索: "${query}", 类型: ${searchType || this.searchType}`)

    if (!query.trim()) {
      this.searchResults = []
      this.refresh()
      return
    }

    // 更新搜索类型
    if (searchType) {
      this.searchType = searchType
    }

    try {
      // 使用统一搜索服务
      const results = await this.searchService.search(query, {
        types: [this.searchType],
        maxResults: 50,
        caseSensitive: false,
        useRegex: false,
      })

      this.searchResults = results

      console.log(`[QuickAccessProvider] 搜索完成，找到${results.length}个结果`)
      this.refresh()
    }
    catch (error) {
      console.error('[QuickAccessProvider] 搜索失败:', error)
      vscode.window.showErrorMessage(`搜索失败: ${error}`)
      this.searchResults = []
      this.refresh()
    }
  }

  /**
   * 设置搜索类型
   */
  public setSearchType(searchType: SearchType): void {
    if (this.searchType !== searchType) {
      this.searchType = searchType
      console.log(`[QuickAccessProvider] 切换搜索类型: ${searchType}`)
      // 如果有搜索结果，清空并刷新
      if (this.searchResults.length > 0) {
        this.clearSearchResults()
      }
    }
  }

  /**
   * 获取搜索类型标签
   */
  private getSearchTypeLabel(): string {
    switch (this.searchType) {
      case SearchType.ALL: return '全部'
      case SearchType.FILES: return '文件'
      case SearchType.SYMBOLS: return '符号'
      case SearchType.TODOS: return '待办'
      case SearchType.BOOKMARKS: return '书签'
      default: return '全部'
    }
  }

  /**
   * 创建统一搜索结果项
   */
  private createUnifiedSearchResultItem(result: UnifiedSearchResult): QuickAccessTreeItem {
    const item = new QuickAccessTreeItem(
      result.label,
      false,
      [],
      new vscode.ThemeIcon(result.iconId || this.getDefaultIconForType(result.type)),
      vscode.TreeItemCollapsibleState.None,
    )

    item.description = result.description || ''
    item.tooltip = result.detail || result.label

    // 设置点击命令
    if (result.uri) {
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: result.range
          ? [result.uri, { selection: result.range }]
          : [result.uri],
      }
    }

    return item
  }

  /**
   * 获取搜索类型的默认图标
   */
  private getDefaultIconForType(type: SearchType): string {
    switch (type) {
      case SearchType.FILES: return 'file'
      case SearchType.SYMBOLS: return 'symbol-misc'
      case SearchType.TODOS: return 'check'
      case SearchType.BOOKMARKS: return 'bookmark'
      default: return 'search'
    }
  }

  /**
   * 清除搜索结果
   */
  public clearSearchResults(): void {
    this.searchResults = []
    this.refresh()
  }

  /**
   * 记录最近访问的文件
   */
  public recordRecentFile(filePath: string): void {
    // 移除已存在的条目（如果有）
    this.recentFiles = this.recentFiles.filter(f => f !== filePath)

    // 添加到开头
    this.recentFiles.unshift(filePath)

    // 限制数量
    this.recentFiles = this.recentFiles.slice(0, 20)

    this.saveRecentData()
    this.refresh()
  }

  /**
   * 记录最近访问的符号
   */
  public recordRecentSymbol(symbol: any): void {
    // 移除已存在的条目（如果有）
    this.recentSymbols = this.recentSymbols.filter(s =>
      !(s.name === symbol.name && s.uri.toString() === symbol.uri.toString()),
    )

    // 添加到开头
    this.recentSymbols.unshift({
      ...symbol,
      timestamp: Date.now(),
    })

    // 限制数量
    this.recentSymbols = this.recentSymbols.slice(0, 15)

    this.saveRecentData()
    this.refresh()
  }

  /**
   * 刷新视图
   */
  public refresh(): void {
    console.log('[QuickAccessProvider] 刷新快速访问视图')
    this._onDidChangeTreeData.fire()
  }

  private async getTimelineData(): Promise<any[]> {
    // 这里应该从TimelineProvider获取数据
    // 由于TimelineProvider的实现可能不同，这里提供一个通用的实现
    try {
      // 获取最近编辑的文件历史
      const recentEdits = this.context.workspaceState.get<any[]>('CCoding.recentEdits', [])
      return recentEdits.map(edit => ({
        label: edit.action || '编辑',
        description: edit.description || '',
        timestamp: edit.timestamp || Date.now(),
        uri: edit.uri ? vscode.Uri.parse(edit.uri) : undefined,
        range: edit.range
          ? new vscode.Range(
            edit.range.start.line,
            edit.range.start.character,
            edit.range.end.line,
            edit.range.end.character,
          )
          : undefined,
        iconId: edit.iconId || 'history',
      }))
    }
    catch (error) {
      console.warn('[QuickAccessProvider] 获取时间线数据失败:', error)
      return []
    }
  }

  private getSymbolIcon(kind: vscode.SymbolKind): vscode.ThemeIcon {
    const iconMap: Record<number, string> = {
      [vscode.SymbolKind.Function]: 'symbol-method',
      [vscode.SymbolKind.Method]: 'symbol-method',
      [vscode.SymbolKind.Constructor]: 'symbol-constructor',
      [vscode.SymbolKind.Class]: 'symbol-class',
      [vscode.SymbolKind.Interface]: 'symbol-interface',
      [vscode.SymbolKind.Variable]: 'symbol-variable',
      [vscode.SymbolKind.Property]: 'symbol-property',
      [vscode.SymbolKind.Constant]: 'symbol-constant',
      [vscode.SymbolKind.Enum]: 'symbol-enum',
      [vscode.SymbolKind.EnumMember]: 'symbol-enum-member',
    }
    return new vscode.ThemeIcon(iconMap[kind] || 'symbol-misc')
  }

  private getSymbolIconId(kind: vscode.SymbolKind): string {
    const iconMap: Record<number, string> = {
      [vscode.SymbolKind.Function]: 'symbol-method',
      [vscode.SymbolKind.Method]: 'symbol-method',
      [vscode.SymbolKind.Constructor]: 'symbol-constructor',
      [vscode.SymbolKind.Class]: 'symbol-class',
      [vscode.SymbolKind.Interface]: 'symbol-interface',
      [vscode.SymbolKind.Variable]: 'symbol-variable',
      [vscode.SymbolKind.Property]: 'symbol-property',
      [vscode.SymbolKind.Constant]: 'symbol-constant',
      [vscode.SymbolKind.Enum]: 'symbol-enum',
      [vscode.SymbolKind.EnumMember]: 'symbol-enum-member',
    }
    return iconMap[kind] || 'symbol-misc'
  }

  private getRelativePath(filePath: string): string {
    try {
      const uri = typeof filePath === 'string' ? vscode.Uri.file(filePath) : filePath
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
      if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false)
      }
      return uri.fsPath
    }
    catch {
      return String(filePath)
    }
  }

  private formatTimestamp(timestamp: number): string {
    if (!timestamp)
      return '未知时间'

    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) {
      return '刚刚'
    }
    else if (minutes < 60) {
      return `${minutes}分钟前`
    }
    else if (hours < 24) {
      return `${hours}小时前`
    }
    else if (days < 7) {
      return `${days}天前`
    }
    else {
      return new Date(timestamp).toLocaleDateString('zh-CN')
    }
  }

  private loadRecentData(): void {
    try {
      this.recentFiles = this.context.workspaceState.get<string[]>('CCoding.recentFiles', [])
      this.recentSymbols = this.context.workspaceState.get<any[]>('CCoding.recentSymbols', [])
    }
    catch (error) {
      console.warn('[QuickAccessProvider] 加载最近数据失败:', error)
      this.recentFiles = []
      this.recentSymbols = []
    }
  }

  private saveRecentData(): void {
    try {
      this.context.workspaceState.update('CCoding.recentFiles', this.recentFiles)
      this.context.workspaceState.update('CCoding.recentSymbols', this.recentSymbols)
    }
    catch (error) {
      console.warn('[QuickAccessProvider] 保存最近数据失败:', error)
    }
  }
}

class QuickAccessTreeItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly isGroup: boolean,
    public readonly children: QuickAccessTreeItem[],
    public readonly iconPath: vscode.ThemeIcon,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(name, collapsibleState)
    this.contextValue = isGroup ? 'quickAccessGroup' : 'quickAccessItem'
  }
}
