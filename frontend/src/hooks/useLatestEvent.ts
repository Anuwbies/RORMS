import { useCallback, useLayoutEffect, useRef } from 'react'

// Stable event identity lets memoized views reuse their content without stale state.
export function useLatestEvent<Args extends unknown[], Result>(handler: (...args: Args) => Result): (...args: Args) => Result {
  const handlerRef = useRef(handler)
  useLayoutEffect(() => { handlerRef.current = handler })
  return useCallback((...args: Args) => handlerRef.current(...args), [])
}
