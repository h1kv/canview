import type { NodeV2, NodeV2Config, NodeV2Type, WorkspaceTab } from "../../types/index.js";
import { NODE_REGISTRY, SDLC_NODE_TYPES } from "../../../shared/nodeRegistry.js";
import { ChatPanel } from "./ChatPanel.js";

interface SidebarProps {
  workspaceTab: WorkspaceTab;
  sidebarTab: string | null;
  mode: string;
  placingType: NodeV2Type | null;
  selectedNode: NodeV2 | null;
  selectedTitleDraft: string;
  hasInitialiser: boolean;
  chainRunning: boolean;
  onSetMode: (mode: "select" | "place", nodeType?: NodeV2Type) => void;
  onPlaceNode: (type: NodeV2Type) => void;
  onTitleChange: (title: string) => void;
  onConfigChange: (config: Partial<NodeV2Config>) => void;
  onDeleteNode: () => void;
  onRunChain: () => void;
  onStopChain: () => void;
  socketRef: React.MutableRefObject<WebSocket | null>;
}

function SidebarPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="vsc-chat-placeholder">
      <p>{title}</p>
      <p className="sub">{body}</p>
    </div>
  );
}

function NodeButton({
  type,
  isPlacing,
  onPlace,
}: {
  type: NodeV2Type;
  isPlacing: boolean;
  onPlace: (type: NodeV2Type) => void;
}) {
  const def = NODE_REGISTRY[type];
  return (
    <button
      type="button"
      className={`vsc-list-item${isPlacing ? " vsc-list-item--placing" : ""}`}
      onClick={() => onPlace(type)}
      title={`Place ${def.label} node`}
    >
      <span className="vsc-node-dot" style={{ background: def.accent }} />
      <span className="vsc-list-label">{def.label}</span>
    </button>
  );
}

function NodeProperties({
  node,
  titleDraft,
  onTitleChange,
  onConfigChange,
  onDelete,
}: {
  node: NodeV2;
  titleDraft: string;
  onTitleChange: (t: string) => void;
  onConfigChange: (c: Partial<NodeV2Config>) => void;
  onDelete: () => void;
}) {
  const def = NODE_REGISTRY[node.type];
  const isSDLC = SDLC_NODE_TYPES.includes(node.type as typeof SDLC_NODE_TYPES[number]);

  return (
    <div className="vsc-inspector">
      {/* Header */}
      <div className="vsc-inspector-hdr">
        <span
          className="vsc-inspector-badge"
          style={{ background: `${def.accent}18`, color: def.accent, borderColor: `${def.accent}40` }}
        >
          {def.label}
        </span>
        <span className="vsc-inspector-pos">{Math.round(node.x)}, {Math.round(node.y)}</span>
        {node.status && node.status !== "idle" && (
          <span className={`vsc-inspector-status vsc-inspector-status--${node.status}`}>
            {node.status}
          </span>
        )}
      </div>

      <div className="vsc-inspector-body">
        {/* Title */}
        <label className="vsc-field">
          <span className="vsc-field-label">Title</span>
          <input
            className="vsc-field-input"
            type="text"
            value={titleDraft}
            onChange={(e) => onTitleChange(e.target.value)}
            spellCheck={false}
          />
        </label>

        {/* Workspace path for Initialiser */}
        {node.type === "initialiser" && (
          <label className="vsc-field">
            <span className="vsc-field-label">Workspace Path</span>
            <input
              className="vsc-field-input"
              type="text"
              value={node.config?.workspacePath ?? ""}
              onChange={(e) => onConfigChange({ workspacePath: e.target.value })}
              spellCheck={false}
              placeholder="./workspace"
            />
          </label>
        )}

        {/* Context content */}
        {node.type === "context" && (
          <label className="vsc-field">
            <span className="vsc-field-label">Context</span>
            <textarea
              className="vsc-field-textarea"
              value={node.config?.content ?? ""}
              onChange={(e) => onConfigChange({ content: e.target.value })}
              spellCheck={false}
              placeholder="Context to inject into connected nodes…"
              rows={5}
            />
          </label>
        )}

        {/* Task prompt for SDLC */}
        {isSDLC && (
          <label className="vsc-field">
            <span className="vsc-field-label">Task Prompt</span>
            <textarea
              className="vsc-field-textarea"
              value={node.config?.taskPrompt ?? ""}
              onChange={(e) => onConfigChange({ taskPrompt: e.target.value })}
              spellCheck={false}
              placeholder={`What should ${def.label} do in this run?`}
              rows={5}
            />
          </label>
        )}

        {/* Error output */}
        {node.status === "error" && node.output && (
          <div className="vsc-field">
            <span className="vsc-field-label">Error</span>
            <div className="vsc-field-error">{node.output}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="vsc-inspector-footer">
        <button type="button" className="vsc-inspector-delete" onClick={onDelete}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66H14.5a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0z"/>
          </svg>
          Delete node
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  workspaceTab,
  sidebarTab,
  mode,
  placingType,
  selectedNode,
  selectedTitleDraft,
  hasInitialiser,
  chainRunning,
  onSetMode,
  onPlaceNode,
  onTitleChange,
  onConfigChange,
  onDeleteNode,
  onRunChain,
  onStopChain,
  socketRef,
}: SidebarProps) {
  const isChat = sidebarTab === "chat";
  const isToolbox = sidebarTab === "toolbox";

  function handlePlace(type: NodeV2Type) {
    if (mode === "place" && placingType === type) {
      onSetMode("select");
    } else {
      onPlaceNode(type);
    }
  }

  return (
    <aside className={`vsc-sidebar${isChat ? " vsc-sidebar--chat" : ""}`} aria-hidden={sidebarTab === null}>
      {isChat && (
        <ChatPanel socketRef={socketRef} workspaceTab={workspaceTab} />
      )}

      {isToolbox && workspaceTab === "canvas" && (
        <>
          <div className="vsc-sidebar-head">Canvas</div>

          {/* Run / Stop */}
          <div className="vsc-sidebar-section">
            {chainRunning ? (
              <button type="button" className="vsc-chain-btn vsc-chain-btn--stop" onClick={onStopChain}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                  <rect width="10" height="10" rx="2" />
                </svg>
                Stop Chain
              </button>
            ) : (
              <button
                type="button"
                className="vsc-chain-btn"
                onClick={onRunChain}
                disabled={!hasInitialiser}
                title={!hasInitialiser ? "Add an Initialiser node first" : undefined}
              >
                <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor" aria-hidden="true">
                  <path d="M0 1.5 9 5.5 0 9.5z" />
                </svg>
                Run Chain
              </button>
            )}
          </div>

          {/* Infrastructure */}
          <div className="vsc-sidebar-section">
            <div className="vsc-section-hdr">Infrastructure</div>
            <div className="vsc-list">
              {(["initialiser", "materialize", "context"] as NodeV2Type[]).map((type) => (
                <NodeButton
                  key={type}
                  type={type}
                  isPlacing={mode === "place" && placingType === type}
                  onPlace={handlePlace}
                />
              ))}
            </div>
          </div>

          {/* SDLC */}
          <div className="vsc-sidebar-section">
            <div className="vsc-section-hdr">SDLC</div>
            <div className="vsc-list">
              {SDLC_NODE_TYPES.map((type) => (
                <NodeButton
                  key={type}
                  type={type}
                  isPlacing={mode === "place" && placingType === type}
                  onPlace={handlePlace}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="vsc-sidebar-section">
            <div className="vsc-section-hdr">Actions</div>
            <button
              type="button"
              className={`vsc-list-item${mode === "select" ? " vsc-list-item--active" : ""}`}
              onClick={() => onSetMode("select")}
            >
              <svg className="vsc-list-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.5 1 7 13.5l2.1-5.2L14.5 6z" />
              </svg>
              <span className="vsc-list-label">Pointer</span>
            </button>
          </div>

          {/* Properties */}
          <div className="vsc-sidebar-section vsc-sidebar-section--grow">
            <div className="vsc-section-hdr">Properties</div>
            {selectedNode ? (
              <NodeProperties
                node={selectedNode}
                titleDraft={selectedTitleDraft}
                onTitleChange={onTitleChange}
                onConfigChange={onConfigChange}
                onDelete={onDeleteNode}
              />
            ) : (
              <p className="vsc-props-empty">Select a node to edit its properties.</p>
            )}
          </div>
        </>
      )}

      {isToolbox && workspaceTab === "plan" && (
        <SidebarPlaceholder
          title="Plan"
          body="The Plan tab is a freeform Excalidraw workspace."
        />
      )}
    </aside>
  );
}
