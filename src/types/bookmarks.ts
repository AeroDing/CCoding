import type * as vscode from 'vscode'
import type { FrameworkType } from './frontendSymbols'

/**
 * 书签类型
 */
export enum BookmarkType {
  Component = 'component',
  Function = 'function',
  Hook = 'hook',
  Event = 'event',
  API = 'api',
  Route = 'route',
  State = 'state',
  Style = 'style',
  Config = 'config',
  Documentation = 'documentation',
  Bug = 'bug',
  Todo = 'todo',
  Important = 'important',
  General = 'general',
}

/**
 * 书签优先级
 */
export enum BookmarkPriority {
  Critical = 5, // 极重要（关键组件、核心API）
  High = 4, // 重要（常用功能、重要方法）
  Medium = 3, // 中等（一般功能）
  Low = 2, // 较低（辅助功能）
  Minimal = 1, // 最低（临时标记）
}

/**
 * 书签使用统计
 */
export interface BookmarkUsageStats {
  accessCount: number
  lastAccessed: Date
  createdAt: Date
  averageSessionTime: number // 平均查看时间（秒）
  daysSinceLastAccess: number
  accessFrequency: number // 每天访问次数
  isRecent: boolean // 是否为最近使用
  isFavorite: boolean // 是否为收藏
}

/**
 * 智能书签建议
 */
export interface BookmarkSuggestion {
  uri: vscode.Uri
  range: vscode.Range
  reason: string
  confidence: number // 置信度 0-1
  suggestedType: BookmarkType
  suggestedTags: string[]
  relatedBookmarks: string[] // 相关书签ID
}

/**
 * 增强的书签接口
 */
export interface EnhancedBookmark {
  id: string
  label: string
  description?: string
  uri: vscode.Uri
  range: vscode.Range

  // 分类和标签
  type: BookmarkType
  priority: BookmarkPriority
  tags: string[]
  category: string

  // 项目和框架信息
  framework: FrameworkType
  projectPath: string
  relativePath: string

  // 代码相关信息
  symbolName?: string
  symbolType?: string
  codePreview: string // 代码片段预览
  lineNumber: number

  // 使用统计
  stats: BookmarkUsageStats

  // 关联信息
  relatedFiles: string[] // 相关文件路径
  relatedBookmarks: string[] // 相关书签ID
  parentBookmark?: string // 父书签ID（用于分组）
  childBookmarks: string[] // 子书签ID

  // 协作和同步
  isShared: boolean // 是否与团队共享
  author?: string // 创建者
  comments: BookmarkComment[] // 评论和注释

  // 状态
  isTemporary: boolean // 是否为临时书签
  isArchived: boolean // 是否已归档
  expiresAt?: Date // 过期时间（临时书签）

  // 元数据
  timestamp: number
  version: number // 版本号，用于冲突解决
  lastModified: Date
}

/**
 * 书签评论
 */
export interface BookmarkComment {
  id: string
  author: string
  content: string
  timestamp: Date
  isResolved: boolean
}

/**
 * 书签分组配置
 */
export interface BookmarkGroup {
  id: string
  name: string
  icon: string
  color: string
  description?: string
  filter: (bookmark: EnhancedBookmark) => boolean
  sorter?: (a: EnhancedBookmark, b: EnhancedBookmark) => number
  defaultExpanded: boolean
  maxItems?: number // 最大显示项目数
}

/**
 * 书签视图模式
 */
export enum BookmarkViewMode {
  ByFile = 'by-file', // 按文件分组
  ByType = 'by-type', // 按类型分组
  ByPriority = 'by-priority', // 按优先级分组
  ByProject = 'by-project', // 按项目分组
  ByFramework = 'by-framework', // 按框架分组
  ByDate = 'by-date', // 按日期分组
  ByUsage = 'by-usage', // 按使用频率分组
  Recent = 'recent', // 最近使用
  Favorites = 'favorites', // 收藏夹
  Temporary = 'temporary', // 临时书签
  Shared = 'shared', // 共享书签
}

/**
 * 书签搜索过滤器
 */
export interface BookmarkFilter {
  query?: string
  types?: BookmarkType[]
  priorities?: BookmarkPriority[]
  tags?: string[]
  frameworks?: FrameworkType[]
  dateRange?: {
    start: Date
    end: Date
  }
  usageThreshold?: number // 最小使用次数
  isRecent?: boolean
  isFavorite?: boolean
  isShared?: boolean
  isTemporary?: boolean
  hasComments?: boolean
}

/**
 * 书签导入导出格式
 */
export interface BookmarkExportData {
  version: string
  exportDate: Date
  projectName?: string
  bookmarks: EnhancedBookmark[]
  groups?: BookmarkGroup[]
  metadata: {
    totalBookmarks: number
    framework: FrameworkType
    exportReason: string
    author?: string
  }
}

/**
 * 书签同步配置
 */
export interface BookmarkSyncConfig {
  enabled: boolean
  provider: 'github' | 'gitlab' | 'file' | 'custom'
  repository?: string
  branch?: string
  filePath?: string
  autoSync: boolean
  syncInterval: number // 分钟
  conflictResolution: 'manual' | 'auto-merge' | 'overwrite'
}

/**
 * 书签统计信息
 */
export interface BookmarkStatistics {
  total: number
  byType: Record<BookmarkType, number>
  byPriority: Record<BookmarkPriority, number>
  byFramework: Record<FrameworkType, number>
  totalAccesses: number
  averageAccessesPerBookmark: number
  mostUsedBookmarks: EnhancedBookmark[]
  recentlyAddedBookmarks: EnhancedBookmark[]
  oldestBookmarks: EnhancedBookmark[]
  largestGroups: Array<{ name: string, count: number }>
  healthScore: number // 书签健康度评分 0-100
}

/**
 * 书签健康检查结果
 */
export interface BookmarkHealthCheck {
  totalChecked: number
  validBookmarks: number
  invalidBookmarks: number
  outdatedBookmarks: number
  unusedBookmarks: number
  duplicateBookmarks: number
  orphanedBookmarks: number
  issues: BookmarkIssue[]
  recommendations: string[]
}

/**
 * 书签问题
 */
export interface BookmarkIssue {
  bookmarkId: string
  type: 'invalid-path' | 'file-not-found' | 'outdated' | 'unused' | 'duplicate' | 'orphaned'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  suggestedAction: string
  autoFixable: boolean
}

/**
 * 智能推荐配置
 */
export interface BookmarkRecommendationConfig {
  enabled: boolean

  // 推荐触发条件
  suggestOnFileOpen: boolean
  suggestOnSymbolHover: boolean
  suggestOnEdit: boolean
  suggestOnNavigation: boolean

  // 推荐算法权重
  usagePatternWeight: number // 使用模式权重
  codeStructureWeight: number // 代码结构权重
  projectPatternWeight: number // 项目模式权重
  teamPatternWeight: number // 团队模式权重

  // 推荐阈值
  minConfidence: number // 最小置信度
  maxSuggestions: number // 最大推荐数量
  cooldownPeriod: number // 冷却期（分钟）
}

/**
 * 书签操作历史
 */
export interface BookmarkOperation {
  id: string
  type: 'create' | 'update' | 'delete' | 'access' | 'share' | 'export' | 'import'
  bookmarkId: string
  timestamp: Date
  author?: string
  details: Record<string, any>
  undoable: boolean
}
