import type { BookmarkProvider } from './bookmarkProvider.js'
import type { FunctionListProvider } from './functionListProvider.js'
import type { TodoProvider } from './todoProvider.js'
import type { UnifiedItem } from './unifiedListProvider.js'
import * as vscode from 'vscode'

/**
 * 数据适配器 - 将现有Provider的数据转换为统一格式
 */
export class DataAdapter {
  constructor(
    private functionProvider: FunctionListProvider,
    private bookmarkProvider: BookmarkProvider,
    private todoProvider: TodoProvider,
  ) {}

  /**
   * 从符号Provider获取统一格式数据（带分组）
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

    // 转换为扩展的符号格式
    const enhancedSymbols = this.convertToEnhancedSymbols(symbols, document)

    // 分组符号
    const groupedSymbols = this.groupSymbolsByType(enhancedSymbols, document)

    console.log(`[DataAdapter] 分组后得到${groupedSymbols.length}个分组`)
    return groupedSymbols
  }

  /**
   * 从书签Provider获取统一格式数据
   */
  async getBookmarkItems(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 开始获取书签项...')

    try {
      const bookmarks = await this.getBookmarksFromProvider()
      console.log(`[DataAdapter] 从Provider获取到${bookmarks.length}个书签`)

      const result = bookmarks.map((bookmark) => {
        const uriObj = this.ensureUri(bookmark.uri)
        return {
          id: `bookmark-${bookmark.id}`,
          type: 'bookmark' as const,
          label: bookmark.label,
          description: this.truncateText(bookmark.description || '', 50),
          location: {
            file: this.getRelativePath(uriObj),
            line: bookmark.range.start.line,
            character: bookmark.range.start.character,
          },
          icon: 'bookmark',
          iconColor: 'charts.blue',
          isPinned: false,
          timestamp: bookmark.timestamp || Date.now(),
          uri: uriObj,
          range: bookmark.range,

          // WebView 序列化友好字段
          uriString: uriObj.toString(),
          simpleRange: {
            startLine: bookmark.range.start.line,
            startCharacter: bookmark.range.start.character,
            endLine: bookmark.range.end.line,
            endCharacter: bookmark.range.end.character,
          },

          bookmarkNote: bookmark.description,
        }
      })

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
   * 从置顶符号Provider获取统一格式数据 (已移除)
   */
  async getPinnedItems(): Promise<UnifiedItem[]> {
    // PinnedSymbolProvider已被移除，返回空数组
    return []
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
   * 转换为增强的符号格式（带智能过滤）
   */
  private convertToEnhancedSymbols(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument): UnifiedItem[] {
    const result: UnifiedItem[] = []
    const frameworkType = this.detectFrameworkType(document)

    for (const symbol of symbols) {
      // 智能过滤：跳过应该被过滤的符号
      if (this.shouldFilterSymbol(symbol, frameworkType)) {
        console.log(`[DataAdapter] 过滤符号: ${symbol.name} (原因: ${this.getFilterReason(symbol)})`)
        continue
      }

      const item = this.symbolToUnifiedItem(symbol, document, frameworkType)
      result.push(item)

      // 递归处理子符号（也会应用过滤）
      if (symbol.children && symbol.children.length > 0) {
        const childItems = this.convertToEnhancedSymbols(symbol.children, document)
        result.push(...childItems)
      }
    }

    return result
  }

  /**
   * 将VSCode符号转换为UnifiedItem
   */
  private symbolToUnifiedItem(symbol: vscode.DocumentSymbol, document: vscode.TextDocument, frameworkType: 'react' | 'vue' | 'general'): UnifiedItem {
    const signature = this.extractSignature(symbol, document)
    const chineseType = this.getChineseSymbolType(symbol, signature, frameworkType)

    return {
      id: `symbol-${document.uri.toString()}-${symbol.range.start.line}-${symbol.range.start.character}`,
      type: 'symbol',
      label: symbol.name,
      description: vscode.SymbolKind[symbol.kind],
      location: {
        file: this.getRelativePath(document.uri),
        line: symbol.range.start.line,
        character: symbol.range.start.character,
      },
      icon: this.getSymbolIcon(symbol.kind),
      isPinned: false,
      timestamp: Date.now(),
      uri: document.uri,
      range: symbol.range,

      // WebView 序列化友好字段
      uriString: document.uri.toString(),
      simpleRange: {
        startLine: symbol.range.start.line,
        startCharacter: symbol.range.start.character,
        endLine: symbol.range.end.line,
        endCharacter: symbol.range.end.character,
      },

      symbolKind: symbol.kind,
      chineseType,
      frameworkType,
    }
  }

  /**
   * 检测框架类型
   */
  private detectFrameworkType(document: vscode.TextDocument): 'react' | 'vue' | 'general' {
    const fileName = document.fileName.toLowerCase()
    if (fileName.endsWith('.vue'))
      return 'vue'
    if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx'))
      return 'react'

    const content = document.getText()
    if (content.includes('import React') || content.includes('from \'react\''))
      return 'react'
    if (content.includes('<template>') || content.includes('Vue.'))
      return 'vue'

    return 'general'
  }

  /**
   * 获取中文符号类型
   */
  private getChineseSymbolType(symbol: vscode.DocumentSymbol, signature: string, frameworkType: 'react' | 'vue' | 'general'): string {
    // Vue特殊处理
    if (frameworkType === 'vue') {
      // 检查 Vue 模板结构标签
      if (this.isVueTemplateStructure(symbol)) {
        return this.getVueStructureType(symbol)
      }
      if (this.isVueComputedProperty(symbol, signature))
        return '计算属性'
      if (this.isVueReactiveData(symbol, signature))
        return '响应式数据'
      if (symbol.kind === vscode.SymbolKind.Method)
        return '方法'
      // 检查箭头函数
      if (this.isArrowFunction(symbol, signature))
        return '函数'
    }

    // React特殊处理
    if (frameworkType === 'react') {
      if (symbol.name.startsWith('use') && symbol.kind === vscode.SymbolKind.Function)
        return 'React Hook'
      if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method)
        return '组件方法'
      // 检查箭头函数
      if (this.isArrowFunction(symbol, signature))
        return '组件方法'
    }

    // 检查箭头函数（通用处理）
    if (this.isArrowFunction(symbol, signature)) {
      return '函数'
    }

    // 通用中文类型
    switch (symbol.kind) {
      case vscode.SymbolKind.Function: return '函数'
      case vscode.SymbolKind.Method: return '方法'
      case vscode.SymbolKind.Class: return '类'
      case vscode.SymbolKind.Variable: return '变量'
      case vscode.SymbolKind.Property: return '属性'
      case vscode.SymbolKind.Constructor: return '构造函数'
      case vscode.SymbolKind.Constant: return '常量'
      case vscode.SymbolKind.Module: return '模块'
      default: return '符号'
    }
  }

  /**
   * 检测Vue computed属性
   */
  private isVueComputedProperty(symbol: vscode.DocumentSymbol, signature: string): boolean {
    if (symbol.name.includes('computed') || symbol.name.endsWith('Computed'))
      return true
    if (signature && (signature.includes('computed(') || signature.includes('computed:')))
      return true
    if (symbol.detail && symbol.detail.includes('computed'))
      return true
    if (signature && symbol.kind === vscode.SymbolKind.Variable) {
      return signature.match(/=\s*computed\s*\(/) !== null
    }
    return false
  }

  /**
   * 检测Vue响应式数据
   */
  private isVueReactiveData(symbol: vscode.DocumentSymbol, signature: string): boolean {
    if (signature && symbol.kind === vscode.SymbolKind.Variable) {
      return signature.includes('ref(') || signature.includes('reactive(')
    }
    return false
  }

  /**
   * 检测是否为箭头函数
   */
  private isArrowFunction(symbol: vscode.DocumentSymbol, signature: string): boolean {
    if (symbol.kind !== vscode.SymbolKind.Variable && symbol.kind !== vscode.SymbolKind.Constant) {
      return false
    }

    if (!signature)
      return false

    // 检查箭头函数的各种模式
    const arrowFunctionPatterns = [
      /=\s*\([^)]*\)\s*=>/, // = () => 或 = (params) =>
      /=\s*\w+\s*=>/, // = param =>
      /=\s*async\s+\([^)]*\)\s*=>/, // = async () =>
      /=\s*async\s+\w+\s*=>/, // = async param =>
    ]

    return arrowFunctionPatterns.some(pattern => pattern.test(signature))
  }

  /**
   * 检测是否为 Vue 模板结构标签
   */
  private isVueTemplateStructure(symbol: vscode.DocumentSymbol): boolean {
    if (symbol.kind !== vscode.SymbolKind.Module) {
      return false
    }

    const vueStructureTags = ['template', 'script', 'script setup', 'style', 'style scoped']
    return vueStructureTags.some(tag => symbol.name.includes(tag))
  }

  /**
   * 获取 Vue 结构标签的中文类型
   */
  private getVueStructureType(symbol: vscode.DocumentSymbol): string {
    if (symbol.name.includes('template')) {
      return '模板结构'
    }
    if (symbol.name.includes('script setup')) {
      return 'Setup脚本'
    }
    if (symbol.name.includes('script')) {
      return '脚本区域'
    }
    if (symbol.name.includes('style scoped')) {
      return '局部样式'
    }
    if (symbol.name.includes('style')) {
      return '样式区域'
    }
    return '结构标签'
  }

  /**
   * 提取符号签名
   */
  private extractSignature(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string {
    try {
      const line = document.lineAt(symbol.range.start.line)
      const text = line.text.trim()
      return text.length > 80 ? `${text.substring(0, 80)}...` : text
    }
    catch {
      return symbol.name
    }
  }

  /**
   * 判断是否应该过滤此符号（避免重复显示）
   */
  private shouldFilterSymbol(symbol: vscode.DocumentSymbol, frameworkType: 'react' | 'vue' | 'general'): boolean {
    // 1. Vue 特殊处理
    if (frameworkType === 'vue') {
      // 保留 Vue 结构标签，但过滤掉普通 HTML 标签
      if (symbol.kind === vscode.SymbolKind.Module) {
        if (this.isVueTemplateStructure(symbol)) {
          return false // 不过滤 Vue 结构标签
        }
        // 过滤掉普通 HTML 标签
        if (this.isHtmlElement(symbol)) {
          return true
        }
      }

      if (this.isVueInternalCallback(symbol)) {
        return true
      }
    }

    // 2. 检查黑名单模式
    if (this.matchesFilterPatterns(symbol.name)) {
      return true
    }

    // 3. React 特定过滤
    if (frameworkType === 'react') {
      if (this.isReactInternalCallback(symbol)) {
        return true
      }
    }

    // 4. 通用内部函数过滤
    if (this.isGenericInternalCallback(symbol)) {
      return true
    }

    return false
  }

  /**
   * 检测是否为普通 HTML 元素标签
   */
  private isHtmlElement(symbol: vscode.DocumentSymbol): boolean {
    if (symbol.kind !== vscode.SymbolKind.Module) {
      return false
    }

    // 常见的 HTML 标签列表
    const htmlTags = [
      'div',
      'span',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'table',
      'tr',
      'td',
      'th',
      'thead',
      'tbody',
      'form',
      'input',
      'button',
      'select',
      'option',
      'textarea',
      'img',
      'a',
      'nav',
      'header',
      'footer',
      'section',
      'article',
      'aside',
      'main',
      'figure',
      'figcaption',
    ]

    return htmlTags.some(tag => symbol.name === tag || symbol.name.startsWith(`<${tag}`))
  }

  /**
   * 检查符号名称是否匹配过滤模式
   */
  private matchesFilterPatterns(symbolName: string): boolean {
    const FILTERED_PATTERNS = [
      // Vue 相关回调
      /^computed\(\) callback$/,
      /^watch\(\) callback$/,
      /^watchEffect\(\) callback$/,
      /^ref\(\) callback$/,
      /^reactive\(\) callback$/,

      // React 相关回调
      /^useEffect\(\) callback$/,
      /^useCallback\(\) callback$/,
      /^useMemo\(\) callback$/,
      /^useState\(\) callback$/,
      /^useReducer\(\) callback$/,

      // Getter/Setter 模式
      /^get \w+$/,
      /^set \w+$/,

      // 通用匿名函数模式
      /^anonymous function$/,
      /^arrow function$/,
      /^\(\) =>$/,
      /^function\(\)$/,

      // 其他常见的内部函数
      /callback$/i,
      /handler$/i,
    ]

    return FILTERED_PATTERNS.some(pattern => pattern.test(symbolName))
  }

  /**
   * 检测 Vue 内部回调函数
   */
  private isVueInternalCallback(symbol: vscode.DocumentSymbol): boolean {
    // 检查符号是否是 Vue 响应式 API 的内部回调
    if (symbol.kind === vscode.SymbolKind.Function) {
      // 通常 computed 回调会被识别为 Function 类型
      const isInsideComputed = symbol.name.includes('computed') && symbol.name.includes('callback')
      const isInsideWatch = symbol.name.includes('watch') && symbol.name.includes('callback')
      const isInsideWatchEffect = symbol.name.includes('watchEffect')

      return isInsideComputed || isInsideWatch || isInsideWatchEffect
    }
    return false
  }

  /**
   * 检测 React 内部回调函数
   */
  private isReactInternalCallback(symbol: vscode.DocumentSymbol): boolean {
    if (symbol.kind === vscode.SymbolKind.Function) {
      // React hooks 的内部回调
      const isHookCallback = /^use[A-Z]\w*\(\) callback$/.test(symbol.name)
      const isEffectCallback = symbol.name.includes('useEffect') && symbol.name.includes('callback')
      const isMemoCallback = symbol.name.includes('useMemo') && symbol.name.includes('callback')

      return isHookCallback || isEffectCallback || isMemoCallback
    }
    return false
  }

  /**
   * 检测通用内部回调函数
   */
  private isGenericInternalCallback(symbol: vscode.DocumentSymbol): boolean {
    // 检查是否是对象方法内的匿名函数
    if (symbol.kind === vscode.SymbolKind.Function) {
      // 匿名函数或临时函数
      if (symbol.name.startsWith('(anonymous')
        || symbol.name === 'anonymous'
        || symbol.name.match(/^function_\d+$/)) {
        return true
      }
    }
    return false
  }

  /**
   * 获取过滤原因（用于调试）
   */
  private getFilterReason(symbol: vscode.DocumentSymbol): string {
    if (this.matchesFilterPatterns(symbol.name)) {
      return '匹配黑名单模式'
    }
    if (this.isVueInternalCallback(symbol)) {
      return 'Vue内部回调'
    }
    if (this.isReactInternalCallback(symbol)) {
      return 'React内部回调'
    }
    if (this.isGenericInternalCallback(symbol)) {
      return '通用内部回调'
    }
    return '未知原因'
  }

  /**
   * 按类型分组符号（带去重优化）
   */
  private groupSymbolsByType(symbols: UnifiedItem[], document: vscode.TextDocument): UnifiedItem[] {
    const frameworkType = this.detectFrameworkType(document)
    const isReact = frameworkType === 'react'
    const isVue = frameworkType === 'vue'

    // 在分组前进行最终去重检查
    const filteredSymbols = this.performFinalDuplicateCheck(symbols, frameworkType)
    console.log(`[DataAdapter] 分组前去重: ${symbols.length} -> ${filteredSymbols.length} 个符号`)

    // 基础分组
    const groups: Record<string, UnifiedItem[]> = {
      '🎨 模板结构': [],
      '🏛️ 类定义': [],
      '⚡ 函数方法': [],
      '📊 变量常量': [],
      '🔧 其他': [],
    }

    // React特定分组
    if (isReact) {
      groups['🔧 React组件'] = []
      groups['🪝 React Hooks'] = []
      groups['⚡ 事件处理'] = []
      groups['📋 组件属性'] = []
      groups['🔄 生命周期'] = []
    }

    // Vue特定分组
    if (isVue) {
      groups['🎨 模板结构'] = []
      groups['📦 响应式数据'] = []
      groups['⚙️ 计算属性'] = []
      groups['⚡ 方法函数'] = []
      groups['📨 组件属性'] = []
      groups['🔄 生命周期'] = []
      groups['🔧 Setup函数'] = []
    }

    // 分组符号
    filteredSymbols.forEach((symbol) => {
      this.assignSymbolToGroup(symbol, groups, frameworkType)
    })

    // 创建分组项
    const result: UnifiedItem[] = []
    Object.entries(groups).forEach(([groupName, groupSymbols]) => {
      if (groupSymbols.length > 0) {
        const groupId = `group-${groupName.replace(/[^\u4E00-\u9FA5a-z]/gi, '')}`
        const groupItem: UnifiedItem = {
          id: groupId,
          type: 'group',
          label: `${groupName} (${groupSymbols.length})`,
          description: `${groupSymbols.length} 个项目`,
          location: { file: '', line: 0, character: 0 },
          icon: this.getGroupIcon(groupName),
          iconColor: this.getGroupColor(groupName),
          isPinned: false,
          timestamp: Date.now(),
          uri: document.uri,
          range: new vscode.Range(0, 0, 0, 0),

          // WebView 序列化友好字段
          uriString: document.uri.toString(),
          simpleRange: {
            startLine: 0,
            startCharacter: 0,
            endLine: 0,
            endCharacter: 0,
          },

          isGroup: true,
          groupName,
          children: groupSymbols
            .sort((a, b) => a.location.line - b.location.line)
            .map(symbol => ({
              ...symbol,
              // 确保每个子项都有完整的跳转信息
              uriString: symbol.uriString || document.uri.toString(),
              simpleRange: symbol.simpleRange || {
                startLine: symbol.range?.start.line || 0,
                startCharacter: symbol.range?.start.character || 0,
                endLine: symbol.range?.end.line || 0,
                endCharacter: symbol.range?.end.character || 0,
              },
            })),
          isExpanded: true,
        }
        result.push(groupItem)
      }
    })

    return result
  }

  /**
   * 将符号分配到对应分组
   */
  private assignSymbolToGroup(symbol: UnifiedItem, groups: Record<string, UnifiedItem[]>, frameworkType: 'react' | 'vue' | 'general'): void {
    // Vue特定分组逻辑
    if (frameworkType === 'vue') {
      // Vue 模板结构标签
      if (symbol.chineseType === '模板结构' || symbol.chineseType === 'Setup脚本'
        || symbol.chineseType === '脚本区域' || symbol.chineseType === '局部样式'
        || symbol.chineseType === '样式区域' || symbol.chineseType === '结构标签') {
        groups['🎨 模板结构'].push(symbol)
      }
      else if (symbol.chineseType === '计算属性') {
        groups['⚙️ 计算属性'].push(symbol)
      }
      else if (symbol.chineseType === '响应式数据') {
        groups['📦 响应式数据'].push(symbol)
      }
      else if (symbol.chineseType === '方法' || symbol.chineseType === '函数') {
        groups['⚡ 方法函数'].push(symbol)
      }
      else {
        this.assignToGeneralGroup(symbol, groups)
      }
    }
    // React特定分组逻辑
    else if (frameworkType === 'react') {
      if (symbol.chineseType === 'React Hook') {
        groups['🪝 React Hooks'].push(symbol)
      }
      else if (symbol.chineseType === '组件方法') {
        groups['⚡ 事件处理'].push(symbol)
      }
      else {
        this.assignToGeneralGroup(symbol, groups)
      }
    }
    // 通用分组
    else {
      this.assignToGeneralGroup(symbol, groups)
    }
  }

  /**
   * 分配到通用分组
   */
  private assignToGeneralGroup(symbol: UnifiedItem, groups: Record<string, UnifiedItem[]>): void {
    // 根据中文类型优先分组，这样可以正确处理箭头函数
    if (symbol.chineseType === '函数') {
      groups['⚡ 函数方法'].push(symbol)
    }
    else if (symbol.symbolKind === vscode.SymbolKind.Class) {
      groups['🏛️ 类定义'].push(symbol)
    }
    else if (symbol.symbolKind === vscode.SymbolKind.Function || symbol.symbolKind === vscode.SymbolKind.Method) {
      groups['⚡ 函数方法'].push(symbol)
    }
    else if (symbol.symbolKind === vscode.SymbolKind.Variable || symbol.symbolKind === vscode.SymbolKind.Constant) {
      groups['📊 变量常量'].push(symbol)
    }
    else {
      groups['🔧 其他'].push(symbol)
    }
  }

  /**
   * 执行最终去重检查（基于名称和行号）
   */
  private performFinalDuplicateCheck(symbols: UnifiedItem[], frameworkType: 'react' | 'vue' | 'general'): UnifiedItem[] {
    const seen = new Map<string, UnifiedItem>()
    const result: UnifiedItem[] = []

    for (const symbol of symbols) {
      const key = `${symbol.label}:${symbol.location.line}`

      if (seen.has(key)) {
        const existing = seen.get(key)!

        // 如果是相同位置的符号，优先保留更具体的那个
        if (this.shouldReplaceSymbol(existing, symbol, frameworkType)) {
          console.log(`[DataAdapter] 替换重复符号: ${existing.label} -> ${symbol.label} (行 ${symbol.location.line})`)
          seen.set(key, symbol)
          // 从结果中移除旧的，添加新的
          const existingIndex = result.indexOf(existing)
          if (existingIndex > -1) {
            result[existingIndex] = symbol
          }
        }
        else {
          console.log(`[DataAdapter] 跳过重复符号: ${symbol.label} (行 ${symbol.location.line})，保留已有的`)
        }
      }
      else {
        seen.set(key, symbol)
        result.push(symbol)
      }
    }

    return result
  }

  /**
   * 判断是否应该用新符号替换现有符号
   */
  private shouldReplaceSymbol(existing: UnifiedItem, newSymbol: UnifiedItem, frameworkType: 'react' | 'vue' | 'general'): boolean {
    // 1. 优先保留有中文类型描述的符号
    if (existing.chineseType && !newSymbol.chineseType) {
      return false // 保留现有的
    }
    if (!existing.chineseType && newSymbol.chineseType) {
      return true // 替换为新的
    }

    // 2. Vue 特定优先级
    if (frameworkType === 'vue') {
      // 优先保留计算属性而不是普通变量
      if (existing.chineseType === '计算属性' && newSymbol.chineseType === '变量') {
        return false
      }
      if (existing.chineseType === '变量' && newSymbol.chineseType === '计算属性') {
        return true
      }

      // 优先保留响应式数据而不是普通变量
      if (existing.chineseType === '响应式数据' && newSymbol.chineseType === '变量') {
        return false
      }
      if (existing.chineseType === '变量' && newSymbol.chineseType === '响应式数据') {
        return true
      }
    }

    // 3. React 特定优先级
    if (frameworkType === 'react') {
      // 优先保留 React Hook 而不是普通函数
      if (existing.chineseType === 'React Hook' && newSymbol.chineseType === '函数') {
        return false
      }
      if (existing.chineseType === '函数' && newSymbol.chineseType === 'React Hook') {
        return true
      }
    }

    // 4. 默认保留现有符号
    return false
  }

  /**
   * 获取分组图标
   */
  private getGroupIcon(groupName: string): string {
    const iconMap: Record<string, string> = {
      '🎨 模板结构': 'symbol-tag',
      '🏛️ 类定义': 'symbol-class',
      '⚡ 函数方法': 'symbol-function',
      '📊 变量常量': 'symbol-variable',
      '🔧 其他': 'symbol-misc',
      '📦 响应式数据': 'symbol-variable',
      '⚙️ 计算属性': 'gear',
      '⚡ 方法函数': 'symbol-method',
      '📨 组件属性': 'symbol-parameter',
      '🔄 生命周期': 'symbol-event',
      '🔧 Setup函数': 'symbol-function',
      '🪝 React Hooks': 'symbol-event',
      '⚡ 事件处理': 'zap',
      '📋 组件属性': 'symbol-parameter',
    }
    return iconMap[groupName] || 'folder'
  }

  /**
   * 获取分组颜色
   */
  private getGroupColor(groupName: string): string {
    if (groupName.includes('Vue') || groupName.includes('响应式') || groupName.includes('计算属性') || groupName.includes('方法函数')) {
      return 'charts.green'
    }
    if (groupName.includes('React') || groupName.includes('Hook') || groupName.includes('事件')) {
      return 'charts.blue'
    }
    return 'foreground'
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

  // Removed getPinnedSymbolsFromProvider method

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
   * 确保 URI 是 vscode.Uri 对象
   */
  private ensureUri(uri: vscode.Uri | string): vscode.Uri {
    return typeof uri === 'string' ? vscode.Uri.parse(uri) : uri
  }

  /**
   * 确保 URI 是字符串
   */
  private ensureUriString(uri: vscode.Uri | string): string {
    return typeof uri === 'string' ? uri : uri.toString()
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
   * 获取当前文件的书签
   */
  async getCurrentFileBookmarks(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 获取当前文件书签...')
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      console.log('[DataAdapter] 没有活动编辑器')
      return []
    }

    try {
      const bookmarks = await this.getBookmarksFromProvider()
      const currentFileUri = editor.document.uri.toString()

      // 修复：正确处理 uri 可能是字符串的情况
      const currentFileBookmarks = bookmarks.filter((bookmark) => {
        if (!bookmark || !bookmark.uri)
          return false
        const bookmarkUriString = this.ensureUriString(bookmark.uri)
        return bookmarkUriString === currentFileUri
      })

      const result = currentFileBookmarks.map((bookmark) => {
        const uriObj = this.ensureUri(bookmark.uri)
        return {
          id: `bookmark-${bookmark.id}`,
          type: 'bookmark' as const,
          label: bookmark.label,
          description: this.truncateText(bookmark.description || '', 50),
          location: {
            file: this.getRelativePath(uriObj),
            line: bookmark.range.start.line,
            character: bookmark.range.start.character,
          },
          icon: 'bookmark',
          iconColor: 'charts.blue',
          isPinned: false,
          timestamp: bookmark.timestamp || Date.now(),
          uri: uriObj,
          range: bookmark.range,

          // WebView 序列化友好字段
          uriString: uriObj.toString(),
          simpleRange: {
            startLine: bookmark.range.start.line,
            startCharacter: bookmark.range.start.character,
            endLine: bookmark.range.end.line,
            endCharacter: bookmark.range.end.character,
          },

          bookmarkNote: bookmark.description,
        }
      })

      console.log(`[DataAdapter] 当前文件书签转换完成: ${result.length}个`)
      return result
    }
    catch (error) {
      console.warn('[DataAdapter] 获取当前文件书签失败:', error)
      return []
    }
  }

  /**
   * 获取当前文件的TODO
   */
  async getCurrentFileTodos(): Promise<UnifiedItem[]> {
    console.log('[DataAdapter] 获取当前文件TODO...')
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      console.log('[DataAdapter] 没有活动编辑器')
      return []
    }

    try {
      // 直接扫描当前文档的TODO
      const todos = this.scanTodosInDocument(editor.document)

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

        // WebView 序列化友好字段
        uriString: todo.uri.toString(),
        simpleRange: {
          startLine: todo.range.start.line,
          startCharacter: todo.range.start.character,
          endLine: todo.range.end.line,
          endCharacter: todo.range.end.character,
        },

        todoType: todo.type,
      }))

      console.log(`[DataAdapter] 当前文件TODO转换完成: ${result.length}个`)
      return result
    }
    catch (error) {
      console.warn('[DataAdapter] 获取当前文件TODO失败:', error)
      return []
    }
  }

  /**
   * 获取当前文件的置顶符号
   */
  async getCurrentFilePinned(): Promise<UnifiedItem[]> {
    // PinnedSymbolProvider已被移除，返回空数组
    return []
  }

  async refreshAllData(): Promise<{
    symbols: UnifiedItem[]
    bookmarks: UnifiedItem[]
    todos: UnifiedItem[]
    // pinned: UnifiedItem[] // Removed
  }> {
    console.log('[DataAdapter] 开始刷新所有数据...')

    const [symbols, bookmarks, todos] = await Promise.all([
      this.getSymbolItems(),
      this.getBookmarkItems(),
      this.getTodoItems(),
      // this.getPinnedItems(), // Removed
    ])

    const result = { symbols, bookmarks, todos /* pinned removed */ }
    console.log('[DataAdapter] 数据刷新完成:', {
      symbols: symbols.length,
      bookmarks: bookmarks.length,
      todos: todos.length,
      // pinned: pinned.length, // Removed
      total: symbols.length + bookmarks.length + todos.length, // Removed pinned.length
    })

    return result
  }
}
