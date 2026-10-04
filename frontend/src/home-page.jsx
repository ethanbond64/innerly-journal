import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFetch } from "./use-fetch.js";
import { useDayTags } from "./use-day-tags.js";
import { fetchMemories } from "./requests.js";
import { dateToString, equalsDate, getTodaysDate } from "./utils.jsx";
import { Collapse } from "./collapse.jsx";
import { Row } from "./row.jsx";
import { ImageModal } from "./image-modal.jsx";
import { BasePage } from "./base-page.jsx";

const limit = 30;

// The endpoint hands back a day of slack on either end, because the stored
// datetimes are UTC, so a candidate only counts as a memory when its local date
// lands on the same month and day in another year. That is the same local match
// the day page makes when it picks out the entries for the year being opened, so
// a badged year always has something on it.
const memoryYears = (today, datetimes) => {

  const years = datetimes
    .map((datetime) => new Date(datetime))
    .filter((date) =>
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate() &&
      date.getFullYear() !== today.getFullYear())
    .map((date) => String(date.getFullYear()));

  return [...new Set(years)].sort().reverse();
};

export const HomePage = () => {
    
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [imagePath, setImagePath] = useState(null);
  const [memories, setMemories] = useState([]);

  // Fixed for the life of the page, so the badge does not move rows at midnight.
  const today = useMemo(() => getTodaysDate(), []);

  const { loading, list } = useFetch(search, offset, limit);
  const dayTags = useDayTags();
  const loader = useRef(null);

  useEffect(() => {
    setOffset(0);
  }, [search]);

  // The other years today has been written on, for the badge on today's row.
  useEffect(() => {
    fetchMemories(dateToString(today)).then((datetimes) =>
      datetimes === undefined || setMemories(memoryYears(today, datetimes)));
  }, [today]);

  const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (loading) return;
    if (target.isIntersecting) {
      setOffset(o => o + limit);
    }
  }, [loading]);

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "20px",
      threshold: 0.5
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (loader.current) observer.observe(loader.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <BasePage setSearch={setSearch}>
      {
        imagePath ?
        <ImageModal path={imagePath} clear={() => setImagePath(null)} /> :
        null
      }
      <div className={`wrapper lg-margin-top`} style={{ height: '630px' }}>
        <div className={`container`}>
          <div id="scroller" className="mb-3">
            {list.map((row,i) => row.collapse ? 
                <Collapse key={`top-row-${i}`} row={row} setImagePath={setImagePath} dayTags={dayTags} /> :
                <Row key={`top-row-${i}`} row={row} setImagePath={setImagePath} dayTags={dayTags}
                    memories={equalsDate(row.date, today) ? memories : []} />
            )}
            {loading && <p>Loading...</p>}
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </BasePage>
  );
}
