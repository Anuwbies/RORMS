import type { PlotAssignment } from './schedulePlotting'

type Selection = ReadonlyMap<string, PlotAssignment>
export interface PlotSelectionHistory { past: Selection[]; present: Map<string, PlotAssignment>; future: Selection[] }
export const createPlotSelectionHistory = (): PlotSelectionHistory => ({ past: [], present: new Map(), future: [] })

export function recordPlotSelection(history: PlotSelectionHistory, next: Map<string, PlotAssignment>): PlotSelectionHistory {
  if (next.size === history.present.size && [...next].every(([key, value]) => JSON.stringify(value) === JSON.stringify(history.present.get(key)))) return history
  return { past: [...history.past, history.present].slice(-100), present: next, future: [] }
}

export function movePlotSelectionHistory(history: PlotSelectionHistory, redo: boolean): PlotSelectionHistory {
  const source = redo ? history.future : history.past
  if (!source.length) return history
  return redo
    ? { past: [...history.past, history.present], present: new Map(source[source.length - 1]), future: source.slice(0, -1) }
    : { past: source.slice(0, -1), present: new Map(source[source.length - 1]), future: [...history.future, history.present] }
}
