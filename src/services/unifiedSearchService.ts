import * as vscode from 'vscode'

export enum SearchType {
  ALL = 'all',
  FILES = 'files',
  SYMBOLS = 'symbols',
  TODOS = 'todos',
  BOOKMARKS = 'bookmarks',
}

export interface SearchResult {
  type: SearchType
  label: string
  description?: string
  detail?: string
  uri?: vscode.Uri
  range?: vscode.Range
  iconId?: string
  priority?: number
  data?: any
}

export interface SearchOptions {
  types?: SearchType[]
  maxResults?: number
  caseSensitive?: boolean
  useRegex?: boolean
  excludePatterns?: string[]
}

/**
 * 统一搜索服务
 * 提供统一的搜索接口，整合文件、符号、TODO、书签等搜索功能
 */
export class UnifiedSearchService {
  private static instance: UnifiedSearchService
  private cache = new Map<string, SearchResult[]>()
  private readonly cacheTimeout = 60000 // 1分钟缓存

  private constructor() {}

  public static getInstance(): UnifiedSearchService {
    if (!UnifiedSearchService.instance) {
      UnifiedSearchService.instance = new UnifiedSearchService()
    }
    return UnifiedSearchService.instance
  }

  /**
   * 执行统一搜索
   */
  public async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query.trim()) {
      return []
    }

    const cacheKey = this.getCacheKey(query, options)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const {
      types = [SearchType.ALL],
      maxResults = 100,
      caseSensitive = false,
      useRegex: _useRegex = false,
      excludePatterns = this.getDefaultExcludePatterns(),
    } = options

    const results: SearchResult[] = []
    const searchTypes = types.includes(SearchType.ALL)
      ? [SearchType.FILES, SearchType.SYMBOLS, SearchType.TODOS, SearchType.BOOKMARKS]
      : types

    try {
      // 并行执行不同类型的搜索
      const searchPromises = searchTypes.map(async (type) => {
        switch (type) {
          case SearchType.FILES:
            return await this.searchFiles(query, excludePatterns, maxResults)
          case SearchType.SYMBOLS:
            return await this.searchSymbols(query, excludePatterns, caseSensitive, maxResults)
          case SearchType.TODOS:
            return await this.searchTodos(query, excludePatterns, caseSensitive, maxResults)
          case SearchType.BOOKMARKS:
            return await this.searchBookmarks(query, caseSensitive, maxResults)
          default:
            return []
        }
      })

      const searchResults = await Promise.all(searchPromises)
      results.push(...searchResults.flat())

      // 按优先级和相关性排序
      results.sort((a, b) => {
        // 优先级排序
        const priorityDiff = (b.priority || 0) - (a.priority || 0)
        if (priorityDiff !== 0)
          return priorityDiff

        // 类型排序优先级：SYMBOLS > FILES > TODOS > BOOKMARKS
        const typeOrder = {
          [SearchType.SYMBOLS]: 4,
          [SearchType.FILES]: 3,
          [SearchType.TODOS]: 2,
          [SearchType.BOOKMARKS]: 1,
        }
        return (typeOrder[b.type] || 0) - (typeOrder[a.type] || 0)
      })

      // 限制结果数量
      const limitedResults = results.slice(0, maxResults)

      // 缓存结果
      this.cache.set(cacheKey, limitedResults)
      setTimeout(() => this.cache.delete(cacheKey), this.cacheTimeout)

      return limitedResults
    }
    catch (error) {
      console.error('[UnifiedSearchService] 搜索失败:', error)
      throw error
    }
  }

  /**
   * 搜索文件
   */
  private async searchFiles(query: string, excludePatterns: string[], maxResults: number): Promise<SearchResult[]> {
    try {
      const files = await vscode.workspace.findFiles(
        `**/*${query}*`,
        `{${excludePatterns.join(',')}}`,
        maxResults,
      )

      return files.map((uri) => {
        const fileName = uri.fsPath.split('/').pop() || ''
        const relativePath = vscode.workspace.asRelativePath(uri, false)

        // 计算相关性分数
        const priority = this.calculateFilePriority(fileName, query)

        return {
          type: SearchType.FILES,
          label: fileName,
          description: relativePath,
          detail: `文件匹配: ${fileName}`,
          uri,
          iconId: 'file',
          priority,
          data: { fileName, relativePath },
        }
      })
    }
    catch (error) {
      console.error('[UnifiedSearchService] 搜索文件失败:', error)
      return []
    }
  }

  /**
   * 搜索符号
   */
  private async searchSymbols(query: string, excludePatterns: string[], caseSensitive: boolean, maxResults: number): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    try {
      // 搜索当前打开的编辑器中的符号
      const editor = vscode.window.activeTextEditor
      if (editor) {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          editor.document.uri,
        )

        if (symbols) {
          const matchingSymbols = this.findMatchingSymbols(symbols, query, caseSensitive, editor.document.uri)
          results.push(...matchingSymbols)
        }
      }

      // TODO: 如果需要搜索整个工作区的符号，可以在这里添加工作区符号搜索
      // const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      //   'vscode.executeWorkspaceSymbolProvider',
      //   query
      // )

      return results.slice(0, maxResults)
    }
    catch (error) {
      console.error('[UnifiedSearchService] 搜索符号失败:', error)
      return []
    }
  }

  /**
   * 搜索TODO项目
   */
  private async searchTodos(query: string, excludePatterns: string[], caseSensitive: boolean, maxResults: number): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')

    try {
      // 查找相关文件
      const filePatterns = [
        '**/*.{js,ts,jsx,tsx,vue,py,java,cpp,c,h,cs,php,rb,go,rs,swift,kt}',
        '**/*.{md,txt,json,yml,yaml,xml,html,css,scss,sass,less}',
      ]

      for (const pattern of filePatterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          `{${excludePatterns.join(',')}}`,
          500, // 限制文件数量
        )

        for (const fileUri of files) {
          if (results.length >= maxResults)
            break

          try {
            const document = await vscode.workspace.openTextDocument(fileUri)
            const fileTodos = this.scanTodosInDocument(document, searchRegex)
            results.push(...fileTodos)
          }
          catch (error) {
            console.warn(`[UnifiedSearchService] 无法读取文件 ${fileUri.fsPath}:`, error)
          }
        }

        if (results.length >= maxResults)
          break
      }

      return results.slice(0, maxResults)
    }
    catch (error) {
      console.error('[UnifiedSearchService] 搜索TODO失败:', error)
      return []
    }
  }

  /**
   * 搜索书签
   */
  private async searchBookmarks(_query: string, _caseSensitive: boolean, _maxResults: number): Promise<SearchResult[]> {
    // TODO: 需要从BookmarkProvider获取书签数据
    // 这里先返回空数组，后续集成时实现
    console.log('[UnifiedSearchService] 书签搜索暂未实现')
    return []
  }

  /**
   * 在文档中扫描符合条件的符号
   */
  private findMatchingSymbols(symbols: vscode.DocumentSymbol[], query: string, caseSensitive: boolean, uri: vscode.Uri): SearchResult[] {
    const results: SearchResult[] = []
    const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')

    const processSymbol = (symbol: vscode.DocumentSymbol) => {
      if (searchRegex.test(symbol.name)) {
        const priority = this.calculateSymbolPriority(symbol.name, query)

        results.push({
          type: SearchType.SYMBOLS,
          label: symbol.name,
          description: `${vscode.SymbolKind[symbol.kind]} · L:${symbol.range.start.line + 1}`,
          detail: `符号匹配: ${symbol.name}`,
          uri,
          range: symbol.range,
          iconId: this.getSymbolIconId(symbol.kind),
          priority,
          data: { symbolKind: symbol.kind, fileName: vscode.workspace.asRelativePath(uri, false) },
        })
      }

      // 递归处理子符号
      if (symbol.children) {
        symbol.children.forEach(processSymbol)
      }
    }

    symbols.forEach(processSymbol)
    return results
  }

  /**
   * 在文档中扫描TODO项目
   */
  private scanTodosInDocument(document: vscode.TextDocument, searchRegex: RegExp): SearchResult[] {
    const results: SearchResult[] = []
    const todoRegex = /(?:\/\/\s*|\/\*\s*|#\s*|<!--\s*)?(TODO|FIXME|NOTE|BUG|HACK)(?:\s*[:：]\s*(?:\d+\.\s*)?)?(.+)/gi

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i)
      const lineText = line.text.trim()

      if (!lineText)
        continue

      const todoMatches = [...lineText.matchAll(todoRegex)]

      for (const todoMatch of todoMatches) {
        const [fullMatch, type, text] = todoMatch

        // 检查TODO文本是否匹配搜索查询
        if (searchRegex.test(text) || searchRegex.test(type)) {
          const startPos = line.text.indexOf(fullMatch)
          const priority = this.calculateTodoPriority(type, text)

          results.push({
            type: SearchType.TODOS,
            label: text.trim(),
            description: `${type} · ${vscode.workspace.asRelativePath(document.uri, false)}:${i + 1}`,
            detail: `待办匹配: ${type} - ${text.trim()}`,
            uri: document.uri,
            range: new vscode.Range(
              new vscode.Position(i, startPos),
              new vscode.Position(i, startPos + fullMatch.length),
            ),
            iconId: this.getTodoIconId(type),
            priority,
            data: { todoType: type, filePath: vscode.workspace.asRelativePath(document.uri, false) },
          })
        }
      }
    }

    return results
  }

  /**
   * 计算文件匹配的优先级
   */
  private calculateFilePriority(fileName: string, query: string): number {
    const lowerFileName = fileName.toLowerCase()
    const lowerQuery = query.toLowerCase()

    if (lowerFileName === lowerQuery)
      return 100
    if (lowerFileName.startsWith(lowerQuery))
      return 80
    if (lowerFileName.includes(lowerQuery))
      return 60
    return 40
  }

  /**
   * 计算符号匹配的优先级
   */
  private calculateSymbolPriority(symbolName: string, query: string): number {
    const lowerSymbolName = symbolName.toLowerCase()
    const lowerQuery = query.toLowerCase()

    if (lowerSymbolName === lowerQuery)
      return 100
    if (lowerSymbolName.startsWith(lowerQuery))
      return 80
    if (lowerSymbolName.includes(lowerQuery))
      return 60
    return 40
  }

  /**
   * 计算TODO优先级
   */
  private calculateTodoPriority(type: string, text: string): number {
    let priority = 40
    const upperType = type.toUpperCase()
    const lowerText = text.toLowerCase()

    // 根据类型设置基础优先级
    switch (upperType) {
      case 'FIXME':
        priority = 80
        break
      case 'BUG':
        priority = 80
        break
      case 'TODO':
        priority = 60
        break
      case 'HACK':
        priority = 60
        break
      case 'NOTE':
        priority = 40
        break
    }

    // 根据文本内容调整优先级
    if (lowerText.includes('urgent') || lowerText.includes('紧急') || lowerText.includes('asap')) {
      priority += 10
    }
    if (lowerText.includes('important') || lowerText.includes('重要') || lowerText.includes('critical')) {
      priority += 10
    }

    return priority
  }

  /**
   * 获取符号图标ID
   */
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

  /**
   * 获取TODO图标ID
   */
  private getTodoIconId(type: string): string {
    switch (type.toUpperCase()) {
      case 'TODO': return 'check'
      case 'FIXME': return 'tools'
      case 'NOTE': return 'note'
      case 'BUG': return 'bug'
      case 'HACK': return 'zap'
      default: return 'list-unordered'
    }
  }

  /**
   * 获取默认的排除模式
   */
  private getDefaultExcludePatterns(): string[] {
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
      '**/.vscode/**',
      '**/.idea/**',
      '**/temp/**',
      '**/tmp/**',
    ]

    return [...defaultPatterns, ...userPatterns]
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(query: string, options: SearchOptions): string {
    return `${query}-${JSON.stringify(options)}`
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计
   */
  public getCacheStats(): { size: number, keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}
