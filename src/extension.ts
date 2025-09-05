import * as vscode from 'vscode'
import { BookmarkProvider } from './providers/bookmarkProvider.js'
import { CurrentFileNavProvider } from './providers/currentFileNavProvider.js'
import { DataAdapter } from './providers/dataAdapter.js'
import { FunctionListProvider } from './providers/functionListProvider.js'
import { GlobalBookmarksProvider } from './providers/globalBookmarksProvider.js'
import { GlobalTodosProvider } from './providers/globalTodosProvider.js'
import { QuickAccessProvider } from './providers/quickAccessProvider.js'
import { TimelineProvider } from './providers/timelineProvider.js'
import { TodoProvider } from './providers/todoProvider.js'
import { SearchType } from './services/unifiedSearchService.js'

// 全局状态管理
let documentChangeTimeout: NodeJS.Timeout | undefined

export function activate(context: vscode.ExtensionContext) {
  console.log('CCoding is now active!')

  try {
    // 创建传统Provider实例（保持向后兼容）
    const functionListProvider = new FunctionListProvider()
    const bookmarkProvider = new BookmarkProvider(context)
    const todoProvider = new TodoProvider()
    const timelineProvider = new TimelineProvider()

    // 创建数据适配器
    const dataAdapter = new DataAdapter(
      functionListProvider,
      bookmarkProvider,
      todoProvider,
      context,
    )

    // 创建新的5个专业化视图Provider
    const currentFileNavProvider = new CurrentFileNavProvider(
      context.extensionUri,
      dataAdapter,
      (item) => {
        // 处理当前文件导航的项目点击
        try {
          if (!item.uriString || !item.simpleRange) {
            console.error('[CCoding] 项目缺少必要的跳转信息:', item)
            vscode.window.showErrorMessage(`跳转失败: 项目缺少位置信息`)
            return
          }

          console.log('[CCoding] 当前文件导航点击:', item.label, item.uriString)
          const uri = vscode.Uri.parse(item.uriString)
          const range = new vscode.Range(
            new vscode.Position(item.simpleRange.startLine, item.simpleRange.startCharacter),
            new vscode.Position(item.simpleRange.endLine, item.simpleRange.endCharacter),
          )

          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(range.start, range.start),
            preserveFocus: false,
          })
        }
        catch (error) {
          console.error('[CCoding] 当前文件导航跳转失败:', error)
          vscode.window.showErrorMessage(`跳转失败: ${error}`)
        }
      },
      (item) => {
        // 处理置顶切换
        console.log(`[CCoding] 切换置顶状态: ${item.label}`)
        // TODO: 实现置顶逻辑
      },
    )

    const globalBookmarksProvider = new GlobalBookmarksProvider(context, bookmarkProvider)
    const globalTodosProvider = new GlobalTodosProvider()
    const quickAccessProvider = new QuickAccessProvider(context, timelineProvider)

    // 注册视图
    context.subscriptions.push(
      // 1. 当前文件导航 WebView
      vscode.window.registerWebviewViewProvider(
        CurrentFileNavProvider.viewType,
        currentFileNavProvider,
      ),

      // 2. 全局书签管理 TreeView
      vscode.window.createTreeView('CCoding.globalBookmarks', {
        treeDataProvider: globalBookmarksProvider,
        showCollapseAll: true,
        canSelectMany: false,
      }),

      // 3. 全局待办事项 TreeView
      vscode.window.createTreeView('CCoding.globalTodos', {
        treeDataProvider: globalTodosProvider,
        showCollapseAll: true,
        canSelectMany: false,
      }),

      // 4. 快速访问面板 TreeView
      vscode.window.createTreeView('CCoding.quickAccess', {
        treeDataProvider: quickAccessProvider,
        showCollapseAll: true,
        canSelectMany: false,
      }),
    )

    // 数据刷新函数
    async function refreshCurrentFileNav() {
      try {
        console.log('[CCoding] 刷新当前文件导航...')
        await currentFileNavProvider.refresh()
        console.log('[CCoding] 当前文件导航刷新完成')
      }
      catch (error) {
        console.error('[CCoding] 当前文件导航刷新失败:', error)
      }
    }

    // TODO装饰器初始化（延迟执行）
    const initializeTodoDecorations = () => {
      console.log('[CCoding] 初始化TODO装饰器')
      todoProvider.initializeDecorations()
    }

    // 初始化逻辑
    if (vscode.window.activeTextEditor) {
      // 延迟初始化，确保编辑器完全加载
      setTimeout(() => {
        console.log('[CCoding] 延迟初始化开始...')
        initializeTodoDecorations()
        // 再次延迟以确保TODO装饰器完全初始化
        setTimeout(() => {
          refreshCurrentFileNav()
          globalBookmarksProvider.refresh()
          globalTodosProvider.refresh()
          quickAccessProvider.refresh()
        }, 500)
      }, 1000)
    }
    else {
      console.log('[CCoding] 没有活动编辑器，等待编辑器激活...')
      const disposableInit = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          console.log('[CCoding] 编辑器激活，开始初始化...')
          initializeTodoDecorations()
          setTimeout(() => {
            refreshCurrentFileNav()
            globalBookmarksProvider.refresh()
            globalTodosProvider.refresh()
            quickAccessProvider.refresh()
          }, 500)
          disposableInit.dispose()
        }
      })
      context.subscriptions.push(disposableInit)
    }

    // 视图注册后立即刷新数据
    setTimeout(() => {
      console.log('[CCoding] 视图注册后刷新数据')
      refreshCurrentFileNav()
      globalBookmarksProvider.refresh()
      globalTodosProvider.refresh()
      quickAccessProvider.refresh()
    }, 100)

    const disposables = [
      // 传统命令（保持兼容）
      vscode.commands.registerCommand('CCoding.showFunctionList', () => {
        functionListProvider.refresh()
      }),

      // 统一搜索命令
      vscode.commands.registerCommand('CCoding.unifiedSearch', async () => {
        const query = await vscode.window.showInputBox({
          prompt: '统一搜索',
          placeHolder: '搜索文件、符号、TODO、书签...',
        })
        if (query !== undefined && query.trim()) {
          await quickAccessProvider.performKeywordSearch(query.trim())
        }
      }),

      vscode.commands.registerCommand('CCoding.selectSearchType', async () => {
        const searchTypes = [
          { label: '🔍 全部', description: '搜索所有类型', value: SearchType.ALL },
          { label: '📁 文件', description: '仅搜索文件名', value: SearchType.FILES },
          { label: '🎯 符号', description: '仅搜索代码符号', value: SearchType.SYMBOLS },
          { label: '📝 待办', description: '仅搜索TODO项目', value: SearchType.TODOS },
          { label: '📖 书签', description: '仅搜索书签', value: SearchType.BOOKMARKS },
        ]

        const selected = await vscode.window.showQuickPick(searchTypes, {
          placeHolder: '选择搜索类型',
          matchOnDescription: true,
        })

        if (selected) {
          quickAccessProvider.setSearchType(selected.value)
          vscode.window.showInformationMessage(`已切换到 ${selected.label} 搜索模式`)
        }
      }),

      vscode.commands.registerCommand('CCoding.addBookmark', () => {
        bookmarkProvider.addBookmark()
      }),

      vscode.commands.registerCommand('CCoding.showBookmarks', () => {
        bookmarkProvider.refresh()
      }),

      vscode.commands.registerCommand('CCoding.quickJump', () => {
        showQuickJumpPicker()
      }),

      vscode.commands.registerCommand('CCoding.showTodos', () => {
        todoProvider.forceRefresh()
      }),

      vscode.commands.registerCommand('CCoding.showTimeline', () => {
        timelineProvider.showTimeline()
      }),

      vscode.commands.registerCommand('CCoding.addBookmarkFromContext', (uri: vscode.Uri) => {
        bookmarkProvider.addBookmarkFromContext(uri)
      }),

      vscode.commands.registerCommand('CCoding.addBookmarkFromEditor', () => {
        bookmarkProvider.addBookmarkFromEditor()
      }),

      vscode.commands.registerCommand('CCoding.editBookmark', (item: any) => {
        const bookmarkId = item.bookmark?.id || (item.unifiedItem?.id.startsWith('bookmark-') ? item.unifiedItem.id.replace('bookmark-', '') : null)
        if (bookmarkId) {
          bookmarkProvider.editBookmark(bookmarkId)
        }
      }),

      vscode.commands.registerCommand('CCoding.removeBookmark', (item: any) => {
        const bookmarkId = item.bookmark?.id || (item.unifiedItem?.id.startsWith('bookmark-') ? item.unifiedItem.id.replace('bookmark-', '') : null)
        if (bookmarkId) {
          bookmarkProvider.removeBookmark(bookmarkId)
        }
      }),

      // 新视图刷新命令
      vscode.commands.registerCommand('CCoding.refreshCurrentFileNav', () => {
        console.log('[CCoding] 手动刷新当前文件导航')
        refreshCurrentFileNav()
      }),

      vscode.commands.registerCommand('CCoding.refreshGlobalBookmarks', () => {
        console.log('[CCoding] 手动刷新全局书签')
        globalBookmarksProvider.refresh()
      }),

      // 全局书签搜索命令
      vscode.commands.registerCommand('CCoding.searchGlobalBookmarks', async () => {
        const query = await vscode.window.showInputBox({
          prompt: '搜索全局书签',
          placeHolder: '输入关键词搜索书签标签或文件路径...',
        })
        if (query !== undefined) {
          globalBookmarksProvider.search(query)
        }
      }),

      vscode.commands.registerCommand('CCoding.clearGlobalBookmarksSearch', () => {
        globalBookmarksProvider.clearSearch()
        vscode.window.showInformationMessage('已清除书签搜索条件')
      }),

      vscode.commands.registerCommand('CCoding.changeGlobalBookmarksGroupBy', async () => {
        const groupOptions = [
          { label: '📁 按文件分组', description: '按文件路径分组显示', value: 'file' },
          { label: '🏷️ 按类型分组', description: '按书签类型分组显示', value: 'type' },
          { label: '🕐 按时间分组', description: '按创建时间分组显示', value: 'time' },
        ]

        const selected = await vscode.window.showQuickPick(groupOptions, {
          placeHolder: '选择分组方式',
          matchOnDescription: true,
        })

        if (selected) {
          globalBookmarksProvider.setGroupBy(selected.value as 'file' | 'type' | 'time')
          vscode.window.showInformationMessage(`已切换到${selected.label}`)
        }
      }),

      vscode.commands.registerCommand('CCoding.refreshGlobalTodos', () => {
        console.log('[CCoding] 手动刷新全局待办')
        globalTodosProvider.refresh()
      }),

      // 全局待办事项搜索命令
      vscode.commands.registerCommand('CCoding.searchGlobalTodos', async () => {
        const query = await vscode.window.showInputBox({
          prompt: '搜索全局待办事项',
          placeHolder: '输入关键词搜索 TODO、FIXME、NOTE 等...',
        })
        if (query !== undefined) {
          globalTodosProvider.search(query)
        }
      }),

      vscode.commands.registerCommand('CCoding.clearGlobalTodosSearch', () => {
        globalTodosProvider.clearSearch()
        vscode.window.showInformationMessage('已清除搜索条件')
      }),

      vscode.commands.registerCommand('CCoding.changeGlobalTodosGroupBy', async () => {
        const groupOptions = [
          { label: '📁 按文件分组', description: '按文件路径分组显示', value: 'file' },
          { label: '🏷️ 按类型分组', description: '按 TODO 类型分组显示', value: 'type' },
          { label: '🎯 按优先级分组', description: '按优先级分组显示', value: 'priority' },
        ]

        const selected = await vscode.window.showQuickPick(groupOptions, {
          placeHolder: '选择分组方式',
          matchOnDescription: true,
        })

        if (selected) {
          globalTodosProvider.setGroupBy(selected.value as 'file' | 'type' | 'priority')
          vscode.window.showInformationMessage(`已切换到${selected.label}`)
        }
      }),

      vscode.commands.registerCommand('CCoding.refreshQuickAccess', () => {
        console.log('[CCoding] 手动刷新快速访问')
        quickAccessProvider.refresh()
      }),

      vscode.commands.registerCommand('CCoding.repairData', async () => {
        const choice = await vscode.window.showInformationMessage(
          '数据修复工具将清理可能损坏的书签和置顶符号数据。这将不会删除有效数据，但会移除损坏的条目。是否继续？',
          '继续修复',
          '取消',
        )

        if (choice === '继续修复') {
          try {
            // 强制重新加载并修复数据
            const bookmarkFixedCount = await repairBookmarkData(context, bookmarkProvider)

            vscode.window.showInformationMessage(
              `数据修复完成！修复了 ${bookmarkFixedCount} 个书签数据。`,
            )
          }
          catch (error) {
            vscode.window.showErrorMessage(`数据修复失败：${error}`)
          }
        }
      }),

      // 事件监听器
      vscode.window.onDidChangeActiveTextEditor(() => {
        console.log('[CCoding] 编辑器切换，刷新当前文件导航')
        refreshCurrentFileNav()
      }),

      // 文档变更监听（防抖处理）
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.reason === vscode.TextDocumentChangeReason.Undo
          || event.reason === vscode.TextDocumentChangeReason.Redo) {
          return
        }

        if (documentChangeTimeout) {
          clearTimeout(documentChangeTimeout)
        }
        documentChangeTimeout = setTimeout(() => {
          console.log('[CCoding] 文档变更，刷新当前文件导航和全局待办')
          refreshCurrentFileNav()
          globalTodosProvider.refresh()
        }, 500) // 从1000ms减少到500ms，提升响应速度
      }),

      vscode.workspace.onDidSaveTextDocument(() => {
        console.log('[CCoding] 文档保存，刷新相关视图')
        refreshCurrentFileNav()
        globalTodosProvider.refresh()
        globalBookmarksProvider.refresh()
      }),
    ]

    context.subscriptions.push(...disposables)
    context.subscriptions.push(todoProvider)

    console.log('CCoding activated successfully!')
  }
  catch (error) {
    console.error('Failed to activate CCoding extension:', error)
    vscode.window.showErrorMessage(`CCoding扩展激活失败: ${error}`)
    throw error
  }
}

async function showQuickJumpPicker() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const document = editor.document
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    document.uri,
  )

  if (!symbols || symbols.length === 0) {
    vscode.window.showInformationMessage('No symbols found in current file')
    return
  }

  const items = symbols.map(symbol => ({
    label: symbol.name,
    description: vscode.SymbolKind[symbol.kind],
    detail: `Line ${symbol.range.start.line + 1}`,
    symbol,
  }))

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a symbol to jump to',
  })

  if (selected) {
    const position = selected.symbol.range.start
    editor.selection = new vscode.Selection(position, position)
    editor.revealRange(selected.symbol.range, vscode.TextEditorRevealType.InCenter)
  }
}

export function deactivate() {
  console.log('[CCoding] 插件正在停用，清理资源...')

  // 清理定时器
  if (documentChangeTimeout) {
    clearTimeout(documentChangeTimeout)
    documentChangeTimeout = undefined
  }

  // 注意：由于activation函数中的providers是局部变量，
  // 这里无法直接访问，但dispose方法会在context.subscriptions中自动调用

  console.log('[CCoding] 插件停用完成')
}

/**
 * 修复书签数据
 * @param context 扩展上下文
 * @param bookmarkProvider 书签Provider
 * @returns 修复的数据条数
 */
async function repairBookmarkData(context: vscode.ExtensionContext, bookmarkProvider: BookmarkProvider): Promise<number> {
  const saved = context.globalState.get<any[]>('CCoding.bookmarks', [])
  const originalCount = saved.length

  // 过滤出有效的书签数据
  const validBookmarks = saved.filter((bookmark) => {
    if (!bookmark || typeof bookmark !== 'object') {
      return false
    }

    // 检查必需的属性
    if (!bookmark.id || !bookmark.label || typeof bookmark.label !== 'string') {
      return false
    }

    // 检查 URI
    if (!bookmark.uri) {
      return false
    }

    // 检查 range 对象的完整性
    if (!bookmark.range
      || !bookmark.range.start
      || !bookmark.range.end
      || typeof bookmark.range.start.line !== 'number'
      || typeof bookmark.range.start.character !== 'number'
      || typeof bookmark.range.end.line !== 'number'
      || typeof bookmark.range.end.character !== 'number') {
      return false
    }

    // 检查时间戳
    if (!bookmark.timestamp || typeof bookmark.timestamp !== 'number') {
      return false
    }

    return true
  })

  // 保存修复后的数据
  await context.globalState.update('CCoding.bookmarks', validBookmarks)

  // 刷新书签Provider
  bookmarkProvider.refresh()

  return originalCount - validBookmarks.length
}
