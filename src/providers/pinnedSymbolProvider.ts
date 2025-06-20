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
    private currentTab: 'current' | 'all' = 'current';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadPinnedSymbols();
    }

    /**
     * 设置当前Tab状态
     * @param tab - 当前选择的Tab类型
     * @description 外部调用此方法来更新Tab状态并刷新显示
     */
    setCurrentTab(tab: 'current' | 'all'): void {
        if (this.currentTab !== tab) {
            this.currentTab = tab;
            this.refresh();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PinnedSymbolItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PinnedSymbolItem): Thenable<PinnedSymbolItem[]> {
        if (!element) {
            const filteredSymbols = this.getFilteredPinnedSymbols();
            // 按时间戳降序排列，最新置顶的在前面
            const sortedSymbols = [...filteredSymbols].sort((a, b) => b.timestamp - a.timestamp);
            const items = sortedSymbols.map(symbol => new PinnedSymbolItem(symbol));
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    /**
     * 根据当前Tab状态过滤置顶符号
     * @returns 过滤后的置顶符号数组
     * @description 当Tab为'current'时只返回当前文件的置顶符号，为'all'时返回所有置顶符号
     */
    private getFilteredPinnedSymbols(): PinnedSymbol[] {
        let symbols: PinnedSymbol[] = [];
        
        // 根据当前tab获取基础数据
        if (this.currentTab === 'current') {
            symbols = this.getCurrentFilePinnedSymbols();
        } else {
            symbols = this.pinnedSymbols;
        }
        
        // 应用搜索过滤
        if (this.searchQuery) {
            symbols = symbols.filter(symbol => {
                const fileName = vscode.workspace.asRelativePath(symbol.uri);
                const symbolTypeName = this.getSymbolTypeName(symbol.kind);
                return symbol.name.toLowerCase().includes(this.searchQuery) ||
                       fileName.toLowerCase().includes(this.searchQuery) ||
                       symbolTypeName.toLowerCase().includes(this.searchQuery);
            });
        }
        
        return symbols;
    }

    /**
     * 获取当前文件的置顶符号
     * @returns 当前文件的置顶符号数组
     * @description 如果没有打开的编辑器，返回空数组
     */
    private getCurrentFilePinnedSymbols(): PinnedSymbol[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }
        
        const currentFileUri = editor.document.uri.toString();
        return this.pinnedSymbols.filter(symbol => symbol.uri.toString() === currentFileUri);
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

        let symbolAtPosition = this.findSymbolAtPosition(symbols, position);
        
        // 如果没有找到符号，尝试查找最近的符号
        if (!symbolAtPosition) {
            symbolAtPosition = this.findNearestSymbol(symbols, position);
        }
        
        // 如果还是没有找到，提供选择列表
        if (!symbolAtPosition) {
            await this.showSymbolPicker(symbols);
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
        
        vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', this.pinnedSymbols.length > 0);
        vscode.window.showInformationMessage(`Symbol "${symbolAtPosition.name}" pinned`);
    }

    unpinSymbol(symbolId: string) {
        this.pinnedSymbols = this.pinnedSymbols.filter(s => s.id !== symbolId);
        this.savePinnedSymbols();
        this.refresh();
        vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', this.pinnedSymbols.length > 0);
    }

    /**
     * 清空所有置顶符号
     */
    clearAllPinnedSymbols() {
        if (this.pinnedSymbols.length === 0) {
            vscode.window.showInformationMessage('没有置顶的符号');
            return;
        }

        vscode.window.showInformationMessage(
            `确定要清空所有 ${this.pinnedSymbols.length} 个置顶符号吗？`,
            '确定', '取消'
        ).then((choice) => {
            if (choice === '确定') {
                this.pinnedSymbols = [];
                this.savePinnedSymbols();
                this.refresh();
                vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', false);
                vscode.window.showInformationMessage('已清空所有置顶符号');
            }
        });
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

    /**
     * 查找最接近当前位置的符号
     * @param symbols 符号列表
     * @param position 当前光标位置
     * @returns 最近的符号或null
     */
    private findNearestSymbol(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | null {
        let nearestSymbol: vscode.DocumentSymbol | null = null;
        let minDistance = Number.MAX_VALUE;

        const findNearestInArray = (symbolArray: vscode.DocumentSymbol[]) => {
            for (const symbol of symbolArray) {
                // 计算光标位置到符号的距离
                const distance = this.calculateDistanceToSymbol(symbol, position);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestSymbol = symbol;
                }

                // 递归检查子符号
                if (symbol.children && symbol.children.length > 0) {
                    findNearestInArray(symbol.children);
                }
            }
        };

        findNearestInArray(symbols);
        
        // 只返回距离较近的符号（同一行或相邻几行）
        if (nearestSymbol && minDistance <= 5) {
            return nearestSymbol;
        }
        
        return null;
    }

    /**
     * 计算光标位置到符号的距离
     * @param symbol 符号
     * @param position 光标位置
     * @returns 距离值
     */
    private calculateDistanceToSymbol(symbol: vscode.DocumentSymbol, position: vscode.Position): number {
        const symbolStart = symbol.range.start;
        const symbolEnd = symbol.range.end;
        
        // 如果在符号范围内，距离为0
        if (symbol.range.contains(position)) {
            return 0;
        }
        
        // 计算到符号开始位置的行距离
        const lineDistance = Math.abs(position.line - symbolStart.line);
        
        // 如果在同一行，计算字符距离
        if (position.line === symbolStart.line) {
            return Math.abs(position.character - symbolStart.character) / 100; // 除以100降低字符距离权重
        }
        
        return lineDistance;
    }

    /**
     * 显示符号选择器，让用户手动选择要置顶的符号
     * @param symbols 符号列表
     */
    private async showSymbolPicker(symbols: vscode.DocumentSymbol[]): Promise<void> {
        const allSymbols = this.flattenSymbols(symbols);
        
        if (allSymbols.length === 0) {
            vscode.window.showErrorMessage('当前文件中没有找到可置顶的符号');
            return;
        }

        const items = allSymbols.map(symbol => ({
            label: `$(${this.getSymbolIcon(symbol.kind)}) ${symbol.name}`,
            description: `${vscode.SymbolKind[symbol.kind]} - Line ${symbol.range.start.line + 1}`,
            detail: this.getSymbolDetail(symbol),
            symbol: symbol
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要置顶的符号',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected) {
            await this.pinSymbol(selected.symbol);
        }
    }

    /**
     * 将嵌套的符号列表展平
     * @param symbols 符号列表
     * @param level 嵌套层级
     * @returns 展平后的符号列表
     */
    private flattenSymbols(symbols: vscode.DocumentSymbol[], level: number = 0): vscode.DocumentSymbol[] {
        const result: vscode.DocumentSymbol[] = [];
        
        for (const symbol of symbols) {
            // 只包含重要的符号类型
            if (this.isImportantSymbol(symbol.kind)) {
                result.push(symbol);
            }
            
            // 递归处理子符号
            if (symbol.children && symbol.children.length > 0) {
                result.push(...this.flattenSymbols(symbol.children, level + 1));
            }
        }
        
        return result;
    }

    /**
     * 判断是否为重要的符号类型
     * @param kind 符号类型
     * @returns 是否重要
     */
    private isImportantSymbol(kind: vscode.SymbolKind): boolean {
        return [
            vscode.SymbolKind.Function,
            vscode.SymbolKind.Method,
            vscode.SymbolKind.Class,
            vscode.SymbolKind.Constructor,
            vscode.SymbolKind.Variable,
            vscode.SymbolKind.Constant,
            vscode.SymbolKind.Property,
            vscode.SymbolKind.Interface,
            vscode.SymbolKind.Enum
        ].includes(kind);
    }

    /**
     * 获取符号的图标名称
     * @param kind 符号类型
     * @returns 图标名称
     */
    private getSymbolIcon(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return 'symbol-function';
            case vscode.SymbolKind.Method:
                return 'symbol-method';
            case vscode.SymbolKind.Class:
                return 'symbol-class';
            case vscode.SymbolKind.Constructor:
                return 'symbol-constructor';
            case vscode.SymbolKind.Variable:
                return 'symbol-variable';
            case vscode.SymbolKind.Constant:
                return 'symbol-constant';
            case vscode.SymbolKind.Property:
                return 'symbol-property';
            case vscode.SymbolKind.Interface:
                return 'symbol-interface';
            case vscode.SymbolKind.Enum:
                return 'symbol-enum';
            default:
                return 'pin';
        }
    }

    /**
     * 获取符号的详细信息
     * @param symbol 符号
     * @returns 详细信息
     */
    private getSymbolDetail(symbol: vscode.DocumentSymbol): string {
        const line = symbol.range.start.line + 1;
        const endLine = symbol.range.end.line + 1;
        
        if (line === endLine) {
            return `第 ${line} 行`;
        } else {
            return `第 ${line}-${endLine} 行`;
        }
    }

    /**
     * 置顶指定的符号
     * @param symbol 要置顶的符号
     */
    private async pinSymbol(symbol: vscode.DocumentSymbol): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        
        // 检查是否已经置顶
        const existingSymbol = this.pinnedSymbols.find(s => 
            s.name === symbol.name && 
            s.uri.toString() === document.uri.toString() &&
            s.range.start.line === symbol.range.start.line
        );

        if (existingSymbol) {
            vscode.window.showInformationMessage(`符号 "${symbol.name}" 已经被置顶`);
            return;
        }

        const pinnedSymbol: PinnedSymbol = {
            id: Date.now().toString(),
            name: symbol.name,
            kind: symbol.kind,
            uri: document.uri,
            range: symbol.range,
            timestamp: Date.now()
        };

        this.pinnedSymbols.push(pinnedSymbol);
        this.savePinnedSymbols();
        this.refresh();
        
        vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', this.pinnedSymbols.length > 0);
        vscode.window.showInformationMessage(`符号 "${symbol.name}" 已置顶`);
    }

    private loadPinnedSymbols() {
        try {
            const saved = this.context.globalState.get<PinnedSymbol[]>('CCoding.pinnedSymbols', []);
            this.pinnedSymbols = saved
                .filter(s => this.isValidPinnedSymbol(s))
                .map(s => ({
                    ...s,
                    uri: vscode.Uri.parse(s.uri.toString()),
                    range: new vscode.Range(
                        new vscode.Position(s.range.start.line, s.range.start.character),
                        new vscode.Position(s.range.end.line, s.range.end.character)
                    )
                }));
            
            vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', this.pinnedSymbols.length > 0);
        } catch (error) {
            console.error('Error loading pinned symbols:', error);
            // 如果加载失败，重置为空数组
            this.pinnedSymbols = [];
            // 清除损坏的数据
            this.context.globalState.update('CCoding.pinnedSymbols', []);
            vscode.commands.executeCommand('setContext', 'CCoding.hasPinnedSymbols', false);
        }
    }

    /**
     * 验证置顶符号数据的完整性
     * @param symbol 要验证的符号数据
     * @returns 是否有效
     */
    private isValidPinnedSymbol(symbol: any): symbol is PinnedSymbol {
        if (!symbol || typeof symbol !== 'object') {
            return false;
        }

        // 检查必需的属性
        if (!symbol.id || !symbol.name || typeof symbol.kind !== 'number') {
            return false;
        }

        // 检查 URI
        if (!symbol.uri) {
            return false;
        }

        // 检查 range 对象的完整性
        if (!symbol.range || 
            !symbol.range.start || 
            !symbol.range.end ||
            typeof symbol.range.start.line !== 'number' ||
            typeof symbol.range.start.character !== 'number' ||
            typeof symbol.range.end.line !== 'number' ||
            typeof symbol.range.end.character !== 'number') {
            return false;
        }

        // 检查时间戳
        if (!symbol.timestamp || typeof symbol.timestamp !== 'number') {
            return false;
        }

        return true;
    }

    private savePinnedSymbols() {
        this.context.globalState.update('CCoding.pinnedSymbols', this.pinnedSymbols);
    }

    /**
     * 当前搜索状态
     */
    private searchQuery: string = '';
    private searchScope: 'current' | 'all' = 'current';

    /**
     * 搜索置顶符号
     * @param query - 搜索查询
     * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
     * @description 在置顶符号名称、类型和文件名中搜索匹配的内容，结果直接在树视图中过滤显示
     */
    async searchPinnedSymbols(query: string, scope: 'current' | 'all'): Promise<void> {
        this.searchQuery = query ? query.toLowerCase().trim() : '';
        this.searchScope = scope;
        
        // 直接刷新树视图，使用新的搜索条件
        this.refresh();
    }

    /**
     * 清除搜索状态
     */
    clearSearch(): void {
        this.searchQuery = '';
        this.refresh();
    }

    /**
     * 获取符号类型的中文名称
     * @param kind 符号类型
     * @returns 中文类型名称
     */
    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return '函数';
            case vscode.SymbolKind.Method:
                return '方法';
            case vscode.SymbolKind.Class:
                return '类';
            case vscode.SymbolKind.Constructor:
                return '构造函数';
            case vscode.SymbolKind.Variable:
                return '变量';
            case vscode.SymbolKind.Constant:
                return '常量';
            case vscode.SymbolKind.Property:
                return '属性';
            case vscode.SymbolKind.Interface:
                return '接口';
            case vscode.SymbolKind.Enum:
                return '枚举';
            case vscode.SymbolKind.Field:
                return '字段';
            default:
                return '符号';
        }
    }
}

class PinnedSymbolItem extends vscode.TreeItem {
    constructor(public readonly pinnedSymbol: PinnedSymbol) {
        super(pinnedSymbol.name, vscode.TreeItemCollapsibleState.None);

        try {
            const fileName = vscode.workspace.asRelativePath(pinnedSymbol.uri);
            const symbolTypeName = this.getSymbolTypeName(pinnedSymbol.kind);
            const lineNumber = pinnedSymbol.range?.start?.line ? pinnedSymbol.range.start.line + 1 : 1;
            const timeAgo = this.getTimeAgo(pinnedSymbol.timestamp || Date.now());
            
            // 主标签：符号名称
            this.label = pinnedSymbol.name || '未知符号';
            
            // 描述：符号类型 + 行号
            this.description = `${symbolTypeName} · L${lineNumber}`;
            
            // 详细信息：文件名 + 置顶时间
            const shortFileName = this.getShortFileName(fileName);
            this.tooltip = this.buildTooltip(pinnedSymbol.name || '未知符号', symbolTypeName, fileName, lineNumber, timeAgo);
            
            // 右侧显示文件名（缩短）
            this.resourceUri = pinnedSymbol.uri;
            
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [pinnedSymbol.uri, {
                    selection: pinnedSymbol.range
                }]
            };

            this.iconPath = this.getIconForSymbolKind(pinnedSymbol.kind);
            this.contextValue = 'pinnedSymbol';
        } catch (error) {
            console.error('Error creating PinnedSymbolItem:', error);
            // 创建一个安全的fallback显示
            this.label = pinnedSymbol.name || '错误的符号';
            this.description = '数据损坏';
            this.tooltip = '此符号数据已损坏，请移除并重新置顶';
            this.iconPath = new vscode.ThemeIcon('error');
            this.contextValue = 'pinnedSymbol';
        }
    }

    /**
     * 获取符号类型的中文名称
     * @param kind 符号类型
     * @returns 中文类型名称
     */
    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return '函数';
            case vscode.SymbolKind.Method:
                return '方法';
            case vscode.SymbolKind.Class:
                return '类';
            case vscode.SymbolKind.Constructor:
                return '构造函数';
            case vscode.SymbolKind.Variable:
                return '变量';
            case vscode.SymbolKind.Constant:
                return '常量';
            case vscode.SymbolKind.Property:
                return '属性';
            case vscode.SymbolKind.Interface:
                return '接口';
            case vscode.SymbolKind.Enum:
                return '枚举';
            case vscode.SymbolKind.Field:
                return '字段';
            default:
                return '符号';
        }
    }

    /**
     * 获取符号类型对应的图标
     * @param kind 符号类型
     * @returns VSCode图标
     */
    private getIconForSymbolKind(kind: vscode.SymbolKind): vscode.ThemeIcon {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('symbolIcon.functionForeground'));
            case vscode.SymbolKind.Method:
                return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
            case vscode.SymbolKind.Class:
                return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'));
            case vscode.SymbolKind.Constructor:
                return new vscode.ThemeIcon('symbol-constructor', new vscode.ThemeColor('symbolIcon.constructorForeground'));
            case vscode.SymbolKind.Variable:
                return new vscode.ThemeIcon('symbol-variable', new vscode.ThemeColor('symbolIcon.variableForeground'));
            case vscode.SymbolKind.Constant:
                return new vscode.ThemeIcon('symbol-constant', new vscode.ThemeColor('symbolIcon.constantForeground'));
            case vscode.SymbolKind.Property:
                return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('symbolIcon.propertyForeground'));
            case vscode.SymbolKind.Interface:
                return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('symbolIcon.interfaceForeground'));
            case vscode.SymbolKind.Enum:
                return new vscode.ThemeIcon('symbol-enum', new vscode.ThemeColor('symbolIcon.enumForeground'));
            case vscode.SymbolKind.Field:
                return new vscode.ThemeIcon('symbol-field', new vscode.ThemeColor('symbolIcon.fieldForeground'));
            default:
                return new vscode.ThemeIcon('pin', new vscode.ThemeColor('charts.purple'));
        }
    }

    /**
     * 获取文件名的简短版本
     * @param fileName 完整文件名/路径
     * @returns 简短文件名
     */
    private getShortFileName(fileName: string): string {
        const parts = fileName.split('/');
        
        // 如果路径很深，只显示最后2级
        if (parts.length > 2) {
            return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
        }
        
        return fileName;
    }

    /**
     * 获取相对时间描述
     * @param timestamp 时间戳
     * @returns 相对时间字符串
     */
    private getTimeAgo(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (minutes < 1) {
            return '刚刚';
        } else if (minutes < 60) {
            return `${minutes}分钟前`;
        } else if (hours < 24) {
            return `${hours}小时前`;
        } else if (days < 7) {
            return `${days}天前`;
        } else {
            const date = new Date(timestamp);
            return date.toLocaleDateString('zh-CN', { 
                month: 'short', 
                day: 'numeric' 
            });
        }
    }

    /**
     * 构建详细的提示信息
     * @param name 符号名称
     * @param type 符号类型
     * @param fileName 文件名
     * @param line 行号
     * @param timeAgo 置顶时间
     * @returns 提示文本
     */
    private buildTooltip(name: string, type: string, fileName: string, line: number, timeAgo: string): string {
        return [
            `📌 ${name}`,
            `📄 类型: ${type}`,
            `📁 文件: ${fileName}`,
            `📍 位置: 第 ${line} 行`,
            `⏰ 置顶: ${timeAgo}`
        ].join('\n');
    }
}
