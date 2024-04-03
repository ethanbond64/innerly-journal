import React, { useEffect } from "react";
import Moment from 'react-moment';
import { Row } from "./row.js";
import { equalsDate } from "./utils.js";

export const Collapse = ({ row, setImagePath }) => {

    const [open, setOpen] = React.useState(false);
    const [rows, setRows] = React.useState([]);

    const onClick = () => {
        console.log("clicked");
        setOpen(true);
    }

    useEffect(() => {
        if (open) {
            if (row.endDate) {
                let date = row.date;
                let final = false
                let localRows = [];
                while (!final) {
                    final = equalsDate(date, row.endDate);
                    localRows.push({
                        date: date,
                        endDate: null,
                        collapse: false,
                        entries: []
                    });
                    date = new Date(date);
                    date.setDate(date.getDate() - 1);
                }
                setRows(localRows);
            } else {
                setRows([row]);
            }
        }
    }, [open, row]);

    return open ?
        rows.map((r, i) => <Row key={`collapse-row-${i}`} row={r} setImagePath={setImagePath} />) :
        (<div className="c_well" style={{ textAlign: 'center' }}>
            <div className={`row sm-margin-bottom`}>
                <div className="col-sm-3"></div>
                <div className="col-sm-8">
                    <button className="c_button" onClick={onClick}>
                        <span id="day1">
                            <Moment date={row.date} format="MMM D" />
                            { row.endDate !== null ?
                                <>&nbsp;...&nbsp;<Moment date={row.endDate} format="MMM D" /></>:
                                null
                            }
                        </span>
                    </button>
                </div>
            </div>
        </div>);
};