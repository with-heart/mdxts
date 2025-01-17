import { Node, SourceFile } from 'ts-morph'

/** Determines if a declaration is private or not based on its JSDoc tag. */
function hasPrivateJsDocTag(node: Node) {
  if (Node.isJSDocable(node)) {
    const jsDocTags = node.getJsDocs().flatMap((doc) => doc.getTags())
    return jsDocTags.some((tag) => tag.getTagName() === 'private')
  }
  return false
}

/** Gets all source files exported from a set of source files excluding private declarations. */
export function getExportedSourceFiles(sourceFiles: SourceFile[]) {
  return Array.from(
    new Set(
      sourceFiles.flatMap((sourceFile) =>
        Array.from(sourceFile.getExportedDeclarations()).flatMap(
          ([, allDeclarations]) =>
            allDeclarations
              .filter((declaration) => !hasPrivateJsDocTag(declaration))
              .map((declaration) => declaration.getSourceFile())
        )
      )
    )
  )
}
