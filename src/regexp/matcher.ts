import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Boolean, flagless UTF-16 matching only. No captures, backreferences or lookaround
// can observe path priority, so an epsilon NFA computes the same existence result
// as ordered ECMAScript backtracking. It must NOT be reused for exec or g/y.
// Bounds are checked before parsing/expansion/allocation; epsilon closure and
// matching are iterative. Work counts compiler visits (including empty nodes),
// state visits and character-set tests, not just successful transitions.
const limits = { source: 512, depth: 32, repeat: 128, states: 1024, input: 4096, work: 200000 };
export function regexpBoundary(detail: string): never {
  throw new UnsupportedAnalysisError("RegExp.test is not yet supported: " + detail);
}
function budget(detail: string): never {
  throw new ExecutionBudgetError("RegExp.test exceeded its " + detail + " budget");
}
type Range = [number, number];
type SetPart = { ranges: Range[]; invert: boolean };
type AtomSet = { parts: SetPart[]; invert: boolean };
type Node = { kind: "set"; set: AtomSet } | { kind: "start" | "end" } |
  { kind: "sequence" | "alternative"; children: Node[] } |
  { kind: "repeat"; child: Node; min: number; max: number };
const singleton = (code: number): SetPart => ({ ranges: [[code, code]], invert: false });
const digit = (c: string) => c >= "0" && c <= "9";
const whitespace: Range[] = [[9, 13], [32, 32], [160, 160], [5760, 5760],
  [8192, 8202], [8232, 8233], [8239, 8239], [8287, 8287], [12288, 12288], [65279, 65279]];

class Parser {
  private index = 0;
  constructor(private source: string) {}
  parse(): Node {
    const node = this.disjunction(0);
    if (this.index !== this.source.length) return regexpBoundary("pattern syntax");
    return node;
  }
  private disjunction(depth: number): Node {
    if (depth > limits.depth) return budget("nesting");
    const choices: Node[] = [];
    do {
      const children: Node[] = [];
      while (this.index < this.source.length && this.peek() !== ")" && this.peek() !== "|") {
        const atom = this.atom(depth);
        const c = this.peek();
        if (c === "*" || c === "+" || c === "?" || c === "{") {
          if (atom.kind === "start" || atom.kind === "end") return regexpBoundary("quantified assertion");
          this.index++;
          let min = c === "+" ? 1 : 0, max = c === "?" ? 1 : Infinity;
          if (c === "{") {
            min = this.integer(); max = min;
            if (this.peek() === ",") {
              this.index++;
              max = this.peek() === "}" ? Infinity : this.integer();
            }
            if (this.peek() !== "}" || max < min) return regexpBoundary("repetition syntax");
            this.index++;
          }
          if (this.peek() === "?") this.index++; // priority is unobservable for Boolean existence
          children.push({ kind: "repeat", child: atom, min, max });
        } else children.push(atom);
      }
      choices.push({ kind: "sequence", children });
      if (this.peek() !== "|") break;
      this.index++;
    } while (true);
    return { kind: "alternative", children: choices };
  }
  private peek(): string { return this.source[this.index] || ""; }
  private integer(): number {
    if (!digit(this.peek())) return regexpBoundary("repetition syntax");
    let value = 0;
    while (digit(this.peek())) {
      value = value * 10 + Number(this.source[this.index++]);
      if (value > limits.repeat) return budget("repetition");
    }
    return value;
  }
  private atom(depth: number): Node {
    const c = this.source[this.index++];
    if (c === "(") {
      if (this.peek() === "?") {
        this.index++;
        if (this.source[this.index++] !== ":") return regexpBoundary("lookaround or named groups");
      }
      const child = this.disjunction(depth + 1);
      if (this.source[this.index++] !== ")") return regexpBoundary("group syntax");
      return child;
    }
    if (c === "^") return { kind: "start" };
    if (c === "$") return { kind: "end" };
    if (c === ".") return { kind: "set", set: { parts: [{ ranges: [[10, 10], [13, 13], [8232, 8233]], invert: true }], invert: false } };
    if (c === "[") {
      const invert = this.peek() === "^";
      if (invert) this.index++;
      const parts: SetPart[] = [];
      while (this.index < this.source.length && this.peek() !== "]") {
        const first = this.classPart();
        if (this.peek() === "-" && this.source[this.index + 1] !== "]") {
          this.index++;
          const last = this.classPart();
          if (first.invert || last.invert || first.ranges.length !== 1 || last.ranges.length !== 1 ||
              first.ranges[0][0] !== first.ranges[0][1] || last.ranges[0][0] !== last.ranges[0][1] ||
              first.ranges[0][0] > last.ranges[0][0]) return regexpBoundary("legacy character-class ranges");
          parts.push({ ranges: [[first.ranges[0][0], last.ranges[0][0]]], invert: false });
        } else parts.push(first);
      }
      if (this.source[this.index++] !== "]") return regexpBoundary("character-class syntax");
      return { kind: "set", set: { parts, invert } };
    }
    if ("*+?{}]".includes(c)) return regexpBoundary("legacy or unsupported pattern syntax");
    return { kind: "set", set: { parts: [c === "\\" ? this.escape(false) : singleton(c.charCodeAt(0))], invert: false } };
  }
  private classPart(): SetPart {
    const c = this.source[this.index++];
    if (c === undefined) return regexpBoundary("character-class syntax");
    return c === "\\" ? this.escape(true) : singleton(c.charCodeAt(0));
  }
  private escape(inClass: boolean): SetPart {
    const c = this.source[this.index++];
    if (!c) return regexpBoundary("escape syntax");
    if ("dDwWsS".includes(c)) {
      const kind = c.toLowerCase();
      const ranges: Range[] = kind === "d" ? [[48, 57]] : kind === "w"
        ? [[48, 57], [65, 90], [95, 95], [97, 122]] : whitespace;
      return { ranges, invert: c !== kind };
    }
    if ("^$\\.*+?()[]{}|/-".includes(c)) return singleton(c.charCodeAt(0));
    const control: { [name: string]: number } = { f: 12, n: 10, r: 13, t: 9, v: 11 };
    if (Object.prototype.hasOwnProperty.call(control, c)) return singleton(control[c]);
    if (c === "b" && inClass) return singleton(8);
    if (c === "0" && !digit(this.peek())) return singleton(0);
    if (c === "x" || c === "u") {
      let value = 0;
      for (let i = 0; i < (c === "x" ? 2 : 4); i++) {
        const h = this.source[this.index++];
        const digitValue = h ? "0123456789abcdef".indexOf(h.toLowerCase()) : -1;
        if (digitValue < 0) return regexpBoundary("hex escape syntax");
        value = value * 16 + digitValue;
      }
      return singleton(value);
    }
    return regexpBoundary("backreferences, assertions, control or identity escapes");
  }
}

type State = { kind: "accept" } | { kind: "split"; next: number; other: number } |
  { kind: "start" | "end"; next: number } | { kind: "set"; set: AtomSet; next: number };

export function matches(source: string, input: string): boolean {
  if (source.length > limits.source) return budget("source length");
  if (input.length > limits.input) return budget("input length");
  const tree = new Parser(source).parse();
  let remaining = limits.work;
  const tick = () => { if (--remaining < 0) budget("work"); };
  const states: State[] = [];
  const add = (state: State) => {
    if (states.length >= limits.states) return budget("state count");
    states.push(state); return states.length - 1;
  };
  // Compiler depth is at most three frames per admitted group, plus one repeat.
  // Every visit is charged even when no state is emitted (e.g. (){128}{...}).
  const compile = (node: Node, next: number): number => {
    tick();
    if (node.kind === "set") return add({ kind: "set", set: node.set, next });
    if (node.kind === "start" || node.kind === "end") return add({ kind: node.kind, next });
    if (node.kind === "sequence") {
      let head = next;
      for (let i = node.children.length - 1; i >= 0; i--) head = compile(node.children[i], head);
      return head;
    }
    if (node.kind === "alternative") {
      let head = compile(node.children[node.children.length - 1], next);
      for (let i = node.children.length - 2; i >= 0; i--) head = add({ kind: "split", next: compile(node.children[i], next), other: head });
      return head;
    }
    if (node.kind === "repeat") {
      let head = next;
      if (node.max === Infinity) {
        const split = add({ kind: "split", next, other: next });
        states[split] = { kind: "split", next: compile(node.child, split), other: next };
        head = split;
      } else for (let i = node.min; i < node.max; i++) head = add({ kind: "split", next: compile(node.child, head), other: head });
      for (let i = 0; i < node.min; i++) head = compile(node.child, head);
      return head;
    }
    throw new Error("Invalid internal RegExp syntax node");
  };
  const start = compile(tree, add({ kind: "accept" }));
  let pending = new Set<number>();
  for (let position = 0; position <= input.length; position++) {
    // Add a fresh unanchored start at each UTF-16 position. All candidates at
    // the same position share closure work; nullable cycles visit each state once.
    pending.add(start);
    const stack = Array.from(pending), seen = new Set<number>(pending);
    const next = new Set<number>();
    const enqueue = (id: number) => { if (!seen.has(id)) { seen.add(id); stack.push(id); } };
    while (stack.length) {
      tick();
      const state = states[stack.pop()!];
      if (state.kind === "accept") return true;
      if (state.kind === "split") { enqueue(state.next); enqueue(state.other); }
      else if (state.kind === "start") { if (position === 0) enqueue(state.next); }
      else if (state.kind === "end") { if (position === input.length) enqueue(state.next); }
      else if (state.kind === "set" && position < input.length) {
        const code = input.charCodeAt(position);
        let included = false;
        for (const part of state.set.parts) {
          let within = false;
          for (const range of part.ranges) { tick(); if (code >= range[0] && code <= range[1]) { within = true; break; } }
          if (within !== part.invert) { included = true; break; }
        }
        if (included !== state.set.invert) next.add(state.next);
      }
    }
    pending = next;
  }
  return false;
}
