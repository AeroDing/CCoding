import * as vscode from 'vscode'
import { BookmarkProvider } from './providers/bookmarkProvider'
import { DataAdapter } from './providers/dataAdapter'
import { FunctionListProvider } from './providers/functionListProvider'
import { PinnedSymbolProvider } from './providers/pinnedSymbolProvider'
import { TimelineProvider } from './providers/timelineProvider'
import { TodoProvider } from './providers/todoProvider'
import { UnifiedWebViewProvider } from './providers/unifiedWebViewProvider'

// 全局状态管理
let documentChangeTimeout: NodeJS.Timeout | undefined

export function activate(context: vscode.ExtensionContext) {
  console.log('CCoding is now active!')

  try {
    // 创建传统Provider实例（保持向后兼容）
    const functionListProvider = new FunctionListProvider()
    const bookmarkProvider = new BookmarkProvider(context)
    const todoProvider = new TodoProvider()
    const pinnedSymbolProvider = new PinnedSymbolProvider(context)
    const timelineProvider = new TimelineProvider()

    // 创建数据适配器
    const dataAdapter = new DataAdapter(
      functionListProvider,
      bookmarkProvider,
      todoProvider,
      pinnedSymbolProvider,
    )

    // 创建统一WebView Provider和数据刷新函数
    let unifiedWebViewProvider: UnifiedWebViewProvider

    async function refreshAllData() {
      try {
        console.log('[CCoding] 开始刷新所有数据...')
        const data = await dataAdapter.refreshAllData()

        // 合并所有数据
        const allItems = [
          ...data.symbols,
          ...data.bookmarks,
          ...data.todos,
          ...data.pinned,
        ]

        // 计算统计信息
        const stats = {
          total: allItems.length,
          symbols: data.symbols.length,
          bookmarks: data.bookmarks.length,
          todos: data.todos.length,
          pinned: data.pinned.length,
        }

        console.log('[CCoding] 更新统一WebView数据:', stats)
        if (unifiedWebViewProvider) {
          unifiedWebViewProvider.updateData(allItems, stats)
        }

        console.log('[CCoding] 数据刷新完成')
      }
      catch (error) {
        console.error('[CCoding] 数据刷新失败:', error)
        vscode.window.showErrorMessage(`CCoding数据刷新失败: ${error}`)
      }
    }

    unifiedWebViewProvider = new UnifiedWebViewProvider(
      context.extensionUri,
      (filter) => {
        console.log(`[CCoding] 筛选器改变: ${filter}`)
        // 在WebView内部处理筛选，这里只是日志
      },
      (query) => {
        console.log(`[CCoding] 搜索查询: ${query}`)
        // 在WebView内部处理搜索，这里只是日志
      },
      (item) => {
        // 处理项目点击 - 跳转到位置
        vscode.window.showTextDocument(item.uri, {
          selection: new vscode.Range(item.range.start, item.range.start),
        })
      },
      (item) => {
        // 处理置顶切换
        console.log(`[CCoding] 切换置顶状态: ${item.label}`)
        // TODO: 实现置顶逻辑
      },
      () => {
        // 处理数据请求
        console.log('[CCoding] WebView请求数据刷新')
        refreshAllData()
      },
    )

    // TODO装饰器初始化（延迟执行）
    const initializeTodoDecorations = () => {
      console.log('[CCoding] 初始化TODO装饰器')
      todoProvider.initializeDecorations()
    }

    if (vscode.window.activeTextEditor) {
      // 延迟初始化，确保编辑器完全加载
      setTimeout(() => {
        console.log('[CCoding] 延迟初始化开始...')
        initializeTodoDecorations()
        // 再次延迟以确保TODO装饰器完全初始化
        setTimeout(refreshAllData, 500)
      }, 1000)
    }
    else {
      console.log('[CCoding] 没有活动编辑器，等待编辑器激活...')
      const disposableInit = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          console.log('[CCoding] 编辑器激活，开始初始化...')
          initializeTodoDecorations()
          setTimeout(refreshAllData, 500)
          disposableInit.dispose()
        }
      })
      context.subscriptions.push(disposableInit)
    }

    // 注册统一WebView
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        UnifiedWebViewProvider.viewType,
        unifiedWebViewProvider,
      ),
    )

    // WebView注册后立即刷新数据
    setTimeout(() => {
      console.log('[CCoding] WebView注册后刷新数据')
      refreshAllData()
    }, 100)

    const disposables = [
      // 传统命令（保持兼容）
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

      // 统一视图命令
      vscode.commands.registerCommand('CCoding.refreshUnifiedView', () => {
        console.log('[CCoding] 手动刷新统一视图')
        refreshAllData()
      }),

      vscode.commands.registerCommand('CCoding.clearSearch', () => {
        // 清除WebView搜索
        unifiedWebViewProvider.clearSearch()
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

      // 事件监听器
      vscode.window.onDidChangeActiveTextEditor(() => {
        console.log('[CCoding] 编辑器切换，刷新统一视图')
        refreshAllData()
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
          console.log('[CCoding] 文档变更，刷新统一视图')
          refreshAllData()
        }, 1000)
      }),

      vscode.workspace.onDidSaveTextDocument(() => {
        console.log('[CCoding] 文档保存，刷新统一视图')
        refreshAllData()
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
