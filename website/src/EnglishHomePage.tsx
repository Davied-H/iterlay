import { ArrowRight, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { featuresEn } from './features.en'
import { AGENT_STARTER } from '../../shared/agent-starter'
import './agent-page.css'
import './help-page.css'

export default function EnglishHomePage() {
  return <div className="agent-page english-product">
    <section className="agent-container agent-hero" aria-labelledby="product-title">
      <div className="agent-hero-layout"><div className="agent-hero-copy"><h1 id="product-title">A workspace for your next image.</h1><p>Generate, edit and compare images on an infinite canvas. Keep references and iterations together, using your own model providers—with the app or your coding agent.</p><div className="agent-actions"><Link className="agent-primary" to="/download?lang=en"><Download size={16} />Download Iterlay</Link><Link className="agent-text-link" to="/agents?lang=en">Explore the FIELD workflow<ArrowRight size={16} /></Link></div><p className="agent-terms">Free and MIT-licensed · macOS & Windows · Model usage billed by your provider</p></div><figure className="agent-hero-image"><img src={`${import.meta.env.BASE_URL}agent-field-site.webp`} width="1200" height="900" alt="The finished FIELD example website using the orange speaker campaign image" fetchPriority="high" /><figcaption>FIELD: a fictional product, with real generated assets.</figcaption></figure></div>
    </section>
    <section className="agent-container agent-case"><div className="agent-section-heading"><h2>From a reference to files your project can use.</h2><p>Inspect an existing result before configuring a model. The FIELD example includes a product image, an edited version, campaign assets, a board and a finished static website.</p></div><div className="english-product-links"><a className="agent-secondary" href={`${import.meta.env.BASE_URL}${AGENT_STARTER.pagePath}`} target="_blank" rel="noreferrer">Open the finished example<ArrowRight size={16} /></a><Link className="agent-text-link" to="/agents?lang=en">Get the board and complete project<ArrowRight size={16} /></Link></div><p className="help-note">The website shows prepared examples. It does not run a model or save an editable desktop board. Download the example files to keep them; open the .itb board in the desktop app to continue editing.</p></section>
    <section className="agent-container agent-case"><div className="agent-section-heading"><h2>Explore the workspace.</h2><p>See what each tool does, how to use it and where model or platform limits apply.</p></div><div className="product-feature-list">{featuresEn.map(feature => <Link key={feature.id} to={`/wiki?lang=en&feature=${feature.id}`}><span><strong>{feature.name}</strong><span>{feature.summary}</span></span><ArrowRight size={17} /></Link>)}</div></section>
    <section className="agent-container agent-privacy"><h2>Your models. Local working files.</h2><div><p>The desktop app stores boards and assets on your computer. Prompts and required references go to the provider you choose. Export a board package before moving machines or removing app data.</p><Link className="agent-text-link" to="/help?lang=en">Setup, saving and troubleshooting<ArrowRight size={16} /></Link></div></section>
  </div>
}
