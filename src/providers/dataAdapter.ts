import type { BookmarkProvider } from './bookmarkProvider'
import type { FunctionListProvider } from './functionListProvider'
import type { PinnedSymbolProvider } from './pinnedSymbolProvider'
import type { TodoProvider } from './todoProvider'
import type { UnifiedItem } from './unifiedListProvider'
import * as vscode from 'vscode'

/**
 * 数据适配器 - 将现有Provider的数据转换为统一格式
 */
export class DataAdapter {
  constructor(
    private functionProvider: FunctionListProvider,
    private bookmarkProvider: BookmarkProvider,
    private todoProvider: TodoProvider,
    private pinnedSymbolProvider: PinnedSymbolProvider,
  ) {}

  /**
   * 从符号Provider获取统一格式数据
   */
  async getSymbolItems(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 开始获取符号项...')
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      console.log('[DataAdapter] 没有活动编辑器')
      return []
    }

    console.log(`[DataAdapter] 活动编辑器文件: ${editor.document.fileName}`)
    const document = editor.document
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    )

    if (!symbols || symbols.length === 0) {
      console.log('[DataAdapter] 没有找到符号')
      return []
    }

    console.log(`[DataAdapter] 找到${symbols.length}个符号`)
    const result = this.flattenSymbols(symbols, document.uri)
    console.log(`[DataAdapter] 扁平化后得到${result.length}个符号项`)
    return result
  }

  /**
   * 从书签Provider获取统一格式数据
   */
  async getBookmarkItems(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 开始获取书签项...')

    try {
      const bookmarks = await this.getBookmarksFromProvider()
      console.log(`[DataAdapter] 从Provider获取到${bookmarks.length}个书签`)

      const result = bookmarks.map(bookmark => ({
        id: `bookmark-${bookmark.id}`,
        type: 'bookmark' as const,
        label: bookmark.label,
        description: this.truncateText(bookmark.description || '', 50),
        location: {
          file: this.getRelativePath(bookmark.uri),
          line: bookmark.range.start.line,
          character: bookmark.range.start.character,
        },
        icon: 'bookmark',
        iconColor: 'charts.blue',
        isPinned: false,
        timestamp: bookmark.timestamp || Date.now(),
        uri: bookmark.uri,
        range: bookmark.range,
        bookmarkNote: bookmark.description,
      }))

      console.log(`[DataAdapter] 转换后得到${result.length}个书签项`)
      return result
    }
    catch (error) {
      console.warn('[DataAdapter] 获取书签失败:', error)
      return []
    }
  }

  /**
   * 从TODO Provider获取统一格式数据
   */
  async getTodoItems(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 开始获取TODO项...')

    try {
      const todos = await this.getTodosFromProvider()
      console.log(`[DataAdapter] 从Provider获取到${todos.length}个TODO`)

      const result = todos.map(todo => ({
        id: `todo-${todo.id}`,
        type: 'todo' as const,
        label: this.cleanTodoText(todo.text),
        description: this.truncateText(todo.text, 50),
        location: {
          file: this.getRelativePath(todo.uri),
          line: todo.range.start.line,
          character: todo.range.start.character,
        },
        icon: this.getTodoIcon(todo.type),
        iconColor: this.getTodoColor(todo.type),
        isPinned: false,
        timestamp: todo.timestamp || Date.now(),
        uri: todo.uri,
        range: todo.range,
        todoType: todo.type,
      }))

      console.log(`[DataAdapter] 转换后得到${result.length}个TODO项`)
      return result
    }
    catch (error) {
      console.warn('[DataAdapter] 获取TODO失败:', error)
      return []
    }
  }

  /**
   * 从置顶符号Provider获取统一格式数据
   */
  async getPinnedItems(): Promise<UnifiedItem[]> {
    try {
      const pinnedSymbols = await this.getPinnedSymbolsFromProvider()
      return pinnedSymbols.map(symbol => ({
        id: `pinned-${symbol.id}`,
        type: 'pinned' as const,
        label: symbol.name,
        description: vscode.SymbolKind[symbol.kind],
        location: {
          file: this.getRelativePath(symbol.uri),
          line: symbol.range.start.line,
          character: symbol.range.start.character,
        },
        icon: 'pinned',
        iconColor: 'charts.orange',
        isPinned: true,
        timestamp: symbol.timestamp,
        uri: symbol.uri,
        range: symbol.range,
        symbolKind: symbol.kind,
      }))
    }
    catch (error) {
      console.warn('Failed to get pinned items:', error)
      return []
    }
  }

  /**
   * 扁平化符号树结构
   */
  private flattenSymbols(symbols: vscode.DocumentSymbol[], uri: vscode.Uri, parentName?: string): UnifiedItem[] {
    const items: UnifiedItem[] = []

    for (const symbol of symbols) {
      const displayName = parentName ? `${parentName}.${symbol.name}` : symbol.name

      items.push({
        id: `symbol-${uri.toString()}-${symbol.range.start.line}-${symbol.range.start.character}`,
        type: 'symbol',
        label: displayName,
        description: vscode.SymbolKind[symbol.kind],
        location: {
          file: this.getRelativePath(uri),
          line: symbol.range.start.line,
          character: symbol.range.start.character,
        },
        icon: this.getSymbolIcon(symbol.kind),
        isPinned: false,
        timestamp: Date.now(),
        uri,
        range: symbol.range,
        symbolKind: symbol.kind,
      })

      // 递归处理子符号
      if (symbol.children && symbol.children.length > 0) {
        items.push(...this.flattenSymbols(symbol.children, uri, displayName))
      }
    }

    return items
  }

  /**
   * 从BookmarkProvider获取书签数据
   * 这是一个临时方法，理想情况下BookmarkProvider应该暴露这个方法
   */
  private async getBookmarksFromProvider(): Promise<any[]> {
    // 这里需要根据实际的BookmarkProvider实现来获取数据
    // 如果Provider有公共方法可以获取数据，直接调用
    // 否则可能需要通过反射或修改Provider来暴露数据

    // 临时实现：假设我们可以从globalState获取数据
    const context = (this.bookmarkProvider as any).context
    if (context) {
      return context.globalState.get('CCoding.bookmarks', [])
    }
    return []
  }

  /**
   * 从TodoProvider获取TODO数据
   */
  private async getTodosFromProvider(): Promise<any[]> {
    // 类似书签，这里需要根据实际实现获取数据
    // 假设有方法可以获取所有TODO项目
    try {
      // 如果TodoProvider有公共方法获取当前文档的TODO
      if (typeof (this.todoProvider as any).getCurrentTodos === 'function') {
        return (this.todoProvider as any).getCurrentTodos()
      }

      // 否则尝试扫描当前文档
      const editor = vscode.window.activeTextEditor
      if (!editor)
        return []

      return this.scanTodosInDocument(editor.document)
    }
    catch (error) {
      console.warn('Error getting todos:', error)
      return []
    }
  }

  /**
   * 从PinnedSymbolProvider获取置顶符号数据
   */
  private async getPinnedSymbolsFromProvider(): Promise<any[]> {
    const context = (this.pinnedSymbolProvider as any).context
    if (context) {
      return context.globalState.get('CCoding.pinnedSymbols', [])
    }
    return []
  }

  /**
   * 扫描文档中的TODO项目
   */
  private scanTodosInDocument(document: vscode.TextDocument): any[] {
    const todos: any[] = []
    console.log(`[DataAdapter] 扫描TODO，文档行数: ${document.lineCount}`)

    // 支持多种TODO格式：中英文冒号、可选冒号、数字前缀等
    const todoRegex = /(?:\/\/\s*|\/\*\s*|#\s*)?(TODO|FIXME|NOTE|BUG|HACK)(?:\s*[:：]\s*(?:\d+\.\s*)?)?(.+)/gi

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i)
      const lineText = line.text.trim()

      // 跳过空行
      if (!lineText)
        continue

      const matches = [...lineText.matchAll(todoRegex)]

      for (const match of matches) {
        const [fullMatch, type, text] = match
        const startPos = line.text.indexOf(fullMatch)

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
        }

        todos.push(todoItem)
        console.log(`[DataAdapter] 找到TODO: ${type} - ${text.trim()} (第${i + 1}行)`)
      }
    }

    console.log(`[DataAdapter] 扫描完成，找到${todos.length}个TODO项`)
    return todos
  }

  /**
   * 获取符号图标
   */
  private getSymbolIcon(kind: vscode.SymbolKind): string {
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

  /**
   * 获取TODO图标
   */
  private getTodoIcon(type: string): string {
    const iconMap: Record<string, string> = {
      TODO: 'check',
      FIXME: 'warning',
      NOTE: 'note',
      BUG: 'bug',
      HACK: 'tools',
    }
    return iconMap[type] || 'check'
  }

  /**
   * 获取TODO颜色
   */
  private getTodoColor(type: string): string {
    const colorMap: Record<string, string> = {
      TODO: 'charts.green',
      FIXME: 'charts.red',
      NOTE: 'charts.blue',
      BUG: 'charts.red',
      HACK: 'charts.yellow',
    }
    return colorMap[type] || 'charts.green'
  }

  /**
   * 清理TODO文本
   */
  private cleanTodoText(text: string): string {
    return text.replace(/^\s*\/\/\s*/, '')
      .replace(/^\s*\/\*\s*/, '')
      .replace(/\s*\*\/\s*$/, '')
      .replace(/^\s*#\s*/, '')
      .trim()
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength)
      return text
    return `${text.substring(0, maxLength - 3)}...`
  }

  /**
   * 获取相对路径
   */
  private getRelativePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    if (workspaceFolder) {
      return vscode.workspace.asRelativePath(uri, false)
    }
    return uri.fsPath
  }

  /**
   * 刷新所有数据
   */
  async refreshAllData(): Promise<{
    symbols: UnifiedItem[]
    bookmarks: UnifiedItem[]
    todos: UnifiedItem[]
    pinned: UnifiedItem[]
  }> {
    console.log('[DataAdapter] 开始刷新所有数据...')

    const [symbols, bookmarks, todos, pinned] = await Promise.all([
      this.getSymbolItems(),
      this.getBookmarkItems(),
      this.getTodoItems(),
      this.getPinnedItems(),
    ])

    const result = { symbols, bookmarks, todos, pinned }
    console.log('[DataAdapter] 数据刷新完成:', {
      symbols: symbols.length,
      bookmarks: bookmarks.length,
      todos: todos.length,
      pinned: pinned.length,
      total: symbols.length + bookmarks.length + todos.length + pinned.length,
    })

    return result
  }
}
