import type { AnySoupElement } from "@tscircuit/soup"
import { stringify, type INode } from "svgson"
import { applyToPoint, compose, scale, translate } from "transformation-matrix"

interface SvgObject {
  name: string
  type: "element" | "text"
  attributes?: { [key: string]: string }
  children?: SvgObject[]
  value?: string
}

function circuitJsonToPcbSvg(soup: AnySoupElement[]): string {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  // Process all elements to determine bounds
  for (const item of soup) {
    if ("center" in item && "width" in item && "height" in item) {
      updateBounds(item.center, item.width, item.height)
    } else if ("x" in item && "y" in item) {
      updateBounds({ x: item.x, y: item.y }, 0, 0)
    } else if ("route" in item) {
      updateTraceBounds(item.route)
    }
  }

  const padding = 1 // Reduced padding for tighter boundary
  const circuitWidth = maxX - minX + 2 * padding
  const circuitHeight = maxY - minY + 2 * padding

  const svgWidth = 800
  const svgHeight = 600
  const paths: PointObjectNotation[][] = []
  for (const item of soup) {
    if ("route" in item && item.route !== undefined) {
      paths.push(item.route as PointObjectNotation[])
    }
  }

  // Calculate scale factor to fit the circuit within the SVG, maintaining aspect ratio
  const scaleX = svgWidth / circuitWidth
  const scaleY = svgHeight / circuitHeight
  const scaleFactor = Math.min(scaleX, scaleY)

  // Calculate centering offsets
  const offsetX = (svgWidth - circuitWidth * scaleFactor) / 2
  const offsetY = (svgHeight - circuitHeight * scaleFactor) / 2

  const transform = compose(
    translate(
      offsetX - minX * scaleFactor + padding * scaleFactor,
      svgHeight - offsetY + minY * scaleFactor - padding * scaleFactor,
    ),
    scale(scaleFactor, -scaleFactor), // Flip in y-direction
  )

  const svgElements = soup
    .map((item) => {
      const element = createSvgElement(item, transform)
      return element
    })
    .filter((element) => element !== null)

  let strokeWidth = String(0.05 * scaleFactor)

  for (const element of soup) {
    if ("stroke_width" in element) {
      strokeWidth = String(scaleFactor * element.stroke_width)
      break
    }
  }
  const svgObject: SvgObject = {
    name: "svg",
    type: "element",
    attributes: {
      xmlns: "http://www.w3.org/2000/svg",
      width: svgWidth.toString(),
      height: svgHeight.toString(),
    },
    children: [
      {
        name: "style",
        type: "element",
        children: [
          {
            type: "text",
            value: `
              .pcb-board { fill: #000; }
              .pcb-trace { stroke: #FF0000; stroke-width: 0.3; fill: none; }
              .pcb-hole { fill: #FF00FF; }
              .pcb-pad { fill: #FF0000; }
              .pcb-boundary { fill: none; stroke: #f2eda1; stroke-width: ${strokeWidth}; }
            `,
          },
        ],
      },
      {
        name: "rect",
        type: "element",
        attributes: {
          class: "pcb-board",
          x: "0",
          y: "0",
          width: svgWidth.toString(),
          height: svgHeight.toString(),
        },
      },
      ...svgElements,
      createPcbBoundary(transform, minX, minY, maxX, maxY, paths),
    ].filter((child) => child !== null),
  }

  try {
    return stringify(svgObject as INode)
  } catch (error) {
    console.error("Error stringifying SVG object:", error)
    throw error
  }

  function updateBounds(center: any, width: any, height: any) {
    const halfWidth = width / 2
    const halfHeight = height / 2
    minX = Math.min(minX, center.x - halfWidth)
    minY = Math.min(minY, center.y - halfHeight)
    maxX = Math.max(maxX, center.x + halfWidth)
    maxY = Math.max(maxY, center.y + halfHeight)
  }

  function updateTraceBounds(route: any[]) {
    for (const point of route) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
}

function createSvgElement(item: AnySoupElement, transform: any): any {
  switch (item.type) {
    case "pcb_component":
      return createPcbComponent(item, transform)
    case "pcb_trace":
      return createPcbTrace(item, transform)
    case "pcb_plated_hole":
      return createPcbHole(item, transform)
    case "pcb_smtpad":
      return createPcbSMTPad(item, transform)
    default:
      return null
  }
}

function createPcbComponent(component: any, transform: any): any {
  const { center, width, height, rotation = 0 } = component
  const [x, y] = applyToPoint(transform, [center.x, center.y])
  const scaledWidth = width * Math.abs(transform.a)
  const scaledHeight = height * Math.abs(transform.d)
  const transformStr = `translate(${x}, ${y}) rotate(${-rotation}) scale(1, -1)`

  return {
    name: "g",
    type: "element",
    attributes: { transform: transformStr },
    children: [
      {
        name: "rect",
        type: "element",
        attributes: {
          class: "pcb-component",
          x: (-scaledWidth / 2).toString(),
          y: (-scaledHeight / 2).toString(),
          width: scaledWidth.toString(),
          height: scaledHeight.toString(),
        },
      },
      {
        name: "rect",
        type: "element",
        attributes: {
          class: "pcb-component-outline",
          x: (-scaledWidth / 2).toString(),
          y: (-scaledHeight / 2).toString(),
          width: scaledWidth.toString(),
          height: scaledHeight.toString(),
        },
      },
    ],
  }
}

function createPcbHole(hole: any, transform: any): any {
  const [x, y] = applyToPoint(transform, [hole.x, hole.y])
  const scaledRadius = (hole.outer_diameter / 2) * Math.abs(transform.a)
  return {
    name: "circle",
    type: "element",
    attributes: {
      class: "pcb-hole",
      cx: x.toString(),
      cy: y.toString(),
      r: scaledRadius.toString(),
    },
  }
}

function createPcbSMTPad(pad: any, transform: any): any {
  const [x, y] = applyToPoint(transform, [pad.x, pad.y])
  const width = pad.width * Math.abs(transform.a)
  const height = pad.height * Math.abs(transform.d)
  return {
    name: "rect",
    type: "element",
    attributes: {
      class: "pcb-pad",
      x: (x - width / 2).toString(),
      y: (y - height / 2).toString(),
      width: width.toString(),
      height: height.toString(),
    },
  }
}

function createPcbTrace(trace: any, transform: any): any {
  if (!trace.route || !Array.isArray(trace.route)) return null
  const path = trace.route
    .map((point: any, index: number) => {
      const [x, y] = applyToPoint(transform, [point.x, point.y])
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    })
    .join(" ")
  return {
    name: "path",
    type: "element",
    attributes: {
      class: "pcb-trace",
      d: path,
    },
  }
}

function createPcbBoundary(
  transform: any,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  routes?: { x: number; y: number }[][],
): any {
  const [x1, y1] = applyToPoint(transform, [minX, minY])
  const [x2, y2] = applyToPoint(transform, [maxX, maxY])
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const isPath = Array.isArray(routes) && routes.length > 0
  const stringRoutes = routes?.map((route) => {
    return route
      .map((point: any, index: number) => {
        const [x, y] = applyToPoint(transform, [point.x, point.y])
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
      })
      .join(" ")
  })

  return {
    name: isPath ? "path" : "rect",
    type: "element",
    attributes: {
      class: "pcb-boundary",
      ...(isPath
        ? { d: stringRoutes }
        : {
            x: x.toString(),
            y: y.toString(),
            width: width.toString(),
            height: height.toString(),
          }),
    },
  }
}

export { circuitJsonToPcbSvg }