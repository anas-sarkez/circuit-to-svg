import type { AnyCircuitElement } from "circuit-json"
import type { SvgObject } from "lib/svg-object"
import { colorMap } from "lib/utils/colors"
import { stringify } from "svgson"
import {
  applyToPoint,
  compose,
  scale,
  translate,
  fromTriangles,
  type Matrix,
  fromTwoMovingPoints,
} from "transformation-matrix"
import { drawSchematicGrid } from "./draw-schematic-grid"
import { drawSchematicLabeledPoints } from "./draw-schematic-labeled-points"
import { getSchematicBoundsFromCircuitJson } from "./get-schematic-bounds-from-circuit-json"
import { createSvgObjectsFromSchematicComponent } from "./svg-object-fns/create-svg-objects-from-sch-component"
import { createSvgObjectsFromSchDebugObject } from "./svg-object-fns/create-svg-objects-from-sch-debug-object"
import { createSchematicTrace } from "./svg-object-fns/create-svg-objects-from-sch-trace"

interface Options {
  width?: number
  height?: number
  grid?: boolean | { cellSize?: number; labelCells?: boolean }
  labeledPoints?: Array<{ x: number; y: number; label: string }>
}

export function convertCircuitJsonToSchematicSvg(
  circuitJson: AnyCircuitElement[],
  options?: Options,
): string {
  // Get bounds with padding
  const realBounds = getSchematicBoundsFromCircuitJson(circuitJson)
  const realWidth = realBounds.maxX - realBounds.minX
  const realHeight = realBounds.maxY - realBounds.minY

  const svgWidth = options?.width ?? 1200
  const svgHeight = options?.height ?? 600

  // Compute the padding such that we maintain the same aspect ratio
  const circuitAspectRatio = realWidth / realHeight
  const containerAspectRatio = svgWidth / svgHeight

  let screenPaddingPx: { x: number; y: number }
  if (circuitAspectRatio > containerAspectRatio) {
    // Circuit is wider than container - fit to width
    const newHeight = svgWidth / circuitAspectRatio
    screenPaddingPx = {
      x: 0,
      y: (svgHeight - newHeight) / 2,
    }
  } else {
    // Circuit is taller than container - fit to height
    const newWidth = svgHeight * circuitAspectRatio
    screenPaddingPx = {
      x: (svgWidth - newWidth) / 2,
      y: 0,
    }
  }

  // Calculate projection using REAL points and SCREEN points
  // We're saying to map the real bounds to the screen bounds by giving 3 points
  // for each coordinate space
  const transform = fromTriangles(
    [
      { x: realBounds.minX, y: realBounds.maxY },
      { x: realBounds.maxX, y: realBounds.maxY },
      { x: realBounds.maxX, y: realBounds.minY },
    ],
    [
      { x: screenPaddingPx.x, y: screenPaddingPx.y },
      { x: svgWidth - screenPaddingPx.x, y: screenPaddingPx.y },
      { x: svgWidth - screenPaddingPx.x, y: svgHeight - screenPaddingPx.y },
    ],
  )
  const svgChildren: SvgObject[] = []

  // Add background rectangle
  svgChildren.push({
    name: "rect",
    type: "element",
    attributes: {
      class: "boundary",
      x: "0",
      y: "0",
      width: svgWidth.toString(),
      height: svgHeight.toString(),
    },
    children: [],
    value: "",
  })

  // Add grid if enabled
  if (options?.grid) {
    const gridConfig = typeof options.grid === "object" ? options.grid : {}
    svgChildren.push(
      drawSchematicGrid({ bounds: realBounds, transform, ...gridConfig }),
    )
  }

  // Add labeled points if provided
  if (options?.labeledPoints) {
    svgChildren.push(
      drawSchematicLabeledPoints({
        points: options.labeledPoints,
        transform,
      }),
    )
  }

  const schDebugObjectSvgs: SvgObject[] = []
  const schComponentSvgs: SvgObject[] = []
  const schTraceSvgs: SvgObject[] = []

  for (const elm of circuitJson) {
    if (elm.type === "schematic_debug_object") {
      schDebugObjectSvgs.push(
        ...createSvgObjectsFromSchDebugObject(elm, transform),
      )
    } else if (elm.type === "schematic_component") {
      schComponentSvgs.push(
        ...createSvgObjectsFromSchematicComponent({
          component: elm,
          transform,
          circuitJson,
        }),
      )
    } else if (elm.type === "schematic_trace") {
      schTraceSvgs.push(...createSchematicTrace(elm, transform))
    }
  }

  // Add elements in correct order
  svgChildren.push(...schDebugObjectSvgs, ...schComponentSvgs, ...schTraceSvgs)

  const svgObject: SvgObject = {
    name: "svg",
    type: "element",
    attributes: {
      xmlns: "http://www.w3.org/2000/svg",
      width: svgWidth.toString(),
      height: svgHeight.toString(),
      style: `background-color: ${colorMap.schematic.background}`,
    },
    children: [
      // Add styles
      {
        name: "style",
        type: "element",
        children: [
          {
            type: "text",

            // DO NOT USE THESE CLASSES!!!!
            // PUT STYLES IN THE SVG OBJECTS THEMSELVES
            value: `
              .boundary { fill: ${colorMap.schematic.background}; }
              .schematic-boundary { fill: none; stroke: #fff; stroke-width: 0.3; }
              .component { fill: none; stroke: ${colorMap.schematic.component_outline}; }
              .chip { fill: ${colorMap.schematic.component_body}; stroke: ${colorMap.schematic.component_outline}; }
              .component-pin { fill: none; stroke: ${colorMap.schematic.component_outline}; }
              .trace { stroke: ${colorMap.schematic.wire}; stroke-width: 2px; fill: none; }
              .text { font-family: Arial, sans-serif; font-size: 2px; fill: ${colorMap.schematic.wire}; }
              .pin-number { fill: ${colorMap.schematic.pin_number}; }
              .port-label { fill: ${colorMap.schematic.reference}; }
              .component-name { font-size: 0.25px; fill: ${colorMap.schematic.reference}; }
            `,
            name: "",
            attributes: {},
            children: [],
          },
        ],
        value: "",
        attributes: {},
      },
      ...svgChildren,
    ],
    value: "",
  }

  return stringify(svgObject)
}

/**
 * @deprecated use `convertCircuitJsonToSchematicSvg` instead
 */
export const circuitJsonToSchematicSvg = convertCircuitJsonToSchematicSvg
