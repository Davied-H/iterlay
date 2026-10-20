import type { ComicDramaBoardSnapshot } from "@shared/comic-drama";

/** API v1 packages before 1.3.2 did not send their own assistant context. */
export function legacyAssistantFields(snapshot: ComicDramaBoardSnapshot, selectedNodeIds: readonly string[]) {
  return [
    { label: "完整漫剧节点快照", value: JSON.stringify(snapshot.nodes) },
    { label: "选中节点快照", value: JSON.stringify(snapshot.nodes.filter(node => selectedNodeIds.includes(node.id))) },
    { label: "画板 revision", value: String(snapshot.revision) },
    { label: "引用连接与分组摘要", value: JSON.stringify({ connections: snapshot.connections, groups: snapshot.groups }) }
  ];
}
