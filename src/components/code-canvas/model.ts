import type { CanvasFramework } from '@shared/types';
export const CANVAS_CODE_LIMIT = 100_000;
export const CANVAS_STARTERS: Record<CanvasFramework, string> = {
  html: '<!doctype html>\n<html lang="zh-CN">\n<head><style>body { padding: 32px; font-family: system-ui; } button { padding: 10px 18px; cursor: pointer; }</style></head>\n<body>\n  <h1>你好，Canvas</h1>\n  <p>在这里编写 HTML、CSS 和 JavaScript。</p>\n  <button onclick="this.textContent = \'运行成功\'">试试看</button>\n</body>\n</html>',
  react: 'import React, { useState } from "react";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return <main style={{ padding: 32, fontFamily: "system-ui" }}>\n    <h1>你好，React</h1>\n    <button onClick={() => setCount(count + 1)}>点击了 {count} 次</button>\n  </main>;\n}',
  vue: '<script setup>\nimport { ref } from "vue";\nconst count = ref(0);\n</script>\n\n<template>\n  <main>\n    <h1>你好，Vue</h1>\n    <button @click="count++">点击了 {{ count }} 次</button>\n  </main>\n</template>\n\n<style>\nmain { padding: 32px; font-family: system-ui; }\n</style>'
};
