import * as vscode from 'vscode'
import { BookmarkProvider } from './providers/bookmarkProvider'
import { FunctionListProvider } from './providers/functionListProvider'
import { PinnedSymbolProvider } from './providers/pinnedSymbolProvider'
import { TabSwitcherProvider } from './providers/tabSwitcherProvider'
import { TimelineProvider } from './providers/timelineProvider'
import { TodoProvider } from './providers/todoProvider'

// 全局状态管理
let currentTab: 'current' | 'all' | 'symbols' = 'symbols'
let hasActiveSearch = false
let searchQuery = ''
let documentChangeTimeout: NodeJS.Timeout | undefined

export function activate(context: vscode.ExtensionContext) {
  console.log('CCoding is now active!')

  try {
    // 设置初始上下文
    vscode.commands.executeCommand('setContext', 'CCoding.currentTab', currentTab)
    vscode.commands.executeCommand('setContext', 'CCoding.hasActiveSearch', hasActiveSearch)
    vscode.commands.executeCommand('setContext', 'CCoding.isSymbolsTab', true)

    const functionListProvider = new FunctionListProvider()
    const bookmarkProvider = new BookmarkProvider(context)
    const todoProvider = new TodoProvider()
    const pinnedSymbolProvider = new PinnedSymbolProvider(context)
    const timelineProvider = new TimelineProvider()

    // Provider初始化完成

    // 创建tab切换器webview
    const tabSwitcherProvider = new TabSwitcherProvider(
      context.extensionUri,
      (tab: 'current' | 'all' | 'symbols') => {
        switchTab(tab, tabSwitcherProvider, functionListProvider, bookmarkProvider, todoProvider, pinnedSymbolProvider)
      },
      (query: string, scope: 'current' | 'all' | 'symbols', searchType: string) => {
        performSearch(scope, searchType, functionListProvider, bookmarkProvider, todoProvider, pinnedSymbolProvider, query)
      },
    )

    // 注册webview provider
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(TabSwitcherProvider.viewType, tabSwitcherProvider),
    )

    vscode.window.createTreeView('CCoding.functionList', {
      treeDataProvider: functionListProvider,
      showCollapseAll: true,
    })

    // 延迟聚焦到控制面板，避免初始化冲突
    setTimeout(() => {
      try {
        vscode.commands.executeCommand('CCoding.tabSwitcher.focus')
      }
      catch (error) {
        console.warn('Failed to focus tab switcher:', error)
      }
    }, 1000) // 增加延迟时间到1000ms

    vscode.window.createTreeView('CCoding.bookmarks', {
      treeDataProvider: bookmarkProvider,
      showCollapseAll: true,
    })

    vscode.window.createTreeView('CCoding.todos', {
      treeDataProvider: todoProvider,
      showCollapseAll: true,
    })

    vscode.window.createTreeView('CCoding.pinnedSymbols', {
      treeDataProvider: pinnedSymbolProvider,
      showCollapseAll: true,
    })

    const disposables = [
      vscode.commands.registerCommand('CCoding.showFunctionList', () => {
        functionListProvider.refresh()
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

      vscode.commands.registerCommand('CCoding.pinSymbol', () => {
        pinnedSymbolProvider.pinCurrentSymbol()
      }),

      vscode.commands.registerCommand('CCoding.showTodos', () => {
        todoProvider.forceRefresh()
      }),

      vscode.commands.registerCommand('CCoding.showTimeline', () => {
        timelineProvider.showTimeline()
      }),

      vscode.commands.registerCommand('CCoding.clearSearch', () => {
        clearSearch(tabSwitcherProvider, functionListProvider, bookmarkProvider, todoProvider, pinnedSymbolProvider)
      }),

      vscode.commands.registerCommand('CCoding.addBookmarkFromContext', (uri: vscode.Uri) => {
        bookmarkProvider.addBookmarkFromContext(uri)
      }),

      vscode.commands.registerCommand('CCoding.addBookmarkFromEditor', () => {
        bookmarkProvider.addBookmarkFromEditor()
      }),

      vscode.commands.registerCommand('CCoding.pinSymbolFromEditor', () => {
        pinnedSymbolProvider.pinCurrentSymbol()
      }),

      vscode.commands.registerCommand('CCoding.unpinSymbol', (item: any) => {
        pinnedSymbolProvider.unpinSymbol(item.pinnedSymbol.id)
      }),

      vscode.commands.registerCommand('CCoding.clearAllPinnedSymbols', () => {
        pinnedSymbolProvider.clearAllPinnedSymbols()
      }),

      vscode.commands.registerCommand('CCoding.editBookmark', (item: any) => {
        bookmarkProvider.editBookmark(item.bookmark.id)
      }),

      vscode.commands.registerCommand('CCoding.removeBookmark', (item: any) => {
        bookmarkProvider.removeBookmark(item.bookmark.id)
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
            const pinnedSymbolFixedCount = await repairPinnedSymbolData(context, pinnedSymbolProvider)

            vscode.window.showInformationMessage(
              `数据修复完成！修复了 ${bookmarkFixedCount} 个书签数据，${pinnedSymbolFixedCount} 个置顶符号数据。`,
            )
          }
          catch (error) {
            vscode.window.showErrorMessage(`数据修复失败：${error}`)
          }
        }
      }),

      vscode.window.onDidChangeActiveTextEditor(() => {
        console.log('[CCoding] 编辑器切换，刷新providers')
        functionListProvider.refresh()
        // 如果当前是"当前文件"模式，切换文件时需要更新所有provider的显示
        if (currentTab === 'current') {
          todoProvider.refresh()
          bookmarkProvider.refresh()
          pinnedSymbolProvider.refresh()
        }
      }),

      // 使用防抖处理文档变更事件，避免频繁触发
      vscode.workspace.onDidChangeTextDocument((event) => {
        // 只在用户主动编辑时刷新，忽略程序化变更
        if (event.reason === vscode.TextDocumentChangeReason.Undo || 
            event.reason === vscode.TextDocumentChangeReason.Redo) {
          return
        }
        
        // 防抖处理
        if (documentChangeTimeout) {
          clearTimeout(documentChangeTimeout)
        }
        documentChangeTimeout = setTimeout(() => {
          console.log('[CCoding] 文档变更，刷新providers')
          functionListProvider.refresh()
          // 实时扫描当前文档的TODO变更
          todoProvider.scanCurrentDocument()
        }, 1000) // 1秒防抖
      }),

      vscode.workspace.onDidSaveTextDocument(() => {
        todoProvider.refresh()
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

/**
 * 切换选项卡
 * @param tab - 目标选项卡类型
 * @param tabSwitcherProvider - tab切换器provider
 * @param functionListProvider - 函数列表provider
 * @param bookmarkProvider - 书签provider
 * @param todoProvider - 待办provider
 * @param pinnedSymbolProvider - 置顶符号provider
 */
function switchTab(
  tab: 'current' | 'all' | 'symbols',
  tabSwitcherProvider: TabSwitcherProvider,
  functionListProvider: FunctionListProvider,
  bookmarkProvider: BookmarkProvider,
  todoProvider: TodoProvider,
  pinnedSymbolProvider: PinnedSymbolProvider,
) {
  currentTab = tab
  vscode.commands.executeCommand('setContext', 'CCoding.currentTab', currentTab)
  vscode.commands.executeCommand('setContext', 'CCoding.isSymbolsTab', tab === 'symbols')

  // 更新WebView的选项卡状态
  tabSwitcherProvider.updateCurrentTab(tab)

  // 只有在非symbols tab时才更新其他Provider
  if (tab !== 'symbols') {
    todoProvider.setCurrentTab(tab)
    bookmarkProvider.setCurrentTab(tab)
    pinnedSymbolProvider.setCurrentTab(tab)
  }

  // 符号provider始终显示当前文件内容，不需要tab切换

  // 刷新相关的provider以更新显示内容
  functionListProvider.refresh()
  if (tab !== 'symbols') {
    bookmarkProvider.refresh()
    todoProvider.refresh()
    pinnedSymbolProvider.refresh()
  }

  // 静默切换，无需提示消息
}

/**
 * 执行搜索
 * @param scope - 搜索范围
 * @param searchType - 搜索类型
 * @param functionListProvider - 功能列表provider
 * @param bookmarkProvider - 书签provider
 * @param todoProvider - 待办provider
 * @param pinnedSymbolProvider - 置顶符号provider
 * @param query - 搜索查询（可选，如果没有提供会弹出输入框）
 */
async function performSearch(
  scope: 'current' | 'all' | 'symbols',
  searchType: string,
  functionListProvider: FunctionListProvider,
  bookmarkProvider: BookmarkProvider,
  todoProvider: TodoProvider,
  pinnedSymbolProvider: PinnedSymbolProvider,
  query?: string,
) {
  // 如果query是undefined（从WebView来的搜索都会提供query，即使是空字符串）
  if (query === undefined) {
    return
  }

  const searchInput = query.trim()
  console.log(`[CCoding] 开始搜索: "${searchInput}", 范围: ${scope}, 类型: ${searchType}`)

  if (searchInput) {
    searchQuery = searchInput
    hasActiveSearch = true
    vscode.commands.executeCommand('setContext', 'CCoding.hasActiveSearch', hasActiveSearch)

    // 根据搜索类型执行相应的搜索操作
    try {
      if (scope === 'symbols') {
        // 在symbols tab时，只搜索符号
        console.log('[CCoding] 搜索符号...')
        await functionListProvider.searchFunctions(searchQuery)
      }
      else {
        switch (searchType) {
          case 'bookmarks':
            console.log('[CCoding] 搜索书签...')
            await bookmarkProvider.searchBookmarks(searchQuery, scope)
            break
          case 'todos':
            console.log('[CCoding] 搜索待办事项...')
            await todoProvider.searchTodos(searchQuery, scope)
            break
          case 'pinnedSymbols':
            console.log('[CCoding] 搜索置顶符号...')
            await pinnedSymbolProvider.searchPinnedSymbols(searchQuery, scope)
            break
          case 'all':
          default:
            console.log('[CCoding] 搜索所有内容...')
            // 避免并发搜索，改为串行处理，减少系统压力
            await bookmarkProvider.searchBookmarks(searchQuery, scope)
            await todoProvider.searchTodos(searchQuery, scope)
            await pinnedSymbolProvider.searchPinnedSymbols(searchQuery, scope)
            break
        }
      }
      console.log('[CCoding] 搜索完成')
    }
    catch (error) {
      console.error('[CCoding] 搜索错误:', error)
      vscode.window.showErrorMessage(`搜索时发生错误: ${error}`)
    }
  }
  else {
    // 如果搜索内容为空，清除搜索状态
    console.log('[CCoding] 清除搜索状态')
    searchQuery = ''
    hasActiveSearch = false
    vscode.commands.executeCommand('setContext', 'CCoding.hasActiveSearch', hasActiveSearch)

    // 清除相关provider的搜索状态
    functionListProvider.clearSearch()
    if (currentTab !== 'symbols') {
      bookmarkProvider.clearSearch()
      todoProvider.clearSearch()
      pinnedSymbolProvider.clearSearch()
    }
  }
}

/**
 * 清除搜索
 * @param tabSwitcherProvider - tab切换器provider
 * @param functionListProvider - 函数列表provider
 * @param bookmarkProvider - 书签provider
 * @param todoProvider - 待办provider
 * @param pinnedSymbolProvider - 置顶符号provider
 */
function clearSearch(
  tabSwitcherProvider: TabSwitcherProvider,
  functionListProvider: FunctionListProvider,
  bookmarkProvider: BookmarkProvider,
  todoProvider: TodoProvider,
  pinnedSymbolProvider: PinnedSymbolProvider,
) {
  searchQuery = ''
  hasActiveSearch = false
  vscode.commands.executeCommand('setContext', 'CCoding.hasActiveSearch', hasActiveSearch)

  // 清除WebView中的搜索框
  tabSwitcherProvider.clearSearch()

  // 刷新相关provider以清除搜索过滤
  functionListProvider.refresh()
  if (currentTab !== 'symbols') {
    bookmarkProvider.refresh()
    todoProvider.refresh()
    pinnedSymbolProvider.refresh()
  }
}

export function deactivate() {
  console.log('[CCoding] 插件正在停用，清理资源...')

  // 清理定时器
  if (documentChangeTimeout) {
    clearTimeout(documentChangeTimeout)
    documentChangeTimeout = undefined
  }

  // 这里无法直接访问provider实例，但可以通过globalState确保数据一致性
  // 实际的数据保存已经在各个操作中进行了

  // 清理资源
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

/**
 * 修复置顶符号数据
 * @param context 扩展上下文
 * @param pinnedSymbolProvider 置顶符号Provider
 * @returns 修复的数据条数
 */
async function repairPinnedSymbolData(context: vscode.ExtensionContext, pinnedSymbolProvider: PinnedSymbolProvider): Promise<number> {
  const saved = context.globalState.get<any[]>('CCoding.pinnedSymbols', [])
  const originalCount = saved.length

  // 过滤出有效的置顶符号数据
  const validPinnedSymbols = saved.filter((symbol) => {
    if (!symbol || typeof symbol !== 'object') {
      return false
    }

    // 检查必需的属性
    if (!symbol.id || !symbol.name || typeof symbol.kind !== 'number') {
      return false
    }

    // 检查 URI
    if (!symbol.uri) {
      return false
    }

    // 检查 range 对象的完整性
    if (!symbol.range
      || !symbol.range.start
      || !symbol.range.end
      || typeof symbol.range.start.line !== 'number'
      || typeof symbol.range.start.character !== 'number'
      || typeof symbol.range.end.line !== 'number'
      || typeof symbol.range.end.character !== 'number') {
      return false
    }

    // 检查时间戳
    if (!symbol.timestamp || typeof symbol.timestamp !== 'number') {
      return false
    }

    return true
  })

  // 保存修复后的数据
  await context.globalState.update('CCoding.pinnedSymbols', validPinnedSymbols)

  // 刷新置顶符号Provider
  pinnedSymbolProvider.refresh()

  return originalCount - validPinnedSymbols.length
}
