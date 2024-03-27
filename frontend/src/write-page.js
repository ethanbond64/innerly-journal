import React from "react";
// import entryStyle from "./entry.css";

export const WritePage = () => {
    return (
        <>
        <script type="text/javascript">
{/* 
        // globals
        var progOption;
        var startTimestamp;
        var secondsGoal;
        var wordGoal;
        var hoverOffCount = 0;

        $(document).ready(function () {  

        // Saved text
        if (localStorage.getItem('entry-input') != '') {
            document.getElementById("writeto").value = localStorage.getItem('entry-input');
        }

        document.getElementById("writeto").focus();

        // initial disappear
        setTimeout(function () {
            if (!$("#session-details").is(":hover")){
            $(".disappear").fadeTo(1200, 0, function () {
                $(".nremove").css("display","none");
            });
            }
        }, 5000)
        
        
        // Hover -> fade
        $("#session-details, #innerlyImage").hover(function () {
            // console.log('hoverin');
            $(".disappear").fadeTo(400,0.99,function () {
                $(".nremove").css("display", "inline-block");           
            });
        });

        // Routinely -> autosave, update progress bar
        setInterval(function () {
        var latestInput = document.getElementById("writeto").value;
        // console.log(latestInput);
        // console.log(localStorage.getItem('entry-input'));
        if (latestInput != localStorage.getItem('entry-input')) {
            console.log("autosave");
            localStorage.setItem('entry-input', latestInput);

        }

        // Check if hovering mainbar || logo || dropdown
        if (!$('#session-details').is(':hover') && !$('#prog-dropdown').is(':hover') && !$('#innerlyImage').is(':hover')){
            // console.log(hoverOffCount);
            if (hoverOffCount >= 7) {
            $(".disappear").fadeTo(1000, 0, function () {
                $(".nremove").css("display", "none");
                $("#prog-dropdown").hide();
                });
                hoverOffCount = 0;
            } else {
            hoverOffCount += 1;
            }
        }

        }, 500); */}


</script>
        <main className="container" style={{ height: '99vh !important' }}>
            <div className="row text-center h-100" style={{ height: '97% !important' }}>
                <div className="col-md-2 hidden-sm hidden-xs text-left htrigger">
                    <a href="/">
                        <img src="/images/innerly_wordmark_200616_03.png" className="img-responsive md-margin-right disappear" width="170" height="80" id="innerlyImage" title="Innerly" style={{ marginTop: '30px', opacity: 0 }} alt="Innerly" />
                    </a>
                </div>
                <div className="col-lg-8 col-md-10 h-100" style={{ height: '97% !important' }}>
                    <div id="session-details" className="writeto-display htrigger" style={{ textAlign: 'left', border: 'none !important', overflow: 'visible', paddingTop: '50px' }}>
                        <div>
                            <a href="/home" className="btn btn-warning btn-block hidden-xl hidden-lg hidden-md hidden-sm" style={{ width: 'auto', float: 'left' }}>
                                <b><i className="fa fa-chevron-left" aria-hidden="true"></i></b>
                                <span>Back</span>
                            </a>
                            <span className="disappear hidden-xs" style={{ paddingLeft: '12px', opacity: 0 }}>Write about any thoughts, experiences, or ideas</span>
                            <button id="submitbtn" type="submit" className="btn btn-info btn-block htrigger" style={{ width: 'auto', float: 'right', color: 'white', marginRight: '12px' }}>
                                <span className="nremove hidden-xs" style={{ display: 'none' }}>Save</span>
                                <span className="hidden-xl hidden-lg hidden-md hidden-sm">Save</span>
                                <b><i className="fa fa-chevron-right" aria-hidden="true"></i></b>
                            </button>
                        </div>
                    </div>
                    <div className="form-group" style={{ height: '100% !important' }}>
                        <label htmlFor="writeto">
                            Entry
                        </label>
                        <textarea className="form-control" id="writeto" name="entry"></textarea>
                    </div>
                    <div className="writeto-display"></div>
                </div>
                <div className="col-lg-2 hidden-md hidden-sm hidden-xs"></div>
            </div>
            {/* <style src={entryStyle}></style> */}
        </main>
        </>
    );
};
