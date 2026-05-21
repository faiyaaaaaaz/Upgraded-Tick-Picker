"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

const HTML_TAG_PATTERN = /<\/?(?:html|head|body|div|table|thead|tbody|tfoot|tr|td|th|style|meta|title|br|p|span|font|a|b|i|strong|em)\b[^>]*>/gi;

const RESULT_CONFIG = [
  {
    key: "minBid",
    shortLabel: "Min Bid",
    label: "Minimum Bid Price",
    valueLabel: "Minimum Bid",
    priceField: "bid",
    rawField: "bidRaw",
    pillClass: "pillBlue",
    highlightClass: "highlightRowBlue"
  },
  {
    key: "maxAsk",
    shortLabel: "Max Ask",
    label: "Maximum Ask Price",
    valueLabel: "Maximum Ask",
    priceField: "ask",
    rawField: "askRaw",
    pillClass: "pillPink",
    highlightClass: "highlightRowPink"
  },
  {
    key: "minAsk",
    shortLabel: "Min Ask",
    label: "Minimum Ask Price",
    valueLabel: "Minimum Ask",
    priceField: "ask",
    rawField: "askRaw",
    pillClass: "pillGreen",
    highlightClass: "highlightRowGreen"
  },
  {
    key: "maxBid",
    shortLabel: "Max Bid",
    label: "Maximum Bid Price",
    valueLabel: "Maximum Bid",
    priceField: "bid",
    rawField: "bidRaw",
    pillClass: "pillYellow",
    highlightClass: "highlightRowYellow"
  }
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .trim();
}

function decodeHtmlEntities(value) {
  const text = cleanText(value);
  if (!text) return "";

  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
  return decodeHtmlEntities(String(value ?? "").replace(HTML_TAG_PATTERN, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value) {
  return stripTags(value)
    .replace(/[<>]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePriceText(value) {
  const text = stripTags(value);
  return text === "" ? null : text;
}

function parsePrice(value) {
  const text = normalizePriceText(value);
  if (text === null) return null;

  let normalized = text.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === ",") return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    normalized = normalized.replace(/,/g, ".");
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function isValidDateParts(year, month, day) {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function findDateParts(value) {
  const text = cleanText(value).replace(/[T_]/g, " ");

  let match = text.match(/\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  match = text.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }

  match = text.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    const dayFirst = { year, month: second, day: first };
    if (isValidDateParts(dayFirst.year, dayFirst.month, dayFirst.day)) return dayFirst;
    const monthFirst = { year, month: first, day: second };
    if (isValidDateParts(monthFirst.year, monthFirst.month, monthFirst.day)) return monthFirst;
  }

  return null;
}

function findTimeParts(value) {
  const text = cleanText(value);

  let match = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\b/);
  if (!match) {
    match = text.match(/\b(\d{2})(\d{2})(\d{2})(?:[.,](\d{1,9}))?\b/);
  }

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const millisecond = Number(String(match[4] ?? "0").padEnd(3, "0").slice(0, 3));

  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  return { hour, minute, second, millisecond };
}

function parseTickDate(dateValue, timeValue = "") {
  const combined = `${cleanText(dateValue)} ${cleanText(timeValue)}`.replace(/\s+/g, " ").trim();
  const dateParts = findDateParts(combined);
  const timeParts = findTimeParts(combined);

  if (!dateParts || !timeParts) return null;

  const date = new Date(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
    timeParts.millisecond
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(date) {
  if (!date) return "-";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function safeDigits(value, maxLength) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength);
}

function buildDateTimeFromParts(dateValue, timeParts) {
  if (!dateValue) return null;

  const hh = timeParts.hh.padStart(2, "0");
  const mm = timeParts.mm.padStart(2, "0");
  const ss = timeParts.ss.padStart(2, "0");
  const ms = timeParts.ms.padStart(3, "0");

  const full = `${dateValue}T${hh}:${mm}:${ss}.${ms}`;
  const dt = new Date(full);

  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getMinRow(rows, field) {
  const validRows = rows.filter(
    (row) =>
      row[field] !== null &&
      !Number.isNaN(row[field]) &&
      Number(row[field]) !== 0
  );

  if (!validRows.length) return null;

  return validRows.reduce((min, current) =>
    current[field] < min[field] ? current : min
  );
}

function getMaxRow(rows, field) {
  const validRows = rows.filter(
    (row) =>
      row[field] !== null &&
      !Number.isNaN(row[field]) &&
      Number(row[field]) !== 0
  );

  if (!validRows.length) return null;

  return validRows.reduce((max, current) =>
    current[field] > max[field] ? current : max
  );
}

function headerMatchesBid(header) {
  return header === "bid" || header.includes("bidprice") || header.includes("bidquote") || header.endsWith("bid");
}

function headerMatchesAsk(header) {
  return header === "ask" || header.includes("askprice") || header.includes("askquote") || header.endsWith("ask");
}

function headerMatchesDate(header) {
  return (
    header === "date" ||
    header === "day" ||
    header.includes("tradedate") ||
    header.includes("pricedate") ||
    header.includes("datetime") ||
    header.includes("timestamp")
  );
}

function headerMatchesTime(header) {
  return (
    header === "time" ||
    header === "datetime" ||
    header === "timestamp" ||
    header.includes("ticktime") ||
    header.includes("tradingtime")
  );
}

function findColumnIndex(headers, matcher) {
  const normalized = headers.map((header) => normalizeHeader(header));
  return normalized.findIndex(matcher);
}

function normalizeTickRow({ dateValue, timeValue, bidValue, askValue, sourceRow }) {
  const parsedDate = parseTickDate(dateValue, timeValue);
  if (!parsedDate) return null;

  const bidRaw = normalizePriceText(bidValue);
  const askRaw = normalizePriceText(askValue);

  if (bidRaw === null && askRaw === null) return null;

  const bid = parsePrice(bidRaw);
  const ask = parsePrice(askRaw);

  return {
    rawDate: `${cleanText(dateValue)} ${cleanText(timeValue)}`.replace(/\s+/g, " ").trim(),
    parsedDate,
    bid,
    ask,
    bidRaw,
    askRaw,
    sourceRow
  };
}

function rowsFromObjects(objects, fields, sourceLabel) {
  if (!fields?.length || !objects?.length) return [];

  const bidIndex = findColumnIndex(fields, headerMatchesBid);
  const askIndex = findColumnIndex(fields, headerMatchesAsk);
  const dateIndex = findColumnIndex(fields, headerMatchesDate);
  const timeIndex = findColumnIndex(fields, headerMatchesTime);

  if (bidIndex === -1 || askIndex === -1) return [];
  if (dateIndex === -1 && timeIndex === -1) return [];

  const bidField = fields[bidIndex];
  const askField = fields[askIndex];
  const dateField = dateIndex >= 0 ? fields[dateIndex] : fields[timeIndex];
  const timeField = timeIndex >= 0 && timeIndex !== dateIndex ? fields[timeIndex] : null;

  return objects
    .map((row, index) =>
      normalizeTickRow({
        dateValue: row[dateField],
        timeValue: timeField ? row[timeField] : "",
        bidValue: row[bidField],
        askValue: row[askField],
        sourceRow: `${sourceLabel} row ${index + 2}`
      })
    )
    .filter(Boolean);
}

function detectDelimiter(line) {
  const options = ["\t", ";", ",", "|"];
  const scored = options.map((delimiter) => ({
    delimiter,
    count: String(line).split(delimiter).length - 1
  }));

  scored.sort((a, b) => b.count - a.count);
  return scored[0]?.count > 0 ? scored[0].delimiter : "";
}

function looksLikeTickHeader(line) {
  const normalized = normalizeHeader(line);
  return (
    normalized.includes("bid") &&
    normalized.includes("ask") &&
    (normalized.includes("date") || normalized.includes("time") || normalized.includes("timestamp"))
  );
}

function parseDelimitedTickRows(text) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line, index) => index < 250 && looksLikeTickHeader(line));

  if (headerIndex === -1) return [];

  const usefulText = lines.slice(headerIndex).join("\n");
  const delimiter = detectDelimiter(lines[headerIndex]);

  const result = Papa.parse(usefulText, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header) => stripTags(header)
  });

  const fields = result.meta?.fields || [];
  return rowsFromObjects(result.data || [], fields, "delimited file");
}

function extractHtmlCells(rowHtml) {
  const cells = [];
  const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let match;

  while ((match = cellRegex.exec(rowHtml)) !== null) {
    cells.push(stripTags(match[1]));
  }

  return cells;
}

function parseHtmlTickRows(text) {
  if (!/<\s*table[\s>]/i.test(text) && !/<\s*tr[\s>]/i.test(text)) return [];

  let headers = null;
  let columns = null;
  let sourceRow = 0;
  const rows = [];
  const rowRegex = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  const rowMatches = text.match(rowRegex) || text.split(/\r?\n/).filter((line) => /<\s*tr[\s>]/i.test(line));

  for (const rowHtml of rowMatches) {
    sourceRow += 1;
    const cells = extractHtmlCells(rowHtml);
    if (!cells.length) continue;

    if (!headers && looksLikeTickHeader(cells.join("\t"))) {
      headers = cells;
      const bidIndex = findColumnIndex(headers, headerMatchesBid);
      const askIndex = findColumnIndex(headers, headerMatchesAsk);
      const dateIndex = findColumnIndex(headers, headerMatchesDate);
      const timeIndex = findColumnIndex(headers, headerMatchesTime);

      if (bidIndex === -1 || askIndex === -1 || (dateIndex === -1 && timeIndex === -1)) return [];

      columns = { bidIndex, askIndex, dateIndex, timeIndex };
      continue;
    }

    if (!headers || !columns) continue;

    const dateValue = cells[columns.dateIndex >= 0 ? columns.dateIndex : columns.timeIndex];
    const timeValue = columns.timeIndex >= 0 && columns.timeIndex !== columns.dateIndex ? cells[columns.timeIndex] : "";

    const normalized = normalizeTickRow({
      dateValue,
      timeValue,
      bidValue: cells[columns.bidIndex],
      askValue: cells[columns.askIndex],
      sourceRow: `HTML row ${sourceRow}`
    });

    if (normalized) rows.push(normalized);
  }

  return rows;
}

function splitPlainLine(line) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  if (line.includes("|")) return line.split("|");
  if (line.includes(",")) return line.split(",");
  return line.trim().split(/\s+/);
}

function parsePlainTickRows(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripTags(lines[index]);
    if (!line || !findDateParts(line) || !findTimeParts(line)) continue;

    const cells = splitPlainLine(line).map(cleanText).filter((cell) => cell !== "");
    if (cells.length < 3) continue;

    let dateValue = cells[0];
    let timeValue = "";
    let bidValue = cells[1];
    let askValue = cells[2];

    if (!findTimeParts(dateValue) && cells[1] && findTimeParts(cells[1])) {
      timeValue = cells[1];
      bidValue = cells[2];
      askValue = cells[3];
    }

    const normalized = normalizeTickRow({
      dateValue,
      timeValue,
      bidValue,
      askValue,
      sourceRow: `plain text row ${index + 1}`
    });

    if (normalized) rows.push(normalized);
  }

  return rows;
}

function parseSmartTickText(rawText, fileName) {
  const text = cleanText(rawText);
  const parsers = [
    { label: "MT5 HTML table", parse: parseHtmlTickRows },
    { label: "smart delimited table", parse: parseDelimitedTickRows },
    { label: "plain text table", parse: parsePlainTickRows }
  ];

  for (const parser of parsers) {
    const rows = parser.parse(text);
    if (rows.length) {
      rows.sort((a, b) => a.parsedDate - b.parsedDate);
      return { rows, formatLabel: parser.label, fileName };
    }
  }

  return { rows: [], formatLabel: "unknown format", fileName };
}

async function readFileAsSmartText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function getRowKey(row, index) {
  return `${row.rawDate}-${row.bidRaw ?? "blankBid"}-${row.askRaw ?? "blankAsk"}-${index}`;
}

function sameRow(a, b) {
  if (!a || !b) return false;
  return (
    a.parsedDate?.getTime() === b.parsedDate?.getTime() &&
    a.rawDate === b.rawDate &&
    a.bidRaw === b.bidRaw &&
    a.askRaw === b.askRaw
  );
}

function normalizeInstrumentName(value) {
  return cleanText(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toUpperCase();
}

function extractInstrumentName(fileName, rawText) {
  const baseName = normalizeInstrumentName(fileName);
  const firstSegment = baseName.split(/[._-]/).find(Boolean);

  if (firstSegment && /^[A-Z]{3,12}[A-Z0-9]*$/.test(firstSegment)) {
    return firstSegment;
  }

  const headerText = cleanText(rawText).split(/\r?\n/).slice(0, 10).join(" ");
  const managerMatch = headerText.match(/manager\s+([A-Z0-9._-]{3,20})\s+ticks/i);
  if (managerMatch?.[1]) return normalizeInstrumentName(managerMatch[1]);

  const ticksMatch = headerText.match(/\b([A-Z]{3,12}[A-Z0-9]*)\s+ticks\b/i);
  if (ticksMatch?.[1]) return normalizeInstrumentName(ticksMatch[1]);

  return firstSegment || baseName || "INSTRUMENT";
}

function makeUniqueInstrumentName(name, existingNames) {
  const base = normalizeInstrumentName(name) || "INSTRUMENT";
  if (!existingNames.has(base)) return base;

  let counter = 2;
  let candidate = `${base}_${counter}`;
  while (existingNames.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}`;
  }
  return candidate;
}

function getInstrumentRange(instrument) {
  if (!instrument?.rows?.length) return { firstDate: null, lastDate: null };
  return {
    firstDate: instrument.rows[0].parsedDate,
    lastDate: instrument.rows[instrument.rows.length - 1].parsedDate
  };
}

function buildPrimaryResults(rowsInRange) {
  return {
    minBid: getMinRow(rowsInRange, "bid"),
    maxAsk: getMaxRow(rowsInRange, "ask"),
    minAsk: getMinRow(rowsInRange, "ask"),
    maxBid: getMaxRow(rowsInRange, "bid")
  };
}

function findPreviousOrExactRow(rows, targetDate) {
  if (!rows?.length || !targetDate) {
    return { row: null, matchType: "no-match", differenceMs: null };
  }

  const targetTime = targetDate.getTime();
  let left = 0;
  let right = rows.length - 1;
  let bestIndex = -1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const rowTime = rows[middle].parsedDate.getTime();

    if (rowTime <= targetTime) {
      bestIndex = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  if (bestIndex === -1) {
    return { row: null, matchType: "no-previous", differenceMs: null };
  }

  const row = rows[bestIndex];
  const differenceMs = targetTime - row.parsedDate.getTime();
  return {
    row,
    matchType: differenceMs === 0 ? "exact" : "previous",
    differenceMs
  };
}

function formatDifferenceMs(value) {
  if (value === null || value === undefined) return "No previous tick";
  if (value === 0) return "Exact";
  if (value < 1000) return `${value} ms before`;
  if (value < 60000) return `${(value / 1000).toFixed(3)} sec before`;
  return `${(value / 60000).toFixed(2)} min before`;
}

function matchTypeLabel(matchType) {
  if (matchType === "exact") return "Exact";
  if (matchType === "previous") return "Previous tick";
  if (matchType === "no-previous") return "No previous tick";
  return "No match";
}

function tagForType(type, extraClass = "") {
  const config = RESULT_CONFIG.find((item) => item.key === type);
  if (!config) return null;
  return <span className={`pillTag ${config.pillClass} ${extraClass}`}>{config.shortLabel}</span>;
}

function HeroChart() {
  return (
    <div className="heroGraphic">
      <div className="heroLine">
        <svg viewBox="0 0 800 240" preserveAspectRatio="none">
          <path
            d="M10,180 C80,210 110,120 180,140 C250,160 260,65 335,85 C410,105 450,180 520,155 C590,130 615,45 695,72 C740,88 770,78 790,92"
            fill="none"
            stroke="#2f7cff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.95"
          />
        </svg>
      </div>
      <div className="heroLine2">
        <svg viewBox="0 0 800 240" preserveAspectRatio="none">
          <path
            d="M18,160 C70,132 120,205 210,175 C300,145 325,46 415,82 C510,120 560,70 640,98 C710,122 740,35 790,58"
            fill="none"
            stroke="#d946ef"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.95"
          />
        </svg>
      </div>
    </div>
  );
}

function TimeSegmentInput({ label, parts, setParts, refsPrefix }) {
  const hhRef = useRef(null);
  const mmRef = useRef(null);
  const ssRef = useRef(null);
  const msRef = useRef(null);

  function selectInput(ref) {
    if (!ref?.current) return;
    ref.current.focus();
    setTimeout(() => {
      ref.current?.select();
    }, 0);
  }

  function focusNext(current) {
    if (current === "hh") selectInput(mmRef);
    if (current === "mm") selectInput(ssRef);
    if (current === "ss") selectInput(msRef);
  }

  function focusPrev(current) {
    if (current === "mm") selectInput(hhRef);
    if (current === "ss") selectInput(mmRef);
    if (current === "ms") selectInput(ssRef);
  }

  function updatePart(part, rawValue, maxLength) {
    const cleaned = safeDigits(rawValue, maxLength);
    setParts((prev) => ({ ...prev, [part]: cleaned }));

    if (cleaned.length === maxLength) {
      setTimeout(() => {
        focusNext(part);
      }, 0);
    }
  }

  function handleKeyDown(part, e) {
    if (e.key === "Backspace" && !parts[part]) {
      e.preventDefault();
      focusPrev(part);
      return;
    }

    if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      focusPrev(part);
      return;
    }

    if (
      e.key === "ArrowRight" &&
      e.currentTarget.selectionStart === e.currentTarget.value.length
    ) {
      e.preventDefault();
      focusNext(part);
      return;
    }

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      focusNext(part);
      return;
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      focusPrev(part);
    }
  }

  function handleFocus(e) {
    e.target.select();
  }

  function handleClick(e) {
    e.target.select();
  }

  const boxStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    minHeight: 54,
    border: "1px solid rgba(109, 126, 255, 0.2)",
    borderRadius: 14,
    background: "rgba(7, 12, 29, 0.88)"
  };

  const inputStyle = {
    width: "100%",
    minWidth: 0,
    height: 34,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#f7f9ff",
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center"
  };

  const partWrap = (width) => ({
    width,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });

  const separatorStyle = {
    color: "#8ea0d6",
    fontWeight: 800,
    fontSize: 18,
    lineHeight: 1
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div style={boxStyle}>
        <div style={partWrap(58)}>
          <input
            ref={hhRef}
            value={parts.hh}
            onChange={(e) => updatePart("hh", e.target.value, 2)}
            onKeyDown={(e) => handleKeyDown("hh", e)}
            onFocus={handleFocus}
            onClick={handleClick}
            placeholder="HH"
            inputMode="numeric"
            maxLength={2}
            style={inputStyle}
            aria-label={`${refsPrefix} hours`}
          />
        </div>
        <span style={separatorStyle}>:</span>
        <div style={partWrap(58)}>
          <input
            ref={mmRef}
            value={parts.mm}
            onChange={(e) => updatePart("mm", e.target.value, 2)}
            onKeyDown={(e) => handleKeyDown("mm", e)}
            onFocus={handleFocus}
            onClick={handleClick}
            placeholder="MM"
            inputMode="numeric"
            maxLength={2}
            style={inputStyle}
            aria-label={`${refsPrefix} minutes`}
          />
        </div>
        <span style={separatorStyle}>:</span>
        <div style={partWrap(58)}>
          <input
            ref={ssRef}
            value={parts.ss}
            onChange={(e) => updatePart("ss", e.target.value, 2)}
            onKeyDown={(e) => handleKeyDown("ss", e)}
            onFocus={handleFocus}
            onClick={handleClick}
            placeholder="SS"
            inputMode="numeric"
            maxLength={2}
            style={inputStyle}
            aria-label={`${refsPrefix} seconds`}
          />
        </div>
        <span style={separatorStyle}>.</span>
        <div style={partWrap(74)}>
          <input
            ref={msRef}
            value={parts.ms}
            onChange={(e) => updatePart("ms", e.target.value, 3)}
            onKeyDown={(e) => handleKeyDown("ms", e)}
            onFocus={handleFocus}
            onClick={handleClick}
            placeholder="MS"
            inputMode="numeric"
            maxLength={3}
            style={inputStyle}
            aria-label={`${refsPrefix} milliseconds`}
          />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ type, titlePrefix = "", row, note, onShow }) {
  const config = RESULT_CONFIG.find((item) => item.key === type);
  const value = row ? row[config.rawField] : null;

  return (
    <div className="resultCard">
      <div style={{ marginBottom: 12 }}>{tagForType(type)}</div>
      <h3>{titlePrefix}{config.label}</h3>
      <div className="resultValue">{formatPrice(value)}</div>
      {note ? (
        <div className="resultTime" style={{ color: "#fca5a5" }}>{note}</div>
      ) : row ? (
        <div className="resultTime">{formatDateTime(row.parsedDate)}</div>
      ) : (
        <div className="resultTime">No result available.</div>
      )}
      <button className="resultActionBtn" onClick={onShow} disabled={!row}>
        Show on Table
      </button>
    </div>
  );
}

function SingleInstrumentAnalysis() {
  const [fileName, setFileName] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("-");
  const [allRows, setAllRows] = useState([]);
  const [filteredRows, setFilteredRows] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startParts, setStartParts] = useState({ hh: "00", mm: "00", ss: "00", ms: "000" });
  const [endParts, setEndParts] = useState({ hh: "23", mm: "59", ss: "59", ms: "999" });
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
  const [resultNotes, setResultNotes] = useState({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
  const [loadedRowCount, setLoadedRowCount] = useState(0);
  const [activeFocusType, setActiveFocusType] = useState("");
  const [visibleRowCount, setVisibleRowCount] = useState(120);
  const [tableStartIndex, setTableStartIndex] = useState(0);
  const [isJumpingToRow, setIsJumpingToRow] = useState(false);

  const tableSectionRef = useRef(null);
  const rowRefs = useRef({});

  function resetAll() {
    setFileName("");
    setDetectedFormat("-");
    setAllRows([]);
    setVisibleRowCount(120);
    setTableStartIndex(0);
    setFilteredRows([]);
    setStartDate("");
    setEndDate("");
    setStartParts({ hh: "00", mm: "00", ss: "00", ms: "000" });
    setEndParts({ hh: "23", mm: "59", ss: "59", ms: "999" });
    setMessage("");
    setIsAnalyzing(false);
    setIsJumpingToRow(false);
    setLoadedRowCount(0);
    setActiveFocusType("");
    setResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
    setResultNotes({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
    rowRefs.current = {};
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setMessage("Reading and detecting tick file format...");
      setActiveFocusType("");
      setIsAnalyzing(false);
      setResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
      setResultNotes({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
      setFilteredRows([]);
      setTableStartIndex(0);
      setVisibleRowCount(120);
      setDetectedFormat("Detecting...");
      setFileName(file.name);

      const rawText = await readFileAsSmartText(file);
      const parsed = parseSmartTickText(rawText, file.name);

      if (!parsed.rows.length) {
        setAllRows([]);
        setLoadedRowCount(0);
        setDetectedFormat("No tick table detected");
        setMessage("No valid tick rows were found. The file needs a recognizable date/time plus Bid and Ask values.");
        return;
      }

      const firstDate = parsed.rows[0].parsedDate;
      const lastDate = parsed.rows[parsed.rows.length - 1].parsedDate;

      setAllRows(parsed.rows);
      setLoadedRowCount(parsed.rows.length);
      setDetectedFormat(parsed.formatLabel);
      setStartDate(formatDateOnly(firstDate));
      setEndDate(formatDateOnly(lastDate));
      setStartParts({ hh: "00", mm: "00", ss: "00", ms: "000" });
      setEndParts({ hh: "23", mm: "59", ss: "59", ms: "999" });
      setMessage(`File loaded successfully. Detected ${parsed.formatLabel}. Ready for analysis.`);
    } catch (error) {
      console.error(error);
      setDetectedFormat("Read failed");
      setMessage("Could not read this file. Please upload a text-based CSV, TSV, TXT, HTM, or HTML tick export.");
    }
  }

  function handleAnalyze() {
    if (!allRows.length) {
      setMessage("Please upload a tick file first.");
      return;
    }

    setIsAnalyzing(true);
    setMessage("Analyzing selected time range...");
    setActiveFocusType("");

    setTimeout(() => {
      const start = buildDateTimeFromParts(startDate, startParts);
      const end = buildDateTimeFromParts(endDate, endParts);

      if (!start || !end) {
        setMessage("Please complete the date and time inputs in full.");
        setIsAnalyzing(false);
        return;
      }

      if (start > end) {
        setMessage("Start date/time cannot be later than end date/time.");
        setIsAnalyzing(false);
        return;
      }

      const rowsInRange = allRows.filter((row) => row.parsedDate >= start && row.parsedDate <= end);

      if (!rowsInRange.length) {
        setFilteredRows([]);
        setResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
        setResultNotes({
          minBid: "No rows found in the selected range.",
          maxAsk: "No rows found in the selected range.",
          minAsk: "No rows found in the selected range.",
          maxBid: "No rows found in the selected range."
        });
        setMessage("No rows found in this selected range.");
        setIsAnalyzing(false);
        return;
      }

      const nextResults = buildPrimaryResults(rowsInRange);

      setVisibleRowCount(120);
      setTableStartIndex(0);
      rowRefs.current = {};
      setFilteredRows(rowsInRange);
      setResults(nextResults);
      setResultNotes({
        minBid: nextResults.minBid ? "" : "No valid Bid prices found in this range.",
        maxAsk: nextResults.maxAsk ? "" : "No valid Ask prices found in this range.",
        minAsk: nextResults.minAsk ? "" : "No valid Ask prices found in this range.",
        maxBid: nextResults.maxBid ? "" : "No valid Bid prices found in this range."
      });

      const validBidExists = !!nextResults.minBid || !!nextResults.maxBid;
      const validAskExists = !!nextResults.minAsk || !!nextResults.maxAsk;

      if (!validBidExists && !validAskExists) {
        setMessage("Rows were found, but all Bid and Ask values are blank in this range.");
      } else if (!validBidExists) {
        setMessage("Rows were found, but no valid Bid prices exist in this range.");
      } else if (!validAskExists) {
        setMessage("Rows were found, but no valid Ask prices exist in this range.");
      } else {
        setMessage(`Analysis complete. Found ${rowsInRange.length.toLocaleString()} rows in the selected range.`);
      }

      setIsAnalyzing(false);
    }, 120);
  }

  function showOnTable(type) {
    const targetRow = results[type];

    if (!targetRow) {
      setMessage("No matching result row is available to show in the table.");
      return;
    }

    const fullIndex = filteredRows.findIndex((row) => sameRow(row, targetRow));

    if (fullIndex === -1) {
      setMessage("Matching row could not be found in the filtered table data.");
      return;
    }

    const newStartIndex = Math.max(fullIndex - 100, 0);
    const newVisibleCount = 220;

    setIsJumpingToRow(true);
    setMessage("Please wait while it loads the matching row...");
    setTableStartIndex(newStartIndex);
    setVisibleRowCount(newVisibleCount);
    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveFocusType("");

    setTimeout(() => {
      setActiveFocusType(type);
    }, 250);

    setTimeout(() => {
      setIsJumpingToRow(false);
      setMessage("Matching row loaded successfully.");
    }, 900);
  }

  const previewRows = useMemo(
    () => filteredRows.slice(tableStartIndex, tableStartIndex + visibleRowCount),
    [filteredRows, tableStartIndex, visibleRowCount]
  );

  const focusTargets = useMemo(() => {
    const map = { minBid: [], maxAsk: [], minAsk: [], maxBid: [] };

    previewRows.forEach((row, index) => {
      const fullIndex = tableStartIndex + index;
      if (sameRow(row, results.minBid)) map.minBid.push(getRowKey(row, fullIndex));
      if (sameRow(row, results.maxAsk)) map.maxAsk.push(getRowKey(row, fullIndex));
      if (sameRow(row, results.minAsk)) map.minAsk.push(getRowKey(row, fullIndex));
      if (sameRow(row, results.maxBid)) map.maxBid.push(getRowKey(row, fullIndex));
    });

    return map;
  }, [previewRows, results, tableStartIndex]);

  useEffect(() => {
    if (!activeFocusType) return;

    const targetKeys = focusTargets[activeFocusType] || [];
    if (!targetKeys.length) return;

    const firstTarget = rowRefs.current[targetKeys[0]];
    if (!firstTarget) return;

    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    setTimeout(() => {
      firstTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  }, [activeFocusType, focusTargets]);

  function isHighlighted(row, index) {
    const key = getRowKey(row, tableStartIndex + index);
    if (!activeFocusType) return "";

    const config = RESULT_CONFIG.find((item) => item.key === activeFocusType);
    if (config && focusTargets[activeFocusType]?.includes(key)) return config.highlightClass;
    return "";
  }

  function getRowTags(row) {
    const tags = RESULT_CONFIG.filter((config) => sameRow(row, results[config.key])).map((config) => (
      <span key={config.key} className={`pillTag ${config.pillClass}`}>{config.shortLabel}</span>
    ));

    if (!tags.length) return null;
    return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tags}</div>;
  }

  return (
    <>
      <section className="splitHero">
        <div className="card">
          <h2>Upload Tick File</h2>
          <div className="uploadBox">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.htm,.html,.log,.dat,text/csv,text/tab-separated-values,text/plain,text/html"
              onChange={handleFileUpload}
            />
            <div className="uploadMeta"><strong>Selected file:</strong> {fileName || "No file selected"}</div>

            <div className="statRow">
              <div className="statMini">
                <div className="statMiniLabel">Detected Start Date</div>
                <div className="statMiniValue">{startDate || "-"}</div>
              </div>
              <div className="statMini">
                <div className="statMiniLabel">Detected End Date</div>
                <div className="statMiniValue">{endDate || "-"}</div>
              </div>
              <div className="statMini">
                <div className="statMiniLabel">Loaded Rows</div>
                <div className="statMiniValue">{formatCount(loadedRowCount)}</div>
              </div>
              <div className="statMini">
                <div className="statMiniLabel">Detected Format</div>
                <div className="statMiniValue">{detectedFormat}</div>
              </div>
            </div>

            <div className={`uploadMeta ${message.includes("complete") || message.includes("loaded") || message.includes("Ready") || message.includes("Analysis") ? "success" : ""}`}>
              {message || "Upload a CSV, TSV, TXT, HTM, or HTML tick export to begin."}
            </div>

            <div className="note">
              This original single-instrument tool is preserved. Blank Bid or Ask values are ignored during calculations, and decimal precision is displayed exactly as uploaded.
            </div>
          </div>
        </div>

        <HeroChart />
      </section>

      <section className="card">
        <h2>Select Time Range</h2>
        <div className="sectionHint">Type time in 24-hour format. Tab moves from hours to minutes to seconds to milliseconds.</div>

        <div className="grid2">
          <div className="field">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <TimeSegmentInput label="Start Time (24h)" parts={startParts} setParts={setStartParts} refsPrefix="start time" />
          <div className="field">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <TimeSegmentInput label="End Time (24h)" parts={endParts} setParts={setEndParts} refsPrefix="end time" />
        </div>

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="primaryBtn" onClick={handleAnalyze} disabled={isAnalyzing}>{isAnalyzing ? "Analyzing..." : "Analyze Ticks"}</button>
          <button className="secondaryBtn" onClick={resetAll} disabled={isAnalyzing}>Reset</button>
        </div>
      </section>

      <section className="card">
        <h2>Analysis Results</h2>
        <div className="sectionHint">Click any Show on Table button to jump to the exact matching row. All matching rows stay highlighted.</div>
        <div className="resultGrid">
          {RESULT_CONFIG.map((config) => (
            <ResultCard
              key={config.key}
              type={config.key}
              row={results[config.key]}
              note={resultNotes[config.key]}
              onShow={() => showOnTable(config.key)}
            />
          ))}
        </div>
      </section>

      <section className="card" ref={tableSectionRef}>
        <h2>Filtered Tick Data</h2>
        <div className="tableTopBar">
          <div className="tableCount">Showing {formatCount(previewRows.length)} rows from {formatCount(filteredRows.length)} total filtered rows</div>
          <div className="tableStatus">Showing: Selected Range</div>
        </div>

        {!previewRows.length ? (
          <div className="emptyState">No filtered rows to show yet.</div>
        ) : (
          <>
            <div className="tableWrap" style={{ maxHeight: "520px", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "170px" }}>Marker</th>
                    <th>Date &amp; Time</th>
                    <th>Bid Price</th>
                    <th>Ask Price</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => {
                    const fullIndex = tableStartIndex + index;
                    const key = getRowKey(row, fullIndex);
                    return (
                      <tr
                        key={key}
                        ref={(el) => {
                          if (el) rowRefs.current[key] = el;
                        }}
                        className={isHighlighted(row, index)}
                      >
                        <td>{getRowTags(row)}</td>
                        <td>{formatDateTime(row.parsedDate)}</td>
                        <td>{row.bidRaw === null ? "" : formatPrice(row.bidRaw)}</td>
                        <td>{row.askRaw === null ? "" : formatPrice(row.askRaw)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {tableStartIndex + visibleRowCount < filteredRows.length && (
                <button className="secondaryBtn" onClick={() => setVisibleRowCount((prev) => Math.min(prev + 250, filteredRows.length - tableStartIndex))}>Show More</button>
              )}
              {(visibleRowCount > 120 || tableStartIndex > 0) && (
                <button className="secondaryBtn" onClick={() => { setTableStartIndex(0); setVisibleRowCount(120); }}>Show Less</button>
              )}
            </div>

            <div className="proTip"><strong>PRO TIP</strong>The table stays compact. Use Show More only if you want to inspect extra rows.</div>
          </>
        )}
      </section>

      {isJumpingToRow && <LoadingOverlay text="The matching row is being located and highlighted in the table." />}
    </>
  );
}

function LoadingOverlay({ text }) {
  return (
    <div className="loadingOverlay">
      <div className="loadingCard">
        <div className="loadingSpinner" />
        <div className="loadingTitle">Please wait while it loads...</div>
        <div className="loadingText">{text}</div>
      </div>
    </div>
  );
}

function MultiInstrumentAnalysis() {
  const [instruments, setInstruments] = useState([]);
  const [primaryInstrumentId, setPrimaryInstrumentId] = useState("");
  const [multiStartDate, setMultiStartDate] = useState("");
  const [multiEndDate, setMultiEndDate] = useState("");
  const [multiStartParts, setMultiStartParts] = useState({ hh: "00", mm: "00", ss: "00", ms: "000" });
  const [multiEndParts, setMultiEndParts] = useState({ hh: "23", mm: "59", ss: "59", ms: "999" });
  const [multiMessage, setMultiMessage] = useState("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [primaryResults, setPrimaryResults] = useState({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
  const [primaryResultNotes, setPrimaryResultNotes] = useState({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
  const [comparisonSections, setComparisonSections] = useState([]);
  const [activeTableInstrumentId, setActiveTableInstrumentId] = useState("");
  const [activeMultiFocus, setActiveMultiFocus] = useState(null);
  const [tableStartIndex, setTableStartIndex] = useState(0);
  const [visibleRowCount, setVisibleRowCount] = useState(120);
  const [isJumpingToRow, setIsJumpingToRow] = useState(false);

  const tableSectionRef = useRef(null);
  const multiRowRefs = useRef({});

  const loadedInstruments = useMemo(() => instruments.filter((instrument) => instrument.rows.length), [instruments]);
  const primaryInstrument = useMemo(
    () => instruments.find((instrument) => instrument.id === primaryInstrumentId) || null,
    [instruments, primaryInstrumentId]
  );
  const activeTableInstrument = useMemo(
    () => instruments.find((instrument) => instrument.id === activeTableInstrumentId) || null,
    [instruments, activeTableInstrumentId]
  );

  useEffect(() => {
    if (!primaryInstrument) return;
    const { firstDate, lastDate } = getInstrumentRange(primaryInstrument);
    setMultiStartDate(formatDateOnly(firstDate));
    setMultiEndDate(formatDateOnly(lastDate));
    setMultiStartParts({ hh: "00", mm: "00", ss: "00", ms: "000" });
    setMultiEndParts({ hh: "23", mm: "59", ss: "59", ms: "999" });
    setPrimaryResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
    setPrimaryResultNotes({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
    setComparisonSections([]);
    setActiveMultiFocus(null);
    setTableStartIndex(0);
    setVisibleRowCount(120);
  }, [primaryInstrumentId]);

  async function handleMultiUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setIsLoadingFiles(true);
    setMultiMessage(`Reading ${files.length} file${files.length === 1 ? "" : "s"}...`);
    setPrimaryResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
    setPrimaryResultNotes({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
    setComparisonSections([]);
    setActiveMultiFocus(null);

    try {
      const uploadedInstruments = [];
      const existingNames = new Set(instruments.map((instrument) => normalizeInstrumentName(instrument.name)));

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const rawText = await readFileAsSmartText(file);
        const parsed = parseSmartTickText(rawText, file.name);
        const detectedName = makeUniqueInstrumentName(extractInstrumentName(file.name, rawText), existingNames);
        existingNames.add(detectedName);

        const { firstDate, lastDate } = getInstrumentRange({ rows: parsed.rows });

        uploadedInstruments.push({
          id: `${detectedName}-${Date.now()}-${index}-${file.name}`,
          name: detectedName,
          originalName: detectedName,
          fileName: file.name,
          formatLabel: parsed.formatLabel,
          rows: parsed.rows,
          rowCount: parsed.rows.length,
          firstDate,
          lastDate,
          status: parsed.rows.length ? "Ready" : "No valid tick rows found"
        });
      }

      const combinedInstruments = [...instruments, ...uploadedInstruments];
      setInstruments(combinedInstruments);

      const currentPrimaryStillExists = primaryInstrumentId && combinedInstruments.some((instrument) => instrument.id === primaryInstrumentId);
      const currentTableStillExists = activeTableInstrumentId && combinedInstruments.some((instrument) => instrument.id === activeTableInstrumentId);
      const firstReady = combinedInstruments.find((instrument) => instrument.rows.length);

      if (!currentPrimaryStillExists) {
        setPrimaryInstrumentId(firstReady?.id || "");
      }

      if (!currentTableStillExists) {
        setActiveTableInstrumentId(firstReady?.id || "");
      }

      setTableStartIndex(0);
      setVisibleRowCount(120);

      const loadedCount = combinedInstruments.filter((instrument) => instrument.rows.length).length;
      const addedCount = uploadedInstruments.filter((instrument) => instrument.rows.length).length;
      const totalRows = combinedInstruments.reduce((sum, instrument) => sum + instrument.rowCount, 0);
      setMultiMessage(`${addedCount} new instrument${addedCount === 1 ? "" : "s"} added. ${loadedCount} total instrument${loadedCount === 1 ? "" : "s"} loaded with ${formatCount(totalRows)} total rows. Select a primary instrument and analyze.`);
    } catch (error) {
      console.error(error);
      setMultiMessage("Could not read one or more files. Please upload text-based CSV, TSV, TXT, HTM, or HTML tick exports.");
    } finally {
      setIsLoadingFiles(false);
      event.target.value = "";
    }
  }

  function updateInstrumentName(id, name) {
    const safeName = normalizeInstrumentName(name) || name.toUpperCase();
    setInstruments((prev) => prev.map((instrument) => (instrument.id === id ? { ...instrument, name: safeName } : instrument)));
  }

  function resetMulti() {
    setInstruments([]);
    setPrimaryInstrumentId("");
    setMultiStartDate("");
    setMultiEndDate("");
    setMultiStartParts({ hh: "00", mm: "00", ss: "00", ms: "000" });
    setMultiEndParts({ hh: "23", mm: "59", ss: "59", ms: "999" });
    setMultiMessage("");
    setIsLoadingFiles(false);
    setIsAnalyzing(false);
    setPrimaryResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
    setPrimaryResultNotes({ minBid: "", maxAsk: "", minAsk: "", maxBid: "" });
    setComparisonSections([]);
    setActiveTableInstrumentId("");
    setActiveMultiFocus(null);
    setTableStartIndex(0);
    setVisibleRowCount(120);
    multiRowRefs.current = {};
  }

  function handleMultiAnalyze() {
    if (!loadedInstruments.length) {
      setMultiMessage("Please upload at least one valid tick file first.");
      return;
    }

    if (!primaryInstrument?.rows?.length) {
      setMultiMessage("Please select a valid primary instrument first.");
      return;
    }

    setIsAnalyzing(true);
    setMultiMessage("Analyzing the primary instrument and comparing previous ticks across all uploaded instruments...");
    setActiveMultiFocus(null);

    setTimeout(() => {
      const start = buildDateTimeFromParts(multiStartDate, multiStartParts);
      const end = buildDateTimeFromParts(multiEndDate, multiEndParts);

      if (!start || !end) {
        setMultiMessage("Please complete the date and time inputs in full.");
        setIsAnalyzing(false);
        return;
      }

      if (start > end) {
        setMultiMessage("Start date/time cannot be later than end date/time.");
        setIsAnalyzing(false);
        return;
      }

      const primaryRowsInRange = primaryInstrument.rows.filter((row) => row.parsedDate >= start && row.parsedDate <= end);

      if (!primaryRowsInRange.length) {
        setPrimaryResults({ minBid: null, maxAsk: null, minAsk: null, maxBid: null });
        setPrimaryResultNotes({
          minBid: "No primary rows found in the selected range.",
          maxAsk: "No primary rows found in the selected range.",
          minAsk: "No primary rows found in the selected range.",
          maxBid: "No primary rows found in the selected range."
        });
        setComparisonSections([]);
        setMultiMessage(`No ${primaryInstrument.name} rows found in this selected range.`);
        setIsAnalyzing(false);
        return;
      }

      const nextResults = buildPrimaryResults(primaryRowsInRange);
      const nextNotes = {
        minBid: nextResults.minBid ? "" : "No valid primary Bid prices found in this range.",
        maxAsk: nextResults.maxAsk ? "" : "No valid primary Ask prices found in this range.",
        minAsk: nextResults.minAsk ? "" : "No valid primary Ask prices found in this range.",
        maxBid: nextResults.maxBid ? "" : "No valid primary Bid prices found in this range."
      };

      const nextComparisonSections = RESULT_CONFIG.map((config) => {
        const primaryRow = nextResults[config.key];
        if (!primaryRow) {
          return {
            eventKey: config.key,
            eventLabel: `${primaryInstrument.name} ${config.shortLabel}`,
            primaryInstrumentName: primaryInstrument.name,
            primaryRow: null,
            rows: []
          };
        }

        const comparisonRows = loadedInstruments.map((instrument) => {
          if (instrument.id === primaryInstrument.id) {
            return {
              instrumentId: instrument.id,
              instrumentName: instrument.name,
              fileName: instrument.fileName,
              matchedRow: primaryRow,
              matchType: "exact",
              differenceMs: 0,
              targetTime: primaryRow.parsedDate
            };
          }

          const match = findPreviousOrExactRow(instrument.rows, primaryRow.parsedDate);
          return {
            instrumentId: instrument.id,
            instrumentName: instrument.name,
            fileName: instrument.fileName,
            matchedRow: match.row,
            matchType: match.matchType,
            differenceMs: match.differenceMs,
            targetTime: primaryRow.parsedDate
          };
        });

        return {
          eventKey: config.key,
          eventLabel: `${primaryInstrument.name} ${config.shortLabel}`,
          primaryInstrumentName: primaryInstrument.name,
          primaryRow,
          rows: comparisonRows
        };
      });

      setPrimaryResults(nextResults);
      setPrimaryResultNotes(nextNotes);
      setComparisonSections(nextComparisonSections);
      setActiveTableInstrumentId(primaryInstrument.id);
      setTableStartIndex(0);
      setVisibleRowCount(120);
      setActiveMultiFocus(null);
      multiRowRefs.current = {};

      const usableResultCount = Object.values(nextResults).filter(Boolean).length;
      setMultiMessage(`Multi-instrument analysis complete. ${primaryInstrument.name} produced ${usableResultCount} primary price points from ${formatCount(primaryRowsInRange.length)} rows.`);
      setIsAnalyzing(false);
    }, 160);
  }

  function showMultiRowOnTable({ instrumentId, row, eventKey }) {
    const instrument = instruments.find((item) => item.id === instrumentId);
    if (!instrument || !row) {
      setMultiMessage("No matching row is available to show in the table.");
      return;
    }

    const fullIndex = instrument.rows.findIndex((item) => sameRow(item, row));
    if (fullIndex === -1) {
      setMultiMessage("Matching row could not be found in the selected instrument table.");
      return;
    }

    const newStartIndex = Math.max(fullIndex - 100, 0);
    setIsJumpingToRow(true);
    setMultiMessage(`Loading ${instrument.name} matching row...`);
    setActiveTableInstrumentId(instrumentId);
    setTableStartIndex(newStartIndex);
    setVisibleRowCount(220);
    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveMultiFocus(null);

    setTimeout(() => {
      setActiveMultiFocus({ instrumentId, row, eventKey });
    }, 250);

    setTimeout(() => {
      setIsJumpingToRow(false);
      setMultiMessage(`${instrument.name} matching row loaded successfully.`);
    }, 900);
  }

  const activePreviewRows = useMemo(() => {
    if (!activeTableInstrument?.rows?.length) return [];
    return activeTableInstrument.rows.slice(tableStartIndex, tableStartIndex + visibleRowCount);
  }, [activeTableInstrument, tableStartIndex, visibleRowCount]);

  const multiFocusTargets = useMemo(() => {
    if (!activeMultiFocus || activeMultiFocus.instrumentId !== activeTableInstrumentId) return [];
    return activePreviewRows
      .map((row, index) => ({ row, key: getRowKey(row, tableStartIndex + index) }))
      .filter((item) => sameRow(item.row, activeMultiFocus.row))
      .map((item) => item.key);
  }, [activeMultiFocus, activePreviewRows, tableStartIndex, activeTableInstrumentId]);

  useEffect(() => {
    if (!multiFocusTargets.length) return;
    const firstTarget = multiRowRefs.current[multiFocusTargets[0]];
    if (!firstTarget) return;

    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      firstTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  }, [multiFocusTargets]);

  function getMultiHighlight(row, index) {
    const key = getRowKey(row, tableStartIndex + index);
    if (!multiFocusTargets.includes(key)) return "";
    const config = RESULT_CONFIG.find((item) => item.key === activeMultiFocus?.eventKey);
    return config?.highlightClass || "highlightRowBlue";
  }

  function getMultiRowTags(row) {
    if (!activeTableInstrumentId || !comparisonSections.length) return null;

    const tags = [];
    comparisonSections.forEach((section) => {
      const matched = section.rows.find(
        (item) => item.instrumentId === activeTableInstrumentId && item.matchedRow && sameRow(item.matchedRow, row)
      );
      if (matched) {
        const config = RESULT_CONFIG.find((item) => item.key === section.eventKey);
        tags.push(
          <span key={`${section.eventKey}-${matched.instrumentId}`} className={`pillTag ${config?.pillClass || "pillBlue"}`}>
            {section.eventLabel}
          </span>
        );
      }
    });

    if (!tags.length) return null;
    return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tags}</div>;
  }

  return (
    <>
      <section className="card">
        <div className="cardHeaderRow">
          <div>
            <h2>Multi Instrument Tick Analysis</h2>
            <div className="sectionHint">
              Upload several tick files, choose one primary instrument, then compare all other instruments using exact timestamp first and latest previous tick when exact is unavailable.
            </div>
          </div>
          <div className="modeBadge">Previous tick matching</div>
        </div>

        <div className="uploadBox">
          <input
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.htm,.html,.log,.dat,text/csv,text/tab-separated-values,text/plain,text/html"
            onChange={handleMultiUpload}
            disabled={isLoadingFiles || isAnalyzing}
          />
          <div className={`uploadMeta ${multiMessage.includes("complete") || multiMessage.includes("loaded") || multiMessage.includes("success") ? "success" : ""}`}>
            {multiMessage || "Upload all instrument tick files together to begin."}
          </div>
          <div className="note">
            Decimal precision is preserved from the source file. Prices are only converted to numbers internally for min/max calculations.
          </div>
        </div>
      </section>

      {!!instruments.length && (
        <section className="card">
          <h2>Uploaded Instruments</h2>
          <div className="sectionHint">Instrument names are detected from the file name first. You can correct any name before analyzing.</div>
          <div className="instrumentGrid">
            {instruments.map((instrument) => (
              <div className="instrumentCard" key={instrument.id}>
                <div className="instrumentTopLine">
                  <div className="field compactField">
                    <label>Instrument</label>
                    <input value={instrument.name} onChange={(e) => updateInstrumentName(instrument.id, e.target.value)} />
                  </div>
                  <span className={`instrumentStatus ${instrument.rows.length ? "ready" : "failed"}`}>{instrument.status}</span>
                </div>
                <div className="instrumentMeta"><strong>File:</strong> {instrument.fileName}</div>
                <div className="instrumentStats">
                  <span>Rows: {formatCount(instrument.rowCount)}</span>
                  <span>Format: {instrument.formatLabel}</span>
                  <span>Start: {formatDateOnly(instrument.firstDate) || "-"}</span>
                  <span>End: {formatDateOnly(instrument.lastDate) || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Primary Instrument &amp; Time Range</h2>
        <div className="sectionHint">
          The primary instrument creates the 4 price-point timestamps. Other instruments are matched to those timestamps using the latest previous tick only.
        </div>

        <div className="grid2">
          <div className="field">
            <label>Primary Instrument</label>
            <select value={primaryInstrumentId} onChange={(e) => setPrimaryInstrumentId(e.target.value)} disabled={!loadedInstruments.length || isAnalyzing}>
              {!loadedInstruments.length && <option value="">Upload files first</option>}
              {loadedInstruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Matching Rule</label>
            <div className="lockedRuleBox">Exact timestamp first. If unavailable, use latest tick before primary timestamp.</div>
          </div>
          <div className="field">
            <label>Start Date</label>
            <input type="date" value={multiStartDate} onChange={(e) => setMultiStartDate(e.target.value)} />
          </div>
          <TimeSegmentInput label="Start Time (24h)" parts={multiStartParts} setParts={setMultiStartParts} refsPrefix="multi start time" />
          <div className="field">
            <label>End Date</label>
            <input type="date" value={multiEndDate} onChange={(e) => setMultiEndDate(e.target.value)} />
          </div>
          <TimeSegmentInput label="End Time (24h)" parts={multiEndParts} setParts={setMultiEndParts} refsPrefix="multi end time" />
        </div>

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="primaryBtn" onClick={handleMultiAnalyze} disabled={isAnalyzing || isLoadingFiles || !loadedInstruments.length}>
            {isAnalyzing ? "Analyzing..." : "Analyze Multi Instrument Ticks"}
          </button>
          <button className="secondaryBtn" onClick={resetMulti} disabled={isAnalyzing || isLoadingFiles}>Reset Multi Tool</button>
        </div>
      </section>

      <section className="card">
        <h2>{primaryInstrument?.name ? `${primaryInstrument.name} Primary Results` : "Primary Results"}</h2>
        <div className="sectionHint">These are the 4 normal price points for the selected primary instrument. Use Show on Table to inspect each row.</div>
        <div className="resultGrid">
          {RESULT_CONFIG.map((config) => (
            <ResultCard
              key={config.key}
              type={config.key}
              titlePrefix={primaryInstrument?.name ? `${primaryInstrument.name} ` : ""}
              row={primaryResults[config.key]}
              note={primaryResultNotes[config.key]}
              onShow={() => showMultiRowOnTable({ instrumentId: primaryInstrumentId, row: primaryResults[config.key], eventKey: config.key })}
            />
          ))}
        </div>
      </section>

      {!!comparisonSections.length && (
        <section className="card">
          <h2>Cross-Instrument Comparison</h2>
          <div className="sectionHint">
            Each table uses the primary instrument timestamp as the anchor. Compared instruments never use future ticks; they use exact timestamp or the latest previous tick.
          </div>

          <div className="comparisonStack">
            {comparisonSections.map((section) => {
              const config = RESULT_CONFIG.find((item) => item.key === section.eventKey);
              return (
                <div className="comparisonPanel" key={section.eventKey}>
                  <div className="comparisonHeader">
                    <div>
                      <div style={{ marginBottom: 10 }}>{tagForType(section.eventKey)}</div>
                      <h3>{section.eventLabel} Snapshot</h3>
                      {section.primaryRow ? (
                        <p>
                          Primary time: <strong>{formatDateTime(section.primaryRow.parsedDate)}</strong> | Bid: <strong>{formatPrice(section.primaryRow.bidRaw)}</strong> | Ask: <strong>{formatPrice(section.primaryRow.askRaw)}</strong>
                        </p>
                      ) : (
                        <p>No primary result found for this price point.</p>
                      )}
                    </div>
                  </div>

                  {!section.rows.length ? (
                    <div className="emptyState">No comparison rows available for this event.</div>
                  ) : (
                    <div className="tableWrap compactTableWrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Instrument</th>
                            <th>Matched Time</th>
                            <th>Bid Price</th>
                            <th>Ask Price</th>
                            <th>Difference</th>
                            <th>Match Type</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((item) => (
                            <tr key={`${section.eventKey}-${item.instrumentId}`}>
                              <td><strong>{item.instrumentName}</strong></td>
                              <td>{item.matchedRow ? formatDateTime(item.matchedRow.parsedDate) : "-"}</td>
                              <td>{item.matchedRow ? formatPrice(item.matchedRow.bidRaw) : "-"}</td>
                              <td>{item.matchedRow ? formatPrice(item.matchedRow.askRaw) : "-"}</td>
                              <td>{formatDifferenceMs(item.differenceMs)}</td>
                              <td>{matchTypeLabel(item.matchType)}</td>
                              <td>
                                <button
                                  className="miniTableBtn"
                                  onClick={() => showMultiRowOnTable({ instrumentId: item.instrumentId, row: item.matchedRow, eventKey: section.eventKey })}
                                  disabled={!item.matchedRow}
                                >
                                  Show on Table
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card" ref={tableSectionRef}>
        <div className="cardHeaderRow">
          <div>
            <h2>Instrument Tick Data Table</h2>
            <div className="sectionHint">Choose one instrument table at a time. Show on Table buttons automatically switch this table and highlight the matched row.</div>
          </div>
          <div className="field tableInstrumentSelect">
            <label>Table Instrument</label>
            <select
              value={activeTableInstrumentId}
              onChange={(e) => {
                setActiveTableInstrumentId(e.target.value);
                setTableStartIndex(0);
                setVisibleRowCount(120);
                setActiveMultiFocus(null);
              }}
              disabled={!loadedInstruments.length}
            >
              {!loadedInstruments.length && <option value="">No loaded instruments</option>}
              {loadedInstruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="tableTopBar">
          <div className="tableCount">
            Showing {formatCount(activePreviewRows.length)} rows from {formatCount(activeTableInstrument?.rows?.length || 0)} total rows
          </div>
          <div className="tableStatus">Showing: Full selected instrument data</div>
        </div>

        {!activePreviewRows.length ? (
          <div className="emptyState">No instrument rows to show yet.</div>
        ) : (
          <>
            <div className="tableWrap" style={{ maxHeight: "520px", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "210px" }}>Marker</th>
                    <th>Date &amp; Time</th>
                    <th>Bid Price</th>
                    <th>Ask Price</th>
                  </tr>
                </thead>
                <tbody>
                  {activePreviewRows.map((row, index) => {
                    const fullIndex = tableStartIndex + index;
                    const key = getRowKey(row, fullIndex);
                    return (
                      <tr
                        key={key}
                        ref={(el) => {
                          if (el) multiRowRefs.current[key] = el;
                        }}
                        className={getMultiHighlight(row, index)}
                      >
                        <td>{getMultiRowTags(row)}</td>
                        <td>{formatDateTime(row.parsedDate)}</td>
                        <td>{row.bidRaw === null ? "" : formatPrice(row.bidRaw)}</td>
                        <td>{row.askRaw === null ? "" : formatPrice(row.askRaw)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {activeTableInstrument && tableStartIndex + visibleRowCount < activeTableInstrument.rows.length && (
                <button className="secondaryBtn" onClick={() => setVisibleRowCount((prev) => Math.min(prev + 250, activeTableInstrument.rows.length - tableStartIndex))}>Show More</button>
              )}
              {(visibleRowCount > 120 || tableStartIndex > 0) && (
                <button className="secondaryBtn" onClick={() => { setTableStartIndex(0); setVisibleRowCount(120); setActiveMultiFocus(null); }}>Show Less</button>
              )}
            </div>

            <div className="proTip"><strong>PRO TIP</strong>This table shows full instrument data so previous ticks outside the primary range can still be located.</div>
          </>
        )}
      </section>

      {isJumpingToRow && <LoadingOverlay text="The selected instrument row is being located and highlighted in the table." />}
    </>
  );
}

export default function HomePage() {
  const [activeMode, setActiveMode] = useState("single");
  const [showJumpToTop, setShowJumpToTop] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShowJumpToTop(window.scrollY > 900);
    }

    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function jumpToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <main className="page">
        <section className="header">
          <div className="topBadge">Precision Trading Tool</div>
          <h1>Tick <span style={{ color: "#8b5cf6" }}>Picker</span></h1>
          <p>
            Analyze single-instrument tick files or compare several instruments from one primary timestamp anchor.
          </p>
        </section>

        <div className="appShell">
          <aside className="sidebarNav">
            <div className="sidebarTitle">Analysis Modes</div>
            <button className={`sideTab ${activeMode === "single" ? "active" : ""}`} onClick={() => setActiveMode("single")}>
              <span>Single Instrument</span>
              <small>Original Tick Picker</small>
            </button>
            <button className={`sideTab ${activeMode === "multi" ? "active" : ""}`} onClick={() => setActiveMode("multi")}>
              <span>Multi Instrument</span>
              <small>Primary timestamp comparison</small>
            </button>
            <div className="sidebarNote">
              Single mode stays unchanged. Multi mode uses exact timestamp first, then latest previous tick only.
            </div>
          </aside>

          <div className="modeContent">
            {activeMode === "single" ? <SingleInstrumentAnalysis /> : <MultiInstrumentAnalysis />}
          </div>
        </div>

        {showJumpToTop && (
          <button onClick={jumpToTop} className="jumpTopBtn">Jump to Top</button>
        )}

        <div className="footerCredit">Developed by Turza &amp; Faiyaz.</div>
      </main>
    </>
  );
}
