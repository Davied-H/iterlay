interface ProductStory {
  title: string
  description: string
  image: string
  alt: string
}

const stories: readonly ProductStory[] = [
  {
    title: '一张画板，容纳整个创作过程。',
    description: '素材、参考与结果始终在同一个空间里，关系一眼可见。',
    image: `${import.meta.env.BASE_URL}iterlay-demo-board.png`,
    alt: 'Iterlay 画板中排列的素材、参考图与生成结果',
  },
  {
    title: '点一下，就在原位继续编辑。',
    description: '不离开画板，不打断思路。选中结果，描述你想改变的部分。',
    image: `${import.meta.env.BASE_URL}iterlay-demo-edit.png`,
    alt: 'Iterlay 在画板内编辑图片的界面',
  },
  {
    title: '每次尝试，都成为下一版。',
    description: '原图、提示词与生成关系完整保留，随时比较，也随时回到之前。',
    image: `${import.meta.env.BASE_URL}iterlay-demo-versions.png`,
    alt: 'Iterlay 图片版本比较界面',
  },
  {
    title: '灵感向前，过程留下来。',
    description: '生成记录和素材脉络始终可追溯，让上一轮探索自然成为下一轮起点。',
    image: `${import.meta.env.BASE_URL}iterlay-demo-history.png`,
    alt: 'Iterlay 的生成历史界面',
  },
]

export default function ProductScrollShowcase() {
  return (
    <section className="product-showcase" aria-label="Iterlay 产品工作流">
      <div className="product-showcase-heading">
        <p className="section-kicker">创作工作流</p>
        <h2>从开始到下一版，始终留在同一个工作空间。</h2>
      </div>
      <div className="product-showcase-grid">
        {stories.map((story, index) => (
          <article className="product-showcase-item" key={story.title}>
            <div className="product-showcase-copy">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{story.title}</h3>
              <p>{story.description}</p>
            </div>
            <figure className="product-showcase-frame">
              <img
                src={story.image}
                alt={story.alt}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={index === 0 ? 'high' : 'auto'}
              />
            </figure>
          </article>
        ))}
      </div>
    </section>
  )
}
