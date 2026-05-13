"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

const HTML_TAG_PATTERN = /<\/?(?:html|head|body|div|table|thead|tbody|tfoot|tr|td|th|style|meta|title|br|p|span|font|a|b|i|strong|em)\b[^>]*>/gi;

function cleanText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/&nbsp;/gi, " ")
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
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!/<\s*tr[\s>]/i.test(line)) continue;

    sourceRow += 1;
    const cells = extractHtmlCells(line);
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
  return `${row.rawDate}-${row.bid ?? "blankBid"}-${row.ask ?? "blankAsk"}-${index}`;
}

function sameRow(a, b) {
  if (!a || !b) return false;
  return a.rawDate === b.rawDate && a.bid === b.bid && a.ask === b.ask;
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

export default function HomePage() {
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

  const [results, setResults] = useState({
    minBid: null,
    maxAsk: null,
    minAsk: null,
    maxBid: null
  });

  const [resultNotes, setResultNotes] = useState({
    minBid: "",
    maxAsk: "",
    minAsk: "",
    maxBid: ""
  });

const [loadedRowCount, setLoadedRowCount] = useState(0);
const [activeFocusType, setActiveFocusType] = useState("");
const [showJumpToTop, setShowJumpToTop] = useState(false);
const [visibleRowCount, setVisibleRowCount] = useState(120);
const [tableStartIndex, setTableStartIndex] = useState(0);
const [isJumpingToRow, setIsJumpingToRow] = useState(false);

const resultsSectionRef = useRef(null);
const tableSectionRef = useRef(null);
const tableContainerRef = useRef(null);
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
    setResults({
      minBid: null,
      maxAsk: null,
      minAsk: null,
      maxBid: null
    });
    setResultNotes({
      minBid: "",
      maxAsk: "",
      minAsk: "",
      maxBid: ""
    });
    rowRefs.current = {};
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setMessage("Reading and detecting tick file format...");
      setActiveFocusType("");
      setIsAnalyzing(false);
      setResults({
        minBid: null,
        maxAsk: null,
        minAsk: null,
        maxBid: null
      });
      setResultNotes({
        minBid: "",
        maxAsk: "",
        minAsk: "",
        maxBid: ""
      });
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

      const rowsInRange = allRows.filter(
        (row) => row.parsedDate >= start && row.parsedDate <= end
      );

      if (!rowsInRange.length) {
        setFilteredRows([]);
        setResults({
          minBid: null,
          maxAsk: null,
          minAsk: null,
          maxBid: null
        });
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

      const minBidRow = getMinRow(rowsInRange, "bid");
      const maxAskRow = getMaxRow(rowsInRange, "ask");
      const minAskRow = getMinRow(rowsInRange, "ask");
      const maxBidRow = getMaxRow(rowsInRange, "bid");

setVisibleRowCount(120);
setTableStartIndex(0);
rowRefs.current = {};

      setFilteredRows(rowsInRange);
      setResults({
        minBid: minBidRow,
        maxAsk: maxAskRow,
        minAsk: minAskRow,
        maxBid: maxBidRow
      });

      setResultNotes({
        minBid: minBidRow ? "" : "No valid Bid prices found in this range.",
        maxAsk: maxAskRow ? "" : "No valid Ask prices found in this range.",
        minAsk: minAskRow ? "" : "No valid Ask prices found in this range.",
        maxBid: maxBidRow ? "" : "No valid Bid prices found in this range."
      });

      const validBidExists = !!minBidRow || !!maxBidRow;
      const validAskExists = !!minAskRow || !!maxAskRow;

      if (!validBidExists && !validAskExists) {
        setMessage("Rows were found, but all Bid and Ask values are blank in this range.");
      } else if (!validBidExists) {
        setMessage("Rows were found, but no valid Bid prices exist in this range.");
      } else if (!validAskExists) {
        setMessage("Rows were found, but no valid Ask prices exist in this range.");
      } else {
        setMessage(`Analysis complete. Found ${rowsInRange.length} rows in the selected range.`);
      }

      setIsAnalyzing(false);
    }, 120);
  }

function showOnTable(type) {
  const targetMap = {
    minBid: results.minBid,
    maxAsk: results.maxAsk,
    minAsk: results.minAsk,
    maxBid: results.maxBid
  };

  const targetRow = targetMap[type];

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

  tableSectionRef.current?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

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
  const map = {
    minBid: [],
    maxAsk: [],
    minAsk: [],
    maxBid: []
  };

  previewRows.forEach((row, index) => {
    if (sameRow(row, results.minBid)) map.minBid.push(getRowKey(row, index));
    if (sameRow(row, results.maxAsk)) map.maxAsk.push(getRowKey(row, index));
    if (sameRow(row, results.minAsk)) map.minAsk.push(getRowKey(row, index));
    if (sameRow(row, results.maxBid)) map.maxBid.push(getRowKey(row, index));
  });

  return map;
}, [previewRows, results]);

useEffect(() => {
  if (!activeFocusType) return;

  const targetKeys = focusTargets[activeFocusType] || [];
  if (!targetKeys.length) return;

  const firstTarget = rowRefs.current[targetKeys[0]];
  if (!firstTarget) return;

  tableSectionRef.current?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  setTimeout(() => {
    firstTarget.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, 250);
}, [activeFocusType, focusTargets]);

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

  function isHighlighted(row, index) {
    const key = getRowKey(row, index);
    if (!activeFocusType) return "";

    if (activeFocusType === "minBid" && focusTargets.minBid.includes(key)) return "highlightRowBlue";
    if (activeFocusType === "maxAsk" && focusTargets.maxAsk.includes(key)) return "highlightRowPink";
    if (activeFocusType === "minAsk" && focusTargets.minAsk.includes(key)) return "highlightRowGreen";
    if (activeFocusType === "maxBid" && focusTargets.maxBid.includes(key)) return "highlightRowYellow";
    return "";
  }

  function tagForType(type) {
    if (type === "minBid") return <span className="pillTag pillBlue">Min Bid</span>;
    if (type === "maxAsk") return <span className="pillTag pillPink">Max Ask</span>;
    if (type === "minAsk") return <span className="pillTag pillGreen">Min Ask</span>;
    if (type === "maxBid") return <span className="pillTag pillYellow">Max Bid</span>;
    return null;
  }

  function getRowTags(row) {
    const tags = [];

    if (sameRow(row, results.minBid)) tags.push(<span key="minBid" className="pillTag pillBlue">Min Bid</span>);
    if (sameRow(row, results.maxAsk)) tags.push(<span key="maxAsk" className="pillTag pillPink">Max Ask</span>);
    if (sameRow(row, results.minAsk)) tags.push(<span key="minAsk" className="pillTag pillGreen">Min Ask</span>);
    if (sameRow(row, results.maxBid)) tags.push(<span key="maxBid" className="pillTag pillYellow">Max Bid</span>);

    if (!tags.length) return null;

    return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tags}</div>;
  }

  function renderResultSubtext(type) {
    const note = resultNotes[type];
    if (note) {
      return (
        <div className="resultTime" style={{ color: "#fca5a5" }}>
          {note}
        </div>
      );
    }

    if (type === "minBid" && results.minBid) {
      return <div className="resultTime">{formatDateTime(results.minBid.parsedDate)}</div>;
    }

    if (type === "maxAsk" && results.maxAsk) {
      return <div className="resultTime">{formatDateTime(results.maxAsk.parsedDate)}</div>;
    }

    if (type === "minAsk" && results.minAsk) {
      return <div className="resultTime">{formatDateTime(results.minAsk.parsedDate)}</div>;
    }

    if (type === "maxBid" && results.maxBid) {
      return <div className="resultTime">{formatDateTime(results.maxBid.parsedDate)}</div>;
    }

    return <div className="resultTime">No result available.</div>;
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
        <h1>
          Tick <span style={{ color: "#8b5cf6" }}>Picker</span>
        </h1>
        <p>
          Upload a tick export, select a time range, and instantly discover the key Bid and Ask
          levels that matter.
        </p>
      </section>

      <section className="splitHero">
        <div className="card">
          <h2>Upload Tick File</h2>
          <div className="uploadBox">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.htm,.html,.log,.dat,text/csv,text/tab-separated-values,text/plain,text/html"
              onChange={handleFileUpload}
            />
            <div className="uploadMeta">
              <strong>Selected file:</strong> {fileName || "No file selected"}
            </div>

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
                <div className="statMiniValue">{loadedRowCount || 0}</div>
              </div>

              <div className="statMini">
                <div className="statMiniLabel">Detected Format</div>
                <div className="statMiniValue">{detectedFormat}</div>
              </div>
            </div>

            <div
              className={`uploadMeta ${
                message.includes("complete") ||
                message.includes("loaded") ||
                message.includes("Ready") ||
                message.includes("Analysis")
                  ? "success"
                  : ""
              }`}
            >
              {message || "Upload a CSV, TSV, TXT, HTM, or HTML tick export to begin."}
            </div>

            <div className="note">
              The app now auto-detects common tick exports with Date/Time, Bid, and Ask columns. Blank Bid or Ask values are ignored during calculations.
            </div>
          </div>
        </div>

        <HeroChart />
      </section>

      <section className="card">
        <h2>Select Time Range</h2>
        <div className="sectionHint">
          Type time in 24-hour format. Tab moves from hours to minutes to seconds to milliseconds.
        </div>

        <div className="grid2">
          <div className="field">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <TimeSegmentInput
            label="Start Time (24h)"
            parts={startParts}
            setParts={setStartParts}
            refsPrefix="start time"
          />

          <div className="field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <TimeSegmentInput
            label="End Time (24h)"
            parts={endParts}
            setParts={setEndParts}
            refsPrefix="end time"
          />
        </div>

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="primaryBtn" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? "Analyzing..." : "Analyze Ticks"}
          </button>
          <button className="secondaryBtn" onClick={resetAll} disabled={isAnalyzing}>
            Reset
          </button>
        </div>
      </section>

      <section className="card" ref={resultsSectionRef}>
        <h2>Analysis Results</h2>
        <div className="sectionHint">
          Click any Show on Table button to jump to the exact matching row. All matching rows stay highlighted.
        </div>

        <div className="resultGrid">
          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>{tagForType("minBid")}</div>
            <h3>Minimum Bid Price</h3>
            <div className="resultValue">{formatPrice(results.minBid?.bidRaw)}</div>
            {renderResultSubtext("minBid")}
            <button
              className="resultActionBtn"
              onClick={() => showOnTable("minBid")}
              disabled={!results.minBid}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>{tagForType("maxAsk")}</div>
            <h3>Maximum Ask Price</h3>
            <div className="resultValue">{formatPrice(results.maxAsk?.askRaw)}</div>
            {renderResultSubtext("maxAsk")}
            <button
              className="resultActionBtn"
              onClick={() => showOnTable("maxAsk")}
              disabled={!results.maxAsk}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>{tagForType("minAsk")}</div>
            <h3>Minimum Ask Price</h3>
<div className="resultValue">{formatPrice(results.minAsk?.askRaw)}</div>
            {renderResultSubtext("minAsk")}
            <button
              className="resultActionBtn"
              onClick={() => showOnTable("minAsk")}
              disabled={!results.minAsk}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>{tagForType("maxBid")}</div>
            <h3>Maximum Bid Price</h3>
<div className="resultValue">{formatPrice(results.maxBid?.bidRaw)}</div>
            {renderResultSubtext("maxBid")}
            <button
              className="resultActionBtn"
              onClick={() => showOnTable("maxBid")}
              disabled={!results.maxBid}
            >
              Show on Table
            </button>
          </div>
        </div>
      </section>

   <section className="card" ref={tableSectionRef}>
  <h2>Filtered Tick Data</h2>

  <div className="tableTopBar">
    <div className="tableCount">
Showing {previewRows.length.toLocaleString()} rows from {filteredRows.length.toLocaleString()} total filtered rows
    </div>
    <div className="tableStatus">Showing: Selected Range</div>
  </div>

  {!previewRows.length ? (
    <div className="emptyState">No filtered rows to show yet.</div>
  ) : (
    <>
      <div
        ref={tableContainerRef}
        className="tableWrap"
        style={{ maxHeight: "520px", overflowY: "auto" }}
      >
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
              const key = getRowKey(row, index);

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
    <button
      className="secondaryBtn"
      onClick={() =>
        setVisibleRowCount((prev) =>
          Math.min(prev + 250, filteredRows.length - tableStartIndex)
        )
      }
    >
      Show More
    </button>
  )}

  {(visibleRowCount > 120 || tableStartIndex > 0) && (
    <button
      className="secondaryBtn"
      onClick={() => {
        setTableStartIndex(0);
        setVisibleRowCount(120);
      }}
    >
      Show Less
    </button>
  )}
</div>

      <div className="proTip">
        <strong>PRO TIP</strong>
        The table now stays compact. Use “Show More” only if you want to inspect extra rows.
      </div>
    </>
  )}
</section>
{isJumpingToRow && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 1200,
      background: "rgba(3, 6, 20, 0.45)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    }}
  >
    <div
      style={{
        width: "min(460px, 100%)",
        borderRadius: 24,
        border: "1px solid rgba(139, 92, 246, 0.28)",
        background:
          "linear-gradient(180deg, rgba(11, 18, 41, 0.96), rgba(7, 13, 31, 0.96))",
        boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
        padding: "26px 24px",
        textAlign: "center"
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          margin: "0 auto 16px",
          borderRadius: "999px",
          border: "3px solid rgba(124, 58, 237, 0.22)",
          borderTopColor: "#d946ef",
          borderRightColor: "#4f46e5",
          animation: "spin 1s linear infinite"
        }}
      />
      <div
        style={{
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 8
        }}
      >
        Please wait while it loads...
      </div>
      <div
        style={{
          color: "#a5b4df",
          fontSize: 14,
          lineHeight: 1.6
        }}
      >
        The matching row is being located and highlighted in the table.
      </div>
    </div>
  </div>
)}
      {showJumpToTop && (
        <button
          onClick={jumpToTop}
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 1000,
            height: 48,
            padding: "0 18px",
            borderRadius: 999,
            border: "1px solid rgba(139, 92, 246, 0.35)",
            background: "linear-gradient(135deg, #4f46e5, #7c3aed 45%, #d946ef)",
            color: "#fff",
            fontWeight: 800,
            boxShadow: "0 12px 30px rgba(124, 58, 237, 0.35)"
          }}
        >
          Jump to Top
        </button>
      )}

      <div
        style={{
          marginTop: 28,
          paddingTop: 8,
          textAlign: "center",
          color: "#8ea0d6",
          fontSize: 13,
          letterSpacing: "0.02em"
        }}
      >
        Developed by Turza &amp; Faiyaz.
      </div>
    </main>
  </>
  );
}
