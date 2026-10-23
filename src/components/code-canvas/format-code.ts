import type { CanvasFramework } from '@shared/types';

let formatter: Promise<typeof import('prettier/standalone')> | undefined;
export async function formatCanvasCode(code: string, framework: CanvasFramework): Promise<string> {
  formatter ??= import('prettier/standalone');
  const [prettier, babel, estree, html, postcss] = await Promise.all([
    formatter, import('prettier/plugins/babel'), import('prettier/plugins/estree'), import('prettier/plugins/html'), import('prettier/plugins/postcss')
  ]);
  return prettier.format(code, {
    parser: framework === 'react' ? 'babel' : framework === 'vue' ? 'vue' : 'html',
    plugins: [babel.default, estree.default, html.default, postcss.default],
    tabWidth: 2, printWidth: 80, singleQuote: false, trailingComma: 'all'
  });
}
