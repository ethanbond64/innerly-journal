import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useFetch } from "./use-fetch.js";
import { fetchMemories } from "./requests.js";
import { dateToString, equalsDate, getTodaysDate } from "./utils.jsx";
import { Collapse } from "./collapse.jsx";
import { Row } from "./row.jsx";
import { ImageModal } from "./image-modal.jsx";
import { BasePage } from "./base-page.jsx";

const limit = 30;

export const HomePage = () => {
    
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [imagePath, setImagePath] = useState(null);
  const [memories, setMemories] = useState(0);

  // Fixed for the life of the page, so the badge does not move rows at midnight.
  const today = useMemo(() => getTodaysDate(), []);

  const { loading, list } = useFetch(search, offset, limit);  
  const loader = useRef(null);

  useEffect(() => {
    setOffset(0);
  }, [search]);

  // How many years today has been written on, for the badge on today's row.
  useEffect(() => {
    fetchMemories(dateToString(today)).then((years) => years === undefined || setMemories(years));
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
                <Collapse key={`top-row-${i}`} row={row} setImagePath={setImagePath} /> :
                <Row key={`top-row-${i}`} row={row} setImagePath={setImagePath}
                    memories={equalsDate(row.date, today) ? memories : 0} />
            )}
            {loading && <p>Loading...</p>}
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </BasePage>
  );
}
