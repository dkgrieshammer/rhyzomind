import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { CHAR_W, LINE_H, radiusFor, wrapLabel } from './scene';
import type { MapEdge, MapNode, MapSettings } from './types';

// d3-force only does the maths: it mutates x/y on the node objects each tick,
// and the Svelte canvas redraws from them. Nothing here touches the DOM.

type SimNode = MapNode & SimulationNodeDatum & {
  r?: number;
  /** Collision box relative to the node centre: bubble on the left, label to the right. */
  left?: number;
  right?: number;
  half?: number;
};
type SimLink = SimulationLinkDatum<SimNode>;

/**
 * Like d3's forceCollide, but with boxes that include the label, so text
 * does not land on top of other nodes. O(n²), fine for a few hundred nodes.
 */
function forceBoxCollide(pad = 5, strength = 0.2) {
  let nodes: SimNode[] = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const ax = a.x! + a.vx!, ay = a.y! + a.vy!;
        const bx = b.x! + b.vx!, by = b.y! + b.vy!;
        const ox = Math.min(ax + a.right!, bx + b.right!) - Math.max(ax - a.left!, bx - b.left!) + pad;
        if (ox <= 0) continue;
        const oy = Math.min(ay + a.half!, by + b.half!) - Math.max(ay - a.half!, by - b.half!) + pad;
        if (oy <= 0) continue;
        // Separate along the axis that needs the smaller move.
        const wa = a.fx != null ? 1 : b.fx != null ? 0 : 0.5; // share of the push applied to b
        const wb = 1 - wa;
        if (ox < oy) {
          const dir = ax + (a.right! - a.left!) / 2 < bx + (b.right! - b.left!) / 2 ? -1 : 1;
          a.vx! += dir * ox * strength * wb;
          b.vx! -= dir * ox * strength * wa;
        } else {
          const dir = ay < by || (ay === by && i < j) ? -1 : 1;
          a.vy! += dir * oy * strength * wb;
          b.vy! -= dir * oy * strength * wa;
        }
      }
    }
  };
  force.initialize = (n: SimNode[]) => (nodes = n);
  return force;
}

/** Caps how far a node can move per tick, so nothing ever jumps or whips around. */
function forceSpeedLimit(max: () => number) {
  let nodes: SimNode[] = [];
  const force = () => {
    const m = max();
    for (const n of nodes) {
      const v = Math.hypot(n.vx!, n.vy!);
      if (v > m) (n.vx! *= m / v), (n.vy! *= m / v);
    }
  };
  force.initialize = (n: SimNode[]) => (nodes = n);
  return force;
}

export class Physics {
  private sim: Simulation<SimNode, SimLink>;
  private link = forceLink<SimNode, SimLink>().id((n) => n.id);
  private charge = forceManyBody<SimNode>().distanceMax(700);
  private collide = forceBoxCollide();
  private maxSpeed = 3;

  constructor(onTick: () => void, onEnd: () => void) {
    this.sim = forceSimulation<SimNode, SimLink>()
      .force('link', this.link)
      .force('charge', this.charge)
      .force('collide', this.collide)
      // Weak pull to the origin keeps disconnected clusters from drifting away.
      .force('x', forceX<SimNode>(0).strength(0.025))
      .force('y', forceY<SimNode>(0).strength(0.025))
      // Runs last so it caps the combined result of all forces.
      .force('speed', forceSpeedLimit(() => this.maxSpeed))
      .on('tick', onTick)
      .on('end', onEnd);
    this.sim.stop();
  }

  /** Re-reads nodes, edges and settings. `heat` restarts the simulation with that alpha. */
  sync(nodes: MapNode[], edges: MapEdge[], s: MapSettings, heat = 0.4) {
    const incoming = new Map<string, number>();
    for (const e of edges) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    const simNodes = nodes as SimNode[];
    for (const n of simNodes) {
      n.r = radiusFor(incoming.get(n.id) ?? 0, s.baseSize);
      const lines = n.label ? wrapLabel(n.label) : [];
      const ring = Math.max(1.4, n.r * 0.2);
      n.left = n.r + ring;
      n.right = lines.length ? n.r + 8 + Math.max(...lines.map((l) => l.length)) * CHAR_W : n.r + ring;
      n.half = Math.max(n.r + ring, (lines.length * LINE_H) / 2);
      n.fx = n.pinned ? n.x : null;
      n.fy = n.pinned ? n.y : null;
    }
    this.sim.nodes(simNodes);
    this.link
      .links(edges.map((e) => ({ source: e.source, target: e.target })))
      .distance((l) => 70 * s.spacing + (l.source as SimNode).r! + (l.target as SimNode).r!)
      // Soft springs: neighbours follow with a lag instead of moving as one rigid block.
      .strength(0.3);
    this.charge.strength((n) => -(140 + n.r! * 12) * s.spacing);
    // Calm, organic motion at every spacing; wide layouts get extra friction so they drift
    // even more slowly. Slower cooling keeps nodes moving long enough to arrive.
    const k = Math.max(0, Math.log2(s.spacing));
    this.sim.velocityDecay(Math.min(0.85, 0.62 + 0.12 * k)).alphaDecay(Math.max(0.01, 0.018 * 0.7 ** k));
    this.maxSpeed = 1.5 + 1.5 * Math.min(s.spacing, 2);
    if (heat > 0) this.sim.alpha(Math.max(this.sim.alpha(), heat)).restart();
  }

  /** Keep the simulation warm while the user drags a node. */
  hold(on: boolean) {
    this.sim.alphaTarget(on ? 0.08 : 0);
    if (on) this.sim.restart();
  }

  stop() {
    this.sim.stop();
  }
}
