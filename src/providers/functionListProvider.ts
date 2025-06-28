import * as vscode from 'vscode'

// 扩展的符号类型
enum CustomSymbolKind {
  HTMLElement = 'html-element',
  CSSRule = 'css-rule',
  CSSSelector = 'css-selector',
  VueComponent = 'vue-component',
  ReactComponent = 'react-component',
  ArrowFunction = 'arrow-function',
  AsyncFunction = 'async-function',
}

interface FunctionDetails {
  name: string
  kind: vscode.SymbolKind
  customKind?: CustomSymbolKind
  range: vscode.Range
  uri: vscode.Uri
  level: number
  parent?: FunctionDetails
  children: FunctionDetails[]
  signature?: string
  parameters?: string[]
  returnType?: string
  isLifecycle?: boolean
  isPrivate?: boolean
  complexity?: number
  frameworkType?: 'react' | 'vue' | 'general'
  additionalInfo?: {
    hookType?: string
    dependencies?: string[]
    isComputed?: boolean
    isAsync?: boolean
    lifecyclePhase?: string
    componentType?: 'functional' | 'class'
    htmlTag?: string
    cssProperty?: string
    selector?: string
  }
}

export class FunctionListProvider implements vscode.TreeDataProvider<FunctionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FunctionItem | undefined | null | void> = new vscode.EventEmitter<FunctionItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<FunctionItem | undefined | null | void> = this._onDidChangeTreeData.event

  private functions: FunctionDetails[] = []
  private rootItems: FunctionItem[] = []

  constructor() {
    this.refresh()
  }

  /**
   * 销毁提供器，清理所有资源
   */
  dispose(): void {
    console.log('[CCoding] 清理Function Provider资源')
    
    // 停止刷新
    this.isRefreshing = false
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
      this.refreshTimeout = undefined
    }
    
    this.clearAllState()
  }

  private isRefreshing: boolean = false
  private refreshTimeout: NodeJS.Timeout | undefined

  refresh(): void {
    // 防止并发刷新
    if (this.isRefreshing) {
      console.log('[CCoding] Function解析已在进行中，跳过此次刷新')
      return
    }

    // 清除之前的延时器
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }

    // 防抖处理
    this.refreshTimeout = setTimeout(() => {
      this.performRefresh()
    }, 300)
  }

  private async performRefresh(): Promise<void> {
    if (this.isRefreshing) return
    
    this.isRefreshing = true
    try {
      console.log('[CCoding] 开始Function解析...')
      await this.parseFunctions()
      // 确保状态同步
      this.validateState()
      this._onDidChangeTreeData.fire()
      console.log('[CCoding] Function解析完成')
    } catch (error) {
      console.error('[CCoding] Function解析错误:', error)
      // 出错时清理状态，防止显示不一致的数据
      this.clearAllState()
      this._onDidChangeTreeData.fire()
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * 验证和修复状态一致性
   */
  private validateState(): void {
    // 确保 rootItems 与 functions 一致
    const expectedRootItems = this.buildTreeStructure()

    // 如果不一致，重新构建
    if (!this.areItemsConsistent(this.rootItems, expectedRootItems)) {
      console.warn('CCoding: State inconsistency detected, rebuilding tree')
      this.rootItems = expectedRootItems
    }
  }

  /**
   * 检查两个项目数组是否一致
   */
  private areItemsConsistent(items1: FunctionItem[], items2: FunctionItem[]): boolean {
    if (items1.length !== items2.length) {
      return false
    }

    for (let i = 0; i < items1.length; i++) {
      const item1 = items1[i]
      const item2 = items2[i]

      if (item1.name !== item2.name
        || item1.range?.start.line !== item2.range?.start.line
        || (item1.children?.length || 0) !== (item2.children?.length || 0)) {
        return false
      }
    }

    return true
  }

  getTreeItem(element: FunctionItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: FunctionItem): Thenable<FunctionItem[]> {
    if (!element) {
      // 返回根级别的项目，并应用搜索过滤
      const filteredItems = this.rootItems.filter(item => {
        if (!this.searchQuery) return true
        return this.matchesSearchQuery(item)
      })
      
      // 如果有搜索查询，自动展开匹配的分组
      if (this.searchQuery) {
        filteredItems.forEach(item => {
          if (item.isGroup && this.matchesSearchQuery(item)) {
            // 确保分组在搜索时是展开的
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
          }
        })
      }
      
      return Promise.resolve(filteredItems)
    }

    // 返回子项目，并应用搜索过滤
    if (element.children) {
      let filteredChildren = element.children
      
      if (this.searchQuery) {
        // 对于分组项，如果分组本身匹配，显示所有子项
        // 如果分组不匹配，只显示匹配的子项
        if (element.isGroup) {
          const groupNameMatches = this.groupNameMatches(element.name)
          if (groupNameMatches) {
            // 分组名称匹配，显示所有子项
            filteredChildren = element.children
          } else {
            // 分组名称不匹配，只显示匹配的子项
            filteredChildren = element.children.filter(child => 
              this.matchesSearchQuery(child)
            )
          }
        } else {
          // 非分组项，正常过滤
          filteredChildren = element.children.filter(child =>
            this.matchesSearchQuery(child)
          )
        }
      }
      
      return Promise.resolve(filteredChildren)
    }

    return Promise.resolve([])
  }

  /**
   * 检查分组名称是否匹配搜索查询
   */
  private groupNameMatches(groupName: string): boolean {
    if (!this.searchQuery) return true
    
    const cleanGroupName = groupName.replace(/\s*\(\d+\)$/, '').toLowerCase()
    return cleanGroupName.includes(this.searchQuery)
  }

  /**
   * 检查项目是否匹配搜索查询（递归检查子项）
   */
  private matchesSearchQuery(item: FunctionItem): boolean {
    if (!this.searchQuery)
      return true

    console.log(`[CCoding] 搜索匹配检查: "${item.name}" vs "${this.searchQuery}"`)

    // 如果是分组项，检查分组名称和子项
    if (item.isGroup) {
      // 检查分组名称（去除计数部分）
      const groupName = item.name.replace(/\s*\(\d+\)$/, '').toLowerCase()
      if (groupName.includes(this.searchQuery)) {
        console.log(`[CCoding] ✅ 分组名称匹配: ${groupName}`)
        return true
      }

      // 检查分组内的子项
      if (item.children) {
        const hasMatchingChild = item.children.some(child => this.matchesSearchQuery(child))
        if (hasMatchingChild) {
          console.log(`[CCoding] ✅ 分组内有匹配项`)
        }
        return hasMatchingChild
      }
      return false
    }

    // 对于普通符号项，进行多字段搜索
    const searchTargets = this.getSearchTargets(item)
    
    for (const target of searchTargets) {
      if (target && target.toLowerCase().includes(this.searchQuery)) {
        console.log(`[CCoding] ✅ 匹配字段: "${target}"`)
        return true
      }
    }

    // 递归检查子项
    if (item.children) {
      const hasMatchingChild = item.children.some(child => this.matchesSearchQuery(child))
      if (hasMatchingChild) {
        console.log(`[CCoding] ✅ 子项中有匹配`)
      }
      return hasMatchingChild
    }

    console.log(`[CCoding] ❌ 无匹配`)
    return false
  }

  /**
   * 获取可搜索的字段列表
   */
  private getSearchTargets(item: FunctionItem): string[] {
    const targets: string[] = []

    // 1. 原始函数名（最重要）
    if (item.details?.name) {
      targets.push(item.details.name)
    }

    // 2. 清理后的标签（去除emoji和格式化符号）
    if (item.label) {
      const cleanLabel = this.cleanSearchString(item.label.toString())
      targets.push(cleanLabel)
    }

    // 3. 函数签名（去除格式化）
    if (item.details?.signature) {
      const cleanSignature = this.cleanSearchString(item.details.signature)
      targets.push(cleanSignature)
    }

    // 4. 自定义类型名称
    if (item.details?.customKind) {
      targets.push(item.details.customKind)
    }

    // 5. 框架类型
    if (item.details?.frameworkType && item.details.frameworkType !== 'general') {
      targets.push(item.details.frameworkType)
    }

    // 6. 生命周期标识
    if (item.details?.isLifecycle) {
      targets.push('lifecycle')
    }

    // 7. 异步函数标识
    if (item.details?.additionalInfo?.isAsync) {
      targets.push('async')
    }

    console.log(`[CCoding] 搜索目标字段: [${targets.join(', ')}]`)
    return targets
  }

  /**
   * 清理搜索字符串，去除emoji和特殊格式化字符
   */
  private cleanSearchString(str: string): string {
    return str
      // 去除emoji
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      // 去除特殊符号
      .replace(/[🔒🔄⚡💻🪝]/g, '')
      // 去除多余空格
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * 构建层级化的符号树
   * @returns 符号项数组，包含层级关系和分组
   */
  private buildTreeStructure(): FunctionItem[] {
    // 获取顶级符号
    const topLevelSymbols = this.functions.filter(func => !func.parent)

    // 按类型分组
    const groups = this.groupSymbolsByType(topLevelSymbols)

    const result: FunctionItem[] = []

    // 为每个非空分组创建项目
    Object.entries(groups).forEach(([groupName, symbols]) => {
      if (symbols.length > 0) {
        // 如果只有一个分组且符号数量少于等于10个，直接显示不分组
        if (Object.keys(groups).length === 1 && symbols.length <= 10) {
          result.push(...symbols
            .sort((a, b) => a.range.start.line - b.range.start.line)
            .map(func => this.createFunctionItemWithChildren(func)),
          )
        }
        else {
          // 创建分组头
          const groupItem = this.createGroupItem(groupName, symbols)
          result.push(groupItem)
        }
      }
    })

    return result
  }

  /**
   * 按类型分组符号（优化版本 - 带重复检测和优先级）
   */
  private groupSymbolsByType(symbols: FunctionDetails[]): Record<string, FunctionDetails[]> {
    const groups: Record<string, FunctionDetails[]> = {
      'DOM 元素': [],
      'CSS 规则': [],
      '类': [],
      '函数': [],
      '方法': [],
      '其他': [],
    }

    console.log(`[CCoding] 开始分组 ${symbols.length} 个符号`)

    // 用于检测重复的映射
    const seenSymbols = new Map<string, { symbol: FunctionDetails, group: string }>()

    symbols.forEach((symbol, index) => {
      console.log(`[CCoding] 分组符号 ${index}: ${symbol.name}`)
      console.log(`  - kind: ${symbol.kind}`)
      console.log(`  - customKind: ${symbol.customKind}`)
      console.log(`  - signature: ${symbol.signature?.substring(0, 80)}`)

      // 检查重复
      const symbolKey = `${symbol.name}:${symbol.range.start.line}`
      if (seenSymbols.has(symbolKey)) {
        const existing = seenSymbols.get(symbolKey)!
        console.log(`[CCoding] ⚠️  发现重复符号: ${symbol.name} (已在 ${existing.group} 组)`)
        console.log(`  -> 跳过重复项 ❌`)
        return
      }

      // 按照明确的优先级进行分组（高优先级优先）
      let targetGroup = ''

      // 优先级1: 自定义类型（箭头函数等）
      if (symbol.customKind === CustomSymbolKind.ArrowFunction
        || symbol.customKind === CustomSymbolKind.AsyncFunction) {
        groups['函数'].push(symbol)
        targetGroup = '函数'
        console.log(`  -> 函数 (自定义箭头函数) ✅`)
      }
      // 优先级2: HTML/CSS 自定义类型
      else if (this.isHTMLElement(symbol)) {
        groups['DOM 元素'].push(symbol)
        targetGroup = 'DOM 元素'
        console.log(`  -> DOM 元素 ✅`)
      }
      else if (this.isCSSRule(symbol)) {
        groups['CSS 规则'].push(symbol)
        targetGroup = 'CSS 规则'
        console.log(`  -> CSS 规则 ✅`)
      }
      // 优先级3: VSCode 标准类型
      else if (this.isClass(symbol)) {
        groups['类'].push(symbol)
        targetGroup = '类'
        console.log(`  -> 类 ✅`)
      }
      else if (this.isFunction(symbol)) {
        groups['函数'].push(symbol)
        targetGroup = '函数'
        console.log(`  -> 函数 ✅`)
      }
      else if (this.isMethod(symbol)) {
        groups['方法'].push(symbol)
        targetGroup = '方法'
        console.log(`  -> 方法 ✅`)
      }
      // 优先级4: 兜底分类
      else {
        groups['其他'].push(symbol)
        targetGroup = '其他'
        console.log(`  -> 其他 (未分类) ❌`)
        console.log(`    原因: kind=${symbol.kind}, customKind=${symbol.customKind}`)
      }

      // 记录已分组的符号
      seenSymbols.set(symbolKey, { symbol, group: targetGroup })
    })

    // 打印分组统计和验证
    console.log(`[CCoding] 分组完成和验证:`)
    Object.entries(groups).forEach(([groupName, groupSymbols]) => {
      console.log(`  ${groupName}: ${groupSymbols.length} 个`)
      if (groupSymbols.length > 0) {
        groupSymbols.forEach((s) => {
          const kindInfo = s.customKind ? `customKind:${s.customKind}` : `kind:${s.kind}`
          console.log(`    - ${s.name} (${kindInfo}, 行${s.range.start.line})`)
        })
      }
    })

    // 验证函数组中是否包含 increment
    const functionGroup = groups['函数']
    const hasIncrement = functionGroup.some(f => f.name === 'increment')
    console.log(`[CCoding] 🔍 验证: increment 是否在函数组? ${hasIncrement ? '✅ 是' : '❌ 否'}`)

    if (!hasIncrement) {
      // 查找 increment 在哪个组
      Object.entries(groups).forEach(([groupName, groupSymbols]) => {
        const found = groupSymbols.find(s => s.name === 'increment')
        if (found) {
          console.log(`[CCoding] 🔍 找到 increment 在: ${groupName} 组`)
          console.log(`[CCoding]   - kind: ${found.kind}`)
          console.log(`[CCoding]   - customKind: ${found.customKind}`)
          console.log(`[CCoding]   - signature: ${found.signature}`)
        }
      })
    }

    return groups
  }

  /**
   * 判断是否为HTML元素
   */
  private isHTMLElement(symbol: FunctionDetails): boolean {
    return symbol.customKind === CustomSymbolKind.HTMLElement
  }

  /**
   * 判断是否为CSS规则
   */
  private isCSSRule(symbol: FunctionDetails): boolean {
    return symbol.customKind === CustomSymbolKind.CSSRule
  }

  /**
   * 判断是否为函数（包括箭头函数）- 优化版本
   */
  private isFunction(symbol: FunctionDetails): boolean {
    const debugInfo = `[CCoding] 检查函数: ${symbol.name} (kind: ${symbol.kind}, customKind: ${symbol.customKind})`
    console.log(debugInfo)

    // 第一优先级：自定义箭头函数类型（绝对优先）
    if (symbol.customKind === CustomSymbolKind.ArrowFunction) {
      console.log(`[CCoding] ✅ ${symbol.name} 被识别为箭头函数 (customKind: ArrowFunction)`)
      return true
    }

    if (symbol.customKind === CustomSymbolKind.AsyncFunction) {
      console.log(`[CCoding] ✅ ${symbol.name} 被识别为异步函数 (customKind: AsyncFunction)`)
      return true
    }

    // 第二优先级：VSCode API识别的标准函数
    if (symbol.kind === vscode.SymbolKind.Function) {
      console.log(`[CCoding] ✅ ${symbol.name} 被识别为VSCode函数 (kind: Function)`)
      return true
    }

    // 第三优先级：VSCode API识别的方法
    if (symbol.kind === vscode.SymbolKind.Method) {
      console.log(`[CCoding] ✅ ${symbol.name} 被识别为VSCode方法 (kind: Method)`)
      return true
    }

    // 第四优先级：函数形式的属性/字段（检查签名）
    if ((symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field)
      && symbol.signature) {
      // 检查箭头函数签名
      if (symbol.signature.includes('=>')) {
        console.log(`[CCoding] ✅ ${symbol.name} 被识别为属性箭头函数 (signature: ${symbol.signature.substring(0, 40)}...)`)
        return true
      }

      // 检查函数表达式
      if (symbol.signature.includes('function')) {
        console.log(`[CCoding] ✅ ${symbol.name} 被识别为属性函数表达式 (signature: ${symbol.signature.substring(0, 40)}...)`)
        return true
      }

      // 检查getter/setter
      if (symbol.signature.includes('get ') || symbol.signature.includes('set ')) {
        console.log(`[CCoding] ✅ ${symbol.name} 被识别为getter/setter (signature: ${symbol.signature.substring(0, 40)}...)`)
        return true
      }
    }

    // 第五优先级：任何包含箭头符号的签名（兜底检查）
    if (symbol.signature && symbol.signature.includes('=>')) {
      console.log(`[CCoding] ✅ ${symbol.name} 被识别为箭头函数签名 (signature: ${symbol.signature.substring(0, 40)}...)`)
      return true
    }

    console.log(`[CCoding] ❌ ${symbol.name} 未被识别为函数`)
    console.log(`[CCoding]    - kind: ${symbol.kind}`)
    console.log(`[CCoding]    - customKind: ${symbol.customKind || 'undefined'}`)
    console.log(`[CCoding]    - signature: ${symbol.signature?.substring(0, 40) || 'undefined'}`)
    return false
  }

  /**
   * 判断是否为方法
   */
  private isMethod(symbol: FunctionDetails): boolean {
    return symbol.kind === vscode.SymbolKind.Method
      || symbol.kind === vscode.SymbolKind.Constructor
  }

  /**
   * 判断是否为类
   */
  private isClass(symbol: FunctionDetails): boolean {
    return symbol.kind === vscode.SymbolKind.Class
  }

  /**
   * 创建分组项目
   */
  private createGroupItem(groupName: string, symbols: FunctionDetails[]): FunctionItem {
    const groupItem = new FunctionItem(
      `${groupName} (${symbols.length})`,
      null,
      null,
      null,
      0,
      true,
    )

    // 为分组创建子项
    groupItem.children = symbols
      .sort((a, b) => a.range.start.line - b.range.start.line)
      .map(symbol => this.createFunctionItemWithChildren(symbol))

    groupItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded

    return groupItem
  }

  /**
   * 创建包含子项的函数项（递归）
   */
  private createFunctionItemWithChildren(details: FunctionDetails): FunctionItem {
    const item = new FunctionItem(
      details.name,
      details.kind,
      details.range,
      details.uri,
      details.level,
      false,
      details,
    )

    // 递归创建子项
    if (details.children && details.children.length > 0) {
      item.children = details.children
        .sort((a, b) => a.range.start.line - b.range.start.line)
        .map(child => this.createFunctionItemWithChildren(child))

      // 更新折叠状态
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }

    return item
  }

  private async parseFunctions() {
    // 完全清理之前的状态，避免重复数据
    this.clearAllState()

    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const document = editor.document
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    )

    // 🔥 Vue文件特殊检测和日志
    const isVueFile = document.fileName.toLowerCase().endsWith('.vue')
    console.log(`[CCoding] 🚀 开始解析 ${document.fileName} ${isVueFile ? '(Vue文件)' : '(普通文件)'}`)

    if (isVueFile) {
      console.log(`[CCoding] 📋 Vue文件特殊处理激活`)
      // 记录Vue文件的基本信息
      const content = document.getText()
      const hasScriptSetup = content.includes('<script setup>')
      console.log(`[CCoding] Vue文件信息:`)
      console.log(`  - 文件大小: ${content.length} 字符`)
      console.log(`  - 包含<script setup>: ${hasScriptSetup ? '✅' : '❌'}`)
      console.log(`  - VSCode识别符号数: ${symbols?.length || 0}`)
    }

    if (symbols && symbols.length > 0) {
      // 第一阶段：核心符号解析（最高优先级，不会被覆盖）
      console.log(`[CCoding] 🔧 阶段1: 解析VSCode API识别的 ${symbols.length} 个符号`)
      await this.extractFunctions(symbols, document)
      console.log(`[CCoding] ✅ 阶段1完成: 当前符号数 = ${this.functions.length}`)

      // 🔍 特殊检查：increment在第一阶段的状态
      this.checkIncrementStatus('阶段1-VSCode API解析后')

      // 第二阶段：补充箭头函数解析（中等优先级，有去重保护）
      console.log(`[CCoding] 🏹 阶段2: 解析箭头函数`)
      await this.extractAdditionalSymbols(document)
      console.log(`[CCoding] ✅ 阶段2完成: 当前符号数 = ${this.functions.length}`)

      // 🔍 特殊检查：increment在第二阶段的状态
      this.checkIncrementStatus('阶段2-箭头函数解析后')

      // 第三阶段：DOM/CSS解析（最低优先级，有名称冲突检查）
      console.log(`[CCoding] 🏗️ 阶段3: 解析DOM元素`)
      await this.extractDOMElementsWithConflictCheck(document)
      console.log(`[CCoding] ✅ 阶段3a完成: 当前符号数 = ${this.functions.length}`)

      console.log(`[CCoding] 🎨 阶段4: 解析CSS规则`)
      await this.extractCSSRulesWithConflictCheck(document)
      console.log(`[CCoding] ✅ 阶段4完成: 当前符号数 = ${this.functions.length}`)

      // 🔍 特殊检查：increment在DOM/CSS解析后的状态
      this.checkIncrementStatus('阶段4-DOM/CSS解析后')

      // 第四阶段：最终验证和清理
      console.log(`[CCoding] 🧹 阶段5: 最终验证和构建树结构`)
      this.validateAndCleanSymbols()
      this.rootItems = this.buildTreeStructure()

      // 🔍 最终检查：increment的最终状态
      this.checkIncrementStatus('阶段5-最终状态')

      console.log(`[CCoding] 🎉 解析完成: 共 ${this.functions.length} 个符号`)
      this.logFinalSymbolBreakdown()
    }
  }

  /**
   * 获取符号类型的友好名称
   */
  private getSymbolKindName(kind: vscode.SymbolKind): string {
    const kindNames: Record<number, string> = {
      [vscode.SymbolKind.File]: 'File',
      [vscode.SymbolKind.Module]: 'Module',
      [vscode.SymbolKind.Namespace]: 'Namespace',
      [vscode.SymbolKind.Package]: 'Package',
      [vscode.SymbolKind.Class]: 'Class',
      [vscode.SymbolKind.Method]: 'Method',
      [vscode.SymbolKind.Property]: 'Property',
      [vscode.SymbolKind.Field]: 'Field',
      [vscode.SymbolKind.Constructor]: 'Constructor',
      [vscode.SymbolKind.Enum]: 'Enum',
      [vscode.SymbolKind.Interface]: 'Interface',
      [vscode.SymbolKind.Function]: 'Function',
      [vscode.SymbolKind.Variable]: 'Variable',
      [vscode.SymbolKind.Constant]: 'Constant',
      [vscode.SymbolKind.String]: 'String',
      [vscode.SymbolKind.Number]: 'Number',
      [vscode.SymbolKind.Boolean]: 'Boolean',
      [vscode.SymbolKind.Array]: 'Array',
      [vscode.SymbolKind.Object]: 'Object',
      [vscode.SymbolKind.Key]: 'Key',
      [vscode.SymbolKind.Null]: 'Null',
      [vscode.SymbolKind.EnumMember]: 'EnumMember',
      [vscode.SymbolKind.Struct]: 'Struct',
      [vscode.SymbolKind.Event]: 'Event',
      [vscode.SymbolKind.Operator]: 'Operator',
      [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
    }
    return kindNames[kind] || `Unknown(${kind})`
  }

  /**
   * 特殊检查：跟踪increment函数在各个阶段的状态
   */
  private checkIncrementStatus(stage: string) {
    const incrementFunctions = this.functions.filter(f => f.name === 'increment')
    console.log(`[CCoding] 🔍 ${stage} - increment状态检查:`)

    if (incrementFunctions.length === 0) {
      console.log(`[CCoding]   ❌ 未找到increment函数`)
    }
    else {
      incrementFunctions.forEach((func, index) => {
        console.log(`[CCoding]   ✅ 找到increment #${index + 1}:`)
        console.log(`[CCoding]     - kind: ${func.kind}`)
        console.log(`[CCoding]     - customKind: ${func.customKind || '未设置'}`)
        console.log(`[CCoding]     - 行号: ${func.range.start.line}`)
        console.log(`[CCoding]     - 签名: ${func.signature?.substring(0, 50) || '无'}`)
        console.log(`[CCoding]     - 父级: ${func.parent?.name || '根级'}`)
      })
    }

    // 也检查子级中是否有increment
    const findInChildren = (funcs: FunctionDetails[], prefix: string = ''): void => {
      funcs.forEach((func) => {
        if (func.children) {
          const childIncrements = func.children.filter(child => child.name === 'increment')
          if (childIncrements.length > 0) {
            console.log(`[CCoding]   ✅ 在${prefix}${func.name}的子级中找到increment:`)
            childIncrements.forEach((child) => {
              console.log(`[CCoding]     - customKind: ${child.customKind || '未设置'}`)
            })
          }
          findInChildren(func.children, `${prefix}  `)
        }
      })
    }

    findInChildren(this.functions)
  }

  /**
   * 完全清理所有状态
   */
  private clearAllState() {
    // 先清理循环引用，避免内存泄漏
    this.functions.forEach(func => this.clearFunctionReferences(func))
    this.rootItems.forEach(item => this.clearItemReferences(item))

    // 然后清理数据
    this.functions = []
    this.rootItems = []

    // 清理搜索状态
    this.searchQuery = ''
  }

  /**
   * 清理函数对象的循环引用
   */
  private clearFunctionReferences(func: FunctionDetails) {
    if (func.children) {
      func.children.forEach((child) => {
        child.parent = undefined // 打破循环引用
        this.clearFunctionReferences(child)
      })
      func.children = [] // 清空子数组
    }
    func.parent = undefined // 清理父引用
  }

  /**
   * 清理FunctionItem对象的引用
   */
  private clearItemReferences(item: FunctionItem) {
    if (item.children) {
      item.children.forEach(child => this.clearItemReferences(child))
      item.children = undefined
    }
    if (item.details) {
      this.clearFunctionReferences(item.details)
      item.details = undefined
    }
  }

  /**
   * 提取额外的符号（主要是箭头函数）
   * 补充VSCode API无法识别的符号
   */
  private async extractAdditionalSymbols(document: vscode.TextDocument) {
    const content = document.getText()
    
    // 限制处理的文档大小，避免处理过大文件
    if (content.length > 500000) { // 500KB 限制
      console.log(`[CCoding] 文件过大 (${content.length} 字符)，跳过额外符号解析`)
      return
    }
    
    const lines = content.split('\n')
    const isVueFile = document.fileName.toLowerCase().endsWith('.vue')

    // 🔥 针对Vue文件优化的箭头函数模式
    const arrowFunctionPatterns = [
      // 基本箭头函数: const increment = () => {
      /(const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
      // 异步箭头函数: const increment = async () => {
      /(const|let|var)\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>/g,
      // 单参数箭头函数: const increment = param =>
      /(const|let|var)\s+(\w+)\s*=\s*\w+\s*=>/g,
      // 函数表达式: const increment = function() {}
      /(const|let|var)\s+(\w+)\s*=\s*function/g,
      // Vue特殊模式: 对象方法形式的箭头函数
      /(\w+)\s*:\s*\([^)]*\)\s*=>/g,
      // Vue特殊模式: 对象异步方法
      /(\w+)\s*:\s*async\s*\([^)]*\)\s*=>/g,
    ]

    console.log(`[CCoding] 🏹 开始解析箭头函数，内容长度: ${content.length}`)
    if (isVueFile) {
      console.log(`[CCoding] 🔍 Vue文件专用箭头函数解析激活`)
    }

    // 🔍 特殊检查：先查看increment是否在原始内容中
    const incrementMatches = content.match(/increment\s*=/g)
    console.log(`[CCoding] 🔍 原始内容中increment出现次数: ${incrementMatches?.length || 0}`)
    if (incrementMatches) {
      // 找到increment所在的行
      const incrementLineMatch = content.match(/.*increment\s*=.*/g)
      if (incrementLineMatch) {
        console.log(`[CCoding] 🔍 increment所在行内容: "${incrementLineMatch[0].trim()}"`)
      }
    }

    let match: RegExpExecArray | null
    let patternIndex = 0

    for (const pattern of arrowFunctionPatterns) {
      pattern.lastIndex = 0 // 重置正则表达式状态
      console.log(`[CCoding] 🎯 尝试模式 ${patternIndex}: ${pattern.source}`)

      let matchCount = 0
      let iterationCount = 0
      const maxIterations = 1000 // 防止无限循环
      
      match = pattern.exec(content)
      while (match !== null && iterationCount < maxIterations) {
        iterationCount++
        matchCount++
        const fullMatch = match[0]
        // 根据模式确定函数名的位置
        const functionName = patternIndex < 4 ? match[2] : match[1] // 前4个模式函数名在第2组，后面的在第1组

        console.log(`[CCoding] 🎪 模式${patternIndex}匹配 #${matchCount}: "${fullMatch}", 函数名: "${functionName}"`)

        // 🔍 特殊关注increment
        if (functionName === 'increment') {
          console.log(`[CCoding] 🎯 特别关注: 找到increment匹配!`)
          console.log(`[CCoding]   - 完整匹配: "${fullMatch}"`)
          console.log(`[CCoding]   - 使用模式: ${pattern.source}`)
        }

        if (!functionName) {
          console.log(`[CCoding] ⚠️ 跳过：无函数名`)
          continue
        }

        // 计算行号
        const lineIndex = this.getLineIndexFromMatch(content, match.index)
        if (lineIndex === -1) {
          console.log(`[CCoding] ⚠️ 跳过：无法确定行号`)
          continue
        }

        console.log(`[CCoding] 📍 ${functionName} 位于第 ${lineIndex + 1} 行`)

        // 启用改进的去重逻辑
        if (this.isFunctionAlreadyExists(functionName, lineIndex)) {
          console.log(`[CCoding] ⚠️ 跳过：${functionName} 已存在于第 ${lineIndex} 行`)
          continue
        }
        console.log(`[CCoding] ✅ 继续处理：${functionName}（通过去重检查）`)

        // 计算嵌套层级
        const level = this.calculateNestingLevel(lines, lineIndex)

        // 找到父级函数
        const parent = this.findParentFunction(lineIndex)

        const isAsync = fullMatch.includes('async')
        const arrowFunction: FunctionDetails = {
          name: functionName,
          kind: vscode.SymbolKind.Function,
          customKind: isAsync ? CustomSymbolKind.AsyncFunction : CustomSymbolKind.ArrowFunction,
          range: new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length),
          uri: document.uri,
          level,
          parent,
          children: [],
          signature: fullMatch.trim(),
          parameters: this.extractArrowFunctionParams(fullMatch),
          frameworkType: this.detectFrameworkType(document.fileName),
          isLifecycle: false,
          isPrivate: functionName.startsWith('_'),
          complexity: 1,
          additionalInfo: {
            isAsync,
          },
        }

        // 添加到对应的位置
        if (parent) {
          parent.children.push(arrowFunction)
          console.log(`[CCoding] ✅ 添加箭头函数 ${functionName} 到父级 ${parent.name}`)
        }
        else {
          this.functions.push(arrowFunction)
          console.log(`[CCoding] ✅ 添加箭头函数 ${functionName} 到根级，customKind: ${arrowFunction.customKind}`)
          console.log(`[CCoding] 📊 当前根级函数总数: ${this.functions.length}`)
        }

        // 🔍 特殊关注increment的添加结果
        if (functionName === 'increment') {
          console.log(`[CCoding] 🎉 increment成功添加!`)
          console.log(`[CCoding]   - customKind: ${arrowFunction.customKind}`)
          console.log(`[CCoding]   - 位置: ${parent ? `子级(${parent.name})` : '根级'}`)
        }

        match = pattern.exec(content)
        
        // 防止无限循环的额外保护
        if (iterationCount >= maxIterations) {
          console.warn(`[CCoding] 模式${patternIndex}匹配次数超限，停止处理`)
          break
        }
      }

      console.log(`[CCoding] 📊 模式${patternIndex}总匹配数: ${matchCount}`)
      patternIndex++
    }
  }

  /**
   * 从匹配位置计算行号
   */
  private getLineIndexFromMatch(content: string, matchIndex: number): number {
    const beforeMatch = content.substring(0, matchIndex)
    return beforeMatch.split('\n').length - 1
  }

  /**
   * 检查函数是否已经存在（优化的去重机制 - 允许覆盖不完整的符号）
   */
  private isFunctionAlreadyExists(name: string, lineIndex: number): boolean {
    // 首先检查根级函数
    const existingInRoot = this.functions.find(func =>
      func.name === name
      && Math.abs(func.range.start.line - lineIndex) <= 1,
    )

    if (existingInRoot) {
      // 🔥 关键优化：如果已存在的符号没有customKind，允许覆盖
      if (!existingInRoot.customKind) {
        console.log(`[CCoding] 去重检查: ${name} 已存在但无customKind，允许覆盖 (行 ${lineIndex})`)
        // 从根级列表中移除旧的符号，为新符号让路
        const index = this.functions.indexOf(existingInRoot)
        if (index > -1) {
          this.functions.splice(index, 1)
          console.log(`[CCoding] 移除旧符号: ${name} (无customKind)`)
        }
        return false // 允许添加新的符号
      }
      else {
        console.log(`[CCoding] 去重检查: ${name} 已存在且有customKind (${existingInRoot.customKind})，跳过 (行 ${lineIndex})`)
        return true // 已有完整的符号，不允许覆盖
      }
    }

    // 然后递归检查所有层级
    const existingInTree = this.findExistingFunctionInTree(name, lineIndex)
    if (existingInTree) {
      // 同样的逻辑：检查是否有customKind
      if (!existingInTree.customKind) {
        console.log(`[CCoding] 去重检查: ${name} 在子级存在但无customKind，允许移除并覆盖 (行 ${lineIndex})`)
        // 从父级移除
        this.removeFromParent(existingInTree)
        return false // 允许添加新的符号
      }
      else {
        console.log(`[CCoding] 去重检查: ${name} 在子级存在且有customKind，跳过 (行 ${lineIndex})`)
        return true
      }
    }

    console.log(`[CCoding] 去重检查: ${name} 不存在，可以添加 (行 ${lineIndex})`)
    return false
  }

  /**
   * 从父级移除指定的函数
   */
  private removeFromParent(func: FunctionDetails) {
    if (func.parent && func.parent.children) {
      const index = func.parent.children.indexOf(func)
      if (index > -1) {
        func.parent.children.splice(index, 1)
        console.log(`[CCoding] 从父级 ${func.parent.name} 移除子函数: ${func.name}`)
      }
    }
  }

  /**
   * 在函数树中查找已存在的函数（返回具体的函数对象）
   */
  private findExistingFunctionInTree(name: string, lineIndex: number): FunctionDetails | undefined {
    const searchInChildren = (funcs: FunctionDetails[]): FunctionDetails | undefined => {
      for (const func of funcs) {
        // 精确匹配：名称相同且行号差距在1行以内
        if (func.name === name && Math.abs(func.range.start.line - lineIndex) <= 1) {
          return func
        }

        // 递归搜索子函数
        if (func.children && func.children.length > 0) {
          const found = searchInChildren(func.children)
          if (found) {
            return found
          }
        }
      }
      return undefined
    }

    return searchInChildren(this.functions)
  }

  /**
   * 计算嵌套层级
   */
  private calculateNestingLevel(lines: string[], lineIndex: number): number {
    let level = 0
    let braceCount = 0

    for (let i = 0; i <= lineIndex; i++) {
      const line = lines[i]
      for (const char of line) {
        if (char === '{') {
          braceCount++
        }
        else if (char === '}') {
          braceCount--
        }
      }
    }

    // 简化的层级计算，基于大括号数量
    level = Math.max(0, Math.floor(braceCount / 2))
    return level
  }

  /**
   * 查找父级函数
   */
  private findParentFunction(lineIndex: number): FunctionDetails | undefined {
    // 找到在当前行之前最近的函数
    let nearestParent: FunctionDetails | undefined
    let nearestDistance = Infinity

    const searchInFunctions = (funcs: FunctionDetails[]) => {
      for (const func of funcs) {
        const funcLine = func.range.start.line
        if (funcLine < lineIndex) {
          const distance = lineIndex - funcLine
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestParent = func
          }
        }

        // 递归搜索子函数
        if (func.children) {
          searchInFunctions(func.children)
        }
      }
    }

    searchInFunctions(this.functions)
    return nearestParent
  }

  /**
   * 提取箭头函数参数
   */
  private extractArrowFunctionParams(signature: string): string[] {
    const match = signature.match(/\(([^)]*)\)/)
    if (!match || !match[1].trim()) {
      return []
    }

    return match[1].split(',').map(param => param.trim()).filter(p => p)
  }

  /**
   * 最终验证和清理符号
   */
  private validateAndCleanSymbols() {
    console.log(`[CCoding] 验证前: ${this.functions.length} 个符号`)

    // 移除重复的符号（相同名称+行号）
    const seen = new Set<string>()
    this.functions = this.functions.filter((func) => {
      const key = `${func.name}:${func.range.start.line}`
      if (seen.has(key)) {
        console.log(`[CCoding] 移除重复符号: ${func.name} (行 ${func.range.start.line})`)
        return false
      }
      seen.add(key)
      return true
    })

    console.log(`[CCoding] 验证后: ${this.functions.length} 个符号`)
  }

  /**
   * 记录最终符号分解情况
   */
  private logFinalSymbolBreakdown() {
    const breakdown: Record<string, number> = {}

    const countSymbols = (symbols: FunctionDetails[]) => {
      symbols.forEach((symbol) => {
        const key = symbol.customKind || symbol.kind.toString()
        breakdown[key] = (breakdown[key] || 0) + 1

        if (symbol.children) {
          countSymbols(symbol.children)
        }
      })
    }

    countSymbols(this.functions)

    console.log(`[CCoding] 符号统计:`)
    Object.entries(breakdown).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} 个`)
    })
  }

  /**
   * 带冲突检查的DOM元素提取
   */
  private async extractDOMElementsWithConflictCheck(document: vscode.TextDocument) {
    // 跳过DOM解析，减少性能开销
    console.log(`[CCoding] 跳过DOM解析（性能优化）`)
    return
  }

  /**
   * 带冲突检查的CSS规则提取
   */
  private async extractCSSRulesWithConflictCheck(document: vscode.TextDocument) {
    // 跳过CSS解析，减少性能开销  
    console.log(`[CCoding] 跳过CSS解析（性能优化）`)
    return
  }

  /**
   * 提取DOM元素（支持层级关系）
   */
  private async extractDOMElements(document: vscode.TextDocument) {
    const content = document.getText()
    const fileName = document.fileName.toLowerCase()

    // 只处理HTML、Vue、JSX文件
    if (!fileName.endsWith('.html') && !fileName.endsWith('.vue')
      && !fileName.endsWith('.jsx') && !fileName.endsWith('.tsx')) {
      return
    }

    const lines = content.split('\n')
    const elementStack: Array<{ element: FunctionDetails, tagName: string }> = []

    // 匹配开始标签、自闭合标签、结束标签
    const tagPattern = /<(\/?)([\w-]+)(?:\s[^>]*)?(\/?)>/g
    let match: RegExpExecArray | null

    match = tagPattern.exec(content)
    while (match !== null) {
      const isClosing = match[1] === '/'
      const tagName = match[2]
      const isSelfClosing = match[3] === '/' || ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName.toLowerCase())
      const lineIndex = this.getLineIndexFromMatch(content, match.index)

      // 跳过脚本和样式标签
      if (['script', 'style'].includes(tagName.toLowerCase())) {
        continue
      }

      if (isClosing) {
        // 结束标签，从栈中弹出对应的开始标签
        const stackIndex = elementStack.findIndex(item => item.tagName === tagName)
        if (stackIndex !== -1) {
          elementStack.splice(stackIndex, 1)
        }
      }
      else {
        // 开始标签或自闭合标签
        const currentLevel = elementStack.length
        const parent = elementStack.length > 0 ? elementStack[elementStack.length - 1].element : undefined

        // 检查DOM元素名称是否与已有函数冲突
        const elementName = `<${tagName}>`
        if (this.isFunctionAlreadyExists(elementName, lineIndex)) {
          console.log(`[CCoding] 跳过DOM元素 ${elementName}：与已有符号冲突 (行 ${lineIndex})`)
          continue
        }

        const domElement: FunctionDetails = {
          name: elementName,
          kind: vscode.SymbolKind.Property,
          customKind: CustomSymbolKind.HTMLElement,
          range: new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex]?.length || 0),
          uri: document.uri,
          level: currentLevel,
          parent,
          children: [],
          signature: match[0].length > 80 ? `${match[0].substring(0, 80)}...` : match[0],
          frameworkType: fileName.endsWith('.vue') ? 'vue' : 'general',
          isLifecycle: false,
          isPrivate: false,
          complexity: 1,
          additionalInfo: {
            htmlTag: tagName,
          },
        }

        // 添加到父元素的子节点或根节点
        if (parent) {
          parent.children.push(domElement)
          console.log(`[CCoding] 添加DOM子元素: ${elementName} -> ${parent.name} (行 ${lineIndex})`)
        }
        else {
          this.functions.push(domElement)
          console.log(`[CCoding] 添加DOM根元素: ${elementName} (行 ${lineIndex})`)
        }

        // 如果不是自闭合标签，压入栈中
        if (!isSelfClosing) {
          elementStack.push({ element: domElement, tagName })
        }

        console.log(`[CCoding] DOM元素: ${domElement.name}, level: ${currentLevel}, parent: ${parent?.name || 'root'}`)
      }

      match = tagPattern.exec(content)
    }
  }

  /**
   * 提取CSS规则
   */
  private async extractCSSRules(document: vscode.TextDocument) {
    const content = document.getText()
    const fileName = document.fileName.toLowerCase()

    // 只处理CSS、Vue文件或包含style标签的文件
    if (!fileName.endsWith('.css') && !fileName.endsWith('.scss')
      && !fileName.endsWith('.less') && !fileName.endsWith('.vue')
      && !content.includes('<style')) {
      return
    }

    let cssContent = content

    // 如果是Vue文件，提取style部分
    if (fileName.endsWith('.vue')) {
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/g)
      if (styleMatch) {
        cssContent = styleMatch.join('\n')
      }
      else {
        return
      }
    }

    // CSS选择器模式
    const cssRulePattern = /([.#]?[\w-]+(?:\s*[>+~]\s*[\w-]+)*)\s*\{/g
    let match: RegExpExecArray | null

    match = cssRulePattern.exec(cssContent)
    while (match !== null) {
      const selector = match[1].trim()
      const lineIndex = this.getLineIndexFromMatch(content, match.index)

      // 检查CSS选择器名称是否与已有符号冲突
      if (this.isFunctionAlreadyExists(selector, lineIndex)) {
        console.log(`[CCoding] 跳过CSS规则 ${selector}：与已有符号冲突 (行 ${lineIndex})`)
        continue
      }

      const cssRule: FunctionDetails = {
        name: selector,
        kind: vscode.SymbolKind.Property,
        customKind: CustomSymbolKind.CSSRule,
        range: new vscode.Range(lineIndex, 0, lineIndex, content.split('\n')[lineIndex]?.length || 0),
        uri: document.uri,
        level: 0,
        children: [],
        signature: `${selector} { ... }`,
        frameworkType: fileName.endsWith('.vue') ? 'vue' : 'general',
        isLifecycle: false,
        isPrivate: false,
        complexity: 1,
        additionalInfo: {
          selector,
        },
      }

      this.functions.push(cssRule)
      console.log(`[CCoding] 添加CSS规则: ${selector} (行 ${lineIndex})`)

      match = cssRulePattern.exec(cssContent)
    }
  }

  private async extractFunctions(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument, level = 0, parent?: FunctionDetails) {
    console.log(`[CCoding] 📋 VSCode API 识别的符号数量: ${symbols.length}`)

    // 🔥 首先输出所有符号的详细信息
    console.log(`[CCoding] 📊 所有VSCode识别的符号详情:`)
    symbols.forEach((symbol, index) => {
      console.log(`[CCoding]   ${index + 1}. ${symbol.name}`)
      console.log(`[CCoding]      - kind: ${symbol.kind} (${this.getSymbolKindName(symbol.kind)})`)
      console.log(`[CCoding]      - detail: "${symbol.detail || '无'}"`)
      console.log(`[CCoding]      - range: ${symbol.range.start.line}:${symbol.range.start.character} - ${symbol.range.end.line}:${symbol.range.end.character}`)
      console.log(`[CCoding]      - 是否可调用: ${this.isCallableSymbol(symbol) ? '✅' : '❌'}`)

      // 🎯 特别关注increment
      if (symbol.name === 'increment') {
        console.log(`[CCoding] 🎯 特别关注: 找到increment符号!`)
        console.log(`[CCoding]      - 这就是我们要找的箭头函数`)
        console.log(`[CCoding]      - kind值: ${symbol.kind}`)
        console.log(`[CCoding]      - 预期通过isCallableSymbol: ${this.isCallableSymbol(symbol)}`)
      }
    })

    for (const symbol of symbols) {
      console.log(`[CCoding] 🔄 处理符号: ${symbol.name} (kind: ${symbol.kind})`)

      if (this.isCallableSymbol(symbol) || symbol.kind === vscode.SymbolKind.Class) {
        // 提取符号签名用于箭头函数检测
        const signature = await this.extractSignature(symbol, document)

        const functionDetails: FunctionDetails = {
          name: symbol.name,
          kind: symbol.kind,
          range: symbol.range,
          uri: document.uri,
          level,
          parent,
          children: [],
          signature,
          parameters: this.extractParameters(symbol.detail || ''),
          frameworkType: this.detectFrameworkType(document.fileName),
          isLifecycle: this.isLifecycleMethod(symbol.name, document.fileName),
          isPrivate: symbol.name.startsWith('_') || symbol.name.startsWith('#'),
          complexity: this.calculateComplexity(symbol.range, document),
        }

        // 🔥 关键修复：在第一阶段检测箭头函数并设置customKind
        this.detectAndSetArrowFunctionKind(functionDetails, symbol, signature)

        // 添加框架特定信息
        if (functionDetails.frameworkType === 'react') {
          functionDetails.additionalInfo = await this.extractReactInfo(symbol, document)
        }
        else if (functionDetails.frameworkType === 'vue') {
          functionDetails.additionalInfo = await this.extractVueInfo(symbol, document)
        }

        // 只有顶级符号（没有parent）才添加到主列表
        if (!parent) {
          this.functions.push(functionDetails)
          console.log(`[CCoding] ✅ 添加到根级: ${functionDetails.name} (kind: ${functionDetails.kind}, customKind: ${functionDetails.customKind})`)
        }
        else {
          parent.children.push(functionDetails)
          console.log(`[CCoding] ✅ 添加到子级: ${functionDetails.name} -> ${parent.name}`)
        }

        // 处理子符号（类的方法等）
        if (symbol.children && symbol.children.length > 0) {
          await this.extractFunctions(symbol.children, document, level + 1, functionDetails)
        }
      }
      else {
        // 即使不是函数符号，也需要处理其子符号
        if (symbol.children && symbol.children.length > 0) {
          await this.extractFunctions(symbol.children, document, level, parent)
        }
      }
    }
  }

  /**
   * 检测并设置箭头函数的customKind（第一阶段关键修复）
   */
  private detectAndSetArrowFunctionKind(functionDetails: FunctionDetails, symbol: vscode.DocumentSymbol, signature: string) {
    // 检查是否为箭头函数的多种方式
    const isArrowFunction = this.detectArrowFunctionFromSignature(signature, symbol)

    if (isArrowFunction) {
      const isAsync = signature.includes('async')
      functionDetails.customKind = isAsync ? CustomSymbolKind.AsyncFunction : CustomSymbolKind.ArrowFunction

      console.log(`[CCoding] 🎯 第一阶段检测到箭头函数: ${functionDetails.name}`)
      console.log(`[CCoding]   - 原始kind: ${symbol.kind}`)
      console.log(`[CCoding]   - 设置customKind: ${functionDetails.customKind}`)
      console.log(`[CCoding]   - 签名: ${signature.substring(0, 60)}`)
      console.log(`[CCoding]   - detail: ${symbol.detail}`)
    }
  }

  /**
   * 从签名和符号信息检测箭头函数（增强版本）
   */
  private detectArrowFunctionFromSignature(signature: string, symbol: vscode.DocumentSymbol): boolean {
    console.log(`[CCoding] 🔍 箭头函数检测开始: ${symbol.name} (kind: ${symbol.kind})`)

    // 方法1: 检查签名中的箭头符号
    if (signature && signature.includes('=>')) {
      console.log(`[CCoding] 检测方法1: 签名包含箭头符号 ✅`)
      console.log(`[CCoding]   - 签名: "${signature}"`)
      return true
    }

    // 方法2: 检查symbol.detail中的箭头符号
    if (symbol.detail && symbol.detail.includes('=>')) {
      console.log(`[CCoding] 检测方法2: detail包含箭头符号 ✅`)
      console.log(`[CCoding]   - detail: "${symbol.detail}"`)
      return true
    }

    // 方法3: 检查Property/Field类型的箭头模式
    if (symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field) {
      const arrowPatterns = [
        /=\s*\([^)]*\)\s*=>/, // = () => 或 = (params) =>
        /=\s*async\s*\([^)]*\)\s*=>/, // = async () =>
        /=\s*\w+\s*=>/, // = param =>
      ]

      for (const pattern of arrowPatterns) {
        if (pattern.test(signature)) {
          console.log(`[CCoding] 检测方法3: Property/Field匹配箭头模式 ✅`)
          console.log(`[CCoding]   - 模式: ${pattern.source}`)
          return true
        }
      }
    }

    // 🔥 方法4: 专门检查Variable类型的箭头函数（Vue关键修复）
    if (symbol.kind === vscode.SymbolKind.Variable) {
      console.log(`[CCoding] 🎯 Variable专项检测: ${symbol.name}`)

      // Variable类型的箭头函数模式（更宽松）
      const variableArrowPatterns = [
        /=\s*\([^)]*\)\s*=>/, // const increment = () =>
        /=\s*async\s*\([^)]*\)\s*=>/, // const increment = async () =>
        /=\s*\w+\s*=>/, // const increment = x =>
        /=\s*function/, // const increment = function
        /:\s*\([^)]*\)\s*=>/, // 对象方法形式
      ]

      for (const pattern of variableArrowPatterns) {
        if (pattern.test(signature)) {
          console.log(`[CCoding] 检测方法4: Variable匹配箭头模式 ✅`)
          console.log(`[CCoding]   - 模式: ${pattern.source}`)
          console.log(`[CCoding]   - 签名: "${signature}"`)
          return true
        }
      }

      // Variable类型的detail检查（备用）
      if (symbol.detail) {
        const detailArrowPatterns = ['=>', 'function', '() =>', 'async']
        for (const pattern of detailArrowPatterns) {
          if (symbol.detail.includes(pattern)) {
            console.log(`[CCoding] 检测方法4b: Variable detail包含函数标识 ✅`)
            console.log(`[CCoding]   - detail: "${symbol.detail}"`)
            console.log(`[CCoding]   - 匹配模式: "${pattern}"`)
            return true
          }
        }
      }

      console.log(`[CCoding] ❌ Variable专项检测失败: ${symbol.name}`)
      console.log(`[CCoding]   - 签名: "${signature || '无'}"`)
      console.log(`[CCoding]   - detail: "${symbol.detail || '无'}"`)
    }

    console.log(`[CCoding] ❌ 箭头函数检测: ${symbol.name} 不是箭头函数`)
    return false
  }

  /**
   * 检查符号是否为可调用的符号（函数、方法等）- 增强版本
   */
  private isCallableSymbol(symbol: vscode.DocumentSymbol): boolean {
    // 🔥 立即检查所有函数符号类型（包括新增的Variable）
    if (symbol.kind === vscode.SymbolKind.Function
      || symbol.kind === vscode.SymbolKind.Method
      || symbol.kind === vscode.SymbolKind.Constructor) {
      console.log(`[CCoding] ✅ isCallableSymbol: ${symbol.name} 是标准函数类型 (${symbol.kind})`)
      return true
    }

    // 检查属性是否为函数（通过detail）
    if (symbol.kind === vscode.SymbolKind.Property && symbol.detail) {
      const isArrowProperty = symbol.detail.includes('=>')
        || symbol.detail.includes('function')
        || symbol.detail.includes('get ')
        || symbol.detail.includes('set ')
      if (isArrowProperty) {
        console.log(`[CCoding] ✅ isCallableSymbol: ${symbol.name} 是属性函数 (detail: ${symbol.detail})`)
      }
      return isArrowProperty
    }

    // 检查字段是否为函数赋值
    if (symbol.kind === vscode.SymbolKind.Field && symbol.detail) {
      const isArrowField = symbol.detail.includes('=>') || symbol.detail.includes('function')
      if (isArrowField) {
        console.log(`[CCoding] ✅ isCallableSymbol: ${symbol.name} 是字段函数 (detail: ${symbol.detail})`)
      }
      return isArrowField
    }

    // 🔥 关键修复：检查变量是否为箭头函数
    if (symbol.kind === vscode.SymbolKind.Variable) {
      console.log(`[CCoding] 🔍 检查Variable: ${symbol.name}`)
      console.log(`[CCoding]   - detail: "${symbol.detail || '无'}"`)

      // 方法1：通过detail检查
      if (symbol.detail) {
        const isArrowVariable = symbol.detail.includes('=>') || symbol.detail.includes('function')
        if (isArrowVariable) {
          console.log(`[CCoding] ✅ isCallableSymbol: ${symbol.name} 是Variable箭头函数 (detail包含箭头)`)
          return true
        }
      }

      // 方法2：通过名称模式检查（针对Vue的特殊情况）
      // 如果是increment这样的典型函数名，先标记为可能的函数
      const functionLikeNames = ['increment', 'decrement', 'toggle', 'handle', 'on', 'click', 'submit']
      const couldBeFunction = functionLikeNames.some(pattern =>
        symbol.name.toLowerCase().includes(pattern)
        || symbol.name.match(/^[a-z][a-zA-Z]*$/), // 驼峰命名的变量
      )

      if (couldBeFunction) {
        console.log(`[CCoding] 🤔 isCallableSymbol: ${symbol.name} 是可疑的函数变量，允许进入下一步检查`)
        return true // 允许进入extractFunctions进行更深入的检查
      }

      console.log(`[CCoding] ❌ isCallableSymbol: ${symbol.name} 不是函数变量`)
      return false
    }

    console.log(`[CCoding] ❌ isCallableSymbol: ${symbol.name} 不是可调用符号 (kind: ${symbol.kind})`)
    return false
  }

  private async extractSignature(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): Promise<string> {
    try {
      const line = document.lineAt(symbol.range.start.line)
      const text = line.text.trim()
      // 简化的签名提取，实际可以更复杂
      return text.length > 80 ? `${text.substring(0, 80)}...` : text
    }
    catch {
      return symbol.name
    }
  }

  private extractParameters(detail: string): string[] {
    const match = detail.match(/\(([^)]*)\)/)
    if (match && match[1]) {
      return match[1].split(',').map(p => p.trim()).filter(p => p)
    }
    return []
  }

  private detectFrameworkType(fileName: string): 'react' | 'vue' | 'general' {
    if (fileName.endsWith('.vue'))
      return 'vue'
    if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx'))
      return 'react'
    return 'general'
  }

  private isLifecycleMethod(name: string, fileName: string): boolean {
    const reactLifecycle = ['componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'useEffect']
    const vueLifecycle = ['mounted', 'created', 'updated', 'destroyed', 'beforeMount', 'beforeDestroy']

    if (fileName.endsWith('.vue')) {
      return vueLifecycle.includes(name)
    }
    return reactLifecycle.includes(name)
  }

  private async extractReactInfo(symbol: vscode.DocumentSymbol, _document: vscode.TextDocument): Promise<any> {
    // 简化版本，实际中可以利用ReactParser
    const info: any = {}
    if (symbol.name.startsWith('use')) {
      info.hookType = symbol.name
      info.isAsync = symbol.name.includes('Async')
    }
    return info
  }

  private async extractVueInfo(symbol: vscode.DocumentSymbol, _document: vscode.TextDocument): Promise<any> {
    // 简化版本，实际中可以利用VueParser
    const info: any = {}
    const vueComputed = ['computed', 'get', 'set']
    info.isComputed = vueComputed.some(keyword => symbol.name.includes(keyword))
    return info
  }

  private calculateComplexity(range: vscode.Range, _document: vscode.TextDocument): number {
    try {
      // 简单的复杂度计算：基于行数
      const lineCount = range.end.line - range.start.line + 1
      if (lineCount <= 5)
        return 1 // 简单
      if (lineCount <= 15)
        return 2 // 中等
      if (lineCount <= 30)
        return 3 // 复杂
      return 4 // 非常复杂
    }
    catch {
      return 1
    }
  }

  /**
   * 当前搜索状态
   */
  private searchQuery: string = ''

  /**
   * 搜索符号列表
   * @param query - 搜索查询
   * @description 在符号名称中搜索匹配的内容，结果直接在树视图中过滤显示
   */
  async searchFunctions(query: string): Promise<void> {
    const originalQuery = query || ''
    const processedQuery = this.preprocessSearchQuery(originalQuery)
    
    console.log(`[CCoding] 符号搜索: "${originalQuery}" -> "${processedQuery}"`)
    
    this.searchQuery = processedQuery

    // 如果有搜索查询，立即刷新以显示过滤结果
    // 如果查询为空，也刷新以清除过滤
    this._onDidChangeTreeData.fire()
    
    // 输出搜索统计
    if (this.searchQuery) {
      this.logSearchStatistics()
    }
  }

  /**
   * 预处理搜索查询，提高搜索的准确性和灵活性
   */
  private preprocessSearchQuery(query: string): string {
    if (!query) return ''

    let processed = query.trim().toLowerCase()

    // 处理常见的搜索模式
    
    // 1. 去除引号
    processed = processed.replace(/['"]/g, '')
    
    // 2. 处理驼峰命名的搜索 - 如果用户输入的是驼峰，转为小写
    // 但保留原有的字符以支持精确匹配
    
    // 3. 处理函数相关的关键词
    const functionKeywords: Record<string, string> = {
      'function': 'function',
      'func': 'function', 
      'method': 'method',
      'arrow': 'arrow-function',
      'async': 'async',
      'lifecycle': 'lifecycle',
      'hook': 'hook',
      'react': 'react',
      'vue': 'vue'
    }
    
    // 如果搜索查询是已知的关键词，直接使用映射
    if (functionKeywords[processed]) {
      processed = functionKeywords[processed]
      console.log(`[CCoding] 关键词映射: ${query} -> ${processed}`)
    }
    
    // 4. 特殊字符处理 - 保持搜索查询的简洁性
    processed = processed.replace(/[^\w\s-]/g, '')
    
    // 5. 去除多余空格
    processed = processed.replace(/\s+/g, ' ').trim()
    
    return processed
  }

  /**
   * 输出搜索统计信息
   */
  private logSearchStatistics(): void {
    if (!this.searchQuery) return

    let totalMatches = 0
    let groupMatches = 0
    
    const countMatches = (items: FunctionItem[]): void => {
      items.forEach(item => {
        if (this.matchesSearchQuery(item)) {
          totalMatches++
          if (item.isGroup) {
            groupMatches++
          }
        }
        if (item.children) {
          countMatches(item.children)
        }
      })
    }
    
    countMatches(this.rootItems)
    
    console.log(`[CCoding] 搜索统计 "${this.searchQuery}": 共 ${totalMatches} 个匹配项 (${groupMatches} 个分组)`)
    
    // 如果没有匹配项，提供搜索建议
    if (totalMatches === 0) {
      console.log(`[CCoding] 搜索建议: 尝试搜索 "function", "method", "async", "arrow", "react", "vue" 等关键词`)
    }
  }

  /**
   * 清除搜索状态
   */
  clearSearch(): void {
    if (this.searchQuery) {
      console.log(`[CCoding] 清除符号搜索: "${this.searchQuery}"`)
      this.searchQuery = ''
      
      // 重置分组的折叠状态
      this.resetGroupCollapsibleStates()
      
      // 立即刷新树视图
      this._onDidChangeTreeData.fire()
    }
  }

  /**
   * 重置分组的折叠状态为默认状态
   */
  private resetGroupCollapsibleStates(): void {
    this.rootItems.forEach(item => {
      if (item.isGroup) {
        // 重置为默认的展开状态
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
      }
    })
  }
}

class FunctionItem extends vscode.TreeItem {
  public children?: FunctionItem[]
  public details?: FunctionDetails

  constructor(
    public readonly name: string,
    public readonly kind: vscode.SymbolKind | null,
    public readonly range: vscode.Range | null,
    public readonly uri: vscode.Uri | null,
    public readonly level: number,
    public readonly isGroup: boolean = false,
    details?: FunctionDetails,
  ) {
    super(
      name,
      vscode.TreeItemCollapsibleState.None, // 默认为None，后续会根据实际情况调整
    )

    this.details = details

    if (isGroup) {
      this.setupGroupItem()
    }
    else if (details) {
      this.setupFunctionItem(details)
    }
    else if (range && uri) {
      this.setupBasicItem()
    }

    this.iconPath = this.getIconForItem()
  }

  private setupGroupItem() {
    this.tooltip = `${this.name} Group`
    this.contextValue = 'functionGroup'
  }

  private setupFunctionItem(details: FunctionDetails) {
    // 设置折叠状态
    if (details.children && details.children.length > 0) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
    else {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None
    }

    // 构建详细的显示信息
    const params = details.parameters?.length ? `(${details.parameters.join(', ')})` : '()'
    const typeInfo = details.returnType ? `: ${details.returnType}` : ''
    const asyncInfo = details.additionalInfo?.isAsync ? 'async ' : ''
    const privateInfo = details.isPrivate ? '🔒 ' : ''
    const lifecycleInfo = details.isLifecycle ? '🔄 ' : ''
    const complexityInfo = this.getComplexityIndicator(details.complexity || 1)

    this.label = `${privateInfo}${lifecycleInfo}${asyncInfo}${details.name}${params}${typeInfo}`
    this.description = `Line ${details.range.start.line + 1} ${complexityInfo}`

    // 构建详细的tooltip
    let tooltip = `${details.name}${params}${typeInfo}\n`
    tooltip += `📁 Line ${details.range.start.line + 1}\n`

    // 显示符号类型
    if (details.customKind) {
      tooltip += `🔧 ${this.getCustomKindDisplayName(details.customKind)}\n`
    }
    else {
      tooltip += `🔧 ${this.getKindDisplayName(details.kind)}\n`
    }

    // 显示层级信息
    if (details.level > 0) {
      tooltip += `📊 Level: ${details.level} (nested)\n`
    }

    if (details.parent) {
      tooltip += `🔗 Parent: ${details.parent.name}\n`
    }

    tooltip += `🎯 Complexity: ${this.getComplexityName(details.complexity || 1)}\n`

    if (details.signature) {
      tooltip += `📝 ${details.signature}\n`
    }

    if (details.frameworkType !== 'general') {
      tooltip += `⚡ ${details.frameworkType.toUpperCase()} component\n`
    }

    if (details.additionalInfo?.hookType) {
      tooltip += `🪝 Hook: ${details.additionalInfo.hookType}\n`
    }

    if (details.additionalInfo?.isComputed) {
      tooltip += `💻 Computed property\n`
    }

    if (details.children?.length) {
      tooltip += `📂 Contains ${details.children.length} nested symbol(s)\n`
    }

    this.tooltip = tooltip

    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [details.uri, {
        selection: new vscode.Range(
          details.range.start.line,
          details.range.start.character,
          details.range.start.line,
          details.range.start.character,
        ),
      }],
    }

    this.contextValue = 'functionItem'
  }

  private getComplexityIndicator(complexity: number): string {
    switch (complexity) {
      case 1: return '🟢' // 简单
      case 2: return '🟡' // 中等
      case 3: return '🟠' // 复杂
      case 4: return '🔴' // 非常复杂
      default: return '⚪'
    }
  }

  private getComplexityName(complexity: number): string {
    switch (complexity) {
      case 1: return 'Simple'
      case 2: return 'Medium'
      case 3: return 'Complex'
      case 4: return 'Very Complex'
      default: return 'Unknown'
    }
  }

  private setupBasicItem() {
    if (this.range && this.uri) {
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
    }
  }

  private getIconForItem(): vscode.ThemeIcon {
    if (this.isGroup) {
      return this.getGroupIcon()
    }

    if (this.details) {
      return this.getDetailedIcon(this.details)
    }

    return this.getBasicIcon(this.kind)
  }

  private getGroupIcon(): vscode.ThemeIcon {
    switch (this.name) {
      case 'Classes':
        return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'))
      case 'Hooks':
        return new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('symbolIcon.eventForeground'))
      case 'Lifecycle':
        return new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('charts.orange'))
      case 'Methods':
        return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'))
      case 'Functions':
        return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('symbolIcon.functionForeground'))
      default:
        return new vscode.ThemeIcon('folder')
    }
  }

  private getDetailedIcon(details: FunctionDetails): vscode.ThemeIcon {
    let color: vscode.ThemeColor | undefined
    let iconName: string

    // 优先使用自定义符号类型图标
    if (details.customKind) {
      iconName = this.getIconNameForCustomKind(details.customKind)
      color = this.getColorForCustomKind(details.customKind)
    }
    else {
      iconName = this.getIconNameForKind(details.kind)

      // 根据层级调整图标
      if (details.level > 0) {
        // 子级函数使用不同的图标
        if (details.kind === vscode.SymbolKind.Function) {
          iconName = 'symbol-property' // 嵌套函数使用属性图标
        }
        else if (details.kind === vscode.SymbolKind.Method) {
          iconName = 'symbol-field' // 嵌套方法使用字段图标
        }
      }
    }

    // 设置颜色（如果还没有自定义颜色）
    if (!color) {
      if (details.isLifecycle) {
        color = new vscode.ThemeColor('charts.orange')
      }
      else if (details.isPrivate) {
        color = new vscode.ThemeColor('charts.red')
      }
      else if (details.frameworkType === 'react' && details.name.startsWith('use')) {
        color = new vscode.ThemeColor('charts.blue')
      }
      else if (details.additionalInfo?.isComputed) {
        color = new vscode.ThemeColor('charts.green')
      }
      else if (details.frameworkType === 'vue' && details.additionalInfo?.lifecyclePhase) {
        color = new vscode.ThemeColor('charts.purple')
      }
      else if (details.frameworkType === 'react' && details.additionalInfo?.componentType === 'functional') {
        color = new vscode.ThemeColor('charts.blue')
      }
      else if (details.level > 0) {
        // 为嵌套符号使用稍微不同的颜色
        color = new vscode.ThemeColor('foreground')
      }
    }

    return new vscode.ThemeIcon(iconName, color)
  }

  /**
   * 获取自定义符号类型的图标名称
   */
  private getIconNameForCustomKind(customKind: CustomSymbolKind): string {
    switch (customKind) {
      case CustomSymbolKind.HTMLElement:
        return 'symbol-tag'
      case CustomSymbolKind.CSSRule:
        return 'symbol-color'
      case CustomSymbolKind.CSSSelector:
        return 'symbol-ruler'
      case CustomSymbolKind.VueComponent:
        return 'symbol-module'
      case CustomSymbolKind.ReactComponent:
        return 'symbol-module'
      case CustomSymbolKind.ArrowFunction:
        return 'symbol-operator'
      case CustomSymbolKind.AsyncFunction:
        return 'symbol-event'
      default:
        return 'symbol-function'
    }
  }

  /**
   * 获取自定义符号类型的颜色
   */
  private getColorForCustomKind(customKind: CustomSymbolKind): vscode.ThemeColor {
    switch (customKind) {
      case CustomSymbolKind.HTMLElement:
        return new vscode.ThemeColor('charts.orange')
      case CustomSymbolKind.CSSRule:
        return new vscode.ThemeColor('charts.purple')
      case CustomSymbolKind.CSSSelector:
        return new vscode.ThemeColor('charts.blue')
      case CustomSymbolKind.VueComponent:
        return new vscode.ThemeColor('charts.green')
      case CustomSymbolKind.ReactComponent:
        return new vscode.ThemeColor('charts.blue')
      case CustomSymbolKind.ArrowFunction:
        return new vscode.ThemeColor('charts.yellow')
      case CustomSymbolKind.AsyncFunction:
        return new vscode.ThemeColor('charts.red')
      default:
        return new vscode.ThemeColor('foreground')
    }
  }

  private getIconNameForKind(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.Function:
        return 'symbol-function'
      case vscode.SymbolKind.Method:
        return 'symbol-method'
      case vscode.SymbolKind.Constructor:
        return 'symbol-constructor'
      case vscode.SymbolKind.Class:
        return 'symbol-class'
      case vscode.SymbolKind.Property:
        return 'symbol-property'
      case vscode.SymbolKind.Field:
        return 'symbol-field'
      default:
        return 'symbol-function'
    }
  }

  private getBasicIcon(kind: vscode.SymbolKind | null, color?: vscode.ThemeColor): vscode.ThemeIcon {
    switch (kind) {
      case vscode.SymbolKind.Function:
        return new vscode.ThemeIcon('symbol-function', color)
      case vscode.SymbolKind.Method:
        return new vscode.ThemeIcon('symbol-method', color)
      case vscode.SymbolKind.Constructor:
        return new vscode.ThemeIcon('symbol-constructor', color)
      case vscode.SymbolKind.Class:
        return new vscode.ThemeIcon('symbol-class', color)
      case vscode.SymbolKind.Property:
        return new vscode.ThemeIcon('symbol-property', color)
      case vscode.SymbolKind.Field:
        return new vscode.ThemeIcon('symbol-field', color)
      default:
        return new vscode.ThemeIcon('symbol-function', color)
    }
  }

  private getKindDisplayName(kind: vscode.SymbolKind): string {
    switch (kind) {
      case vscode.SymbolKind.Function:
        return 'Function'
      case vscode.SymbolKind.Method:
        return 'Method'
      case vscode.SymbolKind.Constructor:
        return 'Constructor'
      case vscode.SymbolKind.Class:
        return 'Class'
      case vscode.SymbolKind.Property:
        return 'Property'
      case vscode.SymbolKind.Field:
        return 'Field'
      default:
        return 'Symbol'
    }
  }

  /**
   * 获取自定义符号类型的显示名称
   */
  private getCustomKindDisplayName(customKind: CustomSymbolKind): string {
    switch (customKind) {
      case CustomSymbolKind.HTMLElement:
        return 'HTML Element'
      case CustomSymbolKind.CSSRule:
        return 'CSS Rule'
      case CustomSymbolKind.CSSSelector:
        return 'CSS Selector'
      case CustomSymbolKind.VueComponent:
        return 'Vue Component'
      case CustomSymbolKind.ReactComponent:
        return 'React Component'
      case CustomSymbolKind.ArrowFunction:
        return 'Arrow Function'
      case CustomSymbolKind.AsyncFunction:
        return 'Async Function'
      default:
        return 'Custom Symbol'
    }
  }
}
