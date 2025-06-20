import * as vscode from 'vscode';

export class FunctionListProvider implements vscode.TreeDataProvider<FunctionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FunctionItem | undefined | null | void> = new vscode.EventEmitter<FunctionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FunctionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private functions: FunctionItem[] = [];

    constructor() {
        this.refresh();
    }

    refresh(): void {
        this.parseFunctions();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FunctionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FunctionItem): Thenable<FunctionItem[]> {
        if (!element) {
            return Promise.resolve(this.functions);
        }
        return Promise.resolve([]);
    }

    private async parseFunctions() {
        this.functions = [];
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (symbols) {
            this.extractFunctions(symbols, document);
        }
    }

    private extractFunctions(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument, level = 0) {
        for (const symbol of symbols) {
            if (this.isFunctionSymbol(symbol.kind)) {
                const functionItem = new FunctionItem(
                    symbol.name,
                    symbol.kind,
                    symbol.range,
                    document.uri,
                    level
                );
                this.functions.push(functionItem);
            }

            if (symbol.children && symbol.children.length > 0) {
                this.extractFunctions(symbol.children, document, level + 1);
            }
        }
    }

    private isFunctionSymbol(kind: vscode.SymbolKind): boolean {
        return kind === vscode.SymbolKind.Function ||
               kind === vscode.SymbolKind.Method ||
               kind === vscode.SymbolKind.Constructor;
    }

    /**
     * 搜索功能列表
     * @param query - 搜索查询
     * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
     * @returns 匹配的功能项
     * @description 在功能名称中搜索匹配的内容，scope为'all'时暂不支持跨文件搜索
     */
    async searchFunctions(query: string, scope: 'current' | 'all'): Promise<void> {
        if (!query || !query.trim()) {
            vscode.window.showInformationMessage('请输入搜索关键字');
            return;
        }

        if (scope === 'all') {
            vscode.window.showInformationMessage('功能列表暂不支持跨文件搜索，请切换到"当前"模式');
            return;
        }

        const searchQuery = query.toLowerCase().trim();
        const results = this.functions.filter(func => 
            func.name.toLowerCase().includes(searchQuery)
        );

        if (results.length === 0) {
            vscode.window.showInformationMessage(`在当前文件的功能列表中未找到 "${query}"`);
            return;
        }

        // 显示搜索结果选择器
        const items = results.map(func => ({
            label: func.name,
            description: `第 ${func.range.start.line + 1} 行`,
            detail: `功能 - ${vscode.SymbolKind[func.kind]}`,
            func: func
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `找到 ${results.length} 个功能结果`
        });

        if (selected) {
            // 跳转到选中的功能
            await vscode.commands.executeCommand('vscode.open', selected.func.uri, {
                selection: new vscode.Range(
                    selected.func.range.start.line,
                    selected.func.range.start.character,
                    selected.func.range.start.line,
                    selected.func.range.start.character
                )
            });
        }
    }
}

class FunctionItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly kind: vscode.SymbolKind,
        public readonly range: vscode.Range,
        public readonly uri: vscode.Uri,
        public readonly level: number
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${this.name} (Line ${this.range.start.line + 1})`;
        this.description = `Line ${this.range.start.line + 1}`;
        
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [this.uri, {
                selection: new vscode.Range(
                    this.range.start.line,
                    this.range.start.character,
                    this.range.start.line,
                    this.range.start.character
                )
            }]
        };

        this.iconPath = this.getIconForSymbolKind(kind);
    }

    private getIconForSymbolKind(kind: vscode.SymbolKind): vscode.ThemeIcon {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return new vscode.ThemeIcon('symbol-function');
            case vscode.SymbolKind.Method:
                return new vscode.ThemeIcon('symbol-method');
            case vscode.SymbolKind.Constructor:
                return new vscode.ThemeIcon('symbol-constructor');
            default:
                return new vscode.ThemeIcon('symbol-function');
        }
    }
}
