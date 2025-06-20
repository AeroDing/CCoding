import * as vscode from 'vscode';

interface TodoItem {
    text: string;
    file: string;
    line: number;
    column: number;
    type: 'TODO' | 'FIXME' | 'NOTE' | 'HACK' | 'BUG';
}

export class TodoProvider implements vscode.TreeDataProvider<TodoTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<TodoTreeItem | undefined | null | void> = new vscode.EventEmitter<TodoTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TodoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private todos: TodoItem[] = [];
    private todoRegex = /(?:\/\/|\/\*|#|\*)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\s*\(([^)]+)\))?\s*:?\s*(.+)/gi;
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private isScanning: boolean = false;
    private scanTimeout: NodeJS.Timeout | undefined;
    private currentTab: 'current' | 'all' = 'current';

    constructor() {
        this.initDecorationTypes();
        this.refresh();
        this.setupEventListeners();
    }

    /**
     * 设置当前Tab状态
     * @param tab - 当前选择的Tab类型
     * @description 外部调用此方法来更新Tab状态并刷新显示
     */
    setCurrentTab(tab: 'current' | 'all'): void {
        if (this.currentTab !== tab) {
            this.currentTab = tab;
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * 刷新待办列表
     * @description 防抖处理，避免频繁扫描
     */
    refresh(): void {
        // 如果正在扫描中，则跳过
        if (this.isScanning) {
            return;
        }

        // 清除之前的延时器
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }

        // 设置300ms的防抖延时
        this.scanTimeout = setTimeout(() => {
            this.scanForTodos();
        }, 300);
    }

    /**
     * 强制刷新，立即扫描
     * @description 用于用户手动触发的刷新
     */
    forceRefresh(): void {
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }
        this.scanForTodos();
    }

    getTreeItem(element: TodoTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TodoTreeItem): Thenable<TodoTreeItem[]> {
        if (!element) {
            const filteredTodos = this.getFilteredTodos();
            const groupedTodos = this.groupTodosByType(filteredTodos);
            return Promise.resolve(Object.keys(groupedTodos).map(type => 
                new TodoTreeItem(type, groupedTodos[type], true)
            ));
        } else if (element.isGroup) {
            return Promise.resolve(element.todos.map(todo => new TodoTreeItem(todo.text, [todo], false)));
        }
        return Promise.resolve([]);
    }

    /**
     * 根据当前Tab状态过滤待办事项
     * @returns 过滤后的待办事项数组
     * @description 当Tab为'current'时只返回当前文件的待办事项，为'all'时返回所有待办事项
     */
    private getFilteredTodos(): TodoItem[] {
        let todos: TodoItem[] = [];
        
        // 根据当前tab获取基础数据
        if (this.currentTab === 'current') {
            todos = this.getCurrentFileTodos();
        } else {
            todos = this.todos;
        }
        
        // 应用搜索过滤
        if (this.searchQuery) {
            todos = todos.filter(todo => {
                return todo.text.toLowerCase().includes(this.searchQuery) ||
                       todo.file.toLowerCase().includes(this.searchQuery) ||
                       todo.type.toLowerCase().includes(this.searchQuery);
            });
        }
        
        return todos;
    }

    /**
     * 获取当前文件的待办事项
     * @returns 当前文件的待办事项数组
     * @description 如果没有打开的编辑器，返回空数组
     */
    private getCurrentFileTodos(): TodoItem[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }
        
        const currentFilePath = vscode.workspace.asRelativePath(editor.document.uri);
        return this.todos.filter(todo => todo.file === currentFilePath);
    }

    private async scanForTodos() {
        if (this.isScanning) {
            return;
        }

        this.isScanning = true;
        this.todos = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders) {
            this.isScanning = false;
            return;
        }

        try {
            for (const folder of workspaceFolders) {
                await this.scanFolder(folder.uri);
            }

            vscode.commands.executeCommand('setContext', 'CCoding.hasTodos', this.todos.length > 0);
            this._onDidChangeTreeData.fire();
            this.updateDecorations();
        } catch (error) {
            console.error('Error scanning for todos:', error);
        } finally {
            this.isScanning = false;
        }
    }

    private async scanFolder(folderUri: vscode.Uri) {
        const pattern = new vscode.RelativePattern(folderUri, '**/*.{js,ts,jsx,tsx,vue,py,java,c,cpp,cs,php,rb,go,rs,swift}');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

        for (const file of files) {
            await this.scanFile(file);
        }
    }

    private async scanFile(fileUri: vscode.Uri) {
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const content = document.getText();
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const regex = /(?:\/\/|\/\*|#|\*)\s*(TODO|FIXME|NOTE|HACK|BUG)(?:\s*\(([^)]+)\))?\s*:?\s*(.+)/gi;
                let match;
                
                while ((match = regex.exec(line)) !== null) {
                    const [, type, author, text] = match;
                    const todoItem: TodoItem = {
                        text: text.trim(),
                        file: vscode.workspace.asRelativePath(fileUri),
                        line: index,
                        column: match.index,
                        type: type.toUpperCase() as TodoItem['type']
                    };
                    
                    this.todos.push(todoItem);
                }
            });
        } catch (error) {
            console.error(`Error scanning file ${fileUri.fsPath}:`, error);
        }
    }

    private groupTodosByType(todos: TodoItem[]): { [key: string]: TodoItem[] } {
        const grouped: { [key: string]: TodoItem[] } = {};
        todos.forEach(todo => {
            if (!grouped[todo.type]) {
                grouped[todo.type] = [];
            }
            grouped[todo.type].push(todo);
        });
        return grouped;
    }

    private initDecorationTypes(): void {
        const todoTypes: TodoItem['type'][] = ['TODO', 'FIXME', 'NOTE', 'HACK', 'BUG'];
        todoTypes.forEach(type => {
            const colors = this.getColorsForTodoType(type);
            const decorationType = vscode.window.createTextEditorDecorationType({
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: colors.border,
                borderRadius: '3px',
                backgroundColor: colors.background,
                overviewRulerColor: colors.ruler,
                overviewRulerLane: vscode.OverviewRulerLane.Right,
                fontWeight: 'bold',
                light: {
                    borderColor: colors.lightBorder,
                    backgroundColor: colors.lightBackground,
                    color: colors.lightText
                },
                dark: {
                    borderColor: colors.darkBorder,
                    backgroundColor: colors.darkBackground,
                    color: colors.darkText
                }
            });
            this.decorationTypes.set(type, decorationType);
        });
    }

    /**
     * 获取待办类型对应的颜色配置
     * @param type 待办类型
     * @returns 颜色配置对象
     */
    private getColorsForTodoType(type: TodoItem['type']) {
        switch (type) {
            case 'TODO':
                return {
                    background: '#3498db20',
                    border: '#3498db80',
                    ruler: '#3498db',
                    lightBackground: '#3498db15',
                    lightBorder: '#3498db60',
                    lightText: '#2980b9',
                    darkBackground: '#3498db25',
                    darkBorder: '#3498db90',
                    darkText: '#74b9ff'
                };
            case 'FIXME':
                return {
                    background: '#e67e2220',
                    border: '#e67e2280',
                    ruler: '#e67e22',
                    lightBackground: '#e67e2215',
                    lightBorder: '#e67e2260',
                    lightText: '#d35400',
                    darkBackground: '#e67e2225',
                    darkBorder: '#e67e2290',
                    darkText: '#ffa502'
                };
            case 'NOTE':
                return {
                    background: '#2ecc7120',
                    border: '#2ecc7180',
                    ruler: '#2ecc71',
                    lightBackground: '#2ecc7115',
                    lightBorder: '#2ecc7160',
                    lightText: '#27ae60',
                    darkBackground: '#2ecc7125',
                    darkBorder: '#2ecc7190',
                    darkText: '#55efc4'
                };
            case 'HACK':
                return {
                    background: '#f1c40f20',
                    border: '#f1c40f80',
                    ruler: '#f1c40f',
                    lightBackground: '#f1c40f15',
                    lightBorder: '#f1c40f60',
                    lightText: '#f39c12',
                    darkBackground: '#f1c40f25',
                    darkBorder: '#f1c40f90',
                    darkText: '#fdcb6e'
                };
            case 'BUG':
                return {
                    background: '#e74c3c20',
                    border: '#e74c3c80',
                    ruler: '#e74c3c',
                    lightBackground: '#e74c3c15',
                    lightBorder: '#e74c3c60',
                    lightText: '#c0392b',
                    darkBackground: '#e74c3c25',
                    darkBorder: '#e74c3c90',
                    darkText: '#ff7675'
                };
            default:
                return {
                    background: '#95a5a620',
                    border: '#95a5a680',
                    ruler: '#95a5a6',
                    lightBackground: '#95a5a615',
                    lightBorder: '#95a5a660',
                    lightText: '#7f8c8d',
                    darkBackground: '#95a5a625',
                    darkBorder: '#95a5a690',
                    darkText: '#b2bec3'
                };
        }
    }

    private setupEventListeners(): void {
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateDecorations();
        });
    }

    private updateDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        const todoDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
        const currentFileTodos = this.todos.filter(todo => 
            vscode.workspace.asRelativePath(document.uri) === todo.file
        );
        
        currentFileTodos.forEach(todo => {
            const line = document.lineAt(todo.line);
            const lineText = line.text;
            
            // 重新查找待办项在当前行的精确位置
            const regex = new RegExp(`(${todo.type})(?:\\s*\\([^)]+\\))?\\s*:?\\s*(.+)`, 'i');
            const match = lineText.match(regex);
            
            if (match) {
                const todoStart = lineText.indexOf(match[0]);
                const todoEnd = todoStart + match[0].length;
                
                // 只高亮待办项部分，不包括注释符号
                const range = new vscode.Range(
                    new vscode.Position(todo.line, todoStart),
                    new vscode.Position(todo.line, todoEnd)
                );
                
                const decoration: vscode.DecorationOptions = {
                    range: range,
                    hoverMessage: `**${todo.type}**: ${todo.text}\n\n📁 ${todo.file}:${todo.line + 1}`
                };
                
                if (!todoDecorations.has(todo.type)) {
                    todoDecorations.set(todo.type, []);
                }
                todoDecorations.get(todo.type)!.push(decoration);
            }
        });
        
        // 应用装饰
        this.decorationTypes.forEach((decorationType, type) => {
            const decorations = todoDecorations.get(type) || [];
            editor.setDecorations(decorationType, decorations);
        });
    }

    dispose(): void {
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();
    }

    /**
     * 当前搜索状态
     */
    private searchQuery: string = '';
    private searchScope: 'current' | 'all' = 'current';

    /**
     * 搜索待办事项
     * @param query - 搜索查询
     * @param scope - 搜索范围：'current' 当前文件 | 'all' 所有文件
     * @description 在待办事项文本和文件名中搜索匹配的内容，结果直接在树视图中过滤显示
     */
    async searchTodos(query: string, scope: 'current' | 'all'): Promise<void> {
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
}

class TodoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly todos: TodoItem[],
        public readonly isGroup: boolean
    ) {
        super(
            label, 
            isGroup ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
        );
        if (isGroup) {
            this.description = `${todos.length} item${todos.length > 1 ? 's' : ''}`;
            this.iconPath = new vscode.ThemeIcon(this.getIconForTodoType(label as TodoItem['type']), this.getColorForTodoType(label as TodoItem['type']));
        } else {
            const todo = todos[0];
            this.description = `${todo.file}:${todo.line + 1}`;
            this.tooltip = `${todo.text}\n${todo.file}:${todo.line + 1}`;
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [
                    vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath + '/' + todo.file),
                    {
                        selection: new vscode.Range(
                            new vscode.Position(todo.line, todo.column),
                            new vscode.Position(todo.line, todo.column + todo.text.length)
                        )
                    }
                ]
            };
            this.iconPath = new vscode.ThemeIcon('circle-outline', this.getColorForTodoType(todo.type));
        }
    }
    private getIconForTodoType(type: TodoItem['type']): string {
        switch (type) {
            case 'TODO':
                return 'check';
            case 'FIXME':
                return 'tools';
            case 'NOTE':
                return 'note';
            case 'HACK':
                return 'warning';
            case 'BUG':
                return 'bug';
            default:
                return 'circle-outline';
        }
    }
    private getColorForTodoType(type: TodoItem['type']): vscode.ThemeColor {
        switch (type) {
            case 'TODO':
                return new vscode.ThemeColor('charts.blue');
            case 'FIXME':
                return new vscode.ThemeColor('charts.orange');
            case 'NOTE':
                return new vscode.ThemeColor('charts.green');
            case 'HACK':
                return new vscode.ThemeColor('charts.yellow');
            case 'BUG':
                return new vscode.ThemeColor('charts.red');
            default:
                return new vscode.ThemeColor('foreground');
        }
    }
}
