import type {
  FrontendSymbolInfo,
  ReactSymbolInfo,
  SymbolContext,
  VueSymbolInfo,
} from '../types/frontendSymbols.js'
import * as vscode from 'vscode'
import {
  FrameworkType,
  FrontendSymbolKind,
  SymbolPriority,
} from '../types/frontendSymbols.js'

/**
 * 前端符号检测器
 * 专门用于识别和分析 Vue、React 等前端框架中的符号
 */
export class FrontendSymbolDetector {
  private document: vscode.TextDocument
  private content: string
  private lines: string[]
  private framework: FrameworkType

  constructor(document: vscode.TextDocument) {
    this.document = document
    this.content = document.getText()
    this.lines = this.content.split('\n')
    this.framework = this.detectFramework()
  }

  /**
   * 检测文件使用的前端框架
   */
  private detectFramework(): FrameworkType {
    const fileName = this.document.fileName.toLowerCase()

    // 通过文件扩展名判断
    if (fileName.endsWith('.vue')) {
      return FrameworkType.Vue
    }

    if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx')) {
      return FrameworkType.React
    }

    // 通过导入语句判断
    const importLines = this.lines.filter(line => line.trim().startsWith('import'))

    for (const line of importLines) {
      if (line.includes('vue') || line.includes('@vue/')) {
        return FrameworkType.Vue
      }
      if (line.includes('react') || line.includes('@react/')) {
        return FrameworkType.React
      }
    }

    // 通过关键字判断
    if (this.content.includes('defineComponent') || this.content.includes('<script setup>')) {
      return FrameworkType.Vue
    }

    if (this.content.includes('useState') || this.content.includes('useEffect') || this.content.includes('React.')) {
      return FrameworkType.React
    }

    return FrameworkType.General
  }

  /**
   * 分析所有符号并增强 VSCode 原生符号
   */
  async analyzeSymbols(vscodeSymbols: vscode.DocumentSymbol[]): Promise<FrontendSymbolInfo[]> {
    const frontendSymbols: FrontendSymbolInfo[] = []

    // 处理 VSCode 原生符号
    for (const symbol of vscodeSymbols) {
      const enhanced = await this.enhanceSymbol(symbol)
      if (enhanced) {
        frontendSymbols.push(enhanced)
      }
    }

    // 检测 VSCode 可能遗漏的前端特定符号
    const additionalSymbols = await this.detectAdditionalSymbols()
    frontendSymbols.push(...additionalSymbols)

    // 分析符号间的关系和上下文
    this.analyzeSymbolRelationships(frontendSymbols)

    return frontendSymbols
  }

  /**
   * 增强 VSCode 原生符号
   */
  private async enhanceSymbol(symbol: vscode.DocumentSymbol, parent?: FrontendSymbolInfo): Promise<FrontendSymbolInfo | null> {
    const signature = await this.extractSignature(symbol)

    // 检测前端特定的符号类型
    const frontendKind = this.detectFrontendSymbolKind(symbol, signature)
    if (!frontendKind) {
      return null // 不是我们关心的符号类型
    }

    const frontendSymbol: FrontendSymbolInfo = {
      id: `${symbol.name}_${symbol.range.start.line}`,
      name: symbol.name,
      kind: symbol.kind,
      frontendKind,
      framework: this.framework,
      priority: this.calculatePriority(symbol, frontendKind),
      range: symbol.range,
      uri: this.document.uri,
      level: parent ? parent.level + 1 : 0,
      parent,
      children: [],

      signature,
      parameters: this.extractParameters(symbol, signature),
      returnType: this.extractReturnType(signature),
      isAsync: signature.includes('async'),
      isPrivate: symbol.name.startsWith('_') || symbol.name.startsWith('#'),
      isExported: this.isExported(symbol),

      context: this.analyzeSymbolContext(symbol, signature),
      category: this.categorizeSymbol(frontendKind),
      tags: this.generateTags(symbol, frontendKind, signature),
      relatedFiles: [],

      complexity: this.calculateComplexity(symbol),
      timestamp: Date.now(),
    }

    // 添加框架特定信息
    if (this.framework === FrameworkType.Vue) {
      frontendSymbol.vueInfo = this.analyzeVueSymbol(symbol, signature)
    }
    else if (this.framework === FrameworkType.React) {
      frontendSymbol.reactInfo = this.analyzeReactSymbol(symbol, signature)
    }

    // 递归处理子符号
    if (symbol.children) {
      for (const child of symbol.children) {
        const childSymbol = await this.enhanceSymbol(child, frontendSymbol)
        if (childSymbol) {
          frontendSymbol.children.push(childSymbol)
        }
      }
    }

    return frontendSymbol
  }

  /**
   * 检测前端特定的符号类型
   */
  private detectFrontendSymbolKind(symbol: vscode.DocumentSymbol, signature: string): FrontendSymbolKind | null {
    const name = symbol.name
    const detail = symbol.detail || ''

    // Vue 特定检测
    if (this.framework === FrameworkType.Vue) {
      // 响应式变量
      if (signature.includes('ref(') || detail.includes('Ref<')) {
        return FrontendSymbolKind.VueRef
      }
      if (signature.includes('reactive(') || detail.includes('UnwrapRef<')) {
        return FrontendSymbolKind.VueReactive
      }
      if (signature.includes('computed(') || detail.includes('ComputedRef<')) {
        return FrontendSymbolKind.VueComputed
      }
      if (signature.includes('watch(') || signature.includes('watchEffect(')) {
        return FrontendSymbolKind.VueWatch
      }

      // 生命周期
      const vueLifecycles = ['onMounted', 'onBeforeMount', 'onUpdated', 'onBeforeUpdate', 'onUnmounted', 'onBeforeUnmount']
      if (vueLifecycles.some(lifecycle => signature.includes(lifecycle))) {
        return FrontendSymbolKind.VueLifecycle
      }

      // 组合式函数
      if (name.startsWith('use') && symbol.kind === vscode.SymbolKind.Function) {
        return FrontendSymbolKind.VueComposable
      }
    }

    // React 特定检测
    if (this.framework === FrameworkType.React) {
      // Hooks
      if (name.startsWith('use') && symbol.kind === vscode.SymbolKind.Function) {
        if (['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext'].includes(name)) {
          return FrontendSymbolKind.ReactHook
        }
        else {
          return FrontendSymbolKind.ReactCustomHook
        }
      }

      // React 组件
      if (symbol.kind === vscode.SymbolKind.Function && /^[A-Z]/.test(name)) {
        return FrontendSymbolKind.ReactComponent
      }

      // State 相关
      if (signature.includes('useState')) {
        return FrontendSymbolKind.ReactState
      }
      if (signature.includes('useEffect')) {
        return FrontendSymbolKind.ReactEffect
      }
      if (signature.includes('useCallback')) {
        return FrontendSymbolKind.ReactCallback
      }
    }

    // 通用检测
    // 事件处理器
    if (name.startsWith('on') || name.startsWith('handle') || name.includes('Click') || name.includes('Change')) {
      return FrontendSymbolKind.EventHandler
    }

    // API 调用
    if (name.includes('api') || name.includes('fetch') || name.includes('request') || name.includes('get') || name.includes('post')) {
      return FrontendSymbolKind.ApiCall
    }

    // 箭头函数
    if (signature.includes('=>')) {
      return signature.includes('async') ? FrontendSymbolKind.AsyncFunction : FrontendSymbolKind.ArrowFunction
    }

    // 异步函数
    if (signature.includes('async')) {
      return FrontendSymbolKind.AsyncFunction
    }

    // 普通函数
    if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
      return FrontendSymbolKind.ArrowFunction // 作为默认函数类型
    }

    return null
  }

  /**
   * 计算符号优先级
   */
  private calculatePriority(symbol: vscode.DocumentSymbol, frontendKind: FrontendSymbolKind): SymbolPriority {
    const _name = symbol.name

    // 组件定义最高优先级
    if (frontendKind === FrontendSymbolKind.VueComponent || frontendKind === FrontendSymbolKind.ReactComponent) {
      return SymbolPriority.Critical
    }

    // Hooks 和生命周期高优先级
    if ([
      FrontendSymbolKind.VueComposable,
      FrontendSymbolKind.VueLifecycle,
      FrontendSymbolKind.ReactHook,
      FrontendSymbolKind.ReactCustomHook,
      FrontendSymbolKind.ReactEffect,
    ].includes(frontendKind)) {
      return SymbolPriority.High
    }

    // 事件处理器和API调用中等优先级
    if ([
      FrontendSymbolKind.EventHandler,
      FrontendSymbolKind.ApiCall,
      FrontendSymbolKind.VueComputed,
      FrontendSymbolKind.ReactState,
    ].includes(frontendKind)) {
      return SymbolPriority.Medium
    }

    // 响应式数据和工具函数低优先级
    if ([
      FrontendSymbolKind.VueRef,
      FrontendSymbolKind.VueReactive,
      FrontendSymbolKind.Utility,
    ].includes(frontendKind)) {
      return SymbolPriority.Low
    }

    // 默认最小优先级
    return SymbolPriority.Minimal
  }

  /**
   * 分析符号使用上下文
   */
  private analyzeSymbolContext(symbol: vscode.DocumentSymbol, _signature: string): SymbolContext {
    const name = symbol.name

    // 检查在模板中的使用
    const usedInTemplate = this.isUsedInTemplate(name)

    // 检查在事件中的使用
    const usedInEvents = this.isUsedInEvents(name)

    // 简单的引用计数（实际实现可以更复杂）
    const referenceCount = this.countReferences(name)

    return {
      usedInTemplate,
      usedInEvents,
      referenceCount,
      usageFrequency: 0, // 需要从历史数据中获取
    }
  }

  /**
   * 检查符号是否在模板中使用
   */
  private isUsedInTemplate(symbolName: string): boolean {
    if (this.framework === FrameworkType.Vue) {
      // 检查 Vue 模板部分
      const templateMatch = this.content.match(/<template>([\s\S]*?)<\/template>/)
      if (templateMatch) {
        const templateContent = templateMatch[1]
        return templateContent.includes(symbolName)
      }
    }
    else if (this.framework === FrameworkType.React) {
      // 检查 JSX 返回部分
      const returnMatches = this.content.match(/return\s*\(([\s\S]*?)\)/g)
      if (returnMatches) {
        return returnMatches.some(match => match.includes(symbolName))
      }
    }
    return false
  }

  /**
   * 检查符号是否在事件处理中使用
   */
  private isUsedInEvents(symbolName: string): boolean {
    const eventPatterns = [
      `@click="${symbolName}"`,
      `@change="${symbolName}"`,
      `onClick={${symbolName}}`,
      `onChange={${symbolName}}`,
      `.addEventListener('click', ${symbolName})`,
    ]

    return eventPatterns.some(pattern => this.content.includes(pattern))
  }

  /**
   * 计算符号引用次数
   */
  private countReferences(symbolName: string): number {
    const regex = new RegExp(`\\b${symbolName}\\b`, 'g')
    const matches = this.content.match(regex)
    return matches ? matches.length - 1 : 0 // 减去定义本身
  }

  /**
   * 符号分类
   */
  private categorizeSymbol(frontendKind: FrontendSymbolKind): string {
    if ([FrontendSymbolKind.VueComponent, FrontendSymbolKind.ReactComponent].includes(frontendKind)) {
      return 'component'
    }

    if ([
      FrontendSymbolKind.VueComposable,
      FrontendSymbolKind.ReactHook,
      FrontendSymbolKind.ReactCustomHook,
      FrontendSymbolKind.VueLifecycle,
      FrontendSymbolKind.ReactEffect,
    ].includes(frontendKind)) {
      return 'hook'
    }

    if (frontendKind === FrontendSymbolKind.EventHandler) {
      return 'event'
    }

    if (frontendKind === FrontendSymbolKind.ApiCall) {
      return 'api'
    }

    if ([FrontendSymbolKind.CSSRule, FrontendSymbolKind.CSSSelector, FrontendSymbolKind.Style].includes(frontendKind)) {
      return 'style'
    }

    return 'utility'
  }

  /**
   * 生成符号标签
   */
  private generateTags(symbol: vscode.DocumentSymbol, frontendKind: FrontendSymbolKind, signature: string): string[] {
    const tags: string[] = []

    // 基于符号类型添加标签
    if (frontendKind === FrontendSymbolKind.VueComponent || frontendKind === FrontendSymbolKind.ReactComponent) {
      tags.push('component')
    }

    if (signature.includes('async')) {
      tags.push('async')
    }

    if (symbol.name.startsWith('_')) {
      tags.push('private')
    }

    if (this.isExported(symbol)) {
      tags.push('exported')
    }

    // 基于命名模式添加标签
    if (symbol.name.includes('api') || symbol.name.includes('fetch')) {
      tags.push('api')
    }

    if (symbol.name.includes('util') || symbol.name.includes('helper')) {
      tags.push('utility')
    }

    return tags
  }

  /**
   * 分析 Vue 特定信息
   */
  private analyzeVueSymbol(symbol: vscode.DocumentSymbol, signature: string): VueSymbolInfo {
    const info: VueSymbolInfo = {
      isCompositionAPI: this.content.includes('<script setup>') || this.content.includes('defineComponent'),
      usedInTemplate: this.isUsedInTemplate(symbol.name),
      templateBindings: [],
    }

    // 检测响应式类型
    if (signature.includes('ref(')) {
      info.reactiveType = 'ref'
    }
    else if (signature.includes('reactive(')) {
      info.reactiveType = 'reactive'
    }
    else if (signature.includes('computed(')) {
      info.reactiveType = 'computed'
    }

    // 检测组件类型
    if (symbol.name.includes('Page') || symbol.name.includes('View')) {
      info.componentType = 'page'
    }
    else if (symbol.name.includes('Layout')) {
      info.componentType = 'layout'
    }
    else if (symbol.name.includes('Widget') || symbol.name.includes('Item')) {
      info.componentType = 'widget'
    }

    return info
  }

  /**
   * 分析 React 特定信息
   */
  private analyzeReactSymbol(symbol: vscode.DocumentSymbol, signature: string): ReactSymbolInfo {
    const info: ReactSymbolInfo = {}

    // 检测组件类型
    if (/^[A-Z]/.test(symbol.name) && symbol.kind === vscode.SymbolKind.Function) {
      info.componentType = 'functional'
    }

    // 检测 Hook 类型
    if (symbol.name.startsWith('use')) {
      if (signature.includes('useState')) {
        info.hookType = 'useState'
      }
      else if (signature.includes('useEffect')) {
        info.hookType = 'useEffect'
      }
      else if (signature.includes('useCallback')) {
        info.hookType = 'useCallback'
      }
      else if (signature.includes('useMemo')) {
        info.hookType = 'useMemo'
      }
      else {
        info.hookType = 'custom'
      }
    }

    return info
  }

  /**
   * 检测额外的符号（VSCode 可能遗漏的）
   */
  private async detectAdditionalSymbols(): Promise<FrontendSymbolInfo[]> {
    const additionalSymbols: FrontendSymbolInfo[] = []

    // 这里可以添加自定义的符号检测逻辑
    // 例如：检测箭头函数、解构赋值等

    return additionalSymbols
  }

  /**
   * 分析符号间的关系
   */
  private analyzeSymbolRelationships(_symbols: FrontendSymbolInfo[]): void {
    // 分析符号之间的调用关系、依赖关系等
    // 这里可以实现更复杂的关系分析逻辑
  }

  // 辅助方法
  private async extractSignature(symbol: vscode.DocumentSymbol): Promise<string> {
    try {
      const line = this.document.lineAt(symbol.range.start.line)
      const text = line.text.trim()
      return text.length > 100 ? `${text.substring(0, 100)}...` : text
    }
    catch {
      return symbol.name
    }
  }

  private extractParameters(symbol: vscode.DocumentSymbol, signature: string): string[] {
    const match = signature.match(/\(([^)]*)\)/)
    if (match && match[1]) {
      return match[1].split(',').map(p => p.trim()).filter(p => p)
    }
    return []
  }

  private extractReturnType(signature: string): string | undefined {
    const match = signature.match(/:\s*([^=>{]+)/)
    return match ? match[1].trim() : undefined
  }

  private isExported(symbol: vscode.DocumentSymbol): boolean {
    const lineText = this.lines[symbol.range.start.line] || ''
    return lineText.includes('export')
  }

  private calculateComplexity(symbol: vscode.DocumentSymbol): number {
    const lineCount = symbol.range.end.line - symbol.range.start.line + 1
    if (lineCount <= 5)
      return 1
    if (lineCount <= 15)
      return 2
    if (lineCount <= 30)
      return 3
    return 4
  }
}
