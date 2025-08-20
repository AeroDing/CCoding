import type { BookmarkProvider } from './bookmarkProvider'
import * as vscode from 'vscode'

/**
 * 全局书签管理 Provider
 * 显示所有文件的书签，支持跨文件管理
 */
export class GlobalBookmarksProvider implements vscode.TreeDataProvider<BookmarkTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private groupBy: 'file' | 'type' | 'time' = 'file'
  private searchQuery = ''

  constructor(
    private context: vscode.ExtensionContext,
    private bookmarkProvider: BookmarkProvider,
  ) {}

  getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: BookmarkTreeItem): Promise<BookmarkTreeItem[]> {
    if (!element) {
      return this.getRootItems()
    }

    if (element.isGroup) {
      return element.children || []
    }

    return []
  }

  private async getRootItems(): Promise<BookmarkTreeItem[]> {
    try {
      // 从全局状态获取所有书签
      const allBookmarks = await this.getAllBookmarks()

      if (allBookmarks.length === 0) {
        return [this.createEmptyItem()]
      }

      // 应用搜索过滤
      const filteredBookmarks = this.applySearch(allBookmarks)

      // 按选择的方式分组
      return this.groupBookmarks(filteredBookmarks)
    }
    catch (error) {
      console.error('[GlobalBookmarksProvider] 获取书签失败:', error)
      return [this.createErrorItem(error)]
    }
  }

  private async getAllBookmarks(): Promise<any[]> {
    const saved = this.context.globalState.get<any[]>('CCoding.bookmarks', [])
    return saved.filter((bookmark) => {
      // 验证书签数据完整性
      return bookmark && bookmark.id && bookmark.label && bookmark.uri && bookmark.range
    })
  }

  private applySearch(bookmarks: any[]): any[] {
    if (!this.searchQuery) {
      return bookmarks
    }

    const query = this.searchQuery.toLowerCase()
    return bookmarks.filter(bookmark =>
      bookmark.label.toLowerCase().includes(query)
      || (bookmark.description && bookmark.description.toLowerCase().includes(query))
      || this.getRelativePath(bookmark.uri).toLowerCase().includes(query),
    )
  }

  private groupBookmarks(bookmarks: any[]): BookmarkTreeItem[] {
    switch (this.groupBy) {
      case 'file':
        return this.groupByFile(bookmarks)
      case 'type':
        return this.groupByType(bookmarks)
      case 'time':
        return this.groupByTime(bookmarks)
      default:
        return this.groupByFile(bookmarks)
    }
  }

  private groupByFile(bookmarks: any[]): BookmarkTreeItem[] {
    const groups = new Map<string, any[]>()

    bookmarks.forEach((bookmark) => {
      const filePath = this.getRelativePath(bookmark.uri)
      if (!groups.has(filePath)) {
        groups.set(filePath, [])
      }
      groups.get(filePath)!.push(bookmark)
    })

    return Array.from(groups.entries()).map(([filePath, groupBookmarks]) => {
      const children = groupBookmarks
        .sort((a, b) => a.range.start.line - b.range.start.line)
        .map(bookmark => this.createBookmarkItem(bookmark))

      const label = this.searchQuery
        ? `📁 ${filePath} (${groupBookmarks.length}) - 搜索: "${this.searchQuery}"`
        : `📁 ${filePath} (${groupBookmarks.length})`

      return new BookmarkTreeItem(
        label,
        true,
        children,
        new vscode.ThemeIcon('file'),
        vscode.TreeItemCollapsibleState.Expanded,
      )
    })
  }

  private groupByType(bookmarks: any[]): BookmarkTreeItem[] {
    const groups = new Map<string, any[]>()

    bookmarks.forEach((bookmark) => {
      // 根据描述或标签推断类型
      const type = this.inferBookmarkType(bookmark)
      if (!groups.has(type)) {
        groups.set(type, [])
      }
      groups.get(type)!.push(bookmark)
    })

    return Array.from(groups.entries()).map(([type, groupBookmarks]) => {
      const children = groupBookmarks
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(bookmark => this.createBookmarkItem(bookmark))

      const label = this.searchQuery
        ? `${this.getTypeIcon(type)} ${type} (${groupBookmarks.length}) - 搜索: "${this.searchQuery}"`
        : `${this.getTypeIcon(type)} ${type} (${groupBookmarks.length})`

      return new BookmarkTreeItem(
        label,
        true,
        children,
        new vscode.ThemeIcon(this.getTypeIconName(type)),
        vscode.TreeItemCollapsibleState.Expanded,
      )
    })
  }

  private groupByTime(bookmarks: any[]): BookmarkTreeItem[] {
    const now = Date.now()
    const groups = new Map<string, any[]>([
      ['今天', []],
      ['昨天', []],
      ['本周', []],
      ['本月', []],
      ['更早', []],
    ])

    bookmarks.forEach((bookmark) => {
      const age = now - (bookmark.timestamp || now)
      const days = age / (1000 * 60 * 60 * 24)

      let category: string
      if (days < 1) {
        category = '今天'
      }
      else if (days < 2) {
        category = '昨天'
      }
      else if (days < 7) {
        category = '本周'
      }
      else if (days < 30) {
        category = '本月'
      }
      else {
        category = '更早'
      }

      groups.get(category)!.push(bookmark)
    })

    return Array.from(groups.entries())
      .filter(([, groupBookmarks]) => groupBookmarks.length > 0)
      .map(([timeRange, groupBookmarks]) => {
        const children = groupBookmarks
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(bookmark => this.createBookmarkItem(bookmark))

        const label = this.searchQuery
          ? `🕒 ${timeRange} (${groupBookmarks.length}) - 搜索: "${this.searchQuery}"`
          : `🕒 ${timeRange} (${groupBookmarks.length})`

        return new BookmarkTreeItem(
          label,
          true,
          children,
          new vscode.ThemeIcon('history'),
          vscode.TreeItemCollapsibleState.Expanded,
        )
      })
  }

  private inferBookmarkType(bookmark: any): string {
    const text = `${bookmark.label} ${bookmark.description || ''}`.toLowerCase()

    if (text.includes('bug') || text.includes('问题') || text.includes('错误')) {
      return '🐛 问题书签'
    }
    if (text.includes('todo') || text.includes('待办') || text.includes('任务')) {
      return '✅ 待办书签'
    }
    if (text.includes('idea') || text.includes('想法') || text.includes('灵感')) {
      return '💡 灵感书签'
    }
    if (text.includes('review') || text.includes('检查') || text.includes('审查')) {
      return '👀 审查书签'
    }
    if (text.includes('important') || text.includes('重要') || text.includes('关键')) {
      return '⭐ 重要书签'
    }

    return '📖 普通书签'
  }

  private getTypeIcon(type: string): string {
    if (type.includes('问题'))
      return '🐛'
    if (type.includes('待办'))
      return '✅'
    if (type.includes('灵感'))
      return '💡'
    if (type.includes('审查'))
      return '👀'
    if (type.includes('重要'))
      return '⭐'
    return '📖'
  }

  private getTypeIconName(type: string): string {
    if (type.includes('问题'))
      return 'bug'
    if (type.includes('待办'))
      return 'check'
    if (type.includes('灵感'))
      return 'lightbulb'
    if (type.includes('审查'))
      return 'eye'
    if (type.includes('重要'))
      return 'star'
    return 'bookmark'
  }

  private createBookmarkItem(bookmark: any): BookmarkTreeItem {
    const item = new BookmarkTreeItem(
      bookmark.label,
      false,
      [],
      new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('charts.blue')),
      vscode.TreeItemCollapsibleState.None,
      bookmark,
    )

    // 设置描述和工具提示
    const filePath = this.getRelativePath(bookmark.uri)
    item.description = `${filePath}:${bookmark.range.start.line + 1}`
    item.tooltip = this.createTooltip(bookmark)

    // 设置上下文值用于菜单
    item.contextValue = 'globalBookmark'

    // 设置点击命令
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        bookmark.uri,
        {
          selection: new vscode.Range(
            bookmark.range.start,
            bookmark.range.start,
          ),
        },
      ],
    }

    return item
  }

  private createTooltip(bookmark: any): string {
    let tooltip = `**${bookmark.label}**\n\n`
    tooltip += `📁 ${this.getRelativePath(bookmark.uri)}:${bookmark.range.start.line + 1}\n`

    if (bookmark.description) {
      tooltip += `📝 ${bookmark.description}\n`
    }

    tooltip += `🕒 ${this.formatTimestamp(bookmark.timestamp)}\n`

    return tooltip
  }

  private createEmptyItem(): BookmarkTreeItem {
    const message = this.searchQuery
      ? `没有找到匹配 "${this.searchQuery}" 的书签`
      : '没有找到书签'

    return new BookmarkTreeItem(
      message,
      false,
      [],
      new vscode.ThemeIcon('info'),
      vscode.TreeItemCollapsibleState.None,
    )
  }

  private createErrorItem(error: any): BookmarkTreeItem {
    return new BookmarkTreeItem(
      `加载书签出错: ${error.message || error}`,
      false,
      [],
      new vscode.ThemeIcon('error'),
      vscode.TreeItemCollapsibleState.None,
    )
  }

  /**
   * 刷新视图
   */
  public refresh(): void {
    console.log('[GlobalBookmarksProvider] 刷新全局书签视图')
    this._onDidChangeTreeData.fire()
  }

  /**
   * 设置分组方式
   */
  public setGroupBy(groupBy: 'file' | 'type' | 'time'): void {
    if (this.groupBy !== groupBy) {
      this.groupBy = groupBy
      console.log(`[GlobalBookmarksProvider] 切换分组方式: ${groupBy}`)
      this.refresh()
    }
  }

  /**
   * 搜索书签
   */
  public search(query: string): void {
    this.searchQuery = query.trim()
    console.log(`[GlobalBookmarksProvider] 搜索书签: "${this.searchQuery}"`)
    this.refresh()
  }

  /**
   * 清除搜索
   */
  public clearSearch(): void {
    if (this.searchQuery) {
      this.searchQuery = ''
      console.log('[GlobalBookmarksProvider] 清除搜索')
      this.refresh()
    }
  }

  /**
   * 删除书签
   */
  public async deleteBookmark(bookmarkId: string): Promise<void> {
    const bookmarks = this.context.globalState.get<any[]>('CCoding.bookmarks', [])
    const updatedBookmarks = bookmarks.filter(b => b.id !== bookmarkId)
    await this.context.globalState.update('CCoding.bookmarks', updatedBookmarks)
    this.bookmarkProvider.refresh()
    this.refresh()
  }

  private getRelativePath(uri: vscode.Uri | string): string {
    try {
      const uriObj = typeof uri === 'string' ? vscode.Uri.parse(uri) : uri
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uriObj)
      if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uriObj, false)
      }
      return uriObj.fsPath
    }
    catch {
      return String(uri)
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
}

class BookmarkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly isGroup: boolean,
    public readonly children: BookmarkTreeItem[],
    public readonly iconPath: vscode.ThemeIcon,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly bookmark?: any,
  ) {
    super(name, collapsibleState)
    this.contextValue = isGroup ? 'globalBookmarkGroup' : 'globalBookmark'
  }
}
