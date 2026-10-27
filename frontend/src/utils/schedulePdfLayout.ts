export function sizeSchedulePdfGrids(container: HTMLElement): () => void {
  const grids = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-schedule-grid]'))
  const measurements = grids.map(grid => {
    const cell = grid.parentElement
    const originalHeight = grid.style.height
    if (!cell) return { grid, originalHeight, height: 0 }

    const cellStyle = getComputedStyle(cell)
    const height = cell.clientHeight
      - Number.parseFloat(cellStyle.paddingTop)
      - Number.parseFloat(cellStyle.paddingBottom)

    return { grid, originalHeight, height: Math.max(0, height) }
  })

  measurements.forEach(({ grid, height }) => {
    grid.style.height = `${height}px`
  })

  return () => {
    measurements.forEach(({ grid, originalHeight }) => {
      grid.style.height = originalHeight
    })
  }
}
