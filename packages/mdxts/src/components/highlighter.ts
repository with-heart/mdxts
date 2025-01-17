import { getHighlighter as shikiGetHighlighter } from 'shiki'
import type { SourceFile } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

type Color = string

type TokenColor = {
  name?: string
  scope: string | string[]
  settings: {
    background?: Color
    foreground?: Color
    fontStyle?: 'italic' | 'bold' | 'underline'
  }
}

export type Theme = {
  name: string
  type: 'light' | 'dark' | 'hc'
  colors: {
    [element: string]: Color
  }
  tokenColors: TokenColor[]
}

export type Token = {
  content: string
  color?: string
  explanation?: any
  fontStyle: Record<string, string | number>
  start: number
  end: number
}

export type Tokens = Token[]

export type Highlighter = (
  code: string,
  language: any,
  sourceFile?: SourceFile,
  isJsxOnly?: boolean
) => Tokens[]

const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

function getFontStyle(fontStyle: number): any {
  const style: Record<string, any> = {}
  if (fontStyle === FontStyle.Italic) {
    style['fontStyle'] = 'italic'
  }
  if (fontStyle === FontStyle.Bold) {
    style['fontWeight'] = 'bold'
  }
  if (fontStyle === FontStyle.Underline) {
    style['textDecoration'] = 'underline'
  }
  if (fontStyle === FontStyle.Strikethrough) {
    style['textDecoration'] = 'line-through'
  }
  return style
}

/** Returns a function that converts code to an array of highlighted tokens */
export async function getHighlighter(options: any): Promise<Highlighter> {
  const highlighter = await shikiGetHighlighter(options)

  return function (
    value: string,
    language: any,
    sourceFile?: SourceFile,
    isJsxOnly: boolean = false,
    splitTokens: boolean = false
  ) {
    const code = sourceFile ? sourceFile.getFullText() : value
    const tokens = highlighter
      .codeToThemedTokens(code, language, undefined, {
        includeExplanation: false,
      })
      .filter((line) => {
        // filter out imports when jsx only source file
        if (isJsxOnly) {
          return !line.some((token) => token.content === 'import')
        }

        return true
      })
    const importSpecifiers =
      sourceFile && !isJsxOnly
        ? sourceFile
            .getImportDeclarations()
            .map((importDeclaration) => importDeclaration.getModuleSpecifier())
        : []
    const identifiers = sourceFile
      ? sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
      : []
    const allNodes = [...importSpecifiers, ...identifiers]
    const ranges = allNodes
      .filter((node) => {
        const parent = node.getParent()
        const isJsxOnlyImport = isJsxOnly
          ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
            parent?.getKind() === SyntaxKind.ImportClause
          : false
        return (
          !Node.isJSDocTag(parent) && !Node.isJSDoc(parent) && !isJsxOnlyImport
        )
      })
      .map((node) => ({
        start: node.getStart(),
        end: node.getEnd(),
      }))
    let position = 0
    const parsedTokens = tokens.map((line) => {
      // increment position for line breaks
      if (line.length === 0) {
        position += 1
      }
      return line.flatMap((token, tokenIndex) => {
        const tokenStart = position
        const tokenEnd = tokenStart + token.content.length
        const lastToken = tokenIndex === line.length - 1

        // account for newlines
        position = lastToken ? tokenEnd + 1 : tokenEnd

        const initialToken = {
          color: token.color,
          content: token.content,
          fontStyle: getFontStyle(token.fontStyle as number),
          start: tokenStart,
          end: tokenEnd,
        }

        if (!splitTokens) {
          return [initialToken]
        }

        let processedTokens: Tokens = []

        // split tokens by identifier ranges
        if (ranges) {
          const tokenRange = ranges.find((range) => {
            return range.start >= tokenStart && range.end <= tokenEnd
          })
          const inFullRange = tokenRange
            ? tokenRange.start === tokenStart && tokenRange.end === tokenEnd
            : false

          // split the token to isolate the identifier
          if (tokenRange && !inFullRange) {
            const identifierStart = tokenRange.start - tokenStart
            const identifierEnd = tokenRange.end - tokenStart
            const identifier = token.content.slice(
              identifierStart,
              identifierEnd
            )
            const identifierToken = {
              ...initialToken,
              content: identifier,
              start: tokenStart + identifierStart,
              end: tokenStart + identifierEnd,
            }
            const beforeIdentifierToken = {
              ...initialToken,
              content: token.content.slice(0, identifierStart),
              start: tokenStart,
              end: tokenStart + identifierStart,
            }
            const afterIdentifierToken = {
              ...initialToken,
              content: token.content.slice(identifierEnd),
              start: tokenStart + identifierEnd,
              end: tokenEnd,
            }

            processedTokens = [
              beforeIdentifierToken,
              identifierToken,
              afterIdentifierToken,
            ]
          } else {
            processedTokens.push(initialToken)
          }
        } else {
          processedTokens.push(initialToken)
        }

        return processedTokens
      })
    })

    // remove first line if this is jsx only since it's leftover whitespace from import statements
    if (isJsxOnly) {
      parsedTokens.shift()
    }

    return parsedTokens
  }
}
