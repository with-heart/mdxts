import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { IRawGrammar, Registry, parseRawGrammar } from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import { wireTextMateGrammars } from './textmate'
import { parseHex } from './utils'

export type ScopeName = string

const grammarPaths: Record<string, string> = {
  'source.ts': 'typescript.tmLanguage.json',
  'source.tsx': 'tsx.tmLanguage.json',
}

async function loadVSCodeOnigurumWASM() {
  const onigasmModule = await import(
    // @ts-expect-error
    'vscode-oniguruma/release/onig.wasm'
  )
  const response = await fetch(onigasmModule.default)
  try {
    const data: ArrayBuffer | Response = await (response as any).arrayBuffer()
    loadWASM(data)
  } catch (error) {
    console.error(`Failed to load vscode-oniguruma: ${error}`)
  }
}

export async function initializeMonaco(monaco: any, editor: any, theme: any) {
  await loadVSCodeOnigurumWASM()

  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    async loadGrammar(scopeName: ScopeName): Promise<IRawGrammar | null> {
      const path = grammarPaths[scopeName]
      const uri = `/mdxts/${path}`
      const response = await fetch(uri)
      const grammar = await response.text()

      return parseRawGrammar(grammar, path)
    },
    theme,
  })
  const grammars = new Map()

  grammars.set('typescript', 'source.ts')
  grammars.set('typescript', 'source.tsx')

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    esModuleInterop: true,
  })

  await wireTextMateGrammars(registry, grammars, editor)

  await injectCSS(registry)
}

export function generateTokensCSSForColorMap(colorMap: any): string {
  const rules: string[] = []
  for (let i = 1, len = colorMap.length; i < len; i++) {
    const color = colorMap[i]
    rules[i] = `.mtk${i} { color: ${color}; }`
  }
  rules.push('.mtki { font-style: italic; }')
  rules.push('.mtkb { font-weight: bold; }')
  rules.push(
    '.mtku { text-decoration: underline; text-underline-position: under; }'
  )
  rules.push('.mtks { text-decoration: line-through; }')
  rules.push(
    '.mtks.mtku { text-decoration: underline line-through; text-underline-position: under; }'
  )
  return rules.join('\n')
}

async function injectCSS(registry) {
  const cssColors = registry.getColorMap()
  const colorMap = cssColors.map(parseHex)
  const css = generateTokensCSSForColorMap(colorMap)
  const style = createStyleElementForColorsCSS()
  console.log({
    cssColors,
    colorMap,
    css,
  })
  style.innerHTML = css
}

function createStyleElementForColorsCSS() {
  // We want to ensure that our <style> element appears after Monaco's so that
  // we can override some styles it inserted for the default theme.
  const style = document.createElement('style')

  // We expect the styles we need to override to be in an element with the class
  // name 'monaco-colors' based on:
  // https://github.com/microsoft/vscode/blob/f78d84606cd16d75549c82c68888de91d8bdec9f/src/vs/editor/standalone/browser/standaloneThemeServiceImpl.ts#L206-L214
  const monacoColors = document.getElementsByClassName('monaco-colors')[0]
  if (monacoColors) {
    monacoColors.parentElement?.insertBefore(style, monacoColors.nextSibling)
  } else {
    // Though if we cannot find it, just append to <head>.
    let { head } = document
    if (head == null) {
      head = document.getElementsByTagName('head')[0]
    }
    head?.appendChild(style)
  }
  return style
}
