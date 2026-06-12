import type { NodeV2, NodeV2Type } from "../../../shared/types.js";
import { NODE_REGISTRY, GRID_SIZE } from "../../../shared/nodeRegistry.js";

const VERTICAL_GAP = 40;
const BRANCH_GAP = 80;
const COLUMN_WIDTH = 240;
const CONTEXT_X_OFFSET = -288;

function snap(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

export interface NewNodeSpec {
  tempId: string;
  nodeType: NodeV2Type;
}

export interface NewEdgeSpec {
  sourceId: string;
  targetId: string;
  kind: string;
}

// Returns the Y at which a new column at (columnX, columnWidth) would clear all existing nodes
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

export function computeLayoutForBatch(
  existingNodes: Map<string, NodeV2>,
  newNodes: NewNodeSpec[],
  newEdges: NewEdgeSpec[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (newNodes.length === 0) return positions;

  const newNodeMap = new Map(newNodes.map((n) => [n.tempId, n]));
  const newTempIds = new Set(newNodes.map((n) => n.tempId));
  const existingIds = new Set(existingNodes.keys());

  // Build flow adjacency (multi-value successors for parallel support)
  const flowSuccs = new Map<string, string[]>();
  const flowPreds = new Map<string, string[]>();
  const midputTargets = new Map<string, string>(); // context tempId → target tempId

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

  // BFS from a parallel node to find its paired merge node
  function findMergeNode(forkId: string): string | null {
    const visited = new Set<string>();
    const queue = [forkId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const succs = flowSuccs.get(id) ?? [];
      for (const s of succs) {
        if (!newTempIds.has(s)) continue;
        const spec = newNodeMap.get(s);
        if (spec?.nodeType === "merge") return s;
        queue.push(s);
      }
    }
    return null;
  }

  // Recursive layout: places node `id` at (x, y), returns bottom Y after layout subtree
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
    let nextY = snap(y + nodeH + VERTICAL_GAP);

    const succs = (flowSuccs.get(id) ?? []).filter((s) => newTempIds.has(s) && s !== stopAtId);

    if (succs.length === 0) {
      return nextY;
    }

    if (succs.length === 1) {
      return layout(succs[0], x, nextY, stopAtId);
    }

    // Fork: lay branches out horizontally
    const mergeId = findMergeNode(id);
    const totalWidth = succs.length * COLUMN_WIDTH + (succs.length - 1) * BRANCH_GAP;
    const startX = x - totalWidth / 2;

    let maxBranchBottom = nextY;
    for (let i = 0; i < succs.length; i++) {
      const branchX = startX + i * (COLUMN_WIDTH + BRANCH_GAP);
      // Each branch starts right below the fork node; clear any existing nodes in that column
      const branchStartY = clearanceY(existingNodes, branchX, COLUMN_WIDTH, nextY);
      const branchBottom = layout(succs[i], branchX, branchStartY, mergeId);
      if (branchBottom > maxBranchBottom) maxBranchBottom = branchBottom;
    }

    if (mergeId && !visited.has(mergeId)) {
      return layout(mergeId, x, maxBranchBottom, stopAtId);
    }

    return maxBranchBottom;
  }

  // Find chain anchor
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

  // Total horizontal span of the new batch for overlap clearance
  const parallelCount = newNodes.filter((n) => n.nodeType === "parallel").length;
  const branchCount = parallelCount > 0 ? Math.max(2, (flowSuccs.get(
    newNodes.find((n) => n.nodeType === "parallel")?.tempId ?? ""
  ) ?? []).length) : 1;
  const estimatedWidth = parallelCount > 0
    ? branchCount * COLUMN_WIDTH + (branchCount - 1) * BRANCH_GAP
    : COLUMN_WIDTH;

  anchorY = clearanceY(
    existingNodes,
    anchorX - estimatedWidth / 2,
    estimatedWidth,
    anchorY
  );

  // Layout chain roots
  const roots = chainTempIds.filter((id) => {
    const preds = flowPreds.get(id) ?? [];
    return preds.length === 0 || preds.every((p) => existingIds.has(p));
  });
  const stragglers = chainTempIds.filter((id) => !roots.includes(id) && !visited.has(id));

  let currentY = snap(anchorY);
  for (const root of roots) {
    currentY = layout(root, anchorX, currentY, null);
  }
  for (const id of stragglers) {
    if (!visited.has(id)) {
      currentY = layout(id, anchorX, currentY, null);
    }
  }

  // Assign context node positions: left of their midput target
  const contextDef = NODE_REGISTRY["context"];
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
