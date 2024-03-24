import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import App from './pages/home/App';
import history from './utils/History';
import Navbar from './Navbar';
import reportWebVitals from './utils/reportWebVitals';
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import innerlyUrls from './utils/InnerlyUrls';

function Routing () {

  const [query,setQuery] = useState("");
  const [viewtype, setViewtype] = useState("dayview");
  const [filtertype, setFiltertype] = useState("all");
  const [nonScrollEventCount, setNonScrollEventCount] = useState(0);

  function incrementNonScrollEventCount() {
    setNonScrollEventCount((prev) => prev + 1);
  }

  return (
    <Router history={history}>
      <Navbar setquery={setQuery} setviewtype={setViewtype} setfiltertype={setFiltertype} viewtype={viewtype} filtertype={filtertype} incrementNonScrollEventCount={incrementNonScrollEventCount}/>
      <Switch>
        <Route path={`${innerlyUrls.home}/:mode?/:imgEntId?`} render={() => (<App query={query} filtertype={filtertype} viewtype={viewtype} nonScrollEventCount={nonScrollEventCount} />)}/>
        {/* <Route path="/:id" component={ParamChild} /> */}
      </Switch>
    </Router>
  )
}

ReactDOM.render(
  <React.StrictMode>
    <Routing/>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
