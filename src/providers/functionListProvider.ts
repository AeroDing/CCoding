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