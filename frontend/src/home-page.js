import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFetch } from "./tile-provider";
import { Collapse } from "./collapse";
import { Row } from "./row";
import { ImageModal } from "./image-modal";

const limit = 5;

export const HomePage = () => {

    const [offset, setOffset] = useState(0);
    const [imagePath, setImagePath] = useState(null);
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
      {
        imagePath ?
        <ImageModal path={imagePath} clear={() => setImagePath(null)} /> :
        null
      }
      <div className={`wrapper md-margin-top`} style={{ height: '630px' }}>
        <div className={`container`}>
          <div id="scroller" className="mb-3">
            <span className="c_title">Test</span>
            {list.map((row) => row.collapse ? 
                <Collapse row={row} /> :
                <Row row={row} setImagePath={setImagePath} />
            )}
            {loading && <p>Loading...</p>}
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </main>
  );
}
