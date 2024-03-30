import React from "react";

export const PageLoader = () => {
  const loadingImg = "/images/innerly-loader.gif";

  return (
    <div className="w-10 h-10">
      <img src={loadingImg} alt="Loading..." />
    </div>
  );
};
