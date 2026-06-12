import { GRID_SIZE, NODE_REGISTRY } from "../../shared/nodeRegistry.js";
import type { ChatGraphOperation, EdgeV2, NodeV2, NodeV2Type } from "../types/index.js";
import type { GraphPreviewState } from "./render.js";

const VERTICAL_GAP = 40;
const BRANCH_GAP = 80;
const COLUMN_WIDTH = 240;
const CONTEXT_X_OFFSET = -288;

function snap(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

function clearanceY(
  existingNodes: Map<string, NodeV2>,
  columnX: number,
  columnWidth: number,
  startY: number
): number {
  let minY = startY;
  for (const node of existingNodes.values()) {
    if (node.x + node.width <= columnX || node.x >= columnX + columnWidth) continue;
    const bottom = node.y + node.height + VERTICAL_GAP;
    if (bottom > minY) minY = bottom;
  }
  return snap(minY);
}

function computePreviewLayout(
  existingNodes: Map<string, NodeV2>,
  newNodes: Array<{ tempId: string; nodeType: NodeV2Type }>,
  newEdges: Array<{ sourceId: string; targetId: string; kind: string }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (newNodes.length === 0) return positions;

  const newNodeMap = new Map(newNodes.map((n) => [n.tempId, n]));
  const newTempIds = new Set(newNodes.map((n) => n.tempId));
  const existingIds = new Set(existingNodes.keys());

  const flowSuccs = new Map<string, string[]>();
  const flowPreds = new Map<string, string[]>();
  const midputTargets = new Map<string, string>();

  for (const edge of newEdges) {
    if (edge.kind === "flow") {
      if (!flowSuccs.has(edge.sourceId)) flowSuccs.set(edge.sourceId, []);
      flowSuccs.get(edge.sourceId)!.push(edge.targetId);
      if (!flowPreds.has(edge.targetId)) flowPreds.set(edge.targetId, []);
      flowPreds.get(edge.targetId)!.push(edge.sourceId);
    }
    if (edge.kind === "midput") {
      midputTargets.set(edge.sourceId, edge.targetId);
    }
  }

  const contextTempIds = new Set(newNodes.filter((n) => n.nodeType === "context").map((n) => n.tempId));
  const chainTempIds = newNodes.filter((n) => n.nodeType !== "context").map((n) => n.tempId);

  function findMergeNode(forkId: string): string | null {
    const seen = new Set<string>();
    const queue = [forkId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const succs = flowSuccs.get(id) ?? [];
      for (const s of succs) {
        if (!newTempIds.has(s)) continue;
        if (newNodeMap.get(s)?.nodeType === "merge") return s;
        queue.push(s);
      }
    }
    return null;
  }

  const visited = new Set<string>();

  function layout(id: string, x: number, y: number, stopAtId: string | null): number {
    if (!newTempIds.has(id) || contextTempIds.has(id)) return y;
    if (visited.has(id)) return positions.get(id)?.y ?? y;
    if (id === stopAtId) return y;

    visited.add(id);
    positions.set(id, { x: snap(x), y: snap(y) });

    const spec = newNodeMap.get(id);
    const def = spec ? NODE_REGISTRY[spec.nodeType] : null;
    const nodeH = def?.height ?? 104;
    const nextY = snap(y + nodeH + VERTICAL_GAP);

    const succs = (flowSuccs.get(id) ?? []).filter((s) => newTempIds.has(s) && s !== stopAtId);

    if (succs.length === 0) return nextY;
    if (succs.length === 1) return layout(succs[0], x, nextY, stopAtId);

    const mergeId = findMergeNode(id);
    const totalWidth = succs.length * COLUMN_WIDTH + (succs.length - 1) * BRANCH_GAP;
    const startX = x - totalWidth / 2;

    let maxBranchBottom = nextY;
    for (let i = 0; i < succs.length; i++) {
      const branchX = startX + i * (COLUMN_WIDTH + BRANCH_GAP);
      const branchStartY = clearanceY(existingNodes, branchX, COLUMN_WIDTH, nextY);
      const branchBottom = layout(succs[i], branchX, branchStartY, mergeId);
      if (branchBottom > maxBranchBottom) maxBranchBottom = branchBottom;
    }

    if (mergeId && !visited.has(mergeId)) {
      return layout(mergeId, x, maxBranchBottom, stopAtId);
    }
    return maxBranchBottom;
  }

  let anchorX = 400;
  let anchorY = 200;
  if (existingNodes.size > 0) {
    let maxBottom = -Infinity;
    for (const node of existingNodes.values()) {
      const bottom = node.y + node.height;
      if (bottom > maxBottom) {
        maxBottom = bottom;
        anchorX = node.x;
        anchorY = maxBottom + VERTICAL_GAP;
      }
    }
  }

  const parallelNode = newNodes.find((n) => n.nodeType === "parallel");
  const branchCount = parallelNode
    ? Math.max(2, (flowSuccs.get(parallelNode.tempId) ?? []).length)
    : 1;
  const estimatedWidth = parallelNode
    ? branchCount * COLUMN_WIDTH + (branchCount - 1) * BRANCH_GAP
    : COLUMN_WIDTH;

  anchorY = clearanceY(existingNodes, anchorX - estimatedWidth / 2, estimatedWidth, anchorY);

  const roots = chainTempIds.filter((id) => {
    const preds = flowPreds.get(id) ?? [];
    return preds.length === 0 || preds.every((p) => existingIds.has(p));
  });
  const stragglers = chainTempIds.filter((id) => !roots.includes(id) && !visited.has(id));

  let currentY = snap(anchorY);
  for (const root of roots) currentY = layout(root, anchorX, currentY, null);
  for (const id of stragglers) { if (!visited.has(id)) currentY = layout(id, anchorX, currentY, null); }

  const contextDef = NODE_REGISTRY.context;
  for (const tempId of contextTempIds) {
    const targetTempId = midputTargets.get(tempId);
    const targetPos = targetTempId ? positions.get(targetTempId) : null;
    const targetSpec = targetTempId ? newNodeMap.get(targetTempId) : null;
    const targetDef = targetSpec ? NODE_REGISTRY[targetSpec.nodeType] : null;

    if (targetPos && targetDef) {
      const targetMidY = targetPos.y + targetDef.height / 2;
      positions.set(tempId, {
        x: snap(targetPos.x + CONTEXT_X_OFFSET),
        y: snap(targetMidY - contextDef.height / 2),
      });
    } else {
      positions.set(tempId, { x: snap(anchorX + CONTEXT_X_OFFSET), y: snap(anchorY) });
    }
  }

  return positions;
}

export function buildChatGraphPreview(
  operations: ChatGraphOperation[] | null,
  existingNodes: Map<string, NodeV2>,
  existingEdges: Map<string, EdgeV2>
): GraphPreviewState | null {
  if (!operations?.length) return null;

  const createNodeOps = operations.filter(
    (op): op is Extract<ChatGraphOperation, { op: "create_node" }> => op.op === "create_node"
  );
  const createEdgeOps = operations.filter(
    (op): op is Extract<ChatGraphOperation, { op: "create_edge" }> => op.op === "create_edge"
  );
  const layoutPositions = computePreviewLayout(
    existingNodes,
    createNodeOps.map((op) => ({ tempId: op.tempId, nodeType: op.nodeType })),
    createEdgeOps.map((op) => ({ sourceId: op.sourceId, targetId: op.targetId, kind: op.kind }))
  );

  const previewNodes: NodeV2[] = [];
  const previewEdges: EdgeV2[] = [];
  const tempIdToPreviewId = new Map<string, string>();
  const previewLookup = new Map(existingNodes);

  function resolveId(id: string): string {
    return tempIdToPreviewId.get(id) ?? id;
  }

  for (const op of operations) {
    if (op.op === "create_node") {
      const def = NODE_REGISTRY[op.nodeType];
      if (!def) continue;
      const id = `preview-${op.tempId}`;
      tempIdToPreviewId.set(op.tempId, id);
      const pos = layoutPositions.get(op.tempId) ?? op.position ?? { x: 400, y: 200 };
      const node: NodeV2 = {
        id,
        type: op.nodeType,
        title: op.title ?? def.defaultTitle,
        x: snap(pos.x),
        y: snap(pos.y),
        width: def.width,
        height: def.height,
        config: { ...def.defaultConfig, ...(op.config ?? {}) },
        status: "idle",
        output: null,
        createdBy: "chat-preview",
        createdAt: 0,
        updatedAt: 0,
      };
      previewNodes.push(node);
      previewLookup.set(id, node);
    } else if (op.op === "update_node") {
      const existing = existingNodes.get(op.nodeId);
      if (!existing) continue;
      const node: NodeV2 = {
        ...existing,
        title: op.title ?? existing.title,
        config: op.config ? { ...existing.config, ...op.config } : existing.config,
        updatedAt: Date.now(),
      };
      previewNodes.push(node);
      previewLookup.set(node.id, node);
    } else if (op.op === "delete_node") {
      previewLookup.delete(op.nodeId);
    } else if (op.op === "create_edge") {
      const sourceId = resolveId(op.sourceId);
      const targetId = resolveId(op.targetId);
      if (!previewLookup.has(sourceId) || !previewLookup.has(targetId)) continue;
      previewEdges.push({
        id: `preview-${op.tempId}`,
        sourceId,
        targetId,
        kind: op.kind,
        createdBy: "chat-preview",
        createdAt: 0,
      });
    } else if (op.op === "delete_edge") {
      const existing = existingEdges.get(op.edgeId);
      if (!existing) continue;
    }
  }

  if (previewNodes.length === 0 && previewEdges.length === 0) return null;
  return { nodes: previewNodes, edges: previewEdges };
}
