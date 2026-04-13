"use client";

import { useMemo, useRef, useState } from "react";
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
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(2);
}

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  return new Date(`${dateValue}T${timeValue}`);
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

export default function HomePage() {
  const [fileName, setFileName] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [filteredRows, setFilteredRows] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("23:59:59");
  const [message, setMessage] = useState("");

  const [results, setResults] = useState({
    minBid: null,
    maxAsk: null,
    minAsk: null,
    maxBid: null
  });

  const [highlightedKey, setHighlightedKey] = useState("");
  const [highlightType, setHighlightType] = useState("");
  const [loadedRowCount, setLoadedRowCount] = useState(0);

  const tableSectionRef = useRef(null);

  function resetAll() {
    setFileName("");
    setAllRows([]);
    setFilteredRows([]);
    setStartDate("");
    setEndDate("");
    setStartTime("00:00:00");
    setEndTime("23:59:59");
    setMessage("");
    setHighlightedKey("");
    setHighlightType("");
    setLoadedRowCount(0);
    setResults({
      minBid: null,
      maxAsk: null,
      minAsk: null,
      maxBid: null
    });
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setMessage("");
      setHighlightedKey("");
      setHighlightType("");
      setResults({
        minBid: null,
        maxAsk: null,
        minAsk: null,
        maxBid: null
      });
      setFilteredRows([]);
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
          const bid =
            row.Bid === "" || row.Bid === undefined || row.Bid === null
              ? null
              : Number(row.Bid);
          const ask =
            row.Ask === "" || row.Ask === undefined || row.Ask === null
              ? null
              : Number(row.Ask);

          return {
            rawDate: row.Date ?? "",
            parsedDate,
            bid,
            ask
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
      setStartTime("00:00:00");
      setEndTime("23:59:59");
      setMessage(`File loaded successfully. Ready for analysis.`);
    } catch {
      setMessage("Could not read this CSV file.");
    }
  }

  function handleAnalyze() {
    if (!allRows.length) {
      setMessage("Please upload a CSV first.");
      return;
    }

    const start = combineDateAndTime(startDate, startTime);
    const end = combineDateAndTime(endDate, endTime);

    if (!start || !end) {
      setMessage("Please enter a valid start date, start time, end date, and end time.");
      return;
    }

    if (start > end) {
      setMessage("Start date/time cannot be later than end date/time.");
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
      setHighlightedKey("");
      setHighlightType("");
      setMessage("No rows found in this selected range.");
      return;
    }

    const minBidRow = getMinRow(rowsInRange, "bid");
    const maxAskRow = getMaxRow(rowsInRange, "ask");
    const minAskRow = getMinRow(rowsInRange, "ask");
    const maxBidRow = getMaxRow(rowsInRange, "bid");

    setFilteredRows(rowsInRange);
    setResults({
      minBid: minBidRow,
      maxAsk: maxAskRow,
      minAsk: minAskRow,
      maxBid: maxBidRow
    });
    setHighlightedKey("");
    setHighlightType("");
    setMessage(`Analysis complete. Found ${rowsInRange.length} rows in the selected range.`);
  }

  function showOnTable(targetRow, type) {
    if (!targetRow || !filteredRows.length) return;

    const rowIndex = filteredRows.findIndex((row) => {
      return (
        row.rawDate === targetRow.rawDate &&
        row.bid === targetRow.bid &&
        row.ask === targetRow.ask
      );
    });

    if (rowIndex === -1) return;

    const key = getRowKey(filteredRows[rowIndex], rowIndex);
    setHighlightedKey(key);
    setHighlightType(type);

    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  }

  const previewRows = useMemo(() => filteredRows.slice(0, 1000), [filteredRows]);

  function getHighlightClass(row, index) {
    const key = getRowKey(row, index);
    if (key !== highlightedKey) return "";

    if (highlightType === "minBid") return "highlightRowBlue";
    if (highlightType === "maxAsk") return "highlightRowPink";
    if (highlightType === "minAsk") return "highlightRowGreen";
    if (highlightType === "maxBid") return "highlightRowYellow";
    return "";
  }

  function getTag(type) {
    if (type === "minBid") return <span className="pillTag pillBlue">Min Bid</span>;
    if (type === "maxAsk") return <span className="pillTag pillPink">Max Ask</span>;
    if (type === "minAsk") return <span className="pillTag pillGreen">Min Ask</span>;
    if (type === "maxBid") return <span className="pillTag pillYellow">Max Bid</span>;
    return null;
  }

  function getRowTag(row) {
    const matchedTypes = [];

    if (
      results.minBid &&
      row.rawDate === results.minBid.rawDate &&
      row.bid === results.minBid.bid &&
      row.ask === results.minBid.ask
    ) {
      matchedTypes.push(getTag("minBid"));
    }

    if (
      results.maxAsk &&
      row.rawDate === results.maxAsk.rawDate &&
      row.bid === results.maxAsk.bid &&
      row.ask === results.maxAsk.ask
    ) {
      matchedTypes.push(getTag("maxAsk"));
    }

    if (
      results.minAsk &&
      row.rawDate === results.minAsk.rawDate &&
      row.bid === results.minAsk.bid &&
      row.ask === results.minAsk.ask
    ) {
      matchedTypes.push(getTag("minAsk"));
    }

    if (
      results.maxBid &&
      row.rawDate === results.maxBid.rawDate &&
      row.bid === results.maxBid.bid &&
      row.ask === results.maxBid.ask
    ) {
      matchedTypes.push(getTag("maxBid"));
    }

    if (!matchedTypes.length) return null;

    return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{matchedTypes}</div>;
  }

  return (
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

            <div className={`uploadMeta ${message.includes("complete") || message.includes("loaded") || message.includes("Ready") ? "success" : ""}`}>
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
          Use 24-hour format only, exactly like the time format in your CSV.
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

          <div className="field">
            <label>Start Time (24h)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00:00:00"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>End Time (24h)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="23:59:59"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="primaryBtn" onClick={handleAnalyze}>
            Analyze Ticks
          </button>
          <button className="secondaryBtn" onClick={resetAll}>
            Reset
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Analysis Results</h2>
        <div className="sectionHint">
          Click any “Show on Table” button to jump to and highlight the matching tick row.
        </div>

        <div className="resultGrid">
          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>
              <span className="pillTag pillBlue">Lowest Bid</span>
            </div>
            <h3>Minimum Bid Price</h3>
            <div className="resultValue">{formatPrice(results.minBid?.bid)}</div>
            <div className="resultTime">{formatDateTime(results.minBid?.parsedDate)}</div>
            <button
              className="resultActionBtn"
              onClick={() => showOnTable(results.minBid, "minBid")}
              disabled={!results.minBid}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>
              <span className="pillTag pillPink">Highest Ask</span>
            </div>
            <h3>Maximum Ask Price</h3>
            <div className="resultValue">{formatPrice(results.maxAsk?.ask)}</div>
            <div className="resultTime">{formatDateTime(results.maxAsk?.parsedDate)}</div>
            <button
              className="resultActionBtn"
              onClick={() => showOnTable(results.maxAsk, "maxAsk")}
              disabled={!results.maxAsk}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>
              <span className="pillTag pillGreen">Lowest Ask</span>
            </div>
            <h3>Minimum Ask Price</h3>
            <div className="resultValue">{formatPrice(results.minAsk?.ask)}</div>
            <div className="resultTime">{formatDateTime(results.minAsk?.parsedDate)}</div>
            <button
              className="resultActionBtn"
              onClick={() => showOnTable(results.minAsk, "minAsk")}
              disabled={!results.minAsk}
            >
              Show on Table
            </button>
          </div>

          <div className="resultCard">
            <div style={{ marginBottom: 12 }}>
              <span className="pillTag pillYellow">Highest Bid</span>
            </div>
            <h3>Maximum Bid Price</h3>
            <div className="resultValue">{formatPrice(results.maxBid?.bid)}</div>
            <div className="resultTime">{formatDateTime(results.maxBid?.parsedDate)}</div>
            <button
              className="resultActionBtn"
              onClick={() => showOnTable(results.maxBid, "maxBid")}
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
            Showing {previewRows.length.toLocaleString()} of {filteredRows.length.toLocaleString()} rows
          </div>
          <div className="tableStatus">Showing: Selected Range</div>
        </div>

        {!previewRows.length ? (
          <div className="emptyState">No filtered rows to show yet.</div>
        ) : (
          <>
            <div className="tableWrap">
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
                  {previewRows.map((row, index) => (
                    <tr
                      key={getRowKey(row, index)}
                      className={getHighlightClass(row, index)}
                    >
                      <td>{getRowTag(row)}</td>
                      <td>{formatDateTime(row.parsedDate)}</td>
                      <td>{row.bid === null || Number.isNaN(row.bid) ? "" : formatPrice(row.bid)}</td>
                      <td>{row.ask === null || Number.isNaN(row.ask) ? "" : formatPrice(row.ask)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="proTip">
              <strong>PRO TIP</strong>
              Click any “Show on Table” button above to instantly highlight that specific tick in the table.
            </div>
          </>
        )}
      </section>
    </main>
  );
}
