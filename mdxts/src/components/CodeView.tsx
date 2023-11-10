import * as React from 'react'
import type { SourceFile } from 'ts-morph'
import { Identifier, SyntaxKind } from 'ts-morph'
import { type Theme, MdxtsJsxOnly } from './highlighter'
import { QuickInfo } from './QuickInfo'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

  /** VS Code-based theme for highlighting. */
  theme?: Theme
}

const lineHeight = 20

/** Renders a code block with syntax highlighting. */
export function CodeView({
  row,
  tokens,
  lineNumbers,
  sourceFile,
  filename,
  highlight,
  highlighter,
  language,
  theme,
}: CodeProps & {
  row?: [number, number]
  tokens: any
  sourceFile?: SourceFile
  highlighter: any
}) {
  // intrinsic source file is used to calculate the position of identifiers when dealing with jsx only files
  const intrinsicSourceFile = sourceFile
    ?.getProject()
    .getSourceFile(
      `${sourceFile.getBaseNameWithoutExtension()}.mdxts${sourceFile.getExtension()}`
    )
  const intrinsicIdentifierBounds = intrinsicSourceFile
    ? getIdentifierBounds(intrinsicSourceFile, lineHeight)
    : []
  const identifierBounds = sourceFile
    ? getIdentifierBounds(sourceFile, lineHeight)
        .map(([identifier, bounds]) => {
          let [, intrinsicBounds] =
            intrinsicIdentifierBounds.find(([intrinsicIdentifier]) => {
              return intrinsicIdentifier.getText() === identifier.getText()
            }) || []

          // Filter out identifiers that are not in the intrinsic source file
          if (intrinsicSourceFile) {
            if (intrinsicBounds === undefined) {
              return null
            }
          } else {
            intrinsicBounds = bounds
          }

          return {
            ...bounds,
            top: bounds.top - (bounds.top - intrinsicBounds.top),
            left: bounds.left - (bounds.left - intrinsicBounds.left),
          }
        })
        .filter(Boolean)
    : []
  const shouldHighlightLine = calculateLinesToHighlight(highlight)
  return (
    <div style={{ margin: '0 0 1.6rem' }}>
      {lineNumbers ? (
        <div
          style={{
            gridColumn: 1,
            gridRow: 1,
          }}
        >
          {tokens.map((_, lineIndex) => {
            const shouldHighlight = shouldHighlightLine(lineIndex)
            const isActive = row && row[0] <= lineIndex && lineIndex <= row[1]
            return (
              <div
                key={lineIndex}
                style={{
                  width: '6ch',
                  fontSize: 14,
                  lineHeight: '20px',
                  paddingRight: '2ch',
                  textAlign: 'right',
                  color:
                    shouldHighlight || isActive
                      ? theme.colors['editorLineNumber.activeForeground']
                      : theme.colors['editorLineNumber.foreground'],
                  userSelect: 'none',
                  backgroundColor: shouldHighlight ? '#87add726' : undefined,
                }}
              >
                {lineIndex + 1}
              </div>
            )
          })}
        </div>
      ) : null}
      <pre
        style={{
          gridColumn: 2,
          gridRow: 1,
          whiteSpace: 'pre',
          wordWrap: 'break-word',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: '20px',
          letterSpacing: '0px',
          tabSize: 4,
          padding: 0,
          margin: 0,
          borderRadius: 4,
          pointerEvents: 'none',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .identifier:hover {
            background-color: #87add73d;
            cursor: text;
          }
          .identifier > div {
            display: none;
          }
          .identifier:hover > div {
            display: block;
          }
        `,
          }}
        />
        {identifierBounds.map((bounds, index) => {
          return (
            <div
              key={index}
              className="identifier"
              style={{
                position: 'absolute',
                top: bounds.top,
                left: `calc(${bounds.left} * 1ch)`,
                width: `calc(${bounds.width} * 1ch)`,
                height: bounds.height,
                pointerEvents: 'auto',
              }}
            >
              <QuickInfo
                bounds={bounds}
                filename={filename}
                highlighter={highlighter}
                language={language}
                position={bounds.start}
                theme={theme}
              />
            </div>
          )
        })}
        {tokens.map((line, lineIndex) => {
          return (
            <div
              key={lineIndex}
              style={{
                height: 20,
                backgroundColor: shouldHighlightLine(lineIndex)
                  ? '#87add726'
                  : undefined,
              }}
            >
              {line.map((token, tokenIndex) => {
                return (
                  <span
                    key={tokenIndex}
                    style={{
                      ...token.fontStyle,
                      color: token.color,
                      textDecoration: token.hasError
                        ? 'red wavy underline'
                        : 'none',
                    }}
                  >
                    {token.content}
                  </span>
                )
              })}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

export function calculateLinesToHighlight(meta) {
  if (meta === undefined || meta === '') {
    return () => false
  }
  const lineNumbers = meta
    .split(',')
    .map((value) => value.split('-').map((y) => parseInt(y, 10)))

  return (index) => {
    const lineNumber = index + 1
    const inRange = lineNumbers.some(([start, end]) =>
      end ? lineNumber >= start && lineNumber <= end : lineNumber === start
    )
    return inRange
  }
}

/* Get the bounding rectangle of all identifiers in a source file. */
function getIdentifierBounds(sourceFile: SourceFile, lineHeight: number) {
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const isJsxOnly = identifiers.some(
    (identifier) => identifier.getText() === MdxtsJsxOnly
  )
  const bounds = identifiers
    .filter((identifier) => {
      const parent = identifier.getParent()
      const isJsxOnlyIdentifier = identifier.getText() === MdxtsJsxOnly
      const isJsxOnlyImport = isJsxOnly
        ? parent?.getKind() === SyntaxKind.ImportSpecifier
        : false
      return (
        !Identifier.isJSDocTag(parent) &&
        !Identifier.isJSDoc(parent) &&
        !isJsxOnlyIdentifier &&
        !isJsxOnlyImport
      )
    })
    .map((identifier) => {
      const start = identifier.getStart()
      const { line, column } = sourceFile.getLineAndColumnAtPos(start)
      return [
        identifier,
        {
          start,
          top: (line - 1) * lineHeight,
          left: column - 1,
          width: identifier.getWidth(),
          height: lineHeight,
        },
      ]
    }) as [
    Identifier,
    {
      start: number
      top: number
      left: number
      width: number
      height: number
    },
  ][]

  return bounds
}