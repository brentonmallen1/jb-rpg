import dagre from '@dagrejs/dagre'
import type { Choice, Route, Scene, Story, StoryProblem } from '../types'
import { END } from '../types'
import { isDoor, patchScene } from './storyEdit'

/**
 * The story as a graph for the Flow view: pure, so the canvas only draws it and every edit goes
 * back through the same story helpers as the text Editor (undo, autosave and problems for free).
 *
 * Nodes: the prologue, scenes, a diamond per route, The end, and the doors (door stories).
 * Handles: "in" on everything that can be led to; on a scene, "c{i}" per choice and "then";
 * on a route, "yes" and "no".
 */

export const END_NODE = 'end'
export const DOORS_NODE = 'doors'
export const OPENING_NODE = 'opening'
export const routeNodeId = (sceneId: string, index: number) => `route:${sceneId}:${index}`

export type GraphNodeKind = 'opening' | 'scene' | 'route' | 'end' | 'doors'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  position: { x: number; y: number }
  width: number
  height: number
  sceneId?: string
  routeIndex?: number
}

/** What an edge stands for in the story, so drawing or deleting one can change it */
export type EdgeRole =
  | { kind: 'choice'; sceneId: string; index: number }
  | { kind: 'then'; sceneId: string }  // scene.next, or the last route's "no"
  | { kind: 'route'; sceneId: string; index: number }  // a route's "yes"
  | { kind: 'chain'; sceneId: string; index: number }  // fixed: then -> first route, route "no" -> next route
  | { kind: 'opening'; index: number }
  | { kind: 'door'; sceneId: string }  // fixed: the doors -> a door

export interface GraphEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  role: EdgeRole
  /** Where the story goes by default (down the list), not a link the author drew */
  implicit?: boolean
  outcome?: Choice['kind']
}

export const SCENE_WIDTH = 260
const ROUTE_SIZE = { width: 168, height: 104 }
const SMALL_SIZE = { width: 168, height: 72 }

export function sceneHeight(scene: Scene): number {
  return 56 + scene.choices.length * 30 + (scene.is_finale ? 30 : 38) + (scene.requires?.length ? 26 : 0)
}

/** Where a link leads, as a node id (a scene, The end, or the doors) */
function nodeFor(story: Story, target: string | null | undefined): string | null {
  if (!target) return null
  if (target === END) return END_NODE
  return story.scenes.some(s => s.id === target) ? target : null
}

/** Where a scene goes when nothing says otherwise: the next in the list, The end, or the doors */
function defaultNode(story: Story, scene: Scene): string {
  if (story.settings.non_linear) return DOORS_NODE
  const i = story.scenes.findIndex(s => s.id === scene.id)
  return story.scenes[i + 1]?.id ?? END_NODE
}

export function storyGraph(story: Story): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const doorsStory = story.settings.non_linear

  if (story.opening_scene) {
    nodes.push({ id: OPENING_NODE, kind: 'opening', position: { x: 0, y: 0 }, width: SCENE_WIDTH, height: 56 + Math.max(story.opening_scene.choices.length, 1) * 30 + 8 })
    story.opening_scene.choices.forEach((c, i) => {
      const target = nodeFor(story, c.target_scene_id) ?? (doorsStory ? DOORS_NODE : story.scenes[0]?.id)
      if (target) edges.push({ id: `opening:${i}`, source: OPENING_NODE, sourceHandle: `c${i}`, target, role: { kind: 'opening', index: i }, implicit: !c.target_scene_id })
    })
    // No choices: the story simply begins (at the doors, or the first scene)
    const begin = doorsStory ? DOORS_NODE : story.scenes[0]?.id
    if (!story.opening_scene.choices.length && begin) {
      edges.push({ id: 'opening:start', source: OPENING_NODE, sourceHandle: 'start', target: begin, role: { kind: 'door', sceneId: begin }, implicit: true })
    }
  }
  if (doorsStory) {
    nodes.push({ id: DOORS_NODE, kind: 'doors', position: { x: 0, y: 0 }, ...SMALL_SIZE })
    for (const scene of story.scenes.filter(s => isDoor(story, s))) {
      edges.push({ id: `door:${scene.id}`, source: DOORS_NODE, sourceHandle: 'out', target: scene.id, role: { kind: 'door', sceneId: scene.id }, implicit: true })
    }
  }

  for (const scene of story.scenes) {
    nodes.push({ id: scene.id, kind: 'scene', sceneId: scene.id, position: { x: 0, y: 0 }, width: SCENE_WIDTH, height: sceneHeight(scene) })
    if (scene.is_finale) continue

    scene.choices.forEach((c, i) => {
      const target = nodeFor(story, c.next_scene_id)
      if (target) edges.push({ id: `choice:${scene.id}:${i}`, source: scene.id, sourceHandle: `c${i}`, target, role: { kind: 'choice', sceneId: scene.id, index: i }, outcome: c.kind })
    })
    // Rooms in door stories go back to the doors without a line (the card says so)
    const otherwise = nodeFor(story, scene.next) ?? defaultNode(story, scene)
    const routes = scene.routes ?? []
    routes.forEach((route, i) => {
      const id = routeNodeId(scene.id, i)
      nodes.push({ id, kind: 'route', sceneId: scene.id, routeIndex: i, position: { x: 0, y: 0 }, ...ROUTE_SIZE })
      const from = i === 0 ? { source: scene.id, sourceHandle: 'then' } : { source: routeNodeId(scene.id, i - 1), sourceHandle: 'no' }
      edges.push({ id: `chain:${scene.id}:${i}`, ...from, target: id, role: { kind: 'chain', sceneId: scene.id, index: i } })
      const yes = nodeFor(story, route.target)
      if (yes) edges.push({ id: `route:${scene.id}:${i}`, source: id, sourceHandle: 'yes', target: yes, role: { kind: 'route', sceneId: scene.id, index: i } })
    })
    const last = routes.length ? { source: routeNodeId(scene.id, routes.length - 1), sourceHandle: 'no' } : { source: scene.id, sourceHandle: 'then' }
    if (otherwise !== DOORS_NODE) {
      edges.push({ id: `then:${scene.id}`, ...last, target: otherwise, role: { kind: 'then', sceneId: scene.id }, implicit: !scene.next })
    }
  }
  nodes.push({ id: END_NODE, kind: 'end', position: { x: 0, y: 0 }, ...SMALL_SIZE })

  place(story, nodes, edges)
  return { nodes, edges }
}

/** Saved positions where the author put things; the rest laid out left to right by dagre. */
function place(story: Story, nodes: GraphNode[], edges: GraphEdge[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 70, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach(n => g.setNode(n.id, { width: n.width, height: n.height }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  for (const n of nodes) {
    const saved = story.layout?.[n.id]
    const laid = g.node(n.id)
    n.position = saved ? { x: saved.x, y: saved.y } : { x: laid.x - n.width / 2, y: laid.y - n.height / 2 }
  }
  // Nothing leads to The end yet: keep it at the far right, where paths finish, not with the start
  const end = nodes.find(n => n.id === END_NODE)
  if (end && !story.layout?.[END_NODE] && !edges.some(e => e.target === END_NODE)) {
    const others = nodes.filter(n => n !== end)
    end.position = {
      x: Math.max(0, ...others.map(n => n.position.x + n.width)) + 70,
      y: others.length ? Math.min(...others.map(n => n.position.y)) : 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Edits from the canvas
// ---------------------------------------------------------------------------

/** The story value a connection into this node stands for: a scene id, END, or null (the default) */
function targetValue(story: Story, targetNode: string): string | null | undefined {
  if (targetNode === END_NODE) return END
  if (targetNode === DOORS_NODE) return story.settings.non_linear ? null : undefined
  return story.scenes.some(s => s.id === targetNode) ? targetNode : undefined
}

/** Can a line be drawn from this handle to that node? */
export function canConnect(story: Story, source: string, sourceHandle: string | null, target: string): boolean {
  return connect(story, source, sourceHandle, target) !== null
}

/** The story after drawing a line from a handle to a node, or null if that line means nothing. */
export function connect(story: Story, source: string, sourceHandle: string | null, target: string): Story | null {
  const value = targetValue(story, target)
  if (value === undefined || source === target) return null

  if (source === OPENING_NODE && story.opening_scene && sourceHandle?.startsWith('c')) {
    if (value === END) return null
    const i = Number(sourceHandle.slice(1))
    return { ...story, opening_scene: { ...story.opening_scene, choices: story.opening_scene.choices.map((c, j) => (j === i ? { ...c, target_scene_id: value ?? undefined } : c)) } }
  }

  const route = parseRouteNode(source)
  if (route) {
    const scene = story.scenes.find(s => s.id === route.sceneId)
    if (!scene || target === route.sceneId) return null
    const routes = scene.routes ?? []
    if (sourceHandle === 'yes') {
      if (value === null) return null
      return patchScene(story, scene.id, { routes: routes.map((r, j) => (j === route.index ? { ...r, target: value } : r)) })
    }
    // Only the last route's "no" is free: it's where the scene goes otherwise
    if (sourceHandle === 'no' && route.index === routes.length - 1) return patchScene(story, scene.id, { next: value })
    return null
  }

  const scene = story.scenes.find(s => s.id === source)
  if (!scene || scene.is_finale) return null
  if (sourceHandle === 'then') {
    if (scene.routes?.length) return null  // "then" runs through the routes
    return patchScene(story, scene.id, { next: value })
  }
  if (sourceHandle?.startsWith('c')) {
    const i = Number(sourceHandle.slice(1))
    return patchScene(story, scene.id, sc => ({ ...sc, choices: sc.choices.map((c, j) => (j === i ? { ...c, next_scene_id: value } : c)) }))
  }
  return null
}

/** The story after deleting a line: it goes back to where the story would go by default. */
export function disconnect(story: Story, role: EdgeRole): Story {
  switch (role.kind) {
    case 'choice':
      return patchScene(story, role.sceneId, sc => ({ ...sc, choices: sc.choices.map((c, j) => (j === role.index ? { ...c, next_scene_id: null } : c)) }))
    case 'then':
      return patchScene(story, role.sceneId, { next: null })
    case 'route':
      return patchScene(story, role.sceneId, sc => ({ ...sc, routes: (sc.routes ?? []).map((r, j) => (j === role.index ? { ...r, target: '' } : r)) }))
    case 'opening':
      if (!story.opening_scene) return story
      return { ...story, opening_scene: { ...story.opening_scene, choices: story.opening_scene.choices.map((c, j) => (j === role.index ? { ...c, target_scene_id: undefined } : c)) } }
    default:
      return story  // the route chain and the doors are drawn from the story, not chosen
  }
}

export function removeRoute(story: Story, sceneId: string, index: number): Story {
  return patchScene(story, sceneId, sc => ({ ...sc, routes: (sc.routes ?? []).filter((_, j) => j !== index) }))
}

export function addRoute(story: Story, sceneId: string, route: Route = { condition: { type: 'item_held' }, target: '' }): Story {
  return patchScene(story, sceneId, sc => ({ ...sc, routes: [...(sc.routes ?? []), route] }))
}

export function parseRouteNode(id: string): { sceneId: string; index: number } | null {
  const m = id.match(/^route:(.+):(\d+)$/)
  return m ? { sceneId: m[1], index: Number(m[2]) } : null
}

/** Remember where the author put a node */
export function moveNode(story: Story, id: string, position: { x: number; y: number }): Story {
  return { ...story, layout: { ...(story.layout ?? {}), [id]: { x: Math.round(position.x), y: Math.round(position.y) } } }
}

/** Problems for a node, worst first */
export function nodeProblems(problems: StoryProblem[], node: GraphNode): StoryProblem[] {
  if (node.kind === 'opening') return problems.filter(p => p.area === 'opening')
  if (node.kind === 'route') return problems.filter(p => p.scene_id === node.sceneId && p.field === 'routes' && p.index === node.routeIndex)
  if (node.kind !== 'scene') return []
  return problems
    .filter(p => p.scene_id === node.sceneId && p.field !== 'routes')
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}
