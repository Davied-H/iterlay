import { installSandboxConsole, serializeConsoleValue } from "./sandbox-console";
// Runs only inside an opaque-origin iframe. Never import application APIs here.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as Vue from 'vue/dist/vue.esm-bundler.js';
import { transform } from '@babel/standalone';
// Browser build avoids Node filesystem dependencies.
import { parse, compileScript } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';
const post = (type: string, message = '') => parent.postMessage({ source: 'iterlay-code-sandbox', type, message: message.slice(0, 4000) }, '*');
installSandboxConsole(entry => parent.postMessage({ source: 'iterlay-code-sandbox', type: 'console', ...entry }, '*'));
window.addEventListener('error', event => post('error', event.message));
window.addEventListener('unhandledrejection', event => post('error', String(event.reason)));
function evaluate(code: string) {
  const compiled = transform(code, { filename: 'Canvas.jsx', presets: [['react', { runtime: 'classic' }]], plugins: ['transform-modules-commonjs'] })?.code ?? '';
  const exports: Record<string, unknown> = {};
  const module = { exports };
  const require = (name: string) => {
    if (name === 'react') return React;
    if (name === 'react-dom/client') return { createRoot };
    if (name === 'vue') return Vue;
    throw new Error(`不支持依赖 ${name}；当前内置 React、react-dom/client 和 Vue。`);
  };
  return new Function('React', 'Vue', 'require', 'module', 'exports', `${compiled}\n;return module.exports.default ?? (typeof App !== 'undefined' ? App : undefined);`)(React, Vue, require, module, exports) as unknown;
}
let started = false;
window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.source !== 'iterlay-code-host') return;
  if (event.data.type === 'evaluate' && started) {
    if (typeof event.data.expression !== 'string' || event.data.expression.length > 4000) return;
    const report = (level: string, result: unknown) => parent.postMessage({ source: 'iterlay-code-sandbox', type: 'console', level, message: serializeConsoleValue(result), timestamp: Date.now() }, '*');
    try { Promise.resolve((0, eval)(event.data.expression)).then(result => report('result', result), error => report('error', error)); }
    catch (error) { report('error', error); }
    return;
  }
  if (started) return;
  const { code, framework } = event.data;
  if (typeof code !== 'string' || code.length > 100_000 || !['html', 'react', 'vue'].includes(framework)) return;
  started = true;
  try {
    if (framework === 'html') {
      // innerHTML keeps the runtime's Window listeners; document.open() removes them.
      document.documentElement.innerHTML = code;
      for (const inert of [...document.querySelectorAll('script')]) {
        const script = document.createElement('script');
        for (const attribute of inert.attributes) script.setAttribute(attribute.name, attribute.value);
        script.textContent = inert.textContent;
        inert.replaceWith(script);
      }
    } else if (framework === 'react') {
      const App = evaluate(code) as React.ComponentType;
      if (!App) throw new Error('请导出默认 React 组件，或声明 App 组件。');
      createRoot(document.getElementById('root')!).render(React.createElement(App));
    } else {
      let component: unknown;
      if (/<(?:template|script)(?:\s|>)/u.test(code)) {
        const { descriptor, errors } = parse(code);
        if (errors.length) throw new Error(String(errors[0]));
        const source = descriptor.script || descriptor.scriptSetup
          ? compileScript(descriptor, { id: 'canvas', inlineTemplate: true }).content
          : `export default { template: ${JSON.stringify(descriptor.template?.content ?? '')} }`;
        component = evaluate(source);
        if (descriptor.template && !descriptor.scriptSetup) (component as { template?: string }).template = descriptor.template.content;
        for (const style of descriptor.styles) {
          const element = document.createElement('style'); element.textContent = style.content; document.head.append(element);
        }
      } else component = evaluate(code);
      if (!component) throw new Error('请提供 Vue 单文件组件或默认导出的组件。');
      Vue.createApp(component as Parameters<typeof Vue.createApp>[0]).mount('#root');
    }
    post('running');
  } catch (error) { post('error', error instanceof Error ? error.message : String(error)); }
});
post('ready');
