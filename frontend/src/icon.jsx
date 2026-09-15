import React from "react";

// Inline replacements for the six Font Awesome 4.5 glyphs this app actually used, so
// the app no longer ships an 860 KB webfont to draw six shapes. The path data is
// lifted verbatim from fontawesome-webfont.svg, so the glyphs are identical.
// Font Awesome by Dave Gandy - http://fontawesome.io - icons licensed CC BY 4.0.
//
// Each entry is [horiz-adv-x, path]. Glyph coordinates are y-up in a 1792-unit em with
// a 1536 ascent, hence the flip on the <path> below.
const glyphs = {
    "lock": [1152, "M320 768h512v192q0 106 -75 181t-181 75t-181 -75t-75 -181v-192zM1152 672v-576q0 -40 -28 -68t-68 -28h-960q-40 0 -68 28t-28 68v576q0 40 28 68t68 28h32v192q0 184 132 316t316 132t316 -132t132 -316v-192h32q40 0 68 -28t28 -68z"],
    "unlock": [1664, "M1664 960v-256q0 -26 -19 -45t-45 -19h-64q-26 0 -45 19t-19 45v256q0 106 -75 181t-181 75t-181 -75t-75 -181v-192h96q40 0 68 -28t28 -68v-576q0 -40 -28 -68t-68 -28h-960q-40 0 -68 28t-28 68v576q0 40 28 68t68 28h672v192q0 185 131.5 316.5t316.5 131.5 t316.5 -131.5t131.5 -316.5z"],
    "trash-o": [1408, "M512 800v-576q0 -14 -9 -23t-23 -9h-64q-14 0 -23 9t-9 23v576q0 14 9 23t23 9h64q14 0 23 -9t9 -23zM768 800v-576q0 -14 -9 -23t-23 -9h-64q-14 0 -23 9t-9 23v576q0 14 9 23t23 9h64q14 0 23 -9t9 -23zM1024 800v-576q0 -14 -9 -23t-23 -9h-64q-14 0 -23 9t-9 23v576 q0 14 9 23t23 9h64q14 0 23 -9t9 -23zM1152 76v948h-896v-948q0 -22 7 -40.5t14.5 -27t10.5 -8.5h832q3 0 10.5 8.5t14.5 27t7 40.5zM480 1152h448l-48 117q-7 9 -17 11h-317q-10 -2 -17 -11zM1408 1120v-64q0 -14 -9 -23t-23 -9h-96v-948q0 -83 -47 -143.5t-113 -60.5h-832 q-66 0 -113 58.5t-47 141.5v952h-96q-14 0 -23 9t-9 23v64q0 14 9 23t23 9h309l70 167q15 37 54 63t79 26h320q40 0 79 -26t54 -63l70 -167h309q14 0 23 -9t9 -23z"],
    "chevron-left": [1280, "M1171 1235l-531 -531l531 -531q19 -19 19 -45t-19 -45l-166 -166q-19 -19 -45 -19t-45 19l-742 742q-19 19 -19 45t19 45l742 742q19 19 45 19t45 -19l166 -166q19 -19 19 -45t-19 -45z"],
    "chevron-right": [1280, "M1107 659l-742 -742q-19 -19 -45 -19t-45 19l-166 166q-19 19 -19 45t19 45l531 531l-531 531q-19 19 -19 45t19 45l166 166q19 19 45 19t45 -19l742 -742q19 -19 19 -45t-19 -45z"],
    "search": [1664, "M1152 704q0 185 -131.5 316.5t-316.5 131.5t-316.5 -131.5t-131.5 -316.5t131.5 -316.5t316.5 -131.5t316.5 131.5t131.5 316.5zM1664 -128q0 -52 -38 -90t-90 -38q-54 0 -90 38l-343 342q-179 -124 -399 -124q-143 0 -273.5 55.5t-225 150t-150 225t-55.5 273.5 t55.5 273.5t150 225t225 150t273.5 55.5t273.5 -55.5t225 -150t150 -225t55.5 -273.5q0 -220 -124 -399l343 -343q37 -37 37 -90z"],
};

// Sized in em and filled with currentColor, so the font-size and color already set on
// these call sites keep working exactly as they did with the <i> tags.
export const Icon = ({ name, fixedWidth = false, style, ...props }) => {
    const [width, path] = glyphs[name];

    return (
        <svg viewBox={`0 0 ${width} 1792`} height="1em" aria-hidden="true"
            style={{ width: fixedWidth ? '1.286em' : undefined, verticalAlign: '-0.125em',
                     fill: 'currentColor', ...style }}
            {...props}>
            <path transform="translate(0,1536) scale(1,-1)" d={path} />
        </svg>
    );
};
