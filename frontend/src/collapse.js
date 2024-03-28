import React from "react";
import Moment from 'react-moment';

export const Collapse = ({ row }) => {
    return (
        <div className="c_well" style={{ textAlign: 'center' }}>
            <div className={`row sm-margin-bottom`}>
                <div className="col-sm-3"></div>
                <div className="col-sm-8">
                    <button className="c_button">
                        <span id="day1">
                            <Moment date={row.date} format="MMM D" />
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};