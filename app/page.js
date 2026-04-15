"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";

function parseTickDate(dateString) {
  if (!dateString) return null;

  const trimmed = String(dateString).trim();
  const match = trimmed.match(
    /^(\d{4})[.\-](\d{2})[.\-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const milliseconds = Number(String(fraction).padEnd(3, "0").slice(0, 3));

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds
  );
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
  const validRows = rows.filter((row) => row[field] !== null && !Number.isNaN(row[field]));
  if (!validRows.length) return null;
  return validRows.reduce((min, current) => (current[field] < min[field] ? current : min));
}

function getMaxRow(rows, field) {
  const validRows = rows.filter((row) => row[field] !== null && !Number.isNaN(row[field]));
  if (!validRows.length) return null;
  return validRows.reduce((max, current) => (current[field] > max[field] ? current : max));
}

function parseCsvText(rawText) {
  let text = rawText.replace(/^\uFEFF/, "");
  let lines = text.split(/\r?\n/);

  if (lines.length && lines[0].toLowerCase().includes("metatrader")) {
    lines = lines.slice(1);
  }

  const cleanedText = lines.join("\n");

  const result = Papa.parse(cleanedText, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true
  });

  return result.data || [];
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
const [showJumpToResults, setShowJumpToResults] = useState(false);
const [visibleRowCount, setVisibleRowCount] = useState(120);
const [tableStartIndex, setTableStartIndex] = useState(0);
const [isJumpingToRow, setIsJumpingToRow] = useState(false);

const resultsSectionRef = useRef(null);
const tableSectionRef = useRef(null);
const tableContainerRef = useRef(null);
const rowRefs = useRef({});

  function resetAll() {
    setFileName("");
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
      setMessage("");
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
setFileName(file.name);

      const rawText = await file.text();
      const rows = parseCsvText(rawText);

      if (!rows.length) {
        setMessage("This CSV looks empty.");
        return;
      }

      const parsedRows = rows
        .filter((row) => row.Date || row.Bid || row.Ask)
        .map((row) => {
          const parsedDate = parseTickDate(row.Date);

          const bidRaw =
            row.Bid === "" || row.Bid === undefined || row.Bid === null
              ? null
              : String(row.Bid).trim();

          const askRaw =
            row.Ask === "" || row.Ask === undefined || row.Ask === null
              ? null
              : String(row.Ask).trim();

          const bid = bidRaw === null ? null : Number(bidRaw);
          const ask = askRaw === null ? null : Number(askRaw);

          return {
            rawDate: row.Date ?? "",
            parsedDate,
            bid,
            ask,
            bidRaw,
            askRaw
          };
        })
        .filter((row) => row.parsedDate !== null);

      if (!parsedRows.length) {
        setMessage("No valid tick rows were found.");
        return;
      }

      parsedRows.sort((a, b) => a.parsedDate - b.parsedDate);

      const firstDate = parsedRows[0].parsedDate;
      const lastDate = parsedRows[parsedRows.length - 1].parsedDate;

      setAllRows(parsedRows);
      setLoadedRowCount(parsedRows.length);
      setStartDate(formatDateOnly(firstDate));
      setEndDate(formatDateOnly(lastDate));
      setStartParts({ hh: "00", mm: "00", ss: "00", ms: "000" });
      setEndParts({ hh: "23", mm: "59", ss: "59", ms: "999" });
      setMessage("File loaded successfully. Ready for analysis.");
    } catch {
      setMessage("Could not read this CSV file.");
    }
  }

  function handleAnalyze() {
    if (!allRows.length) {
      setMessage("Please upload a CSV first.");
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
    setShowJumpToResults(window.scrollY > 900);
  }

  onScroll();
  window.addEventListener("scroll", onScroll);
  return () => window.removeEventListener("scroll", onScroll);
}, []);

  function jumpToResults() {
    resultsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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
          Upload a tick CSV, select a time range, and instantly discover the key Bid and Ask
          levels that matter.
        </p>
      </section>

      <section className="splitHero">
        <div className="card">
          <h2>Upload CSV</h2>
          <div className="uploadBox">
            <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
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
              {message || "Upload a CSV to begin."}
            </div>

            <div className="note">
              Blank Bid or Ask values are ignored automatically during calculations.
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
          Click any “Show on Table” button to jump to the exact matching row. All matching rows stay highlighted.
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
      {showJumpToResults && (
        <button
          onClick={jumpToResults}
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
          Jump to Results
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
