"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";

function normalizeDateString(value) {
  if (!value) return "";
  return value.replace(/\./g, "-").trim().slice(0, 10);
}

function parseTickDate(dateString) {
  if (!dateString) return null;

  const trimmed = dateString.trim();
  const match = trimmed.match(
    /^(\d{4})[.\-](\d{2})[.\-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));

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

  function resetAll() {
    setFileName("");
    setAllRows([]);
    setFilteredRows([]);
    setStartDate("");
    setEndDate("");
    setStartTime("00:00:00");
    setEndTime("23:59:59");
    setMessage("");
    setResults({
      minBid: null,
      maxAsk: null,
      minAsk: null,
      maxBid: null
    });
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setResults({
      minBid: null,
      maxAsk: null,
      minAsk: null,
      maxBid: null
    });
    setFilteredRows([]);
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
      complete: function (result) {
        try {
          let rows = result.data;

          if (!rows || !rows.length) {
            setMessage("This CSV looks empty.");
            return;
          }

          rows = rows.filter((row) => row.Date || row.Bid || row.Ask);

          const parsedRows = rows
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

          const autoStartDate = normalizeDateString(formatDateTime(firstDate));
          const autoEndDate = normalizeDateString(formatDateTime(lastDate));

          setAllRows(parsedRows);
          setStartDate(autoStartDate);
          setEndDate(autoEndDate);
          setStartTime("00:00:00");
          setEndTime("23:59:59");
          setMessage(`Loaded ${parsedRows.length} valid rows from ${file.name}.`);
        } catch (error) {
          setMessage("Could not read this CSV format.");
        }
      },
      error: function () {
        setMessage("Failed to parse the CSV file.");
      }
    });
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
    setMessage(`Analysis complete. Found ${rowsInRange.length} rows in the selected range.`);
  }

  const previewRows = useMemo(() => filteredRows.slice(0, 200), [filteredRows]);

  return (
    <main className="page">
      <section className="header">
        <h1>Tick Picker</h1>
        <p>Upload a tick CSV, choose a time range, and find key Bid and Ask price points.</p>
      </section>

      <section className="card">
        <h2>Upload CSV</h2>
        <div className="uploadBox">
          <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
          <div className="uploadMeta">
            <strong>Selected file:</strong> {fileName || "No file selected"}
          </div>
          <div className="uploadMeta">
            <strong>Detected start date:</strong> {startDate || "-"}{" "}
            <strong style={{ marginLeft: 16 }}>Detected end date:</strong> {endDate || "-"}
          </div>
          <div className={`uploadMeta ${message.includes("complete") || message.includes("Loaded") ? "success" : ""}`}>
            {message || "Upload a CSV to begin."}
          </div>
          <div className="note">
            Blank Bid or Ask values are ignored automatically during calculations.
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Select Range</h2>
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
            <label>Start Time</label>
            <input
              type="time"
              step="1"
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
            <label>End Time</label>
            <input
              type="time"
              step="1"
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
        <h2>Results</h2>
        <div className="resultGrid">
          <div className="resultCard">
            <h3>Minimum Bid Price</h3>
            <div className="resultValue">{formatPrice(results.minBid?.bid)}</div>
            <div className="resultTime">{formatDateTime(results.minBid?.parsedDate)}</div>
          </div>

          <div className="resultCard">
            <h3>Maximum Ask Price</h3>
            <div className="resultValue">{formatPrice(results.maxAsk?.ask)}</div>
            <div className="resultTime">{formatDateTime(results.maxAsk?.parsedDate)}</div>
          </div>

          <div className="resultCard">
            <h3>Minimum Ask Price</h3>
            <div className="resultValue">{formatPrice(results.minAsk?.ask)}</div>
            <div className="resultTime">{formatDateTime(results.minAsk?.parsedDate)}</div>
          </div>

          <div className="resultCard">
            <h3>Maximum Bid Price</h3>
            <div className="resultValue">{formatPrice(results.maxBid?.bid)}</div>
            <div className="resultTime">{formatDateTime(results.maxBid?.parsedDate)}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Filtered Tick Rows</h2>
        {!previewRows.length ? (
          <div className="emptyState">No filtered rows to show yet.</div>
        ) : (
          <>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Date and Time</th>
                    <th>Bid Price</th>
                    <th>Ask Price</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.rawDate}-${index}`}>
                      <td>{formatDateTime(row.parsedDate)}</td>
                      <td>{row.bid === null || Number.isNaN(row.bid) ? "" : row.bid}</td>
                      <td>{row.ask === null || Number.isNaN(row.ask) ? "" : row.ask}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note">
              Showing the first {previewRows.length} rows from the selected range.
            </div>
          </>
        )}
      </section>
    </main>
  );
}
