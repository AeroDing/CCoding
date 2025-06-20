import * as vscode from 'vscode';
import { FunctionListProvider } from './providers/functionListProvider';
import { BookmarkProvider } from './providers/bookmarkProvider';
import { TodoProvider } from './providers/todoProvider';
import { PinnedSymbolProvider } from './providers/pinnedSymbolProvider';
import { TimelineProvider } from './providers/timelineProvider';
import { KeywordSearchProvider } from './providers/keywordSearchProvider';
import { TabSwitcherProvider } from './providers/tabSwitcherProvider';

// 全局状态管理
let currentTab: 'current' | 'all' = 'current';
let hasActiveSearch = false;
let searchQuery = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('Coding Helpers is now active!');

    // 设置初始上下文
    vscode.commands.executeCommand('setContext', 'codingHelper.currentTab', currentTab);
    vscode.commands.executeCommand('setContext', 'codingHelper.hasActiveSearch', hasActiveSearch);

    const functionListProvider = new FunctionListProvider();
    const bookmarkProvider = new BookmarkProvider(context);
    const todoProvider = new TodoProvider();
    const pinnedSymbolProvider = new PinnedSymbolProvider(context);
    const timelineProvider = new TimelineProvider();
    const keywordSearchProvider = new KeywordSearchProvider();

    // 创建tab切换器webview
    const tabSwitcherProvider = new TabSwitcherProvider(
        context.extensionUri,
        (tab: 'current' | 'all') => {
            switchTab(tab, tabSwitcherProvider, functionListProvider, bookmarkProvider, todoProvider, pinnedSymbolProvider);
        },
        (query: string, scope: 'current' | 'all') => {
            performSearch(scope, keywordSearchProvider, query);
        }
    );

    // 注册webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TabSwitcherProvider.viewType, tabSwitcherProvider)
    );

    vscode.window.createTreeView('codingHelper.functionList', {
        treeDataProvider: functionListProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('codingHelper.bookmarks', {
        treeDataProvider: bookmarkProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('codingHelper.todos', {
        treeDataProvider: todoProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('codingHelper.pinnedSymbols', {
        treeDataProvider: pinnedSymbolProvider,
        showCollapseAll: true
    });

    const disposables = [
        vscode.commands.registerCommand('codingHelper.showFunctionList', () => {
            functionListProvider.refresh();
        }),

        vscode.commands.registerCommand('codingHelper.addBookmark', () => {
            bookmarkProvider.addBookmark();
        }),

        vscode.commands.registerCommand('codingHelper.showBookmarks', () => {
            bookmarkProvider.refresh();
        }),

        vscode.commands.registerCommand('codingHelper.quickJump', () => {
            showQuickJumpPicker();
        }),

        vscode.commands.registerCommand('codingHelper.pinSymbol', () => {
            pinnedSymbolProvider.pinCurrentSymbol();
        }),

        vscode.commands.registerCommand('codingHelper.showTodos', () => {
            todoProvider.forceRefresh();
        }),

        vscode.commands.registerCommand('codingHelper.showTimeline', () => {
            timelineProvider.showTimeline();
        }),

        vscode.commands.registerCommand('codingHelper.searchKeywords', () => {
            keywordSearchProvider.searchKeywords();
        }),

        vscode.commands.registerCommand('codingHelper.addBookmarkFromContext', (uri: vscode.Uri) => {
            bookmarkProvider.addBookmarkFromContext(uri);
        }),

        vscode.commands.registerCommand('codingHelper.addBookmarkFromEditor', () => {
            bookmarkProvider.addBookmarkFromEditor();
        }),

        vscode.commands.registerCommand('codingHelper.pinSymbolFromEditor', () => {
            pinnedSymbolProvider.pinCurrentSymbol();
        }),

        vscode.commands.registerCommand('codingHelper.unpinSymbol', (item: any) => {
            pinnedSymbolProvider.unpinSymbol(item.pinnedSymbol.id);
        }),

        vscode.commands.registerCommand('codingHelper.clearAllPinnedSymbols', () => {
            pinnedSymbolProvider.clearAllPinnedSymbols();
        }),

        vscode.commands.registerCommand('codingHelper.editBookmark', (item: any) => {
            bookmarkProvider.editBookmark(item.bookmark.id);
        }),

        vscode.commands.registerCommand('codingHelper.removeBookmark', (item: any) => {
            bookmarkProvider.removeBookmark(item.bookmark.id);
        }),

        vscode.window.onDidChangeActiveTextEditor(() => {
            functionListProvider.refresh();
            // 如果当前是"当前文件"模式，切换文件时需要更新所有provider的显示
            if (currentTab === 'current') {
                todoProvider.refresh();
                bookmarkProvider.refresh();
                pinnedSymbolProvider.refresh();
            }
        }),

        vscode.workspace.onDidChangeTextDocument((event) => {
            functionListProvider.refresh();
        }),

        vscode.workspace.onDidSaveTextDocument(() => {
            todoProvider.refresh();
        })
    ];

    context.subscriptions.push(...disposables);
    context.subscriptions.push(todoProvider);
}

async function showQuickJumpPicker() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    );

    if (!symbols || symbols.length === 0) {
        vscode.window.showInformationMessage('No symbols found in current file');
        return;
    }

    const items = symbols.map(symbol => ({
        label: symbol.name,
        description: vscode.SymbolKind[symbol.kind],
        detail: `Line ${symbol.range.start.line + 1}`,
        symbol: symbol
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a symbol to jump to'
    });

    if (selected) {
        const position = selected.symbol.range.start;
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(selected.symbol.range, vscode.TextEditorRevealType.InCenter);
    }
}

/**
 * 切换选项卡
 * @param tab - 目标选项卡类型
 * @param providers - 所有相关的provider实例
 */
function switchTab(
    tab: 'current' | 'all', 
    tabSwitcherProvider: TabSwitcherProvider,
    functionListProvider: FunctionListProvider,
    bookmarkProvider: BookmarkProvider,
    todoProvider: TodoProvider,
    pinnedSymbolProvider: PinnedSymbolProvider
) {
    currentTab = tab;
    vscode.commands.executeCommand('setContext', 'codingHelper.currentTab', currentTab);
    
    // 更新WebView的选项卡状态
    tabSwitcherProvider.updateCurrentTab(tab);
    
    // 更新所有Provider的当前Tab状态
    todoProvider.setCurrentTab(tab);
    bookmarkProvider.setCurrentTab(tab);
    pinnedSymbolProvider.setCurrentTab(tab);
    
    // 刷新所有相关的provider以更新显示内容
    functionListProvider.refresh();
    bookmarkProvider.refresh();
    todoProvider.refresh();
    pinnedSymbolProvider.refresh();
    
    // 显示切换成功消息
    const tabName = tab === 'current' ? '当前文件' : '整个项目';
    vscode.window.showInformationMessage(`已切换到 ${tabName} 视图`);
}

/**
 * 执行搜索
 * @param scope - 搜索范围
 * @param keywordSearchProvider - 关键字搜索provider
 * @param query - 搜索查询（可选，如果没有提供会弹出输入框）
 */
async function performSearch(scope: 'current' | 'all', keywordSearchProvider: KeywordSearchProvider, query?: string) {
    let searchInput = query;
    
    // 如果没有提供查询参数，则弹出输入框
    if (!searchInput) {
        searchInput = await vscode.window.showInputBox({
            placeHolder: scope === 'current' ? '在当前文件中搜索...' : '在整个项目中搜索...',
            prompt: `请输入要搜索的关键字`,
            value: searchQuery
        });
    }

    if (searchInput !== undefined && searchInput !== null) {
        searchQuery = searchInput;
        hasActiveSearch = searchQuery.length > 0;
        vscode.commands.executeCommand('setContext', 'codingHelper.hasActiveSearch', hasActiveSearch);
        
        if (searchQuery) {
            // 执行实际的搜索操作
            if (scope === 'current') {
                await searchInCurrentFile(searchQuery);
            } else {
                // 对于全项目搜索，使用现有的搜索功能
                // 注意：KeywordSearchProvider的searchKeywords方法会自己处理用户输入
                await keywordSearchProvider.searchKeywords();
            }
        }
    }
}

/**
 * 在当前文件中搜索
 * @param query - 搜索查询
 */
async function searchInCurrentFile(query: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    const document = editor.document;
    const text = document.getText();
    const results: { line: number; text: string }[] = [];
    
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
            results.push({
                line: index + 1,
                text: line.trim()
            });
        }
    });

    if (results.length === 0) {
        vscode.window.showInformationMessage(`在当前文件中未找到 "${query}"`);
        return;
    }

    // 显示搜索结果选择器
    const items = results.map(result => ({
        label: `第 ${result.line} 行`,
        description: result.text,
        detail: result.line.toString(),
        line: result.line - 1
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `找到 ${results.length} 个结果`
    });

    if (selected) {
        const position = new vscode.Position(selected.line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
}

/**
 * 清除搜索
 * @param providers - 所有相关的provider实例
 */
function clearSearch(
    tabSwitcherProvider: TabSwitcherProvider,
    functionListProvider: FunctionListProvider,
    bookmarkProvider: BookmarkProvider,
    todoProvider: TodoProvider,
    pinnedSymbolProvider: PinnedSymbolProvider
) {
    searchQuery = '';
    hasActiveSearch = false;
    vscode.commands.executeCommand('setContext', 'codingHelper.hasActiveSearch', hasActiveSearch);
    
    // 清除WebView中的搜索框
    tabSwitcherProvider.clearSearch();
    
    // 刷新所有provider以清除搜索过滤
    functionListProvider.refresh();
    bookmarkProvider.refresh();
    todoProvider.refresh();
    pinnedSymbolProvider.refresh();
    
    vscode.window.showInformationMessage('搜索已清除');
}

export function deactivate() {}
