export const galleryAsset = (name: string) => `${import.meta.env.BASE_URL}gallery/${name.includes('.') ? name : `${name}.jpg`}`

// Accepted newly generated assets only. No legacy demo images are used.
export const demoCases = [
  {
    "id": "yuzu-poster",
    "name": "柚子气泡饮上新海报",
    "subject": "柚子气泡饮海报",
    "title": "把一罐气泡饮做成上新海报",
    "description": "从重新设计的柚子饮料包装出发，用开心果绿、朱红标题与日光阴影，排出一张有记忆点的海报。",
    "source": "v2/yuzu-source.webp",
    "result": "v2/yuzu-poster.webp",
    "sourceName": "新设计的气泡饮包装",
    "resultName": "YUZU 新口味海报",
    "heroAlt": "黄柚色气泡饮与新鲜柚子，搭配开心果绿背景和醒目的朱红 YUZU 排版",
    "outcome": "产品棚拍 → 新口味海报",
    "action": "体验气泡饮海报",
    "dimensions": "1024 × 1024",
    "prompt": "保留这罐柚子气泡饮的包装，做一张新口味海报。使用浅开心果绿背景、朱红标题和干净的日光阴影，加入少量柚子元素，排版清晰。"
  },
  {
    "id": "silver-trail",
    "name": "越野跑鞋沙丘广告",
    "subject": "银色越野跑鞋广告",
    "title": "把银色跑鞋放进赭红沙丘",
    "description": "银色织物、浅黄绿鞋带和粗纹鞋底保持一致。换一个场景，让技术细节与沙丘的暖色形成反差。",
    "source": "v2/runner-source.webp",
    "result": "v2/runner-campaign.webp",
    "sourceName": "银色跑鞋棚拍",
    "resultName": "风蚀沙丘广告",
    "heroAlt": "银色越野跑鞋置于赭红砂岩和沙丘中，浅黄绿鞋带与银色技术织物清晰可见",
    "outcome": "中性棚拍 → 沙丘运动广告",
    "action": "体验跑鞋沙丘广告",
    "dimensions": "1024 × 1024",
    "prompt": "保持银色鞋面、浅黄绿鞋带和鞋底不变，把鞋放到赭红砂岩与风蚀沙丘中。用硬朗日光突出材质，做一张运动品牌感的广告。"
  }
] as const
