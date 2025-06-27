import * as vscode from 'vscode'

interface Bookmark {
  id: string
  label: string
  uri: vscode.Uri
  range: vscode.Range
  timestamp: number
}

export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookmarkItem | undefined | null | void> = new vscode.EventEmitter<BookmarkItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<BookmarkItem | undefined | null | void> = this._onDidChangeTreeData.event

  private bookmarks: Bookmark[] = []
  private context: vscode.ExtensionContext
  private currentTab: 'current' | 'all' = 'current'

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.loadBookmarks()
  }

  /**
   * 设置当前Tab状态
   * @param tab - 当前选择的Tab类型
   * @description 外部调用此方法来更新Tab状态并刷新显示
   */
  setCurrentTab(tab: 'current' | 'all'): void {
    if (this.currentTab !== tab) {
      this.currentTab = tab
      this.refresh()
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: BookmarkItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: BookmarkItem): Thenable<BookmarkItem[]> {
    if (!element) {
      const filteredBookmarks = this.getFilteredBookmarks()
      const items = filteredBookmarks.map(bookmark => new BookmarkItem(bookmark))
      return Promise.resolve(items)
    }
    return Promise.resolve([])
  }

  /**
   * 根据当前Tab状态过滤书签
   * @returns 过滤后的书签数组
   * @description 当Tab为'current'时只返回当前文件的书签，为'all'时返回所有书签
   */
  private getFilteredBookmarks(): Bookmark[] {
    let bookmarks: Bookmark[] = []

    // 根据当前tab获取基础数据
    if (this.currentTab === 'current') {
      bookmarks = this.getCurrentFileBookmarks()
    }
    else {
      bookmarks = this.bookmarks
    }

    // 应用搜索过滤
    if (this.searchQuery) {
      bookmarks = bookmarks.filter((bookmark) => {
        const fileName = vscode.workspace.asRelativePath(bookmark.uri)
        return bookmark.label.toLowerCase().includes(this.searchQuery)
          || fileName.toLowerCase().includes(this.searchQuery)
      })
    }

    return bookmarks
  }

  /**
   * 获取当前文件的书签
   * @returns 当前文件的书签数组
   * @description 如果没有打开的编辑器，返回空数组
   */
  private getCurrentFileBookmarks(): Bookmark[] {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return []
    }

    const currentFileUri = editor.document.uri.toString()
    return this.bookmarks.filter(bookmark => bookmark.uri.toString() === currentFileUri)
  }

  async addBookmark() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    const selection = editor.selection
    const document = editor.document
    const lineText = document.lineAt(selection.active.line).text.trim()

    const label = await vscode.window.showInputBox({
      prompt: 'Enter bookmark label',
      value: lineText || `Bookmark at line ${selection.active.line + 1}`,
      placeHolder: 'Enter a custom name for this bookmark',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Bookmark label cannot be empty'
        }
        if (value.length > 50) {
          return 'Bookmark label is too long (max 50 characters)'
        }
        return null
      },
    })

    if (label) {
      const bookmark: Bookmark = {
        id: Date.now().toString(),
        label,
        uri: document.uri,
        range: selection.isEmpty
          ? new vscode.Range(selection.active.line, 0, selection.active.line, 0)
          : selection,
        timestamp: Date.now(),
      }

      this.bookmarks.push(bookmark)
      this.saveBookmarks()
      this.refresh()

      vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', this.bookmarks.length > 0)
      vscode.window.showInformationMessage(`Bookmark "${label}" added`)
    }
  }

  async addBookmarkFromContext(uri: vscode.Uri) {
    try {
      const _document = await vscode.workspace.openTextDocument(uri)
      const fileName = vscode.workspace.asRelativePath(uri)

      const label = await vscode.window.showInputBox({
        prompt: 'Enter bookmark label',
        value: `Bookmark for ${fileName}`,
        placeHolder: 'Enter a custom name for this bookmark',
        validateInput: (value: string) => {
          if (!value || value.trim().length === 0) {
            return 'Bookmark label cannot be empty'
          }
          if (value.length > 50) {
            return 'Bookmark label is too long (max 50 characters)'
          }
          return null
        },
      })

      if (label) {
        const bookmark: Bookmark = {
          id: Date.now().toString(),
          label,
          uri,
          range: new vscode.Range(0, 0, 0, 0),
          timestamp: Date.now(),
        }

        this.bookmarks.push(bookmark)
        this.saveBookmarks()
        this.refresh()

        vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', this.bookmarks.length > 0)
        vscode.window.showInformationMessage(`Bookmark "${label}" added for ${fileName}`)
      }
    }
    catch (error) {
      vscode.window.showErrorMessage(`Failed to add bookmark: ${error}`)
    }
  }

  /**
   * 从编辑器右键菜单添加书签
   * @description 支持当前文件和当前选中位置的书签添加
   */
  async addBookmarkFromEditor() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    const selection = editor.selection
    const document = editor.document
    const fileName = vscode.workspace.asRelativePath(document.uri)
    const lineText = document.lineAt(selection.active.line).text.trim()

    // 根据是否有选中内容提供不同的默认标签
    let defaultLabel = ''
    if (!selection.isEmpty) {
      const selectedText = document.getText(selection)
      defaultLabel = `Selected: ${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}`
    }
    else {
      defaultLabel = lineText || `Line ${selection.active.line + 1} in ${fileName}`
    }

    const label = await vscode.window.showInputBox({
      prompt: '输入书签标签',
      value: defaultLabel,
      placeHolder: '为此书签输入自定义名称',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Bookmark label cannot be empty'
        }
        if (value.length > 50) {
          return 'Bookmark label is too long (max 50 characters)'
        }
        return null
      },
    })

    if (label) {
      const bookmark: Bookmark = {
        id: Date.now().toString(),
        label: label.trim(),
        uri: document.uri,
        range: selection.isEmpty
          ? new vscode.Range(selection.active.line, 0, selection.active.line, 0)
          : selection,
        timestamp: Date.now(),
      }

      this.bookmarks.push(bookmark)
      this.saveBookmarks()
      this.refresh()

      vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', this.bookmarks.length > 0)
      vscode.window.showInformationMessage(`书签 "${label}" 已添加到 ${fileName}`)
    }
  }

  async editBookmark(bookmarkId: string) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
    if (!bookmark) {
      vscode.window.showErrorMessage('Bookmark not found')
      return
    }

    const newLabel = await vscode.window.showInputBox({
      prompt: 'Edit bookmark label',
      value: bookmark.label,
      placeHolder: 'Enter a new name for this bookmark',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Bookmark label cannot be empty'
        }
        if (value.length > 50) {
          return 'Bookmark label is too long (max 50 characters)'
        }
        return null
      },
    })

    if (newLabel && newLabel !== bookmark.label) {
      bookmark.label = newLabel.trim()
      this.saveBookmarks()
      this.refresh()
      vscode.window.showInformationMessage(`Bookmark renamed to "${newLabel}"`)
    }
  }

  removeBookmark(bookmarkId: string) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId)
    if (bookmark) {
      this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId)
      this.saveBookmarks()
      this.refresh()
      vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', this.bookmarks.length > 0)
      vscode.window.showInformationMessage(`Bookmark "${bookmark.label}" removed`)
    }
  }

  private loadBookmarks() {
    try {
      const saved = this.context.globalState.get<any[]>('CCoding.bookmarks', [])
      console.log('Loading bookmarks from globalState:', saved.length, 'items')

      this.bookmarks = saved
        .filter(b => this.isValidBookmark(b))
        .map((b) => {
          try {
            // 确保 URI 对象正确重建
            const uri = typeof b.uri === 'string'
              ? vscode.Uri.parse(b.uri)
              : (b.uri && b.uri.scheme ? vscode.Uri.parse(b.uri.toString()) : vscode.Uri.parse(b.uri))

            // 确保 Range 对象正确重建
            const range = new vscode.Range(
              new vscode.Position(
                b.range?.start?.line || 0,
                b.range?.start?.character || 0,
              ),
              new vscode.Position(
                b.range?.end?.line || 0,
                b.range?.end?.character || 0,
              ),
            )

            return {
              id: b.id || Date.now().toString(),
              label: b.label || 'Unknown Bookmark',
              uri,
              range,
              timestamp: b.timestamp || Date.now(),
            }
          }
          catch (itemError) {
            console.error('Error processing bookmark item:', itemError, b)
            return null
          }
        })
        .filter(b => b !== null) as Bookmark[]

      console.log('Successfully loaded bookmarks:', this.bookmarks.length)
      vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', this.bookmarks.length > 0)
    }
    catch (error) {
      console.error('Error loading bookmarks:', error)
      // 如果加载失败，重置为空数组但不清除原数据（可能是临时错误）
      this.bookmarks = []
      vscode.commands.executeCommand('setContext', 'CCoding.hasBookmarks', false)
    }
  }

  /**
   * 验证书签数据的完整性
   * @param bookmark 要验证的书签数据
   * @returns 是否有效
   */
  private isValidBookmark(bookmark: any): boolean {
    if (!bookmark || typeof bookmark !== 'object') {
      return false
    }

    // 检查必需的属性（放宽验证条件）
    if (!bookmark.id || !bookmark.label || typeof bookmark.label !== 'string') {
      return false
    }

    // 检查 URI（支持多种格式）
    if (!bookmark.uri) {
      return false
    }

    // 检查 range 对象的完整性（提供默认值）
    if (!bookmark.range) {
      return false
    }

    // 放宽range验证，只要有基本结构即可
    if (!bookmark.range.start && !bookmark.range.end) {
      return false
    }

    return true
  }

  private saveBookmarks() {
    try {
      // 序列化数据，确保 URI 和 Range 对象被正确转换
      const serializedBookmarks = this.bookmarks.map(bookmark => ({
        id: bookmark.id,
        label: bookmark.label,
        uri: bookmark.uri.toString(), // 确保 URI 被序列化为字符串
        range: {
          start: {
            line: bookmark.range.start.line,
            character: bookmark.range.start.character,
          },
          end: {
            line: bookmark.range.end.line,
            character: bookmark.range.end.character,
          },
        },
        timestamp: bookmark.timestamp,
      }))

      console.log('Saving bookmarks to globalState:', serializedBookmarks.length, 'items')
      this.context.globalState.update('CCoding.bookmarks', serializedBookmarks)

      // 强制同步保存
      if (this.context.globalState.setKeysForSync) {
        this.context.globalState.setKeysForSync(['CCoding.bookmarks'])
      }
    }
    catch (error) {
      console.error('Error saving bookmarks:', error)
      vscode.window.showErrorMessage(`保存书签数据失败: ${error}`)
    }
  }

  /**
   * 当前搜索状态
   */
  private searchQuery: string = ''
  private searchScope: 'current' | 'all' = 'current'

  /**
   * 搜索书签
   * @param query - 搜索查询
   * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
   * @description 在书签标签和文件名中搜索匹配的内容，结果直接在树视图中过滤显示
   */
  async searchBookmarks(query: string, scope: 'current' | 'all'): Promise<void> {
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

  /**
   * 公共方法：强制保存书签数据
   * @description 提供给外部调用的数据保存方法，确保数据持久化
   */
  public forceSave(): void {
    this.saveBookmarks()
  }

  /**
   * 公共方法：获取书签数量
   * @returns 当前书签总数
   */
  public getBookmarkCount(): number {
    return this.bookmarks.length
  }

  /**
   * 公共方法：检查数据状态
   * @returns 数据健康状态信息
   */
  public getDataHealth(): { isHealthy: boolean, count: number, lastSaved: string } {
    try {
      const saved = this.context.globalState.get<any[]>('CCoding.bookmarks', [])
      return {
        isHealthy: saved.length === this.bookmarks.length,
        count: this.bookmarks.length,
        lastSaved: new Date().toISOString(),
      }
    }
    catch {
      return {
        isHealthy: false,
        count: this.bookmarks.length,
        lastSaved: 'Error checking',
      }
    }
  }
}

class BookmarkItem extends vscode.TreeItem {
  constructor(public readonly bookmark: Bookmark) {
    super(bookmark.label, vscode.TreeItemCollapsibleState.None)

    try {
      const fileName = vscode.workspace.asRelativePath(bookmark.uri)
      const lineNumber = bookmark.range?.start?.line ? bookmark.range.start.line + 1 : 1

      this.tooltip = `${bookmark.label} in ${fileName} (Line ${lineNumber})`
      this.description = `${fileName}:${lineNumber}`

      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [bookmark.uri, {
          selection: bookmark.range,
        }],
      }

      this.iconPath = new vscode.ThemeIcon('bookmark')
      this.contextValue = 'bookmark'
    }
    catch (error) {
      console.error('Error creating BookmarkItem:', error)
      // 创建一个安全的fallback显示
      this.label = bookmark.label || '错误的书签'
      this.description = '数据损坏'
      this.tooltip = '此书签数据已损坏，请使用数据修复工具进行修复'
      this.iconPath = new vscode.ThemeIcon('error')
      this.contextValue = 'bookmark'
    }
  }
}
