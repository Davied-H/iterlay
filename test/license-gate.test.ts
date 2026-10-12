// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { LicenseGate } from '../src/components/licensing/LicenseGate';
import { useLicense } from '../src/components/licensing/license-context';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('renders immediately offline with permanent access and no activation UI or IPC', async () => {
  const request=vi.fn(()=>{throw Error('offline')});
  Object.assign(window,{imageWorkbench:{getLicenseStatus:request,checkLicense:request}});
  const container=document.createElement('div'); document.body.append(container); const root=createRoot(container);
  function Child(){const {status}=useLicense(); return createElement('div',null,status?.capabilities.mode);}
  try {await act(async()=>root.render(createElement(LicenseGate,null,createElement(Child))));expect(container.textContent).toBe('full');expect(request).not.toHaveBeenCalled();expect(document.querySelector('[role=dialog]')).toBeNull();}finally{await act(async()=>root.unmount());container.remove();Reflect.deleteProperty(window,"imageWorkbench");}
});
