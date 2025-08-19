import * as vscode from 'vscode'

/**
 * 统一数据项接口
 */
export interface UnifiedItem {
  id: string
  type: 'symbol' | 'bookmark' | 'todo' | 'pinned'
  label: string
  description?: string
  location: {
    file: string
    line: number
    character: number
  }
  icon: string
  iconColor?: string
  isPinned: boolean
  timestamp: number
  uri: vscode.Uri
  range: vscode.Range
  // 扩展属性
  symbolKind?: vscode.SymbolKind
  todoType?: 'TODO' | 'FIXME' | 'NOTE' | 'BUG' | 'HACK'
  bookmarkNote?: string
  priority?: number
}

/**
 * 筛选器类型
 */
export type FilterType = 'all' | 'symbol' | 'bookmark' | 'todo' | 'pinned'

/**
 * 排序类型
 */
export type SortType = 'position' | 'type' | 'time' | 'name'

/**
 * 统一列表视图项
 */
export class UnifiedListItem extends vscode.TreeItem {
  constructor(
    public readonly unifiedItem: UnifiedItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(unifiedItem.label, collapsibleState)

    this.tooltip = this.createTooltip()
    this.description = this.createDescription()
    this.iconPath = this.createIcon()
    this.contextValue = this.createContextValue()

    // 设置命令 - 点击跳转到位置
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        unifiedItem.uri,
        {
          selection: new vscode.Range(
            unifiedItem.range.start,
            unifiedItem.range.start,
          ),
        },
      ],
    }
  }

  private createTooltip(): string {
    const { unifiedItem } = this
    const lines = [
      `类型: ${this.getTypeLabel(unifiedItem.type)}`,
      `位置: ${unifiedItem.location.file}:${unifiedItem.location.line + 1}`,
    ]

    if (unifiedItem.description) {
      lines.push(`说明: ${unifiedItem.description}`)
    }

    if (unifiedItem.bookmarkNote) {
      lines.push(`备注: ${unifiedItem.bookmarkNote}`)
    }

    lines.push(`时间: ${this.formatTimestamp(unifiedItem.timestamp)}`)

    return lines.join('\n')
  }

  private createDescription(): string {
    const { unifiedItem } = this
    const parts: string[] = []

    // 添加行号信息
    parts.push(`L:${unifiedItem.location.line + 1}`)

    // 根据类型添加额外信息
    if (unifiedItem.type === 'todo' && unifiedItem.todoType) {
      parts.unshift(unifiedItem.todoType)
    }

    if (unifiedItem.description && unifiedItem.type !== 'symbol') {
      parts.unshift(unifiedItem.description.substring(0, 20) + (unifiedItem.description.length > 20 ? '...' : ''))
    }

    return parts.join(' · ')
  }

  private createIcon(): vscode.ThemeIcon {
    const { unifiedItem } = this
    let iconId: string
    let color: string | undefined

    // 置顶项使用特殊图标
    if (unifiedItem.isPinned) {
      iconId = 'pinned'
      color = 'charts.orange'
    }
    else {
      switch (unifiedItem.type) {
        case 'symbol':
          iconId = this.getSymbolIcon(unifiedItem.symbolKind)
          break
        case 'bookmark':
          iconId = 'bookmark'
          color = 'charts.blue'
          break
        case 'todo':
          iconId = this.getTodoIcon(unifiedItem.todoType)
          color = this.getTodoColor(unifiedItem.todoType)
          break
        case 'pinned':
          iconId = 'pin'
          color = 'charts.orange'
          break
        default:
          iconId = 'circle-outline'
      }
    }

    const icon = new vscode.ThemeIcon(iconId)
    if (color) {
      icon.color = new vscode.ThemeColor(color)
    }
    return icon
  }

  private createContextValue(): string {
    const baseType = this.unifiedItem.type

    // 如果是置顶项，添加pinned标识
    if (this.unifiedItem.isPinned) {
      return `${baseType}-pinned`
    }

    // 否则直接返回类型
    return baseType
  }

  private getTypeLabel(type: string): string {
    const typeMap: Record<string, string> = {
      symbol: '符号',
      bookmark: '书签',
      todo: '待办',
      pinned: '置顶',
    }
    return typeMap[type] || type
  }

  private getSymbolIcon(symbolKind?: vscode.SymbolKind): string {
    if (!symbolKind)
      return 'symbol-misc'

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

    return iconMap[symbolKind] || 'symbol-misc'
  }

  private getTodoIcon(todoType?: string): string {
    const iconMap: Record<string, string> = {
      TODO: 'check',
      FIXME: 'warning',
      NOTE: 'note',
      BUG: 'bug',
      HACK: 'tools',
    }
    return iconMap[todoType || 'TODO'] || 'check'
  }

  private getTodoColor(todoType?: string): string {
    const colorMap: Record<string, string> = {
      TODO: 'charts.green',
      FIXME: 'charts.red',
      NOTE: 'charts.blue',
      BUG: 'charts.red',
      HACK: 'charts.yellow',
    }
    return colorMap[todoType || 'TODO'] || 'charts.green'
  }

  private formatTimestamp(timestamp: number): string {
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
      return new Date(timestamp).toLocaleDateString()
    }
  }
}

/**
 * 统一列表Provider - 整合所有功能到一个列表中
 */
export class UnifiedListProvider implements vscode.TreeDataProvider<UnifiedListItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<UnifiedListItem | undefined | null | void> = new vscode.EventEmitter<UnifiedListItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<UnifiedListItem | undefined | null | void> = this._onDidChangeTreeData.event

  private items: UnifiedItem[] = []
  private pinnedItems: UnifiedItem[] = []
  private activeFilter: FilterType = 'all'
  private sortType: SortType = 'position'
  private searchQuery: string = ''

  constructor(private context: vscode.ExtensionContext) {
    this.loadPinnedItems()
  }

  /**
   * 刷新视图
   */
  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  /**
   * 获取树项
   */
  getTreeItem(element: UnifiedListItem): vscode.TreeItem {
    return element
  }

  /**
   * 获取子项
   */
  getChildren(element?: UnifiedListItem): Thenable<UnifiedListItem[]> {
    if (!element) {
      // 返回根项
      return Promise.resolve(this.getRootItems())
    }
    return Promise.resolve([])
  }

  /**
   * 设置筛选器
   */
  setFilter(filter: FilterType): void {
    this.activeFilter = filter
    this.refresh()
  }

  /**
   * 设置排序类型
   */
  setSortType(sort: SortType): void {
    this.sortType = sort
    this.refresh()
  }

  /**
   * 设置搜索查询
   */
  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase()
    this.refresh()
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    this.searchQuery = ''
    this.refresh()
  }

  /**
   * 添加或更新项目
   */
  addOrUpdateItem(item: UnifiedItem): void {
    const existingIndex = this.items.findIndex(existing => existing.id === item.id)

    if (existingIndex >= 0) {
      this.items[existingIndex] = item
    }
    else {
      this.items.push(item)
    }

    this.refresh()
  }

  /**
   * 移除项目
   */
  removeItem(id: string): void {
    this.items = this.items.filter(item => item.id !== id)
    this.pinnedItems = this.pinnedItems.filter(item => item.id !== id)
    this.savePinnedItems()
    this.refresh()
  }

  /**
   * 置顶项目
   */
  pinItem(item: UnifiedItem): void {
    const pinnedItem = { ...item, isPinned: true, timestamp: Date.now() }

    // 从普通列表中移除（如果存在）
    this.items = this.items.filter(existing => existing.id !== item.id)

    // 添加到置顶列表
    const existingPinnedIndex = this.pinnedItems.findIndex(existing => existing.id === item.id)
    if (existingPinnedIndex >= 0) {
      this.pinnedItems[existingPinnedIndex] = pinnedItem
    }
    else {
      this.pinnedItems.push(pinnedItem)
    }

    this.savePinnedItems()
    this.refresh()
  }

  /**
   * 取消置顶项目
   */
  unpinItem(id: string): void {
    const pinnedItem = this.pinnedItems.find(item => item.id === id)
    if (!pinnedItem)
      return

    // 从置顶列表移除
    this.pinnedItems = this.pinnedItems.filter(item => item.id !== id)

    // 添加回普通列表
    const normalItem = { ...pinnedItem, isPinned: false }
    this.items.push(normalItem)

    this.savePinnedItems()
    this.refresh()
  }

  /**
   * 批量更新符号项目
   */
  updateSymbolItems(symbols: UnifiedItem[]): void {
    console.log(`[UnifiedListProvider] 更新符号项目，收到${symbols.length}个符号`)
    // 移除旧的符号项目
    this.items = this.items.filter(item => item.type !== 'symbol')
    // 添加新的符号项目
    this.items.push(...symbols)
    console.log(`[UnifiedListProvider] 符号更新完成，当前总项目数: ${this.items.length}`)
    this.refresh()
  }

  /**
   * 批量更新书签项目
   */
  updateBookmarkItems(bookmarks: UnifiedItem[]): void {
    console.log(`[UnifiedListProvider] 更新书签项目，收到${bookmarks.length}个书签`)
    // 移除旧的书签项目
    this.items = this.items.filter(item => item.type !== 'bookmark')
    // 添加新的书签项目
    this.items.push(...bookmarks)
    console.log(`[UnifiedListProvider] 书签更新完成，当前总项目数: ${this.items.length}`)
    this.refresh()
  }

  /**
   * 批量更新TODO项目
   */
  updateTodoItems(todos: UnifiedItem[]): void {
    console.log(`[UnifiedListProvider] 更新TODO项目，收到${todos.length}个TODO`)
    // 移除旧的TODO项目
    this.items = this.items.filter(item => item.type !== 'todo')
    // 添加新的TODO项目
    this.items.push(...todos)
    console.log(`[UnifiedListProvider] TODO更新完成，当前总项目数: ${this.items.length}`)
    this.refresh()
  }

  /**
   * 获取根项目列表
   */
  private getRootItems(): UnifiedListItem[] {
    let allItems = [...this.pinnedItems, ...this.items]

    // 应用搜索过滤
    if (this.searchQuery) {
      allItems = allItems.filter(item =>
        item.label.toLowerCase().includes(this.searchQuery)
        || (item.description && item.description.toLowerCase().includes(this.searchQuery))
        || (item.bookmarkNote && item.bookmarkNote.toLowerCase().includes(this.searchQuery)),
      )
    }

    // 应用类型过滤
    if (this.activeFilter !== 'all') {
      allItems = allItems.filter(item =>
        item.type === this.activeFilter || item.isPinned,
      )
    }

    // 排序
    allItems.sort((a, b) => this.compareItems(a, b))

    // 转换为TreeItem
    return allItems.map(item => new UnifiedListItem(item, vscode.TreeItemCollapsibleState.None))
  }

  /**
   * 比较项目用于排序
   */
  private compareItems(a: UnifiedItem, b: UnifiedItem): number {
    // 置顶项永远在前
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1
    }

    switch (this.sortType) {
      case 'position':
        return a.location.line - b.location.line
      case 'type':
        if (a.type !== b.type) {
          const typeOrder = ['symbol', 'bookmark', 'todo', 'pinned']
          return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
        }
        return a.location.line - b.location.line
      case 'time':
        return b.timestamp - a.timestamp
      case 'name':
        return a.label.localeCompare(b.label)
      default:
        return 0
    }
  }

  /**
   * 加载置顶项目
   */
  private loadPinnedItems(): void {
    const saved = this.context.globalState.get<UnifiedItem[]>('CCoding.unifiedPinnedItems', [])
    this.pinnedItems = saved.filter((item) => {
      // 验证数据完整性
      return item && item.id && item.label && item.uri && item.range
    })
  }

  /**
   * 保存置顶项目
   */
  private savePinnedItems(): void {
    this.context.globalState.update('CCoding.unifiedPinnedItems', this.pinnedItems)
  }

  /**
   * 获取统计信息
   */
  getStats(): { [key: string]: number } {
    const stats = {
      total: this.items.length + this.pinnedItems.length,
      symbols: 0,
      bookmarks: 0,
      todos: 0,
      pinned: this.pinnedItems.length,
    }

    this.items.forEach((item) => {
      stats[`${item.type}s`] = (stats[`${item.type}s`] || 0) + 1
    })

    return stats
  }

  /**
   * 销毁Provider
   */
  dispose(): void {
    this.savePinnedItems()
    this.items = []
    this.pinnedItems = []
  }
}
