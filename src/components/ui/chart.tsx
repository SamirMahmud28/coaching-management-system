"use client"

import * as React from "react"
import { cn } from "cn"
import { ResponsiveContainer, Tooltip } from "recharts"

/**
 * Charts (recharts) themed by the design tokens. A `ChartConfig` names each series and gives its colour (usually a
 * `var(--chart-n)` token); `ChartContainer` exposes them as `--color-<key>` so the chart reads `fill="var(--color-paid)"`.
 */
export type ChartConfig = Record<string, { label: string; color: string }>

const ChartContext = React.createContext<ChartConfig | null>(null)

function ChartContainer({
  config,
  className,
  children,
  label,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof ResponsiveContainer>["children"]
  /** What the chart shows, for screen readers (the chart itself is drawn, not read). */
  label: string
}) {
  const style = Object.fromEntries(Object.entries(config).map(([key, v]) => [`--color-${key}`, v.color])) as React.CSSProperties
  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        role="img"
        aria-label={label}
        className={cn(
          "aspect-video w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/70 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-surface]:outline-hidden",
          className,
        )}
        style={{ ...style, ...props.style }}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

type TooltipItem = { dataKey?: string | number; name?: string | number; value?: unknown; color?: string }

/** The tooltip card: the label on top and one row per series with its colour, name and formatted value. */
function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue = (v) => String(v),
  formatLabel = (l) => String(l),
}: {
  active?: boolean
  payload?: readonly TooltipItem[]
  label?: string | number
  formatValue?: (value: number | string) => string
  formatLabel?: (label: string | number) => string
}) {
  const config = React.useContext(ChartContext) ?? {}
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {label !== undefined && <p className="mb-1.5 font-semibold">{formatLabel(label)}</p>}
      <ul className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "")
          return (
            <li key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: config[key]?.color ?? item.color }} aria-hidden="true" />
              <span className="text-muted-foreground">{config[key]?.label ?? item.name}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums">{formatValue(item.value as number | string)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A recharts Tooltip already wired to ChartTooltipContent. */
function ChartTooltip({
  formatValue,
  formatLabel,
  ...props
}: React.ComponentProps<typeof Tooltip> & {
  formatValue?: (value: number | string) => string
  formatLabel?: (label: string | number) => string
}) {
  return (
    <Tooltip
      cursor={props.cursor ?? true}
      content={({ active, payload, label }) => (
        <ChartTooltipContent
          active={active}
          payload={payload as unknown as readonly TooltipItem[] | undefined}
          label={label as string | number | undefined}
          formatValue={formatValue}
          formatLabel={formatLabel}
        />
      )}
      {...props}
    />
  )
}

/** A legend row below a chart, from the config. Colour is never the only cue: each swatch has its name. */
function ChartLegend({ className, keys }: { className?: string; keys?: string[] }) {
  const config = React.useContext(ChartContext)
  const entries = Object.entries(config ?? {}).filter(([k]) => !keys || keys.includes(k))
  return (
    <ul className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {entries.map(([key, v]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: v.color }} aria-hidden="true" />
          {v.label}
        </li>
      ))}
    </ul>
  )
}

function ChartLegendFor({ config, className }: { config: ChartConfig; className?: string }) {
  return (
    <ChartContext.Provider value={config}>
      <ChartLegend className={className} />
    </ChartContext.Provider>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendFor }
