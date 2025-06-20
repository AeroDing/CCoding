import * as vscode from 'vscode';

export interface VueComponent {
    name: string;
    props: VueProp[];
    methods: VueMethod[];
    computed: VueComputed[];
    data: VueData[];
    lifecycle: VueLifecycle[];
    template: VueTemplate | null;
    style: VueStyle[];
}

export interface VueProp {
    name: string;
    type?: string;
    required?: boolean;
    default?: string;
    range: vscode.Range;
}

export interface VueMethod {
    name: string;
    params: string[];
    range: vscode.Range;
}

export interface VueComputed {
    name: string;
    getter: boolean;
    setter: boolean;
    range: vscode.Range;
}

export interface VueData {
    name: string;
    type?: string;
    range: vscode.Range;
}

export interface VueLifecycle {
    name: string;
    range: vscode.Range;
}

export interface VueTemplate {
    directives: VueDirective[];
    components: string[];
    range: vscode.Range;
}

export interface VueDirective {
    name: string;
    value?: string;
    range: vscode.Range;
}

export interface VueStyle {
    scoped: boolean;
    lang?: string;
    range: vscode.Range;
}

export class VueParser {
    private static readonly LIFECYCLE_HOOKS = [
        'beforeCreate', 'created', 'beforeMount', 'mounted',
        'beforeUpdate', 'updated', 'beforeUnmount', 'unmounted',
        'errorCaptured', 'renderTracked', 'renderTriggered'
    ];

    static parseVueFile(document: vscode.TextDocument): VueComponent | null {
        const content = document.getText();
        
        if (!content.includes('<template>') && !content.includes('<script>')) {
            return null;
        }

        const scriptContent = this.extractScriptContent(content);
        if (!scriptContent) {
            return null;
        }

        const fileName = document.uri.fsPath.split('/').pop()?.replace('.vue', '') || 'Component';
        
        return {
            name: fileName,
            props: this.parseProps(scriptContent, document),
            methods: this.parseMethods(scriptContent, document),
            computed: this.parseComputed(scriptContent, document),
            data: this.parseData(scriptContent, document),
            lifecycle: this.parseLifecycle(scriptContent, document),
            template: this.parseTemplate(content, document),
            style: this.parseStyle(content, document)
        };
    }

    private static extractScriptContent(content: string): string | null {
        const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        return scriptMatch ? scriptMatch[1] : null;
    }

    private static parseProps(scriptContent: string, document: vscode.TextDocument): VueProp[] {
        const props: VueProp[] = [];
        const lines = document.getText().split('\n');
        
        const propsRegex = /props\s*:\s*\{([^}]*)\}/s;
        const propMatch = scriptContent.match(propsRegex);
        
        if (propMatch) {
            const propsContent = propMatch[1];
            const propItemRegex = /(\w+)\s*:\s*({[^}]*}|\w+)/g;
            let match;
            
            while ((match = propItemRegex.exec(propsContent)) !== null) {
                const propName = match[1];
                const propDef = match[2];
                
                const lineIndex = lines.findIndex(line => line.includes(propName) && line.includes(':'));
                if (lineIndex !== -1) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
                    
                    props.push({
                        name: propName,
                        type: this.extractPropType(propDef),
                        required: propDef.includes('required: true'),
                        default: this.extractPropDefault(propDef),
                        range
                    });
                }
            }
        }
        
        return props;
    }

    private static parseMethods(scriptContent: string, document: vscode.TextDocument): VueMethod[] {
        const methods: VueMethod[] = [];
        const lines = document.getText().split('\n');
        
        const methodsRegex = /methods\s*:\s*\{([^}]*)\}/s;
        const methodsMatch = scriptContent.match(methodsRegex);
        
        if (methodsMatch) {
            const methodsContent = methodsMatch[1];
            const methodRegex = /(\w+)\s*\([^)]*\)\s*\{/g;
            let match;
            
            while ((match = methodRegex.exec(methodsContent)) !== null) {
                const methodName = match[1];
                const lineIndex = lines.findIndex(line => 
                    line.includes(methodName) && line.includes('(') && line.includes(')')
                );
                
                if (lineIndex !== -1) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
                    const params = this.extractMethodParams(match[0]);
                    
                    methods.push({
                        name: methodName,
                        params,
                        range
                    });
                }
            }
        }
        
        return methods;
    }

    private static parseComputed(scriptContent: string, document: vscode.TextDocument): VueComputed[] {
        const computed: VueComputed[] = [];
        const lines = document.getText().split('\n');
        
        const computedRegex = /computed\s*:\s*\{([^}]*)\}/s;
        const computedMatch = scriptContent.match(computedRegex);
        
        if (computedMatch) {
            const computedContent = computedMatch[1];
            const computedItemRegex = /(\w+)\s*(?:\(\)|:\s*(?:function|\{|[^,}]+))/g;
            let match;
            
            while ((match = computedItemRegex.exec(computedContent)) !== null) {
                const computedName = match[1];
                const lineIndex = lines.findIndex(line => 
                    line.includes(computedName) && (line.includes('()') || line.includes(':'))
                );
                
                if (lineIndex !== -1) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
                    const definition = match[0];
                    
                    computed.push({
                        name: computedName,
                        getter: true,
                        setter: definition.includes('set'),
                        range
                    });
                }
            }
        }
        
        return computed;
    }

    private static parseData(scriptContent: string, document: vscode.TextDocument): VueData[] {
        const data: VueData[] = [];
        const lines = document.getText().split('\n');
        
        const dataRegex = /data\s*\(\s*\)\s*\{[\s\S]*?return\s*\{([^}]*)\}/s;
        const dataMatch = scriptContent.match(dataRegex);
        
        if (dataMatch) {
            const dataContent = dataMatch[1];
            const dataItemRegex = /(\w+)\s*:\s*([^,}]+)/g;
            let match;
            
            while ((match = dataItemRegex.exec(dataContent)) !== null) {
                const dataName = match[1];
                const dataValue = match[2].trim();
                
                const lineIndex = lines.findIndex(line => 
                    line.includes(dataName) && line.includes(':')
                );
                
                if (lineIndex !== -1) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
                    
                    data.push({
                        name: dataName,
                        type: this.inferTypeFromValue(dataValue),
                        range
                    });
                }
            }
        }
        
        return data;
    }

    private static parseLifecycle(scriptContent: string, document: vscode.TextDocument): VueLifecycle[] {
        const lifecycle: VueLifecycle[] = [];
        const lines = document.getText().split('\n');
        
        this.LIFECYCLE_HOOKS.forEach(hook => {
            const hookRegex = new RegExp(`${hook}\\s*\\([^)]*\\)\\s*\\{`, 'g');
            const match = scriptContent.match(hookRegex);
            
            if (match) {
                const lineIndex = lines.findIndex(line => line.includes(hook));
                if (lineIndex !== -1) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
                    lifecycle.push({
                        name: hook,
                        range
                    });
                }
            }
        });
        
        return lifecycle;
    }

    private static parseTemplate(content: string, document: vscode.TextDocument): VueTemplate | null {
        const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
        if (!templateMatch) {
            return null;
        }

        const templateContent = templateMatch[1];
        const lines = content.split('\n');
        const templateStartLine = lines.findIndex(line => line.includes('<template>'));
        const templateEndLine = lines.findIndex(line => line.includes('</template>'));
        
        if (templateStartLine === -1 || templateEndLine === -1) {
            return null;
        }

        const range = new vscode.Range(templateStartLine, 0, templateEndLine, lines[templateEndLine].length);
        
        return {
            directives: this.parseDirectives(templateContent, document),
            components: this.parseComponentUsage(templateContent),
            range
        };
    }

    private static parseDirectives(templateContent: string, document: vscode.TextDocument): VueDirective[] {
        const directives: VueDirective[] = [];
        const directiveRegex = /v-(\w+)(?:[:@](\w+))?(?:="([^"]+)"|='([^']+)')?/g;
        let match;
        
        while ((match = directiveRegex.exec(templateContent)) !== null) {
            const directiveName = `v-${match[1]}`;
            const value = match[3] || match[4] || '';
            
            directives.push({
                name: directiveName,
                value,
                range: new vscode.Range(0, 0, 0, 0)
            });
        }
        
        return directives;
    }

    private static parseComponentUsage(templateContent: string): string[] {
        const components: string[] = [];
        const componentRegex = /<([A-Z][a-zA-Z0-9-]*)/g;
        let match;
        
        while ((match = componentRegex.exec(templateContent)) !== null) {
            const componentName = match[1];
            if (!components.includes(componentName)) {
                components.push(componentName);
            }
        }
        
        return components;
    }

    private static parseStyle(content: string, document: vscode.TextDocument): VueStyle[] {
        const styles: VueStyle[] = [];
        const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/g;
        let match;
        
        while ((match = styleRegex.exec(content)) !== null) {
            const attributes = match[1];
            const scoped = attributes.includes('scoped');
            const langMatch = attributes.match(/lang="([^"]+)"/);
            const lang = langMatch ? langMatch[1] : undefined;
            
            const lines = content.split('\n');
            const styleStartLine = lines.findIndex(line => line.includes('<style'));
            const range = new vscode.Range(styleStartLine, 0, styleStartLine, lines[styleStartLine].length);
            
            styles.push({
                scoped,
                lang,
                range
            });
        }
        
        return styles;
    }

    private static extractPropType(propDef: string): string | undefined {
        if (propDef.includes('String')) return 'String';
        if (propDef.includes('Number')) return 'Number';
        if (propDef.includes('Boolean')) return 'Boolean';
        if (propDef.includes('Array')) return 'Array';
        if (propDef.includes('Object')) return 'Object';
        if (propDef.includes('Function')) return 'Function';
        return undefined;
    }

    private static extractPropDefault(propDef: string): string | undefined {
        const defaultMatch = propDef.match(/default:\s*([^,}]+)/);
        return defaultMatch ? defaultMatch[1].trim() : undefined;
    }

    private static extractMethodParams(methodSignature: string): string[] {
        const paramsMatch = methodSignature.match(/\(([^)]*)\)/);
        if (!paramsMatch || !paramsMatch[1].trim()) {
            return [];
        }
        
        return paramsMatch[1].split(',').map(param => param.trim());
    }

    private static inferTypeFromValue(value: string): string | undefined {
        if (value.startsWith('"') || value.startsWith("'")) return 'string';
        if (/^\d+$/.test(value)) return 'number';
        if (value === 'true' || value === 'false') return 'boolean';
        if (value.startsWith('[')) return 'array';
        if (value.startsWith('{')) return 'object';
        return undefined;
    }
}