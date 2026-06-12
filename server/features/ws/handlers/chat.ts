import type { WebSocket } from "ws";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { EdgeV2Kind } from "../../../../shared/types.js";
import { send, broadcast, nodes, edges, chatTranscript, appendChatMessage } from "../../state/store.js";
import { createNodeFromPayload, createEdge, updateNode, deleteNode, deleteEdge } from "../../state/operations.js";
import { serializeGraph } from "../../chat/graphSerializer.js";
import { validateGraph } from "../../chat/graphValidator.js";
import { simulateOperations } from "../../chat/graphSimulator.js";
import { computeLayoutForBatch } from "../../chat/graphLayout.js";
import type { ChatGraphOperation } from "../../chat/graphSimulator.js";
import { callChatModel, CHAT_SYSTEM_PROMPT } from "../../chat/chatProvider.js";

function modelHistory(): ChatCompletionMessageParam[] {
  return chatTranscript.slice(-40).map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function proposalText(text: string, summary: string | undefined): string {
  if (text.trim()) return text;
  const summaryText = typeof summary === "string" ? summary.trim() : "";
  return summaryText
    ? `Here's what I'd propose: ${summaryText}. Review the changes and apply when ready.`
    : "Here's a workflow proposal. Review the changes and apply when ready.";
}

function textOrFallback(text: string, fallback: string): string {
  return text.trim() ? text : fallback;
}

function applyAcknowledgement(operations: ChatGraphOperation[]): string {
  const count = operations.length;
  if (count === 1) return "Done, applied that change to the canvas.";
  return `Done, applied ${count} changes to the canvas.`;
}

function cloneOperation(op: ChatGraphOperation): ChatGraphOperation {
  if (op.op === "create_node") return { ...op, config: op.config ? { ...op.config } : undefined };
  if (op.op === "update_node") return { ...op, config: op.config ? { ...op.config } : undefined };
  if (op.op === "insert_node_between") return { ...op, config: op.config ? { ...op.config } : undefined };
  return { ...op };
}

interface NormalizedOpsResult {
  operations: ChatGraphOperation[];
  errors: string[];
}

function normText(value: string): string {
  return value.trim().toLowerCase();
}

function operationTempIds(operations: ChatGraphOperation[]): Set<string> {
  const ids = new Set<string>();
  for (const op of operations) {
    if ((op.op === "create_node" || op.op === "insert_node_between") && op.tempId) ids.add(op.tempId);
  }
  return ids;
}

function resolveNodeRef(ref: string, tempIds: Set<string>): string {
  const value = ref.trim();
  if (!value) return ref;
  if (tempIds.has(value)) return value;
  if (nodes.has(value)) return value;

  const target = normText(value);
  const titleMatches = Array.from(nodes.values()).filter((node) => normText(node.title) === target);
  if (titleMatches.length === 1) return titleMatches[0].id;

  const typeMatches = Array.from(nodes.values()).filter((node) => node.type === target);
  if (typeMatches.length === 1) return typeMatches[0].id;

  const labelMatches = Array.from(nodes.values()).filter((node) => {
    const canonical = `${node.type} ${node.title}`;
    return normText(canonical) === target;
  });
  if (labelMatches.length === 1) return labelMatches[0].id;

  return ref;
}

function findExistingEdgeId(
  edgeRef: string | undefined,
  sourceRef: string | undefined,
  targetRef: string | undefined,
  kind: EdgeV2Kind | undefined,
  tempIds: Set<string>
): string | null {
  if (edgeRef) {
    const trimmed = edgeRef.trim();
    if (edges.has(trimmed)) return trimmed;
    for (const [edgeId, edge] of edges) {
      const syntheticRefs = [
        `${edge.sourceId}-${edge.targetId}`,
        `${edge.sourceId}->${edge.targetId}`,
        `${edge.sourceId}:${edge.targetId}`,
        `${edge.sourceId}:${edge.targetId}:${edge.kind}`,
      ];
      if (syntheticRefs.includes(trimmed) && (!kind || edge.kind === kind)) return edgeId;
    }
  }

  if (!sourceRef || !targetRef) return null;
  const sourceId = resolveNodeRef(sourceRef, tempIds);
  const targetId = resolveNodeRef(targetRef, tempIds);
  for (const [edgeId, edge] of edges) {
    if (edge.sourceId === sourceId && edge.targetId === targetId && (!kind || edge.kind === kind)) {
      return edgeId;
    }
  }
  return null;
}

function normalizeChatOperationsForGraph(operations: ChatGraphOperation[]): NormalizedOpsResult {
  const tempIds = operationTempIds(operations);
  const normalized: ChatGraphOperation[] = [];
  const errors: string[] = [];
  const deletedEdgeIds = new Set<string>();

  function pushDeleteEdge(edgeId: string): void {
    if (deletedEdgeIds.has(edgeId)) return;
    deletedEdgeIds.add(edgeId);
    normalized.push({ op: "delete_edge", edgeId });
  }

  for (const rawOp of operations) {
    const op = cloneOperation(rawOp);

    if (op.op === "create_edge") {
      normalized.push({
        ...op,
        sourceId: resolveNodeRef(op.sourceId, tempIds),
        targetId: resolveNodeRef(op.targetId, tempIds),
      });
      continue;
    }

    if (op.op === "update_node") {
      normalized.push({ ...op, nodeId: resolveNodeRef(op.nodeId, tempIds) });
      continue;
    }

    if (op.op === "delete_node") {
      normalized.push({ ...op, nodeId: resolveNodeRef(op.nodeId, tempIds) });
      continue;
    }

    if (op.op === "delete_edge") {
      const edgeId = findExistingEdgeId(op.edgeId, op.sourceId, op.targetId, op.kind, tempIds);
      if (edgeId) {
        pushDeleteEdge(edgeId);
      } else {
        normalized.push({
          ...op,
          sourceId: op.sourceId ? resolveNodeRef(op.sourceId, tempIds) : undefined,
          targetId: op.targetId ? resolveNodeRef(op.targetId, tempIds) : undefined,
        });
      }
      continue;
    }

    if (op.op === "delete_edge_between") {
      const edgeId = findExistingEdgeId(undefined, op.sourceId, op.targetId, op.kind, tempIds);
      if (edgeId) {
        pushDeleteEdge(edgeId);
      } else {
        errors.push(`Edge not found between "${op.sourceId}" and "${op.targetId}".`);
      }
      continue;
    }

    if (op.op === "insert_node_between") {
      const sourceId = resolveNodeRef(op.sourceId, tempIds);
      const targetId = resolveNodeRef(op.targetId, tempIds);
      const edgeId = findExistingEdgeId(undefined, sourceId, targetId, op.kind ?? "flow", tempIds)
        ?? findExistingEdgeId(undefined, sourceId, targetId, undefined, tempIds);
      const existingEdge = edgeId ? edges.get(edgeId) : null;
      if (!edgeId || !existingEdge) {
        errors.push(`Edge not found between "${op.sourceId}" and "${op.targetId}".`);
        continue;
      }

      pushDeleteEdge(edgeId);
      normalized.push({ op: "create_node", tempId: op.tempId, nodeType: op.nodeType, title: op.title, config: op.config });
      normalized.push({ op: "create_edge", tempId: `${op.tempId}-in`, sourceId: existingEdge.sourceId, targetId: op.tempId, kind: existingEdge.kind });
      normalized.push({ op: "create_edge", tempId: `${op.tempId}-out`, sourceId: op.tempId, targetId: existingEdge.targetId, kind: existingEdge.kind === "reject" ? "flow" : existingEdge.kind });
      continue;
    }

    normalized.push(op);
  }

  return { operations: normalized, errors };
}

const OUTPUT_INJECT_RE = /\b(error|fail|wrong|broken|crash|output|result|what did|why|didn.t work)\b/i;

function buildOutputContext(userText: string, selectedNodeId: string | null): string {
  const hasKeyword = OUTPUT_INJECT_RE.test(userText);
  const hasErrors = Array.from(nodes.values()).some((n) => n.status === "error");

  if (!hasKeyword && !hasErrors && !selectedNodeId) return "";

  const parts: string[] = [];
  let total = 0;
  const MAX = 2000;

  for (const node of nodes.values()) {
    if (!node.output || total >= MAX) continue;
    const isSelected = selectedNodeId !== null && node.id === selectedNodeId;
    const isError = node.status === "error";
    const isDone = node.status === "done";
    if (!isSelected && !isError && !(hasKeyword && isDone)) continue;

    const excerpt = isError ? node.output : node.output.slice(0, 500);
    const entry = `\n${node.title} (${node.status ?? "unknown"}):\n${excerpt}`;
    parts.push(entry);
    total += entry.length;
  }

  if (parts.length === 0) return "";
  return `\n\n## Node Outputs & Errors${parts.join("")}`;
}

export async function handleChatMessage(
  ws: WebSocket,
  _userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const rawUserText = String(data.content ?? "").trim();
  if (!rawUserText) return;

  const selectedNodeId = typeof data.selectedNodeId === "string" ? data.selectedNodeId : null;

  const history = modelHistory();
  appendChatMessage("user", rawUserText);

  const graphContext = serializeGraph(nodes, edges);
  const issues = validateGraph(nodes, edges);
  const issuesText = issues.length > 0
    ? `\nGRAPH ISSUES:\n${issues.map((i) => `  [${i.kind}] ${i.message}`).join("\n")}`
    : "";
  const outputContext = buildOutputContext(rawUserText, selectedNodeId);

  const fullUserContent = `${graphContext}${issuesText}${outputContext}\n\n---\nUSER: ${rawUserText}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: fullUserContent },
  ];

  try {
    const { text, toolName, toolArgs } = await callChatModel(messages, (chunk) => {
      send(ws, { type: "chat:chunk", text: chunk });
    });
    let assistantHistoryText = text || "(no text)";

    if (toolName === "propose_operations" && toolArgs) {
      const { summary, operations } = toolArgs as { summary: string; operations: ChatGraphOperation[] };
      const resolved = normalizeChatOperationsForGraph(Array.isArray(operations) ? operations : []);
      const finalOperations = resolved.operations;
      const operationErrors = resolved.errors;
      const finalText = proposalText(text, summary);
      assistantHistoryText = finalText;

      const simResult = simulateOperations(nodes, edges, finalOperations);

      if (operationErrors.length > 0 || simResult.errors.length > 0) {
        const errorText = textOrFallback(text, "I tried to build an operation plan, but it failed validation.");
        assistantHistoryText = errorText;
        send(ws, {
          type: "chat:done",
          text: errorText,
          error: [...operationErrors, ...simResult.errors].join(". "),
        });
      } else {
        const blockingErrors = validateGraph(simResult.nodes, simResult.edges).filter((i) => i.kind === "error");
        if (blockingErrors.length > 0) {
          const errorText = textOrFallback(text, "These changes would leave the graph in an invalid state.");
          assistantHistoryText = errorText;
          send(ws, {
            type: "chat:done",
            text: errorText,
            error: blockingErrors.map((i) => i.message).join(". "),
          });
        } else {
          send(ws, {
            type: "chat:done",
            text: finalText,
            pendingOps: finalOperations,
            pendingSummary: summary,
          });
        }
      }
    } else if (toolName === "execute_command" && toolArgs) {
      const { command, nodeId } = toolArgs as { command: string; nodeId?: string };
      send(ws, { type: "chat:done", text, command, commandNodeId: nodeId ?? null });
    } else {
      send(ws, { type: "chat:done", text });
    }

    appendChatMessage("assistant", assistantHistoryText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendChatMessage("assistant", `Chat error: ${message}`);
    send(ws, { type: "chat:error", message });
  }
}

export function handleChatApply(
  ws: WebSocket,
  userId: string,
  data: Record<string, unknown>
): void {
  const rawOps = data.operations;
  if (!Array.isArray(rawOps)) return;

  const normalized = normalizeChatOperationsForGraph(rawOps as ChatGraphOperation[]);
  if (normalized.errors.length > 0) {
    send(ws, {
      type: "chat:done",
      text: "I couldn't apply those changes because I couldn't resolve part of the graph edit.",
      error: normalized.errors.join(". "),
    });
    return;
  }

  const operations = normalized.operations;

  const simResult = simulateOperations(nodes, edges, operations);
  if (simResult.errors.length > 0) {
    send(ws, {
      type: "chat:done",
      text: "I couldn't apply those changes because they no longer validate.",
      error: simResult.errors.join(". "),
    });
    return;
  }

  const blockingErrors = validateGraph(simResult.nodes, simResult.edges).filter((i) => i.kind === "error");
  if (blockingErrors.length > 0) {
    send(ws, {
      type: "chat:done",
      text: "I couldn't apply those changes because they would leave the graph invalid.",
      error: blockingErrors.map((i) => i.message).join(". "),
    });
    return;
  }

  const createNodeOps = operations.filter(
    (op): op is Extract<ChatGraphOperation, { op: "create_node" }> => op.op === "create_node"
  );
  const createEdgeOps = operations.filter(
    (op): op is Extract<ChatGraphOperation, { op: "create_edge" }> => op.op === "create_edge"
  );

  const layoutPositions = computeLayoutForBatch(
    nodes,
    createNodeOps.map((op) => ({ tempId: op.tempId, nodeType: op.nodeType })),
    createEdgeOps.map((op) => ({ sourceId: op.sourceId, targetId: op.targetId, kind: op.kind }))
  );

  const tempIdToRealId = new Map<string, string>();

  function resolveId(id: string): string {
    return tempIdToRealId.get(id) ?? id;
  }

  for (const op of operations) {
    if (op.op === "create_node") {
      const pos = layoutPositions.get(op.tempId) ?? op.position ?? { x: 400, y: 200 };
      const node = createNodeFromPayload({ type: op.nodeType, position: pos, title: op.title, config: op.config, userId });
      if (node) {
        tempIdToRealId.set(op.tempId, node.id);
        broadcast({ type: "node:created", node });
      }
    } else if (op.op === "update_node") {
      const realId = resolveId(op.nodeId);
      const updated = updateNode(realId, { title: op.title, config: op.config });
      if (updated) broadcast({ type: "node:updated", node: updated });
    } else if (op.op === "delete_node") {
      const realId = resolveId(op.nodeId);
      const relatedEdgeIds = Array.from(edges.entries())
        .filter(([, e]) => e.sourceId === realId || e.targetId === realId)
        .map(([id]) => id);
      for (const eid of relatedEdgeIds) broadcast({ type: "edge:deleted", edgeId: eid });
      if (deleteNode(realId)) broadcast({ type: "node:deleted", nodeId: realId });
    } else if (op.op === "create_edge") {
      const realSourceId = resolveId(op.sourceId);
      const realTargetId = resolveId(op.targetId);
      const edge = createEdge({ sourceId: realSourceId, targetId: realTargetId, kind: op.kind, userId });
      if (edge) {
        tempIdToRealId.set(op.tempId, edge.id);
        broadcast({ type: "edge:created", edge });
      }
    } else if (op.op === "delete_edge") {
      const realId = resolveId(op.edgeId);
      if (deleteEdge(realId)) broadcast({ type: "edge:deleted", edgeId: realId });
    }
  }

  send(ws, { type: "chat:applied" });
  send(ws, { type: "chat:done", text: applyAcknowledgement(operations) });
}
