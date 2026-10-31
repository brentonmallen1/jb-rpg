import { createContext, useContext, useMemo, useState, type DragEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import type { Story, StoryProblem } from '../../types'
import {
  DOORS_NODE,
  END_NODE,
  ITEM_DRAG,
  OPENING_NODE,
  canConnect,
  choiceHandle,
  connect,
  disconnect,
  nodeProblems,
  otherwiseNode,
  routeNodeId,
  storyGraph,
  type EdgeRole,
  type GraphEdge,
  type GraphNode,
} from '../../lib/storyGraph'
import {
  KIND_LABEL,
  addRoute,
  addScene,
  checkItem,
  createScene,
  defaultNext,
  describeCondition,
  findItem,
  giveItem,
  isDoor,
  itemUses,
  moveNode,
  removeRoute,
  sceneStatus,
  sceneTitle,
} from '../../lib/storyEdit'
import { OUTCOME_ICON } from '../../lib/outcomes'
import { ItemIcon } from '../../components/ItemIcon'
import { D20Icon, DoorIcon, LockIcon } from '../../components/Icons'
import type { EditorSelection } from './EditorNav'
import '../../styles/pages/flow.css'

interface FlowViewProps {
  story: Story
  problems: StoryProblem[]
  selection: EditorSelection
  update: (change: (story: Story) => Story) => void
  onSelect: (selection: EditorSelection) => void
}

type Highlight = 'given' | 'checked' | 'dim' | null

interface NodeData extends Record<string, unknown> {
  node: GraphNode
  story: Story
  problems: StoryProblem[]
  highlight: Highlight
  /** An item from the Items panel let go on a choice or a route */
  onDropItem: (itemId: string, at: { choice: number } | { route: number }) => void
}

type FlowNode = Node<NodeData>
type FlowEdge = Edge<{ role: EdgeRole; badge?: GraphEdge['badge'] }>

/** The story as a flow diagram. Every change goes through update(), like the text Editor's. */
export function FlowView(props: FlowViewProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}

function Canvas({ story, problems, selection, update, onSelect }: FlowViewProps) {
  const flow = useReactFlow()
  const graph = useMemo(() => storyGraph(story), [story])

  // Selecting an item lights up where it's given (solid) and checked (dashed); the rest steps back
  const highlights = useMemo(() => {
    if (selection.kind !== 'items' || !selection.id) return null
    const uses = itemUses(story, selection.id)
    const map = new Map<string, Highlight>()
    uses.checked.forEach(u => u.scene && map.set(u.what === 'route' ? routeNodeId(u.scene.id, u.index) : u.scene.id, 'checked'))
    uses.given.forEach(u => u.scene && map.set(u.scene.id, 'given'))
    return map
  }, [story, selection])

  const selectedId = selection.kind === 'scene' ? selection.id : selection.kind === 'opening' ? OPENING_NODE : null
  const nextNodes: FlowNode[] = graph.nodes.map(node => ({
    id: node.id,
    type: node.kind,
    position: node.position,
    selected: node.id === selectedId,
    deletable: node.kind === 'route',
    connectable: true,
    data: {
      node,
      story,
      problems: nodeProblems(problems, node),
      highlight: highlights ? highlights.get(node.id) ?? 'dim' : null,
      onDropItem: (itemId, at) => {
        if (!node.sceneId) return
        const sceneId = node.sceneId
        update(s => ('choice' in at ? giveItem(s, sceneId, at.choice, itemId) : checkItem(s, sceneId, at.route, itemId)))
      },
    },
  }))
  const nextEdges: FlowEdge[] = graph.edges.map(e => {
    const toDoor = e.source === DOORS_NODE
    const back = e.role.kind === 'back'
    return {
      id: e.id,
      type: toDoor ? 'door' : back ? 'back' : 'default',
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.role.kind === 'depends' ? 'depends-in' : back ? 'back' : 'in',
      deletable: ['choice', 'then', 'route', 'opening'].includes(e.role.kind) && !e.implicit,
      focusable: e.role.kind !== 'depends' && !back,
      label: e.role.kind === 'depends' ? 'depends on' : undefined,
      className: [
        'fl-edge',
        e.role.kind === 'depends' ? 'fl-edge--depends' : '',
        toDoor ? 'fl-edge--door' : '',
        back ? 'fl-edge--back' : '',
        e.target === END_NODE ? 'fl-edge--end' : '',
        e.outcome ? `fl-edge--${e.outcome}` : '',
        e.implicit && !toDoor ? 'fl-edge--default' : '',
        e.role.kind === 'route' ? 'fl-edge--yes' : '',
        highlights ? 'fl-edge--dim' : '',
      ].join(' '),
      data: { role: e.role, badge: e.badge },
    }
  })

  // React Flow measures nodes and tracks dragging in its own state; keep that, and take
  // everything else from the story whenever it changes. A node stays where it was drawn
  // (unless the author placed it): an edit never reshuffles the canvas, only Tidy up does.
  const [nodes, setNodes] = useState(nextNodes)
  const [edges, setEdges] = useState(nextEdges)
  const [relayout, setRelayout] = useState(false)
  const [drawnFrom, setDrawnFrom] = useState({ graph, highlights, selectedId, problems })
  if (drawnFrom.graph !== graph || drawnFrom.highlights !== highlights || drawnFrom.selectedId !== selectedId || drawnFrom.problems !== problems) {
    setDrawnFrom({ graph, highlights, selectedId, problems })
    if (relayout) setRelayout(false)
    const previous = new Map(nodes.map(n => [n.id, n]))
    setNodes(nextNodes.map(n => {
      const old = previous.get(n.id)
      const placed = story.layout?.[n.id]
      if (old) {
        const position = old.dragging ? old.position : placed || relayout ? n.position : old.position
        return { ...n, measured: old.measured, position }
      }
      // A new route sits just after its scene, below any routes before it
      const g = n.data.node
      const scene = g.kind === 'route' && g.sceneId ? previous.get(g.sceneId) : undefined
      if (scene && !placed) return { ...n, position: { x: scene.position.x + 300, y: scene.position.y + (g.routeIndex ?? 0) * 130 } }
      return n
    }))
    const selectedEdges = new Set(edges.filter(e => e.selected).map(e => e.id))
    setEdges(nextEdges.map(e => ({ ...e, selected: selectedEdges.has(e.id) })))
  }

  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    // Selection is the editor's (it opens the panel), not the canvas's
    setNodes(ns => applyNodeChanges(changes.filter(c => c.type !== 'select'), ns))
  }

  function onEdgesChange(changes: EdgeChange<FlowEdge>[]) {
    setEdges(es => applyEdgeChanges(changes.filter(c => c.type !== 'remove'), es))
  }

  function select(node: FlowNode) {
    const g = node.data.node
    if (g.kind === 'opening') onSelect({ kind: 'opening' })
    else if ((g.kind === 'scene' || g.kind === 'route') && g.sceneId) onSelect({ kind: 'scene', id: g.sceneId })
  }

  // A line let go on empty canvas makes a new scene there, already linked
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (state.isValid || !state.fromNode || !state.fromHandle || state.fromHandle.type !== 'source' || state.toNode) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    const position = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY })
    const scene = createScene(story, 'New scene')
    const from = state.fromNode.id
    const handle = state.fromHandle.id ?? null
    if (!canConnect(addScene(story, scene), from, handle, scene.id)) return
    update(s => {
      const added = moveNode(addScene(s, scene), scene.id, { x: position.x, y: position.y - 30 })
      return connect(added, from, handle, scene.id) ?? added
    })
    onSelect({ kind: 'scene', id: scene.id })
  }

  function addSceneHere() {
    const scene = createScene(story)
    const { x, y, zoom } = flow.getViewport()
    const box = document.querySelector('.fl-canvas')?.getBoundingClientRect()
    const at = box ? { x: (box.width / 2 - x) / zoom - 130, y: (box.height / 2 - y) / zoom - 60 } : { x: 0, y: 0 }
    update(s => moveNode(addScene(s, scene), scene.id, at))
    onSelect({ kind: 'scene', id: scene.id })
  }

  const selectedScene = selection.kind === 'scene' ? story.scenes.find(s => s.id === selection.id) : undefined
  const loop = useMemo(() => loopLane(nodes, edges), [nodes, edges])

  return (
    <div className="fl-canvas">
      <svg className="fl-defs" aria-hidden="true">
        <defs>
          <marker id="fl-door-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fl-door-arrow" />
          </marker>
        </defs>
      </svg>
      <LoopContext.Provider value={loop}>
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => select(node)}
          onNodeDragStop={(_, _node, moved) => update(s => moved.reduce((acc, n) => moveNode(acc, n.id, n.position), s))}
          isValidConnection={c => canConnect(story, c.source, c.sourceHandle ?? null, c.target)}
          onConnect={c => update(s => connect(s, c.source, c.sourceHandle ?? null, c.target) ?? s)}
          onConnectEnd={onConnectEnd}
          onBeforeDelete={async ({ nodes: ns, edges: es }) => ({
            nodes: ns.filter(n => n.data.node.kind === 'route'),
            edges: es.filter(e => e.deletable !== false),
          })}
          onDelete={({ nodes: ns, edges: es }) => update(s => {
            const gone = new Set(ns.map(n => n.id))
            // Lines first (but not those of a route being removed: its "no" is the scene's "otherwise"),
            // then routes, last first so the indices hold
            let next = es.filter(e => !gone.has(e.source) && !gone.has(e.target)).reduce((acc, e) => (e.data ? disconnect(acc, e.data.role) : acc), s)
            const routes = ns.map(n => n.data.node).filter(n => n.kind === 'route').sort((a, b) => (b.routeIndex ?? 0) - (a.routeIndex ?? 0))
            for (const r of routes) next = removeRoute(next, r.sceneId!, r.routeIndex!)
            return next
          })}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.6}
          defaultEdgeOptions={{ type: 'default' }}
          nodesFocusable
          edgesFocusable
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} className="fl-bg" />
          <MiniMap className="fl-minimap" pannable zoomable nodeStrokeWidth={0} nodeBorderRadius={6} />
          <Panel position="bottom-left" className="fl-toolbar">
            <div className="fl-toolbar__group" role="group" aria-label="Zoom">
              <button type="button" onClick={() => flow.zoomOut()} aria-label="Zoom out">−</button>
              <button type="button" onClick={() => flow.zoomIn()} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 })}>Fit</button>
            </div>
            <div className="fl-toolbar__group" role="group" aria-label="Add">
              <button type="button" onClick={addSceneHere}>+ Scene</button>
              <button
                type="button"
                disabled={!selectedScene || selectedScene.is_finale}
                title={selectedScene ? `Add a route after ${selectedScene.title}` : 'Select a scene first'}
                onClick={() => selectedScene && update(s => addRoute(s, selectedScene.id))}
              >
                + Route
              </button>
            </div>
            <button
              type="button"
              className="fl-toolbar__single"
              title="Lay every node out again, left to right"
              onClick={() => {
                setRelayout(true)
                update(s => ({ ...s, layout: {} }))
                setTimeout(() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 }), 50)
              }}
            >
              Tidy up
            </button>
          </Panel>
        </ReactFlow>
      </LoopContext.Provider>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function problemClass(problems: StoryProblem[]): string {
  if (problems.some(p => p.severity === 'error')) return 'has-error'
  return problems.length ? 'has-warning' : ''
}

function highlightClass(h: Highlight): string {
  return h ? `is-${h}` : ''
}

/** Drop handlers for an item dragged from the Items panel; `onOver` says whether it's above this target. */
function itemDrop(onOver: (over: boolean) => void, onDrop: (itemId: string) => void) {
  const carriesItem = (e: DragEvent) => e.dataTransfer.types.includes(ITEM_DRAG)
  return {
    onDragOver: (e: DragEvent) => {
      if (!carriesItem(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      onOver(true)
    },
    onDragLeave: () => onOver(false),
    onDrop: (e: DragEvent) => {
      onOver(false)
      const itemId = e.dataTransfer.getData(ITEM_DRAG)
      if (!itemId) return
      e.preventDefault()
      onDrop(itemId)
    },
  }
}

function ProblemBadge({ problems }: { problems: StoryProblem[] }) {
  if (!problems.length) return null
  const first = problems[0]
  return (
    <span className={`fl-badge fl-badge--${first.severity}`} title={problems.map(p => p.message).join('\n')}>
      {first.code === 'unreachable' ? 'Nothing leads here' : problems.length === 1 ? '1 to fix' : `${problems.length} to fix`}
    </span>
  )
}

/** Where "depends on" lines start and end: hidden, and never drawn by hand */
function DependsHandles() {
  return (
    <>
      <Handle type="source" position={Position.Bottom} id="depends" className="fl-handle fl-handle--depends" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="depends-in" className="fl-handle fl-handle--depends" isConnectable={false} />
    </>
  )
}

function SceneNode({ data, selected }: NodeProps<FlowNode>) {
  const { story, node, problems, highlight, onDropItem } = data
  const [dropOn, setDropOn] = useState<number | null>(null)
  const scene = story.scenes.find(s => s.id === node.sceneId)
  if (!scene) return null
  const status = sceneStatus(scene, problems)
  const otherwise = sceneTitle(story, scene.next ?? defaultNext(story, scene))
  const toDoors = !scene.routes?.length && otherwiseNode(story, scene) === DOORS_NODE
  const thenLabel = scene.routes?.length
    ? `${scene.routes.length === 1 ? 'A route' : `${scene.routes.length} routes`}, then ${otherwise}`
    : otherwise

  return (
    <div
      className={`fl-node fl-scene ${scene.is_finale ? 'fl-scene--finale' : ''} ${selected ? 'is-selected' : ''} ${problemClass(problems)} ${highlightClass(highlight)}`}
      style={{ width: node.width }}
    >
      <Handle type="target" position={Position.Left} id="in" className="fl-handle fl-handle--in" />
      <DependsHandles />
      <ProblemBadge problems={problems} />
      <div className="fl-scene__head">
        {!story.opening_scene && story.scenes[0]?.id === scene.id && <span className="fl-kicker">Starts here</span>}
        {scene.is_finale && <span className="fl-kicker">Finale</span>}
        <span className="fl-scene__title">{scene.title || 'Untitled scene'}</span>
        {!scene.is_finale && <span className={`ed-dot ed-dot--${status.tone}`} title={status.label} aria-label={status.label} />}
      </div>
      {!!scene.requires?.length && (
        <span className="fl-lock"><LockIcon size={12} /> Locked until {scene.requires.map(c => describeCondition(story, c)).join(' and ')}</span>
      )}
      {scene.is_finale ? (
        <span className="fl-scene__d20"><D20Icon size={14} label="" /> The d20 decides</span>
      ) : (
        <>
          <ul className="fl-choices">
            {scene.choices.map((c, i) => {
              const Icon = OUTCOME_ICON[c.kind]
              const item = c.kind === 'item' ? findItem(story, c.item_id) : undefined
              return (
                <li
                  key={i}
                  className={`fl-choice outcome--${c.kind} ${dropOn === i ? 'is-drop' : ''}`}
                  title={`${KIND_LABEL[c.kind]}: ${c.display_text || 'not written yet'}`}
                  {...itemDrop(over => setDropOn(over ? i : null), itemId => onDropItem(itemId, { choice: i }))}
                >
                  {item ? <ItemIcon name={item.name} icon={item.icon} theme={story.theme} size={13} /> : <Icon size={13} />}
                  <span className={`fl-choice__text ${item ? 'fl-choice__text--item' : ''}`}>{item ? item.name : c.display_text || KIND_LABEL[c.kind]}</span>
                  <Handle type="source" position={Position.Right} id={choiceHandle(i)} className={`fl-handle fl-handle--choice ${c.next_scene_id ? 'has-path' : ''}`} />
                </li>
              )
            })}
          </ul>
          <div className="fl-then">
            <span className="fl-kicker">Then</span>
            <span className={`fl-then__target ${toDoors ? 'fl-then__target--doors' : ''}`}>{toDoors && <DoorIcon size={13} />}{thenLabel}</span>
            <Handle type="source" position={Position.Right} id="then" className={`fl-handle fl-handle--then ${toDoors ? 'fl-handle--to-doors' : ''}`} />
          </div>
        </>
      )}
    </div>
  )
}

function RouteNode({ data }: NodeProps<FlowNode>) {
  const { story, node, problems, highlight, onDropItem } = data
  const [dropOn, setDropOn] = useState(false)
  const scene = story.scenes.find(s => s.id === node.sceneId)
  const route = scene?.routes?.[node.routeIndex ?? 0]
  if (!scene || !route) return null
  const toDoors = node.routeIndex === scene.routes!.length - 1 && otherwiseNode(story, scene) === DOORS_NODE
  return (
    <div
      className={`fl-node fl-route ${problemClass(problems)} ${highlightClass(highlight)} ${dropOn ? 'is-drop' : ''}`}
      style={{ width: node.width, height: node.height }}
      {...itemDrop(setDropOn, itemId => onDropItem(itemId, { route: node.routeIndex ?? 0 }))}
    >
      <Handle type="target" position={Position.Left} id="in" className="fl-handle fl-handle--in" />
      <Handle type="target" position={Position.Top} id="depends-in" className="fl-handle fl-handle--depends" isConnectable={false} />
      <div className="fl-route__shape" aria-hidden="true" />
      <span className="fl-route__text">
        <span className="fl-kicker">Route</span>
        If {describeCondition(story, route.condition)}?
      </span>
      <Handle type="source" position={Position.Right} id="yes" className="fl-handle fl-handle--yes" />
      <span className="fl-route__label fl-route__label--yes">yes</span>
      <Handle type="source" position={Position.Bottom} id="no" className={`fl-handle fl-handle--no ${toDoors ? 'fl-handle--to-doors' : ''}`} />
      <span className="fl-route__label fl-route__label--no">no</span>
      <ProblemBadge problems={problems} />
    </div>
  )
}

function EndNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="fl-node fl-end" style={{ width: data.node.width, height: data.node.height }}>
      <Handle type="target" position={Position.Left} id="in" className="fl-handle fl-handle--in" />
      <span className="fl-kicker">The end</span>
      <span className="fl-end__text"><D20Icon size={14} label="" /> On to the d20</span>
    </div>
  )
}

const DOORS_HINT = 'Between rooms, the table picks which door to open next. Every scene nothing leads to is a door, '
  + 'and each room comes back here when it ends. A locked door opens once its conditions hold; the finale stays sealed '
  + 'until it is the last door left. When no door is left, on to the d20.'

/** The doors: where the table picks the next door, and where every room comes back to */
function DoorsNode({ data }: NodeProps<FlowNode>) {
  const { story, node } = data
  const doors = story.scenes.filter(s => isDoor(story, s))
  const locked = doors.filter(s => s.requires?.length).length
  return (
    <div className="fl-node fl-doors" style={{ width: node.width, height: node.height }} title={DOORS_HINT}>
      <Handle type="target" position={Position.Left} id="in" className={`fl-handle fl-handle--in ${node.entered ? '' : 'is-idle'}`} />
      <Handle type="target" position={Position.Top} id="back" className="fl-handle fl-handle--back" isConnectable={false} />
      <DoorIcon size={22} className="fl-doors__glyph" />
      <span className="fl-doors__title">The doors</span>
      <span className="fl-doors__text">Pick the next door</span>
      <span className="fl-doors__count">
        {doors.length === 1 ? '1 door' : `${doors.length} doors`}{locked ? ` · ${locked} locked` : ''}
      </span>
      <Handle type="source" position={Position.Right} id="out" className="fl-handle fl-handle--door" isConnectable={false} />
    </div>
  )
}

function OpeningNode({ data, selected }: NodeProps<FlowNode>) {
  const opening = data.story.opening_scene
  if (!opening) return null
  return (
    <div className={`fl-node fl-scene fl-opening ${selected ? 'is-selected' : ''} ${problemClass(data.problems)}`} style={{ width: data.node.width }}>
      <ProblemBadge problems={data.problems} />
      <div className="fl-scene__head">
        <span className="fl-kicker">Starts here</span>
        <span className="fl-scene__title">{opening.title || 'Prologue'}</span>
      </div>
      <ul className="fl-choices">
        {opening.choices.map((c, i) => (
          <li key={i} className="fl-choice">
            <span className="fl-choice__text">{c.text || `Choice ${i + 1}`}</span>
            <Handle type="source" position={Position.Right} id={choiceHandle(i)} className={`fl-handle fl-handle--choice ${c.target_scene_id ? 'has-path' : ''}`} />
          </li>
        ))}
        {opening.choices.length === 0 && (
          <li className="fl-choice fl-choice--empty">
            No choices: the story begins
            <Handle type="source" position={Position.Right} id="start" className="fl-handle fl-handle--then" isConnectable={false} />
          </li>
        )}
      </ul>
    </div>
  )
}

const NODE_TYPES = { scene: SceneNode, route: RouteNode, end: EndNode, doors: DoorsNode, opening: OpeningNode }

// ---------------------------------------------------------------------------
// Edges: the doors and the way back to them
// ---------------------------------------------------------------------------

interface Loop {
  railX: number
  laneY: number
  /** The one line that carries the label, so it shows once */
  labelOn: string
}

/** Where the lines back to the doors run: down a rail right of every room that comes back,
 * then along a lane above everything, into the top of the doors. */
function loopLane(nodes: FlowNode[], edges: FlowEdge[]): Loop | null {
  const back = edges.filter(e => e.data?.role.kind === 'back')
  if (!back.length || !nodes.length) return null
  const sources = new Set(back.map(e => e.source))
  const right = Math.max(...nodes.filter(n => sources.has(n.id)).map(n => n.position.x + (n.measured?.width ?? n.data.node.width)))
  const top = Math.min(...nodes.map(n => n.position.y))
  return { railX: right + 40, laneY: top - 44, labelOn: back[0].id }
}

const LoopContext = createContext<Loop | null>(null)

/** The doors -> a door: solid, with an arrow, and a badge for a locked door or the one opened last */
function DoorEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data }: EdgeProps<FlowEdge>) {
  // Stop short of the door's port, so the arrow shows
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX: targetX - 7, targetY, targetPosition })
  const badge = data?.badge
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd="url(#fl-door-arrow)" />
      {badge && (
        <EdgeLabelRenderer>
          <span
            className={`fl-door-badge fl-door-badge--${badge}`}
            style={{ transform: `translate(-50%, -50%) translate(${targetX - 44}px, ${targetY}px)` }}
            title={badge === 'locked' ? 'Locked until its conditions hold' : 'Sealed until it is the last door left'}
          >
            {badge === 'locked' ? <LockIcon size={11} label="Locked" /> : 'Last'}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** A room -> the doors. Drawn from the doors outward, so the part every line shares is the same path
 * and the dashes line up into one line. */
function BackEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps<FlowEdge>) {
  const loop = useContext(LoopContext)
  if (!loop) return null
  const { railX: x, laneY: y } = loop
  const r = 12
  const path = `M${targetX},${targetY - 7} V${y + r} Q${targetX},${y} ${targetX + r},${y} H${x - r} Q${x},${y} ${x},${y + r}`
    + ` V${sourceY - r} Q${x},${sourceY} ${x - r},${sourceY} H${sourceX}`
  return (
    <>
      <BaseEdge id={id} path={path} markerStart="url(#fl-door-arrow)" interactionWidth={0} />
      {loop.labelOn === id && (
        <EdgeLabelRenderer>
          <span className="fl-loop-label" style={{ transform: `translate(-50%, -50%) translate(${(targetX + x) / 2}px, ${y}px)` }}>
            Back to the doors after every room
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = { door: DoorEdge, back: BackEdge }

