import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from 'react-router-dom';
import history from "../../utils/History";
import useFetch from "../../hooks/useFetch";
import Monthblock from "./views/Monthblock";
import Blankmonth from "./views/Blankmonth";
import Imageview from "./modals/Imageview";
import innerlyUrls from "../../utils/InnerlyUrls";

function App(props) {

  console.log("app rendering..");

  const [query, setQuery] = useState(props.query);
  const [querycount, setQuerycount] = useState(0);
  const [viewtype, setViewtype] = useState(props.viewtype);
  const [filtertype, setFiltertype] = useState(props.filtertype);
  const [collapseMsg, setCollapseMsg] = useState("");
  const [nonScrollEventCount, setNonScrollEventCount] = useState(props.nonScrollEventCount);


  const { loading, error, list, allLoaded } = useFetch(query, querycount);
  const loader = useRef(null);

  let { mode, imgEntId } = useParams();

  if (mode && mode !== 'view') {
    history.push(innerlyUrls.home);
  }

  useEffect(() => {
    setQuery(props.query);
    // reset this on query clear only
    // reason: isCurrent flag depends on it, which determines todays row behavior
    if (props.query === "") {
      setQuerycount(0);
    }
  }, [props.query]);

  useEffect(() => {
    setFiltertype(props.filtertype);
  }, [props.filtertype]);

  useEffect(() => {
    setViewtype(props.viewtype);
  }, [props.viewtype]);

  useEffect(() => {
    setNonScrollEventCount(props.nonScrollEventCount);
  }, [props.nonScrollEventCount]);

  const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (loading) return;
    // if (!list) return;
    if (target.isIntersecting && !allLoaded) {
      console.log("setting query count, all loaded: ", allLoaded);
      setQuerycount((prev) => prev + 1);
    }

  }, [allLoaded, loading]);

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "20px",
      threshold: 0.5
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (loader.current) observer.observe(loader.current);
  }, [handleObserver]);

  function setMsg(msg) {
    console.log("SETTER FIRING");
    console.log(msg);
    setCollapseMsg(msg);
  }

  /* 
  Use the nonScrollEventCount to validate if we want to accept prop changes because of a user action other than a query happening because of scrolling
  Example: keep expanded months open when scrolling throught the month view, but conform to props when the filters are changed
  */

  return (
    <main className={`container sm-margin-top`}>
      <Imageview mode={mode} id={imgEntId} />
      <div className={`wrapper md-margin-top`} style={{ height: '630px' }}>
        <div className={`container`}>
          <div id="scroller" className="mb-3">
            {list.map((monthdata, i) => (
              monthdata.days.length === 0 ?
                <Blankmonth {...monthdata} viewtype={viewtype} filter={filtertype} msg={collapseMsg} allLoaded={allLoaded} />
                : <Monthblock {...monthdata} viewtype={viewtype} filter={filtertype} msgSetter={setMsg} nonScrollEventCount={nonScrollEventCount} />
            ))}
            {loading && <p>Loading...</p>}
            {error && <p>Error!</p>}
            {!allLoaded &&
              <div className="c_well" style={{ textAlign: 'center' }}>
                <div className={`row sm-margin-bottom`}>
                  <div className="col-sm-3"></div>
                  <div className="col-sm-8">
                    <img src="innerly-loader.gif" alt="" height={40} width={40} />
                  </div>
                </div>
              </div>
            }
            <div ref={loader}></div>
          </div>
        </div>
      </div>
    </main>

  );
}

export default App;
