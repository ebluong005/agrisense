import L from 'leaflet'
import { Check, RotateCcw, Spline, Square, Undo2, X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useState } from 'react'
import type { Field } from '../../api/types'
import { boundaryProblem, type LatLon, polygonFromVertices, rectangleVertices, verticesFromPolygon } from '../../lib/geometry'
import { Button } from '../ui/Button'
import { FIELD_STYLE, handleIcon, OTHER_FIELD_STYLE, ringToLatLngs, toLatLng, useLeafletMap } from './useLeafletMap'

/**
 * idle      – choose a tool; the map can be moved freely
 * rectangle – drag a box, or click two opposite corners (map panning is paused)
 * corners   – click each corner; click the first corner, double-click or "Done" to finish
 * done      – boundary complete; corners can be dragged to adjust
 */
type Mode = 'idle' | 'rectangle' | 'corners' | 'done'

type Props = {
  center: LatLon
  /** Shape to start from (read once when the editor mounts). */
  initial: GeoJSON.Polygon | null
  otherFields: Field[]
  /** Called with a valid closed polygon when the boundary is complete, otherwise null. */
  onChange: (polygon: GeoJSON.Polygon | null) => void
}

const DRAG_THRESHOLD_PX = 12 // movement below this is a click, not a drag
const SAME_SPOT_PX = 16 // clicks this close to a corner don't create a duplicate corner

export function BoundaryEditor({ center, initial, otherFields, onChange }: Props) {
  const { containerRef, map } = useLeafletMap({ center, zoom: 16, base: 'satellite' })
  // Snapshot: later changes to `initial` (the parent echoing our own edits) must not reset the editor.
  const [startShape] = useState(initial)
  const [vertices, setVertices] = useState<LatLon[]>(() => (startShape ? verticesFromPolygon(startShape) : []))
  const [mode, setMode] = useState<Mode>(startShape ? 'done' : 'idle')
  const [rectAnchorSet, setRectAnchorSet] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const problemId = useId()
  const problem = vertices.length ? boundaryProblem(vertices) : null

  function commit(next: LatLon[], nextMode: Mode) {
    setVertices(next)
    setMode(nextMode)
    setRectAnchorSet(false)
    setRejected(null)
    onChange(nextMode === 'done' && !boundaryProblem(next) ? polygonFromVertices(next) : null)
  }

  /** Finish only if valid; otherwise keep drawing and explain why. */
  function tryFinish(next: LatLon[], fallbackMode: Mode) {
    const why = boundaryProblem(next)
    if (why) {
      commit(fallbackMode === 'rectangle' ? [] : next, fallbackMode)
      setRejected(why)
      return
    }
    commit(next, 'done')
  }

  const pixelDistance = (a: LatLon, b: L.LatLng) => (map ? map.latLngToContainerPoint(toLatLng(a)).distanceTo(map.latLngToContainerPoint(b)) : Infinity)

  const onMapClick = useEffectEvent((latlng: L.LatLng) => {
    if (mode !== 'corners') return
    if (vertices.length >= 3 && pixelDistance(vertices[0], latlng) < SAME_SPOT_PX) return tryFinish(vertices, 'corners') // closed the shape
    if (vertices.some((v) => pixelDistance(v, latlng) < SAME_SPOT_PX)) return // double-click / repeat tap on a corner
    commit([...vertices, { lat: latlng.lat, lon: latlng.lng }], 'corners')
  })
  const onMapDoubleClick = useEffectEvent(() => {
    if (mode === 'corners' && vertices.length >= 3) tryFinish(vertices, 'corners')
  })
  const moveVertex = useEffectEvent((index: number, latlng: L.LatLng) => {
    commit(vertices.map((v, i) => (i === index ? { lat: latlng.lat, lon: latlng.lng } : v)), mode)
  })
  const finishRectangle = useEffectEvent((a: L.LatLng, b: L.LatLng) => {
    tryFinish(rectangleVertices({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }), 'rectangle')
  })
  const markAnchor = useEffectEvent(() => setRectAnchorSet(true))

  // Fit the existing boundary once, and show neighbouring fields for context.
  useEffect(() => {
    if (!map) return
    const others = L.featureGroup(otherFields.map((f) => L.polygon(ringToLatLngs(f.boundary), { ...OTHER_FIELD_STYLE, interactive: false }))).addTo(map)
    if (startShape) map.fitBounds(L.polygon(ringToLatLngs(startShape)).getBounds(), { padding: [32, 32], maxZoom: 18, animate: false })
    return () => {
      others.remove()
    }
  }, [map, otherFields, startShape])

  // Corners tool: clicks add corners; double-click finishes instead of zooming.
  useEffect(() => {
    if (!map || mode !== 'corners') return
    const onClick = (e: L.LeafletMouseEvent) => onMapClick(e.latlng)
    const onDblClick = () => onMapDoubleClick()
    map.doubleClickZoom.disable()
    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.doubleClickZoom.enable()
    }
  }, [map, mode])

  // Rectangle tool: drag a box, or click one corner then the opposite corner.
  // Pointer events cover mouse, touch and pen; panning is paused so a drag draws instead of moving the map.
  useEffect(() => {
    if (!map || mode !== 'rectangle') return
    const el = map.getContainer()
    map.dragging.disable()
    map.boxZoom.disable()
    map.doubleClickZoom.disable()
    el.style.touchAction = 'none'
    let down: { latlng: L.LatLng; x: number; y: number; id: number } | null = null
    let anchor: L.LatLng | null = null
    let preview: L.Rectangle | null = null
    const show = (a: L.LatLng, b: L.LatLng) => {
      if (preview) preview.setBounds(L.latLngBounds(a, b))
      else preview = L.rectangle(L.latLngBounds(a, b), { ...FIELD_STYLE, interactive: false }).addTo(map)
    }
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as Element).closest('.leaflet-control')) return // keep zoom/layer buttons usable
      down = { latlng: map.mouseEventToLatLng(e), x: e.clientX, y: e.clientY, id: e.pointerId }
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const from = down?.latlng ?? anchor
      if (from && e.isPrimary) show(from, map.mouseEventToLatLng(e))
    }
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const end = map.mouseEventToLatLng(e)
      const dragged = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX
      if (dragged) finishRectangle(down.latlng, end)
      else if (anchor) finishRectangle(anchor, end)
      else {
        anchor = down.latlng
        markAnchor()
      }
      down = null
    }
    const onCancel = () => {
      down = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      preview?.remove()
      el.style.touchAction = ''
      map.dragging.enable()
      map.boxZoom.enable()
      map.doubleClickZoom.enable()
    }
  }, [map, mode])

  // Draw the shape and its draggable corner handles.
  useEffect(() => {
    if (!map || vertices.length === 0) return
    const latlngs = vertices.map(toLatLng)
    const bad = mode === 'done' ? Boolean(problem) : vertices.length >= 4 && Boolean(problem?.startsWith('The edges cross'))
    const style = { ...(bad ? { ...FIELD_STYLE, color: '#dc2626', fillColor: '#dc2626' } : FIELD_STYLE), interactive: false }
    const shape = (mode === 'done' || vertices.length >= 3 ? L.polygon(latlngs, style) : L.polyline(latlngs, style)).addTo(map)
    const handles = vertices.map((v, i) => {
      const marker = L.marker(toLatLng(v), { icon: handleIcon(i === 0 && mode === 'corners' ? 'first' : 'vertex'), draggable: true, keyboard: false, title: `Corner ${i + 1}` })
      marker.on('drag', () => shape.setLatLngs(latlngs.map((p, j) => (j === i ? marker.getLatLng() : p))))
      marker.on('dragend', () => moveVertex(i, marker.getLatLng()))
      // Clicking the first corner closes the shape (a common drawing convention).
      if (i === 0) marker.on('click', () => onMapClick(marker.getLatLng()))
      return marker.addTo(map)
    })
    return () => {
      shape.remove()
      handles.forEach((h) => h.remove())
    }
  }, [map, vertices, mode, problem])

  const instructions = {
    idle: 'Move the map to your field, then choose how to draw it.',
    rectangle: rectAnchorSet
      ? 'Now click or tap the opposite corner of the field.'
      : 'Drag a box around the field, or click one corner and then the opposite corner.',
    corners:
      vertices.length < 3
        ? `Click or tap each corner of the field. ${vertices.length} placed so far.`
        : `${vertices.length} corners placed. Click the first corner or press "Done" to finish.`,
    done: problem ? 'Boundary needs fixing.' : 'Boundary set. Drag the white dots to adjust the corners.',
  }[mode]
  const shownProblem = rejected ?? (mode === 'corners' || mode === 'done' ? problem : null)

  return (
    <div className="space-y-3">
      {/* Controls sit above the map so they stay on screen while drawing. */}
      <div className="flex flex-wrap gap-2">
        {mode === 'idle' && (
          <>
            <Button icon={<Square aria-hidden className="size-5" />} onClick={() => commit([], 'rectangle')}>
              Draw a rectangle
            </Button>
            <Button variant="secondary" icon={<Spline aria-hidden className="size-5" />} onClick={() => commit([], 'corners')}>
              Draw corners (any shape)
            </Button>
          </>
        )}
        {mode === 'corners' && (
          <>
            <Button icon={<Check aria-hidden className="size-5" />} disabled={Boolean(problem) || vertices.length === 0} aria-describedby={problem ? problemId : undefined} onClick={() => tryFinish(vertices, 'corners')}>
              Done
            </Button>
            <Button variant="secondary" icon={<Undo2 aria-hidden className="size-5" />} disabled={vertices.length === 0} onClick={() => commit(vertices.slice(0, -1), 'corners')}>
              Undo last corner
            </Button>
          </>
        )}
        {(mode === 'rectangle' || mode === 'corners') && (
          <Button variant="ghost" icon={<X aria-hidden className="size-5" />} onClick={() => commit([], 'idle')}>
            Cancel
          </Button>
        )}
        {mode === 'done' && (
          <Button variant="secondary" icon={<RotateCcw aria-hidden className="size-5" />} onClick={() => commit([], 'idle')}>
            Start over
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-base text-stone-800">
        {instructions}
      </p>
      {shownProblem && (
        <p id={problemId} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-base text-amber-950">
          {shownProblem}
        </p>
      )}
      <div
        ref={containerRef}
        role="application"
        aria-label="Field boundary map"
        data-mode={mode}
        className={`isolate h-[55vh] max-h-[30rem] min-h-72 w-full overflow-hidden rounded-xl ${mode === 'rectangle' || mode === 'corners' ? 'cursor-crosshair' : ''}`}
      />
    </div>
  )
}
