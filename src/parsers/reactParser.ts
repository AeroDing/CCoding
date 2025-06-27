import * as vscode from 'vscode'

export interface ReactComponent {
  name: string
  type: 'functional' | 'class'
  props: ReactProp[]
  state?: ReactState[]
  methods: ReactMethod[]
  hooks: ReactHook[]
  imports: ReactImport[]
  exports: ReactExport[]
}

export interface ReactProp {
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  range: vscode.Range
}

export interface ReactState {
  name: string
  type?: string
  initialValue?: string
  range: vscode.Range
}

export interface ReactMethod {
  name: string
  params: string[]
  isLifecycle: boolean
  range: vscode.Range
}

export interface ReactHook {
  name: string
  type: 'useState' | 'useEffect' | 'useContext' | 'useReducer' | 'useMemo' | 'useCallback' | 'custom'
  dependencies?: string[]
  range: vscode.Range
}

export interface ReactImport {
  name: string
  from: string
  isDefault: boolean
  range: vscode.Range
}

export interface ReactExport {
  name: string
  isDefault: boolean
  range: vscode.Range
}

export class ReactParser {
  private static readonly LIFECYCLE_METHODS = [
    'componentDidMount',
    'componentDidUpdate',
    'componentWillUnmount',
    'shouldComponentUpdate',
    'getSnapshotBeforeUpdate',
    'componentDidCatch',
    'getDerivedStateFromProps',
    'getDerivedStateFromError',
  ]

  private static readonly REACT_HOOKS = [
    'useState',
    'useEffect',
    'useContext',
    'useReducer',
    'useMemo',
    'useCallback',
    'useRef',
    'useImperativeHandle',
    'useLayoutEffect',
    'useDebugValue',
  ]

  static parseReactFile(document: vscode.TextDocument): ReactComponent | null {
    const content = document.getText()
    const fileName = document.uri.fsPath.split('/').pop()?.replace(/\.(jsx?|tsx?)$/, '') || 'Component'

    if (!this.isReactFile(content)) {
      return null
    }

    const componentType = this.detectComponentType(content)
    const imports = this.parseImports(content, document)
    const exports = this.parseExports(content, document)

    if (componentType === 'class') {
      return this.parseClassComponent(content, document, fileName, imports, exports)
    }
    else {
      return this.parseFunctionalComponent(content, document, fileName, imports, exports)
    }
  }

  private static isReactFile(content: string): boolean {
    return content.includes('import React')
      || content.includes('from \'react\'')
      || content.includes('from "react"')
      || content.includes('JSX.Element')
      || content.includes('React.Component')
      || content.includes('React.FC')
  }

  private static detectComponentType(content: string): 'functional' | 'class' {
    if (content.includes('extends React.Component') || content.includes('extends Component')) {
      return 'class'
    }
    return 'functional'
  }

  private static parseClassComponent(
    content: string,
    document: vscode.TextDocument,
    fileName: string,
    imports: ReactImport[],
    exports: ReactExport[],
  ): ReactComponent {
    const _lines = document.getText().split('\n')

    return {
      name: fileName,
      type: 'class',
      props: this.parseProps(content, document),
      state: this.parseState(content, document),
      methods: this.parseMethods(content, document),
      hooks: [],
      imports,
      exports,
    }
  }

  private static parseFunctionalComponent(
    content: string,
    document: vscode.TextDocument,
    fileName: string,
    imports: ReactImport[],
    exports: ReactExport[],
  ): ReactComponent {
    return {
      name: fileName,
      type: 'functional',
      props: this.parseProps(content, document),
      methods: this.parseMethods(content, document),
      hooks: this.parseHooks(content, document),
      imports,
      exports,
    }
  }

  private static parseImports(content: string, document: vscode.TextDocument): ReactImport[] {
    const imports: ReactImport[] = []
    const lines = document.getText().split('\n')

    const importRegex = /import\s+(?:(\w+)|\{([^}]+)\}|\*\s+as\s+(\w+))\s+from\s+['"`]([^'"`]+)['"`]/g
    let match

    match = importRegex.exec(content)
    while (match !== null) {
      const [fullMatch, defaultImport, namedImports, namespaceImport, fromModule] = match
      const lineIndex = lines.findIndex(line => line.includes(fullMatch))
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      if (defaultImport) {
        imports.push({
          name: defaultImport,
          from: fromModule,
          isDefault: true,
          range,
        })
      }

      if (namedImports) {
        const names = namedImports.split(',').map(name => name.trim())
        names.forEach((name) => {
          const cleanName = name.replace(/\s+as\s+\w+/, '').trim()
          imports.push({
            name: cleanName,
            from: fromModule,
            isDefault: false,
            range,
          })
        })
      }

      if (namespaceImport) {
        imports.push({
          name: namespaceImport,
          from: fromModule,
          isDefault: false,
          range,
        })
      }
      match = importRegex.exec(content)
    }

    return imports
  }

  private static parseExports(content: string, document: vscode.TextDocument): ReactExport[] {
    const exports: ReactExport[] = []
    const lines = document.getText().split('\n')

    const exportRegex = /export\s+(?:default\s+)?(?:const|function|class)\s+(\w+)/g
    const defaultExportRegex = /export\s+default\s+(\w+)/g

    let match

    match = exportRegex.exec(content)
    while (match !== null) {
      const exportName = match[1]
      const isDefault = match[0].includes('default')
      const lineIndex = lines.findIndex(line => line.includes(match[0]))
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      exports.push({
        name: exportName,
        isDefault,
        range,
      })
      match = exportRegex.exec(content)
    }

    match = defaultExportRegex.exec(content)
    while (match !== null) {
      const exportName = match[1]
      const lineIndex = lines.findIndex(line => line.includes(match[0]))
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      if (!exports.some(exp => exp.name === exportName && exp.isDefault)) {
        exports.push({
          name: exportName,
          isDefault: true,
          range,
        })
      }
      match = defaultExportRegex.exec(content)
    }

    return exports
  }

  private static parseProps(content: string, document: vscode.TextDocument): ReactProp[] {
    const props: ReactProp[] = []
    const lines = document.getText().split('\n')

    const propsTypeRegex = /interface\s+(\w+Props)\s*\{([^}]*)\}/g
    const propTypeRegex = /type\s+(\w+Props)\s*=\s*\{([^}]*)\}/g
    const functionPropsRegex = /(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*=>\s*\{))\s*\(\s*\{([^}]+)\}\s*(?:[:)]\s*)?\w*Props/g

    let match

    match = propsTypeRegex.exec(content)
    while (match !== null) {
      const propsContent = match[2]
      this.extractPropsFromContent(propsContent, props, document, lines)
      match = propsTypeRegex.exec(content)
    }

    match = propTypeRegex.exec(content)
    while (match !== null) {
      const propsContent = match[2]
      this.extractPropsFromContent(propsContent, props, document, lines)
      match = propTypeRegex.exec(content)
    }

    match = functionPropsRegex.exec(content)
    while (match !== null) {
      const propsContent = match[1]
      const propNames = propsContent.split(',').map(prop => prop.trim())

      propNames.forEach((propName) => {
        const cleanName = propName.split(':')[0].trim()
        const lineIndex = lines.findIndex(line => line.includes(cleanName))
        const range = lineIndex !== -1
          ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
          : new vscode.Range(0, 0, 0, 0)

        props.push({
          name: cleanName,
          range,
        })
      })
      match = functionPropsRegex.exec(content)
    }

    return props
  }

  private static extractPropsFromContent(
    propsContent: string,
    props: ReactProp[],
    document: vscode.TextDocument,
    lines: string[],
  ) {
    const propRegex = /(\w+)(\?)?\s*:\s*([^;,\n]+)/g
    let propMatch

    propMatch = propRegex.exec(propsContent)
    while (propMatch !== null) {
      const propName = propMatch[1]
      const optional = propMatch[2] === '?'
      const propType = propMatch[3].trim()

      const lineIndex = lines.findIndex(line =>
        line.includes(propName) && line.includes(':'),
      )
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      props.push({
        name: propName,
        type: propType,
        required: !optional,
        range,
      })
      propMatch = propRegex.exec(propsContent)
    }
  }

  private static parseState(content: string, document: vscode.TextDocument): ReactState[] {
    const state: ReactState[] = []
    const lines = document.getText().split('\n')

    const stateRegex = /state\s*=\s*\{([^}]*)\}/g
    let match

    match = stateRegex.exec(content)
    while (match !== null) {
      const stateContent = match[1]
      const stateItemRegex = /(\w+)\s*:\s*([^,}]+)/g
      let stateMatch

      stateMatch = stateItemRegex.exec(stateContent)
      while (stateMatch !== null) {
        const stateName = stateMatch[1]
        const initialValue = stateMatch[2].trim()

        const lineIndex = lines.findIndex(line =>
          line.includes(stateName) && line.includes(':'),
        )
        const range = lineIndex !== -1
          ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
          : new vscode.Range(0, 0, 0, 0)

        state.push({
          name: stateName,
          initialValue,
          type: this.inferTypeFromValue(initialValue),
          range,
        })
        stateMatch = stateItemRegex.exec(stateContent)
      }
      match = stateRegex.exec(content)
    }

    return state
  }

  private static parseMethods(content: string, document: vscode.TextDocument): ReactMethod[] {
    const methods: ReactMethod[] = []
    const lines = document.getText().split('\n')

    const methodRegex = /(\w+)\s*\([^)]*\)\s*\{|(\w+)\s*=\s*(?:\([^)]*\)\s*=>|async\s*\([^)]*\)\s*=>)/g
    let match

    match = methodRegex.exec(content)
    while (match !== null) {
      const methodName = match[1] || match[2]
      const isLifecycle = this.LIFECYCLE_METHODS.includes(methodName)

      const lineIndex = lines.findIndex(line =>
        line.includes(methodName) && (line.includes('(') || line.includes('=>')),
      )
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      const params = this.extractMethodParams(match[0])

      methods.push({
        name: methodName,
        params,
        isLifecycle,
        range,
      })
      match = methodRegex.exec(content)
    }

    return methods
  }

  private static parseHooks(content: string, document: vscode.TextDocument): ReactHook[] {
    const hooks: ReactHook[] = []
    const lines = document.getText().split('\n')

    this.REACT_HOOKS.forEach((hookName) => {
      const hookRegex = new RegExp(`(\\w+)\\s*=\\s*${hookName}\\s*\\([^)]*\\)`, 'g')
      let match

      match = hookRegex.exec(content)
      while (match !== null) {
        const variableName = match[1]
        const lineIndex = lines.findIndex(line => line.includes(match[0]))
        const range = lineIndex !== -1
          ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
          : new vscode.Range(0, 0, 0, 0)

        const dependencies = this.extractHookDependencies(match[0])

        hooks.push({
          name: variableName,
          type: hookName as ReactHook['type'],
          dependencies,
          range,
        })
        match = hookRegex.exec(content)
      }
    })

    const customHookRegex = /(\w+)\s*=\s*(use\w+)\s*\([^)]*\)/g
    let customMatch

    customMatch = customHookRegex.exec(content)
    while (customMatch !== null) {
      const variableName = customMatch[1]
      const _hookName = customMatch[2]

      const lineIndex = lines.findIndex(line => line.includes(customMatch[0]))
      const range = lineIndex !== -1
        ? new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length)
        : new vscode.Range(0, 0, 0, 0)

      hooks.push({
        name: variableName,
        type: 'custom',
        range,
      })
      customMatch = customHookRegex.exec(content)
    }

    return hooks
  }

  private static extractMethodParams(methodSignature: string): string[] {
    const paramsMatch = methodSignature.match(/\(([^)]*)\)/)
    if (!paramsMatch || !paramsMatch[1].trim()) {
      return []
    }

    return paramsMatch[1].split(',').map(param => param.trim())
  }

  private static extractHookDependencies(hookCall: string): string[] | undefined {
    const depsMatch = hookCall.match(/\[([^\]]*)\]/)
    if (!depsMatch || !depsMatch[1].trim()) {
      return undefined
    }

    return depsMatch[1].split(',').map(dep => dep.trim())
  }

  private static inferTypeFromValue(value: string): string | undefined {
    if (value.startsWith('"') || value.startsWith('\'') || value.startsWith('`'))
      return 'string'
    if (/^\d+$/.test(value))
      return 'number'
    if (value === 'true' || value === 'false')
      return 'boolean'
    if (value.startsWith('['))
      return 'array'
    if (value.startsWith('{'))
      return 'object'
    if (value === 'null')
      return 'null'
    if (value === 'undefined')
      return 'undefined'
    return undefined
  }
}
