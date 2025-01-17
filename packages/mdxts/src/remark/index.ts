import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import { addCodeBlocks } from './add-code-blocks'
import { addHeadings } from './add-headings'
import { addSummary } from './add-summary'
import { addFileMetaToCode } from './add-file-meta-to-code'
import { removeParagraphs } from './remove-paragraph'
import { transformSymbolicLinks } from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Root, file: VFile) => {
    await addCodeBlocks()(tree, file)
    await addHeadings()(tree)
    await addSummary()(tree)
    await addFileMetaToCode()(tree, file)
    await removeParagraphs()(tree)
    await transformSymbolicLinks()(tree)
  }
}
