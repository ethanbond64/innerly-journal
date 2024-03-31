import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFetch } from "./use-fetch";
import { Collapse } from "./collapse";
import { Row } from "./row";
import { ImageModal } from "./image-modal";
import { Navbar } from "./navbar";
import { getUserData } from "./utils";
import { BasePage } from "./base-page";

const limit = 30;

export const HomePage = () => {
    
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [imagePath, setImagePath] = useState(null);

  const { loading, list } = useFetch(search, offset, limit);  
  const loader = useRef(null);

  console.log("list: ", list);

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

  let user = getUserData();

  return (
    <BasePage setSearch={setSearch}>
      {
        imagePath ?
        <ImageModal path={imagePath} clear={() => setImagePath(null)} /> :
        null
      }
      <div className={`wrapper md-margin-top`} style={{ height: '630px' }}>
        <div className={`container`}>
          <div id="scroller" className="mb-3">
            {list.map((row,i) => row.collapse ? 
                <Collapse key={`top-row-${i}`} row={row} /> :
                <Row key={`top-row-${i}`} row={row} setImagePath={setImagePath} />
            )}
            {loading && <p>Loading...</p>}
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </BasePage>
  );
}
