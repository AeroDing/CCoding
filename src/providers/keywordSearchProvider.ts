import * as vscode from 'vscode';

interface SearchResult {
    file: string;
    line: number;
    column: number;
    text: string;
    context: string;
}

export class KeywordSearchProvider {
    private searchHistory: string[] = [];
    private maxHistoryItems = 20;

    async searchKeywords() {
        const keyword = await vscode.window.showInputBox({
            prompt: 'Enter keyword to search',
            placeHolder: 'Search for functions, variables, classes...',
            value: this.getLastSearch()
        });

        if (!keyword) {
            return;
        }

        this.addToHistory(keyword);
        await this.performSearch(keyword);
    }

    async searchInCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const keyword = await vscode.window.showInputBox({
            prompt: 'Enter keyword to search in current file',
            placeHolder: 'Search for functions, variables, classes...'
        });

        if (!keyword) {
            return;
        }

        const document = editor.document;
        const results = this.searchInDocument(document, keyword);
        
        if (results.length === 0) {
            vscode.window.showInformationMessage(`No results found for "${keyword}"`);
            return;
        }

        await this.showSearchResults(results, keyword);
    }

    async showSearchHistory() {
        if (this.searchHistory.length === 0) {
            vscode.window.showInformationMessage('No search history');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            this.searchHistory.map(keyword => ({
                label: keyword,
                description: 'Search again'
            })),
            {
                placeHolder: 'Select a previous search'
            }
        );

        if (selected) {
            await this.performSearch(selected.label);
        }
    }

    private async performSearch(keyword: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Searching for "${keyword}"...`,
            cancellable: true
        }, async (progress, token) => {
            const results: SearchResult[] = [];
            
            for (const folder of workspaceFolders) {
                if (token.isCancellationRequested) {
                    break;
                }

                const folderResults = await this.searchInFolder(folder.uri, keyword, progress, token);
                results.push(...folderResults);
            }

            if (!token.isCancellationRequested) {
                if (results.length === 0) {
                    vscode.window.showInformationMessage(`No results found for "${keyword}"`);
                } else {
                    await this.showSearchResults(results, keyword);
                }
            }
        });
    }

    private async searchInFolder(
        folderUri: vscode.Uri, 
        keyword: string, 
        progress: vscode.Progress<{message?: string; increment?: number}>,
        token: vscode.CancellationToken
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const pattern = new vscode.RelativePattern(folderUri, '**/*.{js,ts,jsx,tsx,vue,py,java,c,cpp,cs,php,rb,go,rs,swift}');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

        const totalFiles = files.length;
        let processedFiles = 0;

        for (const file of files) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const document = await vscode.workspace.openTextDocument(file);
                const fileResults = this.searchInDocument(document, keyword);
                results.push(...fileResults);

                processedFiles++;
                progress.report({
                    message: `Searching... ${processedFiles}/${totalFiles} files`,
                    increment: (100 / totalFiles)
                });
            } catch (error) {
                console.error(`Error searching file ${file.fsPath}:`, error);
            }
        }

        return results;
    }

    private searchInDocument(document: vscode.TextDocument, keyword: string): SearchResult[] {
        const results: SearchResult[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

        lines.forEach((line, lineIndex) => {
            let match;
            while ((match = regex.exec(line)) !== null) {
                const contextStart = Math.max(0, match.index - 20);
                const contextEnd = Math.min(line.length, match.index + keyword.length + 20);
                const context = line.substring(contextStart, contextEnd);

                results.push({
                    file: vscode.workspace.asRelativePath(document.uri),
                    line: lineIndex,
                    column: match.index,
                    text: match[0],
                    context: context
                });
            }
        });

        return results;
    }

    private async showSearchResults(results: SearchResult[], keyword: string) {
        const groupedResults = this.groupResultsByFile(results);
        const items = [];

        for (const [file, fileResults] of Object.entries(groupedResults)) {
            if (fileResults.length === 1) {
                const result = fileResults[0];
                items.push({
                    label: `$(symbol-file) ${file}`,
                    description: `Line ${result.line + 1}: ${result.context}`,
                    detail: `${fileResults.length} match`,
                    result: result
                });
            } else {
                items.push({
                    label: `$(symbol-file) ${file}`,
                    description: `${fileResults.length} matches`,
                    detail: fileResults.map(r => `Line ${r.line + 1}`).join(', '),
                    results: fileResults
                });
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a result for "${keyword}" (${results.length} matches in ${Object.keys(groupedResults).length} files)`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected) {
            if (selected.result) {
                await this.openSearchResult(selected.result);
            } else if (selected.results) {
                const subItems = selected.results.map((result: SearchResult) => ({
                    label: `Line ${result.line + 1}`,
                    description: result.context.trim(),
                    result: result
                }));

                const subSelected = await vscode.window.showQuickPick(subItems, {
                    placeHolder: `Select a match in ${selected.label}`
                }) as any;

                if (subSelected && subSelected.result) {
                    await this.openSearchResult(subSelected.result);
                }
            }
        }
    }

    private async openSearchResult(result: SearchResult) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, result.file);
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(result.line, result.column);
        const range = new vscode.Range(position, new vscode.Position(result.line, result.column + result.text.length));
        
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    private groupResultsByFile(results: SearchResult[]): { [file: string]: SearchResult[] } {
        const grouped: { [file: string]: SearchResult[] } = {};
        
        results.forEach(result => {
            if (!grouped[result.file]) {
                grouped[result.file] = [];
            }
            grouped[result.file].push(result);
        });

        return grouped;
    }

    private addToHistory(keyword: string) {
        const index = this.searchHistory.indexOf(keyword);
        if (index > -1) {
            this.searchHistory.splice(index, 1);
        }
        
        this.searchHistory.unshift(keyword);
        
        if (this.searchHistory.length > this.maxHistoryItems) {
            this.searchHistory = this.searchHistory.slice(0, this.maxHistoryItems);
        }
    }

    private getLastSearch(): string {
        return this.searchHistory.length > 0 ? this.searchHistory[0] : '';
    }
}