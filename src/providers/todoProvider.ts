import * as vscode from 'vscode'

interface TodoItem {
  text: string
  file: string
  line: number
  column: number
  type: 'TODO' | 'FIXME' | 'NOTE' | 'HACK' | 'BUG'
}

export class TodoProvider implements vscode.TreeDataProvider<TodoTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData: vscode.EventEmitter<TodoTreeItem | undefined | null | void> = new vscode.EventEmitter<TodoTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<TodoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event

  private todos: TodoItem[] = []
  private todoRegex = /^\s*(?:\/\/|\/\*|\*|<!--|#)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\(([^)]+)\))?:?\s*(.+)/gi
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map()
  private isScanning: boolean = false
  private scanTimeout: NodeJS.Timeout | undefined
  private currentTab: 'current' | 'all' = 'current'
  private currentDocumentTodos: Map<string, TodoItem[]> = new Map()
  private lastScanTime: number = 0
  private searchQuery: string = ''
  private searchScope: 'current' | 'all' = 'current'
  private _disposables: vscode.Disposable[] = []
  private decorationUpdateTimeout: NodeJS.Timeout | undefined

  constructor() {
    this.initDecorationTypes()
    // 移除构造函数中的 refresh() 调用，改为延迟初始化
    this.setupEventListeners()
  }

  /**
   * 初始化装饰器和首次扫描
   * @description 由extension.ts调用，确保VSCode完全加载后再初始化
   */
  initializeDecorations(): void {
    console.log('[CCoding] 开始初始化TODO装饰器和扫描')

    // 确保有活动编辑器时才进行初始化
    const editor = vscode.window.activeTextEditor
    if (editor) {
      this.scanCurrentDocument()
      this.updateDecorations()
      // 执行一次完整刷新以确保所有TODO被发现
      this.forceRefresh()
    }
    else {
      console.log('[CCoding] 无活动编辑器，仅执行工作区扫描')
      // 没有活动编辑器时扫描整个工作区
      this.forceRefresh()
    }
  }

  /**
   * 设置当前Tab状态
   * @param tab - 当前选择的Tab类型
   * @description 外部调用此方法来更新Tab状态并刷新显示
   */
  setCurrentTab(tab: 'current' | 'all'): void {
    if (this.currentTab !== tab) {
      console.log(`[CCoding] TODO切换模式: ${this.currentTab} -> ${tab}`)

      // 中断当前扫描
      if (this.isScanning) {
        console.log('[CCoding] 中断当前TODO扫描，切换模式')
        this.isScanning = false
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout)
        }
      }

      this.currentTab = tab
      this._onDidChangeTreeData.fire()
    }
  }

  /**
   * 刷新待办列表
   * @description 防抖处理，避免频繁扫描
   */
  refresh(): void {
    // 如果正在扫描中，则跳过
    if (this.isScanning) {
      console.log('[CCoding] TODO扫描已在进行中，跳过此次刷新')
      return
    }

    // 清除之前的延时器
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout)
    }

    // 记录性能统计
    const refreshStartTime = performance.now()

    // 增加防抖延时到500ms，减少CPU占用
    this.scanTimeout = setTimeout(() => {
      console.log(`[CCoding] TODO刷新防抖延迟: ${(performance.now() - refreshStartTime).toFixed(2)}ms`)
      this.scanForTodos()
    }, 500)
  }

  /**
   * 强制刷新，立即扫描
   * @description 用于用户手动触发的刷新
   */
  forceRefresh(): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout)
    }
    this.scanForTodos()
  }

  /**
   * 实时扫描当前活动文档的TODO项
   * @description 用于在文档变更时实时更新TODO列表
   */
  scanCurrentDocument(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const document = editor.document
    const filePath = vscode.workspace.asRelativePath(document.uri)
    const content = document.getText()
    const lines = content.split('\n')
    const currentDocTodos: TodoItem[] = []

    lines.forEach((line, index) => {
      const regex = /^\s*(?:\/\/|\/\*|\*|<!--|#)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\(([^)]+)\))?:?\s*(.+)/gi
      let match

      match = regex.exec(line)
      while (match !== null) {
        const [, type, _author, text] = match
        const todoItem: TodoItem = {
          text: text.trim(),
          file: filePath,
          line: index,
          column: match.index,
          type: type.toUpperCase() as TodoItem['type'],
        }
        currentDocTodos.push(todoItem)
        match = regex.exec(line)
      }
    })

    // 更新当前文档的TODO缓存
    this.currentDocumentTodos.set(filePath, currentDocTodos)

    // 更新总的todos列表，移除旧的当前文档TODO，添加新的
    this.todos = this.todos.filter(todo => todo.file !== filePath)
    this.todos.push(...currentDocTodos)

    // 刷新界面
    this._onDidChangeTreeData.fire()
    this.updateDecorations()
  }

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: TodoTreeItem): Thenable<TodoTreeItem[]> {
    if (!element) {
      const filteredTodos = this.getFilteredTodos()
      const groupedTodos = this.groupTodosByType(filteredTodos)
      return Promise.resolve(Object.keys(groupedTodos).map(type =>
        new TodoTreeItem(type, groupedTodos[type], true),
      ))
    }
    else if (element.isGroup) {
      return Promise.resolve(element.todos.map(todo => new TodoTreeItem(todo.text, [todo], false)))
    }
    return Promise.resolve([])
  }

  /**
   * 根据当前Tab状态过滤待办事项
   * @returns 过滤后的待办事项数组
   * @description 当Tab为'current'时只返回当前文件的待办事项，为'all'时返回所有待办事项
   */
  private getFilteredTodos(): TodoItem[] {
    let todos: TodoItem[] = []

    // 根据当前tab获取基础数据
    if (this.currentTab === 'current') {
      todos = this.getCurrentFileTodos()
    }
    else {
      todos = this.todos
    }

    // 应用搜索过滤
    if (this.searchQuery) {
      todos = todos.filter((todo) => {
        return todo.text.toLowerCase().includes(this.searchQuery)
          || todo.file.toLowerCase().includes(this.searchQuery)
          || todo.type.toLowerCase().includes(this.searchQuery)
      })
    }

    return todos
  }

  /**
   * 获取当前文件的待办事项
   * @returns 当前文件的待办事项数组
   * @description 如果没有打开的编辑器，返回空数组
   */
  private getCurrentFileTodos(): TodoItem[] {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return []
    }

    const currentFilePath = vscode.workspace.asRelativePath(editor.document.uri)
    return this.todos.filter(todo => todo.file === currentFilePath)
  }

  private async scanForTodos() {
    if (this.isScanning) {
      console.log('[CCoding] TODO扫描已在进行中，跳过')
      return
    }

    const scanStartTime = performance.now()
    console.log('[CCoding] 开始TODO扫描...')
    this.isScanning = true
    this.todos = []
    const workspaceFolders = vscode.workspace.workspaceFolders

    if (!workspaceFolders) {
      this.isScanning = false
      return
    }

    try {
      // 限制扫描范围，只在当前tab为'all'时扫描所有文件
      if (this.currentTab === 'all') {
        for (const folder of workspaceFolders) {
          await this.scanFolder(folder.uri)
          // 添加中断检查，避免长时间阻塞
          if (!this.isScanning) {
            console.log('[CCoding] TODO扫描被中断')
            return
          }
        }
      }
      else {
        // 当前文件模式，只扫描当前文件
        this.scanCurrentDocument()
      }

      vscode.commands.executeCommand('setContext', 'CCoding.hasTodos', this.todos.length > 0)
      this._onDidChangeTreeData.fire()
      this.updateDecorations()

      const scanDuration = (performance.now() - scanStartTime).toFixed(2)
      console.log(`[CCoding] TODO扫描完成，找到 ${this.todos.length} 个待办项，耗时 ${scanDuration}ms`)
    }
    catch (error) {
      console.error('[CCoding] TODO扫描错误:', error)
      // 出错时重置状态
      this.isScanning = false
      this.todos = []
      this._onDidChangeTreeData.fire()
    }
    finally {
      this.isScanning = false
    }
  }

  private async scanFolder(folderUri: vscode.Uri) {
    try {
      // 只扫描前端开发相关的主要文件类型，减少扫描范围
      const pattern = new vscode.RelativePattern(folderUri, '**/*.{js,ts,jsx,tsx,vue,html,css,scss,md}')
      const files = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**',
        1000, // 限制最大文件数量，防止扫描过多文件
      )

      console.log(`[CCoding] TODO扫描：找到 ${files.length} 个文件`)

      // 分批处理文件，避免一次性处理过多
      const batchSize = 50
      for (let i = 0; i < files.length; i += batchSize) {
        if (!this.isScanning) {
          console.log('[CCoding] TODO扫描被中断（文件夹扫描）')
          break
        }

        const batch = files.slice(i, i + batchSize)
        for (const file of batch) {
          if (!this.isScanning)
            break
          await this.scanFile(file)
        }

        // 每批处理后稍作延迟，让出CPU时间
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    catch (error) {
      console.error('[CCoding] TODO文件夹扫描错误:', error)
    }
  }

  private async scanFile(fileUri: vscode.Uri) {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri)
      const content = document.getText()
      const lines = content.split('\n')

      lines.forEach((line, index) => {
        const regex = /^\s*(?:\/\/|\/\*|\*|<!--|#)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\(([^)]+)\))?:?\s*(.+)/gi
        let match

        match = regex.exec(line)
        while (match !== null) {
          const [, type, _author, text] = match
          const todoItem: TodoItem = {
            text: text.trim(),
            file: vscode.workspace.asRelativePath(fileUri),
            line: index,
            column: match.index,
            type: type.toUpperCase() as TodoItem['type'],
          }

          this.todos.push(todoItem)
          match = regex.exec(line)
        }
      })
    }
    catch (error) {
      console.error(`Error scanning file ${fileUri.fsPath}:`, error)
    }
  }

  private groupTodosByType(todos: TodoItem[]): { [key: string]: TodoItem[] } {
    const grouped: { [key: string]: TodoItem[] } = {}
    todos.forEach((todo) => {
      if (!grouped[todo.type]) {
        grouped[todo.type] = []
      }
      grouped[todo.type].push(todo)
    })
    return grouped
  }

  private initDecorationTypes(): void {
    const todoTypes: TodoItem['type'][] = ['TODO', 'FIXME', 'NOTE', 'HACK', 'BUG']
    todoTypes.forEach((type) => {
      const colors = this.getColorsForTodoType(type)
      const decorationType = vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: colors.border,
        borderRadius: '3px',
        backgroundColor: colors.background,
        overviewRulerColor: colors.ruler,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        fontWeight: 'bold',
        light: {
          borderColor: colors.lightBorder,
          backgroundColor: colors.lightBackground,
          color: colors.lightText,
        },
        dark: {
          borderColor: colors.darkBorder,
          backgroundColor: colors.darkBackground,
          color: colors.darkText,
        },
      })
      this.decorationTypes.set(type, decorationType)
    })
  }

  /**
   * 获取待办类型对应的颜色配置
   * @param type 待办类型
   * @returns 颜色配置对象
   */
  private getColorsForTodoType(type: TodoItem['type']) {
    switch (type) {
      case 'TODO':
        return {
          background: '#3498db20',
          border: '#3498db80',
          ruler: '#3498db',
          lightBackground: '#3498db15',
          lightBorder: '#3498db60',
          lightText: '#2980b9',
          darkBackground: '#3498db25',
          darkBorder: '#3498db90',
          darkText: '#74b9ff',
        }
      case 'FIXME':
        return {
          background: '#e67e2220',
          border: '#e67e2280',
          ruler: '#e67e22',
          lightBackground: '#e67e2215',
          lightBorder: '#e67e2260',
          lightText: '#d35400',
          darkBackground: '#e67e2225',
          darkBorder: '#e67e2290',
          darkText: '#ffa502',
        }
      case 'NOTE':
        return {
          background: '#2ecc7120',
          border: '#2ecc7180',
          ruler: '#2ecc71',
          lightBackground: '#2ecc7115',
          lightBorder: '#2ecc7160',
          lightText: '#27ae60',
          darkBackground: '#2ecc7125',
          darkBorder: '#2ecc7190',
          darkText: '#55efc4',
        }
      case 'HACK':
        return {
          background: '#f1c40f20',
          border: '#f1c40f80',
          ruler: '#f1c40f',
          lightBackground: '#f1c40f15',
          lightBorder: '#f1c40f60',
          lightText: '#f39c12',
          darkBackground: '#f1c40f25',
          darkBorder: '#f1c40f90',
          darkText: '#fdcb6e',
        }
      case 'BUG':
        return {
          background: '#e74c3c20',
          border: '#e74c3c80',
          ruler: '#e74c3c',
          lightBackground: '#e74c3c15',
          lightBorder: '#e74c3c60',
          lightText: '#c0392b',
          darkBackground: '#e74c3c25',
          darkBorder: '#e74c3c90',
          darkText: '#ff7675',
        }
      default:
        return {
          background: '#95a5a620',
          border: '#95a5a680',
          ruler: '#95a5a6',
          lightBackground: '#95a5a615',
          lightBorder: '#95a5a660',
          lightText: '#7f8c8d',
          darkBackground: '#95a5a625',
          darkBorder: '#95a5a690',
          darkText: '#b2bec3',
        }
    }
  }

  private setupEventListeners(): void {
    // 监听编辑器切换事件
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        console.log('[CCoding] 编辑器切换，更新TODO装饰器')
        this.updateDecorations()
        this.scanCurrentDocument()
      }
    })

    // 监听文档内容变化，实时更新装饰器
    const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.reason === vscode.TextDocumentChangeReason.Undo
        || event.reason === vscode.TextDocumentChangeReason.Redo) {
        return
      }

      const activeEditor = vscode.window.activeTextEditor
      if (!activeEditor || activeEditor.document !== event.document) {
        return
      }

      console.log('[CCoding] 文档内容变化，实时更新TODO装饰器')

      // 清除之前的装饰器更新计时器
      if (this.decorationUpdateTimeout) {
        clearTimeout(this.decorationUpdateTimeout)
      }

      // 对于文档变化，使用较短的防抖时间（100ms）进行装饰器更新
      this.decorationUpdateTimeout = setTimeout(() => {
        this.handleDocumentChangeForDecorations(event)
      }, 100)
    })

    // 监听工作区打开事件，确保插件激活后能正确初始化
    const workspaceChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      console.log('[CCoding] 工作区变更，重新扫描TODO')
      this.forceRefresh()
    })

    // 确保在dispose时清理事件监听器
    this._disposables = [editorChangeDisposable, documentChangeDisposable, workspaceChangeDisposable]
  }

  /**
   * 处理文档变化以实时更新装饰器
   * @param event 文档变化事件
   */
  private handleDocumentChangeForDecorations(event: vscode.TextDocumentChangeEvent): void {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document !== event.document) {
      return
    }

    console.log(`[CCoding] 处理文档变化，影响 ${event.contentChanges.length} 个区域`)

    // 获取变化的行范围
    const changedLines = new Set<number>()
    event.contentChanges.forEach((change) => {
      const startLine = change.range.start.line
      const endLine = change.range.end.line

      // 如果是插入新行或删除行，需要扫描更大范围
      const linesToCheck = Math.max(5, change.text.split('\n').length)

      for (let i = Math.max(0, startLine - 1); i <= Math.min(editor.document.lineCount - 1, endLine + linesToCheck); i++) {
        changedLines.add(i)
      }
    })

    // 增量扫描变化的行
    this.scanChangedLines(editor.document, Array.from(changedLines))

    // 更新装饰器
    this.updateDecorations()
  }

  /**
   * 增量扫描指定行的TODO项
   * @param document 文档对象
   * @param lineNumbers 需要扫描的行号数组
   */
  private scanChangedLines(document: vscode.TextDocument, lineNumbers: number[]): void {
    const filePath = vscode.workspace.asRelativePath(document.uri)
    const currentDocTodos = this.currentDocumentTodos.get(filePath) || []

    // 移除变化行的旧TODO项
    const unchangedTodos = currentDocTodos.filter(todo => !lineNumbers.includes(todo.line))

    // 扫描变化的行，查找新的TODO项
    const newTodos: TodoItem[] = []
    lineNumbers.forEach((lineNumber) => {
      if (lineNumber >= 0 && lineNumber < document.lineCount) {
        const line = document.lineAt(lineNumber)
        const lineText = line.text

        const regex = /^\s*(?:\/\/|\/\*|\*|<!--|#)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\(([^)]+)\))?:?\s*(.+)/gi
        let match = regex.exec(lineText)

        while (match !== null) {
          const [, type, _author, text] = match
          const todoItem: TodoItem = {
            text: text.trim(),
            file: filePath,
            line: lineNumber,
            column: match.index,
            type: type.toUpperCase() as TodoItem['type'],
          }
          newTodos.push(todoItem)
          match = regex.exec(lineText)
        }
      }
    })

    // 合并未变化的TODO和新扫描的TODO
    const updatedTodos = [...unchangedTodos, ...newTodos]
    this.currentDocumentTodos.set(filePath, updatedTodos)

    // 更新全局TODO列表中的当前文档部分
    this.todos = this.todos.filter(todo => todo.file !== filePath)
    this.todos.push(...updatedTodos)

    console.log(`[CCoding] 增量扫描完成，行 ${lineNumbers.join(',')}, 发现 ${newTodos.length} 个TODO项`)

    // 刷新树视图（只有在当前标签页为current时才需要）
    if (this.currentTab === 'current') {
      this._onDidChangeTreeData.fire()
    }
  }

  private updateDecorations(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const document = editor.document
    const todoDecorations: Map<string, vscode.DecorationOptions[]> = new Map()
    const currentFileTodos = this.todos.filter(todo =>
      vscode.workspace.asRelativePath(document.uri) === todo.file,
    )

    console.log(`[CCoding] 更新装饰器，当前文件有 ${currentFileTodos.length} 个TODO项`)

    currentFileTodos.forEach((todo) => {
      // 验证行号是否仍然有效（防止文档变化后行号失效）
      if (todo.line >= document.lineCount) {
        console.log(`[CCoding] 跳过无效行号 ${todo.line}，文档只有 ${document.lineCount} 行`)
        return
      }

      const line = document.lineAt(todo.line)
      const lineText = line.text

      // 重新查找待办项在当前行的精确位置
      const regex = new RegExp(`(${todo.type})(?:\\s*\\([^)]+\\))?\\s*:?\\s*(.+)`, 'i')
      const match = lineText.match(regex)

      if (match) {
        const todoStart = lineText.indexOf(match[0])
        const todoEnd = todoStart + match[0].length

        // 只高亮待办项部分，不包括注释符号
        const range = new vscode.Range(
          new vscode.Position(todo.line, todoStart),
          new vscode.Position(todo.line, todoEnd),
        )

        const decoration: vscode.DecorationOptions = {
          range,
          hoverMessage: `**${todo.type}**: ${todo.text}\n\n📁 ${todo.file}:${todo.line + 1}`,
        }

        if (!todoDecorations.has(todo.type)) {
          todoDecorations.set(todo.type, [])
        }
        todoDecorations.get(todo.type)!.push(decoration)
      }
      else {
        console.log(`[CCoding] 在行 ${todo.line} 未找到匹配的TODO项: ${todo.text}`)
      }
    })

    // 应用装饰
    this.decorationTypes.forEach((decorationType, type) => {
      const decorations = todoDecorations.get(type) || []
      editor.setDecorations(decorationType, decorations)
    })

    console.log(`[CCoding] 装饰器更新完成，应用了 ${Array.from(todoDecorations.values()).reduce((sum, arr) => sum + arr.length, 0)} 个装饰`)
  }

  dispose(): void {
    console.log('[CCoding] 清理TODO Provider资源')

    // 停止扫描
    this.isScanning = false
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout)
      this.scanTimeout = undefined
    }

    // 清理装饰器更新计时器
    if (this.decorationUpdateTimeout) {
      clearTimeout(this.decorationUpdateTimeout)
      this.decorationUpdateTimeout = undefined
    }

    // 清理装饰器
    this.decorationTypes.forEach((decorationType) => {
      decorationType.dispose()
    })
    this.decorationTypes.clear()

    // 清理事件监听器
    this._disposables.forEach(disposable => disposable.dispose())
    this._disposables = []

    // 清理EventEmitter
    this._onDidChangeTreeData.dispose()

    // 清理数据
    this.todos = []
    this.currentDocumentTodos.clear()
  }

  /**
   * 搜索待办事项
   * @param query - 搜索查询
   * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
   * @description 在待办事项文本和文件名中搜索匹配的内容，结果直接在树视图中过滤显示
   */
  async searchTodos(query: string, scope: 'current' | 'all'): Promise<void> {
    this.searchQuery = query ? query.toLowerCase().trim() : ''
    this.searchScope = scope

    // 直接刷新树视图，使用新的搜索条件
    this.refresh()
  }

  /**
   * 清除搜索状态
   */
  clearSearch(): void {
    this.searchQuery = ''
    this.refresh()
  }
}

class TodoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly todos: TodoItem[],
    public readonly isGroup: boolean,
  ) {
    super(
      label,
      isGroup ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    )
    if (isGroup) {
      this.description = `${todos.length} item${todos.length > 1 ? 's' : ''}`
      this.iconPath = new vscode.ThemeIcon(this.getIconForTodoType(label as TodoItem['type']), this.getColorForTodoType(label as TodoItem['type']))
    }
    else {
      const todo = todos[0]
      this.description = `${todo.file}:${todo.line + 1}`
      this.tooltip = `${todo.text}\n${todo.file}:${todo.line + 1}`
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [
          vscode.Uri.file(`${vscode.workspace.workspaceFolders![0].uri.fsPath}/${todo.file}`),
          {
            selection: new vscode.Range(
              new vscode.Position(todo.line, todo.column),
              new vscode.Position(todo.line, todo.column + todo.text.length),
            ),
          },
        ],
      }
      this.iconPath = new vscode.ThemeIcon('circle-outline', this.getColorForTodoType(todo.type))
    }
  }

  private getIconForTodoType(type: TodoItem['type']): string {
    switch (type) {
      case 'TODO':
        return 'check'
      case 'FIXME':
        return 'tools'
      case 'NOTE':
        return 'note'
      case 'HACK':
        return 'warning'
      case 'BUG':
        return 'bug'
      default:
        return 'circle-outline'
    }
  }

  private getColorForTodoType(type: TodoItem['type']): vscode.ThemeColor {
    switch (type) {
      case 'TODO':
        return new vscode.ThemeColor('charts.blue')
      case 'FIXME':
        return new vscode.ThemeColor('charts.orange')
      case 'NOTE':
        return new vscode.ThemeColor('charts.green')
      case 'HACK':
        return new vscode.ThemeColor('charts.yellow')
      case 'BUG':
        return new vscode.ThemeColor('charts.red')
      default:
        return new vscode.ThemeColor('foreground')
    }
  }
}
