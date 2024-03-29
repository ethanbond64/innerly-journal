import React from "react";
import Moment from 'react-moment';
import { Row } from "./row";
import { equalsDate } from "./utils";

export const Collapse = ({ row }) => {

    console.log("rendering collapse");

    const [open, setOpen] = React.useState(false);

    const onClick = () => {
        console.log("clicked");
        setOpen(true);
    }

    if (open) {
        if (row.endDate) {
            let rows = [];
            let date = row.date;
            while (!equalsDate(date, row.endDate)) {
                rows.push({
                    date: new Date(date),
                    endDate: null,
                    collapse: false,
                    entries: []
                });
                date.setDate(date.getDate() - 1);
                console.log(date);
            }
            rows.push({
                date: row.endDate,
                endDate: null,
                Collapse: false,
                entries: []
            });
            console.log(rows);
            console.log(row)
            return (<>
                {rows.map((r) => <Row row={r} />)}
            </>);
        } else {
            console.log("returning single row");
            return (<Row row={row} />);
        }
    }

    return (
        <div className="c_well" style={{ textAlign: 'center' }}>
            <div className={`row sm-margin-bottom`}>
                <div className="col-sm-3"></div>
                <div className="col-sm-8">
                    <button className="c_button" onClick={onClick}>
                        <span id="day1">
                            <Moment date={row.date} format="MMM D" />
                            {
                            row.endDate ?
                            <>&nbsp;...&nbsp;<Moment date={row.endDate} format="MMM D" /></>:
                            null
                        }
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};