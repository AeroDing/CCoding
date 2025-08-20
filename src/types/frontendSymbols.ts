import type * as vscode from 'vscode'

/**
 * 前端框架类型
 */
export enum FrameworkType {
  Vue = 'vue',
  React = 'react',
  Angular = 'angular',
  Svelte = 'svelte',
  General = 'general',
}

/**
 * 前端特定的符号类型
 */
export enum FrontendSymbolKind {
  // Vue 特有
  VueComponent = 'vue-component',
  VueComposable = 'vue-composable',
  VueRef = 'vue-ref',
  VueReactive = 'vue-reactive',
  VueComputed = 'vue-computed',
  VueWatch = 'vue-watch',
  VueLifecycle = 'vue-lifecycle',
  VueDirective = 'vue-directive',
  VueSlot = 'vue-slot',
  VueEmit = 'vue-emit',
  VueProps = 'vue-props',

  // React 特有
  ReactComponent = 'react-component',
  ReactHook = 'react-hook',
  ReactCustomHook = 'react-custom-hook',
  ReactState = 'react-state',
  ReactEffect = 'react-effect',
  ReactCallback = 'react-callback',
  ReactMemo = 'react-memo',
  ReactProps = 'react-props',
  ReactContext = 'react-context',

  // 通用前端概念
  EventHandler = 'event-handler',
  ApiCall = 'api-call',
  StateManager = 'state-manager',
  Router = 'router',
  Middleware = 'middleware',
  Validator = 'validator',
  Utility = 'utility',
  Style = 'style',
  Asset = 'asset',

  // 函数类型
  ArrowFunction = 'arrow-function',
  AsyncFunction = 'async-function',
  GeneratorFunction = 'generator-function',

  // DOM 相关
  HTMLElement = 'html-element',
  CSSRule = 'css-rule',
  CSSSelector = 'css-selector',
}

/**
 * 符号重要程度
 */
export enum SymbolPriority {
  Critical = 5, // 组件定义、主要API
  High = 4, // Hooks、生命周期、重要方法
  Medium = 3, // 普通方法、工具函数
  Low = 2, // getter/setter、辅助函数
  Minimal = 1, // 变量、常量、样式
}

/**
 * 符号使用上下文
 */
export interface SymbolContext {
  // 在模板中是否被使用
  usedInTemplate: boolean
  // 在事件处理中是否被使用
  usedInEvents: boolean
  // 被其他符号引用的次数
  referenceCount: number
  // 最后使用时间
  lastUsed?: Date
  // 使用频率（每天使用次数）
  usageFrequency: number
}

/**
 * 前端增强符号信息
 */
export interface FrontendSymbolInfo {
  id: string
  name: string
  kind: vscode.SymbolKind
  frontendKind: FrontendSymbolKind
  framework: FrameworkType
  priority: SymbolPriority
  range: vscode.Range
  uri: vscode.Uri
  level: number
  parent?: FrontendSymbolInfo
  children: FrontendSymbolInfo[]

  // 基本信息
  signature?: string
  parameters?: string[]
  returnType?: string
  isAsync: boolean
  isPrivate: boolean
  isExported: boolean

  // 前端特定信息
  context: SymbolContext
  category: string // 'component' | 'hook' | 'event' | 'utility' | 'style'
  tags: string[] // 标签，如 ['important', 'api', 'state-management']
  relatedFiles: string[] // 相关文件路径

  // 框架特定属性
  vueInfo?: VueSymbolInfo
  reactInfo?: ReactSymbolInfo

  // 元数据
  complexity: number
  timestamp: number
  description?: string
  todo?: string[] // 与此符号相关的TODO项
}

/**
 * Vue 特定符号信息
 */
export interface VueSymbolInfo {
  // Composition API
  isCompositionAPI: boolean
  setupFunction?: boolean

  // 响应式数据
  reactiveType?: 'ref' | 'reactive' | 'computed' | 'readonly'
  watchTarget?: string[] // watch 监听的变量

  // 生命周期
  lifecyclePhase?: 'setup' | 'mounted' | 'updated' | 'unmounted'

  // 组件相关
  componentType?: 'page' | 'component' | 'layout' | 'widget'
  props?: string[]
  emits?: string[]
  slots?: string[]

  // 模板使用情况
  usedInTemplate: boolean
  templateBindings: string[] // 在模板中的绑定方式
}

/**
 * React 特定符号信息
 */
export interface ReactSymbolInfo {
  // 组件类型
  componentType?: 'functional' | 'class' | 'memo' | 'forwardRef'

  // Hooks 相关
  hookType?: 'useState' | 'useEffect' | 'useCallback' | 'useMemo' | 'useRef' | 'useContext' | 'custom'
  hookDependencies?: string[] // Hook 依赖项

  // State 相关
  stateVariables?: string[]
  stateSetters?: string[]

  // Effect 相关
  effectType?: 'mount' | 'update' | 'cleanup' | 'conditional'
  effectCleanup?: boolean

  // Props 相关
  propsType?: string
  defaultProps?: Record<string, any>

  // Context 相关
  contextProvider?: boolean
  contextConsumer?: boolean
}

/**
 * 符号分组配置
 */
export interface SymbolGroupConfig {
  framework: FrameworkType
  groups: SymbolGroup[]
}

/**
 * 符号分组定义
 */
export interface SymbolGroup {
  id: string
  name: string
  icon: string
  color: string
  priority: number
  defaultExpanded: boolean
  filter: (symbol: FrontendSymbolInfo) => boolean
  sorter?: (a: FrontendSymbolInfo, b: FrontendSymbolInfo) => number
}

/**
 * 快速过滤器配置
 */
export interface QuickFilter {
  id: string
  name: string
  icon: string
  tooltip: string
  filter: (symbol: FrontendSymbolInfo) => boolean
  hotkey?: string
}

/**
 * 智能推荐配置
 */
export interface RecommendationConfig {
  // 基于使用频率的权重
  usageWeight: number
  // 基于最近使用的权重
  recencyWeight: number
  // 基于符号重要性的权重
  priorityWeight: number
  // 基于上下文相关性的权重
  contextWeight: number
  // 推荐数量限制
  maxRecommendations: number
}
