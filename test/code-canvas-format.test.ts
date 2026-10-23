import { describe, expect, it } from 'vitest';
import { formatCanvasCode } from '../src/components/code-canvas/format-code';
describe('Canvas code formatting', () => {
  it('formats JSX and remains stable when formatted again', async () => {
    const formatted = await formatCanvasCode('export default function App(){const x=1;return <main><h1>Hello</h1><p>{x}</p></main>}', 'react');
    expect(formatted).toContain('  const x = 1;');
    expect(formatted).toContain('\n      <h1>Hello</h1>');
    expect(await formatCanvasCode(formatted, 'react')).toBe(formatted);
  });
  it('formats HTML with embedded JavaScript and CSS', async () => {
    const formatted = await formatCanvasCode('<style>body{color:red}</style><script>const x=1;console.log(x)</script><main><h1>Hello</h1></main>', 'html');
    expect(formatted).toContain('color: red;');
    expect(formatted).toContain('const x = 1;');
    expect(formatted).toContain('<h1>Hello</h1>');
  });
  it('formats Vue templates, script setup and CSS', async () => {
    const formatted = await formatCanvasCode('<script setup>import {ref} from "vue";const n=ref(0)</script><template><button @click="n++">{{n}}</button></template><style>button{color:red}</style>', 'vue');
    expect(formatted).toContain('const n = ref(0);');
    expect(formatted).toContain('{{ n }}');
    expect(formatted).toContain('color: red;');
  });
  it('rejects incomplete JSX so the editor can preserve the original draft', async () => {
    await expect(formatCanvasCode('export default function App( {', 'react')).rejects.toThrow();
  });
});
