import * as vscode from 'vscode';
import { FunctionListProvider } from './providers/functionListProvider';
import { BookmarkProvider } from './providers/bookmarkProvider';
import { TodoProvider } from './providers/todoProvider';
import { PinnedSymbolProvider } from './providers/pinnedSymbolProvider';
import { TimelineProvider } from './providers/timelineProvider';
import { KeywordSearchProvider } from './providers/keywordSearchProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Coding Helpers is now active!');

    const functionListProvider = new FunctionListProvider();
    const bookmarkProvider = new BookmarkProvider(context);
    const todoProvider = new TodoProvider();
    const pinnedSymbolProvider = new PinnedSymbolProvider(context);
    const timelineProvider = new TimelineProvider();
    const keywordSearchProvider = new KeywordSearchProvider();

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

export function deactivate() {}
