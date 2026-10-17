import { ArrowRight, Check, Film, Terminal } from 'lucide-react'
import { galleryAsset } from './demo-cases'
import type { Feature } from './features'
import './wiki-feature-visual.css'
const poster = galleryAsset('v2/yuzu-poster.webp')
const drink = galleryAsset('v2/yuzu-source.webp')
const shoe = galleryAsset('v2/runner-campaign.webp')
const original = galleryAsset('v2/runner-source.webp')

/** Editorial product diagrams. No imitation controls, fabricated screenshots or chat UI. */
export default function WikiFeatureVisual({ kind }: { kind: Feature['preview'] }) {
  return <div className={`wf-visual wf-${kind}`} aria-label="功能图解，非实时产品截图">
    {kind === 'assistant' && <div className="wf-assistant-layout"><div className="wf-assistant-image"><img src={shoe} alt="跑鞋户外创作示例" /><span>当前创作</span></div><div className="wf-assistant-script"><span className="wf-dialog-role">你的想法</span><p>保留鞋子的细节。<br />试试更有户外感的背景。</p><div className="wf-script-rule"/><span className="wf-dialog-role">创作方向</span><p>赭红沙丘。<br />自然日光。<br />清晰的材质。</p><span className="wf-script-end">带着图片，继续讨论<ArrowRight size={14}/></span></div></div>}
    {kind === 'images' && <div className="wf-image-pair"><figure><img src={drink} alt="气泡饮原图"/><figcaption>产品原图</figcaption></figure><figure><img src={poster} alt="气泡饮发布海报"/><figcaption>新的表达</figcaption></figure></div>}
    {kind === 'templates' && <div className="wf-template-layout"><div className="wf-template-images"><img src={poster} alt="海报模板示例"/><img src={shoe} alt="广告模板示例"/><img src={drink} alt="产品摄影模板示例"/></div><div className="wf-template-caption"><strong>一种表达，不止用一次。</strong><span>参考图片 / 提示词 / 可编辑字段</span></div></div>}
    {kind === 'assets' && <div className="wf-library-layout"><div className="wf-library-images">{[poster,shoe,drink,original].map((src,i)=><img key={src} src={src} alt={`素材示例 ${i+1}`}/>)}</div><div className="wf-library-caption"><strong>收集。找到。再创作。</strong><span>图片与视频 · 搜索与收藏</span></div></div>}
    {kind === 'canvas' && <div className="wf-version-layout"><div><img src={drink} alt="原始版本"/><span>01 / 原图</span></div><div><img src={poster} alt="编辑版本"/><span>02 / 新版本</span></div><p>每一版，都有迹可循。</p></div>}
    {kind === 'video' && <div className="wf-video-layout"><img src={shoe} alt="视频创作的静态参考图片"/><div><Film size={19}/><span>从参考画面，到动态概念。</span></div><small>静态图解 · 生成能力取决于所选视频模型</small></div>}
    {kind === 'export' && <div className="wf-export-layout"><div className="wf-export-image"><img src={poster} alt="海报切图图解"/><span className="wf-slice-lines" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div><div className="wf-export-copy"><strong>一张图。<br/>多份素材。</strong><span>自由裁切<br/>宫格切图<br/>本地导出</span></div></div>}
    {kind === 'models' && <div className="wf-models-layout"><h3>模型，你来选择。</h3>{[['图片','生成与编辑'],['视频','静态到动态'],['对话','想法与方向']].map(([name,desc])=><div key={name}><strong>{name}</strong><span>{desc}</span><Check size={17}/></div>)}<p>连接自己的服务商与授权</p></div>}
    {kind === 'agent' && <div className="wf-code-layout"><div><Terminal size={18}/><span>从你的项目开始。</span></div><pre><code>iterlay image generate<br/>{'  --prompt "一张新品发布海报"'}<br/>{'  --out ./assets/poster.png'}</code></pre><span className="wf-code-footer">Coding Agent<ArrowRight size={15}/>Iterlay<ArrowRight size={15}/>项目素材</span></div>}
    {kind === 'plugins' && <div className="wf-plugin-layout"><span>工具，随任务扩展。</span><h3>角色。<br/>分镜。<br/>新的工作流。</h3><div>插件工具<ArrowRight size={17}/>你的创作流程</div><small>以短剧制作插件为例 · 需安装并启用</small></div>}
  </div>
}
