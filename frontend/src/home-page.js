import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFetch } from "./tile-provider";

const limit = 5;

export const HomePage = () => {

    const [offset, setOffset] = useState(0);
    const { loading, list } = useFetch("", offset, limit);  
    const loader = useRef(null);

    console.log("list: ", list);

    const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (loading) return;
    if (target.isIntersecting) {
        setOffset((prev) => prev + limit);
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
    <main className={`container sm-margin-top`}>
      {/* <Imageview mode={mode} id={imgEntId} /> */}
      <div className={`wrapper md-margin-top`} style={{ height: '630px' }}>
        <div className={`container`}>
          <div id="scroller" className="mb-3">
            {list.map((row) => (
              <div style={{height: '100px'}}>Row goes here {row.date.toISOString()} Count: {row.entries.length} Collapsed: {row.collapse ? "Yes" : "No"}</div>
            ))}
            {loading && <p>Loading...</p>}
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </main>

  );
}
