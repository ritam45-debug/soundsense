"use client";
import { useCallback, useSyncExternalStore } from "react";
import { emptyWs, loadWs, subscribeWs, updateWs, type Workspace } from "./store";

const SERVER = emptyWs();
/** Reactive access to the workspace. Server render and first client render both see the empty workspace, so hydration matches. */
export function useWorkspace(): [Workspace, (fn: (w: Workspace) => void) => void] {
  const w = useSyncExternalStore(subscribeWs, loadWs, () => SERVER);
  const update = useCallback((fn: (w: Workspace) => void) => updateWs((x) => { fn(x); return x; }), []);
  return [w, update];
}
