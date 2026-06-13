import React, { useEffect } from "react";
import moment from 'moment';
import { Row } from "./row.jsx";
import { equalsDate } from "./utils.jsx";

export const Collapse = ({ row, setImagePath }) => {

    const [open, setOpen] = React.useState(false);
    const [rows, setRows] = React.useState([]);

    const onClick = () => {
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
                <div className="col-sm-3">

                </div>
                <div className="col-sm-8">
                    <button className="c_button" onClick={onClick}>
                        <span id="day1">
                            {moment(row.date).format("MMM D")}
                            { row.endDate !== null ?
                                <>&nbsp;...&nbsp;{moment(row.endDate).format("MMM D")}</>:
                                null
                            }
                        </span>
                    </button>
                </div>
            </div>
        </div>);
};