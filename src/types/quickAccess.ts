import type * as vscode from 'vscode'

/**
 * 快速访问项类型
 */
export enum QuickAccessItemType {
  // 符号相关
  Symbol = 'symbol',
  PinnedSymbol = 'pinned-symbol',
  Bookmark = 'bookmark',

  // 文件相关
  RecentFile = 'recent-file',
  FrequentFile = 'frequent-file',
  RelatedFile = 'related-file',

  // 功能相关
  Command = 'command',
  Search = 'search',
  Navigation = 'navigation',

  // 项目相关
  Project = 'project',
  Workspace = 'workspace',

  // 智能推荐
  Suggestion = 'suggestion',
  SmartAction = 'smart-action',
}

/**
 * 快速访问项
 */
export interface QuickAccessItem {
  id: string
  type: QuickAccessItemType
  title: string
  description?: string
  detail?: string

  // 显示信息
  icon: string
  iconColor?: string
  badge?: string
  tooltip?: string

  // 行为
  command: string
  args?: any[]

  // 优先级和排序
  priority: number
  score: number
  confidence?: number

  // 上下文信息
  category: string
  tags: string[]
  uri?: vscode.Uri
  range?: vscode.Range

  // 统计信息
  accessCount: number
  lastAccessed: Date
  timeSaved: number

  // 可见性
  isVisible: boolean
  showInQuickPick: boolean
  showInHover: boolean
  showInStatusBar: boolean

  // 键盘快捷键
  hotkey?: string
  hotkeyIndex?: number

  // 元数据
  metadata: Record<string, any>
}

/**
 * 快速访问分组
 */
export interface QuickAccessGroup {
  id: string
  name: string
  icon: string
  description?: string

  // 显示配置
  defaultExpanded: boolean
  maxItems: number
  showCount: boolean

  // 过滤规则
  filter: (item: QuickAccessItem) => boolean
  sorter: (a: QuickAccessItem, b: QuickAccessItem) => number

  // 快捷键
  hotkey?: string

  // 样式
  color?: string
  priority: number
}

/**
 * 悬浮工具栏配置
 */
export interface FloatingToolbarConfig {
  // 显示设置
  enabled: boolean
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  autoHide: boolean
  autoHideDelay: number

  // 触发条件
  showOnHover: boolean
  showOnFocus: boolean
  showOnSelection: boolean
  showOnEdit: boolean

  // 内容配置
  maxButtons: number
  showLabels: boolean
  showTooltips: boolean
  showBadges: boolean

  // 交互设置
  enableDrag: boolean
  enableResize: boolean
  rememberPosition: boolean

  // 样式
  theme: 'light' | 'dark' | 'auto'
  opacity: number
  borderRadius: number

  // 动画
  fadeInDuration: number
  fadeOutDuration: number
  slideAnimation: boolean
}

/**
 * 状态栏配置
 */
export interface StatusBarConfig {
  // 显示内容
  showPinnedCount: boolean
  showBookmarkCount: boolean
  showCurrentSymbol: boolean
  showProjectInfo: boolean
  showQuickActions: boolean

  // 交互
  enableClick: boolean
  enableHover: boolean
  clickAction: 'quick-pick' | 'panel' | 'command'

  // 样式
  priority: number
  alignment: vscode.StatusBarAlignment
  color?: string
  backgroundColor?: string

  // 文本格式
  textFormat: string
  separator: string
  maxLength: number
}

/**
 * 快速访问上下文
 */
export interface QuickAccessContext {
  // 当前状态
  activeEditor?: vscode.TextEditor
  activeDocument?: vscode.TextDocument
  cursorPosition?: vscode.Position
  selection?: vscode.Selection

  // 项目信息
  workspaceFolder?: vscode.WorkspaceFolder
  relativePath?: string
  framework?: string

  // 用户行为
  lastAction?: string
  lastAccessedFile?: string
  lastAccessedSymbol?: string

  // 时间信息
  timestamp: number
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  dayOfWeek: number

  // 统计信息
  sessionDuration: number
  actionsInSession: number
  filesOpenedInSession: number
}

/**
 * 智能建议配置
 */
export interface SmartSuggestionConfig {
  // 启用设置
  enabled: boolean
  enableFilesSuggestions: boolean
  enableSymbolSuggestions: boolean
  enableActionSuggestions: boolean

  // 算法配置
  usageWeight: number
  recencyWeight: number
  contextWeight: number
  patternWeight: number

  // 阈值设置
  minConfidence: number
  maxSuggestions: number

  // 学习设置
  enableLearning: boolean
  learningPeriod: number
  adaptToUserPatterns: boolean

  // 隐私设置
  enableTelemetry: boolean
  shareAnonymousData: boolean
}

/**
 * 面板配置
 */
export interface QuickAccessPanelConfig {
  // 布局
  layout: 'vertical' | 'horizontal' | 'grid'
  columns: number
  itemHeight: number

  // 搜索
  enableSearch: boolean
  fuzzySearch: boolean
  searchPlaceholder: string

  // 过滤
  enableFilters: boolean
  defaultFilters: string[]
  customFilters: Array<{
    id: string
    name: string
    filter: (item: QuickAccessItem) => boolean
  }>

  // 分组
  enableGrouping: boolean
  defaultGroupBy: 'type' | 'category' | 'priority' | 'recent'

  // 预览
  enablePreview: boolean
  previewPosition: 'right' | 'bottom'
  previewSize: number

  // 键盘导航
  enableKeyboardNavigation: boolean
  keyboardShortcuts: Record<string, string>

  // 持久化
  rememberSize: boolean
  rememberFilters: boolean
  rememberGrouping: boolean
}

/**
 * 快速访问事件
 */
export interface QuickAccessEvent {
  type: 'item-accessed' | 'item-added' | 'item-removed' | 'search' | 'filter' | 'group-changed'
  item?: QuickAccessItem
  query?: string
  filter?: string
  group?: string
  timestamp: Date
  context: QuickAccessContext
  metadata?: Record<string, any>
}

/**
 * 快速访问统计
 */
export interface QuickAccessStatistics {
  // 使用统计
  totalAccesses: number
  uniqueItems: number
  averageAccessTime: number

  // 项目统计
  byType: Record<QuickAccessItemType, number>
  byCategory: Record<string, number>

  // 时间统计
  accessByHour: number[]
  accessByDay: number[]
  accessTrend: Array<{ date: string, count: number }>

  // 效率指标
  timeSaved: number
  clicksSaved: number
  averageSearchTime: number

  // 最受欢迎的项目
  mostAccessed: QuickAccessItem[]
  recentlyAdded: QuickAccessItem[]
  trending: QuickAccessItem[]

  // 搜索统计
  searchQueries: Array<{ query: string, count: number }>
  searchSuccessRate: number
  averageResultsCount: number

  // 用户行为
  preferredAccessMethod: 'keyboard' | 'mouse' | 'touch'
  averageSessionDuration: number
  itemsPerSession: number
}

/**
 * 快速访问主题
 */
export interface QuickAccessTheme {
  name: string

  // 颜色
  backgroundColor: string
  foregroundColor: string
  borderColor: string
  hoverColor: string
  activeColor: string

  // 图标
  iconColor: string
  badgeColor: string
  badgeBackgroundColor: string

  // 字体
  fontSize: number
  fontFamily: string
  fontWeight: 'normal' | 'bold'

  // 间距
  padding: number
  margin: number
  itemSpacing: number

  // 阴影和边框
  boxShadow: string
  borderRadius: number
  borderWidth: number

  // 动画
  transitionDuration: number
  hoverScale: number
}

/**
 * 快速访问快捷键配置
 */
export interface QuickAccessHotkeys {
  // 全局快捷键
  openQuickAccess: string
  openFloatingToolbar: string
  togglePanel: string

  // 导航快捷键
  nextItem: string
  prevItem: string
  firstItem: string
  lastItem: string

  // 搜索快捷键
  focusSearch: string
  clearSearch: string

  // 过滤快捷键
  showAll: string
  showSymbols: string
  showBookmarks: string
  showFiles: string

  // 数字快捷键（1-9）
  accessByNumber: boolean
  numberKeyPrefix?: string

  // 功能快捷键
  addCurrentItem: string
  removeItem: string
  toggleFavorite: string

  // 面板控制
  togglePreview: string
  toggleGrouping: string
  cycleLayout: string
}
