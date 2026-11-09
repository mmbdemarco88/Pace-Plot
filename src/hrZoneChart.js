// ----------------------------------------------------
// Pace Plot — D3.js Weekly Heart Rate Zone Time Distribution Bar Chart
// ----------------------------------------------------
import * as d3 from 'd3';
import { buildHrZoneChartDataset } from './trainingPlan.js';

/**
 * Renders an interactive D3.js SVG vertical bar chart visualizing weekly workout time
 * across the user's 5 personalized heart rate zones (Z1–Z5).
 *
 * @param {HTMLElement|null} containerEl - DOM container for the D3 SVG chart
 * @param {Object} zoneData - Result from calculateHeartRateZones()
 * @param {Object} options - Optional callbacks { onZoneClick, isDark }
 */
export function renderD3HeartRateZonesBarChart(containerEl, zoneData, options = {}) {
  if (!containerEl || !zoneData) return null;

  const chartModel = buildHrZoneChartDataset(zoneData);
  const dataset = chartModel.items;
  if (!dataset.length) return null;

  const isDark = typeof options.isDark === 'boolean'
    ? options.isDark
    : document.documentElement.classList.contains('dark');

  const axisTextColor = isDark ? '#a8a29e' : '#57534e';
  const subAxisTextColor = isDark ? '#78716c' : '#78716c';
  const gridLineColor = isDark ? 'rgba(120, 113, 108, 0.22)' : 'rgba(168, 162, 158, 0.30)';
  const valueLabelColor = isDark ? '#f5f5f4' : '#1c1917';

  // Fixed responsive viewBox dimensions for crisp rendering in both mobile and desktop layouts
  const width = 356;
  const height = 198;
  const margin = { top: 28, right: 12, bottom: 44, left: 38 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Clear previous contents and mount responsive D3 SVG
  const root = d3.select(containerEl);
  root.selectAll('*').remove();

  const svg = root
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('height', '198')
    .attr('role', 'img')
    .attr('aria-label', `D3 bar chart of weekly workout time across 5 personalized heart rate zones based on ${chartModel.maxHr} bpm Max HR`)
    .style('overflow', 'visible')
    .style('display', 'block');

  // SVG Defs for vertical bar gradients
  const defs = svg.append('defs');
  dataset.forEach((d) => {
    const grad = defs
      .append('linearGradient')
      .attr('id', `d3-hr-grad-${d.code}`)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    grad
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', d.fillHex)
      .attr('stop-opacity', 0.98);

    grad
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', d.strokeHex)
      .attr('stop-opacity', 0.78);
  });

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // X Scale: 5 Heart Rate Zones (Z1 - Z5)
  const xScale = d3
    .scaleBand()
    .domain(dataset.map((d) => d.code))
    .range([0, innerWidth])
    .padding(0.28);

  // Y Scale: Weekly Workout Minutes in Zone
  const yDomainMax = Math.ceil((chartModel.maxMinutes * 1.22) / 10) * 10;
  const yScale = d3
    .scaleLinear()
    .domain([0, Math.max(40, yDomainMax)])
    .range([innerHeight, 0]);

  // Horizontal Y-Axis Gridlines via D3
  const yTicks = yScale.ticks(4);
  g.append('g')
    .attr('class', 'd3-hr-gridlines')
    .selectAll('line')
    .data(yTicks)
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', (t) => yScale(t))
    .attr('y2', (t) => yScale(t))
    .attr('stroke', gridLineColor)
    .attr('stroke-dasharray', (t) => (t === 0 ? 'none' : '3,3'))
    .attr('stroke-width', 1);

  // Y-Axis Labels (Minutes)
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(4)
    .tickSize(0)
    .tickPadding(6)
    .tickFormat((d) => `${d}m`);

  const yAxisGroup = g
    .append('g')
    .attr('class', 'd3-hr-y-axis')
    .call(yAxis);

  yAxisGroup.select('.domain').remove();
  yAxisGroup
    .selectAll('text')
    .attr('fill', axisTextColor)
    .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
    .style('font-size', '9px')
    .style('font-weight', '600');

  // Bar Groups
  const barGroups = g
    .selectAll('.d3-hr-zone-group')
    .data(dataset, (d) => d.code)
    .join('g')
    .attr('class', 'd3-hr-zone-group')
    .attr('transform', (d) => `translate(${xScale(d.code)},0)`)
    .style('cursor', 'pointer');

  // Background Track Pill behind each bar
  barGroups
    .append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', xScale.bandwidth())
    .attr('height', innerHeight)
    .attr('rx', 7)
    .attr('fill', isDark ? 'rgba(41, 37, 36, 0.55)' : 'rgba(245, 245, 244, 0.85)');

  // Data Bars with D3 transition
  barGroups
    .append('rect')
    .attr('class', 'd3-hr-zone-bar')
    .attr('data-zone-code', (d) => d.code)
    .attr('data-zone-minutes', (d) => d.minutesRounded)
    .attr('data-zone-bpm', (d) => d.bpmShort)
    .attr('x', 0)
    .attr('width', xScale.bandwidth())
    .attr('rx', 7)
    .attr('y', (d) => yScale(Math.max(1.5, d.minutes)))
    .attr('height', (d) => Math.max(4, innerHeight - yScale(Math.max(1.5, d.minutes))))
    .attr('fill', (d) => `url(#d3-hr-grad-${d.code})`)
    .attr('stroke', (d) => (d.isLiveZone ? '#ffffff' : d.strokeHex))
    .attr('stroke-width', (d) => (d.isLiveZone ? 2 : 1));

  // Primary Duration Label above each bar (e.g. "1h 51m" or "27m")
  barGroups
    .append('text')
    .attr('class', 'd3-hr-bar-duration')
    .attr('x', xScale.bandwidth() / 2)
    .attr('y', (d) => yScale(Math.max(1.5, d.minutes)) - 13)
    .attr('text-anchor', 'middle')
    .attr('fill', valueLabelColor)
    .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
    .style('font-size', '9.5px')
    .style('font-weight', '800')
    .text((d) => `${d.minutesRounded}m`);

  // Secondary Percentage Label directly below duration above each bar
  barGroups
    .append('text')
    .attr('class', 'd3-hr-bar-pct')
    .attr('x', xScale.bandwidth() / 2)
    .attr('y', (d) => yScale(Math.max(1.5, d.minutes)) - 3.5)
    .attr('text-anchor', 'middle')
    .attr('fill', (d) => d.fillHex)
    .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
    .style('font-size', '8.5px')
    .style('font-weight', '700')
    .text((d) => `${d.percentage}%`);

  // X-Axis Zone Code Label (Z1 - Z5) + Live Dot
  barGroups
    .append('text')
    .attr('class', 'd3-hr-x-zone')
    .attr('x', xScale.bandwidth() / 2)
    .attr('y', innerHeight + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', (d) => (d.isLiveZone ? '#f43f5e' : valueLabelColor))
    .style('font-family', 'ui-sans-serif, system-ui, sans-serif')
    .style('font-size', '10px')
    .style('font-weight', '800')
    .text((d) => (d.isLiveZone ? `${d.code} •` : d.code));

  // X-Axis Personalized BPM Range Sub-label (e.g. "113–131")
  barGroups
    .append('text')
    .attr('class', 'd3-hr-x-bpm')
    .attr('x', xScale.bandwidth() / 2)
    .attr('y', innerHeight + 26)
    .attr('text-anchor', 'middle')
    .attr('fill', axisTextColor)
    .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
    .style('font-size', '8.5px')
    .style('font-weight', '600')
    .text((d) => d.bpmShort);

  // X-Axis Zone Short Name Sub-label (e.g. "Base", "Tempo")
  barGroups
    .append('text')
    .attr('class', 'd3-hr-x-name')
    .attr('x', xScale.bandwidth() / 2)
    .attr('y', innerHeight + 37)
    .attr('text-anchor', 'middle')
    .attr('fill', subAxisTextColor)
    .style('font-family', 'ui-sans-serif, system-ui, sans-serif')
    .style('font-size', '8px')
    .style('font-weight', '600')
    .text((d) => d.shortName);

  // Native SVG tooltip + interactive click handler
  barGroups
    .append('title')
    .text(
      (d) =>
        `${d.code} ${d.name} (${d.rangeLabel}): ${d.durationFormatted} (${d.minutesRounded} min · ${d.percentage}% of weekly volume)`
    );

  barGroups.on('click', (_event, d) => {
    if (typeof options.onZoneClick === 'function') {
      options.onZoneClick(d);
    }
  });

  return chartModel;
}
