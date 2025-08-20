import * as vscode from 'vscode'

/**
 * 全局待办事项 Provider
 * 显示所有文件的TODO/FIXME/NOTE等，支持全项目管理
 * 优化版本：支持缓存、增量扫描、配置化排除规则
 */
export class GlobalTodosProvider implements vscode.TreeDataProvider<TodoTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private groupBy: 'file' | 'type' | 'priority' = 'type'
  private searchQuery = ''
  private includedTypes: Set<string> = new Set(['TODO', 'FIXME', 'NOTE', 'BUG', 'HACK'])

  // 缓存相关
  private todoCache = new Map<string, any[]>() // 文件URI -> TODO数组
  private lastScanTime = new Map<string, number>() // 文件URI -> 最后扫描时间
  private isScanning = false
  private scanProgress: vscode.Progress<{ message?: string, increment?: number }> | undefined

  constructor() {
    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('CCoding.todos') || e.affectsConfiguration('CCoding.search')) {
        this.updateConfiguration()
        this.clearCacheAndRefresh()
      }
    })

    // 监听文件变化，实现增量扫描
    vscode.workspace.onDidChangeTextDocument((e) => {
      this.handleDocumentChange(e.document)
    })

    vscode.workspace.onDidSaveTextDocument((document) => {
      this.handleDocumentChange(document)
    })

    // 初始化配置
    this.updateConfiguration()
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: TodoTreeItem): Promise<TodoTreeItem[]> {
    if (!element) {
      return this.getRootItems()
    }

    if (element.isGroup) {
      return element.children || []
    }

    return []
  }

  private async getRootItems(): Promise<TodoTreeItem[]> {
    try {
      // 如果正在扫描，显示扫描状态
      if (this.isScanning) {
        return [this.createScanningItem()]
      }

      // 扫描工作区中的所有TODO项目（带缓存）
      const allTodos = await this.scanAllTodosWithCache()

      if (allTodos.length === 0) {
        return [this.createEmptyItem()]
      }

      // 应用搜索过滤
      const filteredTodos = this.applySearch(allTodos)

      // 按选择的方式分组
      return this.groupTodos(filteredTodos)
    }
    catch (error) {
      console.error('[GlobalTodosProvider] 获取TODO失败:', error)
      return [this.createErrorItem(error)]
    }
  }

  /**
   * 更新配置
   */
  private updateConfiguration(): void {
    const config = vscode.workspace.getConfiguration('CCoding.todos')
    const enabledTypes = config.get<string[]>('enabledTypes', ['TODO', 'FIXME', 'NOTE', 'BUG', 'HACK'])
    this.includedTypes = new Set(enabledTypes.map(t => t.toUpperCase()))
    console.log('[GlobalTodosProvider] 更新配置，启用类型:', Array.from(this.includedTypes))
  }

  /**
   * 处理文档变化（增量扫描）
   */
  private handleDocumentChange(document: vscode.TextDocument): void {
    if (!this.shouldScanDocument(document)) {
      return
    }

    // 清除该文件的缓存
    const uriString = document.uri.toString()
    this.todoCache.delete(uriString)
    this.lastScanTime.delete(uriString)

    // 延迟刷新，避免频繁更新
    clearTimeout(this.changeTimeout)
    this.changeTimeout = setTimeout(() => {
      console.log(`[GlobalTodosProvider] 文档变化，增量刷新: ${document.fileName}`)
      this.refresh()
    }, 500)
  }

  private changeTimeout: NodeJS.Timeout | undefined

  /**
   * 清除缓存并刷新
   */
  private clearCacheAndRefresh(): void {
    this.todoCache.clear()
    this.lastScanTime.clear()
    console.log('[GlobalTodosProvider] 清除缓存并刷新')
    this.refresh()
  }

  /**
   * 带缓存的扫描所有TODO项目
   */
  private async scanAllTodosWithCache(): Promise<any[]> {
    const todos: any[] = []

    // 获取工作区文件
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      return todos
    }

    this.isScanning = true

    try {
      const excludePatterns = this.getExcludePatterns()
      const filePatterns = [
        '**/*.{js,ts,jsx,tsx,vue,py,java,cpp,c,h,cs,php,rb,go,rs,swift,kt}',
        '**/*.{md,txt,json,yml,yaml,xml,html,css,scss,sass,less}',
      ]

      for (const pattern of filePatterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          `{${excludePatterns.join(',')}}`,
          1000, // 限制文件数量
        )

        for (const fileUri of files) {
          const uriString = fileUri.toString()

          try {
            // 检查缓存是否有效
            const cachedTodos = this.todoCache.get(uriString)
            const lastScan = this.lastScanTime.get(uriString)
            const fileStats = await vscode.workspace.fs.stat(fileUri)

            if (cachedTodos && lastScan && lastScan >= fileStats.mtime) {
              // 使用缓存
              todos.push(...cachedTodos)
              continue
            }

            // 重新扫描文件
            const document = await vscode.workspace.openTextDocument(fileUri)
            const fileTodos = this.scanTodosInDocument(document)

            // 更新缓存
            this.todoCache.set(uriString, fileTodos)
            this.lastScanTime.set(uriString, Date.now())

            todos.push(...fileTodos)
          }
          catch (error) {
            console.warn(`[GlobalTodosProvider] 无法读取文件 ${fileUri.fsPath}:`, error)
          }
        }
      }
    }
    catch (error) {
      console.error('[GlobalTodosProvider] 扫描文件失败:', error)
    }
    finally {
      this.isScanning = false
    }

    return todos
  }

  /**
   * 获取排除模式
   */
  private getExcludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('CCoding.search')
    const userPatterns = config.get<string[]>('excludePatterns', [])

    const defaultPatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/vendor/**',
    ]

    return [...defaultPatterns, ...userPatterns]
  }

  /**
   * 检查是否应该扫描文档
   */
  private shouldScanDocument(document: vscode.TextDocument): boolean {
    const fileName = document.fileName
    const excludePatterns = this.getExcludePatterns()

    // 简单的排除检查
    for (const pattern of excludePatterns) {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'))
      if (regex.test(fileName)) {
        return false
      }
    }

    // 检查文件扩展名
    const supportedExtensions = [
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.vue',
      '.py',
      '.java',
      '.cpp',
      '.c',
      '.h',
      '.cs',
      '.php',
      '.rb',
      '.go',
      '.rs',
      '.swift',
      '.kt',
      '.md',
      '.txt',
      '.json',
      '.yml',
      '.yaml',
      '.xml',
      '.html',
      '.css',
      '.scss',
      '.sass',
      '.less',
    ]

    return supportedExtensions.some(ext => fileName.endsWith(ext))
  }

  /**
   * 创建扫描中状态项
   */
  private createScanningItem(): TodoTreeItem {
    return new TodoTreeItem(
      '⏳ 正在扫描待办事项...',
      false,
      [],
      new vscode.ThemeIcon('loading~spin'),
      vscode.TreeItemCollapsibleState.None,
    )
  }

  private scanTodosInDocument(document: vscode.TextDocument): any[] {
    const todos: any[] = []

    // 支持多种TODO格式的正则表达式
    const todoRegex = /(?:\/\/\s*|\/\*\s*|#\s*|<!--\s*)?(TODO|FIXME|NOTE|BUG|HACK)(?:\s*[:：]\s*(?:\d+\.\s*)?)?(.+)/gi

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i)
      const lineText = line.text.trim()

      if (!lineText)
        continue

      const matches = [...lineText.matchAll(todoRegex)]

      for (const match of matches) {
        const [fullMatch, type, text] = match
        const startPos = line.text.indexOf(fullMatch)

        // 只包含启用的类型
        if (!this.includedTypes.has(type.toUpperCase())) {
          continue
        }

        const todoItem = {
          id: `${document.uri.toString()}-${i}-${startPos}`,
          type: type.toUpperCase(),
          text: text.trim(),
          uri: document.uri,
          range: new vscode.Range(
            new vscode.Position(i, startPos),
            new vscode.Position(i, startPos + fullMatch.length),
          ),
          timestamp: Date.now(),
          filePath: this.getRelativePath(document.uri),
          priority: this.inferPriority(type, text),
        }

        todos.push(todoItem)
      }
    }

    return todos
  }

  private applySearch(todos: any[]): any[] {
    if (!this.searchQuery) {
      return todos
    }

    const query = this.searchQuery.toLowerCase()
    return todos.filter(todo =>
      todo.text.toLowerCase().includes(query)
      || todo.filePath.toLowerCase().includes(query)
      || todo.type.toLowerCase().includes(query),
    )
  }

  private groupTodos(todos: any[]): TodoTreeItem[] {
    switch (this.groupBy) {
      case 'file':
        return this.groupByFile(todos)
      case 'type':
        return this.groupByType(todos)
      case 'priority':
        return this.groupByPriority(todos)
      default:
        return this.groupByType(todos)
    }
  }

  private groupByFile(todos: any[]): TodoTreeItem[] {
    const groups = new Map<string, any[]>()

    todos.forEach((todo) => {
      if (!groups.has(todo.filePath)) {
        groups.set(todo.filePath, [])
      }
      groups.get(todo.filePath)!.push(todo)
    })

    return Array.from(groups.entries()).map(([filePath, groupTodos]) => {
      const children = groupTodos
        .sort((a, b) => a.range.start.line - b.range.start.line)
        .map(todo => this.createTodoItem(todo))

      const label = this.searchQuery
        ? `📁 ${filePath} (${groupTodos.length}/${todos.length})`
        : `📁 ${filePath} (${groupTodos.length})`

      return new TodoTreeItem(
        label,
        true,
        children,
        new vscode.ThemeIcon('file'),
        vscode.TreeItemCollapsibleState.Expanded,
      )
    })
  }

  private groupByType(todos: any[]): TodoTreeItem[] {
    const groups = new Map<string, any[]>()

    todos.forEach((todo) => {
      if (!groups.has(todo.type)) {
        groups.set(todo.type, [])
      }
      groups.get(todo.type)!.push(todo)
    })

    // 按优先级排序类型
    const sortedTypes = Array.from(groups.keys()).sort((a, b) => {
      const priorityOrder = { FIXME: 1, BUG: 2, TODO: 3, HACK: 4, NOTE: 5 }
      return (priorityOrder[a] || 6) - (priorityOrder[b] || 6)
    })

    return sortedTypes.map((type) => {
      const groupTodos = groups.get(type)!
      const children = groupTodos
        .sort((a, b) => b.priority - a.priority || a.filePath.localeCompare(b.filePath))
        .map(todo => this.createTodoItem(todo))

      const label = this.searchQuery
        ? `${this.getTypeIcon(type)} ${type} (${groupTodos.length}) - 搜索: "${this.searchQuery}"`
        : `${this.getTypeIcon(type)} ${type} (${groupTodos.length})`

      return new TodoTreeItem(
        label,
        true,
        children,
        new vscode.ThemeIcon(this.getTypeIconName(type), new vscode.ThemeColor(this.getTypeColor(type))),
        vscode.TreeItemCollapsibleState.Expanded,
      )
    })
  }

  private groupByPriority(todos: any[]): TodoTreeItem[] {
    const groups = new Map<string, any[]>([
      ['🔥 高优先级', []],
      ['⚡ 中优先级', []],
      ['📝 低优先级', []],
    ])

    todos.forEach((todo) => {
      let category: string
      if (todo.priority >= 3) {
        category = '🔥 高优先级'
      }
      else if (todo.priority >= 2) {
        category = '⚡ 中优先级'
      }
      else {
        category = '📝 低优先级'
      }

      groups.get(category)!.push(todo)
    })

    return Array.from(groups.entries())
      .filter(([, groupTodos]) => groupTodos.length > 0)
      .map(([priority, groupTodos]) => {
        const children = groupTodos
          .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.range.start.line - b.range.start.line)
          .map(todo => this.createTodoItem(todo))

        const iconName = priority.includes('高') ? 'flame' : priority.includes('中') ? 'zap' : 'note'

        const label = this.searchQuery
          ? `${priority} (${groupTodos.length}) - 搜索: "${this.searchQuery}"`
          : `${priority} (${groupTodos.length})`

        return new TodoTreeItem(
          label,
          true,
          children,
          new vscode.ThemeIcon(iconName),
          vscode.TreeItemCollapsibleState.Expanded,
        )
      })
  }

  private inferPriority(type: string, text: string): number {
    // 基础优先级
    let priority = 1
    const upperType = type.toUpperCase()
    const lowerText = text.toLowerCase()

    // 根据类型设置基础优先级
    switch (upperType) {
      case 'FIXME':
        priority = 3
        break
      case 'BUG':
        priority = 3
        break
      case 'TODO':
        priority = 2
        break
      case 'HACK':
        priority = 2
        break
      case 'NOTE':
        priority = 1
        break
    }

    // 根据文本内容调整优先级
    if (lowerText.includes('urgent') || lowerText.includes('紧急') || lowerText.includes('asap')) {
      priority += 1
    }
    if (lowerText.includes('important') || lowerText.includes('重要') || lowerText.includes('critical')) {
      priority += 1
    }
    if (lowerText.includes('!!!') || lowerText.includes('！！！')) {
      priority += 1
    }
    if (lowerText.includes('later') || lowerText.includes('稍后') || lowerText.includes('maybe')) {
      priority -= 1
    }

    return Math.max(1, Math.min(5, priority)) // 限制在1-5范围内
  }

  private getTypeIcon(type: string): string {
    switch (type) {
      case 'TODO': return '✅'
      case 'FIXME': return '🔧'
      case 'NOTE': return '📝'
      case 'BUG': return '🐛'
      case 'HACK': return '⚡'
      default: return '📋'
    }
  }

  private getTypeIconName(type: string): string {
    switch (type) {
      case 'TODO': return 'check'
      case 'FIXME': return 'tools'
      case 'NOTE': return 'note'
      case 'BUG': return 'bug'
      case 'HACK': return 'zap'
      default: return 'list-unordered'
    }
  }

  private getTypeColor(type: string): string {
    switch (type) {
      case 'TODO': return 'charts.green'
      case 'FIXME': return 'charts.orange'
      case 'NOTE': return 'charts.blue'
      case 'BUG': return 'charts.red'
      case 'HACK': return 'charts.yellow'
      default: return 'foreground'
    }
  }

  private createTodoItem(todo: any): TodoTreeItem {
    const item = new TodoTreeItem(
      todo.text,
      false,
      [],
      new vscode.ThemeIcon(
        this.getTypeIconName(todo.type),
        new vscode.ThemeColor(this.getTypeColor(todo.type)),
      ),
      vscode.TreeItemCollapsibleState.None,
      todo,
    )

    // 设置描述和工具提示
    item.description = `${todo.type} · ${todo.filePath}:${todo.range.start.line + 1}`
    item.tooltip = this.createTooltip(todo)

    // 设置上下文值用于菜单
    item.contextValue = 'globalTodo'

    // 设置点击命令
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        todo.uri,
        {
          selection: todo.range,
        },
      ],
    }

    return item
  }

  private createTooltip(todo: any): string {
    let tooltip = `**${todo.type}**: ${todo.text}\n\n`
    tooltip += `📁 ${todo.filePath}:${todo.range.start.line + 1}\n`
    tooltip += `🎯 优先级: ${this.getPriorityText(todo.priority)}\n`

    return tooltip
  }

  private getPriorityText(priority: number): string {
    switch (priority) {
      case 5: return '非常高'
      case 4: return '高'
      case 3: return '中高'
      case 2: return '中'
      case 1: return '低'
      default: return '普通'
    }
  }

  private createEmptyItem(): TodoTreeItem {
    const message = this.searchQuery
      ? `没有找到匹配 "${this.searchQuery}" 的待办事项`
      : '没有找到待办事项'

    return new TodoTreeItem(
      message,
      false,
      [],
      new vscode.ThemeIcon('info'),
      vscode.TreeItemCollapsibleState.None,
    )
  }

  private createErrorItem(error: any): TodoTreeItem {
    return new TodoTreeItem(
      `加载待办事项出错: ${error.message || error}`,
      false,
      [],
      new vscode.ThemeIcon('error'),
      vscode.TreeItemCollapsibleState.None,
    )
  }

  /**
   * 设置分组方式
   */
  public setGroupBy(groupBy: 'file' | 'type' | 'priority'): void {
    if (this.groupBy !== groupBy) {
      this.groupBy = groupBy
      console.log(`[GlobalTodosProvider] 切换分组方式: ${groupBy}`)
      this.refresh()
    }
  }

  /**
   * 刷新视图
   */
  public refresh(): void {
    console.log('[GlobalTodosProvider] 刷新全局待办事项视图')
    this._onDidChangeTreeData.fire()
  }

  /**
   * 搜索待办事项
   */
  public search(query: string): void {
    this.searchQuery = query.trim()
    console.log(`[GlobalTodosProvider] 搜索待办事项: "${this.searchQuery}"`)
    this.refresh()
  }

  /**
   * 清除搜索
   */
  public clearSearch(): void {
    if (this.searchQuery) {
      this.searchQuery = ''
      console.log('[GlobalTodosProvider] 清除搜索')
      this.refresh()
    }
  }

  /**
   * 设置包含的TODO类型
   */
  public setIncludedTypes(types: string[]): void {
    this.includedTypes = new Set(types.map(t => t.toUpperCase()))
    console.log('[GlobalTodosProvider] 更新包含的类型:', Array.from(this.includedTypes))
    this.refresh()
  }

  private getRelativePath(uri: vscode.Uri): string {
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
      if (workspaceFolder) {
        return vscode.workspace.asRelativePath(uri, false)
      }
      return uri.fsPath
    }
    catch {
      return uri.fsPath
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
      this.changeTimeout = undefined
    }
    this.todoCache.clear()
    this.lastScanTime.clear()
    console.log('[GlobalTodosProvider] 资源已清理')
  }
}

class TodoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly isGroup: boolean,
    public readonly children: TodoTreeItem[],
    public readonly iconPath: vscode.ThemeIcon,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly todo?: any,
  ) {
    super(name, collapsibleState)
    this.contextValue = isGroup ? 'globalTodoGroup' : 'globalTodo'
  }
}
