import {
  INITIAL,
  Registry,
  parseRawGrammar,
  type StateStack,
} from 'vscode-textmate'
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma'
import type { Monaco, monaco, Grammars } from './types'
import { http } from './utils'

interface Config {
  monaco: Monaco
  grammars: Grammars
}

let isLoadedWASM = false

export type LanguageInfo = {
  tokensProvider: monaco.languages.EncodedTokensProvider | null
  configuration: monaco.languages.LanguageConfiguration | null
}

export class LanguageProvider {
  private monaco: Monaco
  private registry!: Registry
  private grammars: Grammars
  private disposes: monaco.IDisposable[] = []

  constructor(config: Config) {
    this.monaco = config.monaco
    this.grammars = config.grammars
  }

  public getRegistry() {
    return this.registry
  }

  public bindLanguage() {
    for (const [languageId] of Object.entries(this.grammars)) {
      console.log(`bind language: ${languageId}`)
      const item = this.grammars[languageId]
      if (item.extra) {
        this.monaco.languages.register(item.extra)
      }
      const dispose = this.monaco.languages.onLanguage(languageId, async () => {
        console.log(`register language: ${languageId}`)
        await this.registerLanguage(languageId)
      })
      this.disposes.push(dispose)
    }
  }

  public async loadRegistry() {
    if (!isLoadedWASM) {
      await loadWASM(await this.loadVSCodeOnigurumWASM())
      isLoadedWASM = true
    }
    const registry = new Registry({
      onigLib: Promise.resolve({
        createOnigScanner,
        createOnigString,
      }),
      loadGrammar: async (scopeName) => {
        const path = this.grammars[scopeName]
        const uri = `/mdxts/${path.tm}`
        const response = await fetch(uri)
        const grammar = await response.text()
        console.log(`load grammar: ${scopeName}`, grammar)
        return parseRawGrammar(grammar, path.tm)
        // const grammarKey = Object.keys(this.grammars).find(
        //   (key) => this.grammars[key].scopeName === scopeName
        // )
        // const grammar = this.grammars[grammarKey as keyof typeof this.grammars]
        // if (!grammar) {
        //   return Promise.resolve(null)
        // }
        // const response = await http(`${grammar.tm}`)
        // const type = grammar.tm.substring(grammar.tm.lastIndexOf('.') + 1)
        // return parseRawGrammar(response, `example.${type}`)
      },
    })

    this.registry = registry

    this.bindLanguage()
  }

  public async registerLanguage(languageId: string) {
    const { tokensProvider, configuration } =
      await this.fetchLanguageInfo(languageId)

    if (configuration !== null) {
      this.monaco.languages.setLanguageConfiguration(languageId, configuration)
    }

    if (tokensProvider !== null) {
      this.monaco.languages.setTokensProvider(languageId, tokensProvider)
    }
  }

  public async fetchLanguageInfo(languageId: string): Promise<LanguageInfo> {
    const [configuration, tokensProvider] = await Promise.all([
      this.getConfiguration(languageId),
      this.getTokensProvider(languageId),
    ])

    return { configuration, tokensProvider }
  }

  public async getConfiguration(
    languageId: string
  ): Promise<monaco.languages.LanguageConfiguration | null> {
    const grammar = this.grammars[languageId]
    if (grammar.cfg) {
      const res = await http(`${grammar.cfg}`)
      return JSON.parse(res)
    }
    return Promise.resolve(null)
  }

  public async getTokensProvider(
    languageId: string
  ): Promise<monaco.languages.EncodedTokensProvider | null> {
    const scopeName = this.getScopeNameFromLanguageId(languageId)
    const grammar = await this.registry.loadGrammar(scopeName)

    if (!grammar) return null

    return {
      getInitialState() {
        return INITIAL
      },
      tokenizeEncoded(
        line: string,
        state: monaco.languages.IState
      ): monaco.languages.IEncodedLineTokens {
        const tokenizeLineResult2 = grammar.tokenizeLine2(
          line,
          state as StateStack
        )
        const { tokens, ruleStack: endState } = tokenizeLineResult2
        return { tokens, endState }
      },
    }
  }

  public getScopeNameFromLanguageId(languageId: string) {
    for (const [key, value] of Object.entries(this.grammars)) {
      if (key === languageId) {
        return value.scopeName
      }
    }
    throw new Error(`can not find scopeName with languageId: ${languageId}`)
  }

  public async loadVSCodeOnigurumWASM() {
    const onigasmModule = await import(
      // @ts-expect-error
      'vscode-oniguruma/release/onig.wasm'
    )
    const response = await fetch(onigasmModule.default)
    try {
      return await (response as any).arrayBuffer()
    } catch (error) {
      console.error(`Failed to load vscode-oniguruma: ${error}`)
    }
  }

  public dispose() {
    this.disposes.forEach((d) => d.dispose())
    this.registry?.dispose()
  }
}
