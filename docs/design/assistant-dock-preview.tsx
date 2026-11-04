import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { ChevronDown, ChevronUp, Layers, LayoutTemplate, Library, PanelLeft, RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { I18nProvider } from "@/i18n";
import { PromptFusionDock } from "@/components/workbench/PromptFusionDock";
import { AiAssistant, type AiAssistantMessage, type AiAssistantInteractionState } from "@/components/assistant/AiAssistant";
import { AssistantInteraction } from "@/components/assistant/AssistantInteraction";
import { ReferencePicker } from "@/components/workbench/ReferencePicker";
import { ProviderPicker } from "@/components/workbench/ProviderPicker";
import { GenerationSettingsPicker } from "@/components/workbench/GenerationSettingsPicker";
import { InlinePromptEditor } from "@/components/workbench/InlinePromptEditor";
import { GenerateActionButton } from "@/components/workbench/GenerateActionButton";
import { ScenePickerDialog } from "@/components/workbench/SceneLibrary";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import { AiModelsSettings } from "@/components/workbench/settings/AiModelsSettings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRESET_SCENES, type SceneDefinition } from "@/lib/scene-library";
import { buildPromptAssistantGreeting } from "@/lib/prompt-assistant";
import { isSendEnter } from "@/lib/send-on-enter";
import { useAssistantPanelLayout, ASSISTANT_VIEWPORT_MARGIN } from "@/features/assistant/use-assistant-panel-layout";
import type { AssistantHistoryConversation } from "@/lib/assistant-history";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { GenerateImageInput, ProviderConfig } from "@shared/types";
import "@/styles.css";
import "./assistant-dock-preview.css";

declare const __PREVIEW_ASSETS__: Record<string, string>;
const scenesFromSource = PRESET_SCENES.map(scene => ({ ...scene, previewImages: scene.previewImages?.map(src => __PREVIEW_ASSETS__[src] ?? src) }));
const initialProviders: ProviderConfig[] = [
  { id:"preview-image",name:"图片服务 · 预览示例",type:"openai-compatible",apiMode:"images",baseUrl:"https://preview.invalid",generationEndpoint:"/v1/images/generations",model:"gpt-image-2.5-standard",models:["gpt-image-2.5-standard","gpt-image-2.5"],supportsReferenceImages:true },
  { id:"preview-alternative",name:"备用图片服务 · 预览示例",type:"openai-compatible",apiMode:"images",baseUrl:"https://preview.invalid",generationEndpoint:"/v1/images/generations",model:"gpt-image-1",models:["gpt-image-1"],supportsReferenceImages:true },
];
const boardImages: GeneratedImage[] = ["social/1","concept/1","logo/1","portrait/1"].map((key,i)=>({id:`preview-image-${i}`,jobId:"preview",path:`示例素材-${i+1}.webp`,dataUrl:__PREVIEW_ASSETS__[`/scene-previews/${key}.webp`],width:480,height:720}));
const samplePrompt="主体：一双红色运动鞋\n场景：纯色摄影棚背景\n构图：主体居中，保留适当留白\n光线：柔和侧光，突出鞋面材质\n限制：不添加文字或水印";
const sampleMessages: AiAssistantMessage[] = [{id:"demo-user",role:"user",content:"参考产品图，帮我梳理一下海报的构图和光线。"},{id:"demo-assistant",role:"assistant",content:"可以保留产品的红色与材质细节，用简洁背景突出主体。\n\n- **构图**：产品居中，四周留出呼吸空间。\n- **光线**：柔和侧光，让鞋面纹理更清晰。\n- **背景**：与主体统一配色，减少多余装饰。",generatedPrompt:samplePrompt}];
const initialHistory: AssistantHistoryConversation[] = [{id:"demo-history",boardId:"preview-board",boardName:"预览画板",title:"产品海报构图 · 示例会话",preview:"保留产品材质，用柔和侧光突出主体。",updatedAt:"2026-10-30T02:00:00+08:00",exchangeCount:1,messages:sampleMessages}];
const advancedStates = [["default","更多状态"],["direct","普通生成"],["template","已选择模板"],["editing","图片编辑"],["ui-brief","UI Brief 与材料职责"],["messages","回复与提示词"],["confirmation","生成确认"],["form","需求澄清"],["permission","权限提示"],["error","错误与重试"],["busy","处理中"]] as const;

function Preview() {
  const [scene,setScene]=useState("empty"),[advanced,setAdvanced]=useState("default");
  const [assistantMode,setAssistantMode]=useState(true),[open,setOpen]=useState(false);
  const [value,setValue]=useState(""),[directValue,setDirectValue]=useState("");
  const [messages,setMessages]=useState<AiAssistantMessage[]>([]),[busy,setBusy]=useState(false);
  const [references,setReferences]=useState<GeneratedImage[]>([]),[providers,setProviders]=useState(initialProviders);
  const [activeProviderId,setActiveProviderId]=useState(initialProviders[0].id);
  const [size,setSize]=useState("1024x1024"),[count,setCount]=useState(1),[quality,setQuality]=useState<GenerateImageInput["quality"]>("auto"),[transparent,setTransparent]=useState(false);
  const [templates,setTemplates]=useState<SceneDefinition[]>(scenesFromSource),[activeTemplate,setActiveTemplate]=useState<SceneDefinition|null>(null),[templateOpen,setTemplateOpen]=useState(false),[favorites,setFavorites]=useState<string[]>([]);
  const [creationMode,setCreationMode]=useState("general"),[editing,setEditing]=useState(false),[suggestionsOpen,setSuggestionsOpen]=useState(true);
  const [interaction,setInteraction]=useState<AiAssistantInteractionState|null>(null);
  const [history,setHistory]=useState(initialHistory),[historyScope,setHistoryScope]=useState<"board"|"all">("board");
  const [modelManagement,setModelManagement]=useState(false),[currentHistoryId,setCurrentHistoryId]=useState<string>();
  const [activeTasks,setActiveTasks]=useState(0);
  const [templatePreview,setTemplatePreview]=useState<string|null>(null);
  const [materialRoles,setMaterialRoles]=useState<Record<string,string>>({});
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const generationTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const layout=useAssistantPanelLayout({boardId:"standalone-preview",assistantSurface:editing?"canvas-edit":"canvas-prompt",assistantOpen:open,assistantAvailable:true,rightRailOpen:false,setAssistantOpen:setOpen});
  const provider=providers.find(p=>p.id===activeProviderId) ?? providers[0];
  const title=creationMode==="ui-design"?"UI 设计助手":editing?"图片编辑助手":"创作助手";
  useEffect(()=>()=>{clearTimeout(timer.current);clearTimeout(generationTimer.current);},[]);

  function stop() {
    clearTimeout(timer.current);setBusy(false);
    setMessages(current=>current.map(m=>m.streaming?{...m,streaming:false,content:m.content||"已停止本次演示回复。"}:m));
  }
  function resetConversation() { stop();setMessages([]);setCurrentHistoryId(undefined);setInteraction(null); }
  function addReferences(images:GeneratedImage[]) {setReferences(current=>{const merged=[...current];for(const image of images)if(!merged.some(item=>item.id===image.id)&&merged.length<4)merged.push(image);return merged;});}
  function addFiles(files:FileList|File[]|null) {
    if(!files)return;
    for(const file of Array.from(files).slice(0,4)) {
      if(!file.type.startsWith("image/")){toast.error("请选择图片文件。");continue;}
      const reader=new FileReader();reader.onload=()=>addReferences([{id:crypto.randomUUID(),jobId:"preview-upload",path:file.name,dataUrl:String(reader.result)}]);reader.readAsDataURL(file);
    }
  }
  function submit() {
    if(!value.trim()||busy)return;
    const input=value.trim(),id=crypto.randomUUID();setValue("");setOpen(true);setBusy(true);
    setMessages(current=>[...current,{id:`${id}:user`,role:"user",content:input},{id:`${id}:assistant`,role:"assistant",content:"",streaming:true}]);
    timer.current=setTimeout(()=>{const response={id:`${id}:assistant`,role:"assistant" as const,content:"这是独立预览中的示例回复。\n\n可以从主体、构图和光线继续细化，也可以应用下方提示词，再进行修改。",generatedPrompt:samplePrompt};setMessages(current=>current.map(m=>m.id===response.id?response:m));setBusy(false);setHistory(current=>[{id,boardId:"preview-board",boardName:"预览画板",title:input,preview:response.content,updatedAt:new Date().toISOString(),exchangeCount:1,messages:[{id:`${id}:user`,role:"user",content:input},response]},...current]);setCurrentHistoryId(id);},1200);
  }
  function generate() {setInteraction(null);setActiveTasks(current=>current+1);toast("已提交演示任务，不会调用生成服务。");generationTimer.current=setTimeout(()=>setActiveTasks(0),1800);}
  function confirmState():AiAssistantInteractionState { return {id:crypto.randomUUID(),interaction:{type:"confirm",title:"确认本次创作方案",description:"按当前参考图、构图和光线生成产品海报。",confirmLabel:"应用提示词",cancelLabel:"继续完善"},confirmationPreview:{title:"生成提示词",items:[{label:"提示词",value:samplePrompt}]},canGenerateImmediately:true}; }
  function changePreview(next:string) {
    resetConversation();setAdvanced("default");setActiveTemplate(null);setReferences([]);setValue("");setDirectValue("");setAssistantMode(true);setEditing(false);setCreationMode("general");setOpen(next==="chat");setScene(next);layout.setAssistantDockSide(null);layout.setAssistantDockCollapsed(false);layout.setAssistantOffset({x:0,y:0});
    if(next==="reference"){setReferences([boardImages[0]]);setValue("参考这张图，帮我设计一张产品海报。");}
  }
  function chooseAdvanced(next:string) {
    changePreview("empty");setAdvanced(next);
    if(next==="direct"){setAssistantMode(false);setDirectValue(samplePrompt);}
    if(next==="template"){setActiveTemplate(templates[0]);setDirectValue(templates[0].prompt);}
    if(next==="editing"){setEditing(true);setReferences([boardImages[0]]);setValue("调整背景与光线，保留产品主体。");}
    if(["messages","error","busy"].includes(next))setOpen(true);
    if(next==="ui-brief"){setCreationMode("ui-design");setReferences([boardImages[0]]);}
    if(next==="messages")setMessages(sampleMessages);
    if(next==="confirmation")setInteraction(confirmState());
    if(next==="form")setInteraction({id:crypto.randomUUID(),interaction:{type:"form",title:"确认创作方向",description:"先补充这两项，再继续细化。",fields:[{id:"subject",label:"你想呈现什么主体？",type:"text",required:true},{id:"style",label:"希望是什么风格？",type:"select",options:[{label:"自然写实",value:"natural"},{label:"简洁平面",value:"graphic"}]}]}});
    if(next==="permission")setInteraction({id:crypto.randomUUID(),interaction:{type:"permission",capability:"screen-capture",title:"查看屏幕内容",description:"这是原权限卡片的样式预览，不会获取屏幕。",providerLabel:"预览示例"}});
    if(next==="error")setMessages([{id:"preview-error",role:"assistant",tone:"error",content:"示例：本次请求暂时失败，可以重新尝试。",receipt:{label:"请求失败",actions:[{label:"重试",onAction:()=>{setValue("重新尝试");setMessages([]);toast("已恢复输入，可以重新发送。");}}]}}]);
    if(next==="busy"){setBusy(true);setMessages([{id:"preview-thinking",role:"assistant",content:"",streaming:true}]);}
  }
  function applyPrompt(prompt:string){setDirectValue(prompt);setAssistantMode(false);setInteraction(null);toast("已应用到普通生成输入区。");}
  const panelStyle:CSSProperties=layout.assistantDockSide?{width:layout.assistantDockWidth}:{
    width:layout.assistantSize?`${layout.assistantSize.width}px`:"min(840px, calc(100% - 40px))",
    ...(layout.fusionAnchor?{position:"fixed",left:layout.fusionAnchor.left,bottom:layout.fusionAnchor.bottom,top:"auto",transform:"none",maxHeight:`calc(100dvh - ${layout.fusionAnchor.bottom+ASSISTANT_VIEWPORT_MARGIN}px)`}:{}),
    ...(open&&assistantMode&&layout.assistantSize?{height:layout.assistantSize.height}:{}),
  };
  const contextImages=references.map((image,index)=>({id:image.id,src:image.dataUrl,alt:image.path,role:editing&&index===0?"edit-target" as const:"reference" as const,onRemove:editing&&index===0?undefined:()=>setReferences(current=>current.filter(item=>item.id!==image.id))}));
  const currentMessages=messages.length?messages:[{id:"fusion-greeting",role:"assistant" as const,content:buildPromptAssistantGreeting(directValue,{editing,referenceCount:references.length,templateName:activeTemplate?.name},"zh-CN")}];

  return <TooltipProvider delayDuration={200}>
    <header className="preview-header"><div className="preview-brand"><Layers/><strong>iterlay</strong><span>创作助手 · 完整组件预览</span></div><nav className="preview-tabs" aria-label="预览状态">{[["empty","默认输入"],["reference","带参考图"],["chat","展开对话"]].map(([id,label])=><button type="button" key={id} data-scene={id} aria-pressed={scene===id} onClick={()=>changePreview(id)}>{label}</button>)}</nav></header>
    <main className="preview-stage">
      <div className="preview-breadcrumb"><PanelLeft/><span>未命名画板</span><span>/</span><span>创作画布</span></div>
      {layout.assistantDockPreview?<div className="preview-magnet" data-side={layout.assistantDockPreview.side}/>:null}
      <PromptFusionDock
        assistantEnabled assistantModeEnabled={assistantMode} onAssistantModeChange={setAssistantMode}
        panelRef={layout.assistantPanelRef} panelStyle={panelStyle} dockSide={layout.assistantDockSide} collapsed={layout.assistantDockCollapsed} dragging={layout.assistantDragging}
        resizePointerHandlers={layout.assistantDockSide?undefined:{onPointerDown:layout.startAssistantResize,onPointerMove:layout.resizeAssistant,onPointerUp:layout.endAssistantResize,onPointerCancel:layout.endAssistantResize}}
        dockResizePointerHandlers={layout.assistantDockSide?{onPointerDown:layout.startAssistantDockResize,onPointerMove:layout.resizeAssistantDock,onPointerUp:layout.endAssistantDockResize,onPointerCancel:layout.cancelAssistantDockResize,onKeyDown:layout.handleAssistantDockResizeKeyDown}:undefined}
        headerPointerHandlers={{onPointerDown:layout.startAssistantDrag}}
        open={open} busy={busy} inputDisabled={Boolean(interaction)} rightRailOpen={false}
        value={value} directValue={directValue} latestPrompt={messages.findLast(message=>message.generatedPrompt)?.generatedPrompt}
        contextImages={contextImages} onValueChange={setValue} onDirectValueChange={setDirectValue} onPromptContextChange={()=>{}}
        onOpenChange={next=>{if(layout.assistantDockSide&&!next){layout.collapseDockedAssistant();return;}if(next)layout.setAssistantOffset({x:0,y:0});setOpen(next);}}
        onSubmit={submit} onStop={stop} onPasteImages={addFiles} onPasteCanvasReferences={addReferences}
        confirmationId={interaction?.id}
        confirmation={interaction?<AssistantInteraction state={interaction} disabled={busy} onSubmit={()=>applyPrompt(samplePrompt)} onGenerate={generate} onDismiss={()=>setInteraction(null)} onRefine={text=>{setInteraction(null);setValue(text);}}/>:null}
        extra={<>
          {editing?<div className="fusion-edit-tools" data-tour="edit-banner"><div className="flex min-w-0 items-center gap-1"><Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground" aria-expanded={suggestionsOpen} aria-controls="preview-edit-suggestions" onClick={()=>setSuggestionsOpen(current=>!current)}><Sparkles className="h-3.5 w-3.5"/>编辑建议{suggestionsOpen?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}</Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="重新生成编辑建议" onClick={()=>toast("已切换示例编辑建议。")}><RefreshCw className="h-3.5 w-3.5"/></Button><div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground" onClick={()=>toast("高级编辑属于画布功能；当前只展示助手区域。")}><SlidersHorizontal className="h-3.5 w-3.5"/>高级编辑</Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="退出编辑" onClick={()=>setEditing(false)}><X className="h-3.5 w-3.5"/></Button></div></div><ul id="preview-edit-suggestions" hidden={!suggestionsOpen} className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">{["保留产品主体，调整背景颜色","增强材质细节与柔和侧光","减少背景装饰，增加画面留白"].map(suggestion=><li key={suggestion}><button type="button" className="flex min-h-8 w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs leading-5 hover:bg-accent" onClick={()=>setValue(suggestion)}>{suggestion}</button></li>)}</ul></div>:null}
          {activeTemplate?<details className="prompt-template-reference"><summary><LayoutTemplate size={14}/><span className="prompt-template-reference-label">模板</span><span className="prompt-template-reference-name">{activeTemplate.name}</span><ChevronDown size={14} className="prompt-template-reference-chevron"/></summary><div className="prompt-template-reference-content"><p className="max-h-24 overflow-auto whitespace-pre-wrap py-2">{activeTemplate.prompt}</p><div className="my-2 flex gap-2">{activeTemplate.previewImages?.map((src,i)=><button key={src} type="button" className="h-14 w-20 overflow-hidden rounded" aria-label={`查看模板示例 ${i+1}`} onClick={()=>setTemplatePreview(src)}><img src={src} alt={`模板示例 ${i+1}`} className="h-full w-full object-cover"/></button>)}</div><div className="flex gap-3"><button onClick={()=>setTemplateOpen(true)}>更换模板</button><button onClick={()=>setActiveTemplate(null)}>移除模板</button></div></div></details>:null}
          {advanced==="ui-brief"?<details className="mb-2 text-xs"><summary>UI Brief · 产品展示页面</summary><p>结构：产品主视觉、产品特点、购买入口。</p><p>视觉方向：以参考图为依据，保留品牌配色与留白。</p></details>:null}
          {creationMode==="ui-design"&&references.length?<details className="mb-2 text-xs"><summary>材料职责</summary>{references.map(image=><label key={image.id} className="my-2 flex items-center justify-between gap-2"><span className="truncate">{image.path}</span><select aria-label={`材料职责：${image.path}`} value={materialRoles[image.id]??"reference"} onChange={event=>setMaterialRoles(current=>({...current,[image.id]:event.target.value}))}><option value="prd">PRD</option><option value="wireframe">原型</option><option value="visual">视觉稿</option><option value="brand">品牌</option><option value="content">内容</option><option value="reference">参考</option></select></label>)}</details>:null}
        </>}
        directEditor={<InlinePromptEditor prompt={directValue} templatePrompts={activeTemplate?[activeTemplate.prompt]:[]} height={Math.min(128,Math.max(56,directValue.split("\n").length*25))} dragging={false} reduceMotion={false} onFocus={()=>{}} onChange={setDirectValue} onSubmitKey={event=>{if(isSendEnter(event)){event.preventDefault();generate();}}} onPasteImages={addFiles} onPasteCanvasItems={items=>addReferences(items.map(item=>item.image))} placeholder={editing?"描述想修改的地方…":"描述你想生成的画面…"}/>}
        controls={<>
          <ReferencePicker boardImages={boardImages} referenceCount={references.length} referencedNodeIds={new Set(references.map(image=>image.id))} atLimit={references.length>=4} showLabel={false} materialMode={creationMode==="ui-design"} onAddCanvasReference={image=>addReferences([image])} onReferenceFiles={addFiles}/>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" data-tour="dock-template" aria-label="选择模板" onClick={()=>setTemplateOpen(true)}><Library className="h-4 w-4"/></Button>
          <ProviderPicker providers={providers} activeProviderId={activeProviderId} creditStatus={null} creditLoading={false} requiredCredits={0} showLabel={false} onSelect={(id,model)=>{setActiveProviderId(id);if(model)setProviders(current=>current.map(item=>item.id===id?{...item,model}:item));}} onManage={()=>setTimeout(()=>setModelManagement(true),350)}/>
          <GenerationSettingsPicker size={size} count={count} quality={quality} model={provider.model} workflowMode={editing?"edit":"generate"} transparentBackground={transparent} maxCount={4} provider={provider} onSizeChange={setSize} onCountChange={setCount} onQualityChange={setQuality} onTransparentBackgroundChange={setTransparent}/>
          {!editing?<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="创作模式"><LayoutTemplate/></Button></DropdownMenuTrigger><DropdownMenuContent side="top"><DropdownMenuRadioGroup value={creationMode} onValueChange={setCreationMode}><DropdownMenuRadioItem value="general">通用创作</DropdownMenuRadioItem><DropdownMenuRadioItem value="ui-design">UI 设计</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>:null}
          {activeTasks>0?<span role="status" className="text-xs text-muted-foreground">{activeTasks} 项任务</span>:null}
        </>}
        directAction={<GenerateActionButton buttonStyle="send" compact disabled={!directValue.trim()||busy} onClick={generate}>{editing?"应用修改":`生成 ${count} 张`}</GenerateActionButton>}
        assistant={<AiAssistant hideComposer hideInteraction variant={layout.assistantDockSide?"docked":"floating"} dockSide={layout.assistantDockSide??undefined} compact title={title} headerPointerHandlers={{onPointerDown:layout.startAssistantDrag}} messages={currentMessages} value={value} streaming={busy} activityLabel={busy?"正在整理创作方向…":undefined} disabled={busy} onValueChange={setValue} onSubmit={submit} onStop={stop} onClose={layout.assistantDockSide?()=>layout.collapseDockedAssistant():undefined} history={historyScope==="board"?history.filter(item=>item.boardId==="preview-board"):history} historyLoading={false} historyScope={historyScope} currentConversationId={currentHistoryId} onHistoryOpen={()=>{}} onHistoryScopeChange={setHistoryScope} onHistorySelect={record=>{setMessages(record.messages);setCurrentHistoryId(record.id);}} onNewConversation={resetConversation} onApplyGeneratedPrompt={applyPrompt}/>}
      />
      {layout.assistantDockSide&&layout.assistantDockCollapsed?<button type="button" className="preview-dock-reopen" data-side={layout.assistantDockSide} ref={layout.assistantExpandButtonRef} onClick={layout.expandDockedAssistant}>展开助手</button>:null}
      <div className="preview-states"><span>预览状态</span><select aria-label="更多预览状态" value={advanced} onChange={event=>chooseAdvanced(event.target.value)}>{advancedStates.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div><div className="preview-note">直接复用原组件 · 数据与生成仅演示</div>
    </main>
    <ScenePickerDialog open={templateOpen} scenes={templates} favoriteSceneIds={favorites} currentPrompt={directValue} mode={editing?"edit":"generate"} useCase="other" onOpenChange={setTemplateOpen} onSelect={template=>{setActiveTemplate(template);setDirectValue(template.prompt);setTemplateOpen(false);}} onToggleFavorite={id=>setFavorites(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])} onSave={input=>{const template={...input,id:crypto.randomUUID(),source:"custom" as const};setTemplates(current=>[template,...current]);return template;}} onManage={()=>toast("当前展示原模板选择器；预览不跳转到主应用模板库。")}/>
    <Dialog open={modelManagement} onOpenChange={setModelManagement}><DialogContent className="flex h-[min(760px,90dvh)] w-[min(1100px,95vw)] max-w-none flex-col overflow-hidden p-0"><DialogTitle className="sr-only">模型与服务</DialogTitle><DialogDescription className="sr-only">原模型管理组件预览，不保存真实配置。</DialogDescription><AiModelsSettings portalContainer={null} providers={providers} activeProviderId={activeProviderId} textProviders={[]} activeTextProviderId="" videoProviders={[]} activeVideoProviderId="" providerKeyStatus={{}} bridgeError="独立设计预览：配置只供查看，不连接真实工作台服务。" entryPoint="model-management" onSaved={()=>{}}/></DialogContent></Dialog>
    {templatePreview?<ImageZoomLightbox src={templatePreview} onClose={()=>setTemplatePreview(null)}/>:null}
    <Toaster position="bottom-center"/>
  </TooltipProvider>;
}

localStorage.setItem("iterlay:language","zh-CN");
createRoot(document.getElementById("root")!).render(<I18nProvider><Preview/></I18nProvider>);
