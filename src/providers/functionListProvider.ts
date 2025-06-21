import * as vscode from 'vscode'

export class FunctionListProvider implements vscode.TreeDataProvider<FunctionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FunctionItem | undefined | null | void> = new vscode.EventEmitter<FunctionItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<FunctionItem | undefined | null | void> = this._onDidChangeTreeData.event

  private functions: FunctionItem[] = []

  constructor() {
    this.refresh()
  }

  refresh(): void {
    this.parseFunctions()
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: FunctionItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: FunctionItem): Thenable<FunctionItem[]> {
    if (!element) {
      return Promise.resolve(this.getFilteredFunctions())
    }
    return Promise.resolve([])
  }

  /**
   * 获取过滤后的函数列表
   * @returns 过滤后的函数数组
   */
  private getFilteredFunctions(): FunctionItem[] {
    let functions = [...this.functions]

    // 应用搜索过滤
    if (this.searchQuery) {
      functions = functions.filter(func =>
        func.name.toLowerCase().includes(this.searchQuery),
      )
    }

    return functions
  }

  private async parseFunctions() {
    this.functions = []
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const document = editor.document
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    )

    if (symbols) {
      this.extractFunctions(symbols, document)
    }
  }

  private extractFunctions(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument, level = 0) {
    for (const symbol of symbols) {
      if (this.isFunctionSymbol(symbol.kind)) {
        const functionItem = new FunctionItem(
          symbol.name,
          symbol.kind,
          symbol.range,
          document.uri,
          level,
        )
        this.functions.push(functionItem)
      }

      if (symbol.children && symbol.children.length > 0) {
        this.extractFunctions(symbol.children, document, level + 1)
      }
    }
  }

  private isFunctionSymbol(kind: vscode.SymbolKind): boolean {
    return kind === vscode.SymbolKind.Function
      || kind === vscode.SymbolKind.Method
      || kind === vscode.SymbolKind.Constructor
  }

  /**
   * 当前搜索状态
   */
  private searchQuery: string = ''
  private searchScope: 'current' | 'all' = 'current'

  /**
   * 搜索功能列表
   * @param query - 搜索查询
   * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
   * @description 在功能名称中搜索匹配的内容，结果直接在树视图中过滤显示
   */
  async searchFunctions(query: string, scope: 'current' | 'all'): Promise<void> {
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

class FunctionItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly kind: vscode.SymbolKind,
    public readonly range: vscode.Range,
    public readonly uri: vscode.Uri,
    public readonly level: number,
  ) {
    super(name, vscode.TreeItemCollapsibleState.None)

    this.tooltip = `${this.name} (Line ${this.range.start.line + 1})`
    this.description = `Line ${this.range.start.line + 1}`

    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [this.uri, {
        selection: new vscode.Range(
          this.range.start.line,
          this.range.start.character,
          this.range.start.line,
          this.range.start.character,
        ),
      }],
    }

    this.iconPath = this.getIconForSymbolKind(kind)
  }

  private getIconForSymbolKind(kind: vscode.SymbolKind): vscode.ThemeIcon {
    switch (kind) {
      case vscode.SymbolKind.Function:
        return new vscode.ThemeIcon('symbol-function')
      case vscode.SymbolKind.Method:
        return new vscode.ThemeIcon('symbol-method')
      case vscode.SymbolKind.Constructor:
        return new vscode.ThemeIcon('symbol-constructor')
      default:
        return new vscode.ThemeIcon('symbol-function')
    }
  }
}
