const VAT_RATE = 0.05;
const DEMAND_RATE = 42;
const SANCTIONED_KW = 2;
const DEMAND_CHARGE = Math.ceil(SANCTIONED_KW) * DEMAND_RATE;

const SLABS = [
  { label: "0–50 units (Lifeline)", from: 0, to: 50, rate: 4.63, lifeline: true },
  { label: "0–75 units", from: 0, to: 75, rate: 5.26 },
  { label: "76–200 units", from: 76, to: 200, rate: 8.5 },
  { label: "201–300 units", from: 201, to: 300, rate: 9.1 },
  { label: "301–400 units", from: 301, to: 400, rate: 9.62 },
  { label: "401–600 units", from: 401, to: 600, rate: 15.01 },
];

const HISTORY_LEDE =
  "Meter history for the last 24 months: monthly bills, running total, and whether costs are rising or falling.";

const COPY = {
  forward: {
    lede: "Enter monthly units (kWh) to see a slab-by-slab DPDC LT-A estimate, plus the demand charge and 5% VAT.",
    label: "Monthly consumption",
    suffix: "kWh",
    placeholder: "e.g. 185",
    hint: "Lifeline (৳4.63) applies only if you use <strong>50 units or less</strong>. Above that, billing starts from the 0–75 slab. Demand charge is ceil(kW) × ৳42.",
    empty: "Type your units to see the bill breakdown.",
    resultLabel: "Estimated payable",
  },
  reverse: {
    lede: "Enter the total bill (including demand charge and 5% VAT) to estimate how many units that amount would cover.",
    label: "Total bill (with VAT)",
    suffix: "৳",
    placeholder: "e.g. 1850",
    hint: "VAT is removed first, then the demand charge, then usage is worked backwards through the residential slabs.",
    empty: "Type the payable amount to estimate usage.",
    resultLabel: "Estimated usage",
  },
};

const MONTH_INDEX = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const amountInput = document.getElementById("amount");
const tariffList = document.getElementById("tariff-list");
const emptyState = document.getElementById("empty-state");
const result = document.getElementById("result");
const slabBody = document.getElementById("slab-body");
const energyChargeEl = document.getElementById("energy-charge");
const demandChargeEl = document.getElementById("demand-charge");
const vatAmountEl = document.getElementById("vat-amount");
const payableEl = document.getElementById("payable");
const grandTotalEl = document.getElementById("grand-total");
const lifelineNote = document.getElementById("lifeline-note");
const modeForwardBtn = document.getElementById("mode-forward");
const modeReverseBtn = document.getElementById("mode-reverse");
const tabCalculator = document.getElementById("tab-calculator");
const tabHistory = document.getElementById("tab-history");
const calculatorSection = document.getElementById("calculator-section");
const historySection = document.getElementById("history-section");
const historyBody = document.getElementById("history-body");
const historyLoading = document.getElementById("history-loading");
const historyEmpty = document.getElementById("history-empty");
const historyStats = document.getElementById("history-stats");
const historyWindow = document.getElementById("history-window");
const historySource = document.getElementById("history-source");
const trendBadge = document.getElementById("trend-badge");
const billChart = document.getElementById("bill-chart");
const chartTooltip = document.getElementById("chart-tooltip");

let mode = "forward";
let chartState = null;

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatTaka(amount) {
  return `৳${amount.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTakaCompact(amount) {
  return `৳${Math.round(amount).toLocaleString("en-BD")}`;
}

function formatUnits(units) {
  return `${units.toLocaleString("en-BD", {
    maximumFractionDigits: 2,
  })} kWh`;
}

function formatUnitsShort(units) {
  return `${units.toLocaleString("en-BD", { maximumFractionDigits: 1 })}`;
}

function renderTariff(activeLabels = []) {
  tariffList.innerHTML = SLABS.map((slab) => {
    const active = activeLabels.includes(slab.label) ? "active" : "";
    return `<li class="${active}"><span>${slab.label}</span><span class="rate">${formatTaka(slab.rate)} / kWh</span></li>`;
  }).join("");
}

function calculateBill(units) {
  if (units <= 50) {
    const charge = round(units * 4.63);
    return {
      rows: [
        {
          label: "0–50 units (Lifeline)",
          units,
          rate: 4.63,
          charge,
        },
      ],
      energy: charge,
      lifeline: true,
    };
  }

  const progressive = SLABS.filter((slab) => !slab.lifeline);
  const rows = [];
  let remaining = units;

  for (const slab of progressive) {
    const width = slab.to - slab.from + (slab.from === 0 ? 0 : 1);
    const used = Math.min(remaining, width);
    if (used <= 0) break;

    const charge = round(used * slab.rate);
    rows.push({
      label: slab.label,
      units: used,
      rate: slab.rate,
      charge,
    });
    remaining -= used;
  }

  if (remaining > 0) {
    const lastRate = progressive[progressive.length - 1].rate;
    const charge = round(remaining * lastRate);
    rows.push({
      label: "Above 600 units",
      units: remaining,
      rate: lastRate,
      charge,
    });
  }

  const energy = round(rows.reduce((sum, row) => sum + row.charge, 0));
  return { rows, energy, lifeline: false };
}

function payableFor(units) {
  const bill = calculateBill(units);
  const taxable = round(bill.energy + DEMAND_CHARGE);
  const vat = round(taxable * VAT_RATE);
  const total = round(taxable + vat);
  return { bill, demand: DEMAND_CHARGE, vat, total };
}

function binarySearchUnits(target, lo, hi) {
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (payableFor(mid).total < target) lo = mid;
    else hi = mid;
  }

  let best = round(hi);
  let bestDiff = Math.abs(payableFor(best).total - target);

  for (const candidate of [round(lo), round(hi), round((lo + hi) / 2)]) {
    const diff = Math.abs(payableFor(candidate).total - target);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best;
}

function usageFromTotal(total) {
  const minBill = payableFor(0).total;
  if (total <= minBill) {
    return { units: 0, gap: false };
  }

  const at50 = payableFor(50).total;
  const at51 = payableFor(51).total;

  if (total <= at50) {
    return { units: binarySearchUnits(total, 0.01, 50), gap: false };
  }

  if (total >= at51) {
    return { units: binarySearchUnits(total, 51, 80000), gap: false };
  }

  const nearer = Math.abs(total - at50) <= Math.abs(total - at51) ? 50 : 51;
  return { units: nearer, gap: true, at50, at51 };
}

function showEmpty() {
  emptyState.classList.remove("hidden");
  result.classList.add("hidden");
  renderTariff();
}

function renderBreakdown(units, note) {
  const { bill, demand, vat, total } = payableFor(units);

  emptyState.classList.add("hidden");
  result.classList.remove("hidden");

  slabBody.innerHTML = bill.rows
    .map(
      (row) => `
        <tr>
          <td>${row.label}</td>
          <td>${Number(row.units.toFixed(2))}</td>
          <td>${formatTaka(row.rate)}</td>
          <td>${formatTaka(row.charge)}</td>
        </tr>`
    )
    .join("");

  energyChargeEl.textContent = formatTaka(bill.energy);
  demandChargeEl.textContent = formatTaka(demand);
  vatAmountEl.textContent = formatTaka(vat);
  payableEl.textContent = formatTaka(total);

  if (mode === "forward") {
    grandTotalEl.textContent = formatTaka(total);
  } else {
    grandTotalEl.textContent = formatUnits(units);
  }

  const showNote = Boolean(note) || bill.lifeline;
  lifelineNote.classList.toggle("hidden", !showNote);
  lifelineNote.textContent =
    note || (bill.lifeline ? "Lifeline tariff applied" : "");

  renderTariff(bill.rows.map((row) => row.label));
}

function update() {
  const value = Number(amountInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    showEmpty();
    return;
  }

  if (mode === "forward") {
    renderBreakdown(value);
    return;
  }

  const found = usageFromTotal(value);
  const note = found.gap
    ? `No exact match in the lifeline jump (৳${found.at50.toFixed(2)}–৳${found.at51.toFixed(2)}). Showing nearest usage.`
    : "";
  renderBreakdown(found.units, note);
}

function setMode(nextMode) {
  mode = nextMode;
  const copy = COPY[mode];

  modeForwardBtn.classList.toggle("active", mode === "forward");
  modeReverseBtn.classList.toggle("active", mode === "reverse");
  modeForwardBtn.setAttribute("aria-pressed", String(mode === "forward"));
  modeReverseBtn.setAttribute("aria-pressed", String(mode === "reverse"));

  document.getElementById("lede").textContent = copy.lede;
  document.getElementById("input-label").textContent = copy.label;
  document.getElementById("input-suffix").textContent = copy.suffix;
  document.getElementById("input-hint").innerHTML = copy.hint;
  document.getElementById("empty-copy").textContent = copy.empty;
  document.getElementById("result-label").textContent = copy.resultLabel;
  amountInput.placeholder = copy.placeholder;
  amountInput.value = "";
  showEmpty();
}

modeForwardBtn.addEventListener("click", () => setMode("forward"));
modeReverseBtn.addEventListener("click", () => setMode("reverse"));
amountInput.addEventListener("input", update);

function setMainTab(tab) {
  if (tab === "calculator") {
    tabCalculator.classList.add("active");
    tabHistory.classList.remove("active");
    tabCalculator.setAttribute("aria-pressed", "true");
    tabHistory.setAttribute("aria-pressed", "false");
    calculatorSection.classList.remove("hidden");
    historySection.classList.add("hidden");
    document.getElementById("lede").textContent = COPY[mode].lede;
  } else {
    tabCalculator.classList.remove("active");
    tabHistory.classList.add("active");
    tabCalculator.setAttribute("aria-pressed", "false");
    tabHistory.setAttribute("aria-pressed", "true");
    calculatorSection.classList.add("hidden");
    historySection.classList.remove("hidden");
    document.getElementById("lede").textContent = HISTORY_LEDE;
    loadBills();
  }
}

function parseMonth(value) {
  const key = String(value || "").trim().toLowerCase();
  return MONTH_INDEX[key];
}

function normalizeBills(records) {
  if (!Array.isArray(records)) return [];

  return records
    .map((row) => {
      const year = Number(row.year);
      const monthIndex = parseMonth(row.month);
      if (!Number.isFinite(year) || monthIndex === undefined) return null;

      return {
        year,
        month: row.month,
        monthIndex,
        sortKey: year * 12 + monthIndex,
        label: `${MONTH_SHORT[monthIndex]} ${year}`,
        present: Number(row.present),
        total: Number(row.total),
        bill: Number(row.bill),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortKey - b.sortKey);
}

function last24Months(bills) {
  if (bills.length === 0) return [];
  const latest = bills[bills.length - 1].sortKey;
  const cutoff = latest - 23;
  return bills.filter((bill) => bill.sortKey >= cutoff);
}

function describeTrend(windowBills) {
  if (windowBills.length < 2) {
    return { label: "Need more data", tone: "flat", detail: "Add another month to compare." };
  }

  const mid = Math.floor(windowBills.length / 2);
  const first = windowBills.slice(0, mid);
  const second = windowBills.slice(mid);
  const avg = (rows) => rows.reduce((sum, row) => sum + row.bill, 0) / rows.length;
  const earlier = avg(first);
  const later = avg(second);
  const change = ((later - earlier) / earlier) * 100;

  if (Math.abs(change) < 2) {
    return { label: "Holding steady", tone: "flat", detail: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs earlier months` };
  }

  if (change > 0) {
    return { label: "Bills increasing", tone: "up", detail: `+${change.toFixed(1)}% vs earlier months` };
  }

  return { label: "Bills decreasing", tone: "down", detail: `${change.toFixed(1)}% vs earlier months` };
}

function renderStats(windowBills, allCount) {
  const total = windowBills.reduce((sum, row) => sum + row.bill, 0);
  const units = windowBills.reduce((sum, row) => sum + row.total, 0);
  const latest = windowBills[windowBills.length - 1];
  const previous = windowBills.length > 1 ? windowBills[windowBills.length - 2] : null;
  const mom = previous ? ((latest.bill - previous.bill) / previous.bill) * 100 : null;

  historyStats.innerHTML = `
    <div class="stat">
      <p class="stat-label">24-month total</p>
      <p class="stat-value">${formatTakaCompact(total)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Average bill</p>
      <p class="stat-value">${formatTakaCompact(total / windowBills.length)}</p>
    </div>
    <div class="stat latest">
      <p class="stat-label">Latest (${latest.label})</p>
      <p class="stat-value">${formatTakaCompact(latest.bill)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Month-over-month</p>
      <p class="stat-value ${mom == null ? "" : mom > 0 ? "up" : mom < 0 ? "down" : ""}">${
        mom == null ? "—" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`
      }</p>
    </div>
  `;

  historyWindow.textContent = `${windowBills.length} month${windowBills.length === 1 ? "" : "s"} in view · ${formatUnits(units)} · ${allCount} record${allCount === 1 ? "" : "s"} total`;
}

function renderTrend(windowBills) {
  const trend = describeTrend(windowBills);
  trendBadge.classList.remove("hidden", "up", "down", "flat");
  trendBadge.classList.add(trend.tone);
  trendBadge.innerHTML = `<strong>${trend.label}</strong><span>${trend.detail}</span>`;
}

const NICE_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceScale(maxValue, tickCount) {
  const safe = Math.max(maxValue, 1);
  const rough = safe / tickCount;
  const exponent = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exponent);
  const n = rough / base;
  const mult = NICE_MULTIPLIERS.find((candidate) => n <= candidate) ?? 10;
  const step = mult * base;
  return { step, max: step * tickCount };
}

function chartPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function renderChart(windowBills) {
  hideChartTooltip();
  const width = 760;
  const height = 300;
  const pad = { top: 30, right: 66, bottom: 54, left: 66 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const count = windowBills.length;
  const baseY = pad.top + innerH;

  const running = [];
  windowBills.reduce((sum, row) => {
    const next = sum + row.bill;
    running.push(next);
    return next;
  }, 0);

  const billValues = windowBills.map((row) => row.bill);
  const billScale = niceScale(Math.max(...billValues, 1), 4);
  const sumScale = niceScale(Math.max(...running, 1), 4);
  const avg = billValues.reduce((sum, value) => sum + value, 0) / Math.max(count, 1);
  const peakIndex = billValues.indexOf(Math.max(...billValues));

  const slot = innerW / Math.max(count, 1);
  const barW = Math.min(34, slot * 0.52);

  const points = windowBills.map((row, index) => {
    const x = pad.left + slot * index + slot / 2;
    const h = (row.bill / billScale.max) * innerH;
    const y = baseY - h;
    const sumY = baseY - (running[index] / sumScale.max) * innerH;
    const previous = index > 0 ? windowBills[index - 1].bill : null;
    const mom = previous ? ((row.bill - previous) / previous) * 100 : null;
    return { ...row, x, y, h, sumY, running: running[index], mom, index };
  });

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const t = i / ticks;
    const y = baseY - innerH * t;
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="grid-line" />
      <text x="${pad.left - 10}" y="${(y + 4).toFixed(1)}" class="axis-label left">${formatTakaCompact(billScale.step * i)}</text>
      <text x="${width - pad.right + 10}" y="${(y + 4).toFixed(1)}" class="axis-label right">${formatTakaCompact(sumScale.step * i)}</text>`;
  }).join("");

  const bars = points
    .map((point) => {
      const latest = point.index === count - 1;
      const showValue = count <= 10 || latest || point.index === peakIndex;
      const labelY = Math.max(point.y - 8, pad.top + 10);
      const valueLabel = showValue
        ? `<text x="${point.x.toFixed(1)}" y="${labelY.toFixed(1)}" class="bar-value${latest ? " latest" : ""}">${formatTakaCompact(point.bill)}</text>`
        : "";
      return `${valueLabel}
      <rect class="bar${latest ? " latest" : ""}" data-index="${point.index}" x="${(point.x - barW / 2).toFixed(1)}" y="${point.y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(point.h, 2).toFixed(1)}" rx="5">
        <title>${latest ? "Latest · " : ""}${point.label}: ${formatTaka(point.bill)}</title>
      </rect>`;
    })
    .join("");

  const labelStep = count > 16 ? 3 : count > 10 ? 2 : 1;
  const labels = points
    .map((point) => {
      const isLast = point.index === count - 1;
      if (point.index % labelStep !== 0 && !isLast) return "";
      return `<text x="${point.x.toFixed(1)}" y="${height - 16}" class="axis-label center${isLast ? " latest" : ""}">${point.label}</text>`;
    })
    .join("");

  const linePath = chartPath(points.map((point) => ({ x: point.x, y: point.sumY })));
  const area = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;
  const avgY = baseY - (avg / billScale.max) * innerH;

  const hits = points
    .map(
      (point) =>
        `<rect class="hit" data-index="${point.index}" tabindex="0" role="button" aria-label="${point.label}: ${formatTaka(point.bill)}, ${formatUnitsShort(point.total)} kWh" x="${(point.x - slot / 2).toFixed(1)}" y="${pad.top}" width="${slot.toFixed(1)}" height="${innerH}" />`
    )
    .join("");

  billChart.innerHTML = `
    <defs>
      <linearGradient id="sumFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7ee0d0" stop-opacity="0.30" />
        <stop offset="100%" stop-color="#7ee0d0" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffd977" />
        <stop offset="100%" stop-color="#d99a1f" />
      </linearGradient>
      <linearGradient id="barFillLatest" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff3c4" />
        <stop offset="100%" stop-color="#f0c14b" />
      </linearGradient>
    </defs>
    <text x="${pad.left}" y="${pad.top - 12}" class="axis-title left">Monthly bill (৳)</text>
    <text x="${width - pad.right}" y="${pad.top - 12}" class="axis-title right">Running total (৳)</text>
    ${grid}
    <path d="${area}" class="sum-area" />
    <line x1="${pad.left}" x2="${width - pad.right}" y1="${avgY.toFixed(1)}" y2="${avgY.toFixed(1)}" class="avg-line" />
    <text x="${(pad.left + 8).toFixed(1)}" y="${(avgY - 7).toFixed(1)}" class="avg-label">Avg ${formatTakaCompact(avg)}</text>
    ${bars}
    <path d="${linePath}" class="sum-line" />
    ${points
      .map(
        (point) =>
          `<circle class="sum-dot${point.index === count - 1 ? " latest" : ""}" cx="${point.x.toFixed(1)}" cy="${point.sumY.toFixed(1)}" r="${point.index === count - 1 ? 4.5 : 3.2}" />`
      )
      .join("")}
    ${labels}
    <line id="chart-cursor" class="cursor-line hidden" x1="0" x2="0" y1="${pad.top}" y2="${baseY}" />
    ${hits}
  `;

  chartState = { points, width, height, pad, innerH, baseY, count };
}

function hideChartTooltip() {
  chartTooltip.classList.add("hidden");
  const cursor = document.getElementById("chart-cursor");
  if (cursor) cursor.classList.add("hidden");
  billChart.querySelectorAll(".bar.hover").forEach((bar) => bar.classList.remove("hover"));
}

function showChartTooltip(index) {
  if (!chartState || !chartState.points[index]) return;
  const point = chartState.points[index];
  const cursor = document.getElementById("chart-cursor");
  if (cursor) {
    cursor.setAttribute("x1", point.x.toFixed(1));
    cursor.setAttribute("x2", point.x.toFixed(1));
    cursor.classList.remove("hidden");
  }

  billChart.querySelectorAll(".bar.hover").forEach((bar) => bar.classList.remove("hover"));
  const activeBar = billChart.querySelector(`.bar[data-index="${index}"]`);
  if (activeBar) activeBar.classList.add("hover");

  const momText =
    point.mom == null
      ? "First month in view"
      : `${point.mom > 0 ? "+" : ""}${point.mom.toFixed(1)}% vs previous month`;
  const momTone = point.mom == null ? "" : point.mom > 0 ? "up" : point.mom < 0 ? "down" : "";

  chartTooltip.innerHTML = `
    <p class="tip-title">${point.label}</p>
    <p class="tip-row"><span>Bill</span><strong>${formatTaka(point.bill)}</strong></p>
    <p class="tip-row"><span>Units</span><strong>${formatUnitsShort(point.total)} kWh</strong></p>
    <p class="tip-row"><span>Running total</span><strong>${formatTaka(point.running)}</strong></p>
    <p class="tip-note ${momTone}">${momText}</p>
  `;
  chartTooltip.classList.remove("hidden");

  const canvas = billChart.parentElement;
  const canvasRect = canvas.getBoundingClientRect();
  const tipRect = chartTooltip.getBoundingClientRect();
  const anchorX = (point.x / chartState.width) * canvasRect.width;
  const anchorY = (Math.min(point.y, point.sumY) / chartState.height) * canvasRect.height;
  const flip = anchorX > canvasRect.width * 0.58;
  const rawLeft = flip ? anchorX - tipRect.width - 14 : anchorX + 14;
  const left = Math.max(6, Math.min(rawLeft, canvasRect.width - tipRect.width - 6));
  const top = Math.max(6, Math.min(anchorY - tipRect.height / 2, canvasRect.height - tipRect.height - 6));

  chartTooltip.style.left = `${left.toFixed(1)}px`;
  chartTooltip.style.top = `${top.toFixed(1)}px`;
  chartTooltip.style.transform = "none";
}

billChart.addEventListener("pointermove", (event) => {
  const target = event.target.closest("[data-index]");
  if (!target) {
    hideChartTooltip();
    return;
  }
  showChartTooltip(Number(target.dataset.index));
});

billChart.addEventListener("pointerdown", (event) => {
  const target = event.target.closest("[data-index]");
  if (target) showChartTooltip(Number(target.dataset.index));
});

billChart.addEventListener("pointerleave", hideChartTooltip);
billChart.addEventListener("focusin", (event) => {
  const target = event.target.closest("[data-index]");
  if (target) showChartTooltip(Number(target.dataset.index));
});
billChart.addEventListener("focusout", hideChartTooltip);
window.addEventListener("resize", hideChartTooltip);
window.addEventListener("scroll", hideChartTooltip, { passive: true });

function renderHistory(bills) {
  const windowBills = last24Months(bills);
  const tableRows = [...windowBills].reverse();

  historyBody.innerHTML = tableRows
    .map((bill, index) => {
      const older = tableRows[index + 1];
      let changeCell = `<span class="change flat">—</span>`;
      if (older) {
        const delta = bill.bill - older.bill;
        const pct = (delta / older.bill) * 100;
        const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        const sign = delta > 0 ? "+" : "";
        changeCell = `<span class="change ${tone}">${sign}${formatTakaCompact(delta)} (${sign}${pct.toFixed(1)}%)</span>`;
      }

      const isLatest = index === 0;
      return `
      <tr class="${isLatest ? "latest" : ""}">
        <td>
          <strong>${bill.label}</strong>
          ${isLatest ? '<span class="latest-tag">Latest</span>' : ""}
        </td>
        <td>${bill.present.toLocaleString("en-BD")}</td>
        <td>${bill.total.toLocaleString("en-BD")}</td>
        <td>${formatTaka(bill.bill)}</td>
        <td>${changeCell}</td>
      </tr>
    `;
    })
    .join("");

  if (windowBills.length > 0) {
    renderStats(windowBills, bills.length);
    renderTrend(windowBills);
    renderChart(windowBills);
  }
}

function loadBills() {
  historyLoading.classList.add("hidden");
  historyEmpty.classList.add("hidden");
  historyBody.innerHTML = "";
  billChart.innerHTML = "";
  chartTooltip.classList.add("hidden");
  chartState = null;
  historyStats.innerHTML = "";
  trendBadge.classList.add("hidden");

  const bills = normalizeBills(typeof BILLS === "undefined" ? [] : BILLS);
  historySource.textContent = "Loaded from bills.js";

  if (bills.length === 0) {
    historyEmpty.classList.remove("hidden");
    historyEmpty.textContent = "No bills found. Add a row in bills.js and refresh.";
    return;
  }

  renderHistory(bills);
}

tabCalculator.addEventListener("click", () => setMainTab("calculator"));
tabHistory.addEventListener("click", () => setMainTab("history"));

renderTariff();
setMainTab("history");
