import type {
  FrontendSymbolInfo,
  QuickFilter,
  SymbolGroupConfig,
} from '../types/frontendSymbols'
import * as vscode from 'vscode'
import {
  FrameworkType,
  FrontendSymbolKind,
  SymbolPriority,
} from '../types/frontendSymbols'

/**
 * 符号分组管理器
 * 根据前端开发习惯对符号进行智能分组和过滤
 */
export class SymbolGroupManager {
  private groupConfigs: Map<FrameworkType, SymbolGroupConfig> = new Map()
  private quickFilters: QuickFilter[] = []

  constructor() {
    this.initializeGroupConfigs()
    this.initializeQuickFilters()
  }

  /**
   * 初始化分组配置
   */
  private initializeGroupConfigs(): void {
    // Vue 分组配置
    this.groupConfigs.set(FrameworkType.Vue, {
      framework: FrameworkType.Vue,
      groups: [
        {
          id: 'vue-components',
          name: '🏗️ 组件定义',
          icon: 'symbol-class',
          color: 'charts.green',
          priority: 10,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.VueComponent,
          sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
          id: 'vue-composables',
          name: '🪝 组合式函数',
          icon: 'symbol-event',
          color: 'charts.blue',
          priority: 9,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.VueComposable
            || symbol.name.startsWith('use'),
          sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
          id: 'vue-reactive',
          name: '⚡ 响应式数据',
          icon: 'symbol-variable',
          color: 'charts.yellow',
          priority: 8,
          defaultExpanded: true,
          filter: symbol => [
            FrontendSymbolKind.VueRef,
            FrontendSymbolKind.VueReactive,
            FrontendSymbolKind.VueComputed,
          ].includes(symbol.frontendKind),
        },
        {
          id: 'vue-lifecycle',
          name: '🔄 生命周期',
          icon: 'symbol-event',
          color: 'charts.orange',
          priority: 7,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.VueLifecycle,
        },
        {
          id: 'vue-events',
          name: '🎯 事件处理',
          icon: 'symbol-method',
          color: 'charts.purple',
          priority: 6,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.EventHandler
            || symbol.category === 'event',
        },
        {
          id: 'vue-watchers',
          name: '👀 监听器',
          icon: 'eye',
          color: 'charts.red',
          priority: 5,
          defaultExpanded: false,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.VueWatch,
        },
        {
          id: 'vue-methods',
          name: '⚙️ 方法函数',
          icon: 'symbol-function',
          color: 'charts.blue',
          priority: 4,
          defaultExpanded: false,
          filter: symbol => [
            FrontendSymbolKind.ArrowFunction,
            FrontendSymbolKind.AsyncFunction,
          ].includes(symbol.frontendKind)
          && !symbol.name.startsWith('use')
          && symbol.category !== 'event',
        },
        {
          id: 'vue-utils',
          name: '🔧 工具函数',
          icon: 'tools',
          color: 'foreground',
          priority: 3,
          defaultExpanded: false,
          filter: symbol => symbol.category === 'utility'
            || symbol.tags.includes('utility'),
        },
        {
          id: 'vue-api',
          name: '🌐 API 调用',
          icon: 'globe',
          color: 'charts.green',
          priority: 2,
          defaultExpanded: false,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.ApiCall
            || symbol.category === 'api',
        },
      ],
    })

    // React 分组配置
    this.groupConfigs.set(FrameworkType.React, {
      framework: FrameworkType.React,
      groups: [
        {
          id: 'react-components',
          name: '⚛️ React 组件',
          icon: 'symbol-class',
          color: 'charts.blue',
          priority: 10,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.ReactComponent,
          sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
          id: 'react-hooks',
          name: '🪝 Hooks',
          icon: 'symbol-event',
          color: 'charts.purple',
          priority: 9,
          defaultExpanded: true,
          filter: symbol => [
            FrontendSymbolKind.ReactHook,
            FrontendSymbolKind.ReactCustomHook,
          ].includes(symbol.frontendKind),
        },
        {
          id: 'react-state',
          name: '📊 状态管理',
          icon: 'symbol-variable',
          color: 'charts.yellow',
          priority: 8,
          defaultExpanded: true,
          filter: symbol => [
            FrontendSymbolKind.ReactState,
            FrontendSymbolKind.StateManager,
          ].includes(symbol.frontendKind),
        },
        {
          id: 'react-effects',
          name: '🎭 副作用',
          icon: 'symbol-event',
          color: 'charts.orange',
          priority: 7,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.ReactEffect,
        },
        {
          id: 'react-callbacks',
          name: '🔄 回调函数',
          icon: 'symbol-method',
          color: 'charts.green',
          priority: 6,
          defaultExpanded: false,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.ReactCallback,
        },
        {
          id: 'react-events',
          name: '🎯 事件处理',
          icon: 'symbol-method',
          color: 'charts.purple',
          priority: 5,
          defaultExpanded: true,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.EventHandler
            || symbol.category === 'event',
        },
        {
          id: 'react-utils',
          name: '🔧 工具函数',
          icon: 'tools',
          color: 'foreground',
          priority: 4,
          defaultExpanded: false,
          filter: symbol => symbol.category === 'utility',
        },
        {
          id: 'react-api',
          name: '🌐 API 调用',
          icon: 'globe',
          color: 'charts.green',
          priority: 3,
          defaultExpanded: false,
          filter: symbol => symbol.frontendKind === FrontendSymbolKind.ApiCall,
        },
      ],
    })

    // 通用分组配置
    this.groupConfigs.set(FrameworkType.General, {
      framework: FrameworkType.General,
      groups: [
        {
          id: 'functions',
          name: '⚙️ 函数',
          icon: 'symbol-function',
          color: 'charts.blue',
          priority: 10,
          defaultExpanded: true,
          filter: symbol => [
            FrontendSymbolKind.ArrowFunction,
            FrontendSymbolKind.AsyncFunction,
          ].includes(symbol.frontendKind)
          || symbol.kind === vscode.SymbolKind.Function,
        },
        {
          id: 'classes',
          name: '🏗️ 类',
          icon: 'symbol-class',
          color: 'charts.green',
          priority: 9,
          defaultExpanded: true,
          filter: symbol => symbol.kind === vscode.SymbolKind.Class,
        },
        {
          id: 'methods',
          name: '🔧 方法',
          icon: 'symbol-method',
          color: 'charts.purple',
          priority: 8,
          defaultExpanded: false,
          filter: symbol => symbol.kind === vscode.SymbolKind.Method,
        },
        {
          id: 'variables',
          name: '📦 变量',
          icon: 'symbol-variable',
          color: 'charts.yellow',
          priority: 7,
          defaultExpanded: false,
          filter: symbol => symbol.kind === vscode.SymbolKind.Variable,
        },
      ],
    })
  }

  /**
   * 初始化快速过滤器
   */
  private initializeQuickFilters(): void {
    this.quickFilters = [
      {
        id: 'components',
        name: '组件',
        icon: 'symbol-class',
        tooltip: '只显示组件定义',
        filter: symbol => [
          FrontendSymbolKind.VueComponent,
          FrontendSymbolKind.ReactComponent,
        ].includes(symbol.frontendKind),
        hotkey: '1',
      },
      {
        id: 'hooks',
        name: 'Hooks',
        icon: 'symbol-event',
        tooltip: '只显示 Hooks 和组合式函数',
        filter: symbol => [
          FrontendSymbolKind.VueComposable,
          FrontendSymbolKind.ReactHook,
          FrontendSymbolKind.ReactCustomHook,
          FrontendSymbolKind.VueLifecycle,
        ].includes(symbol.frontendKind),
        hotkey: '2',
      },
      {
        id: 'events',
        name: '事件',
        icon: 'symbol-method',
        tooltip: '只显示事件处理函数',
        filter: symbol => symbol.frontendKind === FrontendSymbolKind.EventHandler
          || symbol.category === 'event',
        hotkey: '3',
      },
      {
        id: 'async',
        name: '异步',
        icon: 'symbol-event',
        tooltip: '只显示异步函数和 API 调用',
        filter: symbol => symbol.isAsync
          || symbol.frontendKind === FrontendSymbolKind.ApiCall
          || symbol.frontendKind === FrontendSymbolKind.AsyncFunction,
        hotkey: '4',
      },
      {
        id: 'important',
        name: '重要',
        icon: 'star',
        tooltip: '只显示高优先级符号',
        filter: symbol => symbol.priority >= SymbolPriority.High,
        hotkey: '5',
      },
      {
        id: 'exported',
        name: '导出',
        icon: 'export',
        tooltip: '只显示导出的符号',
        filter: symbol => symbol.isExported,
        hotkey: '6',
      },
      {
        id: 'private',
        name: '私有',
        icon: 'lock',
        tooltip: '只显示私有符号',
        filter: symbol => symbol.isPrivate,
        hotkey: '7',
      },
      {
        id: 'used-in-template',
        name: '模板使用',
        icon: 'code',
        tooltip: '只显示在模板中使用的符号',
        filter: symbol => symbol.context.usedInTemplate,
        hotkey: '8',
      },
    ]
  }

  /**
   * 根据框架类型获取分组配置
   */
  getGroupConfig(framework: FrameworkType): SymbolGroupConfig | undefined {
    return this.groupConfigs.get(framework) || this.groupConfigs.get(FrameworkType.General)
  }

  /**
   * 对符号进行分组
   */
  groupSymbols(symbols: FrontendSymbolInfo[], framework: FrameworkType): Map<string, FrontendSymbolInfo[]> {
    const config = this.getGroupConfig(framework)
    if (!config) {
      return new Map()
    }

    const groupedSymbols = new Map<string, FrontendSymbolInfo[]>()

    // 初始化所有分组
    config.groups.forEach((group) => {
      groupedSymbols.set(group.id, [])
    })

    // 将符号分配到对应的分组
    symbols.forEach((symbol) => {
      let assigned = false

      // 按优先级顺序检查分组
      const sortedGroups = [...config.groups].sort((a, b) => b.priority - a.priority)

      for (const group of sortedGroups) {
        if (group.filter(symbol)) {
          const groupSymbols = groupedSymbols.get(group.id) || []
          groupSymbols.push(symbol)
          groupedSymbols.set(group.id, groupSymbols)
          assigned = true
          break
        }
      }

      // 如果没有分配到任何分组，添加到工具函数分组
      if (!assigned) {
        const utilsGroup = groupedSymbols.get('utils') || groupedSymbols.get('vue-utils') || groupedSymbols.get('react-utils')
        if (utilsGroup) {
          utilsGroup.push(symbol)
        }
      }
    })

    // 对每个分组内的符号进行排序
    config.groups.forEach((group) => {
      const groupSymbols = groupedSymbols.get(group.id)
      if (groupSymbols && groupSymbols.length > 0) {
        if (group.sorter) {
          groupSymbols.sort(group.sorter)
        }
        else {
          // 默认排序：优先级 > 行号 > 名称
          groupSymbols.sort((a, b) => {
            if (a.priority !== b.priority) {
              return b.priority - a.priority
            }
            if (a.range.start.line !== b.range.start.line) {
              return a.range.start.line - b.range.start.line
            }
            return a.name.localeCompare(b.name)
          })
        }
      }
    })

    // 移除空分组
    const result = new Map<string, FrontendSymbolInfo[]>()
    groupedSymbols.forEach((symbols, groupId) => {
      if (symbols.length > 0) {
        result.set(groupId, symbols)
      }
    })

    return result
  }

  /**
   * 应用快速过滤器
   */
  applyQuickFilter(symbols: FrontendSymbolInfo[], filterId: string): FrontendSymbolInfo[] {
    const filter = this.quickFilters.find(f => f.id === filterId)
    if (!filter) {
      return symbols
    }

    return this.filterSymbolsRecursively(symbols, filter.filter)
  }

  /**
   * 递归过滤符号（包括子符号）
   */
  private filterSymbolsRecursively(
    symbols: FrontendSymbolInfo[],
    filterFn: (symbol: FrontendSymbolInfo) => boolean,
  ): FrontendSymbolInfo[] {
    const result: FrontendSymbolInfo[] = []

    for (const symbol of symbols) {
      const matchesFilter = filterFn(symbol)
      const filteredChildren = this.filterSymbolsRecursively(symbol.children, filterFn)

      if (matchesFilter || filteredChildren.length > 0) {
        const newSymbol: FrontendSymbolInfo = {
          ...symbol,
          children: filteredChildren,
        }
        result.push(newSymbol)
      }
    }

    return result
  }

  /**
   * 获取所有快速过滤器
   */
  getQuickFilters(): QuickFilter[] {
    return this.quickFilters
  }

  /**
   * 根据搜索查询过滤符号
   */
  searchSymbols(symbols: FrontendSymbolInfo[], query: string): FrontendSymbolInfo[] {
    if (!query.trim()) {
      return symbols
    }

    const normalizedQuery = query.toLowerCase().trim()

    return this.filterSymbolsRecursively(symbols, (symbol) => {
      // 搜索符号名称
      if (symbol.name.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      // 搜索符号类型
      if (symbol.frontendKind.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      // 搜索分类
      if (symbol.category.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      // 搜索标签
      if (symbol.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))) {
        return true
      }

      // 搜索签名
      if (symbol.signature && symbol.signature.toLowerCase().includes(normalizedQuery)) {
        return true
      }

      return false
    })
  }

  /**
   * 获取符号的显示信息
   */
  getSymbolDisplayInfo(symbol: FrontendSymbolInfo): {
    icon: string
    color: string
    label: string
    description: string
    tooltip: string
  } {
    const priority = this.getPriorityIndicator(symbol.priority)
    const async = symbol.isAsync ? '⚡' : ''
    const exported = symbol.isExported ? '📤' : ''
    const private_ = symbol.isPrivate ? '🔒' : ''
    const templateUsed = symbol.context.usedInTemplate ? '🎯' : ''

    const prefixes = [priority, async, exported, private_, templateUsed].filter(p => p).join(' ')
    const label = prefixes ? `${prefixes} ${symbol.name}` : symbol.name

    const icon = this.getSymbolIcon(symbol.frontendKind)
    const color = this.getSymbolColor(symbol.frontendKind, symbol.framework)

    const description = `Line ${symbol.range.start.line + 1} · ${this.getKindDisplayName(symbol.frontendKind)}`

    const tooltip = this.buildTooltip(symbol)

    return { icon, color, label, description, tooltip }
  }

  /**
   * 获取优先级指示器
   */
  private getPriorityIndicator(priority: SymbolPriority): string {
    switch (priority) {
      case SymbolPriority.Critical: return '🔴'
      case SymbolPriority.High: return '🟠'
      case SymbolPriority.Medium: return '🟡'
      case SymbolPriority.Low: return '🟢'
      case SymbolPriority.Minimal: return '⚪'
      default: return ''
    }
  }

  /**
   * 获取符号图标
   */
  private getSymbolIcon(kind: FrontendSymbolKind): string {
    const iconMap: Record<FrontendSymbolKind, string> = {
      // Vue
      [FrontendSymbolKind.VueComponent]: 'symbol-class',
      [FrontendSymbolKind.VueComposable]: 'symbol-event',
      [FrontendSymbolKind.VueRef]: 'symbol-variable',
      [FrontendSymbolKind.VueReactive]: 'symbol-variable',
      [FrontendSymbolKind.VueComputed]: 'symbol-property',
      [FrontendSymbolKind.VueWatch]: 'eye',
      [FrontendSymbolKind.VueLifecycle]: 'symbol-event',
      [FrontendSymbolKind.VueDirective]: 'symbol-operator',
      [FrontendSymbolKind.VueSlot]: 'symbol-field',
      [FrontendSymbolKind.VueEmit]: 'symbol-event',
      [FrontendSymbolKind.VueProps]: 'symbol-property',

      // React
      [FrontendSymbolKind.ReactComponent]: 'symbol-class',
      [FrontendSymbolKind.ReactHook]: 'symbol-event',
      [FrontendSymbolKind.ReactCustomHook]: 'symbol-method',
      [FrontendSymbolKind.ReactState]: 'symbol-variable',
      [FrontendSymbolKind.ReactEffect]: 'symbol-event',
      [FrontendSymbolKind.ReactCallback]: 'symbol-method',
      [FrontendSymbolKind.ReactMemo]: 'symbol-property',
      [FrontendSymbolKind.ReactProps]: 'symbol-property',
      [FrontendSymbolKind.ReactContext]: 'symbol-namespace',

      // 通用
      [FrontendSymbolKind.EventHandler]: 'symbol-method',
      [FrontendSymbolKind.ApiCall]: 'globe',
      [FrontendSymbolKind.StateManager]: 'database',
      [FrontendSymbolKind.Router]: 'symbol-namespace',
      [FrontendSymbolKind.Middleware]: 'symbol-interface',
      [FrontendSymbolKind.Validator]: 'shield',
      [FrontendSymbolKind.Utility]: 'tools',
      [FrontendSymbolKind.Style]: 'symbol-color',
      [FrontendSymbolKind.Asset]: 'file-media',

      // 函数类型
      [FrontendSymbolKind.ArrowFunction]: 'symbol-function',
      [FrontendSymbolKind.AsyncFunction]: 'symbol-event',
      [FrontendSymbolKind.GeneratorFunction]: 'symbol-method',

      // DOM
      [FrontendSymbolKind.HTMLElement]: 'symbol-tag',
      [FrontendSymbolKind.CSSRule]: 'symbol-color',
      [FrontendSymbolKind.CSSSelector]: 'symbol-ruler',
    }

    return iconMap[kind] || 'symbol-function'
  }

  /**
   * 获取符号颜色
   */
  private getSymbolColor(kind: FrontendSymbolKind, framework: FrameworkType): string {
    if (framework === FrameworkType.Vue) {
      return 'charts.green'
    }
    else if (framework === FrameworkType.React) {
      return 'charts.blue'
    }

    // 通用颜色映射
    const colorMap: Partial<Record<FrontendSymbolKind, string>> = {
      [FrontendSymbolKind.EventHandler]: 'charts.purple',
      [FrontendSymbolKind.ApiCall]: 'charts.green',
      [FrontendSymbolKind.AsyncFunction]: 'charts.orange',
      [FrontendSymbolKind.ArrowFunction]: 'charts.blue',
    }

    return colorMap[kind] || 'foreground'
  }

  /**
   * 获取符号类型的显示名称
   */
  private getKindDisplayName(kind: FrontendSymbolKind): string {
    const nameMap: Record<FrontendSymbolKind, string> = {
      // Vue
      [FrontendSymbolKind.VueComponent]: 'Vue 组件',
      [FrontendSymbolKind.VueComposable]: '组合式函数',
      [FrontendSymbolKind.VueRef]: 'Ref 响应式',
      [FrontendSymbolKind.VueReactive]: 'Reactive 响应式',
      [FrontendSymbolKind.VueComputed]: '计算属性',
      [FrontendSymbolKind.VueWatch]: '监听器',
      [FrontendSymbolKind.VueLifecycle]: '生命周期',
      [FrontendSymbolKind.VueDirective]: '指令',
      [FrontendSymbolKind.VueSlot]: '插槽',
      [FrontendSymbolKind.VueEmit]: '事件触发',
      [FrontendSymbolKind.VueProps]: '属性',

      // React
      [FrontendSymbolKind.ReactComponent]: 'React 组件',
      [FrontendSymbolKind.ReactHook]: 'React Hook',
      [FrontendSymbolKind.ReactCustomHook]: '自定义 Hook',
      [FrontendSymbolKind.ReactState]: '状态',
      [FrontendSymbolKind.ReactEffect]: '副作用',
      [FrontendSymbolKind.ReactCallback]: '回调',
      [FrontendSymbolKind.ReactMemo]: '记忆化',
      [FrontendSymbolKind.ReactProps]: '属性',
      [FrontendSymbolKind.ReactContext]: '上下文',

      // 通用
      [FrontendSymbolKind.EventHandler]: '事件处理',
      [FrontendSymbolKind.ApiCall]: 'API 调用',
      [FrontendSymbolKind.StateManager]: '状态管理',
      [FrontendSymbolKind.Router]: '路由',
      [FrontendSymbolKind.Middleware]: '中间件',
      [FrontendSymbolKind.Validator]: '验证器',
      [FrontendSymbolKind.Utility]: '工具函数',
      [FrontendSymbolKind.Style]: '样式',
      [FrontendSymbolKind.Asset]: '资源',

      // 函数类型
      [FrontendSymbolKind.ArrowFunction]: '箭头函数',
      [FrontendSymbolKind.AsyncFunction]: '异步函数',
      [FrontendSymbolKind.GeneratorFunction]: '生成器函数',

      // DOM
      [FrontendSymbolKind.HTMLElement]: 'HTML 元素',
      [FrontendSymbolKind.CSSRule]: 'CSS 规则',
      [FrontendSymbolKind.CSSSelector]: 'CSS 选择器',
    }

    return nameMap[kind] || '符号'
  }

  /**
   * 构建符号的详细提示信息
   */
  private buildTooltip(symbol: FrontendSymbolInfo): string {
    const lines: string[] = []

    // 基本信息
    lines.push(`📋 ${symbol.name}`)
    lines.push(`🔧 ${this.getKindDisplayName(symbol.frontendKind)}`)
    lines.push(`📍 第 ${symbol.range.start.line + 1} 行`)

    // 优先级
    const priorityName = this.getPriorityName(symbol.priority)
    lines.push(`⭐ 优先级: ${priorityName}`)

    // 框架信息
    if (symbol.framework !== FrameworkType.General) {
      lines.push(`⚛️ 框架: ${symbol.framework.toUpperCase()}`)
    }

    // 属性标记
    const attributes: string[] = []
    if (symbol.isAsync)
      attributes.push('异步')
    if (symbol.isPrivate)
      attributes.push('私有')
    if (symbol.isExported)
      attributes.push('导出')
    if (attributes.length > 0) {
      lines.push(`🏷️ 属性: ${attributes.join(', ')}`)
    }

    // 使用情况
    if (symbol.context.usedInTemplate) {
      lines.push('🎯 在模板中使用')
    }
    if (symbol.context.usedInEvents) {
      lines.push('🎪 在事件中使用')
    }
    if (symbol.context.referenceCount > 0) {
      lines.push(`🔗 被引用 ${symbol.context.referenceCount} 次`)
    }

    // 标签
    if (symbol.tags.length > 0) {
      lines.push(`🏷️ 标签: ${symbol.tags.join(', ')}`)
    }

    // 签名
    if (symbol.signature) {
      lines.push('')
      lines.push(`📝 ${symbol.signature}`)
    }

    // 参数
    if (symbol.parameters && symbol.parameters.length > 0) {
      lines.push(`📥 参数: ${symbol.parameters.join(', ')}`)
    }

    // 返回类型
    if (symbol.returnType) {
      lines.push(`📤 返回: ${symbol.returnType}`)
    }

    // 复杂度
    const complexityName = this.getComplexityName(symbol.complexity)
    lines.push(`📊 复杂度: ${complexityName}`)

    // 子符号数量
    if (symbol.children.length > 0) {
      lines.push(`📂 包含 ${symbol.children.length} 个子符号`)
    }

    return lines.join('\n')
  }

  /**
   * 获取优先级名称
   */
  private getPriorityName(priority: SymbolPriority): string {
    switch (priority) {
      case SymbolPriority.Critical: return '极高'
      case SymbolPriority.High: return '高'
      case SymbolPriority.Medium: return '中'
      case SymbolPriority.Low: return '低'
      case SymbolPriority.Minimal: return '极低'
      default: return '未知'
    }
  }

  /**
   * 获取复杂度名称
   */
  private getComplexityName(complexity: number): string {
    switch (complexity) {
      case 1: return '简单'
      case 2: return '中等'
      case 3: return '复杂'
      case 4: return '很复杂'
      default: return '未知'
    }
  }
}
