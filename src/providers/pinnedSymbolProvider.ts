import * as vscode from 'vscode';

interface PinnedSymbol {
    id: string;
    name: string;
    kind: vscode.SymbolKind;
    uri: vscode.Uri;
    range: vscode.Range;
    timestamp: number;
}

export class PinnedSymbolProvider implements vscode.TreeDataProvider<PinnedSymbolItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PinnedSymbolItem | undefined | null | void> = new vscode.EventEmitter<PinnedSymbolItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PinnedSymbolItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private pinnedSymbols: PinnedSymbol[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadPinnedSymbols();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PinnedSymbolItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PinnedSymbolItem): Thenable<PinnedSymbolItem[]> {
        if (!element) {
            const items = this.pinnedSymbols.map(symbol => new PinnedSymbolItem(symbol));
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    async pinCurrentSymbol() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols || symbols.length === 0) {
            vscode.window.showErrorMessage('No symbols found in current file');
            return;
        }

        const symbolAtPosition = this.findSymbolAtPosition(symbols, position);
        if (!symbolAtPosition) {
            vscode.window.showErrorMessage('No symbol found at current position');
            return;
        }

        const existingSymbol = this.pinnedSymbols.find(s => 
            s.name === symbolAtPosition.name && 
            s.uri.toString() === document.uri.toString() &&
            s.range.start.line === symbolAtPosition.range.start.line
        );

        if (existingSymbol) {
            vscode.window.showInformationMessage(`Symbol "${symbolAtPosition.name}" is already pinned`);
            return;
        }

        const pinnedSymbol: PinnedSymbol = {
            id: Date.now().toString(),
            name: symbolAtPosition.name,
            kind: symbolAtPosition.kind,
            uri: document.uri,
            range: symbolAtPosition.range,
            timestamp: Date.now()
        };

        this.pinnedSymbols.push(pinnedSymbol);
        this.savePinnedSymbols();
        this.refresh();
        
        vscode.commands.executeCommand('setContext', 'codingHelper.hasPinnedSymbols', this.pinnedSymbols.length > 0);
        vscode.window.showInformationMessage(`Symbol "${symbolAtPosition.name}" pinned`);
    }

    unpinSymbol(symbolId: string) {
        this.pinnedSymbols = this.pinnedSymbols.filter(s => s.id !== symbolId);
        this.savePinnedSymbols();
        this.refresh();
        vscode.commands.executeCommand('setContext', 'codingHelper.hasPinnedSymbols', this.pinnedSymbols.length > 0);
    }

    private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                if (symbol.children && symbol.children.length > 0) {
                    const childSymbol = this.findSymbolAtPosition(symbol.children, position);
                    if (childSymbol) {
                        return childSymbol;
                    }
                }
                return symbol;
            }
        }
        return null;
    }

    private loadPinnedSymbols() {
        const saved = this.context.globalState.get<PinnedSymbol[]>('codingHelper.pinnedSymbols', []);
        this.pinnedSymbols = saved.map(s => ({
            ...s,
            uri: vscode.Uri.parse(s.uri.toString()),
            range: new vscode.Range(
                new vscode.Position(s.range.start.line, s.range.start.character),
                new vscode.Position(s.range.end.line, s.range.end.character)
            )
        }));
        vscode.commands.executeCommand('setContext', 'codingHelper.hasPinnedSymbols', this.pinnedSymbols.length > 0);
    }

    private savePinnedSymbols() {
        this.context.globalState.update('codingHelper.pinnedSymbols', this.pinnedSymbols);
    }
}

class PinnedSymbolItem extends vscode.TreeItem {
    constructor(public readonly pinnedSymbol: PinnedSymbol) {
        super(pinnedSymbol.name, vscode.TreeItemCollapsibleState.None);

        const fileName = vscode.workspace.asRelativePath(pinnedSymbol.uri);
        this.tooltip = `${pinnedSymbol.name} in ${fileName} (Line ${pinnedSymbol.range.start.line + 1})`;
        this.description = `${fileName}:${pinnedSymbol.range.start.line + 1}`;
        
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [pinnedSymbol.uri, {
                selection: pinnedSymbol.range
            }]
        };

        this.iconPath = this.getIconForSymbolKind(pinnedSymbol.kind);
        this.contextValue = 'pinnedSymbol';
    }

    private getIconForSymbolKind(kind: vscode.SymbolKind): vscode.ThemeIcon {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return new vscode.ThemeIcon('symbol-function');
            case vscode.SymbolKind.Method:
                return new vscode.ThemeIcon('symbol-method');
            case vscode.SymbolKind.Class:
                return new vscode.ThemeIcon('symbol-class');
            case vscode.SymbolKind.Variable:
                return new vscode.ThemeIcon('symbol-variable');
            case vscode.SymbolKind.Property:
                return new vscode.ThemeIcon('symbol-property');
            default:
                return new vscode.ThemeIcon('pin');
        }
    }
}